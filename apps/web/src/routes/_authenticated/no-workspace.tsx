import { useMutation } from "@tanstack/react-query"
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"
import { authClient } from "@knight-os/auth/client"
import { AuthShell } from "@/components/auth/AuthShell"
import { Button } from "@/components/ui/button"

export const Route = createFileRoute("/_authenticated/no-workspace")({
  beforeLoad: async ({ context }) => {
    const workspaces = await context.queryClient.ensureQueryData(
      context.trpc.workspaces.list.queryOptions()
    )
    const [first] = workspaces
    if (first) {
      throw redirect({ to: "/$workspace", params: { workspace: first.slug } })
    }
  },
  component: NoWorkspace,
})

function NoWorkspace() {
  const { auth } = Route.useRouteContext()
  const navigate = useNavigate()

  const signOut = useMutation({
    mutationFn: () => authClient.signOut(),
    onSuccess: () => navigate({ to: "/sign-in", reloadDocument: true }),
  })

  return (
    <AuthShell
      title="No workspace yet"
      description={`You're signed in as ${auth.user.email}.`}
    >
      <div className="flex flex-col gap-5 text-center">
        <p className="text-sm text-muted-foreground">
          Workspaces are set up by an admin. Once one is created with you as
          its owner, it will open here.
        </p>
        <Button
          variant="outline"
          size="lg"
          disabled={signOut.isPending}
          onClick={() => signOut.mutate()}
        >
          Sign out
        </Button>
      </div>
    </AuthShell>
  )
}
