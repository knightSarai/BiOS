import type { AreaColor } from "@/activities/areas"
import { activityKey } from "@/activities/areas"
import type { ActivityStatus } from "@/activities/status"
import type { GoalStatus } from "@/goals/status"
import { dailyNoteLocation, type DailyNoteFormat } from "@/journal/daily-note"
import type { ActivitiesRepository } from "@/local-db/activities"
import type { AreasRepository } from "@/local-db/areas"
import type { AttachmentsRepository } from "@/local-db/attachments"
import {
  ROOT_FOLDER_ID,
  type DocumentRow,
  type FolderRole,
  type FolderRow,
  type MentionSourceKey,
} from "@/local-db/db"
import type { DocumentsRepository } from "@/local-db/documents"
import type { FoldersRepository } from "@/local-db/folders"
import type { GoalsRepository } from "@/local-db/goals"
import type { MentionsRepository } from "@/local-db/mentions"
import {
  activityFolderName,
  goalFolderName,
  ownerKeyOf,
  parseOwnerKey,
  type Owner,
  type OwnerKey,
} from "./owners"
import { indexFolders, ownerOfFolder, pathTo, subtreeFolderIds } from "./tree"

type NotebookContext = {
  folders: FoldersRepository
  documents: DocumentsRepository
  attachments: AttachmentsRepository
  mentions: MentionsRepository
  areas: AreasRepository
  activities: ActivitiesRepository
  goals: GoalsRepository
}

type OwnerSummary =
  | {
      kind: "area"
      id: string
      ownerKey: OwnerKey
      title: string
      color: AreaColor
    }
  | {
      kind: "activity"
      id: string
      ownerKey: OwnerKey
      title: string
      activityKey: string
      status: ActivityStatus
      areaId: string
      areaName: string
    }
  | {
      kind: "goal"
      id: string
      ownerKey: OwnerKey
      title: string
      status: GoalStatus
      icon: string | null
    }

type DocumentSummary = Pick<
  DocumentRow,
  "id" | "title" | "icon" | "updatedAt" | "folderId" | "excerpt"
> & { path: string[] }

const ensureSystemFolder = (
  ctx: NotebookContext,
  parentId: string,
  spec: { role: FolderRole; name: string }
) => ctx.folders.findOrCreateChild(parentId, spec)

const describeOwner = async (
  ctx: NotebookContext,
  owner: Owner
): Promise<OwnerSummary | null> => {
  const ownerKey = ownerKeyOf(owner)
  if (owner.kind === "area") {
    const area = await ctx.areas.byId(owner.id)
    return area
      ? {
          kind: "area",
          id: area.id,
          ownerKey,
          title: area.name,
          color: area.color,
        }
      : null
  }
  if (owner.kind === "activity") {
    const activity = await ctx.activities.byId(owner.id)
    if (!activity) return null
    const area = await ctx.areas.byId(activity.areaId)
    return {
      kind: "activity",
      id: activity.id,
      ownerKey,
      title: activity.title,
      activityKey: activityKey(area?.key ?? "?", activity.number),
      status: activity.status,
      areaId: activity.areaId,
      areaName: area?.name ?? "",
    }
  }
  const goal = await ctx.goals.byId(owner.id)
  return goal
    ? {
        kind: "goal",
        id: goal.id,
        ownerKey,
        title: goal.title,
        status: goal.status,
        icon: goal.icon,
      }
    : null
}

const describeOwnerKey = (ctx: NotebookContext, key: string) => {
  const owner = parseOwnerKey(key)
  return owner ? describeOwner(ctx, owner) : Promise.resolve(null)
}

const folderNameFor = (summary: OwnerSummary) => {
  if (summary.kind === "area") return summary.title
  if (summary.kind === "activity") {
    return activityFolderName(summary.activityKey, summary.title)
  }
  return goalFolderName(summary.title)
}

