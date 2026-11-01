import { queryOptions } from "@tanstack/react-query"
import { activityKey } from "@/activities/areas"
import { getLocalDb } from "./db"
import { ActivitiesRepository } from "./activities"
import { AreasRepository } from "./areas"
import { GoalsRepository } from "./goals"

const goalsRepository = (workspaceId: string) =>
  new GoalsRepository(getLocalDb(), { workspaceId })

const goalKeys = {
  all: (workspaceId: string) => ["local-db", workspaceId, "goals"] as const,
  list: (workspaceId: string) =>
    [...goalKeys.all(workspaceId), "list"] as const,
  detail: (workspaceId: string, id: string) =>
    [...goalKeys.all(workspaceId), "detail", id] as const,
  activities: (workspaceId: string, id: string) =>
    [...goalKeys.all(workspaceId), "activities", id] as const,
}

const goalListQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: goalKeys.list(workspaceId),
    queryFn: () => goalsRepository(workspaceId).list(),
    networkMode: "always",
    structuralSharing: false,
    staleTime: 0,
  })

const goalQuery = (workspaceId: string, id: string) =>
  queryOptions({
    queryKey: goalKeys.detail(workspaceId, id),
    queryFn: () => goalsRepository(workspaceId).byId(id),
    networkMode: "always",
    structuralSharing: false,
    staleTime: Infinity,
  })

const goalActivitiesQuery = (workspaceId: string, goalId: string) =>
  queryOptions({
    queryKey: goalKeys.activities(workspaceId, goalId),
    queryFn: async () => {
      const db = getLocalDb()
      const [activities, areas] = await Promise.all([
        new ActivitiesRepository(db, { workspaceId }).listForGoal(goalId),
        new AreasRepository(db, { workspaceId }).list(),
      ])
      return areas
        .map((area) => ({
          area,
          activities: activities
            .filter((activity) => activity.areaId === area.id)
            .sort((a, b) => a.number - b.number)
            .map((activity) => ({
              id: activity.id,
              key: activityKey(area.key, activity.number),
              title: activity.title,
              status: activity.status,
            })),
        }))
        .filter((group) => group.activities.length > 0)
    },
    networkMode: "always",
    staleTime: 0,
  })

export {
  goalActivitiesQuery,
  goalKeys,
  goalListQuery,
  goalQuery,
  goalsRepository,
}
