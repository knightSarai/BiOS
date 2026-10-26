import { QueryObserver, type QueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import type { ActivityBridge } from "@/editor/activity-bridge"
import type { DeletedActivity } from "@/local-db/activities"
import type { ActivityOrigin } from "@/local-db/db"
import {
  activitiesRepository,
  activityKeys,
  activitySummaryQuery,
  type WorkspaceRef,
} from "@/local-db/activity-queries"

type ActivityBridgeOptions = {
  queryClient: QueryClient
  workspace: WorkspaceRef
  origin: (blockId: string | null) => ActivityOrigin
  areaId: () => Promise<string>
  open: (activityId: string) => void
}

const countLabel = (count: number) =>
  count === 1 ? "1 activity" : `${count} activities`

const createActivityBridge = (
  options: ActivityBridgeOptions
): ActivityBridge => {
  const repository = activitiesRepository(options.workspace.id)
  const pending = new Set<string>()
  const createdHere = new Set<string>()
  const discarded = new Map<string, DeletedActivity>()
  let queue: Promise<void> = Promise.resolve()

  // Creating, discarding and restoring run one after another, so an undo that
  // lands while its activities are still being created waits for them.
  const enqueue = (task: () => Promise<void>) => {
    queue = queue.then(task).catch(() => {
      toast.error("Something went wrong while updating activities.")
    })
  }

  const invalidate = () =>
    options.queryClient.invalidateQueries({
      queryKey: activityKeys.all(options.workspace.id),
    })

  const create: ActivityBridge["create"] = (drafts) => {
    const ids = drafts.map((draft) => draft.activityId)
    for (const id of ids) {
      pending.add(id)
      createdHere.add(id)
    }

    enqueue(async () => {
      let created: Awaited<ReturnType<typeof repository.insertMany>>
      try {
        const areaId = await options.areaId()
        created = await repository.insertMany(
          drafts.map((draft) => ({
            id: draft.activityId,
            areaId,
            title: draft.title,
            status: draft.status,
            origin: options.origin(draft.blockId),
          }))
        )
      } catch {
        for (const id of ids) pending.delete(id)
        await invalidate()
        toast.error(
          "Couldn't create the activities. Undo to get the text back."
        )
        return
      }

      await invalidate()
      for (const id of ids) pending.delete(id)
      const [first] = created
      toast.success(
        created.length === 1 && first
          ? `Created ${first.key}`
          : `Created ${countLabel(created.length)}`
      )
      try {
        await repository.seedContents(
          drafts.map((draft) => ({ id: draft.activityId, title: draft.title }))
        )
      } catch {
        toast.error(
          "The activities were created, but their pages couldn't be prepared. They'll be repaired when you open them."
        )
      }
    })
  }

  const discard: ActivityBridge["discard"] = (activityIds) => {
    const ownIds = activityIds.filter((id) => createdHere.has(id))
    if (ownIds.length === 0) return
    enqueue(async () => {
      let removed = 0
      try {
        for (const id of ownIds) {
          const snapshot = await repository.delete(id)
          if (snapshot) {
            discarded.set(id, snapshot)
            options.queryClient.removeQueries({
              queryKey: activityKeys.detail(options.workspace.id, id),
            })
            removed += 1
          }
        }
      } catch {
        toast.error("Undo couldn't remove the activities it created.")
      }
      await invalidate()
      if (removed > 0) toast(`Undo removed ${countLabel(removed)}`)
    })
  }

  const restore: ActivityBridge["restore"] = (activityIds) => {
    if (!activityIds.some((id) => createdHere.has(id))) return
    enqueue(async () => {
      let restored = 0
      try {
        for (const id of activityIds) {
          const snapshot = discarded.get(id)
          if (!snapshot) continue
          const wasRestored = await repository.restore(snapshot)
          discarded.delete(id)
          if (wasRestored) restored += 1
        }
      } catch {
        toast.error("Redo couldn't bring the activities back.")
      }
      await invalidate()
      if (restored > 0) toast(`Redo brought back ${countLabel(restored)}`)
    })
  }

  return {
    observe: (activityId, onChange) => {
      const observer = new QueryObserver(
        options.queryClient,
        activitySummaryQuery(options.workspace.id, activityId)
      )
      const emit = (
        summary: ReturnType<typeof observer.getCurrentResult>["data"]
      ) =>
        onChange(
          summary === null && pending.has(activityId) ? undefined : summary
        )
      emit(observer.getCurrentResult().data)
      return observer.subscribe((result) => emit(result.data))
    },
    toggleDone: (activityId) => {
      repository.toggleDone(activityId).then(invalidate, () => {
        toast.error("Couldn't update that activity.")
      })
    },
    open: options.open,
    create,
    discard,
    restore,
  }
}

export { createActivityBridge }
export type { ActivityBridgeOptions }
