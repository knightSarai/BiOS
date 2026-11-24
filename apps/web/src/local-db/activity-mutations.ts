import {
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query"
import { toast } from "sonner"
import { now, parseUtc } from "@knight-os/server/core"
import { nodesOf, type Action } from "@/activities/routine"
import { cuesAhead } from "@/activities/routine-view"
import type { ActivityStatus } from "@/activities/status"
import type { TimerConfig, TimerSound } from "@/activities/timer"
import {
  armRoutine,
  disarmPending,
  disarmRoutine,
  isArmed,
} from "@/activities/timer-runner"
import type { EditorContent } from "@/editor/mention-index"
import type { NewActivity, SeriesHolder } from "./activities"
import {
  activitiesRepository,
  activityKeys,
  areasRepository,
  routinesRepository,
} from "./activity-queries"
import type { AreaChanges, NewArea } from "./areas"
import { MissingRoutineError, toSeconds } from "./routines"
import type { LoggedSession } from "./time-entries"
import { notebookContext, notebookKeys } from "./notebook-queries"
import { deleteArea, syncEntityFolder } from "@/notebook/use-cases"

const syncActivityFolder = (workspaceId: string, activityId: string) =>
  syncEntityFolder(notebookContext(workspaceId), {
    kind: "activity",
    id: activityId,
  })

const invalidateActivities = (queryClient: QueryClient, workspaceId: string) =>
  Promise.all([
    queryClient.invalidateQueries({
      queryKey: activityKeys.all(workspaceId),
    }),
    queryClient.invalidateQueries({
      queryKey: notebookKeys.all(workspaceId),
    }),
  ])

const useInvalidateActivities = (workspaceId: string) => {
  const queryClient = useQueryClient()
  return () => invalidateActivities(queryClient, workspaceId)
}

type RoutineRequest = {
  activityId: string
  action: Action | { kind: "sync" }
  within?: string | null
  reopen?: string | null
}

const currentSeconds = () => toSeconds(parseUtc(now()))

// Stopping the timer by hand silences it at once; a routine that finishes by itself lets
// its last cue ring out.
const silences = (action: RoutineRequest["action"]) =>
  action.kind === "pause" ||
  action.kind === "startOver" ||
  action.kind === "jumpTo"

// Armed from the committed result rather than from a component's callback, so a click that a
// hand-over sync overtakes, or a page that unmounts, still leaves the right schedule.
const applyRoutine = async (
  queryClient: QueryClient,
  workspaceId: string,
  { activityId, action, within = null, reopen = null }: RoutineRequest
) => {
  const session = await routinesRepository(workspaceId).apply(
    activityId,
    action,
    within,
    reopen
  )
  armRoutine({
    workspaceId,
    asOf: session.now,
    running: session.phase === "running",
    silence: silences(action),
    routineId: session.root.id,
    ids: nodesOf(session.root).map((node) => node.id),
    sound: session.root.timer.sound,
    cues: cuesAhead(session),
    clock: currentSeconds,
    onHandOver: () =>
      void syncRoutine(queryClient, workspaceId, session.root.id).catch(() =>
        toast.error(
          `Couldn't move ${session.root.title || "the timer"} on. Reload to catch up.`
        )
      ),
  })
  return session
}

// A routine deleted while a hand-over was waiting has nothing left to sync.
const syncRoutine = (
  queryClient: QueryClient,
  workspaceId: string,
  activityId: string
) =>
  applyRoutine(queryClient, workspaceId, {
    activityId,
    action: { kind: "sync" },
  })
    .catch((error: unknown) => {
      if (!(error instanceof MissingRoutineError)) throw error
      disarmRoutine(workspaceId, activityId)
      return null
    })
    .finally(() => invalidateActivities(queryClient, workspaceId))

// Writes the hand-overs the running routine missed and arms the ones ahead. `force` re-arms
// one already armed, after its timers or its tree changed; with nothing running, no
// hand-over stays scheduled.
const resyncRunningRoutine = async (
  queryClient: QueryClient,
  workspaceId: string,
  force: boolean
) => {
  const playing = await routinesRepository(workspaceId).playingRoutineId()
  if (playing === null) {
    disarmPending(workspaceId)
    return
  }
  if (!force && isArmed(workspaceId, playing)) return
  await syncRoutine(queryClient, workspaceId, playing)
}

// After a change to a routine's tree, its hand-overs are read again from what's stored.
const useInvalidateAndRearm = (workspaceId: string) => {
  const queryClient = useQueryClient()
  return async () => {
    await invalidateActivities(queryClient, workspaceId)
    await resyncRunningRoutine(queryClient, workspaceId, true)
  }
}

const useInvalidateActivityTitle = (workspaceId: string, id: string) => {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: activityKeys.detail(workspaceId, id),
      }),
      queryClient.invalidateQueries({
        queryKey: activityKeys.summary(workspaceId, id),
      }),
      queryClient.invalidateQueries({
        queryKey: [...activityKeys.all(workspaceId), "list"],
      }),
      queryClient.invalidateQueries({
        queryKey: notebookKeys.all(workspaceId),
      }),
    ])
}

