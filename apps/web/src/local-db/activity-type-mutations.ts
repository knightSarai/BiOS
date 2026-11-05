import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { FieldKind } from "@/activities/fields"
import type { ActivityTypeChanges, NewActivityType } from "./activity-types"
import { activityKeys, activityTypesRepository } from "./activity-queries"

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

const useUpdateActivityType = (workspaceId: string) => {
  const invalidate = useInvalidateActivities(workspaceId)
  return useMutation({
    networkMode: "always",
    mutationFn: ({
      id,
      changes,
    }: {
      id: string
      changes: ActivityTypeChanges
    }) => activityTypesRepository(workspaceId).update(id, changes),
    onSuccess: invalidate,
  })
}

const useDeleteActivityType = (workspaceId: string) => {
  const invalidate = useInvalidateActivities(workspaceId)
  return useMutation({
    networkMode: "always",
    mutationFn: (id: string) => activityTypesRepository(workspaceId).delete(id),
    onSuccess: invalidate,
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
  useChangeFieldOption,
  useUpdateActivityType,
}
