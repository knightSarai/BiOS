import "fake-indexeddb/auto"
import { afterEach, describe, expect, it } from "vitest"
import { InvalidTypeParentError } from "@/activities/type-tree"
import { ActivitiesRepository, type NewActivity } from "./activities"
import { ActivityTypesRepository, TypeHasSubtypesError } from "./activity-types"
import { AreasRepository } from "./areas"
import { createLocalDb, type LocalDb } from "./db"

const openDbs: LocalDb[] = []

afterEach(async () => {
  await Promise.all(openDbs.splice(0).map((db) => db.delete()))
})

// Workout (Effort, Avg HR) › Boxing (Rounds) and Strength (Sets), plus Practice (Focus).
const setup = async (workspaceId = "ws-1") => {
  const db = createLocalDb(`type-fields-test-${crypto.randomUUID()}`)
  openDbs.push(db)
  const types = new ActivityTypesRepository(db, { workspaceId })
  const activities = new ActivitiesRepository(db, { workspaceId })
  const home = await new AreasRepository(db, { workspaceId }).ensureDefault(
    "Training"
  )
  const workout = await types.create({ name: "Workout", color: "chart-1" })
  const effort = await types.addField(workout.id, {
    name: "Effort",
    kind: "rating",
  })
  const avgHr = await types.addField(workout.id, {
    name: "Avg HR",
    kind: "number",
  })
  const boxing = await types.create({
    name: "Boxing",
    color: "chart-1",
    parentId: workout.id,
  })
  const rounds = await types.addField(boxing.id, {
    name: "Rounds",
    kind: "number",
  })
  const strength = await types.create({
    name: "Strength",
    color: "chart-2",
    parentId: workout.id,
  })
  const sets = await types.addField(strength.id, {
    name: "Sets",
    kind: "number",
  })
  const practice = await types.create({ name: "Practice", color: "chart-4" })
  const focus = await types.addField(practice.id, {
    name: "Focus",
    kind: "choice",
    options: ["Scales", "Repertoire"],
  })
  const create = async (title: string, extra: Partial<NewActivity> = {}) => {
    const id = crypto.randomUUID()
    await activities.insertMany([
      { id, areaId: home.id, title, status: "todo", origin: null, ...extra },
    ])
    const row = await activities.byId(id)
    if (!row) throw new Error("Activity row missing")
    return row
  }
  return {
    db,
    types,
    activities,
    create,
    workout,
    boxing,
    strength,
    practice,
    effort,
    avgHr,
    rounds,
    sets,
    focus,
  }
}

const names = (fields: { name: string }[]) => fields.map((field) => field.name)

describe("subtypes inherit their parent's fields", () => {
  it("lists the parent's fields first, then the subtype's own", async () => {
    const { types, boxing, workout } = await setup()
    const fields = await types.fields(boxing.id)
    expect(names(fields)).toEqual(["Effort", "Avg HR", "Rounds"])
    expect(fields.map((field) => field.sourceTypeId)).toEqual([
      workout.id,
      workout.id,
      boxing.id,
    ])
  })

  it("takes values for inherited fields when an activity is created or edited", async () => {
    const { activities, create, boxing, effort, avgHr, rounds } = await setup()
    const row = await create("Pads", {
      typeId: boxing.id,
      fields: { [effort.id]: 4, [rounds.id]: 8 },
    })
    await activities.setFieldValue(row.id, avgHr.id, 152)
    expect((await activities.byId(row.id))?.fields).toEqual({
      [effort.id]: 4,
      [avgHr.id]: 152,
      [rounds.id]: 8,
    })
  })

  it("gains and loses inherited fields when the type moves, without touching values", async () => {
    const { types, activities, create, boxing, practice, effort, focus } =
      await setup()
    const row = await create("Pads", {
      typeId: boxing.id,
      fields: { [effort.id]: 4 },
    })
    await types.setParent(boxing.id, practice.id)
    expect(names(await types.fields(boxing.id))).toEqual(["Focus", "Rounds"])
    expect((await activities.byId(row.id))?.fields).toEqual({ [effort.id]: 4 })
    await activities.setFieldValue(row.id, focus.id, focus.options[0]?.id)
    await types.setParent(boxing.id, null)
    expect(names(await types.fields(boxing.id))).toEqual(["Rounds"])
  })

  it("rejects loops and trees deeper than three levels", async () => {
    const { types, workout, boxing, strength } = await setup()
    await expect(types.setParent(workout.id, boxing.id)).rejects.toBeInstanceOf(
      InvalidTypeParentError
    )
    const calisthenics = await types.create({
      name: "Calisthenics",
      color: "chart-2",
      parentId: strength.id,
    })
    await expect(
      types.create({
        name: "Too deep",
        color: "chart-3",
        parentId: calisthenics.id,
      })
    ).rejects.toBeInstanceOf(InvalidTypeParentError)
    await expect(
      types.setParent(strength.id, boxing.id)
    ).rejects.toBeInstanceOf(InvalidTypeParentError)
    expect((await types.byId(strength.id))?.parentId).toBe(workout.id)
  })

  it("won't delete a type that still has subtypes", async () => {
    const { types, workout, boxing, strength } = await setup()
    await expect(types.delete(workout.id)).rejects.toBeInstanceOf(
      TypeHasSubtypesError
    )
    await types.delete(boxing.id)
    await types.delete(strength.id)
    await types.delete(workout.id)
    expect(await types.byId(workout.id)).toBeNull()
  })
})

