import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { ColorPicker } from "@/activities/components/ColorPicker"
import { TimerConfigEditor } from "@/activities/components/TimerConfigEditor"
import { TypeIconPicker } from "@/activities/components/TypeIconPicker"
import { DEFAULT_TIMER } from "@/activities/timer"
import { NotFound } from "@/components/common/NotFound"
import { useUpdateActivityType } from "@/local-db/activity-type-mutations"
import {
  activityFieldsQuery,
  activityTypeQuery,
  activityTypesQuery,
} from "@/local-db/activity-queries"
import { SettingsPage, SettingsSection } from "../-components/SettingsPage"
import { CommitInput } from "./-components/CommitInput"
import { DeleteTypeDialog } from "./-components/DeleteTypeDialog"
import { FieldsEditor } from "./-components/FieldsEditor"
import { TypePlacement } from "./-components/TypePlacement"
import { StatusNamesEditor } from "./-components/StatusNamesEditor"

export const Route = createFileRoute(
  "/_authenticated/$workspace/settings/activity-types/$typeId"
)({
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(
        activityTypeQuery(context.workspace.id, params.typeId)
      ),
      context.queryClient.ensureQueryData(
        activityTypesQuery(context.workspace.id)
      ),
      // Fresh, since a stale zero would let an option go without the confirm.
      context.queryClient.fetchQuery(activityFieldsQuery(context.workspace.id)),
    ]),
  component: ActivityTypePage,
})

function ActivityTypePage() {
  const { workspace } = Route.useRouteContext()
  const { typeId } = Route.useParams()
  const { data } = useSuspenseQuery(activityTypeQuery(workspace.id, typeId))
  const { data: types } = useSuspenseQuery(activityTypesQuery(workspace.id))
  const updateType = useUpdateActivityType(workspace.id)

  if (!data) {
    return (
      <NotFound className="flex-1 py-20">
        <NotFound.Title>Type not found</NotFound.Title>
        <NotFound.Description>It may have been deleted.</NotFound.Description>
      </NotFound>
    )
  }
  const { type, fields, ownFieldIds, activityCount } = data
  const typeNames = new Map(types.map((entry) => [entry.id, entry.name]))
  const subtypes = types.filter((entry) => entry.parentId === type.id)

  return (
    <SettingsPage title={type.name}>
      <SettingsSection
        title="Name, icon and colour"
        description={
          activityCount === 1
            ? "1 activity uses this type."
            : `${activityCount} activities use this type.`
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <TypeIconPicker
            type={type}
            onChange={(icon) =>
              updateType.mutate({ id: type.id, changes: { icon } })
            }
          />
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
      <SettingsSection title="Parent and subtypes">
        <TypePlacement type={type} types={types} workspace={workspace} />
      </SettingsSection>
      <SettingsSection
        title="Fields"
        description="Every field shows when you create an activity of this type."
      >
        <FieldsEditor
          typeId={type.id}
          fields={fields}
          ownFieldIds={ownFieldIds}
          typeNames={typeNames}
          workspace={workspace}
        />
      </SettingsSection>
      <SettingsSection
        title="Timer"
        description="Every activity of this type starts with this timer. An activity can change its own."
      >
        <TimerConfigEditor
          config={type.timer ?? DEFAULT_TIMER}
          onChange={(timer) =>
            updateType.mutate({ id: type.id, changes: { timer } })
          }
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
        subtypes={subtypes}
        activityCount={activityCount}
        workspace={workspace}
      />
    </SettingsPage>
  )
}
