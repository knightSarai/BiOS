import "fake-indexeddb/auto"
import { Dexie } from "dexie"
import { afterEach, describe, expect, it } from "vitest"
import yDexie from "y-dexie"
import { InvalidFieldValueError } from "@/activities/fields"
import { ActivitiesRepository, type NewActivity } from "./activities"
import { ActivityTypesRepository } from "./activity-types"
import { AreasRepository } from "./areas"
import { createLocalDb, type LocalDb } from "./db"

const openDbs: LocalDb[] = []

afterEach(async () => {
  await Promise.all(openDbs.splice(0).map((db) => db.delete()))
})

const setup = async (workspaceId = "ws-1") => {
  const db = createLocalDb(`activity-types-test-${crypto.randomUUID()}`)
  openDbs.push(db)
  const types = new ActivityTypesRepository(db, { workspaceId })
  const activities = new ActivitiesRepository(db, { workspaceId })
  const home = await new AreasRepository(db, { workspaceId }).ensureDefault(
    "Knight Life"
  )
  return { db, types, activities, home }
}

const setupBook = async () => {
  const context = await setup()
  const book = await context.types.create({ name: " Book ", color: "chart-1" })
  const author = await context.types.addField(book.id, {
    name: "Author",
    kind: "text",
  })
  const format = await context.types.addField(book.id, {
    name: "Format",
    kind: "choice",
    options: ["Paper", "Ebook", " "],
  })
  return { ...context, book, author, format }
}

const newActivity = (
  areaId: string,
  title: string,
  extra: Partial<NewActivity> = {}
): NewActivity => ({
  id: crypto.randomUUID(),
  areaId,
  title,
  status: "todo",
  origin: null,
  ...extra,
})

const createOne = async (
  activities: ActivitiesRepository,
  activity: NewActivity
) => {
  await activities.insertMany([activity])
  const row = await activities.byId(activity.id)
  if (!row) throw new Error("Activity row missing")
  return row
}

