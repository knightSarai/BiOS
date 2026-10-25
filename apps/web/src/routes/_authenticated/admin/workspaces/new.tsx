import { createFileRoute } from "@tanstack/react-router"
import { Page } from "@layout/content/Page"
import { CreateWorkspaceForm } from "./-components/CreateWorkspaceForm"

export const Route = createFileRoute("/_authenticated/admin/workspaces/new")({
  staticData: { crumb: { label: "New workspace" } },
  component: NewWorkspacePage,
})

function NewWorkspacePage() {
  return (
    <Page.Layout>
      <Page.Header>
        <Page.HeaderContent>
          <Page.Title>Create a workspace</Page.Title>
          <Page.Subtitle>
            The owner is added as the first member and can manage it from
            there.
          </Page.Subtitle>
        </Page.HeaderContent>
      </Page.Header>
      <Page.Body>
        <Page.ScrollArea>
          <Page.Content>
            <CreateWorkspaceForm />
          </Page.Content>
        </Page.ScrollArea>
      </Page.Body>
    </Page.Layout>
  )
}
