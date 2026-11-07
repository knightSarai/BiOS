import "fake-indexeddb/auto"
import { afterEach, describe, expect, it } from "vitest"
import { DexieYProvider } from "y-dexie"
import {
  prosemirrorToYXmlFragment,
  yXmlFragmentToProseMirrorRootNode,
} from "y-prosemirror"
import { DOCUMENT_FRAGMENT, titleOf } from "@/editor/document-content"
import { doc, p, title } from "@/editor/editor-test-utils"
import { schema } from "@/editor/schema"
import { areaKeyFromName } from "@/activities/areas"
import { ActivitiesRepository, InvalidParentError } from "./activities"
import { ActivityTypesRepository } from "./activity-types"
import { AreaKeyTakenError, AreasRepository } from "./areas"
import { createLocalDb, type LocalDb } from "./db"
import { MentionsRepository } from "./mentions"

const openDbs: LocalDb[] = []

afterEach(async () => {
  await Promise.all(openDbs.splice(0).map((db) => db.delete()))
})

const setup = async (workspaceId = "ws-1") => {
  const db = createLocalDb(`activities-test-${crypto.randomUUID()}`)
  openDbs.push(db)
  const areas = new AreasRepository(db, { workspaceId })
  const activities = new ActivitiesRepository(db, { workspaceId })
  const home = await areas.ensureDefault("Knight Life")
  return { db, areas, activities, home }
}

const newActivity = (areaId: string, title: string) => ({
  id: crypto.randomUUID(),
  areaId,
  title,
  status: "todo" as const,
  origin: null,
})

describe("areaKeyFromName", () => {
  it.each([
    ["Knight Life", "KNI"],
    ["Health", "HEA"],
    ["  ème 42", "EME"],
    ["123", ""],
  ])("turns %j into %j", (name, key) => {
    expect(areaKeyFromName(name)).toBe(key)
  })
})

describe("AreasRepository", () => {
  it("creates the default area once, even when asked twice at the same time", async () => {
    const { areas } = await setup()
    await Promise.all([
      areas.ensureDefault("Knight Life"),
      areas.ensureDefault("Knight Life"),
    ])
    const rows = await areas.list()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ key: "KNI", name: "Knight Life" })
  })

  it("rejects a key that is already used in the workspace", async () => {
    const { areas } = await setup()
    await areas.create({ name: "Health", key: "hlt", color: "chart-2" })
    await expect(
      areas.create({ name: "Holidays", key: "HLT", color: "chart-3" })
    ).rejects.toBeInstanceOf(AreaKeyTakenError)
  })

  it("rejects keys that are not 2 to 5 letters", async () => {
    const { areas } = await setup()
    expect(() =>
      areas.create({ name: "Health", key: "H1", color: "chart-2" })
    ).toThrow()
  })
})

