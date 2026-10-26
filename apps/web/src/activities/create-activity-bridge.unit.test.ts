import "fake-indexeddb/auto"
import { QueryClient } from "@tanstack/react-query"
import { describe, expect, it } from "vitest"
import type { ActivityChipSummary } from "@/editor/activity-bridge"
import {
  activitiesRepository,
  areasRepository,
} from "@/local-db/activity-queries"
import { createActivityBridge } from "./create-activity-bridge"

const pause = () => new Promise((resolve) => setTimeout(resolve, 10))

const waitFor = async <T>(read: () => Promise<T> | T) => {
  for (let attempt = 0; attempt < 100; attempt++) {
    const value = await read()
    if (value) return value
    await pause()
  }
  throw new Error("Timed out waiting for the condition")
}

const setup = (
  workspace = { id: `ws-${crypto.randomUUID()}`, name: "Knight Life" }
) => {
  const bridge = createActivityBridge({
    queryClient: new QueryClient(),
    workspace,
    origin: (blockId) => ({ kind: "document", documentId: "doc-1", blockId }),
    areaId: async () =>
      (await areasRepository(workspace.id).ensureDefault(workspace.name)).id,
    open: () => undefined,
  })
  const repository = activitiesRepository(workspace.id)
  return { bridge, repository, workspace }
}

describe("createActivityBridge", () => {
  it("shows a new chip as loading, never missing, until its activity exists", async () => {
    const { bridge } = setup()
    const seen: (ActivityChipSummary | null | undefined)[] = []
    bridge.create([
      { activityId: "act-1", title: "Spar", status: "todo", blockId: "b1" },
    ])
    const unsubscribe = bridge.observe("act-1", (summary) => seen.push(summary))

    await waitFor(() => seen.some((summary) => summary?.key === "KNI-1"))
    unsubscribe()
    expect(seen).not.toContain(null)
    expect(seen.at(-1)).toMatchObject({ key: "KNI-1", title: "Spar" })
  })

  it("records the status and where the activity was written", async () => {
    const { bridge, repository } = setup()
    bridge.create([
      { activityId: "act-2", title: "Weigh in", status: "done", blockId: "b9" },
    ])
    const row = await waitFor(() => repository.byId("act-2"))
    expect(row).toMatchObject({
      status: "done",
      origin: { kind: "document", documentId: "doc-1", blockId: "b9" },
    })
  })
})

describe("undo and redo of created activities", () => {
  it("deletes on undo and brings the same activity back on redo", async () => {
    const { bridge, repository } = setup()
    bridge.create([
      { activityId: "act-4", title: "Spar", status: "todo", blockId: null },
    ])
    await waitFor(() => repository.byId("act-4"))
    bridge.discard(["act-4"])
    await waitFor(async () => (await repository.byId("act-4")) === null)
    bridge.restore(["act-4"])
    const back = await waitFor(() => repository.summary("act-4"))
    expect(back).toMatchObject({ key: "KNI-1", title: "Spar" })
  })

  it("waits for creation when undo comes first, so nothing is left behind", async () => {
    const { bridge, repository } = setup()
    bridge.create([
      { activityId: "act-5", title: "Run", status: "todo", blockId: null },
    ])
    bridge.discard(["act-5"])
    bridge.create([
      { activityId: "act-6", title: "Marker", status: "todo", blockId: null },
    ])
    await waitFor(() => repository.byId("act-6"))
    expect(await repository.byId("act-5")).toBeNull()
  })

  it("leaves activities it did not create alone", async () => {
    const { bridge, repository, workspace } = setup()
    const other = setup(workspace)
    other.bridge.create([
      { activityId: "act-7", title: "Theirs", status: "todo", blockId: null },
    ])
    await waitFor(() => other.repository.byId("act-7"))
    bridge.discard(["act-7"])
    bridge.create([
      { activityId: "act-8", title: "Marker", status: "todo", blockId: null },
    ])
    await waitFor(() => repository.byId("act-8"))
    expect(await other.repository.byId("act-7")).not.toBeNull()
  })
})

describe("ActivitiesRepository title safety", () => {
  it("never replaces a stored title with an empty one when a body loads empty", async () => {
    const { bridge, repository } = setup()
    bridge.create([
      {
        activityId: "act-3",
        title: "Find a gym",
        status: "todo",
        blockId: null,
      },
    ])
    await waitFor(() => repository.byId("act-3"))
    await repository.syncTitle("act-3", "")
    expect((await repository.byId("act-3"))?.title).toBe("Find a gym")
    await repository.syncTitle("act-3", "Find a boxing gym")
    expect((await repository.byId("act-3"))?.title).toBe("Find a boxing gym")
  })
})
