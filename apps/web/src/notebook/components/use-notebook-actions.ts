import { useNavigate, useRouter } from "@tanstack/react-router"
import { useSetAtom } from "jotai"
import { toast } from "sonner"
import { copyToClipboard } from "@layout/core/copy-to-clipboard"
import {
  useCreateFolder,
  useCreateNotebookDocument,
  useDeleteDocument,
  useDeleteFolder,
  useDuplicateDocument,
  useMoveDocument,
  useMoveFolder,
  useRenameDocument,
  useRenameFolder,
  useRestoreDeleted,
  useUndoDocumentMove,
  useUndoFolderMove,
} from "@/local-db/notebook-mutations"
import { SystemFolderMoveError } from "../use-cases"
import { expandedFoldersAtom, renamingAtom } from "./atoms"

type NotebookWorkspace = { id: string; slug: string }

const useNotebookActions = (workspace: NotebookWorkspace) => {
  const navigate = useNavigate()
  const router = useRouter()
  const setExpanded = useSetAtom(expandedFoldersAtom)
  const setRenaming = useSetAtom(renamingAtom)
  const createDocument = useCreateNotebookDocument(workspace.id)
  const createFolder = useCreateFolder(workspace.id)
  const renameFolder = useRenameFolder(workspace.id)
  const renameDocument = useRenameDocument(workspace.id)
  const moveDocument = useMoveDocument(workspace.id)
  const undoDocumentMove = useUndoDocumentMove(workspace.id)
  const moveFolder = useMoveFolder(workspace.id)
  const undoFolderMove = useUndoFolderMove(workspace.id)
  const deleteDocument = useDeleteDocument(workspace.id)
  const deleteFolder = useDeleteFolder(workspace.id)
  const restore = useRestoreDeleted(workspace.id)
  const duplicate = useDuplicateDocument(workspace.id)

  const expandAll = (folderIds: string[]) =>
    setExpanded((current) => {
      const open = current[workspace.id] ?? []
      const added = folderIds.filter((id) => !open.includes(id))
      return added.length === 0
        ? current
        : { ...current, [workspace.id]: [...open, ...added] }
    })

  const expand = (folderId: string) => expandAll([folderId])

  const collapse = (folderId: string) =>
    setExpanded((current) => ({
      ...current,
      [workspace.id]: (current[workspace.id] ?? []).filter(
        (id) => id !== folderId
      ),
    }))

  const openDocument = (documentId: string) =>
    navigate({
      to: "/$workspace/documents/$documentId",
      params: { workspace: workspace.slug, documentId },
    })

  const newDocument = async (folderId: string) => {
    const documentId = await createDocument.mutateAsync(folderId)
    expand(folderId)
    await openDocument(documentId)
  }

  const newFolder = async (parentId: string) => {
    const folder = await createFolder.mutateAsync({
      parentId,
      name: "Untitled folder",
    })
    expand(parentId)
    setRenaming({ kind: "folder", id: folder.id })
  }

  const rename = (kind: "folder" | "document", id: string, name: string) =>
    kind === "folder"
      ? renameFolder.mutateAsync({ id, name })
      : renameDocument.mutateAsync({ id, title: name })

  const moveDocumentTo = async (
    documentId: string,
    folderId: string,
    sortKey?: string
  ) => {
    const result = await moveDocument.mutateAsync({
      documentId,
      folderId,
      sortKey,
    })
    if (!result) return
    expand(folderId)
    toast(`Moved to ${result.targetLabel}`, {
      description: result.attachedLabel
        ? `Still attached to ${result.attachedLabel}`
        : undefined,
      action: {
        label: "Undo",
        onClick: () => undoDocumentMove.mutate(result.move),
      },
    })
  }

  const moveFolderTo = async (
    folderId: string,
    parentId: string,
    sortKey?: string
  ) => {
    try {
      const result = await moveFolder.mutateAsync({
        folderId,
        parentId,
        sortKey,
      })
      if (!result) return
      expand(parentId)
      toast(`Moved to ${result.targetLabel}`, {
        action: {
          label: "Undo",
          onClick: () => undoFolderMove.mutate(result.move),
        },
      })
    } catch (error) {
      toast.error(
        error instanceof SystemFolderMoveError
          ? "Areas, Goals and Activities folders stay where they are."
          : "A folder can't go inside itself."
      )
    }
  }

  const remove = async (
    kind: "folder" | "document",
    id: string,
    title: string
  ) => {
    const snapshot =
      kind === "folder"
        ? await deleteFolder.mutateAsync(id)
        : await deleteDocument.mutateAsync(id)
    if (!snapshot) return
    const count = snapshot.documents.length
    toast.success(
      kind === "folder"
        ? `Deleted ${title} and ${count} ${count === 1 ? "document" : "documents"}`
        : `Deleted ${title}`,
      { action: { label: "Undo", onClick: () => restore.mutate(snapshot) } }
    )
  }

  const duplicateDocument = async (documentId: string) => {
    const copyId = await duplicate.mutateAsync(documentId)
    if (copyId) await openDocument(copyId)
  }

  const linkTo = (kind: "folder" | "document", id: string) => {
    const { href } =
      kind === "document"
        ? router.buildLocation({
            to: "/$workspace/documents/$documentId",
            params: { workspace: workspace.slug, documentId: id },
          })
        : router.buildLocation({
            to: "/$workspace/notebook/folders/$folderId",
            params: { workspace: workspace.slug, folderId: id },
          })
    return new URL(href, document.baseURI).href
  }

  const copyLink = (kind: "folder" | "document", id: string) =>
    copyToClipboard(linkTo(kind, id), "Link")

  return {
    collapse,
    copyLink,
    duplicateDocument,
    expand,
    expandAll,
    moveDocumentTo,
    moveFolderTo,
    newDocument,
    newFolder,
    remove,
    rename,
  }
}

export { useNotebookActions }
export type { NotebookWorkspace }
