import { atom, useAtom } from "jotai"
import { Plus, X } from "lucide-react"
import {
  FIELD_KINDS,
  fieldKindLabels,
  kindHasOptions,
} from "@/activities/fields"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  useAddTypeField,
  useRemoveTypeField,
  useChangeFieldOption,
  useRenameTypeField,
} from "@/local-db/activity-type-mutations"
import type { ActivityTypeFieldRow } from "@/local-db/db"
import { SettingsCard } from "../../-components/SettingsPage"
import { CommitInput } from "./CommitInput"

const removingFieldAtom = atom<ActivityTypeFieldRow | null>(null)

function OptionsEditor({
  field,
  workspaceId,
}: {
  field: ActivityTypeFieldRow
  workspaceId: string
}) {
  const changeOption = useChangeFieldOption(workspaceId)

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
            aria-label={`Remove option ${option.label}`}
            onClick={() =>
              changeOption.mutate({
                action: "remove",
                fieldId: field.id,
                optionId: option.id,
              })
            }
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

function RemoveFieldDialog({
  workspaceId,
  activityCount,
}: {
  workspaceId: string
  activityCount: number
}) {
  const [field, setField] = useAtom(removingFieldAtom)
  const removeField = useRemoveTypeField(workspaceId)

  return (
    <Dialog
      open={field !== null}
      onOpenChange={(open) => {
        if (!open) setField(null)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove {field?.name}?</DialogTitle>
          <DialogDescription>
            {activityCount === 0
              ? "No activity uses this type yet."
              : `Its values in ${activityCount === 1 ? "1 activity" : `${activityCount} activities`} will be deleted.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            Cancel
          </DialogClose>
          <Button
            variant="destructive"
            onClick={() => {
              if (field) removeField.mutate(field.id)
              setField(null)
            }}
          >
            Remove field
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function FieldsEditor({
  typeId,
  fields,
  activityCount,
  workspaceId,
}: {
  typeId: string
  fields: ActivityTypeFieldRow[]
  activityCount: number
  workspaceId: string
}) {
  const addField = useAddTypeField(workspaceId)
  const renameField = useRenameTypeField(workspaceId)
  const [, setRemoving] = useAtom(removingFieldAtom)

  return (
    <div className="flex flex-col gap-3">
      {fields.length > 0 ? (
        <SettingsCard>
          {fields.map((field) => (
            <div key={field.id} className="flex flex-col gap-2 px-2 py-2">
              <div className="flex items-center gap-2">
                <CommitInput
                  key={field.name}
                  value={field.name}
                  label={`Name of ${field.name}`}
                  className="h-9 flex-1 font-medium max-md:h-11"
                  onCommit={(name) =>
                    renameField.mutate({ id: field.id, name })
                  }
                />
                <span className="w-32 text-xs text-muted-foreground">
                  {fieldKindLabels[field.kind]}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${field.name}`}
                  className="max-md:size-11"
                  onClick={() => setRemoving(field)}
                >
                  <X />
                </Button>
              </div>
              {kindHasOptions(field.kind) ? (
                <OptionsEditor field={field} workspaceId={workspaceId} />
              ) : null}
            </div>
          ))}
        </SettingsCard>
      ) : (
        <p className="text-muted-foreground">No fields yet.</p>
      )}
      <div>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" />}>
            <Plus data-icon="inline-start" />
            Add field
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Field kind</DropdownMenuLabel>
              {FIELD_KINDS.map((kind) => (
                <DropdownMenuItem
                  key={kind}
                  className="min-h-8 max-md:min-h-11"
                  onClick={() =>
                    addField.mutate({
                      typeId,
                      kind,
                      name: fieldKindLabels[kind],
                    })
                  }
                >
                  {fieldKindLabels[kind]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <RemoveFieldDialog
        workspaceId={workspaceId}
        activityCount={activityCount}
      />
    </div>
  )
}

export { FieldsEditor }
