import { queryOptions } from "@tanstack/react-query"
import { ActivitiesRepository } from "./activities"
import { AreasRepository } from "./areas"
import { getLocalDb } from "./db"

const activitiesRepository = (workspaceId: string) =>
  new ActivitiesRepository(getLocalDb(), { workspaceId })

const areasRepository = (workspaceId: string) =>
  new AreasRepository(getLocalDb(), { workspaceId })

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

export {
  activitiesRepository,
  activityKeys,
  activityListQuery,
  activityQuery,
  activitySummaryQuery,
  areasQuery,
  areasRepository,
}
export type { WorkspaceRef }