describe("fields shared across types", () => {
  it("links one field to several types, and only once per type", async () => {
    const { types, boxing, practice, effort, focus } = await setup()
    await types.linkField(practice.id, effort.id)
    await types.linkField(boxing.id, effort.id)
    await types.linkField(practice.id, effort.id)
    expect(names(await types.fields(practice.id))).toEqual(["Focus", "Effort"])
    expect(names(await types.fields(boxing.id))).toEqual([
      "Effort",
      "Avg HR",
      "Rounds",
    ])
    expect((await types.fieldUsage()).get(effort.id)?.typeIds).toHaveLength(2)
    expect((await types.fieldUsage()).get(focus.id)?.typeIds).toEqual([
      practice.id,
    ])
  })

  it("won't make a second field with the same name", async () => {
    const { types, practice } = await setup()
    await expect(
      types.createField({ name: " effort ", kind: "number" })
    ).rejects.toThrow("There is already a field called Effort.")
    await expect(
      types.addField(practice.id, { name: "AVG HR", kind: "text" })
    ).rejects.toThrow()
  })

  it("keeps every value when an activity changes type, and the held ones stay editable", async () => {
    const { activities, create, boxing, strength, effort, rounds, sets } =
      await setup()
    const row = await create("Session", {
      typeId: boxing.id,
      fields: { [effort.id]: 4, [rounds.id]: 8 },
    })
    await activities.changeType(row.id, strength.id)
    await activities.setFieldValue(row.id, sets.id, 5)
    await activities.setFieldValue(row.id, rounds.id, 10)
    expect((await activities.byId(row.id))?.fields).toEqual({
      [effort.id]: 4,
      [rounds.id]: 10,
      [sets.id]: 5,
    })
    expect((await activities.summary(row.id))?.details).toBe(
      "Effort 4 of 5 · Sets 5 · Rounds 10"
    )
    await activities.setFieldValue(row.id, rounds.id, null)
    await expect(
      activities.setFieldValue(row.id, rounds.id, 3)
    ).rejects.toThrow()
  })

  it("removing an option clears it on activities of every type that has the field", async () => {
    const { types, create, activities, practice, boxing, focus } = await setup()
    await types.linkField(boxing.id, focus.id)
    const [scales, repertoire] = focus.options
    const guitar = await create("Guitar", {
      typeId: practice.id,
      fields: { [focus.id]: scales?.id },
    })
    const pads = await create("Pads", {
      typeId: boxing.id,
      fields: { [focus.id]: scales?.id },
    })
    const piano = await create("Piano", {
      typeId: practice.id,
      fields: { [focus.id]: repertoire?.id },
    })
    expect(await types.optionValueCount(focus.id, scales?.id ?? "")).toBe(2)
    await types.removeOption(focus.id, scales?.id ?? "")
    expect((await activities.byId(guitar.id))?.fields).toEqual({})
    expect((await activities.byId(pads.id))?.fields).toEqual({})
    expect((await activities.byId(piano.id))?.fields).toEqual({
      [focus.id]: repertoire?.id,
    })
  })

  it("deleting a field takes it off every type and every activity", async () => {
    const { types, create, activities, practice, boxing, effort } =
      await setup()
    await types.linkField(practice.id, effort.id)
    const row = await create("Pads", {
      typeId: boxing.id,
      fields: { [effort.id]: 3 },
    })
    expect((await types.fieldUsage()).get(effort.id)?.valueCount).toBe(1)
    await types.deleteField(effort.id)
    expect(names(await types.fields(practice.id))).toEqual(["Focus"])
    expect(names(await types.fields(boxing.id))).toEqual(["Avg HR", "Rounds"])
    expect((await activities.byId(row.id))?.fields).toEqual({})
  })

  it("won't rename a field to a name another field has", async () => {
    const { types, effort, avgHr } = await setup()
    await expect(types.renameField(avgHr.id, "EFFORT")).rejects.toThrow(
      "There is already a field called Effort."
    )
    expect((await types.fieldById(avgHr.id))?.name).toBe("Avg HR")
    await types.renameField(effort.id, "effort")
    expect((await types.fieldById(effort.id))?.name).toBe("effort")
  })

  it("restores a deleted activity with every value, and with no type if its type is gone", async () => {
    const { types, activities, create, boxing, strength, effort, rounds } =
      await setup()
    const row = await create("Pads", {
      typeId: boxing.id,
      fields: { [effort.id]: 4, [rounds.id]: 8 },
    })
    await activities.changeType(row.id, strength.id)
    const snapshot = await activities.delete(row.id)
    if (!snapshot) throw new Error("Nothing was deleted")
    await types.delete(strength.id)
    await activities.restore(snapshot)
    const restored = await activities.byId(row.id)
    expect(restored?.typeId).toBeNull()
    expect(restored?.fields).toEqual({ [effort.id]: 4, [rounds.id]: 8 })
    await activities.setFieldValue(row.id, rounds.id, 9)
    expect((await activities.byId(row.id))?.fields[rounds.id]).toBe(9)
  })

  it("keeps each workspace's fields to itself", async () => {
    const { db, effort, practice } = await setup()
    const other = new ActivityTypesRepository(db, { workspaceId: "ws-2" })
    expect(await other.library()).toEqual([])
    expect(await other.fieldUsage()).toEqual(new Map())
    const theirs = await other.create({ name: "Theirs", color: "chart-3" })
    await expect(other.linkField(theirs.id, effort.id)).rejects.toThrow()
    await expect(other.linkField(practice.id, effort.id)).rejects.toThrow()
    await other.createField({ name: "Effort", kind: "number" })
  })
})
