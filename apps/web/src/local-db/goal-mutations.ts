import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { EditorContent } from "@/editor/mention-index"
import type { GoalStatus } from "@/goals/status"
import { syncEntityFolder } from "@/notebook/use-cases"
import { goalKeys, goalsRepository } from "./goal-queries"
import type { DeletedGoal } from "./goals"
import { notebookContext, notebookKeys } from "./notebook-queries"

const useInvalidateGoals = (workspaceId: string) => {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: goalKeys.all(workspaceId) }),
      queryClient.invalidateQueries({
        queryKey: notebookKeys.all(workspaceId),
      }),
    ])
}

const syncGoalFolder = (workspaceId: string, goalId: string) =>
  syncEntityFolder(notebookContext(workspaceId), { kind: "goal", id: goalId })

const useCreateGoal = (workspaceId: string) => {
  const invalidate = useInvalidateGoals(workspaceId)
  return useMutation({
    networkMode: "always",
    mutationFn: (title: string) => goalsRepository(workspaceId).create(title),
    onSuccess: invalidate,
  })
}

const useSaveGoalContent = (workspaceId: string, id: string) => {
  const invalidate = useInvalidateGoals(workspaceId)
  return useMutation({
    networkMode: "always",
    mutationFn: async (content: EditorContent) => {
      await goalsRepository(workspaceId).saveTitle(id, content.title)
      await notebookContext(workspaceId).mentions.replaceForSource(
        `goal:${id}`,
        content.mentions
      )
      await syncGoalFolder(workspaceId, id)
    },
    onSuccess: invalidate,
  })
}

const useSyncGoalTitle = (workspaceId: string, id: string) => {
  const invalidate = useInvalidateGoals(workspaceId)
  return useMutation({
    networkMode: "always",
    mutationFn: async (title: string) => {
      await goalsRepository(workspaceId).syncTitle(id, title)
      await syncGoalFolder(workspaceId, id)
    },
    onSuccess: invalidate,
  })
}

const useSetGoalStatus = (workspaceId: string, id: string) => {
  const invalidate = useInvalidateGoals(workspaceId)
  return useMutation({
    networkMode: "always",
    mutationFn: (status: GoalStatus) =>
      goalsRepository(workspaceId).setStatus(id, status),
    onSuccess: invalidate,
  })
}

const useSetGoalTargetMonth = (workspaceId: string, id: string) => {
  const invalidate = useInvalidateGoals(workspaceId)
  return useMutation({
    networkMode: "always",
    mutationFn: (targetMonth: string | null) =>
      goalsRepository(workspaceId).setTargetMonth(id, targetMonth),
    onSuccess: invalidate,
  })
}

const useSetGoalIcon = (workspaceId: string) => {
  const invalidate = useInvalidateGoals(workspaceId)
  return useMutation({
    networkMode: "always",
    mutationFn: ({ goalId, icon }: { goalId: string; icon: string | null }) =>
      goalsRepository(workspaceId).setIcon(goalId, icon),
    onSuccess: invalidate,
  })
}

const useDeleteGoal = (workspaceId: string, id: string) => {
  const queryClient = useQueryClient()
  return useMutation({
    networkMode: "always",
    mutationFn: () => goalsRepository(workspaceId).delete(id),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: goalKeys.detail(workspaceId, id) })
      await queryClient.invalidateQueries({
        queryKey: ["local-db", workspaceId],
      })
    },
  })
}

const useRestoreGoal = (workspaceId: string) => {
  const queryClient = useQueryClient()
  return useMutation({
    networkMode: "always",
    mutationFn: (snapshot: DeletedGoal) =>
      goalsRepository(workspaceId).restore(snapshot),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["local-db", workspaceId] }),
  })
}

export {
  useCreateGoal,
  useDeleteGoal,
  useRestoreGoal,
  useSaveGoalContent,
  useSetGoalIcon,
  useSetGoalStatus,
  useSetGoalTargetMonth,
  useSyncGoalTitle,
}