describe("ActivityTypesRepository", () => {
  it("creates a type with no status names and lists its fields in order", async () => {
    const { types, book, author, format } = await setupBook()
    expect(await types.byId(book.id)).toMatchObject({
      name: "Book",
      color: "chart-1",
      icon: null,
      statusNames: {},
    })
    const fields = await types.fields(book.id)
    expect(fields.map((field) => field.id)).toEqual([author.id, format.id])
    expect(format.options.map((option) => option.label)).toEqual([
      "Paper",
      "Ebook",
    ])
  })

  it("requires names for types and fields", async () => {
    const { types, book } = await setupBook()
    await expect(
      types.create({ name: "  ", color: "chart-2" })
    ).rejects.toThrow()
    await expect(
      types.addField(book.id, { name: "", kind: "number" })
    ).rejects.toThrow()
  })

  it("keeps only the status names that are filled in", async () => {
    const { types, book } = await setupBook()
    await types.update(book.id, {
      statusNames: { backlog: " Want to read ", todo: "  ", done: "Read" },
    })
    expect((await types.byId(book.id))?.statusNames).toEqual({
      backlog: "Want to read",
      done: "Read",
    })
  })

  it("keeps every status name when several are renamed at once", async () => {
    const { types, book } = await setupBook()
    await Promise.all([
      types.renameStatus(book.id, "backlog", "Want to read"),
      types.renameStatus(book.id, "progress", "Reading"),
      types.renameStatus(book.id, "done", " Read "),
    ])
    expect((await types.byId(book.id))?.statusNames).toEqual({
      backlog: "Want to read",
      progress: "Reading",
      done: "Read",
    })
    await types.renameStatus(book.id, "progress", "")
    expect((await types.byId(book.id))?.statusNames).toEqual({
      backlog: "Want to read",
      done: "Read",
    })
  })

  it("renaming a field keeps every stored value", async () => {
    const { types, activities, home, book, author } = await setupBook()
    const row = await createOne(
      activities,
      newActivity(home.id, "DDIA", {
        typeId: book.id,
        fields: { [author.id]: "Martin Kleppmann" },
      })
    )
    await types.renameField(author.id, "Written by")
    expect((await activities.byId(row.id))?.fields).toEqual({
      [author.id]: "Martin Kleppmann",
    })
  })

  it("removing a field or an option drops the values that used it", async () => {
    const { types, activities, home, book, author, format } = await setupBook()
    const [paper, ebook] = format.options
    const row = await createOne(
      activities,
      newActivity(home.id, "DDIA", {
        typeId: book.id,
        fields: { [author.id]: "Martin Kleppmann", [format.id]: ebook?.id },
      })
    )
    await types.setFieldOptions(format.id, [{ id: paper?.id, label: "Paper" }])
    expect((await activities.byId(row.id))?.fields).toEqual({
      [author.id]: "Martin Kleppmann",
    })
    await types.removeField(author.id)
    expect((await activities.byId(row.id))?.fields).toEqual({})
    expect(await types.fields(book.id)).toHaveLength(1)
  })

  it("removing one multiple-choice option keeps the rest of each selection", async () => {
    const { types, activities, home, book } = await setupBook()
    const topics = await types.addField(book.id, {
      name: "Topics",
      kind: "multiChoice",
      options: ["Systems", "Databases"],
    })
    const [systems, databases] = topics.options
    const row = await createOne(
      activities,
      newActivity(home.id, "DDIA", {
        typeId: book.id,
        fields: { [topics.id]: [systems?.id, databases?.id] },
      })
    )
    await types.setFieldOptions(topics.id, [
      { id: systems?.id, label: "Systems" },
    ])
    expect((await activities.byId(row.id))?.fields).toEqual({
      [topics.id]: [systems?.id],
    })
  })

  it("keeps every option when several are added, renamed or removed at once", async () => {
    const { types, book, format } = await setupBook()
    const [paper, ebook] = format.options
    await Promise.all([
      types.addOption(format.id, "Audio"),
      types.addOption(format.id, "Comic"),
      types.renameOption(format.id, paper?.id ?? "", "Hardback"),
      types.removeOption(format.id, ebook?.id ?? ""),
    ])
    const [, saved] = await types.fields(book.id)
    expect(saved?.options.map((option) => option.label)).toEqual([
      "Hardback",
      "Audio",
      "Comic",
    ])
  })

  it("only choice fields take options, and an option id is kept once", async () => {
    const { types, book, author, format } = await setupBook()
    const pages = await types.addField(book.id, {
      name: "Pages",
      kind: "number",
      options: ["ignored"],
    })
    expect(pages.options).toEqual([])
    await expect(
      types.setFieldOptions(author.id, [{ label: "Nope" }])
    ).rejects.toThrow()
    const [paper] = format.options
    await types.setFieldOptions(format.id, [
      { id: paper?.id, label: "Paper" },
      { id: paper?.id, label: "Paper again" },
    ])
    const [, saved] = await types.fields(book.id)
    expect(saved?.options).toEqual([{ id: paper?.id, label: "Paper" }])
  })

  it("deleting a type leaves its activities with no type and no field values", async () => {
    const { types, activities, home, book, author } = await setupBook()
    const row = await createOne(
      activities,
      newActivity(home.id, "DDIA", {
        typeId: book.id,
        status: "progress",
        fields: { [author.id]: "Martin Kleppmann" },
      })
    )
    expect(await types.activityCount(book.id)).toBe(1)
    await types.delete(book.id)
    expect(await types.byId(book.id)).toBeNull()
    expect(await types.fields(book.id)).toEqual([])
    expect(await activities.byId(row.id)).toMatchObject({
      typeId: null,
      fields: {},
      status: "progress",
    })
  })

  it("never reads or changes another workspace's types", async () => {
    const { db, book, author } = await setupBook()
    const other = new ActivityTypesRepository(db, { workspaceId: "ws-2" })
    expect(await other.byId(book.id)).toBeNull()
    expect(await other.list()).toEqual([])
    expect(await other.fields(book.id)).toEqual([])
    await other.renameField(author.id, "Hijacked")
    await other.removeField(author.id)
    await other.delete(book.id)
    await expect(
      other.addField(book.id, { name: "Sneaky", kind: "text" })
    ).rejects.toThrow()
    const mine = new ActivityTypesRepository(db, { workspaceId: "ws-1" })
    expect((await mine.fields(book.id)).map((field) => field.name)).toEqual([
      "Author",
      "Format",
    ])
  })
})