describe("ActivitiesRepository", () => {
  it("numbers activities per area", async () => {
    const { areas, activities, home } = await setup()
    const health = await areas.create({
      name: "Health",
      key: "HLT",
      color: "chart-2",
    })
    const created = await activities.createMany([
      newActivity(home.id, "Buy wraps"),
      newActivity(health.id, "Weigh in"),
      newActivity(home.id, "Find a gym"),
    ])
    expect(created.map((item) => item.key)).toEqual(["KNI-1", "HLT-1", "KNI-2"])
  })

  it("toggles done and returns to the previous open status", async () => {
    const { activities, home } = await setup()
    const [created] = await activities.createMany([
      newActivity(home.id, "Spar"),
    ])
    const id = created?.id ?? ""
    await activities.setStatus(id, "progress")
    await activities.toggleDone(id)
    expect(await activities.byId(id)).toMatchObject({ status: "done" })
    expect((await activities.byId(id))?.completedAt).not.toBeNull()
    await activities.toggleDone(id)
    expect(await activities.byId(id)).toMatchObject({
      status: "progress",
      completedAt: null,
    })
  })

  it("gives an activity a new number when it moves area", async () => {
    const { areas, activities, home } = await setup()
    const health = await areas.create({
      name: "Health",
      key: "HLT",
      color: "chart-2",
    })
    await activities.createMany([newActivity(health.id, "First")])
    const [moved] = await activities.createMany([
      newActivity(home.id, "Run 5 km"),
    ])
    await activities.moveToArea(moved?.id ?? "", health.id)
    expect(await activities.summary(moved?.id ?? "")).toMatchObject({
      key: "HLT-2",
      title: "Run 5 km",
    })
  })

  it("counts open activities per area and filters the list by area", async () => {
    const { areas, activities, home } = await setup()
    const health = await areas.create({
      name: "Health",
      key: "HLT",
      color: "chart-2",
    })
    const [done] = await activities.createMany([
      newActivity(home.id, "Done one"),
      newActivity(home.id, "Open one"),
      newActivity(health.id, "Health one"),
    ])
    await activities.toggleDone(done?.id ?? "")
    const counts = await activities.openCountsByArea()
    expect(counts.get(home.id)).toBe(1)
    expect(counts.get(health.id)).toBe(1)
    expect(await activities.list({ areaId: health.id })).toHaveLength(1)
  })

  it("never touches another workspace's activities", async () => {
    const { db, activities, home } = await setup()
    const [created] = await activities.createMany([
      newActivity(home.id, "Mine"),
    ])
    const other = new ActivitiesRepository(db, { workspaceId: "ws-2" })
    expect(await other.byId(created?.id ?? "")).toBeNull()
    await other.toggleDone(created?.id ?? "")
    expect(await activities.byId(created?.id ?? "")).toMatchObject({
      status: "todo",
    })
    await expect(
      other.createMany([newActivity(home.id, "Sneaky")])
    ).rejects.toThrow()
  })
})

describe("activity content", () => {
  it("starts each new activity's body with its title", async () => {
    const { activities, home } = await setup()
    const [created] = await activities.createMany([
      newActivity(home.id, "Weekly weigh-in"),
    ])
    const row = await activities.byId(created?.id ?? "")
    if (!row) throw new Error("Activity row missing")
    const provider = DexieYProvider.load(row.content)
    await provider.whenLoaded
    const body = yXmlFragmentToProseMirrorRootNode(
      row.content.getXmlFragment(DOCUMENT_FRAGMENT),
      schema
    )
    DexieYProvider.release(row.content)
    expect(() => body.check()).not.toThrow()
    expect(titleOf(body)).toBe("Weekly weigh-in")
  })
})

describe("notes written when creating an activity", () => {
  it("go into the body as one paragraph per line after the title", async () => {
    const { activities, home } = await setup()
    const [created] = await activities.createMany([
      {
        ...newActivity(home.id, "Book a sparring session"),
        notes: "Light technical sparring only.\nPack gloves",
      },
    ])
    const row = await activities.byId(created?.id ?? "")
    if (!row) throw new Error("Activity row missing")
    const provider = DexieYProvider.load(row.content)
    await provider.whenLoaded
    const body = yXmlFragmentToProseMirrorRootNode(
      row.content.getXmlFragment(DOCUMENT_FRAGMENT),
      schema
    )
    DexieYProvider.release(row.content)
    expect(() => body.check()).not.toThrow()
    const blocks: string[] = []
    body.forEach((node) => blocks.push(`${node.type.name}:${node.textContent}`))
    expect(blocks).toEqual([
      "title:Book a sparring session",
      "paragraph:Light technical sparring only.",
      "paragraph:Pack gloves",
    ])
  })
})

