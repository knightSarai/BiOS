import { useQuery } from "@tanstack/react-query"
import { SideActions, TimerPanel } from "@/activities/components/RoutineTimer"
import type { Session } from "@/activities/routine"
import { pageViewOf } from "@/activities/routine-view"
import { useRoutine, useRoutineSession } from "@/activities/use-routine"
import { routineQuery } from "@/local-db/activity-queries"
import { cn } from "@/lib/utils"

type PageRoutine = {
  workspaceId: string
  activityId: string
}

type PagePanelProps = PageRoutine & { global: Session; timezone: string }

const usePageRoutine = ({ workspaceId, activityId }: PageRoutine) => {
  const { data: state } = useQuery(routineQuery(workspaceId, activityId))
  return useRoutineSession(state)
}

function PagePanel({
  workspaceId,
  activityId,
  global,
  timezone,
}: PagePanelProps) {
  const timer = useRoutine(workspaceId, global, activityId)
  return <TimerPanel timer={timer} timezone={timezone} />
}

// The timer leads the sidebar, so it never scrolls out of it, and the sidebar widens while
// the routine runs.
function TimerAside({
  workspaceId,
  activityId,
  timezone,
  children,
}: PageRoutine & { timezone: string; children: React.ReactNode }) {
  const global = usePageRoutine({ workspaceId, activityId })
  const live = global ? pageViewOf(global, activityId).phase !== "idle" : false
  return (
    <aside
      aria-label="Activity properties"
      className={cn(
        // Padded so the panel can reach past the column's edges without the scroll clipping it.
        "flex shrink-0 flex-col gap-6 pb-16 transition-[width] duration-300 max-lg:hidden lg:sticky lg:top-14 lg:-mx-3 lg:max-h-[calc(100dvh-7rem)] lg:self-start lg:overflow-y-auto lg:px-3",
        live ? "w-86" : "w-70"
      )}
    >
      {global ? (
        <PagePanel
          workspaceId={workspaceId}
          activityId={activityId}
          global={global}
          timezone={timezone}
        />
      ) : null}
      {children}
    </aside>
  )
}

function PhoneSideActions({
  workspaceId,
  activityId,
  global,
  timezone,
}: PagePanelProps) {
  const timer = useRoutine(workspaceId, global, activityId)
  return (
    <div className="mb-6">
      <SideActions
        timer={timer}
        surface="panel"
        size="sm"
        timezone={timezone}
      />
    </div>
  )
}

// On a phone the card sits under the title before and after a run; while it runs the dock
// holds it, so the notes start right under the title, with Log time and Start over in reach
// once it's paused.
function PhoneTimer({
  workspaceId,
  activityId,
  timezone,
}: PageRoutine & { timezone: string }) {
  const global = usePageRoutine({ workspaceId, activityId })
  if (!global) return null
  const { phase } = pageViewOf(global, activityId)
  if (phase === "running") return null
  return phase === "idle" || phase === "finished" ? (
    <div className="mb-6">
      <PagePanel
        workspaceId={workspaceId}
        activityId={activityId}
        global={global}
        timezone={timezone}
      />
    </div>
  ) : (
    <PhoneSideActions
      workspaceId={workspaceId}
      activityId={activityId}
      global={global}
      timezone={timezone}
    />
  )
}

export { PhoneTimer, TimerAside }
