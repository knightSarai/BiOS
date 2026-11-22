import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { fieldKindLabels, kindHasOptions } from "@/activities/fields"
import { TypeIcon } from "@/activities/components/TypeIcon"
import { NotFound } from "@/components/common/NotFound"
import { useRenameField } from "@/local-db/activity-type-mutations"
import {
  activityFieldQuery,
  activityTypesQuery,
} from "@/local-db/activity-queries"
import { CommitInput } from "../activity-types/-components/CommitInput"
import { OptionsEditor, RemoveOptionDialog } from "../-components/OptionsEditor"
import { SettingsPage, SettingsSection } from "../-components/SettingsPage"
import { DeleteFieldDialog } from "./-components/DeleteFieldDialog"

export const Route = createFileRoute(
  "/_authenticated/$workspace/settings/fields/$fieldId"
)({
  loader: ({ context, params }) =>
    Promise.all([
      // Fresh, since a stale zero would let an option go without the confirm.
      context.queryClient.fetchQuery(
        activityFieldQuery(context.workspace.id, params.fieldId)
      ),
      context.queryClient.ensureQueryData(
        activityTypesQuery(context.workspace.id)
      ),
    ]),
  component: FieldPage,
})

function FieldPage() {
  const { workspace } = Route.useRouteContext()
  const { fieldId } = Route.useParams()
  const { data } = useSuspenseQuery(activityFieldQuery(workspace.id, fieldId))
  const { data: types } = useSuspenseQuery(activityTypesQuery(workspace.id))
  const renameField = useRenameField(workspace.id)

  if (!data) {
    return (
      <NotFound className="flex-1 py-20">
        <NotFound.Title>Field not found</NotFound.Title>
        <NotFound.Description>It may have been deleted.</NotFound.Description>
      </NotFound>
    )
  }
  const { field, typeIds, valueCount } = data
  const linkedTypes = types.filter((type) => typeIds.includes(type.id))

  return (
    <SettingsPage title={field.name}>
      <SettingsSection
        title="Name"
        description={`${fieldKindLabels[field.kind]} field. ${valueCount === 1 ? "1 activity has" : `${valueCount} activities have`} a value.`}
      >
        <CommitInput
          key={field.name}
          value={field.name}
          label="Field name"
          className="h-10 border text-base font-medium"
          onCommit={(name) => renameField.mutateAsync({ id: field.id, name })}
        />
      </SettingsSection>
      {kindHasOptions(field.kind) ? (
        <SettingsSection title="Options">
          <OptionsEditor
            field={field}
            hasValues={valueCount > 0}
            workspaceId={workspace.id}
          />
          <RemoveOptionDialog workspaceId={workspace.id} />
        </SettingsSection>
      ) : null}
      <SettingsSection
        title="Types"
        description="Subtypes of these types have the field too."
      >
        {linkedTypes.length === 0 ? (
          <p className="text-muted-foreground">No type has this field.</p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {linkedTypes.map((type) => (
              <Link
                key={type.id}
                to="/$workspace/settings/activity-types/$typeId"
                params={{ workspace: workspace.slug, typeId: type.id }}
                className="flex min-h-8 items-center gap-2 rounded-md border px-2 hover:bg-accent max-md:min-h-11"
              >
                <TypeIcon color={type.color} />
                {type.name}
              </Link>
            ))}
          </div>
        )}
      </SettingsSection>
      <DeleteFieldDialog
        field={field}
        typeCount={typeIds.length}
        valueCount={valueCount}
        workspace={workspace}
      />
    </SettingsPage>
  )
}
