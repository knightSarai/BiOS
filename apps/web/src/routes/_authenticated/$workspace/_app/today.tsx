import { createFileRoute } from "@tanstack/react-router"
import { CalendarDays } from "lucide-react"
import { now, toLocalDate } from "@knight-os/server/core"
import { documentQuery } from "@/local-db/document-queries"
import { notebookContext, notebookTreeQuery } from "@/local-db/notebook-queries"
import { DocumentView } from "@/notebook/components/DocumentView"
import { ensureJournalPage } from "@/notebook/use-cases"

export const Route = createFileRoute("/_authenticated/$workspace/_app/today")({
  ssr: false,
  staticData: { crumb: { label: "Today", icon: CalendarDays } },
  loader: async ({ context }) => {
    const workspace = context.workspace
    const today = toLocalDate(now(), workspace.settings.timezone)
    const documentId = await ensureJournalPage(
      notebookContext(workspace.id),
      "day",
      today
    )
    await Promise.all([
      context.queryClient.ensureQueryData(
        documentQuery(workspace.id, documentId)
      ),
      context.queryClient.invalidateQueries({
        queryKey: ["local-db", workspace.id, "notebook"],
      }),
    ])
    await context.queryClient.ensureQueryData(notebookTreeQuery(workspace.id))
    return { documentId }
  },
  component: TodayPage,
})

function TodayPage() {
  const { workspace } = Route.useRouteContext()
  const { documentId } = Route.useLoaderData()

  return (
    <DocumentView
      key={documentId}
      workspace={{
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        timezone: workspace.settings.timezone,
      }}
      documentId={documentId}
    />
  )
}
