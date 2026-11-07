import { useMutation, useQueryClient } from "@tanstack/react-query"
import { now, parseUtc } from "@knight-os/server/core"
import type { ActivityStatus } from "@/activities/status"
import {
  finishTimeFor,
  resolveTimer,
  stopTimeFor,
  type TimerConfig,
} from "@/activities/timer"
import { disarmTimer } from "@/activities/timer-runner"
import type { EditorContent } from "@/editor/mention-index"
import type { NewActivity } from "./activities"
import {
  activitiesRepository,
  activityKeys,
  activityTypesRepository,
  areasRepository,
  timeEntriesRepository,
} from "./activity-queries"
import type { NewArea } from "./areas"
import type { TimeEntryRow } from "./db"
import { notebookContext, notebookKeys } from "./notebook-queries"
import { syncEntityFolder } from "@/notebook/use-cases"

const syncActivityFolder = (workspaceId: string, activityId: string) =>
  syncEntityFolder(notebookContext(workspaceId), {
    kind: "activity",
    id: activityId,
  })

const useInvalidateActivities = (workspaceId: string) => {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: activityKeys.all(workspaceId),
      }),
      queryClient.invalidateQueries({
        queryKey: notebookKeys.all(workspaceId),
      }),
    ])
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

const useCreateActivities = (workspaceId: string) => {
  const invalidate = useInvalidateActivities(workspaceId)
  return useMutation({
    networkMode: "always",
    mutationFn: (activities: NewActivity[]) =>
      activitiesRepository(workspaceId).createMany(activities),
    onSuccess: invalidate,
  })
}

const useSetActivityStatus = (workspaceId: string) => {
  const invalidate = useInvalidateActivities(workspaceId)
  return useMutation({
    networkMode: "always",
    mutationFn: ({ id, status }: { id: string; status: ActivityStatus }) =>
      activitiesRepository(workspaceId).setStatus(id, status),
    onSuccess: invalidate,
  })
}

const useToggleActivityDone = (workspaceId: string) => {
  const invalidate = useInvalidateActivities(workspaceId)
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

const useChangeActivityType = (workspaceId: string) => {
  const invalidate = useInvalidateActivities(workspaceId)
  return useMutation({
    networkMode: "always",
    mutationFn: ({ id, typeId }: { id: string; typeId: string | null }) =>
      activitiesRepository(workspaceId).changeType(id, typeId),
    onSuccess: invalidate,
  })
}

const useSetActivityTimer = (workspaceId: string) => {
  const invalidate = useInvalidateActivities(workspaceId)
  return useMutation({
    networkMode: "always",
    mutationFn: ({ id, timer }: { id: string; timer: TimerConfig | null }) =>
      activitiesRepository(workspaceId).setTimer(id, timer),
    onSuccess: invalidate,
  })
}

const useSetActivityParent = (workspaceId: string) => {
  const invalidate = useInvalidateActivities(workspaceId)
  return useMutation({
    networkMode: "always",
    mutationFn: ({ id, parentId }: { id: string; parentId: string | null }) =>
      activitiesRepository(workspaceId).setParent(id, parentId),
    onSuccess: invalidate,
  })
}

const useDuplicateActivity = (workspaceId: string) => {
  const invalidate = useInvalidateActivities(workspaceId)
  return useMutation({
    networkMode: "always",
    mutationFn: (id: string) => activitiesRepository(workspaceId).duplicate(id),
    onSuccess: invalidate,
  })
}

const useInvalidateTimeEntries = (workspaceId: string) => {
  const queryClient = useQueryClient()
  return () =>
    queryClient.invalidateQueries({
      queryKey: [...activityKeys.all(workspaceId), "time-entries"],
    })
}

const timerOf = async (workspaceId: string, activityId: string) => {
  const activity = await activitiesRepository(workspaceId).byId(activityId)
  const type = activity?.typeId
    ? await activityTypesRepository(workspaceId).byId(activity.typeId)
    : null
  return resolveTimer(activity?.timer ?? null, type?.timer ?? null)
}

const stopCapped = async (
  workspaceId: string,
  activityId: string,
  timer: TimerConfig,
  finished = false
) => {
  const entries = timeEntriesRepository(workspaceId)
  const logged = await entries.list(activityId)
  const stoppedAt =
    (finished ? finishTimeFor(timer, logged) : null) ??
    stopTimeFor(timer, logged, parseUtc(now()))
  await entries.stop(activityId, stoppedAt)
}

// A timer left running elsewhere (another tab, before a reload) is stopped at its own total first.
const useStartTimer = (workspaceId: string) => {
  const invalidate = useInvalidateTimeEntries(workspaceId)
  return useMutation({
    networkMode: "always",
    mutationFn: async (activityId: string) => {
      const entries = timeEntriesRepository(workspaceId)
      const running = await entries.running()
      if (running && running.activityId !== activityId) {
        await stopCapped(
          workspaceId,
          running.activityId,
          await timerOf(workspaceId, running.activityId)
        )
      }
      return entries.start(activityId)
    },
    onSuccess: invalidate,
  })
}

const useStopTimer = (workspaceId: string) => {
  const invalidate = useInvalidateTimeEntries(workspaceId)
  return useMutation({
    networkMode: "always",
    mutationFn: ({
      activityId,
      timer,
      finished,
    }: {
      activityId: string
      timer: TimerConfig
      finished: boolean
    }) => stopCapped(workspaceId, activityId, timer, finished),
    onSuccess: invalidate,
  })
}

const useLapTimer = (workspaceId: string) => {
  const invalidate = useInvalidateTimeEntries(workspaceId)
  return useMutation({
    networkMode: "always",
    mutationFn: async ({
      activityId,
      timer,
    }: {
      activityId: string
      timer: TimerConfig
    }) => {
      const entries = timeEntriesRepository(workspaceId)
      const logged = await entries.list(activityId)
      return entries.lap(
        activityId,
        stopTimeFor(timer, logged, parseUtc(now()))
      )
    },
    onSuccess: invalidate,
  })
}

const useClearTimer = (workspaceId: string) => {
  const invalidate = useInvalidateTimeEntries(workspaceId)
  return useMutation({
    networkMode: "always",
    mutationFn: (activityId: string) =>
      timeEntriesRepository(workspaceId).clear(activityId),
    onSuccess: invalidate,
  })
}

const useRestoreTimeEntries = (workspaceId: string) => {
  const invalidate = useInvalidateTimeEntries(workspaceId)
  return useMutation({
    networkMode: "always",
    mutationFn: (rows: TimeEntryRow[]) =>
      timeEntriesRepository(workspaceId).restore(rows),
    onSuccess: invalidate,
  })
}

const useDeleteActivity = (workspaceId: string, id: string) => {
  const queryClient = useQueryClient()
  return useMutation({
    networkMode: "always",
    mutationFn: () => {
      disarmTimer(id)
      return activitiesRepository(workspaceId).delete(id)
    },
    onSuccess: async () => {
      queryClient.removeQueries({
        queryKey: activityKeys.detail(workspaceId, id),
      })
      await queryClient.invalidateQueries({
        queryKey: activityKeys.all(workspaceId),
      })
    },
  })
}

export {
  useClearTimer,
  useLapTimer,
  useCreateActivities,
  useDuplicateActivity,
  useRestoreTimeEntries,
  useSetActivityParent,
  useSetActivityTimer,
  useStartTimer,
  useStopTimer,
  useDeleteActivity,
  useCreateArea,
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
