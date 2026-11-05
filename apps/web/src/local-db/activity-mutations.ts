import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { ActivityStatus } from "@/activities/status"
import type { EditorContent } from "@/editor/mention-index"
import type { NewActivity } from "./activities"
import {
  activitiesRepository,
  activityKeys,
  areasRepository,
} from "./activity-queries"
import type { NewArea } from "./areas"
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
    },
  })
}

export {
  useCreateActivities,
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
