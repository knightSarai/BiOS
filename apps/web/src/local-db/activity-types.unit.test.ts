import "fake-indexeddb/auto"
import { Dexie } from "dexie"
import { afterEach, describe, expect, it, vi } from "vitest"
import yDexie from "y-dexie"
import { InvalidFieldValueError } from "@/activities/fields"
import { ActivitiesRepository, type NewActivity } from "./activities"
import { ActivityTypesRepository } from "./activity-types"
import { AreasRepository } from "./areas"
import { createLocalDb, type LocalDb } from "./db"

const openDbs: LocalDb[] = []

const upgradeAt = (instant: string) => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date(instant))
}

afterEach(async () => {
  vi.useRealTimers()
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

  it("creates a type with an icon, changes it and clears it", async () => {
    const { types } = await setup()
    const type = await types.create({
      name: "Boxing",
      color: "chart-1",
      icon: "phosphor:boxing-glove:neutral",
    })
    expect((await types.byId(type.id))?.icon).toBe(
      "phosphor:boxing-glove:neutral"
    )
    await types.update(type.id, { icon: "🥊" })
    expect((await types.byId(type.id))?.icon).toBe("🥊")
    await types.update(type.id, { icon: null })
    expect((await types.byId(type.id))?.icon).toBeNull()
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

  it("removing an option or deleting a field drops the values that used it", async () => {
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
    await types.deleteField(author.id)
    expect((await activities.byId(row.id))?.fields).toEqual({})
    expect(await types.fields(book.id)).toHaveLength(1)
    expect(await types.fieldById(author.id)).toBeNull()
  })

  it("removing a field from a type keeps the values activities hold for it", async () => {
    const { types, activities, home, book, author } = await setupBook()
    const row = await createOne(
      activities,
      newActivity(home.id, "DDIA", {
        typeId: book.id,
        fields: { [author.id]: "Martin Kleppmann" },
      })
    )
    await types.unlinkField(book.id, author.id)
    expect(
      (await types.fields(book.id)).map((field) => field.id)
    ).not.toContain(author.id)
    expect(await types.fieldById(author.id)).not.toBeNull()
    expect((await activities.byId(row.id))?.fields).toEqual({
      [author.id]: "Martin Kleppmann",
    })
    await types.linkField(book.id, author.id)
    expect((await types.fields(book.id)).map((field) => field.id)).toContain(
      author.id
    )
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

  it("deleting a type leaves its activities with no type and keeps their values", async () => {
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
    expect(await types.fieldById(author.id)).not.toBeNull()
    const after = await activities.byId(row.id)
    expect(after).toMatchObject({ typeId: null, status: "progress" })
    expect(after?.fields).toEqual({ [author.id]: "Martin Kleppmann" })
  })

  it("never reads or changes another workspace's types", async () => {
    const { db, book, author } = await setupBook()
    const other = new ActivityTypesRepository(db, { workspaceId: "ws-2" })
    expect(await other.byId(book.id)).toBeNull()
    expect(await other.list()).toEqual([])
    expect(await other.fields(book.id)).toEqual([])
    expect(await other.library()).toEqual([])
    await other.renameField(author.id, "Hijacked")
    await other.unlinkField(book.id, author.id)
    await other.deleteField(author.id)
    await other.delete(book.id)
    await expect(other.linkField(book.id, author.id)).rejects.toThrow()
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

  it("changing type keeps every value, status and due date", async () => {
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
    const changed = await activities.byId(row.id)
    expect(changed).toMatchObject({
      typeId: article.id,
      status: "progress",
      dueDate: "2026-11-30",
    })
    expect(changed?.fields).toEqual({ [author.id]: "Martin Kleppmann" })
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
    await types.deleteField(author.id)
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

    const round = {
      mode: "down" as const,
      seconds: 180,
      sound: "bell" as const,
    }
    await types.update(boxing.id, { timer: round })
    expect((await types.byId(boxing.id))?.timer).toEqual(round)

    await expect(
      types.update(boxing.id, { timer: { ...round, seconds: 0 } })
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

describe("upgrading from version 10", () => {
  it("turns intervals and laps into generated sub-activities that keep their time", async () => {
    const name = `activities-upgrade-11-${crypto.randomUUID()}`
    const old = new Dexie(name, { addons: [yDexie] })
    old.version(10).stores({
      areas: "id, workspaceId, [workspaceId+key]",
      activities:
        "id, workspaceId, areaId, goalId, typeId, parentId, [areaId+number], [workspaceId+updatedAt], content: Y.Doc",
      activityTypes: "id, workspaceId",
      timeEntries: "id, [workspaceId+activityId], [workspaceId+startedAt]",
    })
    const base = {
      workspaceId: "ws-1",
      areaId: "area",
      typeId: "boxing",
      parentId: null,
      status: "todo",
      updatedAt: "2026-10-01T00:00:00.000Z",
    }
    await old.table("areas").add({
      id: "area",
      workspaceId: "ws-1",
      key: "FIT",
      nextNumber: 3,
    })
    await old.table("activities").bulkAdd([
      {
        ...base,
        id: "spar",
        number: 1,
        timer: {
          mode: "intervals",
          workSeconds: 180,
          restSeconds: 60,
          rounds: 2,
          sound: "bell",
        },
      },
      {
        ...base,
        id: "run",
        number: 2,
        timer: { mode: "stopwatch", sound: "none" },
      },
      {
        ...base,
        id: "drills",
        number: 3,
        typeId: "hiit",
        timer: null,
      },
    ])
    await old.table("activityTypes").bulkAdd([
      {
        id: "boxing",
        workspaceId: "ws-1",
        timer: { mode: "countdown", seconds: 90, sound: "beep" },
      },
      {
        id: "hiit",
        workspaceId: "ws-1",
        timer: {
          mode: "intervals",
          workSeconds: 40,
          restSeconds: 20,
          rounds: 2,
          sound: "chime",
        },
      },
    ])
    const entry = (
      id: string,
      start: string,
      end: string | null,
      endsLap: boolean
    ) => ({
      id,
      workspaceId: "ws-1",
      activityId: "run",
      startedAt: `2026-10-01T10:${start}.000Z`,
      endedAt: end === null ? null : `2026-10-01T10:${end}.000Z`,
      endsLap,
    })
    await old
      .table("timeEntries")
      .bulkAdd([
        entry("e1", "00:00", "04:00", true),
        entry("e2", "04:00", "05:00", false),
        entry("e3", "10:00", "12:00", true),
        entry("e4", "12:00", null, false),
        { ...entry("s1", "20:00", "23:00", false), activityId: "spar" },
        { ...entry("s2", "24:00", null, false), activityId: "spar" },
      ])
    old.close()

    const db = createLocalDb(name)
    openDbs.push(db)
    const children = async (parentId: string) =>
      (await db.activities.where("parentId").equals(parentId).toArray()).sort(
        (a, b) => a.createdAt.localeCompare(b.createdAt)
      )

    expect(await db.activities.get("spar")).toMatchObject({
      timer: { mode: "up", sound: "bell" },
      series: true,
      generated: null,
    })
    expect(
      (await children("spar")).map((row) => [
        row.title,
        row.timer,
        row.typeId,
        row.generated,
      ])
    ).toEqual([
      [
        "Round 1",
        { mode: "down", seconds: 180, sound: "bell" },
        "boxing",
        "step",
      ],
      ["Rest", { mode: "down", seconds: 60, sound: "bell" }, null, "gap"],
      [
        "Round 2",
        { mode: "down", seconds: 180, sound: "bell" },
        "boxing",
        "step",
      ],
    ])
    const sparEntries = await db.timeEntries
      .where("[workspaceId+activityId]")
      .equals(["ws-1", "spar"])
      .toArray()
    expect(sparEntries.map((row) => row.id).sort()).toEqual(["s1", "s2"])
    // 2 × 3:00 with a 1:00 rest is 7:00; 3:00 was logged, so the run left going at 10:24
    // stopped when its last round would have, not at the upgrade.
    expect(sparEntries.find((row) => row.id === "s2")?.endedAt).toBe(
      "2026-10-01T10:28:00.000Z"
    )

    expect(await db.activities.get("drills")).toMatchObject({
      timer: { mode: "up", sound: "chime" },
      series: true,
    })
    expect(
      (await children("drills")).map((row) => [
        row.title,
        row.timer,
        row.generated,
      ])
    ).toEqual([
      ["Round 1", { mode: "down", seconds: 40, sound: "chime" }, "step"],
      ["Rest", { mode: "down", seconds: 20, sound: "chime" }, "gap"],
      ["Round 2", { mode: "down", seconds: 40, sound: "chime" }, "step"],
    ])
    expect(await db.activityTypes.get("hiit")).toMatchObject({
      timer: { mode: "down", seconds: 40, sound: "chime" },
    })

    const laps = await children("run")
    expect(laps.map((row) => [row.title, row.generated, row.status])).toEqual([
      ["Lap 1", "lap", "done"],
      ["Lap 2", "lap", "done"],
      ["Lap 3", "lap", "todo"],
    ])
    const entries = await db.timeEntries.toArray()
    const lapOf = (id: string) =>
      laps.findIndex(
        (lap) => lap.id === entries.find((row) => row.id === id)?.activityId
      ) + 1
    expect(["e1", "e2", "e3", "e4"].map(lapOf)).toEqual([1, 2, 2, 3])
    expect(
      entries.every((row) => row.source === "timer" && !("endsLap" in row))
    ).toBe(true)

    expect((await db.areas.get("area"))?.nextNumber).toBe(12)
    expect(await db.activityTypes.get("boxing")).toMatchObject({
      timer: { mode: "down", seconds: 90, sound: "beep" },
    })
  })
})

describe("upgrading from version 10 with a lapped countdown", () => {
  it("stops a running lapped countdown where it would have run out, and keeps a lapped stopwatch running", async () => {
    upgradeAt("2026-10-01T12:00:00.000Z")
    const name = `activities-upgrade-11-laps-${crypto.randomUUID()}`
    const old = new Dexie(name, { addons: [yDexie] })
    old.version(10).stores({
      areas: "id, workspaceId, [workspaceId+key]",
      activities:
        "id, workspaceId, areaId, goalId, typeId, parentId, [areaId+number], [workspaceId+updatedAt], content: Y.Doc",
      activityTypes: "id, workspaceId",
      timeEntries: "id, [workspaceId+activityId], [workspaceId+startedAt]",
    })
    const base = {
      workspaceId: "ws-1",
      areaId: "area",
      typeId: null,
      parentId: null,
      status: "todo",
      updatedAt: "2026-10-01T00:00:00.000Z",
    }
    await old.table("areas").add({
      id: "area",
      workspaceId: "ws-1",
      key: "WRK",
      nextNumber: 3,
    })
    await old.table("activities").bulkAdd([
      {
        ...base,
        id: "practice",
        number: 1,
        timer: { mode: "countdown", seconds: 600, sound: "bell" },
      },
      {
        ...base,
        id: "writing",
        number: 2,
        timer: { mode: "stopwatch", sound: "none" },
      },
    ])
    const entry = (
      id: string,
      activityId: string,
      start: string,
      end: string | null,
      endsLap: boolean
    ) => ({
      id,
      workspaceId: "ws-1",
      activityId,
      startedAt: `2026-10-01T10:${start}.000Z`,
      endedAt: end === null ? null : `2026-10-01T10:${end}.000Z`,
      endsLap,
    })
    await old
      .table("timeEntries")
      .bulkAdd([
        entry("p1", "practice", "00:00", "04:00", true),
        entry("p2", "practice", "05:00", null, false),
        entry("w1", "writing", "20:00", "22:00", true),
        entry("w2", "writing", "22:00", null, false),
      ])
    old.close()

    const db = createLocalDb(name)
    openDbs.push(db)
    const laps = async (parentId: string) =>
      (await db.activities.where("parentId").equals(parentId).toArray()).sort(
        (a, b) => a.createdAt.localeCompare(b.createdAt)
      )

    const practiceLaps = await laps("practice")
    expect(
      practiceLaps.map((row) => [row.title, row.timer?.mode, row.status])
    ).toEqual([
      ["Lap 1", "up", "done"],
      ["Lap 2", "up", "todo"],
    ])
    // 10:00 with 4:00 logged leaves 6:00 from 10:05, so the open lap ends at 10:11.
    expect(await db.timeEntries.get("p2")).toMatchObject({
      activityId: practiceLaps[1]?.id,
      endedAt: "2026-10-01T10:11:00.000Z",
    })
    expect(await db.timeEntries.get("p1")).toMatchObject({
      activityId: practiceLaps[0]?.id,
      endedAt: "2026-10-01T10:04:00.000Z",
    })

    const writingLaps = await laps("writing")
    expect(await db.timeEntries.get("w2")).toMatchObject({
      activityId: writingLaps[1]?.id,
      endedAt: null,
    })
  })
})

describe("upgrading from version 11", () => {
  it("marks the gaps of existing series, stops timers on their parents and drops tick-only runs", async () => {
    upgradeAt("2026-10-01T12:00:00.000Z")
    const name = `activities-upgrade-12-${crypto.randomUUID()}`
    const old = new Dexie(name, { addons: [yDexie] })
    old.version(11).stores({
      areas: "id, workspaceId, [workspaceId+key]",
      activities:
        "id, workspaceId, areaId, goalId, typeId, parentId, [areaId+number], [workspaceId+updatedAt], content: Y.Doc",
      activityTypes: "id, workspaceId",
      timeEntries: "id, [workspaceId+activityId], [workspaceId+startedAt]",
      routineRuns: "id, [workspaceId+updatedAt]",
    })
    let order = 0
    const row = (
      id: string,
      title: string,
      parentId: string | null,
      extra: {
        typeId?: string | null
        generated?: string | null
        series?: boolean
      } = {}
    ) => ({
      id,
      workspaceId: "ws-1",
      areaId: "area",
      parentId,
      title,
      typeId: null,
      generated: null,
      series: false,
      status: "todo",
      timer: null,
      createdAt: `2026-10-01T00:00:00.${String((order += 1)).padStart(3, "0")}Z`,
      updatedAt: "2026-10-01T00:00:00.000Z",
      ...extra,
    })
    const step = (
      id: string,
      title: string,
      parentId: string,
      typeId: string | null
    ) => row(id, title, parentId, { typeId, generated: "step" })
    await old.table("activities").bulkAdd([
      row("spar", "Spar", null, { series: true }),
      step("r1", "Round 1", "spar", "boxing"),
      step("rest", "Rest", "spar", null),
      step("r2", "Round 2", "spar", "boxing"),
      row("scales", "Scales", null, { series: true }),
      step("s1", "Scales 1", "scales", null),
      step("g1", "Breathe", "scales", null),
      step("s2", "Scales 2", "scales", null),
      step("g2", "Breathe", "scales", null),
      step("s3", "Scales 3", "scales", null),
      row("review", "Review", null, { series: true }),
      step("c1", "Check 1", "review", "check"),
      step("c2", "Check 2", "review", "check"),
      row("drill", "Drill", null, { series: true }),
      {
        ...step("d1", "Drill 1", "drill", null),
        timer: { mode: "down", seconds: 120, sound: "none" },
      },
      {
        ...step("d2", "Drill 2", "drill", "focus"),
      },
    ])
    await old.table("activityTypes").bulkAdd([
      {
        id: "focus",
        workspaceId: "ws-1",
        timer: { mode: "down", seconds: 180, sound: "none" },
      },
    ])
    await old.table("timeEntries").bulkAdd([
      {
        id: "running",
        workspaceId: "ws-1",
        activityId: "spar",
        startedAt: "2026-10-01T10:00:00.000Z",
        endedAt: null,
        source: "timer",
      },
      {
        id: "drill-before",
        workspaceId: "ws-1",
        activityId: "drill",
        startedAt: "2026-10-01T09:00:00.000Z",
        endedAt: "2026-10-01T09:01:00.000Z",
        source: "timer",
      },
      {
        id: "drill-running",
        workspaceId: "ws-1",
        activityId: "drill",
        startedAt: "2026-10-01T10:00:00.000Z",
        endedAt: null,
        source: "timer",
      },
    ])
    const run = {
      workspaceId: "ws-1",
      cursor: null,
      passed: [],
      scopeId: null,
      runStart: null,
      attemptFrom: {},
      updatedAt: "2026-10-01T10:00:00.000Z",
    }
    await old.table("routineRuns").bulkAdd([
      { ...run, id: "scales", scopeId: "s1" },
      { ...run, id: "spar", cursor: "r1" },
    ])
    old.close()

    const db = createLocalDb(name)
    openDbs.push(db)
    const kinds = async (ids: string[]) =>
      (await db.activities.bulkGet(ids)).map((each) => each?.generated)

    expect(await kinds(["r1", "rest", "r2"])).toEqual(["step", "gap", "step"])
    expect(await kinds(["s1", "g1", "s2", "g2", "s3"])).toEqual([
      "step",
      "gap",
      "step",
      "gap",
      "step",
    ])
    expect(await kinds(["c1", "c2"])).toEqual(["step", "step"])
    // Untimed rounds give no length, so the run left going counts up to the upgrade.
    expect((await db.timeEntries.get("running"))?.endedAt).toBe(
      "2026-10-01T12:00:00.000Z"
    )
    // 2:00 + 3:00 (from the type) less the 1:00 already logged.
    expect((await db.timeEntries.get("drill-running"))?.endedAt).toBe(
      "2026-10-01T10:04:00.000Z"
    )
    expect((await db.routineRuns.toArray()).map((each) => each.id)).toEqual([
      "spar",
    ])
    expect((await db.routineRuns.get("spar"))?.joinedAt).toEqual({})
  })
})

describe("upgrading from version 11 with earlier runs and typed-in time", () => {
  it("caps a parent's running timer by this attempt's timer time only, and keeps a Play only row", async () => {
    upgradeAt("2026-10-01T12:00:00.000Z")
    const name = `activities-upgrade-12-attempts-${crypto.randomUUID()}`
    const old = new Dexie(name, { addons: [yDexie] })
    old.version(11).stores({
      areas: "id, workspaceId, [workspaceId+key]",
      activities:
        "id, workspaceId, areaId, goalId, typeId, parentId, [areaId+number], [workspaceId+updatedAt], content: Y.Doc",
      activityTypes: "id, workspaceId",
      timeEntries: "id, [workspaceId+activityId], [workspaceId+startedAt]",
      routineRuns: "id, [workspaceId+updatedAt]",
    })
    let order = 0
    const row = (
      id: string,
      parentId: string | null,
      extra: Record<string, unknown> = {}
    ) => ({
      id,
      workspaceId: "ws-1",
      areaId: "area",
      parentId,
      title: id,
      typeId: null,
      generated: null,
      series: false,
      status: "todo",
      timer: null,
      createdAt: `2026-10-01T00:00:00.${String((order += 1)).padStart(3, "0")}Z`,
      updatedAt: "2026-10-01T00:00:00.000Z",
      ...extra,
    })
    const countdown = (seconds: number) => ({
      mode: "down",
      seconds,
      sound: "none",
    })
    // Scales practice in two timed rounds (2:00 then 3:00), and a work checklist.
    await old
      .table("activities")
      .bulkAdd([
        row("scales", null, { series: true }),
        row("s1", "scales", { generated: "step", timer: countdown(120) }),
        row("s2", "scales", { generated: "step", timer: countdown(180) }),
        row("checklist", null),
        row("triage", "checklist"),
        row("reply", "checklist"),
      ])
    const timed = (id: string, startedAt: string, endedAt: string | null) => ({
      id,
      workspaceId: "ws-1",
      activityId: "scales",
      startedAt: `2026-10-01T${startedAt}.000Z`,
      endedAt: endedAt === null ? null : `2026-10-01T${endedAt}.000Z`,
      source: "timer",
    })
    await old.table("timeEntries").bulkAdd([
      {
        ...timed("typed", "08:00:00", "08:30:00"),
        source: "manual",
        loggedAt: "2026-10-01T09:45:00.000Z",
      },
      timed("earlier-run", "08:00:00", "08:04:00"),
      timed("earlier-attempt", "09:10:00", "09:12:00"),
      timed("this-attempt", "09:30:00", "09:31:00"),
      timed("running", "10:00:00", null),
    ])
    const run = {
      workspaceId: "ws-1",
      cursor: null,
      passed: [],
      scopeId: null,
      runStart: null,
      attemptFrom: {},
      updatedAt: "2026-10-01T10:00:00.000Z",
    }
    await old.table("routineRuns").bulkAdd([
      {
        ...run,
        id: "scales",
        runStart: "2026-10-01T09:00:00.000Z",
        attemptFrom: { scales: "2026-10-01T09:30:00.000Z" },
      },
      { ...run, id: "checklist", cursor: "triage", scopeId: "checklist" },
    ])
    old.close()

    const db = createLocalDb(name)
    openDbs.push(db)

    // 5:00 of countdowns less the 1:00 this attempt already ran.
    expect((await db.timeEntries.get("running"))?.endedAt).toBe(
      "2026-10-01T10:04:00.000Z"
    )
    expect((await db.timeEntries.get("this-attempt"))?.endedAt).toBe(
      "2026-10-01T09:31:00.000Z"
    )
    expect(await db.routineRuns.get("checklist")).toMatchObject({
      cursor: "triage",
      scopeId: "checklist",
    })
  })
})

describe("upgrading from version 10 with real sub-activities", () => {
  it("puts its own rounds under a series beside them and stops a timer running on a parent", async () => {
    upgradeAt("2026-10-01T12:00:00.000Z")
    const name = `activities-upgrade-11-parents-${crypto.randomUUID()}`
    const old = new Dexie(name, { addons: [yDexie] })
    old.version(10).stores({
      areas: "id, workspaceId, [workspaceId+key]",
      activities:
        "id, workspaceId, areaId, goalId, typeId, parentId, [areaId+number], [workspaceId+updatedAt], content: Y.Doc",
      activityTypes: "id, workspaceId",
      timeEntries: "id, [workspaceId+activityId], [workspaceId+startedAt]",
    })
    const row = (
      id: string,
      title: string,
      parentId: string | null,
      extra: Record<string, unknown> = {}
    ) => ({
      id,
      workspaceId: "ws-1",
      areaId: "area",
      parentId,
      typeId: null,
      title,
      status: "todo",
      timer: null,
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
      ...extra,
    })
    await old.table("areas").add({
      id: "area",
      workspaceId: "ws-1",
      key: "MUS",
      nextNumber: 10,
    })
    await old.table("activities").bulkAdd([
      row("practice", "Practice", null, {
        timer: {
          mode: "intervals",
          workSeconds: 60,
          restSeconds: 30,
          rounds: 2,
          sound: "bell",
        },
      }),
      row("tune", "Tune up", "practice"),
      row("circuit", "Circuit", null, { typeId: "hiit" }),
      row("stretch", "Stretch", "circuit"),
      row("essay", "Essay", null, {
        timer: { mode: "countdown", seconds: 600, sound: "none" },
      }),
      row("outline", "Outline", "essay"),
      row("inbox", "Inbox", null, {
        timer: { mode: "stopwatch", sound: "none" },
      }),
      row("reply", "Reply", "inbox"),
    ])
    await old.table("activityTypes").add({
      id: "hiit",
      workspaceId: "ws-1",
      timer: {
        mode: "intervals",
        workSeconds: 40,
        restSeconds: 20,
        rounds: 3,
        sound: "chime",
      },
    })
    const entry = (
      id: string,
      activityId: string,
      start: string,
      end: string | null
    ) => ({
      id,
      workspaceId: "ws-1",
      activityId,
      startedAt: `2026-10-01T${start}.000Z`,
      endedAt: end === null ? null : `2026-10-01T${end}.000Z`,
      endsLap: false,
    })
    await old
      .table("timeEntries")
      .bulkAdd([
        entry("essay-before", "essay", "09:00:00", "09:02:00"),
        entry("essay-running", "essay", "10:00:00", null),
        entry("inbox-running", "inbox", "11:00:00", null),
      ])
    old.close()

    const db = createLocalDb(name)
    openDbs.push(db)
    const children = async (parentId: string) =>
      (await db.activities.where("parentId").equals(parentId).toArray()).sort(
        (a, b) => a.createdAt.localeCompare(b.createdAt)
      )

    expect(await db.activities.get("practice")).toMatchObject({
      series: false,
      timer: { mode: "up", sound: "bell" },
    })
    const underPractice = await children("practice")
    expect(
      underPractice.map((each) => [each.title, each.generated, each.series])
    ).toEqual([
      ["Tune up", null, false],
      ["Practice", null, true],
    ])
    const holder = underPractice[1]
    if (!holder) throw new Error("Expected a series holder")
    expect(
      (await children(holder.id)).map((each) => [each.title, each.generated])
    ).toEqual([
      ["Round 1", "step"],
      ["Rest", "gap"],
      ["Round 2", "step"],
    ])

    expect((await children("circuit")).map((each) => each.title)).toEqual([
      "Stretch",
    ])

    // 10:00 less the 2:00 already logged.
    expect((await db.timeEntries.get("essay-running"))?.endedAt).toBe(
      "2026-10-01T10:08:00.000Z"
    )
    // A stopwatch has no length, so it ran until the upgrade.
    expect((await db.timeEntries.get("inbox-running"))?.endedAt).toBe(
      "2026-10-01T12:00:00.000Z"
    )
  })
})

describe("upgrading from version 13", () => {
  it("stops timers still running on parents, as the timer would have", async () => {
    upgradeAt("2026-10-01T13:00:00.000Z")
    const name = `activities-upgrade-14-${crypto.randomUUID()}`
    const old = new Dexie(name, { addons: [yDexie] })
    old.version(13).stores({
      areas: "id, workspaceId, [workspaceId+key]",
      activities:
        "id, workspaceId, areaId, goalId, typeId, parentId, [areaId+number], [workspaceId+updatedAt], content: Y.Doc",
      activityTypes: "id, workspaceId",
      timeEntries: "id, [workspaceId+activityId], [workspaceId+startedAt]",
      routineRuns: "id, [workspaceId+updatedAt]",
    })
    const row = (
      id: string,
      parentId: string | null,
      timer: unknown = null
    ) => ({
      id,
      workspaceId: "ws-1",
      areaId: "area",
      parentId,
      typeId: null,
      title: id,
      status: "todo",
      timer,
      generated: null,
      series: false,
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
    })
    await old
      .table("activities")
      .bulkAdd([
        row("plan", null, { mode: "down", seconds: 300, sound: "none" }),
        row("draft", "plan"),
        row("notes", null, { mode: "up", sound: "none" }),
        row("read", "notes"),
        row("solo", null, { mode: "down", seconds: 60, sound: "none" }),
      ])
    const entry = (
      id: string,
      activityId: string,
      start: string,
      end: string | null
    ) => ({
      id,
      workspaceId: "ws-1",
      activityId,
      startedAt: `2026-10-01T${start}.000Z`,
      endedAt: end === null ? null : `2026-10-01T${end}.000Z`,
      source: "timer",
    })
    await old
      .table("timeEntries")
      .bulkAdd([
        entry("plan-before-run", "plan", "09:00:00", "09:01:00"),
        entry("plan-earlier", "plan", "09:40:00", "09:41:00"),
        entry("plan-running", "plan", "10:00:00", null),
        entry("notes-running", "notes", "11:00:00", null),
        entry("solo-running", "solo", "12:00:00", null),
      ])
    await old.table("routineRuns").add({
      id: "plan",
      workspaceId: "ws-1",
      cursor: "draft",
      passed: [],
      scopeId: null,
      runStart: "2026-10-01T09:30:00.000Z",
      attemptFrom: {},
      joinedAt: {},
      updatedAt: "2026-10-01T10:00:00.000Z",
    })
    old.close()

    const db = createLocalDb(name)
    openDbs.push(db)
    // 5:00 less the 1:00 run since Start over; the minute before it doesn't count.
    expect((await db.timeEntries.get("plan-running"))?.endedAt).toBe(
      "2026-10-01T10:04:00.000Z"
    )
    // A count-up has no length, so it ran until the upgrade.
    expect((await db.timeEntries.get("notes-running"))?.endedAt).toBe(
      "2026-10-01T13:00:00.000Z"
    )
    expect((await db.timeEntries.get("solo-running"))?.endedAt).toBeNull()
    expect((await db.routineRuns.get("plan"))?.replay).toEqual([])
  })
})

describe("upgrading from version 15", () => {
  it("moves each type's fields into the field library with the same ids", async () => {
    const name = `activities-upgrade-16-${crypto.randomUUID()}`
    const old = new Dexie(name, { addons: [yDexie] })
    old.version(15).stores({
      activityTypes: "id, workspaceId",
      activityTypeFields: "id, [workspaceId+typeId]",
    })
    await old.table("activityTypes").add({
      id: "book",
      workspaceId: "ws-1",
      name: "Book",
      color: "chart-1",
      icon: null,
      statusNames: {},
      timer: null,
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
    })
    await old.table("activityTypeFields").add({
      id: "author",
      workspaceId: "ws-1",
      typeId: "book",
      name: "Author",
      kind: "text",
      options: [],
      sortKey: "a0",
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-02T00:00:00.000Z",
    })
    old.close()

    const db = createLocalDb(name)
    openDbs.push(db)
    const types = new ActivityTypesRepository(db, { workspaceId: "ws-1" })
    expect(await types.byId("book")).toMatchObject({ parentId: null })
    expect(await types.fieldById("author")).toEqual({
      id: "author",
      workspaceId: "ws-1",
      name: "Author",
      kind: "text",
      options: [],
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-02T00:00:00.000Z",
    })
    expect((await types.fields("book")).map((field) => field.id)).toEqual([
      "author",
    ])
  })
})
