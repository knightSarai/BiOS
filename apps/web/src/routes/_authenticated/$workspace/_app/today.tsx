import { createFileRoute } from "@tanstack/react-router"
import { CalendarDays } from "lucide-react"
import { formatLongLocalDate, now, parseUtc } from "@knight-os/server/core"
import { Page } from "@layout/content/Page"

export const Route = createFileRoute("/_authenticated/$workspace/_app/today")({
  staticData: { crumb: { label: "Today", icon: CalendarDays } },
  component: TodayPage,
})

function TodayPage() {
  const { workspace } = Route.useRouteContext()
  const today = parseUtc(now())

  return (
    <Page.Layout>
      <Page.Header>
        <Page.HeaderContent>
          <Page.Eyebrow>
            <span className="font-medium text-accent-text">Daily page</span>
          </Page.Eyebrow>
          <Page.Title>
            {formatLongLocalDate(today, workspace.settings.timezone)}
          </Page.Title>
        </Page.HeaderContent>
      </Page.Header>
    </Page.Layout>
  )
}