describe("activities with a type, fields and a due date", () => {
  it("creates an activity with no type, no fields and no due date by default", async () => {
    const { activities, home } = await setup()
    const row = await createOne(activities, newActivity(home.id, "Spar"))
    expect(row).toMatchObject({ typeId: null, fields: {}, dueDate: null })
  })

  it("stores valid field values by field id and ignores unknown keys", async () => {
    const { activities, home, book, author, format } = await setupBook()
    const row = await createOne(
      activities,
      newActivity(home.id, "DDIA", {
        typeId: book.id,
        dueDate: "2026-11-30",
        fields: {
          [author.id]: "Martin Kleppmann",
          [format.id]: format.options[0]?.id,
          "not-a-field": "dropped",
        },
      })
    )
    expect(row).toMatchObject({
      typeId: book.id,
      dueDate: "2026-11-30",
      fields: {
        [author.id]: "Martin Kleppmann",
        [format.id]: format.options[0]?.id,
      },
    })
  })

  it("rejects bad field values and bad due dates without creating anything", async () => {
    const { activities, home, book, format } = await setupBook()
    await expect(
      activities.insertMany([
        newActivity(home.id, "DDIA", {
          typeId: book.id,
          fields: { [format.id]: "Paper" },
        }),
      ])
    ).rejects.toBeInstanceOf(InvalidFieldValueError)
    await expect(
      activities.insertMany([
        newActivity(home.id, "Spar", { dueDate: "30/11/2026" }),
      ])
    ).rejects.toThrow()
    expect(await activities.list()).toEqual([])
  })

  it("rejects a type from another workspace", async () => {
    const { db, book } = await setupBook()
    const other = new ActivitiesRepository(db, { workspaceId: "ws-2" })
    const otherHome = await new AreasRepository(db, {
      workspaceId: "ws-2",
    }).ensureDefault("Other")
    await expect(
      other.insertMany([
        newActivity(otherHome.id, "Sneaky", { typeId: book.id }),
      ])
    ).rejects.toThrow()
  })

  it("sets and clears one field value and the due date", async () => {
    const { activities, home, book, author } = await setupBook()
    const row = await createOne(
      activities,
      newActivity(home.id, "DDIA", { typeId: book.id })
    )
    await activities.setFieldValue(row.id, author.id, "Martin Kleppmann")
    await activities.setDueDate(row.id, "2026-12-01")
    expect(await activities.byId(row.id)).toMatchObject({
      fields: { [author.id]: "Martin Kleppmann" },
      dueDate: "2026-12-01",
    })
    await activities.setFieldValue(row.id, author.id, null)
    await activities.setDueDate(row.id, null)
    expect(await activities.byId(row.id)).toMatchObject({
      fields: {},
      dueDate: null,
    })
    await expect(activities.setDueDate(row.id, "tomorrow")).rejects.toThrow()
  })

  it("refuses a value for a field that is not on the activity's type", async () => {
    const { types, activities, home, author } = await setupBook()
    const article = await types.create({ name: "Article", color: "chart-3" })
    const row = await createOne(
      activities,
      newActivity(home.id, "Read later", { typeId: article.id })
    )
    await expect(
      activities.setFieldValue(row.id, author.id, "Someone")
    ).rejects.toThrow()
  })

  it("changing type drops the old type's values and keeps status and due date", async () => {
    const { types, activities, home, book, author } = await setupBook()
    const article = await types.create({ name: "Article", color: "chart-3" })
    const row = await createOne(
      activities,
      newActivity(home.id, "DDIA", {
        typeId: book.id,
        status: "progress",
        dueDate: "2026-11-30",
        fields: { [author.id]: "Martin Kleppmann" },
      })
    )
    await activities.changeType(row.id, article.id)
    expect(await activities.byId(row.id)).toMatchObject({
      typeId: article.id,
      fields: {},
      status: "progress",
      dueDate: "2026-11-30",
    })
    await activities.changeType(row.id, null)
    expect((await activities.byId(row.id))?.typeId).toBeNull()
  })

  it("brings back the type, fields and due date when a deleted activity is restored", async () => {
    const { activities, home, book, author } = await setupBook()
    const row = await createOne(
      activities,
      newActivity(home.id, "DDIA", {
        typeId: book.id,
        dueDate: "2026-11-30",
        fields: { [author.id]: "Martin Kleppmann" },
      })
    )
    const snapshot = await activities.delete(row.id)
    if (!snapshot) throw new Error("Nothing was deleted")
    await activities.restore(snapshot)
    expect(await activities.byId(row.id)).toMatchObject({
      typeId: book.id,
      dueDate: "2026-11-30",
      fields: { [author.id]: "Martin Kleppmann" },
    })
  })
})

describe("restoring a deleted activity after its type changed", () => {
  it("drops values for fields removed while it was deleted", async () => {
    const { types, activities, home, book, author, format } = await setupBook()
    const row = await createOne(
      activities,
      newActivity(home.id, "DDIA", {
        typeId: book.id,
        fields: {
          [author.id]: "Martin Kleppmann",
          [format.id]: format.options[0]?.id,
        },
      })
    )
    const snapshot = await activities.delete(row.id)
    if (!snapshot) throw new Error("Nothing was deleted")
    await types.removeField(author.id)
    await activities.restore(snapshot)
    expect((await activities.byId(row.id))?.fields).toEqual({
      [format.id]: format.options[0]?.id,
    })
  })
})