describe("repairing an activity body", () => {
  it("fills in a body that was never seeded from the stored title", async () => {
    const { activities, home } = await setup()
    const activity = newActivity(home.id, "Run 5 km")
    await activities.insertMany([activity])
    await activities.ensureContent(activity.id)

    const row = await activities.byId(activity.id)
    if (!row) throw new Error("Activity row missing")
    const provider = DexieYProvider.load(row.content)
    await provider.whenLoaded
    const body = yXmlFragmentToProseMirrorRootNode(
      row.content.getXmlFragment(DOCUMENT_FRAGMENT),
      schema
    )
    DexieYProvider.release(row.content)
    expect(titleOf(body)).toBe("Run 5 km")
  })
})

describe("deleting and restoring an activity", () => {
  it("removes the row and its stored body, then restores both with the same number", async () => {
    const { db, activities, home } = await setup()
    const [created] = await activities.createMany([
      newActivity(home.id, "Buy wraps"),
    ])
    const id = created?.id ?? ""
    const row = await activities.byId(id)
    if (!row) throw new Error("Activity row missing")
    const provider = DexieYProvider.load(row.content)
    await provider.whenLoaded
    prosemirrorToYXmlFragment(
      doc(title("Buy wraps"), p("16 oz, red")),
      row.content.getXmlFragment(DOCUMENT_FRAGMENT)
    )
    await new Promise((resolve) => setTimeout(resolve, 20))
    DexieYProvider.release(row.content)

    const updates = db.table("$activities.content_updates")
    const snapshot = await activities.delete(id)
    expect(await activities.byId(id)).toBeNull()
    expect(await updates.where("k").equals(id).count()).toBe(0)
    if (!snapshot) throw new Error("Expected a snapshot")

    await activities.restore(snapshot)
    expect(await activities.summary(id)).toMatchObject({
      key: "KNI-1",
      title: "Buy wraps",
    })
    const restored = await activities.byId(id)
    if (!restored) throw new Error("Restored row missing")
    const reopened = DexieYProvider.load(restored.content)
    await reopened.whenLoaded
    const body = yXmlFragmentToProseMirrorRootNode(
      restored.content.getXmlFragment(DOCUMENT_FRAGMENT),
      schema
    )
    DexieYProvider.release(restored.content)
    expect(body.textContent).toBe("Buy wraps16 oz, red")

    const [next] = await activities.createMany([newActivity(home.id, "Next")])
    expect(next?.key).toBe("KNI-2")
  })

  it("does not delete another workspace's activity", async () => {
    const { db, activities, home } = await setup()
    const [created] = await activities.createMany([
      newActivity(home.id, "Mine"),
    ])
    const other = new ActivitiesRepository(db, { workspaceId: "ws-2" })
    expect(await other.delete(created?.id ?? "")).toBeNull()
    expect(await activities.byId(created?.id ?? "")).not.toBeNull()
  })
})

const writeBody = async (
  activities: ActivitiesRepository,
  id: string,
  body: ReturnType<typeof doc>
) => {
  const row = await activities.byId(id)
  if (!row) throw new Error("Activity row missing")
  const provider = DexieYProvider.load(row.content)
  await provider.whenLoaded
  prosemirrorToYXmlFragment(body, row.content.getXmlFragment(DOCUMENT_FRAGMENT))
  await new Promise((resolve) => setTimeout(resolve, 20))
  DexieYProvider.release(row.content)
}

const activityIdsInBody = async (
  activities: ActivitiesRepository,
  id: string
) => {
  const row = await activities.byId(id)
  if (!row) throw new Error("Activity row missing")
  const provider = DexieYProvider.load(row.content)
  await provider.whenLoaded
  const body = yXmlFragmentToProseMirrorRootNode(
    row.content.getXmlFragment(DOCUMENT_FRAGMENT),
    schema
  )
  DexieYProvider.release(row.content)
  const ids: string[] = []
  const mentionIds: string[] = []
  body.descendants((node) => {
    if (node.type.name === "activity") {
      ids.push(node.attrs.activityId as string)
    }
    if (node.type.name === "mention") {
      mentionIds.push(node.attrs.targetId as string)
    }
  })
  return { ids, mentionIds, text: body.textContent }
}

