import "fake-indexeddb/auto"
import { afterEach, describe, expect, it } from "vitest"
import { createLocalDb, type LocalDb } from "./db"
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
    await mine.saveTitle(id, "Not mine")
    expect((await theirs.byId(id))?.title).toBe("")
  })

  it("lists the most recently edited document first", async () => {
    const repo = new DocumentsRepository(freshDb(), { workspaceId: "ws-1" })
    const first = await repo.create()
    const second = await repo.create()
    await new Promise((resolve) => setTimeout(resolve, 5))
    await repo.saveTitle(first, "Boxing plan")

    const rows = await repo.list()
    expect(rows.map((row) => row.id)).toEqual([first, second])
    expect(rows[0]?.title).toBe("Boxing plan")
  })
})
