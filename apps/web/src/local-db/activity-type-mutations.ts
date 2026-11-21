import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { FieldKind } from "@/activities/fields"
import type { ActivityStatus } from "@/activities/status"
import type { ActivityTypeChanges, NewActivityType } from "./activity-types"
import { resyncRunningRoutine } from "./activity-mutations"
import {
  activityKeys,
  activityTypesRepository,
  routinesRepository,
} from "./activity-queries"

// Field and type changes can rewrite activities' values, so activity queries refresh too.
const useInvalidateActivities = (workspaceId: string) => {
  const queryClient = useQueryClient()
  return () =>
    queryClient.invalidateQueries({ queryKey: activityKeys.all(workspaceId) })
}

const useCreateActivityType = (workspaceId: string) => {
  const invalidate = useInvalidateActivities(workspaceId)
  return useMutation({
    networkMode: "always",
    mutationFn: (type: NewActivityType) =>
      activityTypesRepository(workspaceId).create(type),
    onSuccess: invalidate,
  })
}

// A type's timer is the timer of every activity without its own, so a running routine
// catches up under the old one and re-arms from the new one.
const useUpdateActivityType = (workspaceId: string) => {
  const queryClient = useQueryClient()
  const invalidate = useInvalidateActivities(workspaceId)
  return useMutation({
    networkMode: "always",
    mutationFn: async ({
      id,
      changes,
    }: {
      id: string
      changes: ActivityTypeChanges
    }) => {
      const update = () =>
        activityTypesRepository(workspaceId).update(id, changes)
      return changes.timer === undefined
        ? update()
        : routinesRepository(workspaceId).retime(update)
    },
    onSuccess: async (_, { changes }) => {
      await invalidate()
      if (changes.timer !== undefined) {
        await resyncRunningRoutine(queryClient, workspaceId, true)
      }
    },
  })
}

const useRenameTypeStatus = (workspaceId: string) => {
  const invalidate = useInvalidateActivities(workspaceId)
  return useMutation({
    networkMode: "always",
    mutationFn: ({
      id,
      status,
      name,
    }: {
      id: string
      status: ActivityStatus
      name: string
    }) => activityTypesRepository(workspaceId).renameStatus(id, status, name),
    onSuccess: invalidate,
  })
}

// Its activities lose its timer, so a running routine catches up and re-arms, as on a timer edit.
const useDeleteActivityType = (workspaceId: string) => {
  const queryClient = useQueryClient()
  const invalidate = useInvalidateActivities(workspaceId)
  return useMutation({
    networkMode: "always",
    mutationFn: async (id: string) => {
      await routinesRepository(workspaceId).catchUpRunning()
      return activityTypesRepository(workspaceId).delete(id)
    },
    onSuccess: async () => {
      await invalidate()
      await resyncRunningRoutine(queryClient, workspaceId, true)
    },
  })
}

const useAddTypeField = (workspaceId: string) => {
  const invalidate = useInvalidateActivities(workspaceId)
  return useMutation({
    networkMode: "always",
    mutationFn: ({
      typeId,
      name,
      kind,
    }: {
      typeId: string
      name: string
      kind: FieldKind
    }) => activityTypesRepository(workspaceId).addField(typeId, { name, kind }),
    onSuccess: invalidate,
  })
}

const useRenameTypeField = (workspaceId: string) => {
  const invalidate = useInvalidateActivities(workspaceId)
  return useMutation({
    networkMode: "always",
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      activityTypesRepository(workspaceId).renameField(id, name),
    onSuccess: invalidate,
  })
}

type OptionChange =
  | { action: "add"; fieldId: string; label: string }
  | { action: "rename"; fieldId: string; optionId: string; label: string }
  | { action: "remove"; fieldId: string; optionId: string }

const applyOptionChange = (workspaceId: string, change: OptionChange) => {
  const types = activityTypesRepository(workspaceId)
  switch (change.action) {
    case "add":
      return types.addOption(change.fieldId, change.label)
    case "rename":
      return types.renameOption(change.fieldId, change.optionId, change.label)
    case "remove":
      return types.removeOption(change.fieldId, change.optionId)
  }
}

const useChangeFieldOption = (workspaceId: string) => {
  const invalidate = useInvalidateActivities(workspaceId)
  return useMutation({
    networkMode: "always",
    mutationFn: (change: OptionChange) =>
      applyOptionChange(workspaceId, change),
    onSuccess: invalidate,
  })
}

const useRemoveTypeField = (workspaceId: string) => {
  const invalidate = useInvalidateActivities(workspaceId)
  return useMutation({
    networkMode: "always",
    mutationFn: (id: string) =>
      activityTypesRepository(workspaceId).removeField(id),
    onSuccess: invalidate,
  })
}

export {
  useAddTypeField,
  useCreateActivityType,
  useDeleteActivityType,
  useRemoveTypeField,
  useRenameTypeField,
  useRenameTypeStatus,
  useChangeFieldOption,
  useUpdateActivityType,
}