const activityLine = (activityId: string) =>
  schema.node("paragraph", null, [schema.node("activity", { activityId })])

describe("duplicating an activity", () => {
  const setupWorkout = async () => {
    const context = await setup()
    const { db, activities, home } = context
    const types = new ActivityTypesRepository(db, { workspaceId: "ws-1" })
    const set = await types.create({ name: "Set", color: "chart-1" })
    const reps = await types.addField(set.id, { name: "Reps", kind: "number" })
    const workout = newActivity(home.id, "Push day")
    const exercise = {
      ...newActivity(home.id, "Bench press"),
      parentId: workout.id,
      origin: {
        kind: "activity" as const,
        activityId: workout.id,
        blockId: "b1",
      },
    }
    const firstSet = {
      ...newActivity(home.id, "Set 1"),
      typeId: set.id,
      fields: { [reps.id]: 8 },
      status: "done" as const,
      parentId: exercise.id,
      origin: {
        kind: "activity" as const,
        activityId: exercise.id,
        blockId: "b2",
      },
    }
    const unrelated = newActivity(home.id, "Buy wraps")
    const listOnly = {
      ...newActivity(home.id, "Set 2"),
      parentId: exercise.id,
    }
    await activities.createMany([
      { ...workout, dueDate: "2026-11-07" },
      exercise,
      firstSet,
      unrelated,
      listOnly,
    ])
    await activities.setTimer(workout.id, {
      mode: "intervals",
      workSeconds: 180,
      restSeconds: 60,
      rounds: 3,
      sound: "bell",
    })
    await writeBody(
      activities,
      workout.id,
      doc(
        title("Push day"),
        p("Warm up first"),
        schema.node("paragraph", null, [
          schema.node("mention", {
            targetKind: "activity",
            targetId: exercise.id,
          }),
        ]),
        activityLine(exercise.id),
        activityLine(unrelated.id)
      )
    )
    await writeBody(
      activities,
      exercise.id,
      doc(title("Bench press"), activityLine(firstSet.id))
    )
    await new MentionsRepository(db, {
      workspaceId: "ws-1",
    }).replaceForSource(`activity:${workout.id}`, [
      { targetKey: `activity:${exercise.id}`, blockId: "b1" },
      { targetKey: `activity:${unrelated.id}`, blockId: null },
    ])
    return {
      ...context,
      workout,
      exercise,
      firstSet,
      listOnly,
      unrelated,
      reps,
    }
  }

  it("copies the activity and every sub-activity in its body, pointing the copied lines at the copies", async () => {
    const { activities, workout, exercise, firstSet, listOnly, unrelated } =
      await setupWorkout()

    const copy = await activities.duplicate(workout.id)
    if (!copy) throw new Error("Expected a copy")
    expect(copy.key).toBe("KNI-6")

    const copyRow = await activities.byId(copy.id)
    expect(copyRow).toMatchObject({
      title: "Push day",
      status: "todo",
      dueDate: null,
      origin: null,
      timer: { mode: "intervals", rounds: 3 },
    })

    const copyBody = await activityIdsInBody(activities, copy.id)
    expect(copyBody.text).toBe("Push dayWarm up first")
    const [exerciseCopyId, unrelatedId] = copyBody.ids
    expect(exerciseCopyId).not.toBe(exercise.id)
    expect(unrelatedId).toBe(unrelated.id)

    const exerciseCopy = await activities.byId(exerciseCopyId ?? "")
    expect(exerciseCopy).toMatchObject({
      title: "Bench press",
      parentId: copy.id,
      origin: { kind: "activity", activityId: copy.id, blockId: "b1" },
    })

    const [setCopyId] = (
      await activityIdsInBody(activities, exerciseCopyId ?? "")
    ).ids
    expect(setCopyId).not.toBe(firstSet.id)
    const setCopy = await activities.byId(setCopyId ?? "")
    expect(setCopy).toMatchObject({
      title: "Set 1",
      status: "todo",
      completedAt: null,
      fields: firstSet.fields,
      parentId: exerciseCopyId,
      origin: { kind: "activity", activityId: exerciseCopyId, blockId: "b2" },
    })

    const copiedSets = await activities.children(exerciseCopyId ?? "")
    expect(copiedSets.map((row) => row.title)).toEqual(["Set 1", "Set 2"])
    expect(copiedSets.map((row) => row.id)).not.toContain(listOnly.id)
    expect(await activities.byId(unrelated.id)).toMatchObject({
      parentId: null,
    })

    expect(copyBody.mentionIds).toEqual([exerciseCopyId])
    expect(await activities.list()).toHaveLength(9)
    const original = await activityIdsInBody(activities, workout.id)
    expect(original.ids).toEqual([exercise.id, unrelated.id])
  })

  it("copies the body's mentions onto the copy", async () => {
    const { db, activities, workout, unrelated } = await setupWorkout()
    const copy = await activities.duplicate(workout.id)
    if (!copy) throw new Error("Expected a copy")
    const [exerciseCopyId] = (await activityIdsInBody(activities, copy.id)).ids
    const mentions = await db.mentions
      .where("[workspaceId+sourceKey]")
      .equals(["ws-1", `activity:${copy.id}`])
      .toArray()
    expect(mentions.map((row) => row.targetKey).sort()).toEqual(
      [`activity:${exerciseCopyId}`, `activity:${unrelated.id}`].sort()
    )
  })

  it("returns null for another workspace's activity", async () => {
    const { db, workout } = await setupWorkout()
    const other = new ActivitiesRepository(db, { workspaceId: "ws-2" })
    expect(await other.duplicate(workout.id)).toBeNull()
  })
})

