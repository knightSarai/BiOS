import type {
  AttachmentRow,
  DocumentRow,
  FolderRow,
  LocalDb,
  MentionRow,
} from "./db"
import { keyBetween } from "@/notebook/sort-keys"
import { contentUpdatesTable, type ContentUpdate } from "./y-content"

type DeletedDocuments = {
  documents: Omit<DocumentRow, "content">[]
  contentUpdates: ContentUpdate[]
  attachments: AttachmentRow[]
  mentions: MentionRow[]
  folders: FolderRow[]
}

const withoutContent = (row: DocumentRow): Omit<DocumentRow, "content"> => ({
  id: row.id,
  workspaceId: row.workspaceId,
  title: row.title,
  folderId: row.folderId,
  sortKey: row.sortKey,
  icon: row.icon,
  excerpt: row.excerpt,
  journal: row.journal,
  journalKey: row.journalKey,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

// Deletes the documents and folders together so Undo can put back exactly what went away.
const deleteDocumentsWithin = (
  db: LocalDb,
  workspaceId: string,
  documentIds: string[],
  folderIds: string[] = []
) => {
  const updates = contentUpdatesTable(db, "documents")
  return db.transaction(
    "rw",
    [db.documents, db.folders, db.attachments, db.mentions, updates],
    async (): Promise<DeletedDocuments | null> => {
      const documents = (await db.documents.bulkGet(documentIds)).filter(
        (row): row is DocumentRow => row?.workspaceId === workspaceId
      )
      const folders = (await db.folders.bulkGet(folderIds)).filter(
        (row): row is FolderRow => row?.workspaceId === workspaceId
      )
      if (documents.length === 0 && folders.length === 0) return null
      const ids = documents.map((row) => row.id)
      const contentUpdates = (
        await updates.where("k").anyOf(ids).toArray()
      ).map(({ k, u, f }) => ({ k, u, f }))
      const attachments = await db.attachments
        .where("[workspaceId+documentId]")
        .anyOf(ids.map((id) => [workspaceId, id]))
        .toArray()
      const mentions = await db.mentions
        .where("[workspaceId+sourceKey]")
        .anyOf(ids.map((id) => [workspaceId, `document:${id}`]))
        .toArray()
      await updates.where("k").anyOf(ids).delete()
      await db.attachments.bulkDelete(attachments.map((row) => row.id))
      await db.mentions.bulkDelete(mentions.map((row) => row.id))
      await db.documents.bulkDelete(ids)
      await db.folders.bulkDelete(folders.map((row) => row.id))
      return {
        documents: documents.map(withoutContent),
        contentUpdates,
        attachments,
        mentions,
        folders,
      }
    }
  )
}

const restoreDocuments = (
  db: LocalDb,
  workspaceId: string,
  snapshot: DeletedDocuments
) => {
  const updates = contentUpdatesTable(db, "documents")
  const belongs = [...snapshot.documents, ...snapshot.folders].every(
    (row) => row.workspaceId === workspaceId
  )
  if (!belongs) return Promise.resolve(false)
  return db.transaction(
    "rw",
    [db.documents, db.folders, db.attachments, db.mentions, updates],
    async () => {
      const ids = snapshot.documents.map((row) => row.id)
      const restoredIds = new Set([
        ...ids,
        ...snapshot.folders.map((row) => row.id),
      ])
      // Something created meanwhile may hold the old sort key; a restored item then moves to the end.
      const freeKey = <T extends { sortKey: string }>(
        row: T,
        siblings: { id: string; sortKey: string }[]
      ) => {
        const others = siblings.filter(
          (sibling) => !restoredIds.has(sibling.id)
        )
        if (!others.some((sibling) => sibling.sortKey === row.sortKey))
          return row
        const last = others.reduce<string | null>(
          (max, sibling) =>
            max === null || sibling.sortKey > max ? sibling.sortKey : max,
          null
        )
        return { ...row, sortKey: keyBetween(last, null) }
      }
      const folders = await Promise.all(
        snapshot.folders.map(async (row) =>
          freeKey(
            row,
            await db.folders
              .where("[workspaceId+parentId]")
              .equals([workspaceId, row.parentId])
              .toArray()
          )
        )
      )
      const documents = await Promise.all(
        snapshot.documents.map(async (row) =>
          freeKey(
            row,
            await db.documents
              .where("[workspaceId+folderId]")
              .equals([workspaceId, row.folderId])
              .toArray()
          )
        )
      )
      await updates.where("k").anyOf(ids).delete()
      await db.folders.bulkPut(folders)
      await db.documents.bulkPut(documents)
      await updates.bulkAdd(snapshot.contentUpdates)
      await db.attachments.bulkPut(snapshot.attachments)
      await db.mentions.bulkPut(snapshot.mentions)
      return true
    }
  )
}

export { deleteDocumentsWithin, restoreDocuments }
export type { DeletedDocuments }
