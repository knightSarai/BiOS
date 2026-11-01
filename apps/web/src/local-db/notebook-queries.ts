import { queryOptions } from "@tanstack/react-query"
import { ownerKeyOf, type Owner } from "@/notebook/owners"
import { indexFolders, pathTo } from "@/notebook/tree"
import {
  documentDetails,
  entityDocuments,
  listOwners,
  type NotebookContext,
} from "@/notebook/use-cases"
import { ActivitiesRepository } from "./activities"
import { AreasRepository } from "./areas"
import { AttachmentsRepository } from "./attachments"
import { getLocalDb } from "./db"
import { DocumentsRepository } from "./documents"
import { FoldersRepository } from "./folders"
import { GoalsRepository } from "./goals"
import { MentionsRepository } from "./mentions"

const notebookContext = (workspaceId: string): NotebookContext => {
  const db = getLocalDb()
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

const notebookKeys = {
  all: (workspaceId: string) => ["local-db", workspaceId, "notebook"] as const,
  tree: (workspaceId: string) =>
    [...notebookKeys.all(workspaceId), "tree"] as const,
  folder: (workspaceId: string, folderId: string) =>
    [...notebookKeys.all(workspaceId), "folder", folderId] as const,
  details: (workspaceId: string, documentId: string) =>
    [...notebookKeys.all(workspaceId), "details", documentId] as const,
  owners: (workspaceId: string) =>
    [...notebookKeys.all(workspaceId), "owners"] as const,
  entity: (workspaceId: string, owner: Owner) =>
    [...notebookKeys.all(workspaceId), "entity", ownerKeyOf(owner)] as const,
}

// Local reads and writes never wait for the network, so they keep working offline.
const localQuery = { networkMode: "always", staleTime: 0 } as const

const notebookTreeQuery = (workspaceId: string) =>
  queryOptions({
    ...localQuery,
    queryKey: notebookKeys.tree(workspaceId),
    queryFn: async () => {
      const ctx = notebookContext(workspaceId)
      const [folders, documents, areas, activities, goals] = await Promise.all([
        ctx.folders.list(),
        ctx.documents.list(),
        ctx.areas.list(),
        ctx.activities.list(),
        ctx.goals.list(),
      ])
      const liveOwners = new Set<string>([
        ...areas.map((row) => `area:${row.id}`),
        ...activities.map((row) => `activity:${row.id}`),
        ...goals.map((row) => `goal:${row.id}`),
      ])
      return {
        folders: folders.map((folder) => ({
          ...folder,
          ownerKey:
            folder.ownerKey && liveOwners.has(folder.ownerKey)
              ? folder.ownerKey
              : null,
        })),
        documents,
      }
    },
  })

const folderQuery = (workspaceId: string, folderId: string) =>
  queryOptions({
    ...localQuery,
    queryKey: notebookKeys.folder(workspaceId, folderId),
    queryFn: async () => {
      const ctx = notebookContext(workspaceId)
      const folders = await ctx.folders.list()
      const folder = folders.find((row) => row.id === folderId)
      if (!folder) return null
      return { folder, path: pathTo(folderId, indexFolders(folders)) }
    },
  })

const documentDetailsQuery = (workspaceId: string, documentId: string) =>
  queryOptions({
    ...localQuery,
    queryKey: notebookKeys.details(workspaceId, documentId),
    queryFn: () => documentDetails(notebookContext(workspaceId), documentId),
  })

const entityDocumentsQuery = (workspaceId: string, owner: Owner) =>
  queryOptions({
    ...localQuery,
    queryKey: notebookKeys.entity(workspaceId, owner),
    queryFn: () => entityDocuments(notebookContext(workspaceId), owner),
  })

const ownersQuery = (workspaceId: string) =>
  queryOptions({
    ...localQuery,
    queryKey: notebookKeys.owners(workspaceId),
    queryFn: () => listOwners(notebookContext(workspaceId)),
  })

export {
  ownersQuery,
  documentDetailsQuery,
  entityDocumentsQuery,
  folderQuery,
  notebookContext,
  notebookKeys,
  notebookTreeQuery,
}
