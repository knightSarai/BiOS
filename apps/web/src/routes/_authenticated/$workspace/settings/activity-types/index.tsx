import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { atom, useAtom } from "jotai"
import { ChevronRight, Plus } from "lucide-react"
import { NewTypeForm } from "@/activities/components/NewTypeForm"
import { TypeIcon } from "@/activities/components/TypeIcon"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { activityTypesQuery } from "@/local-db/activity-queries"
import {
  SettingsCard,
  SettingsPage,
  SettingsSection,
} from "../-components/SettingsPage"

const newTypeOpenAtom = atom(false)

export const Route = createFileRoute(
  "/_authenticated/$workspace/settings/activity-types/"
)({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(
      activityTypesQuery(context.workspace.id)
    ),
  component: ActivityTypesPage,
})

function ActivityTypesPage() {
  const { workspace } = Route.useRouteContext()
  const navigate = useNavigate()
  const { data: types } = useSuspenseQuery(activityTypesQuery(workspace.id))
  const [newTypeOpen, setNewTypeOpen] = useAtom(newTypeOpenAtom)

  return (
    <SettingsPage title="Activity types">
      <SettingsSection
        title="Types"
        description="A type gives its activities their own fields and status names."
      >
        <div>
          <Popover open={newTypeOpen} onOpenChange={setNewTypeOpen}>
            <PopoverTrigger render={<Button variant="outline" />}>
              <Plus data-icon="inline-start" />
              New type
            </PopoverTrigger>
            <PopoverContent align="start" className="w-80">
              <NewTypeForm
                workspaceId={workspace.id}
                onCancel={() => setNewTypeOpen(false)}
                onCreated={(type) => {
                  setNewTypeOpen(false)
                  void navigate({
                    to: "/$workspace/settings/activity-types/$typeId",
                    params: { workspace: workspace.slug, typeId: type.id },
                  })
                }}
              />
            </PopoverContent>
          </Popover>
        </div>
        {types.length === 0 ? (
          <p className="text-muted-foreground">
            No types yet. Activities without a type have status, area, goal and
            due date only.
          </p>
        ) : (
          <SettingsCard>
            {types.map((type) => (
              <Link
                key={type.id}
                to="/$workspace/settings/activity-types/$typeId"
                params={{ workspace: workspace.slug, typeId: type.id }}
                className="flex min-h-12 items-center gap-3 px-4 py-2 transition-colors hover:bg-accent max-md:min-h-14"
              >
                <TypeIcon color={type.color} className="size-4" />
                <span className="flex-1 truncate font-medium">{type.name}</span>
                <span className="text-xs text-muted-foreground">
                  {type.fields.length === 1
                    ? "1 field"
                    : `${type.fields.length} fields`}
                </span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
            ))}
          </SettingsCard>
        )}
      </SettingsSection>
    </SettingsPage>
  )
}
