import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { ActivityStatus } from "@/activities/status"
import type { NewActivity } from "./activities"
import {
  activitiesRepository,
  activityKeys,
  areasRepository,
} from "./activity-queries"
import type { NewArea } from "./areas"

const useInvalidateActivities = (workspaceId: string) => {
  const queryClient = useQueryClient()
  return () =>
    queryClient.invalidateQueries({ queryKey: activityKeys.all(workspaceId) })
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
    mutationFn: ({ id, areaId }: { id: string; areaId: string }) =>
      activitiesRepository(workspaceId).moveToArea(id, areaId),
    onSuccess: invalidate,
  })
}

const useSaveActivityTitle = (workspaceId: string, id: string) => {
  const invalidate = useInvalidateActivityTitle(workspaceId, id)
  return useMutation({
    networkMode: "always",
    mutationFn: (title: string) =>
      activitiesRepository(workspaceId).saveTitle(id, title),
    onSuccess: invalidate,
  })
}

const useSyncActivityTitle = (workspaceId: string, id: string) => {
  const invalidate = useInvalidateActivityTitle(workspaceId, id)
  return useMutation({
    networkMode: "always",
    mutationFn: (title: string) =>
      activitiesRepository(workspaceId).syncTitle(id, title),
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
  useSaveActivityTitle,
  useSetActivityStatus,
  useSyncActivityTitle,
  useToggleActivityDone,
}
