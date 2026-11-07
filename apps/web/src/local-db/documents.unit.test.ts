import "fake-indexeddb/auto"
import { afterEach, describe, expect, it } from "vitest"
import { Dexie } from "dexie"
import yDexie from "y-dexie"
import { DEFAULT_DOCUMENT_ICON } from "@/notebook/stored-icon"
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
    expect(row).toMatchObject({
      id,
      workspaceId: "ws-1",
      title: "",
      icon: DEFAULT_DOCUMENT_ICON,
    })
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
    expect(newer).toMatchObject({
      icon: DEFAULT_DOCUMENT_ICON,
      excerpt: "",
    })
    expect((await db.activities.get("a1"))?.goalId).toBeNull()
  })
})

describe("upgrading from version 6", () => {
  it("gives documents without an icon the default file icon", async () => {
    const name = `documents-upgrade-7-${crypto.randomUUID()}`
    const old = new Dexie(name, { addons: [yDexie] })
    old.version(6).stores({
      documents:
        "id, workspaceId, [workspaceId+updatedAt], [workspaceId+folderId], [workspaceId+journalKey], content: Y.Doc",
    })
    await old.table("documents").bulkAdd([
      { id: "plain", workspaceId: "ws-1", title: "Plain", icon: null },
      { id: "custom", workspaceId: "ws-1", title: "Custom", icon: "🥊" },
    ])
    old.close()

    const db = createLocalDb(name)
    openDbs.push(db)
    expect((await db.documents.get("plain"))?.icon).toBe(DEFAULT_DOCUMENT_ICON)
    expect((await db.documents.get("custom"))?.icon).toBe("🥊")
  })
})

describe("upgrading from version 7", () => {
  it("turns journal folders and pages into ordinary items in place", async () => {
    const name = `documents-upgrade-8-${crypto.randomUUID()}`
    const old = new Dexie(name, { addons: [yDexie] })
    old.version(7).stores({
      documents:
        "id, workspaceId, [workspaceId+updatedAt], [workspaceId+folderId], [workspaceId+journalKey], content: Y.Doc",
      folders:
        "id, workspaceId, [workspaceId+parentId], [workspaceId+ownerKey]",
    })
    await old.table("folders").bulkAdd([
      { id: "journal", workspaceId: "ws-1", role: "journal", period: "" },
      {
        id: "nov",
        workspaceId: "ws-1",
        role: "journal-month",
        period: "2026-11",
      },
      { id: "areas", workspaceId: "ws-1", role: "areas", period: null },
    ])
    await old.table("documents").add({
      id: "day",
      workspaceId: "ws-1",
      title: "Sat 7 Nov",
      folderId: "nov",
      journal: { period: "day", key: "2026-11-07", date: "2026-11-07" },
      journalKey: "day:2026-11-07",
    })
    old.close()

    const db = createLocalDb(name)
    openDbs.push(db)
    const folders = await db.folders.toArray()
    expect(
      Object.fromEntries(folders.map((folder) => [folder.id, folder.role]))
    ).toEqual({ journal: "plain", nov: "plain", areas: "areas" })
    expect(folders.every((folder) => !("period" in folder))).toBe(true)
    const day = await db.documents.get("day")
    expect(day?.folderId).toBe("nov")
    expect(day).not.toHaveProperty("journal")
    expect(day).not.toHaveProperty("journalKey")
  })
})
