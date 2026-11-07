import "fake-indexeddb/auto"
import { afterEach, describe, expect, it } from "vitest"
import { parseUtc } from "@knight-os/server/core"
import { timerLaps } from "@/activities/timer"
import { ActivitiesRepository } from "./activities"
import { AreasRepository } from "./areas"
import { createLocalDb, type LocalDb } from "./db"
import { TimeEntriesRepository } from "./time-entries"

const openDbs: LocalDb[] = []

afterEach(async () => {
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
  it("runs one timer at a time, stopping the other when a new one starts", async () => {
    const { entries, create } = await setup()
    const run = await create("Run")
    const spar = await create("Spar")

    await entries.start(run)
    await entries.start(spar)

    const [runEntry] = await entries.list(run)
    expect(runEntry?.endedAt).not.toBeNull()
    expect((await entries.running())?.activityId).toBe(spar)
  })

  it("does not open a second entry when the same timer starts twice", async () => {
    const { entries, create } = await setup()
    const run = await create("Run")
    await entries.start(run)
    await entries.start(run)
    expect(await entries.list(run)).toHaveLength(1)
  })

  it("never ends an entry before it started", async () => {
    const { entries, create } = await setup()
    const run = await create("Run")
    const started = await entries.start(run)
    await entries.stop(run, parseUtc("2000-01-01T00:00:00.000Z"))
    const [entry] = await entries.list(run)
    expect(entry?.endedAt).toBe(started.startedAt)
  })

  it("records a lap by closing the running entry and opening the next at the same moment", async () => {
    const { entries, create } = await setup()
    const run = await create("Run")
    const started = await entries.start(run)
    const lappedAt = parseUtc("2100-01-01T00:00:00.000Z")

    const next = await entries.lap(run, lappedAt)

    const [lapped, running] = await entries.list(run)
    expect(lapped).toMatchObject({
      id: started.id,
      endedAt: lappedAt,
      endsLap: true,
    })
    expect(running).toMatchObject({
      id: next?.id,
      startedAt: lappedAt,
      endedAt: null,
    })
    expect(timerLaps(await entries.list(run))).toHaveLength(1)
  })

  it("records no lap while the timer is paused, or twice at the same moment", async () => {
    const { entries, create } = await setup()
    const run = await create("Run")
    expect(
      await entries.lap(run, parseUtc("2100-01-01T00:00:00.000Z"))
    ).toBeNull()

    const started = await entries.start(run)
    expect(await entries.lap(run, started.startedAt)).toBeNull()
    expect(await entries.list(run)).toHaveLength(1)
  })

  it("brings laps back when a reset is undone", async () => {
    const { entries, create } = await setup()
    const run = await create("Run")
    await entries.start(run)
    await entries.lap(run, parseUtc("2100-01-01T00:00:00.000Z"))
    await entries.stop(run, parseUtc("2100-01-01T00:01:00.000Z"))

    const cleared = await entries.clear(run)
    expect(timerLaps(await entries.list(run))).toEqual([])
    await entries.restore(cleared)
    expect(timerLaps(await entries.list(run))).toHaveLength(1)
  })

  it("clears an activity's entries and restores them", async () => {
    const { entries, create } = await setup()
    const run = await create("Run")
    await entries.start(run)
    await entries.stop(run, parseUtc("2100-01-01T00:00:00.000Z"))

    const cleared = await entries.clear(run)
    expect(await entries.list(run)).toEqual([])
    await entries.restore(cleared)
    expect(await entries.list(run)).toEqual(cleared)
  })

  it("won't time another workspace's activity", async () => {
    const { db, create } = await setup()
    const run = await create("Run")
    const other = new TimeEntriesRepository(db, { workspaceId: "ws-2" })
    await expect(other.start(run)).rejects.toThrow()
  })

  it("deletes an activity's entries with it and brings them back on restore", async () => {
    const { activities, entries, create } = await setup()
    const run = await create("Run")
    await entries.start(run)
    await entries.stop(run, parseUtc("2100-01-01T00:00:00.000Z"))
    const logged = await entries.list(run)

    const snapshot = await activities.delete(run)
    expect(await entries.list(run)).toEqual([])
    if (!snapshot) throw new Error("Expected a snapshot")
    await activities.restore(snapshot)
    expect(await entries.list(run)).toEqual(logged)
  })

  it("closes a running timer when its activity is deleted, so undo doesn't count the gap", async () => {
    const { activities, entries, create } = await setup()
    const run = await create("Run")
    await entries.start(run)
    const snapshot = await activities.delete(run)
    if (!snapshot) throw new Error("Expected a snapshot")
    expect(snapshot.timeEntries[0]?.endedAt).not.toBeNull()
    await activities.restore(snapshot)
    expect(await entries.running()).toBeUndefined()
  })
})