const parentFolderIdFor = async (
  ctx: NotebookContext,
  summary: OwnerSummary
): Promise<string> => {
  if (summary.kind === "area") {
    return (
      await ensureSystemFolder(ctx, ROOT_FOLDER_ID, {
        role: "areas",
        name: "Areas",
      })
    ).id
  }
  if (summary.kind === "goal") {
    return (
      await ensureSystemFolder(ctx, ROOT_FOLDER_ID, {
        role: "goals",
        name: "Goals",
      })
    ).id
  }
  const areaFolder = await ensureEntityFolder(ctx, {
    kind: "area",
    id: summary.areaId,
  })
  return (
    await ensureSystemFolder(ctx, areaFolder.id, {
      role: "area-activities",
      name: "Activities",
    })
  ).id
}

const ensureEntityFolder = async (
  ctx: NotebookContext,
  owner: Owner
): Promise<FolderRow> => {
  const existing = await ctx.folders.byOwner(ownerKeyOf(owner))
  if (existing) return existing
  const summary = await describeOwner(ctx, owner)
  if (!summary) throw new Error("This item no longer exists.")
  return ctx.folders.findOrCreateOwned(summary.ownerKey, {
    parentId: await parentFolderIdFor(ctx, summary),
    name: folderNameFor(summary),
  })
}

// The folder keeps following its entity until the user renames or moves it.
const syncEntityFolder = async (ctx: NotebookContext, owner: Owner) => {
  const folder = await ctx.folders.byOwner(ownerKeyOf(owner))
  if (!folder?.followsOwner) return
  const summary = await describeOwner(ctx, owner)
  if (!summary) return
  const name = folderNameFor(summary)
  if (folder.name !== name) {
    await ctx.folders.rename(folder.id, name, { byOwner: true })
  }
  const parentId = await parentFolderIdFor(ctx, summary)
  if (folder.parentId !== parentId) {
    await ctx.folders.move(folder.id, parentId, { byOwner: true })
  }
}

const createDocumentFor = async (ctx: NotebookContext, owner: Owner) => {
  const folder = await ensureEntityFolder(ctx, owner)
  return ctx.documents.create({ folderId: folder.id })
}

const summarizeDocuments = (
  documents: DocumentRow[],
  folders: FolderRow[]
): DocumentSummary[] => {
  const byId = indexFolders(folders)
  return documents.map((document) => ({
    id: document.id,
    title: document.title,
    icon: document.icon,
    updatedAt: document.updatedAt,
    folderId: document.folderId,
    excerpt: document.excerpt,
    path: pathTo(document.folderId, byId).map((folder) => folder.name),
  }))
}

const entityDocuments = async (ctx: NotebookContext, owner: Owner) => {
  const ownerKey = ownerKeyOf(owner)
  const [folders, folder, attachments] = await Promise.all([
    ctx.folders.list(),
    ctx.folders.byOwner(ownerKey),
    ctx.attachments.forOwner(ownerKey),
  ])
  const inFolder = folder
    ? await ctx.documents.inFolders(
        subtreeFolderIds(folder.id, folders, { stopAtOtherOwners: true })
      )
    : []
  const inFolderIds = new Set(inFolder.map((document) => document.id))
  const attached = (
    await Promise.all(
      attachments.map((attachment) => ctx.documents.byId(attachment.documentId))
    )
  ).filter(
    (document): document is DocumentRow =>
      document !== null && !inFolderIds.has(document.id)
  )
  const byNewest = (a: DocumentRow, b: DocumentRow) =>
    b.updatedAt.localeCompare(a.updatedAt)
  return {
    folder,
    folderPath: folder
      ? pathTo(folder.id, indexFolders(folders)).map((row) => row.name)
      : [],
    inFolder: summarizeDocuments(inFolder.sort(byNewest), folders),
    attached: summarizeDocuments(attached.sort(byNewest), folders),
  }
}

type MentionSource =
  | { kind: "document"; document: DocumentSummary }
  | { kind: "owner"; owner: OwnerSummary }

