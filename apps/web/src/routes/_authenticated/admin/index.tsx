import { createFileRoute } from "@tanstack/react-router"
import { Page } from "@layout/content/Page"

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminDashboard,
})

function AdminDashboard() {
  return (
    <Page.Layout>
      <Page.Header>
        <Page.HeaderContent>
          <Page.Title>Admin</Page.Title>
        </Page.HeaderContent>
      </Page.Header>
      <Page.Body>
        <Page.ScrollArea>
          <p className="px-4 pt-1 pb-12 text-muted-foreground md:px-8">
            Manage the people who use this Knight OS instance.
          </p>
        </Page.ScrollArea>
      </Page.Body>
    </Page.Layout>
  )
}
