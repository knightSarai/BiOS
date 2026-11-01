import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { atom, useAtom } from "jotai"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useDeleteActivity } from "@/local-db/activity-mutations"
import {
  useDeleteFolder,
  useRestoreDeleted,
} from "@/local-db/notebook-mutations"
import { entityDocumentsQuery } from "@/local-db/notebook-queries"

const deleteActivityDialogOpenAtom = atom<string | null>(null)
const deleteFolderTooAtom = atom(false)

type DeleteActivityDialogProps = {
  activityId: string
  activityKey: string
  workspace: { id: string; slug: string }
}

function DeleteActivityDialog({
  activityId,
  activityKey,
  workspace,
}: DeleteActivityDialogProps) {
  const [openFor, setOpenFor] = useAtom(deleteActivityDialogOpenAtom)
  const open = openFor === activityId
  const [deleteFolderToo, setDeleteFolderToo] = useAtom(deleteFolderTooAtom)
  const setOpen = (next: boolean) => {
    setOpenFor(next ? activityId : null)
    if (!next) setDeleteFolderToo(false)
  }
  const navigate = useNavigate()
  const remove = useDeleteActivity(workspace.id, activityId)
  const deleteFolder = useDeleteFolder(workspace.id)
  const restoreFolder = useRestoreDeleted(workspace.id)
  const { data: documents } = useQuery({
    ...entityDocumentsQuery(workspace.id, { kind: "activity", id: activityId }),
    enabled: open,
  })
  const folder = documents?.folder ?? null
  const documentCount = documents?.inFolder.length ?? 0

  const removeFolder = (folderId: string | null) =>
    folderId ? deleteFolder.mutateAsync(folderId) : Promise.resolve(null)

  const announce = (
    folderSnapshot: Awaited<ReturnType<typeof removeFolder>>
  ) => {
    if (!folderSnapshot) {
      toast.success(`Deleted ${activityKey}`)
      return
    }
    toast.success(`Deleted ${activityKey} and its folder`, {
      action: {
        label: "Restore folder",
        onClick: () => restoreFolder.mutate(folderSnapshot),
      },
    })
  }

  const confirm = async () => {
    setOpen(false)
    const folderToDelete = deleteFolderToo ? (folder?.id ?? null) : null
    await navigate({
      to: "/$workspace/activities",
      params: { workspace: workspace.slug },
    })
    try {
      const deleted = await remove.mutateAsync()
      const folderSnapshot = await removeFolder(folderToDelete)
      if (deleted) announce(folderSnapshot)
    } catch {
      toast.error(`Couldn't delete ${activityKey}.`)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {activityKey}?</DialogTitle>
          <DialogDescription>
            This removes the activity and its page from this device. Lines in
            documents that point to it will show it as deleted.
          </DialogDescription>
        </DialogHeader>
        {folder ? (
          <label className="flex items-start gap-2.5 rounded-md border p-3 text-sm">
            <Checkbox
              checked={deleteFolderToo}
              onCheckedChange={(checked) =>
                setDeleteFolderToo(checked === true)
              }
              className="mt-0.5"
            />
            <span className="flex flex-col gap-0.5">
              <span>Also delete its documents folder</span>
              <span className="text-xs text-muted-foreground">
                {documentCount === 1
                  ? "1 document"
                  : `${documentCount} documents`}{" "}
                in Notebook / {documents?.folderPath.join(" / ")}. Unticked, the
                folder stays in the notebook.
              </span>
            </span>
          </label>
        ) : null}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            Cancel
          </DialogClose>
          <Button variant="destructive" onClick={confirm}>
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export { DeleteActivityDialog, deleteActivityDialogOpenAtom }
