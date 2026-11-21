import "fake-indexeddb/auto"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { QueryClient } from "@tanstack/react-query"
import { parseUtc } from "@knight-os/server/core"
import { createActivityBridge } from "@/activities/create-activity-bridge"
import { disarmRoutine, isArmed } from "@/activities/timer-runner"
import { resyncRunningRoutine, syncRoutine } from "./activity-mutations"
import {
  activitiesRepository,
  areasRepository,
  routinesRepository,
} from "./activity-queries"
import { getLocalDb } from "./db"

// The re-arm a structural change runs after it commits, against the app's own database.

const workspaceId = `ws-${crypto.randomUUID()}`

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date("2026-11-11T09:00:00.000Z"))
  vi.stubGlobal("document", { addEventListener: () => undefined })
})

afterEach(async () => {
  disarmRoutine(workspaceId)
  vi.unstubAllGlobals()
  vi.useRealTimers()
  await getLocalDb().timeEntries.clear()
  await getLocalDb().routineRuns.clear()
  await getLocalDb().activities.clear()
})

const countdown = (seconds: number) => ({
  mode: "down" as const,
  seconds,
  sound: "none" as const,
})

// A release checklist: a timed review, then a timed sign-off.
const release = async () => {
  const work = await areasRepository(workspaceId).ensureDefault("Work")
  const base = { areaId: work.id, status: "todo" as const, origin: null }
  await activitiesRepository(workspaceId).createMany([
    { ...base, id: "release", title: "Ship 2.3" },
    {
      ...base,
      id: "review",
      parentId: "release",
      title: "Review",
      timer: countdown(600),
    },
    {
      ...base,
      id: "signoff",
      parentId: "release",
      title: "Sign-off",
      timer: countdown(60),
    },
    {
      ...base,
      id: "announce",
      parentId: "release",
      title: "Announce",
      timer: countdown(60),
    },
  ])
  await routinesRepository(workspaceId).apply("release", { kind: "playAll" })
  await resyncRunningRoutine(new QueryClient(), workspaceId, true)
  return base
}

describe("re-arming after a change to a routine's tree", () => {
  it("keeps the routine armed after deleting a step that isn't playing", async () => {
    await release()
    expect(isArmed(workspaceId, "review")).toBe(true)
    await activitiesRepository(workspaceId).delete("signoff")
    await resyncRunningRoutine(new QueryClient(), workspaceId, true)
    expect(isArmed(workspaceId, "review")).toBe(true)
    expect(isArmed(workspaceId, "signoff")).toBe(false)
  })

  it("disarms once the running activity gained sub-activities and stopped", async () => {
    const base = await release()
    await activitiesRepository(workspaceId).createMany([
      { ...base, id: "notes", parentId: "review", title: "Read the diff" },
    ])
    await resyncRunningRoutine(new QueryClient(), workspaceId, true)
    expect(isArmed(workspaceId, "review")).toBe(false)
  })
})

const settled = async (check: () => boolean | Promise<boolean>) => {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await check()) return true
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  return check()
}

const bridgeUnder = (parentId: string | null) =>
  createActivityBridge({
    queryClient: new QueryClient(),
    workspace: { id: workspaceId, name: "Work" },
    origin: (blockId) => ({ kind: "document", documentId: "doc-1", blockId }),
    parentId,
    areaId: async () =>
      (await areasRepository(workspaceId).ensureDefault("Work")).id,
    open: () => undefined,
  })

describe("changes from a document", () => {
  it("disarms once a sub-activity written under the running one stops it", async () => {
    await release()
    bridgeUnder("review").create([
      {
        activityId: "diff",
        title: "Read the diff",
        status: "todo",
        blockId: "b1",
      },
    ])
    expect(await settled(() => !isArmed(workspaceId, "review"))).toBe(true)
  })

  it("disarms when undo deletes the activity that was playing", async () => {
    const bridge = bridgeUnder(null)
    bridge.create([
      { activityId: "retro", title: "Retro", status: "todo", blockId: "b2" },
    ])
    expect(
      await settled(
        async () =>
          (await activitiesRepository(workspaceId).byId("retro")) !== null
      )
    ).toBe(true)
    await activitiesRepository(workspaceId).setTimer("retro", countdown(300))
    await routinesRepository(workspaceId).apply("retro", { kind: "playAll" })
    await resyncRunningRoutine(new QueryClient(), workspaceId, true)
    expect(isArmed(workspaceId, "retro")).toBe(true)

    bridge.discard(["retro"])

    expect(await settled(() => !isArmed(workspaceId, "retro"))).toBe(true)
  })

  it("closes a timer left running on an activity that's gone and arms the real routine", async () => {
    await release()
    disarmRoutine(workspaceId)
    await getLocalDb().timeEntries.add({
      id: "orphan",
      workspaceId,
      activityId: "gone",
      startedAt: parseUtc("2026-11-11T08:00:00.000Z"),
      endedAt: null,
      source: "timer",
    })

    await resyncRunningRoutine(new QueryClient(), workspaceId, false)

    expect(isArmed(workspaceId, "review")).toBe(true)
    expect((await getLocalDb().timeEntries.get("orphan"))?.endedAt).toBe(
      "2026-11-11T09:00:00.000Z"
    )
  })

  it("a hand-over for a routine deleted meanwhile disarms without an error", async () => {
    await release()
    await activitiesRepository(workspaceId).delete("release")
    await expect(
      syncRoutine(new QueryClient(), workspaceId, "release")
    ).resolves.toBeNull()
    expect(isArmed(workspaceId, "release")).toBe(false)
  })
})
