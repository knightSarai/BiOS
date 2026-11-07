import "fake-indexeddb/auto"
import { afterEach, describe, expect, it } from "vitest"
import { ActivitiesRepository } from "@/local-db/activities"
import { AreasRepository } from "@/local-db/areas"
import { AttachmentsRepository } from "@/local-db/attachments"
import { createLocalDb, ROOT_FOLDER_ID, type LocalDb } from "@/local-db/db"
import { DocumentsRepository } from "@/local-db/documents"
import { FoldersRepository } from "@/local-db/folders"
import { GoalsRepository } from "@/local-db/goals"
import { MentionsRepository } from "@/local-db/mentions"
import { indexFolders, pathTo } from "./tree"
import {
  createDocumentFor,
  documentDetails,
  ensureDailyNote,
  ensureEntityFolder,
  entityDocuments,
  moveDocument,
  moveFolder,
  syncEntityFolder,
  undoDocumentMove,
  undoFolderMove,
  type NotebookContext,
} from "./use-cases"

const openDbs: LocalDb[] = []

afterEach(async () => {
  await Promise.all(openDbs.splice(0).map((db) => db.delete()))
})

const contextFor = (db: LocalDb, workspaceId: string): NotebookContext => {
  const ctx = { workspaceId }
  return {
    folders: new FoldersRepository(db, ctx),
    documents: new DocumentsRepository(db, ctx),
    attachments: new AttachmentsRepository(db, ctx),
    mentions: new MentionsRepository(db, ctx),
    areas: new AreasRepository(db, ctx),
    activities: new ActivitiesRepository(db, ctx),
    goals: new GoalsRepository(db, ctx),
  }
}

const setup = async () => {
  const db = createLocalDb(`notebook-test-${crypto.randomUUID()}`)
  openDbs.push(db)
  const ctx = contextFor(db, "ws-1")
  const health = await ctx.areas.create({
    name: "Health",
    key: "HLT",
    color: "chart-2",
  })
  const finance = await ctx.areas.create({
    name: "Finance",
    key: "FIN",
    color: "chart-5",
  })
  const activityId = crypto.randomUUID()
  await ctx.activities.insertMany([
    {
      id: activityId,
      areaId: health.id,
      title: "Book sparring",
      status: "todo",
      origin: null,
    },
  ])
  return { db, ctx, health, finance, activityId }
}

const folderPath = async (ctx: NotebookContext, folderId: string) =>
  pathTo(folderId, indexFolders(await ctx.folders.list())).map((f) => f.name)

describe("entity folders", () => {
  it("creates an activity's folder under its area on the first document", async () => {
    const { ctx, activityId } = await setup()
    expect(await ctx.folders.byOwner(`activity:${activityId}`)).toBeNull()

    const documentId = await createDocumentFor(ctx, {
      kind: "activity",
      id: activityId,
    })
    const document = await ctx.documents.byId(documentId)
    expect(await folderPath(ctx, document!.folderId)).toEqual([
      "Areas",
      "Health",
      "Activities",
      "HLT-1 Book sparring",
    ])
  })

  it("reuses the folder instead of creating a second one", async () => {
    const { ctx, activityId } = await setup()
    const owner = { kind: "activity" as const, id: activityId }
    const [a, b] = await Promise.all([
      ensureEntityFolder(ctx, owner),
      ensureEntityFolder(ctx, owner),
    ])
    expect(a.id).toBe(b.id)
    const areasFolders = (await ctx.folders.list()).filter(
      (folder) => folder.role === "areas"
    )
    expect(areasFolders).toHaveLength(1)
  })

  it("follows the activity's title and area until the user renames the folder", async () => {
    const { ctx, activityId, finance } = await setup()
    const owner = { kind: "activity" as const, id: activityId }
    const folder = await ensureEntityFolder(ctx, owner)

    await ctx.activities.saveTitle(activityId, "Book light sparring")
    await ctx.activities.moveToArea(activityId, finance.id)
    await syncEntityFolder(ctx, owner)
    expect(await folderPath(ctx, folder.id)).toEqual([
      "Areas",
      "Finance",
      "Activities",
      "FIN-1 Book light sparring",
    ])

    await ctx.folders.rename(folder.id, "Sparring")
    await ctx.activities.saveTitle(activityId, "Renamed again")
    await syncEntityFolder(ctx, owner)
    expect((await ctx.folders.byId(folder.id))?.name).toBe("Sparring")
  })
})