describe("upgrading from version 5", () => {
  it("gives existing activities no type, no fields and no due date", async () => {
    const name = `activities-upgrade-6-${crypto.randomUUID()}`
    const old = new Dexie(name, { addons: [yDexie] })
    old.version(5).stores({
      activities:
        "id, workspaceId, areaId, goalId, [areaId+number], [workspaceId+updatedAt], content: Y.Doc",
    })
    await old.table("activities").add({
      id: "a1",
      workspaceId: "ws-1",
      areaId: "x",
      goalId: null,
      number: 1,
      title: "Run",
      status: "todo",
      updatedAt: "2026-10-01T00:00:00.000Z",
    })
    old.close()

    const db = createLocalDb(name)
    openDbs.push(db)
    expect(await db.activities.get("a1")).toMatchObject({
      typeId: null,
      fields: {},
      dueDate: null,
      title: "Run",
    })
  })
})

describe("timers on types", () => {
  it("stores a valid timer, rejects an invalid one, and clears it", async () => {
    const { types } = await setup()
    const boxing = await types.create({ name: "Boxing", color: "chart-2" })
    expect(boxing.timer).toBeNull()

    const rounds = {
      mode: "intervals" as const,
      workSeconds: 180,
      restSeconds: 60,
      rounds: 3,
      sound: "bell" as const,
    }
    await types.update(boxing.id, { timer: rounds })
    expect((await types.byId(boxing.id))?.timer).toEqual(rounds)

    await expect(
      types.update(boxing.id, { timer: { ...rounds, rounds: 0 } })
    ).rejects.toThrow()
    await types.update(boxing.id, { timer: null })
    expect((await types.byId(boxing.id))?.timer).toBeNull()
  })
})

describe("upgrading from version 8", () => {
  it("gives existing types and activities no timer of their own", async () => {
    const name = `activities-upgrade-9-${crypto.randomUUID()}`
    const old = new Dexie(name, { addons: [yDexie] })
    old.version(8).stores({
      activities:
        "id, workspaceId, areaId, goalId, typeId, [areaId+number], [workspaceId+updatedAt], content: Y.Doc",
      activityTypes: "id, workspaceId",
    })
    await old.table("activities").add({
      id: "a1",
      workspaceId: "ws-1",
      areaId: "x",
      title: "Run",
      updatedAt: "2026-10-01T00:00:00.000Z",
    })
    await old.table("activityTypes").add({
      id: "t1",
      workspaceId: "ws-1",
      name: "Workout",
    })
    old.close()

    const db = createLocalDb(name)
    openDbs.push(db)
    expect(await db.activities.get("a1")).toMatchObject({ timer: null })
    expect(await db.activityTypes.get("t1")).toMatchObject({ timer: null })
    expect(await db.timeEntries.count()).toBe(0)
  })
})

describe("upgrading from version 9", () => {
  it("makes activities written in another activity its sub-activities", async () => {
    const name = `activities-upgrade-10-${crypto.randomUUID()}`
    const old = new Dexie(name, { addons: [yDexie] })
    old.version(9).stores({
      activities:
        "id, workspaceId, areaId, goalId, typeId, [areaId+number], [workspaceId+updatedAt], content: Y.Doc",
    })
    await old.table("activities").bulkAdd([
      {
        id: "child",
        workspaceId: "ws-1",
        updatedAt: "2026-10-01T00:00:00.000Z",
        origin: { kind: "activity", activityId: "parent", blockId: "b1" },
      },
      {
        id: "from-doc",
        workspaceId: "ws-1",
        updatedAt: "2026-10-01T00:00:00.000Z",
        origin: { kind: "document", documentId: "d1", blockId: null },
      },
      {
        id: "orphan",
        workspaceId: "ws-1",
        updatedAt: "2026-10-01T00:00:00.000Z",
        origin: { kind: "activity", activityId: "deleted", blockId: null },
      },
      {
        id: "parent",
        workspaceId: "ws-1",
        updatedAt: "2026-10-01T00:00:00.000Z",
        origin: null,
      },
      {
        id: "loose",
        workspaceId: "ws-1",
        updatedAt: "2026-10-01T00:00:00.000Z",
        origin: null,
      },
    ])
    old.close()

    const db = createLocalDb(name)
    openDbs.push(db)
    expect(await db.activities.get("child")).toMatchObject({
      parentId: "parent",
    })
    expect(await db.activities.get("from-doc")).toMatchObject({
      parentId: null,
    })
    expect(await db.activities.get("loose")).toMatchObject({ parentId: null })
    expect(await db.activities.get("orphan")).toMatchObject({ parentId: null })
  })
})
