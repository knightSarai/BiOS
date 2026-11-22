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
import { useDeleteField } from "@/local-db/activity-type-mutations"

const deleteFieldOpenAtom = atom(false)

const plural = (count: number, one: string, many: string) =>
  count === 1 ? `1 ${one}` : `${count} ${many}`

function DeleteFieldDialog({
  field,
  typeCount,
  valueCount,
  workspace,
}: {
  field: { id: string; name: string }
  typeCount: number
  valueCount: number
  workspace: { id: string; slug: string }
}) {
  const [open, setOpen] = useAtom(deleteFieldOpenAtom)
  const navigate = useNavigate()
  const deleteField = useDeleteField(workspace.id)

  const confirm = async () => {
    setOpen(false)
    try {
      await deleteField.mutateAsync(field.id)
    } catch {
      toast.error(`Couldn't delete ${field.name}.`)
      return
    }
    toast.success(`Deleted ${field.name}`)
    await navigate({
      to: "/$workspace/settings/fields",
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
        Delete field
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {field.name}?</DialogTitle>
          <DialogDescription>
            {typeCount === 0 && valueCount === 0
              ? "No type or activity uses it."
              : `It comes off ${plural(typeCount, "type", "types")}, and the values in ${plural(valueCount, "activity", "activities")} are deleted.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            Cancel
          </DialogClose>
          <Button variant="destructive" onClick={() => void confirm()}>
            Delete field
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export { DeleteFieldDialog }