describe("moving documents", () => {
  it("keeps the old entity as an attachment, and Undo puts everything back", async () => {
    const { ctx, activityId } = await setup()
    const documentId = await createDocumentFor(ctx, {
      kind: "activity",
      id: activityId,
    })
    const knowledge = await ctx.folders.create({ name: "Knowledge" })

    const move = await moveDocument(ctx, documentId, knowledge.id)
    expect(move?.attachedOwner).toBe(`activity:${activityId}`)
    const docs = await entityDocuments(ctx, {
      kind: "activity",
      id: activityId,
    })
    expect(docs.inFolder).toHaveLength(0)
    expect(docs.attached.map((d) => d.id)).toEqual([documentId])

    await undoDocumentMove(ctx, move!)
    const back = await entityDocuments(ctx, {
      kind: "activity",
      id: activityId,
    })
    expect(back.inFolder.map((d) => d.id)).toEqual([documentId])
    expect(back.attached).toHaveLength(0)
  })

  it("drops an attachment once the document moves into that entity's folder", async () => {
    const { ctx, activityId } = await setup()
    const documentId = await ctx.documents.create()
    await ctx.attachments.attach(documentId, `activity:${activityId}`)
    const folder = await ensureEntityFolder(ctx, {
      kind: "activity",
      id: activityId,
    })

    const move = await moveDocument(ctx, documentId, folder.id)
    expect(move?.removedAttachment).toBe(`activity:${activityId}`)
    expect(await ctx.attachments.forDocument(documentId)).toHaveLength(0)
  })

  it("lists an area's own documents without its activities' documents", async () => {
    const { ctx, activityId, health } = await setup()
    await createDocumentFor(ctx, { kind: "activity", id: activityId })
    const plan = await createDocumentFor(ctx, { kind: "area", id: health.id })
    const docs = await entityDocuments(ctx, { kind: "area", id: health.id })
    expect(docs.inFolder.map((d) => d.id)).toEqual([plan])
  })
})

describe("document details", () => {
  it("reports where a document belongs, its attachments and backlinks", async () => {
    const { ctx, activityId, health } = await setup()
    const documentId = await createDocumentFor(ctx, {
      kind: "activity",
      id: activityId,
    })
    await ctx.attachments.attach(documentId, `area:${health.id}`)
    const other = await ctx.documents.create({ title: "Boxing plan" })
    await ctx.mentions.replaceForSource(`document:${other}`, [
      { targetKey: `document:${documentId}`, blockId: null },
    ])

    const details = await documentDetails(ctx, documentId)
    expect(details?.belongsTo).toMatchObject({
      kind: "activity",
      activityKey: "HLT-1",
    })
    expect(details?.attachedTo.map((o) => o.title)).toEqual(["Health"])
    expect(details?.mentionedIn).toMatchObject([
      { kind: "document", document: { id: other } },
    ])
  })
})

describe("deleting", () => {
  it("deletes a folder with everything in it and restores it", async () => {
    const { ctx } = await setup()
    const knowledge = await ctx.folders.create({ name: "Knowledge" })
    const aws = await ctx.folders.create({
      parentId: knowledge.id,
      name: "AWS",
    })
    const documentId = await ctx.documents.create({
      folderId: aws.id,
      title: "IAM notes",
    })
    await ctx.attachments.attach(documentId, "area:x")

    const snapshot = await ctx.folders.delete(knowledge.id)
    expect(snapshot?.folders).toHaveLength(2)
    expect(await ctx.documents.byId(documentId)).toBeNull()
    expect(await ctx.attachments.forDocument(documentId)).toHaveLength(0)

    await ctx.documents.restore(snapshot!)
    expect((await ctx.documents.byId(documentId))?.title).toBe("IAM notes")
    expect(await folderPath(ctx, aws.id)).toEqual(["Knowledge", "AWS"])
    expect(await ctx.attachments.forDocument(documentId)).toHaveLength(1)
  })

  it("never deletes or reads another workspace's folders", async () => {
    const { db, ctx } = await setup()
    const theirs = contextFor(db, "ws-2")
    const folder = await theirs.folders.create({ name: "Private" })
    expect(await ctx.folders.byId(folder.id)).toBeNull()
    expect(await ctx.folders.delete(folder.id)).toBeNull()
    expect(await ctx.folders.list()).toHaveLength(0)
  })

  it("refuses to move a folder into its own child", async () => {
    const { ctx } = await setup()
    const parent = await ctx.folders.create({ name: "Parent" })
    const child = await ctx.folders.create({
      parentId: parent.id,
      name: "Child",
    })
    await expect(ctx.folders.move(parent.id, child.id)).rejects.toThrow()
    expect((await ctx.folders.byId(parent.id))?.parentId).toBe(ROOT_FOLDER_ID)
  })
})

const isoFormat = { dateOrder: "YMD", dateSeparator: "-" } as const