describe("activity summaries", () => {
  it("list field values in the type's order for inline lines", async () => {
    const { db, activities, home } = await setup()
    const types = new ActivityTypesRepository(db, { workspaceId: "ws-1" })
    const set = await types.create({ name: "Set", color: "chart-1" })
    const reps = await types.addField(set.id, { name: "Reps", kind: "number" })
    const weight = await types.addField(set.id, {
      name: "Weight",
      kind: "number",
    })
    const activity = {
      ...newActivity(home.id, "Set 1"),
      typeId: set.id,
      fields: { [weight.id]: 60, [reps.id]: 8 },
    }
    await activities.createMany([activity])
    expect(await activities.summary(activity.id)).toMatchObject({
      details: "Reps 8 · Weight 60",
    })
  })
})

describe("activity timers", () => {
  it("rejects invalid timer settings and clears back to the type's", async () => {
    const { activities, home } = await setup()
    const activity = newActivity(home.id, "Spar")
    await activities.createMany([activity])
    await expect(
      activities.setTimer(activity.id, {
        mode: "countdown",
        seconds: 0,
        sound: "none",
      })
    ).rejects.toThrow()
    await activities.setTimer(activity.id, null)
    expect((await activities.byId(activity.id))?.timer).toBeNull()
  })
})

describe("sub-activities", () => {
  const setupFamily = async () => {
    const context = await setup()
    const { activities, home } = context
    const parent = newActivity(home.id, "Boxing session")
    const first = { ...newActivity(home.id, "Round 1"), parentId: parent.id }
    const second = { ...newActivity(home.id, "Round 2"), parentId: parent.id }
    await activities.createMany([parent, first, second])
    return { ...context, parent, first, second }
  }

  it("lists a parent's sub-activities in the order they were added", async () => {
    const { activities, parent } = await setupFamily()
    const children = await activities.subActivities(parent.id)
    expect(children.map((child) => child.title)).toEqual(["Round 1", "Round 2"])
  })

  it("lists sub-activities at every level, each with its parent", async () => {
    const { activities, home, parent, first } = await setupFamily()
    const set = { ...newActivity(home.id, "Set 1"), parentId: first.id }
    await activities.createMany([set])
    const all = await activities.subActivities(parent.id)
    expect(all.map((row) => [row.title, row.parentId])).toEqual([
      ["Round 1", parent.id],
      ["Round 2", parent.id],
      ["Set 1", first.id],
    ])
  })

  it("rejects a parent that would make a loop or doesn't exist", async () => {
    const { activities, parent, first } = await setupFamily()
    await expect(activities.setParent(parent.id, first.id)).rejects.toThrow(
      InvalidParentError
    )
    await expect(activities.setParent(parent.id, parent.id)).rejects.toThrow(
      InvalidParentError
    )
    await expect(activities.setParent(first.id, "missing")).rejects.toThrow(
      InvalidParentError
    )
  })

  it("offers every activity outside its own tree as a parent", async () => {
    const { activities, home, parent, first, second } = await setupFamily()
    const other = newActivity(home.id, "Run")
    await activities.createMany([other])
    const idsFor = async (id: string) =>
      (await activities.parentCandidates(id)).map((row) => row.id).sort()
    expect(await idsFor(parent.id)).toEqual([other.id])
    expect(await idsFor(first.id)).toEqual(
      [parent.id, second.id, other.id].sort()
    )
  })

  it("moves and unlinks a sub-activity", async () => {
    const { activities, home, first } = await setupFamily()
    const other = newActivity(home.id, "Strength")
    await activities.createMany([other])
    await activities.setParent(first.id, other.id)
    expect((await activities.children(other.id)).map((row) => row.id)).toEqual([
      first.id,
    ])
    await activities.setParent(first.id, null)
    expect((await activities.byId(first.id))?.parentId).toBeNull()
  })

  it("keeps sub-activities when their parent is deleted, and puts them back on undo", async () => {
    const { activities, parent, first, second } = await setupFamily()
    const snapshot = await activities.delete(parent.id)
    if (!snapshot) throw new Error("Expected a snapshot")
    expect((await activities.byId(first.id))?.parentId).toBeNull()
    await activities.setParent(second.id, first.id)

    await activities.restore(snapshot)
    expect((await activities.children(parent.id)).map((row) => row.id)).toEqual(
      [first.id]
    )
    expect((await activities.byId(second.id))?.parentId).toBe(first.id)
  })

  it("doesn't close a loop when undo brings back a parent", async () => {
    const { activities, home, parent, first } = await setupFamily()
    const grand = newActivity(home.id, "Week plan")
    await activities.createMany([grand])
    await activities.setParent(parent.id, grand.id)
    const snapshot = await activities.delete(parent.id)
    if (!snapshot) throw new Error("Expected a snapshot")
    await activities.setParent(grand.id, first.id)

    await activities.restore(snapshot)
    expect((await activities.byId(parent.id))?.parentId).toBe(grand.id)
    expect((await activities.byId(first.id))?.parentId).toBeNull()
  })

  it("keeps a duplicated sub-activity under the same parent, after its siblings in order", async () => {
    const { activities, parent, first } = await setupFamily()
    const copy = await activities.duplicate(first.id)
    if (!copy) throw new Error("Expected a copy")
    expect((await activities.byId(copy.id))?.parentId).toBe(parent.id)
    expect(
      (await activities.subActivities(parent.id)).map((child) => child.id)
    ).toEqual([first.id, expect.any(String), copy.id])
  })

  it("restores a deleted sub-activity without a parent if the parent is gone", async () => {
    const { activities, parent, first } = await setupFamily()
    const childSnapshot = await activities.delete(first.id)
    await activities.delete(parent.id)
    if (!childSnapshot) throw new Error("Expected a snapshot")
    await activities.restore(childSnapshot)
    expect((await activities.byId(first.id))?.parentId).toBeNull()
  })
})
