import { useMemo } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useRouter } from "@tanstack/react-router"
import {
  activitiesRepository,
  areasRepository,
} from "@/local-db/activity-queries"
import { createActivityBridge } from "./create-activity-bridge"

type BridgeWorkspace = {
  id: string
  name: string
  slug: string
}

type BridgeSource =
  | { kind: "document"; documentId: string }
  | { kind: "activity"; activityId: string }

const useActivityBridge = (
  workspace: BridgeWorkspace,
  source: BridgeSource
) => {
  const queryClient = useQueryClient()
  const router = useRouter()
  const sourceId =
    source.kind === "document" ? source.documentId : source.activityId

  // The editor mounts once per bridge, so a new bridge each render would remount it.
  return useMemo(
    () =>
      createActivityBridge({
        queryClient,
        workspace: { id: workspace.id, name: workspace.name },
        origin: (blockId) =>
          source.kind === "document"
            ? { kind: "document", documentId: sourceId, blockId }
            : { kind: "activity", activityId: sourceId, blockId },
        areaId: async () => {
          if (source.kind === "activity") {
            const parent = await activitiesRepository(workspace.id).byId(
              sourceId
            )
            if (parent) return parent.areaId
          }
          const area = await areasRepository(workspace.id).ensureDefault(
            workspace.name
          )
          return area.id
        },
        open: (activityId) => {
          void router.navigate({
            to: "/$workspace/activities/$activityId",
            params: { workspace: workspace.slug, activityId },
          })
        },
      }),
    [
      queryClient,
      router,
      workspace.id,
      workspace.name,
      workspace.slug,
      source.kind,
      sourceId,
    ]
  )
}

export { useActivityBridge }