const describeSource = async (
  ctx: NotebookContext,
  sourceKey: MentionSourceKey,
  folders: FolderRow[]
): Promise<MentionSource | null> => {
  const [kind, id] = [
    sourceKey.slice(0, sourceKey.indexOf(":")),
    sourceKey.slice(sourceKey.indexOf(":") + 1),
  ]
  if (kind === "document") {
    const document = await ctx.documents.byId(id)
    return document
      ? {
          kind: "document",
          document: summarizeDocuments([document], folders)[0],
        }
      : null
  }
  const owner = await describeOwnerKey(ctx, sourceKey)
  return owner ? { kind: "owner", owner } : null
}

const documentDetails = async (ctx: NotebookContext, documentId: string) => {
  const document = await ctx.documents.byId(documentId)
  if (!document) return null
  const [folders, attachments, backlinks] = await Promise.all([
    ctx.folders.list(),
    ctx.attachments.forDocument(documentId),
    ctx.mentions.backlinksTo(`document:${documentId}`),
  ])
  const byId = indexFolders(folders)
  const ownerKey = ownerOfFolder(document.folderId, byId)
  const belongsTo = ownerKey ? await describeOwnerKey(ctx, ownerKey) : null
  const attachedTo = (
    await Promise.all(
      attachments
        .filter((attachment) => attachment.ownerKey !== ownerKey)
        .map((attachment) => describeOwnerKey(ctx, attachment.ownerKey))
    )
  ).filter((owner): owner is OwnerSummary => owner !== null)
  const mentionedIn = (
    await Promise.all(
      backlinks.map((link) => describeSource(ctx, link.sourceKey, folders))
    )
  ).filter((source): source is MentionSource => source !== null)
  return {
    document: summarizeDocuments([document], folders)[0],
    folderPath: pathTo(document.folderId, byId),
    belongsTo,
    attachedTo,
    mentionedIn,
  }
}

type DocumentMove = {
  documentId: string
  previous: { folderId: string; sortKey: string }
  attachedOwner: OwnerKey | null
  removedAttachment: OwnerKey | null
}

// Leaving an entity's folder keeps that entity as an attachment, so tidying never loses a link.
const moveDocument = async (
  ctx: NotebookContext,
  documentId: string,
  folderId: string,
  sortKey?: string
): Promise<DocumentMove | null> => {
  const document = await ctx.documents.byId(documentId)
  if (!document) return null
  const byId = indexFolders(await ctx.folders.list())
  const fromOwner = ownerOfFolder(document.folderId, byId)
  const toOwner = ownerOfFolder(folderId, byId)
  await ctx.documents.move(documentId, folderId, sortKey)
  let attachedOwner: OwnerKey | null = null
  let removedAttachment: OwnerKey | null = null
  if (fromOwner && fromOwner !== toOwner) {
    if (await ctx.attachments.attach(documentId, fromOwner)) {
      attachedOwner = fromOwner
    }
  }
  if (toOwner && toOwner !== fromOwner) {
    const attachments = await ctx.attachments.forDocument(documentId)
    if (attachments.some((attachment) => attachment.ownerKey === toOwner)) {
      await ctx.attachments.detach(documentId, toOwner)
      removedAttachment = toOwner
    }
  }
  return {
    documentId,
    previous: { folderId: document.folderId, sortKey: document.sortKey },
    attachedOwner,
    removedAttachment,
  }
}

const undoDocumentMove = async (ctx: NotebookContext, move: DocumentMove) => {
  await ctx.documents.move(
    move.documentId,
    move.previous.folderId,
    move.previous.sortKey
  )
  if (move.attachedOwner) {
    await ctx.attachments.detach(move.documentId, move.attachedOwner)
  }
  if (move.removedAttachment) {
    await ctx.attachments.attach(move.documentId, move.removedAttachment)
  }
}

type FolderMove = {
  folderId: string
  previous: { parentId: string; sortKey: string; followsOwner: boolean }
  attachedOwner: OwnerKey | null
  attachedDocumentIds: string[]
}

class SystemFolderMoveError extends Error {}

