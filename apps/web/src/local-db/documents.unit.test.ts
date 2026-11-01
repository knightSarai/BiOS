import "fake-indexeddb/auto"
import { afterEach, describe, expect, it } from "vitest"
import { Dexie } from "dexie"
import yDexie from "y-dexie"
import { createLocalDb, ROOT_FOLDER_ID, type LocalDb } from "./db"
import { DocumentsRepository } from "./documents"

const openDbs: LocalDb[] = []

const freshDb = () => {
  const db = createLocalDb(`documents-test-${crypto.randomUUID()}`)
  openDbs.push(db)
  return db
}

afterEach(async () => {
  await Promise.all(openDbs.splice(0).map((db) => db.delete()))
})

describe("DocumentsRepository", () => {
  it("creates untitled documents in the active workspace", async () => {
    const repo = new DocumentsRepository(freshDb(), { workspaceId: "ws-1" })
    const id = await repo.create()
    const row = await repo.byId(id)
    expect(row).toMatchObject({ id, workspaceId: "ws-1", title: "" })
  })

  it("never reads another workspace's documents", async () => {
    const db = freshDb()
    const mine = new DocumentsRepository(db, { workspaceId: "ws-1" })
    const theirs = new DocumentsRepository(db, { workspaceId: "ws-2" })
    const id = await theirs.create()
    await mine.create()

    expect(await mine.byId(id)).toBeNull()
    expect(await mine.list()).toHaveLength(1)
    await mine.saveContent(id, { title: "Not mine", excerpt: "" })
    expect((await theirs.byId(id))?.title).toBe("")
  })

  it("lists the most recently edited document first", async () => {
    const repo = new DocumentsRepository(freshDb(), { workspaceId: "ws-1" })
    const first = await repo.create()
    const second = await repo.create()
    await new Promise((resolve) => setTimeout(resolve, 5))
    await repo.saveContent(first, { title: "Boxing plan", excerpt: "" })

    const rows = await repo.list()
    expect(rows.map((row) => row.id)).toEqual([first, second])
    expect(rows[0]?.title).toBe("Boxing plan")
  })
})

describe("upgrading from version 2", () => {
  it("puts existing documents at the top of the notebook, newest first", async () => {
    const name = `upgrade-test-${crypto.randomUUID()}`
    const old = new Dexie(name, { addons: [yDexie] })
    old.version(1).stores({
      documents: "id, workspaceId, [workspaceId+updatedAt], content: Y.Doc",
    })
    old.version(2).stores({
      areas: "id, workspaceId, [workspaceId+key]",
      activities:
        "id, workspaceId, areaId, [areaId+number], [workspaceId+updatedAt], content: Y.Doc",
    })
    await old.table("documents").bulkAdd([
      {
        id: "older",
        workspaceId: "ws-1",
        title: "Older",
        createdAt: "2026-10-01T00:00:00.000Z",
        updatedAt: "2026-10-01T00:00:00.000Z",
      },
      {
        id: "newer",
        workspaceId: "ws-1",
        title: "Newer",
        createdAt: "2026-10-02T00:00:00.000Z",
        updatedAt: "2026-10-02T00:00:00.000Z",
      },
    ])
    await old.table("activities").add({
      id: "a1",
      workspaceId: "ws-1",
      areaId: "x",
      number: 1,
      title: "Run",
      updatedAt: "2026-10-01T00:00:00.000Z",
    })
    old.close()

    const db = createLocalDb(name)
    openDbs.push(db)
    const repo = new DocumentsRepository(db, { workspaceId: "ws-1" })
    const rows = await repo.inFolder(ROOT_FOLDER_ID)
    expect(rows.map((row) => row.title).sort()).toEqual(["Newer", "Older"])
    const newer = rows.find((row) => row.id === "newer")
    const older = rows.find((row) => row.id === "older")
    expect(newer!.sortKey < older!.sortKey).toBe(true)
    expect(newer).toMatchObject({ icon: null, journal: null, excerpt: "" })
    expect((await db.activities.get("a1"))?.goalId).toBeNull()
  })
})
