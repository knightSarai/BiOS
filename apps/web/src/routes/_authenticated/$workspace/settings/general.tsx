import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { isAllowed } from "@knight-os/auth/permissions"
import { useTRPC } from "@/trpc/react"
import { SettingsPage, SettingsSection } from "./-components/SettingsPage"
import { WorkspaceSettingsForm } from "./-components/WorkspaceSettingsForm"

export const Route = createFileRoute(
  "/_authenticated/$workspace/settings/general"
)({
  beforeLoad: ({ context, params }) => {
    if (!isAllowed({ workspaceSettings: ["view"] }, context.effective)) {
      throw redirect({ to: "/$workspace", params })
    }
  },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(
      context.trpc.settings.workspace.get.queryOptions({
        workspace: params.workspace,
      })
    ),
  component: WorkspaceSettingsPage,
})

function WorkspaceSettingsPage() {
  const { workspace } = Route.useParams()
  const { effective } = Route.useRouteContext()
  const trpc = useTRPC()
  const { data } = useSuspenseQuery(
    trpc.settings.workspace.get.queryOptions({ workspace })
  )

  return (
    <SettingsPage title="Workspace">
      <SettingsSection title="General">
        <WorkspaceSettingsForm
          workspace={workspace}
          initial={data}
          canUpdate={isAllowed({ workspaceSettings: ["update"] }, effective)}
        />
      </SettingsSection>
    </SettingsPage>
  )
}
