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
import { ActivitiesRepository } from "./activities"
import { AreaKeyTakenError, AreasRepository } from "./areas"
import { createLocalDb, type LocalDb } from "./db"

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
