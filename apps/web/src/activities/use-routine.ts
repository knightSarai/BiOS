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
  type Primary,
} from "./routine-view"
import { clockAtom } from "./timer-clock"
import { unlockAudio } from "./timer-runner"

// The places a routine is shown. A phone can show the page's panel and the dock at once, so
// Start over's question and the Log time form open only where they were asked for.
type Surface = "panel" | "dock" | "full"

const confirmStartOverAtom = atom<Surface | null>(null)

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
const useRoutineAct = (workspaceId: string, session: Session) => {
  const routineAction = useRoutineAction(workspaceId)
  const setAsking = useSetAtom(confirmStartOverAtom)
  return (action: Action) => {
    unlockAudio()
    if (action.kind === "startOver") setAsking(null)
    routineAction.mutate(
      { activityId: session.root.id, action, within: session.within },
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
  const act = useRoutineAct(workspaceId, session)
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

const usePress = (timer: Routine, surface: Surface) => {
  const setAsking = useSetAtom(confirmStartOverAtom)
  return (action: Primary["action"]) => {
    if (action.kind === "askStartOver") {
      setAsking(surface)
      return
    }
    timer.act(action)
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
  return {
    open,
    enter: (routineId: string) => {
      setRoutine(routineId)
      setEntered(true)
      void navigate({
        to: ".",
        search: (prev) => ({ ...prev, full: true as const }),
      })
    },
    // The kept routine is only read while the address says full screen, so it's dropped once
    // the address no longer does; dropped sooner, full screen would show another routine
    // until it closes. Going back leaves it for the next enter to replace.
    exit: async () => {
      const exitedFrom = routine
      setEntered(false)
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
  useFullScreen,
  usePress,
  useResumeRoutine,
  useRoutine,
  useRoutineSession,
}
export type { Routine, Surface }