// An activity running when it gains sub-activities stops, so the routine is re-armed.
const useCreateActivities = (workspaceId: string) => {
  const invalidate = useInvalidateAndRearm(workspaceId)
  return useMutation({
    networkMode: "always",
    mutationFn: ({
      activities,
      logged = [],
    }: {
      activities: NewActivity[]
      logged?: LoggedSession[]
    }) => activitiesRepository(workspaceId).createMany(activities, logged),
    onSuccess: invalidate,
  })
}

const useAddSeries = (workspaceId: string) => {
  const invalidate = useInvalidateAndRearm(workspaceId)
  return useMutation({
    networkMode: "always",
    mutationFn: ({
      parentId,
      holder,
      repeats,
      logged = [],
    }: {
      parentId: string
      holder: SeriesHolder
      repeats: NewActivity[]
      logged?: Omit<LoggedSession, "activityId">[]
    }) =>
      activitiesRepository(workspaceId).addSeries(
        parentId,
        holder,
        repeats,
        logged
      ),
    onSuccess: invalidate,
  })
}

// Done on the activity the timer is playing hands over, so the routine is re-armed.
const useSetActivityStatus = (workspaceId: string) => {
  const invalidate = useInvalidateAndRearm(workspaceId)
  return useMutation({
    networkMode: "always",
    mutationFn: ({ id, status }: { id: string; status: ActivityStatus }) =>
      activitiesRepository(workspaceId).setStatus(id, status),
    onSuccess: invalidate,
  })
}

const useToggleActivityDone = (workspaceId: string) => {
  const invalidate = useInvalidateAndRearm(workspaceId)
  return useMutation({
    networkMode: "always",
    mutationFn: (id: string) =>
      activitiesRepository(workspaceId).toggleDone(id),
    onSuccess: invalidate,
  })
}

const useMoveActivityToArea = (workspaceId: string) => {
  const invalidate = useInvalidateActivities(workspaceId)
  return useMutation({
    networkMode: "always",
    mutationFn: async ({ id, areaId }: { id: string; areaId: string }) => {
      await activitiesRepository(workspaceId).moveToArea(id, areaId)
      await syncActivityFolder(workspaceId, id)
    },
    onSuccess: invalidate,
  })
}

const useSaveActivityContent = (workspaceId: string, id: string) => {
  const invalidate = useInvalidateActivityTitle(workspaceId, id)
  return useMutation({
    networkMode: "always",
    mutationFn: async (content: EditorContent) => {
      await activitiesRepository(workspaceId).saveTitle(id, content.title)
      await notebookContext(workspaceId).mentions.replaceForSource(
        `activity:${id}`,
        content.mentions
      )
      await syncActivityFolder(workspaceId, id)
    },
    onSuccess: invalidate,
  })
}

const useSyncActivityTitle = (workspaceId: string, id: string) => {
  const invalidate = useInvalidateActivityTitle(workspaceId, id)
  return useMutation({
    networkMode: "always",
    mutationFn: async (title: string) => {
      await activitiesRepository(workspaceId).syncTitle(id, title)
      await syncActivityFolder(workspaceId, id)
    },
    onSuccess: invalidate,
  })
}

const useCreateArea = (workspaceId: string) => {
  const invalidate = useInvalidateActivities(workspaceId)
  return useMutation({
    networkMode: "always",
    mutationFn: (area: NewArea) => areasRepository(workspaceId).create(area),
    onSuccess: invalidate,
  })
}

const useUpdateArea = (workspaceId: string) => {
  const invalidate = useInvalidateActivities(workspaceId)
  return useMutation({
    networkMode: "always",
    mutationFn: async ({
      id,
      changes,
    }: {
      id: string
      changes: AreaChanges
    }) => {
      await areasRepository(workspaceId).update(id, changes)
      await syncEntityFolder(notebookContext(workspaceId), {
        kind: "area",
        id,
      })
    },
    onSuccess: invalidate,
  })
}

const useDeleteArea = (workspaceId: string) => {
  const invalidate = useInvalidateActivities(workspaceId)
  return useMutation({
    networkMode: "always",
    mutationFn: ({ id, intoAreaId }: { id: string; intoAreaId: string }) =>
      deleteArea(notebookContext(workspaceId), id, intoAreaId),
    onSuccess: invalidate,
  })
}

const useSetActivityGoal = (workspaceId: string) => {
  const invalidate = useInvalidateActivities(workspaceId)
  return useMutation({
    networkMode: "always",
    mutationFn: ({ id, goalId }: { id: string; goalId: string | null }) =>
      activitiesRepository(workspaceId).setGoal(id, goalId),
    onSuccess: invalidate,
  })
}

