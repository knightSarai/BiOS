import { useId } from "react"
import { atom, useAtom, useSetAtom } from "jotai"
import { Plus, X } from "lucide-react"
import {
  FIELD_KINDS,
  fieldKindLabels,
  kindHasOptions,
  type FieldKind,
} from "@/activities/fields"
import { FieldErrorText } from "@/components/forms/FieldErrorText"
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

type DraftField = {
  id: string
  typeId: string
  kind: FieldKind
  error: string | null
}

// Unsaved until named: the repository rejects empty field names.
const draftFieldAtom = atom<DraftField | null>(null)

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
            className="max-md:size-11"
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

function DraftFieldRow({
  draft,
  workspaceId,
}: {
  draft: DraftField
  workspaceId: string
}) {
  const setDraft = useSetAtom(draftFieldAtom)
  const addField = useAddTypeField(workspaceId)
  const errorId = useId()
  const kindLabel = fieldKindLabels[draft.kind]
  // Updates only touch this draft, so a save that lands late can't wipe a newer pick.
  const updateThisDraft = (next: (current: DraftField) => DraftField | null) =>
    setDraft((current) => (current?.id === draft.id ? next(current) : current))

  return (
    <div
      className="flex flex-col gap-1 px-2 py-2"
      // Saves when focus leaves the whole row, so moving to × discards but tabbing past it saves.
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return
        const name =
          event.currentTarget.querySelector("input")?.value.trim() ?? ""
        if (!name) {
          updateThisDraft((current) => ({
            ...current,
            error: "Give the field a name.",
          }))
          return
        }
        if (addField.isPending) return
        // mutateAsync settles even if the row unmounts first, unlike mutate's callbacks.
        addField
          .mutateAsync({ typeId: draft.typeId, kind: draft.kind, name })
          .then(
            () => updateThisDraft(() => null),
            () =>
              updateThisDraft((current) => ({
                ...current,
                error: "Couldn't save the field. Try again.",
              }))
          )
      }}
    >
      <div className="flex items-center gap-2">
        <input
          autoFocus
          aria-label={`Name of the new ${kindLabel.toLowerCase()} field`}
          aria-invalid={draft.error ? true : undefined}
          aria-describedby={draft.error ? errorId : undefined}
          placeholder="Field name"
          dir="auto"
          onChange={() => {
            if (draft.error)
              updateThisDraft((current) => ({ ...current, error: null }))
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              event.currentTarget.blur()
            }
            if (event.key === "Escape") {
              event.preventDefault()
              updateThisDraft(() => null)
            }
          }}
          className="h-9 min-w-0 flex-1 rounded-md bg-transparent px-2 font-medium outline-none placeholder:font-normal placeholder:text-muted-foreground hover:bg-accent focus:bg-background focus:ring-2 focus:ring-ring/30 aria-invalid:ring-2 aria-invalid:ring-destructive/40 max-md:h-11"
        />
        <span className="w-32 text-xs text-muted-foreground">{kindLabel}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Discard the new ${kindLabel.toLowerCase()} field`}
          className="max-md:size-11"
          // Safari doesn't focus buttons on click, so without this the row would lose focus and save first.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => updateThisDraft(() => null)}
        >
          <X />
        </Button>
      </div>
      {draft.error ? (
        <div id={errorId} className="px-2">
          <FieldErrorText errors={[draft.error]} />
        </div>
      ) : null}
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
  const renameField = useRenameTypeField(workspaceId)
  const [, setRemoving] = useAtom(removingFieldAtom)
  const [draftField, setDraft] = useAtom(draftFieldAtom)
  const draft = draftField?.typeId === typeId ? draftField : null

  return (
    <div className="flex flex-col gap-3">
      {fields.length > 0 || draft ? (
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
          {draft ? (
            <DraftFieldRow
              key={draft.id}
              draft={draft}
              workspaceId={workspaceId}
            />
          ) : null}
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
                    setDraft({
                      id: crypto.randomUUID(),
                      typeId,
                      kind,
                      error: null,
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
