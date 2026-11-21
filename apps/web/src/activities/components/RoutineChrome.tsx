import { useQuery } from "@tanstack/react-query"
import { Navigate, useMatch, useMatches } from "@tanstack/react-router"
import { useAtomValue } from "jotai"
import { breadcrumbItems } from "@layout/core/breadcrumb-items"
import { activeRoutineQuery, routineQuery } from "@/local-db/activity-queries"
import { cn } from "@/lib/utils"
import { findNode, type Session } from "../routine"
import { dockOn, fullScreenOf, shownRoutine } from "../routine-view"
import {
  fullScreenRoutineAtom,
  useFullScreen,
  useResumeRoutine,
  useRoutine,
  useRoutineSession,
} from "../use-routine"
import { Dock, RunMode } from "./RoutineTimer"

const ACTIVITY_ROUTE = "/_authenticated/$workspace/_app/activities/$activityId"

// Made once, so its props never change and it navigates once per mount, not on every tick of
// a running clock while the address catches up.
const dropFullScreen = (
  <Navigate to="." search={(prev) => ({ ...prev, full: undefined })} replace />
)

function DockFor({
  workspace,
  global,
  pageId,
  onOwnPage,
}: {
  workspace: { id: string; timezone: string }
  global: Session
  pageId: string | null
  onOwnPage: boolean
}) {
  const timer = useRoutine(workspace.id, global, pageId)
  const on = dockOn({ session: global, pageId, onOwnPage })
  return (
    <div
      className={cn(
        "shrink-0",
        on === "phone" && "lg:hidden",
        on === "nowhere" && "hidden"
      )}
    >
      <Dock timer={timer} timezone={workspace.timezone} />
    </div>
  )
}

function FullScreenFor({
  workspace,
  global,
  pageId,
  backTo,
}: {
  workspace: { id: string; timezone: string }
  global: Session
  pageId: string | null
  backTo: string
}) {
  const timer = useRoutine(workspace.id, global, pageId)
  return <RunMode timer={timer} backTo={backTo} timezone={workspace.timezone} />
}

function RoutineChrome({
  workspace,
}: {
  workspace: { id: string; timezone: string }
}) {
  useResumeRoutine(workspace.id)
  const fullScreen = useFullScreen()
  const fullScreenId = useAtomValue(fullScreenRoutineAtom)
  const pageId =
    useMatch({
      from: ACTIVITY_ROUTE,
      shouldThrow: false,
      select: (match) => match.params.activityId,
    }) ?? null
  const pageLabel = useMatches({
    select: (matches) => breadcrumbItems(matches).at(-1)?.label ?? "the page",
  })
  const activeQuery = useQuery(activeRoutineQuery(workspace.id))
  const ownQuery = useQuery({
    ...routineQuery(workspace.id, pageId ?? ""),
    enabled: pageId !== null,
  })
  const keep = fullScreen.open && fullScreenId !== null
  const keptQuery = useQuery({
    ...routineQuery(workspace.id, fullScreenId ?? ""),
    enabled: keep,
  })
  const active = activeQuery.data
  const own = ownQuery.data
  const kept = keptQuery.data
  const loading =
    activeQuery.isPending ||
    (pageId !== null && ownQuery.isPending) ||
    (keep && keptQuery.isPending)
  const ownSession = useRoutineSession(pageId === null ? null : own)
  const activeSession = useRoutineSession(active)
  const keptSession = useRoutineSession(keep ? kept : null)
  const shown = shownRoutine(ownSession, pageId, activeSession)
  const full = fullScreen.open ? fullScreenOf(keptSession, shown) : null
  const pageNode =
    ownSession && pageId !== null ? findNode(ownSession.root, pageId) : null
  return (
    <>
      {shown ? (
        <DockFor
          key={`dock:${shown.session.root.id}`}
          workspace={workspace}
          global={shown.session}
          pageId={shown.pageId}
          onOwnPage={shown.onOwnPage}
        />
      ) : null}
      {full ? (
        <FullScreenFor
          key={`full:${full.session.root.id}`}
          workspace={workspace}
          global={full.session}
          pageId={full.pageId}
          backTo={pageNode?.title || pageLabel}
        />
      ) : fullScreen.open && !loading ? (
        // A full-screen address with nothing to show (reloaded after its routine finished,
        // or the routine deleted) drops the flag, so it can't pop up later on its own.
        dropFullScreen
      ) : null}
    </>
  )
}

export { RoutineChrome }
