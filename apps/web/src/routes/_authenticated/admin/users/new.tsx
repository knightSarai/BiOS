import { createFileRoute } from "@tanstack/react-router"
import { Page } from "@layout/content/Page"
import { CreateUserForm } from "./-components/CreateUserForm"

export const Route = createFileRoute("/_authenticated/admin/users/new")({
  staticData: { crumb: { label: "New user" } },
  component: NewUserPage,
})

function NewUserPage() {
  return (
    <Page.Layout>
      <Page.Header>
        <Page.HeaderContent>
          <Page.Title>Create a user</Page.Title>
          <Page.Subtitle>
            Share the password with them. They can change it later with
            “Forgot password”.
          </Page.Subtitle>
        </Page.HeaderContent>
      </Page.Header>
      <Page.Body>
        <Page.ScrollArea>
          <Page.Content>
            <CreateUserForm />
          </Page.Content>
        </Page.ScrollArea>
      </Page.Body>
    </Page.Layout>
  )
}
