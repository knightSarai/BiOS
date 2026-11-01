import "fake-indexeddb/auto"
import { afterEach, describe, expect, it } from "vitest"
import { Dexie } from "dexie"
import yDexie from "y-dexie"
import { createLocalDb, type LocalDb } from "./db"
import { GoalsRepository } from "./goals"

const openDbs: LocalDb[] = []

const freshDb = () => {
  const db = createLocalDb(`goals-test-${crypto.randomUUID()}`)
  openDbs.push(db)
  return db
}

afterEach(async () => {
  await Promise.all(openDbs.splice(0).map((db) => db.delete()))
})

describe("goal status", () => {
  it("starts a new goal as One Day", async () => {
    const repo = new GoalsRepository(freshDb(), { workspaceId: "ws-1" })
    const id = await repo.create("Learn to swim")
    expect((await repo.byId(id))?.status).toBe("one-day")
  })
})

describe("goal icons", () => {
  it("starts without an icon, then sets and clears one", async () => {
    const repo = new GoalsRepository(freshDb(), { workspaceId: "ws-1" })
    const id = await repo.create("Fight in spring")
    expect((await repo.byId(id))?.icon).toBeNull()

    await repo.setIcon(id, "🥊")
    expect((await repo.byId(id))?.icon).toBe("🥊")

    await repo.setIcon(id, null)
    expect((await repo.byId(id))?.icon).toBeNull()
  })

  it("never changes another workspace's goal", async () => {
    const db = freshDb()
    const mine = new GoalsRepository(db, { workspaceId: "ws-1" })
    const theirs = new GoalsRepository(db, { workspaceId: "ws-2" })
    const id = await theirs.create("Theirs")

    await mine.setIcon(id, "🥊")
    expect((await theirs.byId(id))?.icon).toBeNull()
  })

  it("keeps the icon through delete and restore", async () => {
    const repo = new GoalsRepository(freshDb(), { workspaceId: "ws-1" })
    const id = await repo.create("Fight in spring")
    await repo.setIcon(id, "🥊")

    const snapshot = await repo.delete(id)
    await repo.restore(snapshot!)
    expect((await repo.byId(id))?.icon).toBe("🥊")
  })
})

describe("upgrading from version 3", () => {
  it("gives existing goals no icon and turns Active into Current", async () => {
    const name = `goals-upgrade-${crypto.randomUUID()}`
    const old = new Dexie(name, { addons: [yDexie] })
    old.version(3).stores({
      goals: "id, workspaceId, [workspaceId+updatedAt], content: Y.Doc",
    })
    await old.table("goals").add({
      id: "g2",
      workspaceId: "ws-1",
      title: "Run a 10k",
      status: "achieved",
      targetMonth: null,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    })
    await old.table("goals").add({
      id: "g1",
      workspaceId: "ws-1",
      title: "Fight in spring",
      status: "active",
      targetMonth: null,
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
    })
    old.close()

    const db = createLocalDb(name)
    openDbs.push(db)
    const repo = new GoalsRepository(db, { workspaceId: "ws-1" })
    const goal = await repo.byId("g1")
    expect((await repo.byId("g2"))?.status).toBe("achieved")
    expect(goal).toMatchObject({
      title: "Fight in spring",
      icon: null,
      status: "current",
    })
  })
})
