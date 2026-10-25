import { createFileRoute } from "@tanstack/react-router"
import { Page } from "@layout/content/Page"

export const Route = createFileRoute("/_authenticated/admin/$")({
  component: AdminPlaceholder,
})

function AdminPlaceholder() {
  return (
    <Page.Layout>
      <Page.Header>
        <Page.HeaderContent>
          <Page.Title>Coming Soon</Page.Title>
        </Page.HeaderContent>
      </Page.Header>
      <Page.Body>
        <Page.ScrollArea>
          <p className="px-4 pt-1 pb-12 text-muted-foreground md:px-8">
            This admin page is under construction.
          </p>
        </Page.ScrollArea>
      </Page.Body>
    </Page.Layout>
  )
}
