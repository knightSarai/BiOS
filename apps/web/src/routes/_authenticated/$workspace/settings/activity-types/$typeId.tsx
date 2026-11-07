import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { ColorPicker } from "@/activities/components/ColorPicker"
import { TypeIcon } from "@/activities/components/TypeIcon"
import { NotFound } from "@/components/common/NotFound"
import { useUpdateActivityType } from "@/local-db/activity-type-mutations"
import { activityTypeQuery } from "@/local-db/activity-queries"
import { SettingsPage, SettingsSection } from "../-components/SettingsPage"
import { CommitInput } from "./-components/CommitInput"
import { DeleteTypeDialog } from "./-components/DeleteTypeDialog"
import { FieldsEditor } from "./-components/FieldsEditor"
import { StatusNamesEditor } from "./-components/StatusNamesEditor"

export const Route = createFileRoute(
  "/_authenticated/$workspace/settings/activity-types/$typeId"
)({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(
      activityTypeQuery(context.workspace.id, params.typeId)
    ),
  component: ActivityTypePage,
})

function ActivityTypePage() {
  const { workspace } = Route.useRouteContext()
  const { typeId } = Route.useParams()
  const { data } = useSuspenseQuery(activityTypeQuery(workspace.id, typeId))
  const updateType = useUpdateActivityType(workspace.id)

  if (!data) {
    return (
      <NotFound className="flex-1 py-20">
        <NotFound.Title>Type not found</NotFound.Title>
        <NotFound.Description>It may have been deleted.</NotFound.Description>
      </NotFound>
    )
  }
  const { type, fields, activityCount } = data

  return (
    <SettingsPage title={type.name}>
      <SettingsSection
        title="Name and colour"
        description={
          activityCount === 1
            ? "1 activity uses this type."
            : `${activityCount} activities use this type.`
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <TypeIcon color={type.color} className="size-5" />
          <CommitInput
            key={type.name}
            value={type.name}
            label="Type name"
            className="h-10 flex-1 border text-base font-medium"
            onCommit={(name) =>
              updateType.mutate({ id: type.id, changes: { name } })
            }
          />
          <ColorPicker
            value={type.color}
            onChange={(color) =>
              updateType.mutate({ id: type.id, changes: { color } })
            }
          />
        </div>
      </SettingsSection>
      <SettingsSection
        title="Fields"
        description="Every field shows when you create an activity of this type."
      >
        <FieldsEditor
          typeId={type.id}
          fields={fields}
          activityCount={activityCount}
          workspaceId={workspace.id}
        />
      </SettingsSection>
      <SettingsSection
        title="Status names"
        description="Rename the five statuses for this type. Leave one empty to keep the usual name."
      >
        <StatusNamesEditor
          typeId={type.id}
          statusNames={type.statusNames}
          workspaceId={workspace.id}
        />
      </SettingsSection>
      <DeleteTypeDialog
        type={type}
        activityCount={activityCount}
        workspace={workspace}
      />
    </SettingsPage>
  )
}