const useSetActivityDueDate = (workspaceId: string) => {
  const invalidate = useInvalidateActivities(workspaceId)
  return useMutation({
    networkMode: "always",
    mutationFn: ({ id, dueDate }: { id: string; dueDate: string | null }) =>
      activitiesRepository(workspaceId).setDueDate(id, dueDate),
    onSuccess: invalidate,
  })
}

const useSetActivityField = (workspaceId: string) => {
  const invalidate = useInvalidateActivities(workspaceId)
  return useMutation({
    networkMode: "always",
    mutationFn: ({
      id,
      fieldId,
      value,
    }: {
      id: string
      fieldId: string
      value: unknown
    }) => activitiesRepository(workspaceId).setFieldValue(id, fieldId, value),
    onSuccess: invalidate,
  })
}

// A type can carry the timer an activity plays.
const useChangeActivityType = (workspaceId: string) => {
  const invalidate = useInvalidateAndRearm(workspaceId)
  return useMutation({
    networkMode: "always",
    mutationFn: ({ id, typeId }: { id: string; typeId: string | null }) =>
      activitiesRepository(workspaceId).changeType(id, typeId),
    onSuccess: invalidate,
  })
}

// A running routine's hand-overs move with its timers, so they're re-armed from the new ones.
const useSetActivityTimer = (workspaceId: string) => {
  const queryClient = useQueryClient()
  return useMutation({
    networkMode: "always",
    mutationFn: ({ id, timer }: { id: string; timer: TimerConfig | null }) =>
      activitiesRepository(workspaceId).setTimer(id, timer),
    onSuccess: async () => {
      await invalidateActivities(queryClient, workspaceId)
      await resyncRunningRoutine(queryClient, workspaceId, true)
    },
  })
}

const useSetActivitySound = (workspaceId: string) => {
  const queryClient = useQueryClient()
  return useMutation({
    networkMode: "always",
    mutationFn: ({ id, sound }: { id: string; sound: TimerSound }) =>
      activitiesRepository(workspaceId).setSound(id, sound),
    onSuccess: async () => {
      await invalidateActivities(queryClient, workspaceId)
      await resyncRunningRoutine(queryClient, workspaceId, true)
    },
  })
}

const useSetActivityParent = (workspaceId: string) => {
  const invalidate = useInvalidateAndRearm(workspaceId)
  return useMutation({
    networkMode: "always",
    mutationFn: ({ id, parentId }: { id: string; parentId: string | null }) =>
      routinesRepository(workspaceId).move(id, parentId),
    onSuccess: invalidate,
  })
}

// A copy that lands in a running routine changes what comes next, so the routine is re-armed.
const useDuplicateActivity = (workspaceId: string) => {
  const invalidate = useInvalidateAndRearm(workspaceId)
  return useMutation({
    networkMode: "always",
    mutationFn: (id: string) => activitiesRepository(workspaceId).duplicate(id),
    onSuccess: invalidate,
  })
}

// Every routine action can tick activities, add laps and move time, so it refreshes them all.
const useRoutineAction = (workspaceId: string) => {
  const queryClient = useQueryClient()
  return useMutation({
    networkMode: "always",
    mutationFn: (request: RoutineRequest) =>
      applyRoutine(queryClient, workspaceId, request),
    onSuccess: () => invalidateActivities(queryClient, workspaceId),
  })
}

const useLogTime = (workspaceId: string) => {
  const invalidate = useInvalidateAndRearm(workspaceId)
  return useMutation({
    networkMode: "always",
    mutationFn: ({ sessions }: { sessions: LoggedSession[] }) =>
      activitiesRepository(workspaceId).logTime(sessions),
    onSuccess: invalidate,
  })
}

// Re-armed from what's left, so deleting a step that isn't playing keeps the routine's sounds.
const useDeleteActivity = (workspaceId: string, id: string) => {
  const queryClient = useQueryClient()
  return useMutation({
    networkMode: "always",
    mutationFn: () => activitiesRepository(workspaceId).delete(id),
    onSuccess: async () => {
      queryClient.removeQueries({
        queryKey: activityKeys.detail(workspaceId, id),
      })
      await queryClient.invalidateQueries({
        queryKey: activityKeys.all(workspaceId),
      })
      await resyncRunningRoutine(queryClient, workspaceId, true)
    },
  })
}

export {
  resyncRunningRoutine,
  syncRoutine,
  useAddSeries,
  useLogTime,
  useRoutineAction,
  useCreateActivities,
  useDuplicateActivity,
  useSetActivityParent,
  useSetActivitySound,
  useSetActivityTimer,
  useDeleteActivity,
  useCreateArea,
  useDeleteArea,
  useUpdateArea,
  useMoveActivityToArea,
  useChangeActivityType,
  useSaveActivityContent,
  useSetActivityDueDate,
  useSetActivityField,
  useSetActivityGoal,
  useSetActivityStatus,
  useSyncActivityTitle,
  useToggleActivityDone,
}
