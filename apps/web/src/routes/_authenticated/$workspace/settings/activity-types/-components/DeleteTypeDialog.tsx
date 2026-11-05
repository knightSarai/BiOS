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
import { useDeleteActivityType } from "@/local-db/activity-type-mutations"

const deleteTypeOpenAtom = atom(false)

function DeleteTypeDialog({
  type,
  activityCount,
  workspace,
}: {
  type: { id: string; name: string }
  activityCount: number
  workspace: { id: string; slug: string }
}) {
  const [open, setOpen] = useAtom(deleteTypeOpenAtom)
  const navigate = useNavigate()
  const deleteType = useDeleteActivityType(workspace.id)

  const confirm = async () => {
    setOpen(false)
    try {
      await deleteType.mutateAsync(type.id)
    } catch {
      toast.error(`Couldn't delete ${type.name}.`)
      return
    }
    toast.success(`Deleted ${type.name}`)
    await navigate({
      to: "/$workspace/settings/activity-types",
      params: { workspace: workspace.slug },
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        variant="outline"
        className="self-start text-destructive"
        onClick={() => setOpen(true)}
      >
        Delete type
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {type.name}?</DialogTitle>
          <DialogDescription>
            {activityCount === 0
              ? "No activity uses this type."
              : `${activityCount === 1 ? "1 activity" : `${activityCount} activities`} will have no type, and their ${type.name} field values will be deleted.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            Cancel
          </DialogClose>
          <Button variant="destructive" onClick={() => void confirm()}>
            Delete type
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export { DeleteTypeDialog }
