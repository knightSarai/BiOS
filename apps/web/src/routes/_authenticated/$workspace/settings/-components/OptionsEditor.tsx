import { useQuery } from "@tanstack/react-query"
import { atom, useAtom, useSetAtom } from "jotai"
import { X } from "lucide-react"
import type { FieldOption } from "@/activities/fields"
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
import { useChangeFieldOption } from "@/local-db/activity-type-mutations"
import { optionValueCountQuery } from "@/local-db/activity-queries"
import { CommitInput } from "../activity-types/-components/CommitInput"

type OptionsField = { id: string; name: string; options: FieldOption[] }

type PendingRemoval = {
  open: boolean
  field: OptionsField
  option: FieldOption
}

// Kept after closing so the dialog's text doesn't blank out while it animates away.
const pendingRemovalAtom = atom<PendingRemoval | null>(null)

// A field holding no values loses an option at once; otherwise the dialog shows what goes.
function OptionsEditor({
  field,
  hasValues,
  workspaceId,
}: {
  field: OptionsField
  hasValues: boolean
  workspaceId: string
}) {
  const changeOption = useChangeFieldOption(workspaceId)
  const setPending = useSetAtom(pendingRemovalAtom)

  return (
    <div className="flex flex-wrap items-center gap-1.5 pl-2">
      {field.options.map((option) => (
        <span
          key={option.id}
          className="flex h-8 items-center rounded-md border pr-1 max-md:h-11"
        >
          <CommitInput
            key={option.label}
            value={option.label}
            label={`Option ${option.label}`}
            className="h-full w-28 text-sm"
            onCommit={(label) =>
              changeOption.mutate({
                action: "rename",
                fieldId: field.id,
                optionId: option.id,
                label,
              })
            }
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="max-md:size-11"
            aria-label={`Remove option ${option.label}`}
            onClick={() => {
              if (hasValues) {
                setPending({ open: true, field, option })
                return
              }
              changeOption.mutate({
                action: "remove",
                fieldId: field.id,
                optionId: option.id,
              })
            }}
          >
            <X />
          </Button>
        </span>
      ))}
      <input
        aria-label={`Add an option to ${field.name}`}
        placeholder="+ Add option"
        dir="auto"
        onKeyDown={(event) => {
          if (event.key !== "Enter") return
          event.preventDefault()
          const label = event.currentTarget.value.trim()
          if (!label) return
          changeOption.mutate({ action: "add", fieldId: field.id, label })
          event.currentTarget.value = ""
        }}
        className="h-8 w-32 rounded-md bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground hover:bg-accent focus:bg-background focus:ring-2 focus:ring-ring/30 max-md:h-11"
      />
    </div>
  )
}

function RemoveOptionDialog({ workspaceId }: { workspaceId: string }) {
  const [pending, setPending] = useAtom(pendingRemovalAtom)
  const changeOption = useChangeFieldOption(workspaceId)
  const { data: count, isFetching } = useQuery({
    ...optionValueCountQuery(
      workspaceId,
      pending?.field.id ?? "",
      pending?.option.id ?? ""
    ),
    enabled: pending?.open ?? false,
  })

  return (
    <Dialog
      open={pending?.open ?? false}
      onOpenChange={(open) => {
        if (!open && pending) setPending({ ...pending, open: false })
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Remove {pending?.option.label} from {pending?.field.name}?
          </DialogTitle>
          <DialogDescription>
            {count === undefined
              ? "Counting the activities that use it…"
              : count === 0
                ? "No activity uses it."
                : `${count === 1 ? "1 activity loses" : `${count} activities lose`} this option, on every type with ${pending?.field.name}.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            Cancel
          </DialogClose>
          <Button
            variant="destructive"
            disabled={count === undefined || isFetching}
            onClick={() => {
              if (!pending) return
              changeOption.mutate({
                action: "remove",
                fieldId: pending.field.id,
                optionId: pending.option.id,
              })
              setPending({ ...pending, open: false })
            }}
          >
            Remove option
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export { OptionsEditor, RemoveOptionDialog }
