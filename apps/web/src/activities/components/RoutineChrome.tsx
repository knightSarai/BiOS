import { useQuery } from "@tanstack/react-query"
import { Navigate, useMatch } from "@tanstack/react-router"
import { useAtomValue } from "jotai"
import { activeRoutineQuery, routineQuery } from "@/local-db/activity-queries"
import type { Session } from "../routine"
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

type ChromeWorkspace = { id: string; slug: string }

function DockFor({
  workspace,
  global,
  pageId,
  onOwnPage,
}: {
  workspace: ChromeWorkspace
  global: Session
  pageId: string | null
  onOwnPage: boolean
}) {
  const timer = useRoutine(workspace.id, global, pageId)
  if (dockOn({ session: global, pageId, onOwnPage }) === "nowhere") return null
  return (
    <div className="shrink-0">
      <Dock timer={timer} workspaceSlug={workspace.slug} />
    </div>
  )
}

function FullScreenFor({
  workspace,
  global,
  pageId,
}: {
  workspace: ChromeWorkspace
  global: Session
  pageId: string | null
}) {
  const timer = useRoutine(workspace.id, global, pageId)
  return <RunMode timer={timer} workspaceSlug={workspace.slug} />
}

function RoutineChrome({ workspace }: { workspace: ChromeWorkspace }) {
  useResumeRoutine(workspace.id)
  const fullScreen = useFullScreen()
  const fullScreenId = useAtomValue(fullScreenRoutineAtom)
  const pageId =
    useMatch({
      from: ACTIVITY_ROUTE,
      shouldThrow: false,
      select: (match) => match.params.activityId,
    }) ?? null
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