// Areas, Goals and Activities folders are found by their place, so they stay put.
const isMovableFolder = (folder: Pick<FolderRow, "role">) =>
  folder.role === "plain"

const moveFolder = async (
  ctx: NotebookContext,
  folderId: string,
  parentId: string,
  sortKey?: string
): Promise<FolderMove | null> => {
  const folder = await ctx.folders.byId(folderId)
  if (!folder) return null
  if (!isMovableFolder(folder)) {
    throw new SystemFolderMoveError("This folder can't be moved.")
  }
  const folders = await ctx.folders.list()
  const byId = indexFolders(folders)
  const fromOwner = folder.ownerKey
    ? null
    : ownerOfFolder(folder.parentId, byId)
  const toOwner = ownerOfFolder(parentId, byId)
  await ctx.folders.move(folderId, parentId, { sortKey })
  const attachedDocumentIds: string[] = []
  if (fromOwner && fromOwner !== toOwner) {
    const documents = await ctx.documents.inFolders(
      subtreeFolderIds(folderId, folders, { stopAtOtherOwners: true })
    )
    for (const document of documents) {
      if (await ctx.attachments.attach(document.id, fromOwner)) {
        attachedDocumentIds.push(document.id)
      }
    }
  }
  return {
    folderId,
    previous: {
      parentId: folder.parentId,
      sortKey: folder.sortKey,
      followsOwner: folder.followsOwner,
    },
    attachedOwner: attachedDocumentIds.length > 0 ? fromOwner : null,
    attachedDocumentIds,
  }
}

const undoFolderMove = async (ctx: NotebookContext, move: FolderMove) => {
  await ctx.folders.place(move.folderId, move.previous)
  const owner = move.attachedOwner
  if (!owner) return
  for (const documentId of move.attachedDocumentIds) {
    await ctx.attachments.detach(documentId, owner)
  }
}

const ensureDailyNote = async (
  ctx: NotebookContext,
  date: string,
  format: DailyNoteFormat
) => {
  const location = dailyNoteLocation(date, format)
  let parentId = ROOT_FOLDER_ID
  for (const name of location.folders) {
    parentId = (await ctx.folders.findOrCreatePlainChild(parentId, name)).id
  }
  return ctx.documents.findOrCreateInFolder(parentId, location.title)
}

const listOwners = async (ctx: NotebookContext): Promise<OwnerSummary[]> => {
  const [areas, activities, goals] = await Promise.all([
    ctx.areas.list(),
    ctx.activities.list(),
    ctx.goals.list(),
  ])
  const areaById = new Map(areas.map((area) => [area.id, area]))
  return [
    ...activities.map((activity): OwnerSummary => ({
      kind: "activity",
      id: activity.id,
      ownerKey: `activity:${activity.id}`,
      title: activity.title,
      activityKey: activityKey(
        areaById.get(activity.areaId)?.key ?? "?",
        activity.number
      ),
      status: activity.status,
      areaId: activity.areaId,
      areaName: areaById.get(activity.areaId)?.name ?? "",
    })),
    ...goals.map((goal): OwnerSummary => ({
      kind: "goal",
      id: goal.id,
      ownerKey: `goal:${goal.id}`,
      title: goal.title,
      status: goal.status,
      icon: goal.icon,
    })),
    ...areas.map((area): OwnerSummary => ({
      kind: "area",
      id: area.id,
      ownerKey: `area:${area.id}`,
      title: area.name,
      color: area.color,
    })),
  ]
}

export {
  createDocumentFor,
  describeOwner,
  describeOwnerKey,
  documentDetails,
  ensureDailyNote,
  ensureEntityFolder,
  entityDocuments,
  isMovableFolder,
  listOwners,
  moveDocument,
  moveFolder,
  summarizeDocuments,
  SystemFolderMoveError,
  syncEntityFolder,
  undoDocumentMove,
  undoFolderMove,
}
export type {
  DocumentMove,
  DocumentSummary,
  FolderMove,
  MentionSource,
  NotebookContext,
  OwnerSummary,
}
