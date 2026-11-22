import { queryOptions } from "@tanstack/react-query"
import { resolveTypeFields, typeTree } from "@/activities/type-tree"
import { ActivitiesRepository } from "./activities"
import { ActivityTypesRepository } from "./activity-types"
import { AreasRepository } from "./areas"
import { getLocalDb } from "./db"
import { RoutinesRepository } from "./routines"
import { TimeEntriesRepository } from "./time-entries"

const activitiesRepository = (workspaceId: string) =>
  new ActivitiesRepository(getLocalDb(), { workspaceId })

const areasRepository = (workspaceId: string) =>
  new AreasRepository(getLocalDb(), { workspaceId })

const activityTypesRepository = (workspaceId: string) =>
  new ActivityTypesRepository(getLocalDb(), { workspaceId })

const timeEntriesRepository = (workspaceId: string) =>
  new TimeEntriesRepository(getLocalDb(), { workspaceId })

const routinesRepository = (workspaceId: string) =>
  new RoutinesRepository(getLocalDb(), { workspaceId })

const activityKeys = {
  all: (workspaceId: string) =>
    ["local-db", workspaceId, "activities"] as const,
  list: (workspaceId: string, areaId?: string) =>
    [...activityKeys.all(workspaceId), "list", areaId ?? "all"] as const,
  detail: (workspaceId: string, id: string) =>
    [...activityKeys.all(workspaceId), "detail", id] as const,
  summary: (workspaceId: string, id: string) =>
    [...activityKeys.all(workspaceId), "summary", id] as const,
  areas: (workspaceId: string) =>
    [...activityKeys.all(workspaceId), "areas"] as const,
  types: (workspaceId: string) =>
    [...activityKeys.all(workspaceId), "types"] as const,
  type: (workspaceId: string, id: string) =>
    [...activityKeys.types(workspaceId), id] as const,
  fields: (workspaceId: string) =>
    [...activityKeys.all(workspaceId), "fields"] as const,
  library: (workspaceId: string) =>
    [...activityKeys.fields(workspaceId), "library"] as const,
  field: (workspaceId: string, id: string) =>
    [...activityKeys.fields(workspaceId), id] as const,
  children: (workspaceId: string, parentId: string) =>
    [...activityKeys.all(workspaceId), "children", parentId] as const,
  parentCandidates: (workspaceId: string, id: string) =>
    [...activityKeys.all(workspaceId), "parent-candidates", id] as const,
  routine: (workspaceId: string, activityId: string) =>
    [...activityKeys.all(workspaceId), "routine", activityId] as const,
  activeRoutine: (workspaceId: string) =>
    [...activityKeys.all(workspaceId), "routine", "active"] as const,
}

type WorkspaceRef = {
  id: string
  name: string
}

const areasQuery = (workspace: WorkspaceRef) =>
  queryOptions({
    queryKey: activityKeys.areas(workspace.id),
    queryFn: async () => {
      const areas = areasRepository(workspace.id)
      await areas.ensureDefault(workspace.name)
      const [rows, counts] = await Promise.all([
        areas.list(),
        activitiesRepository(workspace.id).openCountsByArea(),
      ])
      return rows.map((area) => ({
        ...area,
        openCount: counts.get(area.id) ?? 0,
      }))
    },
    networkMode: "always",
    staleTime: 0,
  })

const activityListQuery = (workspaceId: string, areaId?: string) =>
  queryOptions({
    queryKey: activityKeys.list(workspaceId, areaId),
    queryFn: () => activitiesRepository(workspaceId).list({ areaId }),
    networkMode: "always",
    structuralSharing: false,
    staleTime: 0,
  })

const activityQuery = (workspaceId: string, id: string) =>
  queryOptions({
    queryKey: activityKeys.detail(workspaceId, id),
    queryFn: async () => {
      const activity = await activitiesRepository(workspaceId).byId(id)
      if (!activity) return null
      const area = await areasRepository(workspaceId).byId(activity.areaId)
      return { activity, area }
    },
    networkMode: "always",
    structuralSharing: false,
    staleTime: Infinity,
  })

const activitySummaryQuery = (workspaceId: string, id: string) =>
  queryOptions({
    queryKey: activityKeys.summary(workspaceId, id),
    queryFn: () => activitiesRepository(workspaceId).summary(id),
    networkMode: "always",
    staleTime: 0,
  })

const activityTypesQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: activityKeys.types(workspaceId),
    queryFn: async () => {
      const repository = activityTypesRepository(workspaceId)
      const [types, links, fields] = await Promise.all([
        repository.list(),
        repository.typeFieldLinks(),
        repository.library(),
      ])
      return typeTree(types).map((type) => ({
        ...type,
        fields: resolveTypeFields(types, links, fields, type.id),
      }))
    },
    networkMode: "always",
    staleTime: 0,
  })

const activityTypeQuery = (workspaceId: string, id: string) =>
  queryOptions({
    queryKey: activityKeys.type(workspaceId, id),
    queryFn: async () => {
      const types = activityTypesRepository(workspaceId)
      const type = await types.byId(id)
      if (!type) return null
      const [fields, links, activityCount] = await Promise.all([
        types.fields(id),
        types.typeLinks(id),
        types.activityCount(id),
      ])
      const ownFieldIds = links.map((link) => link.fieldId)
      return { type, fields, ownFieldIds, activityCount }
    },
    networkMode: "always",
    staleTime: 0,
  })

const activityFieldLibraryQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: activityKeys.library(workspaceId),
    queryFn: () => activityTypesRepository(workspaceId).library(),
    networkMode: "always",
    staleTime: 0,
  })

// Counting values reads every activity, so only the settings pages ask for it.
const activityFieldsQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: activityKeys.fields(workspaceId),
    queryFn: async () => {
      const repository = activityTypesRepository(workspaceId)
      const [fields, usage] = await Promise.all([
        repository.library(),
        repository.fieldUsage(),
      ])
      return fields.map((field) => ({
        ...field,
        typeIds: usage.get(field.id)?.typeIds ?? [],
        valueCount: usage.get(field.id)?.valueCount ?? 0,
      }))
    },
    networkMode: "always",
    staleTime: 0,
  })

const activityFieldQuery = (workspaceId: string, id: string) =>
  queryOptions({
    queryKey: activityKeys.field(workspaceId, id),
    queryFn: async () => {
      const repository = activityTypesRepository(workspaceId)
      const field = await repository.fieldById(id)
      if (!field) return null
      const usage = (await repository.fieldUsage()).get(id)
      return {
        field,
        typeIds: usage?.typeIds ?? [],
        valueCount: usage?.valueCount ?? 0,
      }
    },
    networkMode: "always",
    staleTime: 0,
  })

const optionValueCountQuery = (
  workspaceId: string,
  fieldId: string,
  optionId: string
) =>
  queryOptions({
    queryKey: [...activityKeys.field(workspaceId, fieldId), "option", optionId],
    queryFn: () =>
      activityTypesRepository(workspaceId).optionValueCount(fieldId, optionId),
    networkMode: "always",
    staleTime: 0,
  })

const subActivitiesQuery = (workspaceId: string, parentId: string) =>
  queryOptions({
    queryKey: activityKeys.children(workspaceId, parentId),
    queryFn: () => activitiesRepository(workspaceId).subActivities(parentId),
    networkMode: "always",
    staleTime: 0,
  })

const parentCandidatesQuery = (workspaceId: string, id: string) =>
  queryOptions({
    queryKey: activityKeys.parentCandidates(workspaceId, id),
    queryFn: () => activitiesRepository(workspaceId).parentCandidates(id),
    networkMode: "always",
    staleTime: 0,
  })

const routineQuery = (workspaceId: string, activityId: string) =>
  queryOptions({
    queryKey: activityKeys.routine(workspaceId, activityId),
    queryFn: () => routinesRepository(workspaceId).state(activityId),
    networkMode: "always",
    staleTime: 0,
  })

const activeRoutineQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: activityKeys.activeRoutine(workspaceId),
    queryFn: () => routinesRepository(workspaceId).active(),
    networkMode: "always",
    staleTime: 0,
  })

export {
  activeRoutineQuery,
  activitiesRepository,
  activityFieldLibraryQuery,
  activityFieldQuery,
  activityFieldsQuery,
  activityTypeQuery,
  activityTypesQuery,
  activityTypesRepository,
  activityKeys,
  activityListQuery,
  activityQuery,
  activitySummaryQuery,
  areasQuery,
  areasRepository,
  optionValueCountQuery,
  parentCandidatesQuery,
  routineQuery,
  routinesRepository,
  subActivitiesQuery,
  timeEntriesRepository,
}
export type { WorkspaceRef }
