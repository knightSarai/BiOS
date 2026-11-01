import { useQuery } from "@tanstack/react-query"
import { useNavigate, useParams } from "@tanstack/react-router"
import { useAtom } from "jotai"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { notebookTreeQuery } from "@/local-db/notebook-queries"
import { indexFolders, isSameOrInside } from "../tree"
import { deletingAtom } from "./atoms"
import {
  useNotebookActions,
  type NotebookWorkspace,
} from "./use-notebook-actions"

function DeleteNotebookItemDialog({
  workspace,
}: {
  workspace: NotebookWorkspace
}) {
  const [deleting, setDeleting] = useAtom(deletingAtom)
  const params = useParams({ strict: false })
  const navigate = useNavigate()
  const actions = useNotebookActions(workspace)
  const { data } = useQuery(notebookTreeQuery(workspace.id))

  const confirm = async () => {
    if (!deleting) return
    const { kind, id, title } = deleting
    setDeleting(null)
    const byId = indexFolders(data?.folders ?? [])
    const openFolderId =
      params.folderId ??
      data?.documents.find((row) => row.id === params.documentId)?.folderId
    const isOpen =
      (kind === "document" && params.documentId === id) ||
      (kind === "folder" &&
        openFolderId !== undefined &&
        isSameOrInside(openFolderId, id, byId))
    if (isOpen) {
      await navigate({
        to: "/$workspace/notebook",
        params: { workspace: workspace.slug },
      })
    }
    try {
      await actions.remove(kind, id, title)
    } catch {
      toast.error(`Couldn't delete ${title}.`)
    }
  }

  return (
    <Dialog
      open={deleting !== null}
      onOpenChange={(open) => !open && setDeleting(null)}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {deleting?.title}?</DialogTitle>
          <DialogDescription>
            {deleting?.kind === "folder"
              ? "This removes the folder, its subfolders and every document in them from this device."
              : "This removes the document from this device. Links to it will show it as deleted."}{" "}
            You can undo it right after.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            Cancel
          </DialogClose>
          <Button variant="destructive" onClick={() => void confirm()}>
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export { DeleteNotebookItemDialog }
