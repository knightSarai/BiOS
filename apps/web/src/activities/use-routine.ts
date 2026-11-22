import { useMemo } from "react"
import { useNavigate, useRouter, useSearch } from "@tanstack/react-router"
import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query"
import { atom, useAtom, useAtomValue, useSetAtom } from "jotai"
import { toast } from "sonner"
import { now, parseUtc, type UtcDatetime } from "@knight-os/server/core"
import {
  resyncRunningRoutine,
  useRoutineAction,
} from "@/local-db/activity-mutations"
import { activityTypesQuery } from "@/local-db/activity-queries"
import { toSeconds } from "@/local-db/routines"
import {
  runningEntry,
  sessionOf,
  type Action,
  type RoutineNode,
  type Run,
  type Session,
} from "./routine"
import {
  failureOf,
  fullScreenExit,
  keptAfterExit,
  pageViewOf,
  timerTargetId,
} from "./routine-view"
import { clockAtom } from "./timer-clock"
import { unlockAudio } from "./timer-runner"

// The places Start over's question can open: the Timer property in the sidebar or on a phone
// (both are mounted, one hidden), or full screen, so it opens only where it was asked for.
type Surface = "panel" | "phone" | "full"

// Keyed by routine too, so a question left open never resurfaces on another routine.
const confirmStartOverAtom = atom<{
  surface: Surface
  routineId: string
} | null>(null)

// The actions that start the timer playing; one that targets a done activity reopens it.
const PLAYS: Action["kind"][] = ["play", "playAll"]

// Counts each routine's timer actions from any surface, so an offer to add time made before
// one on its routine is stale; another routine's timer leaves it alone.
const timerActionsAtom = atom<Record<string, number>>({})

// The routine full screen was opened for, so it can stay there once it finishes even where
// a finished routine is no longer shown.
const fullScreenRoutineAtom = atom<string | null>(null)

// Set when full screen is opened from a page in this visit; a reload starts without it.
const enteredFullScreenAtom = atom(false)

const stillAtom = atom<UtcDatetime | null>(null)

// The routine as the timer shows it right now. Only a running one makes the clock tick; a
// stopped one is read at the time its state was. Countdowns that ran out are rolled forward
// on read; their ids are only for this render, since nothing is written until an action.
const useRoutineSession = (
  state: { root: RoutineNode; run: Run } | null | undefined
) => {
  const ticking = useAtomValue<UtcDatetime | null>(
    state && runningEntry(state.run) ? clockAtom : stillAtom
  )
  return state
    ? sessionOf(
        state.root,
        state.run,
        toSeconds(ticking ?? parseUtc(now())),
        () => "unsaved"
      )
    : null
}

// Audio is unlocked inside the click, since browsers allow it only there.
const useRoutineAct = (
  workspaceId: string,
  routineId: string,
  session: Session
) => {
  const routineAction = useRoutineAction(workspaceId)
  const setAsking = useSetAtom(confirmStartOverAtom)
  const countAction = useSetAtom(timerActionsAtom)
  return (action: Action) => {
    unlockAudio()
    countAction((counts) => ({
      ...counts,
      [routineId]: (counts[routineId] ?? 0) + 1,
    }))
    if (action.kind === "startOver") setAsking(null)
    // Playing it all again replays the activity seen, not just the part played last.
    const target =
      action.kind === "playAll"
        ? (session.within ?? session.root.id)
        : timerTargetId(session)
    routineAction.mutate(
      {
        activityId: session.root.id,
        action,
        within: session.within,
        reopen:
          PLAYS.includes(action.kind) && session.run.done.includes(target)
            ? target
            : null,
      },
      { onError: () => toast.error(failureOf(action)) }
    )
  }
}

// A reload forgets what was armed, so a routine still running catches up as soon as the
// timer's chrome mounts, without waiting for a click.
const resumeAtomFor = (workspaceId: string, queryClient: QueryClient) => {
  const resume = atom(null)
  resume.onMount = () => {
    resyncRunningRoutine(queryClient, workspaceId, false).catch(() =>
      toast.error("Couldn't catch the timer up. Reload to try again.")
    )
  }
  return resume
}

const useResumeRoutine = (workspaceId: string) => {
  const queryClient = useQueryClient()
  // Identity matters: one atom per workspace, so its onMount runs once when the chrome
  // mounts rather than on every render.
  const resumeAtom = useMemo(
    () => resumeAtomFor(workspaceId, queryClient),
    [workspaceId, queryClient]
  )
  useAtomValue(resumeAtom)
}

type Routine = ReturnType<typeof useRoutine>

// On a sub-activity's page the timer shows only that activity's part, and Start there plays
// just that part; other actions keep what the routine is playing.
const useRoutine = (
  workspaceId: string,
  global: Session,
  pageId: string | null
) => {
  const { data: types = [] } = useQuery(activityTypesQuery(workspaceId))
  const session = pageId === null ? global : pageViewOf(global, pageId)
  const act = useRoutineAct(workspaceId, global.root.id, session)
  return {
    session,
    routine: global.root,
    workspaceId,
    act,
    typeOf: (node: RoutineNode | null | undefined) =>
      node?.typeId
        ? (types.find((type) => type.id === node.typeId) ?? null)
        : null,
  }
}

const APP_ROUTE = "/_authenticated/$workspace/_app"

// Full screen lives in the URL: entering adds it, leaving goes back, so the page you were
// on (and its scroll) is exactly where you return to, and the browser's Back works too.
const useFullScreen = () => {
  const open = useSearch({
    from: APP_ROUTE,
    select: (search) => search.full === true,
  })
  const navigate = useNavigate()
  const router = useRouter()
  const [routine, setRoutine] = useAtom(fullScreenRoutineAtom)
  const [entered, setEntered] = useAtom(enteredFullScreenAtom)
  const setAsking = useSetAtom(confirmStartOverAtom)
  return {
    open,
    // A question opened in full screen starts closed each time, however it was last left (Back
    // skips exit).
    enter: (routineId: string) => {
      setRoutine(routineId)
      setEntered(true)
      setAsking((asking) => (asking?.surface === "full" ? null : asking))
      void navigate({
        to: ".",
        search: (prev) => ({ ...prev, full: true as const }),
      })
    },
    // The kept routine is only read while the address says full screen, so it's dropped once
    // the address no longer does; dropped sooner, full screen would show another routine
    // until it closes. Going back leaves it for the next enter to replace.
    // Leaving by a link to another page: the address drops full screen on its own.
    forget: () => setEntered(false),
    exit: async () => {
      const exitedFrom = routine
      setEntered(false)
      setAsking((asking) => (asking?.surface === "full" ? null : asking))
      if (fullScreenExit(entered, router.history.canGoBack()) === "back") {
        router.history.back()
        return
      }
      await navigate({
        to: ".",
        search: (prev) => ({ ...prev, full: undefined }),
        replace: true,
      })
      setRoutine((held) => keptAfterExit(held, exitedFrom))
    },
  }
}

export {
  confirmStartOverAtom,
  fullScreenRoutineAtom,
  timerActionsAtom,
  useFullScreen,
  useResumeRoutine,
  useRoutine,
  useRoutineSession,
}
export type { Routine, Surface }