describe("daily notes", () => {
  it("creates the note once, under Journal, Daily, year and month", async () => {
    const { ctx } = await setup()
    const [a, b] = await Promise.all([
      ensureDailyNote(ctx, "2026-11-07", isoFormat),
      ensureDailyNote(ctx, "2026-11-07", isoFormat),
    ])
    expect(a).toBe(b)
    const note = await ctx.documents.byId(a)
    expect(note?.title).toBe("2026-11-07")
    expect(await folderPath(ctx, note!.folderId)).toEqual([
      "Journal",
      "Daily",
      "2026",
      "Nov",
    ])
  })

  it("makes a new note when the old one was moved or renamed", async () => {
    const { ctx } = await setup()
    const first = await ensureDailyNote(ctx, "2026-11-07", isoFormat)
    const elsewhere = await ctx.folders.create({ name: "Elsewhere" })
    await moveDocument(ctx, first, elsewhere.id)
    const second = await ensureDailyNote(ctx, "2026-11-07", isoFormat)
    expect(second).not.toBe(first)

    await ctx.documents.rename(second, "Saturday")
    const third = await ensureDailyNote(ctx, "2026-11-07", isoFormat)
    expect(third).not.toBe(second)
  })

  it("lets the Journal folder be moved, and starts a new one at the top level", async () => {
    const { ctx } = await setup()
    const first = await ensureDailyNote(ctx, "2026-11-07", isoFormat)
    const journal = (await ctx.folders.list()).find(
      (folder) => folder.name === "Journal"
    )
    const archive = await ctx.folders.create({ name: "Archive" })
    await moveFolder(ctx, journal!.id, archive.id)
    const next = await ensureDailyNote(ctx, "2026-11-08", isoFormat)
    const note = await ctx.documents.byId(next)
    expect(await folderPath(ctx, note!.folderId)).toEqual([
      "Journal",
      "Daily",
      "2026",
      "Nov",
    ])
    expect((await ctx.documents.byId(first))?.folderId).not.toBe(note!.folderId)
  })

  it("files into a Journal folder the user already has", async () => {
    const { ctx } = await setup()
    const journal = await ctx.folders.create({ name: "Journal" })
    const id = await ensureDailyNote(ctx, "2026-11-07", isoFormat)
    const note = await ctx.documents.byId(id)
    const path = pathTo(note!.folderId, indexFolders(await ctx.folders.list()))
    expect(path[0].id).toBe(journal.id)
  })
})

describe("review fixes", () => {
  it("won't move system folders", async () => {
    const { ctx, health } = await setup()
    await createDocumentFor(ctx, { kind: "area", id: health.id })
    const areas = (await ctx.folders.list()).find((f) => f.role === "areas")
    const knowledge = await ctx.folders.create({ name: "Knowledge" })
    await expect(moveFolder(ctx, areas!.id, knowledge.id)).rejects.toThrow()
  })

  it("keeps the entity attached when a subfolder leaves its folder, and Undo detaches", async () => {
    const { ctx, activityId } = await setup()
    const activityFolder = await ensureEntityFolder(ctx, {
      kind: "activity",
      id: activityId,
    })
    const notes = await ctx.folders.create({
      parentId: activityFolder.id,
      name: "Notes",
    })
    const documentId = await ctx.documents.create({ folderId: notes.id })
    const knowledge = await ctx.folders.create({ name: "Knowledge" })

    const move = await moveFolder(ctx, notes.id, knowledge.id)
    expect(move?.attachedDocumentIds).toEqual([documentId])
    const owner = { kind: "activity" as const, id: activityId }
    expect(
      (await entityDocuments(ctx, owner)).attached.map((d) => d.id)
    ).toEqual([documentId])

    await undoFolderMove(ctx, move!)
    const back = await entityDocuments(ctx, owner)
    expect(back.inFolder.map((d) => d.id)).toEqual([documentId])
    expect(back.attached).toHaveLength(0)
  })

  it("gives a restored document a free sort key when its old one was taken", async () => {
    const { ctx } = await setup()
    const first = await ctx.documents.create({ title: "First" })
    const snapshot = await ctx.documents.delete(first)
    const second = await ctx.documents.create({ title: "Second" })
    await ctx.documents.restore(snapshot!)
    const [a, b] = await Promise.all([
      ctx.documents.byId(first),
      ctx.documents.byId(second),
    ])
    expect(a?.sortKey).not.toBe(b?.sortKey)
  })

  it("creates one daily note even when two tabs open Today at once", async () => {
    const { db } = await setup()
    const tabA = contextFor(db, "ws-1")
    const tabB = contextFor(db, "ws-1")
    const [a, b] = await Promise.all([
      ensureDailyNote(tabA, "2026-11-02", isoFormat),
      ensureDailyNote(tabB, "2026-11-02", isoFormat),
    ])
    expect(a).toBe(b)
    const months = (await tabA.folders.list()).filter(
      (folder) => folder.name === "Nov"
    )
    expect(months).toHaveLength(1)
  })
})
