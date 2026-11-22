import "fake-indexeddb/auto"
import { afterEach, describe, expect, it, vi } from "vitest"
import { parseUtc } from "@knight-os/server/core"
import { logPlan } from "@/activities/log-time"
import type { RoutineNode } from "@/activities/routine"
import { ActivitiesRepository } from "./activities"
import { AreasRepository } from "./areas"
import { createLocalDb, type LocalDb } from "./db"
import { InvalidLogError, TimeEntriesRepository } from "./time-entries"

const openDbs: LocalDb[] = []

afterEach(async () => {
  vi.useRealTimers()
  await Promise.all(openDbs.splice(0).map((db) => db.delete()))
})

const setup = async (workspaceId = "ws-1") => {
  const db = createLocalDb(`time-entries-test-${crypto.randomUUID()}`)
  openDbs.push(db)
  const areas = new AreasRepository(db, { workspaceId })
  const activities = new ActivitiesRepository(db, { workspaceId })
  const entries = new TimeEntriesRepository(db, { workspaceId })
  const home = await areas.ensureDefault("Knight Life")
  const create = async (title: string) => {
    const id = crypto.randomUUID()
    await activities.createMany([
      { id, areaId: home.id, title, status: "todo", origin: null },
    ])
    return id
  }
  return { db, activities, entries, create }
}

describe("TimeEntriesRepository", () => {
  it("logs time typed in afterwards as manual entries, several at once", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-11-11T09:00:00.000Z"))
    const { entries, create } = await setup()
    const warmUp = await create("Warm-up")
    const bench = await create("Bench press")
    const at = (time: string) => parseUtc(`2026-11-01T${time}.000Z`)

    await entries.log([
      {
        activityId: warmUp,
        startedAt: at("09:00:00"),
        endedAt: at("09:10:00"),
      },
      { activityId: bench, startedAt: at("09:10:00"), endedAt: at("09:35:00") },
    ])

    expect(await entries.list(warmUp)).toEqual([
      expect.objectContaining({
        startedAt: at("09:00:00"),
        endedAt: at("09:10:00"),
        source: "manual",
      }),
    ])
    const [typed] = await entries.list(warmUp)
    expect(typed?.source === "manual" && typed.loggedAt).toBe(
      "2026-11-11T09:00:00.000Z"
    )
    expect(
      (await entries.list(bench)).map((entry) => [
        entry.startedAt,
        entry.endedAt,
      ])
    ).toEqual([[at("09:10:00"), at("09:35:00")]])
  })

  it("refuses a logged session that is empty, over 24 hours or in the future", async () => {
    const { entries, create } = await setup()
    const run = await create("Run")
    const start = parseUtc("2026-11-01T09:00:00.000Z")
    const refuse = (endedAt: string) =>
      expect(
        entries.log([
          { activityId: run, startedAt: start, endedAt: parseUtc(endedAt) },
        ])
      ).rejects.toThrow(InvalidLogError)

    await refuse("2026-11-01T09:00:00.000Z")
    await refuse("2026-11-02T09:00:01.000Z")
    await expect(
      entries.log([
        {
          activityId: run,
          startedAt: parseUtc("2100-01-01T00:00:00.000Z"),
          endedAt: parseUtc("2100-01-01T01:00:00.000Z"),
        },
      ])
    ).rejects.toThrow(InvalidLogError)
    expect(await entries.list(run)).toEqual([])
  })

  it("refuses a Log time whose When is later today as in the future", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    // 20:00 in Sydney.
    vi.setSystemTime(new Date("2026-11-11T09:00:00.000Z"))
    const { entries, create } = await setup()
    const read = await create("Read")
    const node: RoutineNode = {
      id: read,
      title: "Read",
      timer: { mode: "up", sound: "none" },
      typeId: null,
      generated: null,
      series: false,
      children: [],
    }
    const plan = logPlan(
      node,
      { took: "30:00", when: { date: "2026-11-11", time: "21:00" } },
      "Australia/Sydney",
      parseUtc("2026-11-11T09:00:00.000Z")
    )
    if ("error" in plan) throw new Error(plan.error)
    await expect(entries.log(plan.sessions)).rejects.toThrow(
      "A logged session can't end in the future."
    )
    expect(await entries.list(read)).toEqual([])
  })

  it("saves none of a split log when one activity is missing", async () => {
    const { entries, create } = await setup()
    const run = await create("Run")
    const start = parseUtc("2026-11-01T09:00:00.000Z")
    const end = parseUtc("2026-11-01T09:30:00.000Z")
    await expect(
      entries.log([
        { activityId: run, startedAt: start, endedAt: end },
        { activityId: "missing", startedAt: start, endedAt: end },
      ])
    ).rejects.toThrow(InvalidLogError)
    expect(await entries.list(run)).toEqual([])
  })

  it("won't log time on another workspace's activity", async () => {
    const { db, create } = await setup()
    const run = await create("Run")
    const other = new TimeEntriesRepository(db, { workspaceId: "ws-2" })
    await expect(
      other.log([
        {
          activityId: run,
          startedAt: parseUtc("2026-11-01T09:00:00.000Z"),
          endedAt: parseUtc("2026-11-01T09:30:00.000Z"),
        },
      ])
    ).rejects.toThrow(InvalidLogError)
  })

  it("deletes an activity's entries with it and brings them back on restore", async () => {
    const { activities, entries, create } = await setup()
    const run = await create("Run")
    await entries.log([
      {
        activityId: run,
        startedAt: parseUtc("2026-11-01T09:00:00.000Z"),
        endedAt: parseUtc("2026-11-01T09:30:00.000Z"),
      },
    ])
    const logged = await entries.list(run)

    const snapshot = await activities.delete(run)
    expect(await entries.list(run)).toEqual([])
    if (!snapshot) throw new Error("Expected a snapshot")
    await activities.restore(snapshot)
    expect(await entries.list(run)).toEqual(logged)
  })

  it("closes a running timer when its activity is deleted, so undo doesn't count the gap", async () => {
    const { db, activities, entries, create } = await setup()
    const run = await create("Run")
    await db.timeEntries.add({
      id: crypto.randomUUID(),
      workspaceId: "ws-1",
      activityId: run,
      startedAt: parseUtc("2026-11-01T09:00:00.000Z"),
      endedAt: null,
      source: "timer",
    })
    const snapshot = await activities.delete(run)
    if (!snapshot) throw new Error("Expected a snapshot")
    expect(snapshot.timeEntries[0]?.endedAt).not.toBeNull()
    await activities.restore(snapshot)
    expect(await entries.running()).toBeUndefined()
  })
})
