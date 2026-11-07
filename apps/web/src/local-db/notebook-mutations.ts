import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { ContentMention, EditorContent } from "@/editor/mention-index"
import type { Owner, OwnerKey } from "@/notebook/owners"
import { indexFolders, pathTo } from "@/notebook/tree"
import {
  createDocumentFor,
  describeOwnerKey,
  moveDocument,
  moveFolder,
  undoDocumentMove,
  undoFolderMove,
  type DocumentMove,
  type FolderMove,
  type NotebookContext,
  type OwnerSummary,
} from "@/notebook/use-cases"
import type { MentionSourceKey } from "./db"
import type { DeletedDocuments } from "./document-snapshots"
import { notebookContext } from "./notebook-queries"

// Notebook changes touch the tree, entity pages and backlinks, so every local query refreshes.
const useLocalMutation = <TVariables, TResult>(
  workspaceId: string,
  run: (ctx: NotebookContext, variables: TVariables) => Promise<TResult>
) => {
  const queryClient = useQueryClient()
  return useMutation({
    networkMode: "always",
    mutationFn: (variables: TVariables) =>
      run(notebookContext(workspaceId), variables),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["local-db", workspaceId] }),
  })
}

const useCreateNotebookDocument = (workspaceId: string) =>
  useLocalMutation(workspaceId, (ctx, folderId: string) =>
    ctx.documents.create({ folderId })
  )

const useCreateDocumentFor = (workspaceId: string) =>
  useLocalMutation(workspaceId, (ctx, owner: Owner) =>
    createDocumentFor(ctx, owner)
  )

const useCreateFolder = (workspaceId: string) =>
  useLocalMutation(
    workspaceId,
    (ctx, folder: { parentId: string; name: string }) =>
      ctx.folders.create(folder)
  )

const useRenameFolder = (workspaceId: string) =>
  useLocalMutation(workspaceId, (ctx, folder: { id: string; name: string }) =>
    ctx.folders.rename(folder.id, folder.name)
  )

const ownerLabel = (owner: OwnerSummary) =>
  owner.kind === "activity"
    ? `${owner.activityKey} ${owner.title}`
    : owner.title

const folderLabel = async (ctx: NotebookContext, folderId: string) => {
  const path = pathTo(folderId, indexFolders(await ctx.folders.list()))
  return path.length > 0
    ? path.map((folder) => folder.name).join(" / ")
    : "the top of the notebook"
}

const useMoveDocument = (workspaceId: string) =>
  useLocalMutation(
    workspaceId,
    async (
      ctx,
      move: { documentId: string; folderId: string; sortKey?: string }
    ) => {
      const result = await moveDocument(
        ctx,
        move.documentId,
        move.folderId,
        move.sortKey
      )
      if (!result) return null
      const attached = result.attachedOwner
        ? await describeOwnerKey(ctx, result.attachedOwner)
        : null
      return {
        move: result,
        targetLabel: await folderLabel(ctx, move.folderId),
        attachedLabel: attached ? ownerLabel(attached) : null,
      }
    }
  )

const useRenameDocument = (workspaceId: string) =>
  useLocalMutation(
    workspaceId,
    (ctx, document: { id: string; title: string }) =>
      ctx.documents.rename(document.id, document.title)
  )

const useUndoDocumentMove = (workspaceId: string) =>
  useLocalMutation(workspaceId, (ctx, move: DocumentMove) =>
    undoDocumentMove(ctx, move)
  )

const useMoveFolder = (workspaceId: string) =>
  useLocalMutation(
    workspaceId,
    async (
      ctx,
      move: { folderId: string; parentId: string; sortKey?: string }
    ) => {
      const result = await moveFolder(
        ctx,
        move.folderId,
        move.parentId,
        move.sortKey
      )
      return result
        ? { move: result, targetLabel: await folderLabel(ctx, move.parentId) }
        : null
    }
  )

const useUndoFolderMove = (workspaceId: string) =>
  useLocalMutation(workspaceId, (ctx, move: FolderMove) =>
    undoFolderMove(ctx, move)
  )

const useDeleteDocument = (workspaceId: string) =>
  useLocalMutation(workspaceId, (ctx, documentId: string) =>
    ctx.documents.delete(documentId)
  )

const useDeleteFolder = (workspaceId: string) =>
  useLocalMutation(workspaceId, (ctx, folderId: string) =>
    ctx.folders.delete(folderId)
  )

const useRestoreDeleted = (workspaceId: string) =>
  useLocalMutation(workspaceId, (ctx, snapshot: DeletedDocuments) =>
    ctx.documents.restore(snapshot)
  )

const useDuplicateDocument = (workspaceId: string) =>
  useLocalMutation(workspaceId, (ctx, documentId: string) =>
    ctx.documents.duplicate(documentId)
  )

const useSetDocumentIcon = (workspaceId: string) =>
  useLocalMutation(
    workspaceId,
    (ctx, change: { documentId: string; icon: string | null }) =>
      ctx.documents.setIcon(change.documentId, change.icon)
  )

const useAttachDocument = (workspaceId: string) =>
  useLocalMutation(
    workspaceId,
    (ctx, link: { documentId: string; ownerKey: OwnerKey }) =>
      ctx.attachments.attach(link.documentId, link.ownerKey)
  )

const useDetachDocument = (workspaceId: string) =>
  useLocalMutation(
    workspaceId,
    (ctx, link: { documentId: string; ownerKey: OwnerKey }) =>
      ctx.attachments.detach(link.documentId, link.ownerKey)
  )

const replaceMentions = (
  ctx: NotebookContext,
  sourceKey: MentionSourceKey,
  mentions: ContentMention[]
) => ctx.mentions.replaceForSource(sourceKey, mentions)

const useSaveDocumentContent = (workspaceId: string, documentId: string) =>
  useLocalMutation(workspaceId, async (ctx, content: EditorContent) => {
    await ctx.documents.saveContent(documentId, {
      title: content.title,
      excerpt: content.excerpt,
    })
    await replaceMentions(ctx, `document:${documentId}`, content.mentions)
  })

export { ownerLabel }
export {
  useAttachDocument,
  useCreateDocumentFor,
  useCreateFolder,
  useCreateNotebookDocument,
  useDeleteDocument,
  useDeleteFolder,
  useDetachDocument,
  useDuplicateDocument,
  useMoveDocument,
  useMoveFolder,
  useRenameDocument,
  useRenameFolder,
  useRestoreDeleted,
  useSaveDocumentContent,
  useSetDocumentIcon,
  useUndoDocumentMove,
  useUndoFolderMove,
}
