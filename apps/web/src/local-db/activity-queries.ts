import { queryOptions } from "@tanstack/react-query"
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
      const types = activityTypesRepository(workspaceId)
      const rows = await types.list()
      return Promise.all(
        rows.map(async (type) => ({
          ...type,
          fields: await types.fields(type.id),
        }))
      )
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
      const [fields, activityCount] = await Promise.all([
        types.fields(id),
        types.activityCount(id),
      ])
      return { type, fields, activityCount }
    },
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
  activityTypeQuery,
  activityTypesQuery,
  activityTypesRepository,
  activityKeys,
  activityListQuery,
  activityQuery,
  activitySummaryQuery,
  areasQuery,
  areasRepository,
  parentCandidatesQuery,
  routineQuery,
  routinesRepository,
  subActivitiesQuery,
  timeEntriesRepository,
}
export type { WorkspaceRef }
