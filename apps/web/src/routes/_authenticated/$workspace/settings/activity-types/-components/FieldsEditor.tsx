import { useSuspenseQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import {
  fieldKindLabels,
  kindHasOptions,
  type FieldKind,
  type FieldOption,
} from "@/activities/fields"
import { Button } from "@/components/ui/button"
import {
  useRenameField,
  useUnlinkTypeField,
} from "@/local-db/activity-type-mutations"
import { activityFieldsQuery } from "@/local-db/activity-queries"
import {
  OptionsEditor,
  RemoveOptionDialog,
} from "../../-components/OptionsEditor"
import { SettingsCard } from "../../-components/SettingsPage"
import { AddFieldMenu } from "./AddFieldMenu"
import { CommitInput } from "./CommitInput"

type TypeField = {
  id: string
  name: string
  kind: FieldKind
  options: FieldOption[]
  sourceTypeId: string
}

function FieldsEditor({
  typeId,
  fields,
  ownFieldIds,
  typeNames,
  workspace,
}: {
  typeId: string
  fields: TypeField[]
  ownFieldIds: string[]
  typeNames: Map<string, string>
  workspace: { id: string; slug: string }
}) {
  const { data: library } = useSuspenseQuery(activityFieldsQuery(workspace.id))
  const renameField = useRenameField(workspace.id)
  const unlinkField = useUnlinkTypeField(workspace.id)
  const usage = new Map(library.map((field) => [field.id, field]))
  const alsoOn = (field: TypeField) =>
    (usage.get(field.id)?.typeIds ?? [])
      .filter((id) => id !== typeId)
      .flatMap((id) => typeNames.get(id) ?? [])

  return (
    <div className="flex flex-col gap-3">
      {fields.length > 0 ? (
        <SettingsCard>
          {fields.map((field) => {
            const inherited = field.sourceTypeId !== typeId
            const linkedHere = ownFieldIds.includes(field.id)
            const sharedWith = alsoOn(field)
            return (
              <div key={field.id} className="flex flex-col gap-2 px-2 py-2">
                <div className="flex min-h-9 items-center gap-2 max-md:min-h-11">
                  {inherited ? (
                    <span className="min-w-0 flex-1 truncate px-2 text-muted-foreground">
                      {field.name}
                    </span>
                  ) : (
                    <CommitInput
                      key={field.name}
                      value={field.name}
                      label={`Name of ${field.name}`}
                      className="h-9 min-w-0 flex-1 font-medium max-md:h-11"
                      onCommit={(name) =>
                        renameField.mutateAsync({ id: field.id, name })
                      }
                    />
                  )}
                  <span className="w-24 shrink-0 text-xs text-muted-foreground">
                    {fieldKindLabels[field.kind]}
                  </span>
                  {inherited ? (
                    <Link
                      to="/$workspace/settings/activity-types/$typeId"
                      params={{
                        workspace: workspace.slug,
                        typeId: field.sourceTypeId,
                      }}
                      className="max-w-32 truncate rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground hover:bg-accent"
                    >
                      {typeNames.get(field.sourceTypeId)}
                    </Link>
                  ) : null}
                  {linkedHere ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground max-md:h-11"
                      onClick={() =>
                        unlinkField.mutate({ typeId, fieldId: field.id })
                      }
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>
                {!inherited && sharedWith.length > 0 ? (
                  <p className="px-2 text-xs text-muted-foreground">
                    Also on {sharedWith.join(", ")}
                  </p>
                ) : null}
                {!inherited && kindHasOptions(field.kind) ? (
                  <OptionsEditor
                    field={field}
                    hasValues={usage.get(field.id)?.valueCount !== 0}
                    workspaceId={workspace.id}
                  />
                ) : null}
              </div>
            )
          })}
        </SettingsCard>
      ) : (
        <p className="text-muted-foreground">No fields yet.</p>
      )}
      <div>
        <AddFieldMenu
          typeId={typeId}
          onType={new Set(fields.map((field) => field.id))}
          library={library}
          typeNames={typeNames}
          workspaceId={workspace.id}
        />
      </div>
      <RemoveOptionDialog workspaceId={workspace.id} />
    </div>
  )
}

export { FieldsEditor }
