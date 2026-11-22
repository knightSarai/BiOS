import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { ChevronRight } from "lucide-react"
import { fieldKindLabels } from "@/activities/fields"
import {
  activityFieldsQuery,
  activityTypesQuery,
} from "@/local-db/activity-queries"
import {
  SettingsCard,
  SettingsPage,
  SettingsSection,
} from "../-components/SettingsPage"
import { NewFieldButton } from "./-components/NewFieldButton"

export const Route = createFileRoute(
  "/_authenticated/$workspace/settings/fields/"
)({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(
        activityFieldsQuery(context.workspace.id)
      ),
      context.queryClient.ensureQueryData(
        activityTypesQuery(context.workspace.id)
      ),
    ]),
  component: FieldsPage,
})

function FieldsPage() {
  const { workspace } = Route.useRouteContext()
  const { data: fields } = useSuspenseQuery(activityFieldsQuery(workspace.id))
  const { data: types } = useSuspenseQuery(activityTypesQuery(workspace.id))
  const typeNames = new Map(types.map((type) => [type.id, type.name]))

  return (
    <SettingsPage title="Fields">
      <SettingsSection
        title="All fields"
        description="Put a field on any number of types. Activities keep their values when a field leaves a type."
      >
        <div>
          <NewFieldButton workspace={workspace} />
        </div>
        {fields.length === 0 ? (
          <p className="text-muted-foreground">No fields yet.</p>
        ) : (
          <SettingsCard>
            {fields.map((field) => (
              <Link
                key={field.id}
                to="/$workspace/settings/fields/$fieldId"
                params={{ workspace: workspace.slug, fieldId: field.id }}
                className="flex min-h-12 items-center gap-3 px-4 py-2 transition-colors hover:bg-accent max-md:min-h-14"
              >
                <span className="min-w-0 flex-1 truncate font-medium">
                  {field.name}
                </span>
                <span className="w-24 shrink-0 text-xs text-muted-foreground max-sm:hidden">
                  {fieldKindLabels[field.kind]}
                </span>
                <span className="max-w-48 truncate text-xs text-muted-foreground">
                  {field.typeIds.length === 0
                    ? "No type"
                    : field.typeIds
                        .flatMap((id) => typeNames.get(id) ?? [])
                        .join(", ")}
                </span>
                <span className="w-20 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                  {field.valueCount === 1
                    ? "1 value"
                    : `${field.valueCount} values`}
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </SettingsCard>
        )}
      </SettingsSection>
    </SettingsPage>
  )
}
