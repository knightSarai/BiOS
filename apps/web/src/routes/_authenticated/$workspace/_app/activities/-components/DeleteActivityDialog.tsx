import { useNavigate } from "@tanstack/react-router"
import { atom, useAtom } from "jotai"
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
import { useDeleteActivity } from "@/local-db/activity-mutations"

const deleteActivityDialogOpenAtom = atom<string | null>(null)

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
  const setOpen = (next: boolean) => setOpenFor(next ? activityId : null)
  const navigate = useNavigate()
  const remove = useDeleteActivity(workspace.id, activityId)

  const confirm = async () => {
    setOpen(false)
    await navigate({
      to: "/$workspace/activities",
      params: { workspace: workspace.slug },
    })
    try {
      const deleted = await remove.mutateAsync()
      if (deleted) toast.success(`Deleted ${activityKey}`)
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
