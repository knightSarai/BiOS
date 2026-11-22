import "fake-indexeddb/auto"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { parseUtc } from "@knight-os/server/core"
import { faceOf, findNode, loggedSeconds } from "@/activities/routine"
import { primaryOf } from "@/activities/routine-view"
import { ActivitiesRepository } from "./activities"
import { ActivityTypesRepository } from "./activity-types"
import { AreasRepository } from "./areas"
import { createLocalDb, type LocalDb, type TimeEntryRow } from "./db"
import { RoutinesRepository } from "./routines"
import { TimeEntriesRepository } from "./time-entries"

const openDbs: LocalDb[] = []

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date("2026-11-11T09:00:00.000Z"))
})

afterEach(async () => {
  vi.useRealTimers()
  await Promise.all(openDbs.splice(0).map((db) => db.delete()))
})

const later = (seconds: number) =>
  vi.setSystemTime(new Date(Date.now() + seconds * 1000))

const down = (seconds: number) => ({
  mode: "down" as const,
  seconds,
  sound: "none" as const,
})

// A release checklist: a timed review, then two generated focus rounds.
const setup = async () => {
  const db = createLocalDb(`routines-test-${crypto.randomUUID()}`)
  openDbs.push(db)
  const ctx = { workspaceId: "ws-1" }
  const areas = new AreasRepository(db, ctx)
  const activities = new ActivitiesRepository(db, ctx)
  const routines = new RoutinesRepository(db, ctx)
  const entries = new TimeEntriesRepository(db, ctx)
  const work = await areas.ensureDefault("Work")
  const base = { areaId: work.id, status: "todo" as const, origin: null }
  await activities.createMany([
    { ...base, id: "release", title: "Ship 2.3" },
    {
      ...base,
      id: "review",
      parentId: "release",
      title: "Review",
      timer: down(600),
    },
    { ...base, id: "focus", parentId: "release", title: "Focus", series: true },
    {
      ...base,
      id: "round1",
      parentId: "focus",
      title: "Round 1",
      timer: down(60),
      generated: "step",
    },
    {
      ...base,
      id: "round2",
      parentId: "focus",
      title: "Round 2",
      timer: down(60),
      generated: "step",
    },
    { ...base, id: "notes", title: "Release notes" },
    { ...base, id: "standup", title: "Standup", timer: down(300) },
    { ...base, id: "drill", title: "Drill" },
    {
      ...base,
      id: "warmup",
      parentId: "drill",
      title: "Warm-up",
      timer: down(60),
    },
    { ...base, id: "practice", parentId: "drill", title: "Practice" },
  ])
  return { db, activities, routines, entries }
}

describe("RoutinesRepository", () => {
  it("plays from any activity in the tree and remembers where it is", async () => {
    const { routines, entries } = await setup()
    const session = await routines.apply("round1", { kind: "playAll" })
    expect(session.root.id).toBe("release")
    expect(session.current?.node.id).toBe("review")
    expect(await entries.running()).toMatchObject({
      activityId: "review",
      source: "timer",
    })
    later(30)
    expect((await routines.session("release"))?.phase).toBe("running")
  })

  it("writes hand-overs that happened while nobody acted, and ticks the generated rounds", async () => {
    const { routines, entries, activities } = await setup()
    await routines.apply("release", { kind: "playAll" })
    later(600 + 60 + 30)

    await routines.apply("release", { kind: "sync" })

    expect((await entries.list("review"))[0]?.endedAt).toBe(
      "2026-11-11T09:10:00.000Z"
    )
    expect((await entries.list("round1"))[0]).toMatchObject({
      startedAt: "2026-11-11T09:10:00.000Z",
      endedAt: "2026-11-11T09:11:00.000Z",
    })
    expect((await activities.byId("round1"))?.status).toBe("done")
    expect((await activities.byId("review"))?.status).toBe("todo")
    expect((await entries.running())?.activityId).toBe("round2")
  })

  it("stores laps as sub-activities of the lapped activity", async () => {
    const { routines, entries, activities } = await setup()
    await routines.apply("notes", { kind: "playAll" })
    later(240)
    await routines.apply("notes", { kind: "lap" })

    const laps = await activities.children("notes")
    expect(laps.map((lap) => [lap.title, lap.generated, lap.status])).toEqual([
      ["Lap 1", "lap", "done"],
      ["Lap 2", "lap", "todo"],
    ])
    expect(await entries.list("notes")).toEqual([])
    expect((await entries.list(laps[0].id))[0]?.endedAt).toBe(
      "2026-11-11T09:04:00.000Z"
    )
    expect((await entries.running())?.activityId).toBe(laps[1]?.id)
  })

  it("starting a routine stops a timer running elsewhere", async () => {
    const { routines, entries } = await setup()
    await routines.apply("notes", { kind: "playAll" })
    later(60)
    await routines.apply("release", { kind: "playAll" })

    expect((await entries.list("notes"))[0]?.endedAt).toBe(
      "2026-11-11T09:01:00.000Z"
    )
    expect((await entries.running())?.activityId).toBe("review")
  })

  it("start over reopens what was ticked and keeps the time logged", async () => {
    const { routines, entries, activities } = await setup()
    await routines.apply("release", { kind: "playAll" })
    later(30)
    await routines.apply("release", { kind: "toggleDone", id: "review" })
    expect((await activities.byId("review"))?.status).toBe("done")

    later(10)
    const session = await routines.apply("release", { kind: "startOver" })

    expect(session.phase).toBe("idle")
    expect((await activities.byId("review"))?.status).toBe("todo")
    expect(await entries.running()).toBeUndefined()
    expect(await entries.list("review")).toHaveLength(1)
  })

  it("keeps the last unfinished routine in reach", async () => {
    const { routines } = await setup()
    expect(await routines.active()).toBeNull()
    await routines.apply("release", { kind: "playAll" })
    later(5)
    await routines.apply("release", { kind: "pause" })
    expect((await routines.active())?.root.id).toBe("release")
    expect((await routines.state("round2"))?.run.cursor).toBe("review")
  })

  it("passes time typed in through the timer untouched", async () => {
    const { routines, entries } = await setup()
    const [typed] = await entries.log([
      {
        activityId: "review",
        startedAt: parseUtc("2026-11-10T17:00:00.000Z"),
        endedAt: parseUtc("2026-11-10T17:25:00.000Z"),
      },
    ])
    later(5)

    const started = await routines.apply("release", { kind: "playAll" })
    expect(started.run.entries.find((entry) => entry.manual)).toMatchObject({
      id: typed?.id,
      manual: true,
    })
    later(30)
    await routines.apply("release", { kind: "pause" })
    later(10)
    await routines.apply("release", { kind: "startOver" })

    const review = await entries.list("review")
    expect(review.filter((entry) => entry.source === "manual")).toEqual([typed])
    expect(review).toHaveLength(2)
  })

  it("counts a session typed in after Start over, though it ended before", async () => {
    const { routines, entries } = await setup()
    await routines.apply("release", { kind: "playAll" })
    later(60)
    await routines.apply("release", { kind: "startOver" })
    later(60)
    await entries.log([
      {
        activityId: "review",
        startedAt: parseUtc("2026-11-10T17:00:00.000Z"),
        endedAt: parseUtc("2026-11-10T17:25:00.000Z"),
      },
    ])

    const session = await routines.session("release")
    if (!session) throw new Error("Expected a session")
    expect(session.phase).toBe("idle")
    expect(loggedSeconds(session.run, session.root, session.now)).toBe(1500)

    later(60)
    const again = await routines.apply("release", { kind: "startOver" })
    expect(loggedSeconds(again.run, again.root, again.now)).toBe(0)
  })

  it("stopping another routine after Start over keeps its new attempt's time", async () => {
    const { db, routines, entries } = await setup()
    await routines.apply("standup", { kind: "playAll" })
    later(300)
    await routines.apply("standup", { kind: "sync" })
    later(100)
    await routines.apply("standup", { kind: "startOver" })
    later(100)
    await routines.apply("standup", { kind: "playAll" })
    later(100)

    await routines.apply("release", { kind: "playAll" })

    const standup = await entries.list("standup")
    expect(standup.map((entry) => [entry.startedAt, entry.endedAt])).toEqual([
      ["2026-11-11T09:00:00.000Z", "2026-11-11T09:05:00.000Z"],
      ["2026-11-11T09:08:20.000Z", "2026-11-11T09:10:00.000Z"],
    ])
    expect((await entries.running())?.activityId).toBe("review")
    const stopped = await routines.session("standup")
    expect(stopped?.phase).toBe("paused")
    expect((await db.routineRuns.get("standup"))?.cursor).toBe("standup")
  })

  it("stopping another routine keeps a countdown played again after it ran out", async () => {
    const { routines, entries } = await setup()
    await routines.apply("drill", { kind: "playAll" })
    later(70)
    await routines.apply("drill", { kind: "jumpTo", id: "warmup" })
    await routines.apply("drill", { kind: "play" })
    later(20)

    await routines.apply("notes", { kind: "playAll" })

    const warmup = await entries.list("warmup")
    expect(warmup.map((entry) => [entry.startedAt, entry.endedAt])).toEqual([
      ["2026-11-11T09:00:00.000Z", "2026-11-11T09:01:00.000Z"],
      ["2026-11-11T09:01:10.000Z", "2026-11-11T09:01:30.000Z"],
    ])
    expect((await routines.session("drill"))?.current?.node.id).toBe("warmup")
  })

  it("ticking an activity of a routine never played leaves it idle and out of reach", async () => {
    const { db, routines, entries } = await setup()
    await db.timeEntries.add({
      id: "history",
      workspaceId: "ws-1",
      activityId: "review",
      startedAt: parseUtc("2026-11-01T09:00:00.000Z"),
      endedAt: parseUtc("2026-11-01T09:05:00.000Z"),
      source: "timer",
    })
    expect((await routines.session("release"))?.phase).toBe("idle")

    const ticked = await routines.apply(
      "round1",
      { kind: "toggleDone", id: "round1" },
      "focus"
    )

    expect(ticked.phase).toBe("idle")
    expect(ticked.run.scopeId).toBeNull()
    expect(await db.routineRuns.count()).toBe(0)
    expect(await routines.active()).toBeNull()
    expect(await entries.running()).toBeUndefined()
  })

  it("ticking a box on a paused routine keeps where it is", async () => {
    const { db, routines } = await setup()
    await routines.apply("release", { kind: "playAll" })
    later(5)
    await routines.apply("release", { kind: "pause" })
    const before = await db.routineRuns.get("release")
    later(5)
    await routines.apply(
      "round2",
      { kind: "toggleDone", id: "round2" },
      "focus"
    )
    expect(await db.routineRuns.get("release")).toEqual(before)
  })

  it("dates each step ticked by a late sync when it really ended", async () => {
    const { routines, activities } = await setup()
    await routines.apply("release", { kind: "playAll" })
    later(600 + 120 + 300)
    await routines.apply("release", { kind: "sync" })
    expect((await activities.byId("round1"))?.completedAt).toBe(
      "2026-11-11T09:11:00.000Z"
    )
    expect((await activities.byId("round2"))?.completedAt).toBe(
      "2026-11-11T09:12:00.000Z"
    )
  })

  it("carries on from the next open activity when the one it was on is deleted", async () => {
    const { routines, activities } = await setup()
    await routines.apply("release", { kind: "playAll" })
    later(10)
    await routines.apply("release", { kind: "pause" })
    await activities.delete("review")
    const session = await routines.session("release")
    expect(session?.current?.node.id).toBe("round1")
    const resumed = await routines.apply("release", { kind: "play" })
    expect(resumed.phase).toBe("running")
    expect(resumed.current?.node.id).toBe("round1")
  })

  it("stops a running activity that gains sub-activities and waits on the first one", async () => {
    const { db, routines, entries, activities } = await setup()
    await routines.apply("notes", { kind: "playAll" })
    later(90)
    const base = {
      areaId: (await activities.byId("notes"))?.areaId ?? "",
      status: "todo" as const,
      origin: null,
    }
    await activities.createMany([
      { ...base, id: "draft", parentId: "notes", title: "Draft" },
      { ...base, id: "proof", parentId: "notes", title: "Proofread" },
    ])

    expect(await entries.running()).toBeUndefined()
    expect((await entries.list("notes"))[0]?.endedAt).toBe(
      "2026-11-11T09:01:30.000Z"
    )
    expect((await db.routineRuns.get("notes"))?.cursor).toBe("draft")
    const session = await routines.session("notes")
    expect(session?.phase).toBe("paused")
    expect(session?.current?.node.id).toBe("draft")
    if (!session) throw new Error("Expected a session")
    expect(loggedSeconds(session.run, session.root, session.now)).toBe(90)
  })

  it("stops a running activity that gains a series", async () => {
    const { routines, entries, activities } = await setup()
    await routines.apply("standup", { kind: "playAll" })
    later(30)
    const areaId = (await activities.byId("standup"))?.areaId ?? ""
    const repeat = (id: string, generated: "step" | "gap") => ({
      id,
      areaId,
      title: id,
      status: "todo" as const,
      origin: null,
      generated,
    })
    await activities.addSeries(
      "standup",
      { id: "unused", areaId, title: "Standup", status: "todo", origin: null },
      [
        repeat("update1", "step"),
        repeat("pause", "gap"),
        repeat("update2", "step"),
      ]
    )
    expect(await entries.running()).toBeUndefined()
    expect((await routines.session("standup"))?.current?.node.id).toBe(
      "update1"
    )
  })

  it("keeps time from before a move out of the run of the routine it joins", async () => {
    const { db, routines } = await setup()
    await routines.apply("drill", { kind: "playAll" })
    later(70)
    await routines.apply("drill", { kind: "pause" })
    later(10)
    await routines.apply("release", { kind: "playAll" })
    later(10)
    await routines.apply("release", { kind: "pause" })
    later(10)

    await routines.move("drill", "release")

    expect(await db.routineRuns.get("drill")).toBeUndefined()
    const session = await routines.session("release")
    if (!session) throw new Error("Expected a session")
    const drill = session.root.children.find((child) => child.id === "drill")
    if (!drill) throw new Error("Expected drill under release")
    expect(loggedSeconds(session.run, drill, session.now)).toBe(0)
    expect(loggedSeconds(session.run, session.root, session.now)).toBe(10)
  })

  it("pauses a running activity moved out, and its own routine keeps where the run began", async () => {
    const { db, routines, entries } = await setup()
    await routines.apply("release", { kind: "playAll" })
    later(600 + 20)
    await routines.apply("release", { kind: "pause" })
    later(10)
    await routines.apply("release", { kind: "startOver" })
    later(10)
    await routines.apply("release", { kind: "jumpTo", id: "round1" })
    await routines.apply("release", { kind: "play" })
    later(20)

    await routines.move("focus", null)

    expect(await entries.running()).toBeUndefined()
    const round1 = await entries.list("round1")
    expect(round1.at(-1)?.endedAt).toBe("2026-11-11T09:11:00.000Z")
    const own = await db.routineRuns.get("focus")
    expect(own?.runStart).toBe("2026-11-11T09:10:30.000Z")
    const session = await routines.session("focus")
    if (!session) throw new Error("Expected a session")
    expect(loggedSeconds(session.run, session.root, session.now)).toBe(20)
    expect((await db.routineRuns.get("release"))?.cursor).toBeNull()
  })

  it("forgets a deleted routine's run and skips runs whose routine is gone", async () => {
    const { db, routines, activities } = await setup()
    await routines.apply("release", { kind: "playAll" })
    later(5)
    await routines.apply("release", { kind: "pause" })
    for (const id of ["a", "b", "c", "d", "e", "f"]) {
      await db.routineRuns.put({
        id,
        workspaceId: "ws-1",
        cursor: null,
        passed: [],
        replay: [],
        scopeId: null,
        runStart: null,
        attemptFrom: {},
        joinedAt: {},
        updatedAt: parseUtc("2026-11-11T10:00:00.000Z"),
      })
    }
    await db.routineRuns.put({
      id: "focus",
      workspaceId: "ws-1",
      cursor: null,
      passed: [],
      replay: [],
      scopeId: null,
      runStart: null,
      attemptFrom: {},
      joinedAt: {},
      updatedAt: parseUtc("2026-11-11T10:00:00.000Z"),
    })
    expect((await routines.active())?.root.id).toBe("release")

    await activities.delete("release")
    expect(await db.routineRuns.get("release")).toBeUndefined()
  })

  it("never reads another workspace's run", async () => {
    const { db, routines } = await setup()
    await db.routineRuns.put({
      id: "standup",
      workspaceId: "ws-2",
      cursor: "standup",
      passed: [],
      replay: [],
      scopeId: null,
      runStart: null,
      attemptFrom: {},
      joinedAt: {},
      updatedAt: parseUtc("2026-11-11T09:00:00.000Z"),
    })
    expect((await routines.session("standup"))?.run.started).toBe(false)
  })

  it("stores a countdown that ran out on a millisecond clock as finished", async () => {
    const { routines, entries } = await setup()
    const clock = (time: string) =>
      vi.setSystemTime(new Date(`2026-11-11T09:${time}Z`))
    clock("00:00.001")
    await routines.apply("drill", { kind: "playAll" })
    clock("00:10.124")
    await routines.apply("drill", { kind: "pause" })
    clock("00:40.008")
    await routines.apply("drill", { kind: "play" })
    clock("01:40.004")
    await routines.apply("drill", { kind: "sync" })

    expect((await entries.list("warmup"))[1]?.endedAt).toBe(
      "2026-11-11T09:01:29.885Z"
    )
    await routines.apply("drill", { kind: "jumpTo", id: "warmup" })
    const session = await routines.session("drill")
    if (!session) throw new Error("Expected a session")
    expect(primaryOf(session).label).toBe("Do again")
  })

  it("dates a created-done activity when its logged time ended", async () => {
    const { activities } = await setup()
    const areaId = (await activities.byId("standup"))?.areaId ?? ""
    await activities.createMany(
      [{ id: "retro", areaId, title: "Retro", status: "done", origin: null }],
      [
        {
          activityId: "retro",
          startedAt: parseUtc("2026-11-11T07:00:00.000Z"),
          endedAt: parseUtc("2026-11-11T07:45:00.000Z"),
        },
      ]
    )
    expect((await activities.byId("retro"))?.completedAt).toBe(
      "2026-11-11T07:45:00.000Z"
    )
  })

  it("stops a running activity that another is moved under, and waits on it", async () => {
    const { db, routines, entries } = await setup()
    await routines.apply("release", { kind: "playAll" })
    later(30)

    await routines.move("notes", "review")

    expect(await entries.running()).toBeUndefined()
    expect((await entries.list("review"))[0]?.endedAt).toBe(
      "2026-11-11T09:00:30.000Z"
    )
    expect((await db.routineRuns.get("release"))?.cursor).toBe("notes")
    const session = await routines.session("release")
    expect(session?.phase).toBe("paused")
    expect(session?.current?.node.id).toBe("notes")
  })

  it("stops a running activity that gains sub-activities from a document", async () => {
    const { db, routines, entries, activities } = await setup()
    await routines.apply("standup", { kind: "playAll" })
    later(30)
    const areaId = (await activities.byId("standup"))?.areaId ?? ""

    await activities.insertMany([
      {
        id: "blockers",
        areaId,
        parentId: "standup",
        title: "Blockers",
        status: "todo",
        origin: null,
      },
    ])

    expect(await entries.running()).toBeUndefined()
    expect((await db.routineRuns.get("standup"))?.cursor).toBe("blockers")
  })

  it("hands over a countdown that ran out before it gained sub-activities", async () => {
    const { routines, entries, activities } = await setup()
    await routines.apply("release", { kind: "playAll" })
    later(650)
    const areaId = (await activities.byId("review"))?.areaId ?? ""

    await activities.createMany([
      {
        id: "diff",
        areaId,
        parentId: "review",
        title: "Read the diff",
        status: "todo",
        origin: null,
      },
    ])

    expect(await entries.list("review")).toMatchObject([
      { endedAt: "2026-11-11T09:10:00.000Z" },
    ])
    expect(await entries.running()).toMatchObject({
      activityId: "round1",
      startedAt: "2026-11-11T09:10:00.000Z",
    })
    expect((await routines.session("release"))?.phase).toBe("running")
  })

  it("caps a lone countdown that ran out before it gained sub-activities", async () => {
    const { routines, entries, activities } = await setup()
    await routines.apply("standup", { kind: "playAll" })
    later(400)
    const areaId = (await activities.byId("standup"))?.areaId ?? ""

    await activities.createMany([
      {
        id: "update",
        areaId,
        parentId: "standup",
        title: "Update",
        status: "todo",
        origin: null,
      },
    ])

    expect(await entries.list("standup")).toMatchObject([
      { endedAt: "2026-11-11T09:05:00.000Z" },
    ])
    expect(await entries.running()).toBeUndefined()
    expect((await routines.session("standup"))?.current?.node.id).toBe("update")
  })

  it("Done from the status menu on the running activity stops it and hands over", async () => {
    const { routines, entries, activities } = await setup()
    await routines.apply("release", { kind: "playAll" })
    later(30)

    await activities.setStatus("review", "done")

    expect((await entries.list("review"))[0]?.endedAt).toBe(
      "2026-11-11T09:00:30.000Z"
    )
    expect(await entries.running()).toMatchObject({
      activityId: "round1",
      startedAt: "2026-11-11T09:00:30.000Z",
    })
    expect((await activities.byId("review"))?.status).toBe("done")
  })

  it("reopening a step the routine passed plays it again", async () => {
    const { db, routines, activities } = await setup()
    await routines.apply("release", { kind: "playAll" })
    later(600 + 60 + 10)
    await routines.apply("release", { kind: "pause" })
    expect((await db.routineRuns.get("release"))?.passed).toContain("round1")

    await activities.toggleDone("round1")

    expect((await activities.byId("round1"))?.status).toBe("todo")
    expect((await db.routineRuns.get("release"))?.passed).not.toContain(
      "round1"
    )
  })

  it("dates a step passed without being timed in this run now, not by an older run", async () => {
    const { routines, activities } = await setup()
    await routines.apply("release", { kind: "playAll" })
    later(600 + 60 + 10)
    await routines.apply("release", { kind: "pause" })
    await routines.apply("release", { kind: "startOver" })
    later(100)
    await routines.apply("release", { kind: "jumpTo", id: "round1" })

    await routines.apply("release", { kind: "next" })

    expect(await activities.byId("round1")).toMatchObject({
      status: "done",
      completedAt: "2026-11-11T09:12:50.000Z",
    })
  })

  it("keeps a replayed attempt when a part moves out on its own", async () => {
    const { db, routines } = await setup()
    await routines.apply("release", { kind: "playAll" })
    later(600 + 120)
    await routines.apply("release", { kind: "sync" })
    later(10)
    await routines.apply("focus", { kind: "playAll" }, "focus")
    later(30)
    await routines.apply("release", { kind: "pause" })

    await routines.move("focus", null)

    const own = await db.routineRuns.get("focus")
    expect(own?.cursor).toBe("round1")
    expect(own?.attemptFrom.round1).toBe("2026-11-11T09:12:10.000Z")
    const session = await routines.session("focus")
    if (!session) throw new Error("Expected a session")
    expect(session.phase).toBe("paused")
    expect(session.current?.node.id).toBe("round1")
    const round1 = findNode(session.root, "round1")
    if (!round1) throw new Error("Expected round1")
    expect(faceOf(round1, session.run, session.now).remaining).toBe(30)
  })

  it("never counts earlier time in a never-played routine an activity moves into", async () => {
    const { db, routines } = await setup()
    await routines.apply("standup", { kind: "playAll" })
    later(60)
    await routines.apply("standup", { kind: "pause" })

    await routines.move("standup", "drill")

    expect((await db.routineRuns.get("drill"))?.joinedAt).toEqual({
      standup: "2026-11-11T09:01:00.000Z",
    })
    const session = await routines.session("drill")
    if (!session) throw new Error("Expected a session")
    expect(session.phase).toBe("idle")
    expect(loggedSeconds(session.run, session.root, session.now)).toBe(0)
    expect(await routines.active()).toBeNull()
    later(10)
    const played = await routines.apply("drill", { kind: "playAll" })
    expect(loggedSeconds(played.run, played.root, played.now)).toBe(0)
  })

  it("keeps what a moved part got through when the routine it joins never ran", async () => {
    const { db, routines } = await setup()
    await routines.apply("focus", { kind: "playAll" }, "focus")
    later(20)
    await routines.apply("focus", { kind: "next" }, "focus")
    later(10)
    await routines.apply("focus", { kind: "pause" }, "focus")
    const left = await db.routineRuns.get("release")
    expect(left?.passed).toEqual(["round1"])

    await routines.move("focus", "drill")

    const joined = await db.routineRuns.get("drill")
    expect(joined?.passed).toEqual(["round1"])
    expect(joined?.joinedAt).toEqual({
      focus: "2026-11-11T09:00:30.000Z",
      round1: "2026-11-11T09:00:30.000Z",
      round2: "2026-11-11T09:00:30.000Z",
    })
    // A routine that never ran starts from its top, which here is the older Focus.
    expect(joined?.cursor).toBeNull()
    const session = await routines.session("drill")
    expect(session?.current?.node.id).toBe("round2")
    // What it carries in isn't play: the routine it joined still hasn't been played.
    expect(session?.phase).toBe("idle")
    expect(await routines.active()).toBeNull()
  })

  it("undoing a delete brings back the routine's run, minus what's gone since", async () => {
    const { db, routines, activities } = await setup()
    await routines.apply("drill", { kind: "playAll" })
    later(70)
    await routines.apply("drill", { kind: "pause" })
    const before = await db.routineRuns.get("drill")

    const snapshot = await activities.delete("drill")
    if (!snapshot) throw new Error("Expected a snapshot")
    expect(snapshot.run).toEqual(before)
    expect(await db.routineRuns.get("drill")).toBeUndefined()
    await activities.delete("warmup")
    await activities.restore(snapshot)

    expect(await db.routineRuns.get("drill")).toEqual({
      ...before,
      passed: [],
    })
    expect((await routines.session("drill"))?.current?.node.id).toBe("practice")
  })
})

const areaOf = async (activities: ActivitiesRepository, id: string) => {
  const row = await activities.byId(id)
  if (!row) throw new Error(`Expected ${id}`)
  return row.areaId
}

const playedRun = (id: string) => ({
  id,
  workspaceId: "ws-1",
  cursor: null,
  passed: [],
  replay: [],
  scopeId: null,
  runStart: parseUtc("2026-11-11T09:30:00.000Z"),
  attemptFrom: {},
  joinedAt: {},
  updatedAt: parseUtc("2026-11-11T10:00:00.000Z"),
})

describe("deleting a routine's top activity", () => {
  it("gives each sub-activity its share of the run, and undo merges them back", async () => {
    const { db, routines, activities } = await setup()
    await routines.apply("release", { kind: "playAll" })
    later(100)
    await routines.apply("release", { kind: "pause" })
    await routines.apply("release", { kind: "startOver" })
    later(10)
    await routines.apply("release", { kind: "playAll" })
    later(50)
    await routines.apply("release", { kind: "pause" })

    const snapshot = await activities.delete("release")
    if (!snapshot) throw new Error("Expected a snapshot")

    expect(await db.routineRuns.get("review")).toMatchObject({
      cursor: "review",
      runStart: "2026-11-11T09:01:40.000Z",
    })
    expect(await db.routineRuns.get("focus")).toMatchObject({
      cursor: null,
      runStart: "2026-11-11T09:01:40.000Z",
    })
    const review = await routines.session("review")
    if (!review) throw new Error("Expected a session")
    expect(review.phase).toBe("paused")
    expect(loggedSeconds(review.run, review.root, review.now)).toBe(50)
    expect(faceOf(review.root, review.run, review.now).elapsed).toBe(50)

    later(5)
    await routines.apply("review", { kind: "play" })
    later(20)
    await routines.apply("review", { kind: "pause" })
    await activities.restore(snapshot)

    expect(await db.routineRuns.get("review")).toBeUndefined()
    expect(await db.routineRuns.get("focus")).toBeUndefined()
    const back = await routines.session("release")
    if (!back) throw new Error("Expected a session")
    expect(back.phase).toBe("paused")
    expect(back.current?.node.id).toBe("review")
    expect(loggedSeconds(back.run, back.root, back.now)).toBe(70)
  })
})

describe("undoing a delete under the activity playing on its own", () => {
  it("stops it and waits on what came back", async () => {
    const { db, routines, activities, entries } = await setup()
    await activities.createMany([
      {
        id: "agenda",
        areaId: await areaOf(activities, "standup"),
        parentId: "standup",
        title: "Agenda",
        status: "todo",
        origin: null,
      },
    ])
    const snapshot = await activities.delete("agenda")
    if (!snapshot) throw new Error("Expected a snapshot")
    await routines.apply("standup", { kind: "playAll" })
    later(30)

    await activities.restore(snapshot)

    expect(await entries.running()).toBeUndefined()
    expect((await entries.list("standup"))[0]?.endedAt).toBe(
      "2026-11-11T09:00:30.000Z"
    )
    expect((await db.routineRuns.get("standup"))?.cursor).toBe("agenda")
  })
})

describe("a timer left running with no cursor stored", () => {
  it("is where the routine is, and the next sync stores it", async () => {
    const { db, routines } = await setup()
    const upgraded: TimeEntryRow = {
      id: "upgraded",
      workspaceId: "ws-1",
      activityId: "round2",
      startedAt: parseUtc("2026-11-11T08:59:30.000Z"),
      endedAt: null,
      source: "timer",
      recording: "pending",
    }
    await db.timeEntries.add(upgraded)

    const session = await routines.session("release")
    expect(session?.phase).toBe("running")
    expect(session?.current?.node.id).toBe("round2")
    await routines.apply("release", { kind: "sync" })
    expect((await db.routineRuns.get("release"))?.cursor).toBe("round2")
  })
})

describe("canceled activities", () => {
  it("are skipped, let the routine finish, and stay canceled through Start over", async () => {
    const { routines, activities } = await setup()
    await activities.setStatus("practice", "canceled")
    await routines.apply("drill", { kind: "playAll" })
    later(70)

    await routines.apply("drill", { kind: "sync" })
    const finished = await routines.apply("drill", { kind: "next" })
    expect(finished.phase).toBe("finished")
    await routines.apply("drill", { kind: "startOver" })

    expect((await activities.byId("practice"))?.status).toBe("canceled")
  })

  it("Canceled on the playing activity hands over like Done", async () => {
    const { routines, entries, activities } = await setup()
    await routines.apply("release", { kind: "playAll" })
    later(30)

    await activities.setStatus("review", "canceled")

    expect((await entries.list("review"))[0]?.endedAt).toBe(
      "2026-11-11T09:00:30.000Z"
    )
    expect(await entries.running()).toMatchObject({
      activityId: "round1",
      startedAt: "2026-11-11T09:00:30.000Z",
    })
    expect(await activities.byId("review")).toMatchObject({
      status: "canceled",
      reopenStatus: "todo",
      completedAt: null,
    })
  })

  it("Canceled on a playing activity already ticked done hands over too", async () => {
    const { routines, entries, activities } = await setup()
    await activities.setStatus("review", "done")
    await routines.apply("release", { kind: "jumpTo", id: "review" })
    await routines.apply("release", { kind: "play" })
    expect((await entries.running())?.activityId).toBe("review")
    later(30)

    await activities.setStatus("review", "canceled")

    expect((await entries.list("review"))[0]?.endedAt).toBe(
      "2026-11-11T09:00:30.000Z"
    )
    expect(await entries.running()).toMatchObject({
      activityId: "round1",
      startedAt: "2026-11-11T09:00:30.000Z",
    })
    expect(await activities.byId("review")).toMatchObject({
      status: "canceled",
      completedAt: null,
    })
  })

  it("Canceled takes it out of what was chosen to play again", async () => {
    const { db, routines, activities } = await setup()
    await activities.setStatus("review", "done")
    await routines.apply("release", { kind: "jumpTo", id: "review" })
    expect((await db.routineRuns.get("release"))?.replay).toEqual(["review"])

    await activities.setStatus("review", "canceled")

    expect((await db.routineRuns.get("release"))?.replay).toEqual([])
    const session = await routines.session("release")
    expect(session?.current?.node.id).toBe("round1")
  })

  it("is never played when a finished routine is played again", async () => {
    const { routines, entries, activities } = await setup()
    await activities.setStatus("practice", "canceled")
    await routines.apply("drill", { kind: "playAll" })
    later(70)
    await routines.apply("drill", { kind: "sync" })
    expect((await routines.apply("drill", { kind: "next" })).phase).toBe(
      "finished"
    )

    await routines.apply("drill", { kind: "playAll" }, "drill")
    later(70)
    await routines.apply("drill", { kind: "sync" })

    expect(await entries.list("practice")).toEqual([])
    expect((await activities.byId("practice"))?.status).toBe("canceled")
  })

  it("ticking a canceled one's box marks it done", async () => {
    const { routines, activities } = await setup()
    await activities.setStatus("practice", "canceled")
    await routines.apply("drill", { kind: "toggleDone", id: "practice" })
    expect((await activities.byId("practice"))?.status).toBe("done")
  })
})

describe("edits while a countdown that ran out waits to hand over", () => {
  it("a new length doesn't stretch the countdown that already ran out", async () => {
    const { routines, activities, entries } = await setup()
    await routines.apply("release", { kind: "playAll" })
    later(630)

    await activities.setTimer("review", down(900))

    expect((await entries.list("review"))[0]?.endedAt).toBe(
      "2026-11-11T09:10:00.000Z"
    )
    expect(await entries.running()).toMatchObject({
      activityId: "round1",
      startedAt: "2026-11-11T09:10:00.000Z",
    })
  })

  it("deleting it keeps the activity it handed over to running", async () => {
    const { routines, activities, entries } = await setup()
    await routines.apply("release", { kind: "playAll" })
    later(630)

    await activities.delete("review")

    expect(await entries.running()).toMatchObject({
      activityId: "round1",
      startedAt: "2026-11-11T09:10:00.000Z",
    })
  })

  it("moving it out leaves the activity it handed over to running", async () => {
    const { routines, entries } = await setup()
    await routines.apply("release", { kind: "playAll" })
    later(630)

    await routines.move("review", null)

    expect((await entries.list("review"))[0]?.endedAt).toBe(
      "2026-11-11T09:10:00.000Z"
    )
    expect(await entries.running()).toMatchObject({
      activityId: "round1",
      startedAt: "2026-11-11T09:10:00.000Z",
    })
  })
})

describe("adding to a group whose countdown ran out unseen", () => {
  it("hands over at the right instants first, so the new activity gets no earlier time", async () => {
    const { routines, entries, activities } = await setup()
    await routines.apply("focus", { kind: "playAll" }, "focus")
    later(200)

    await activities.createMany([
      {
        id: "cooldown",
        areaId: await areaOf(activities, "focus"),
        parentId: "focus",
        title: "Cool-down",
        status: "todo",
        origin: null,
        timer: down(60),
      },
    ])
    await routines.apply("release", { kind: "sync" })

    expect(await entries.list("round1")).toMatchObject([
      { endedAt: "2026-11-11T09:01:00.000Z" },
    ])
    expect(await entries.list("round2")).toMatchObject([
      {
        startedAt: "2026-11-11T09:01:00.000Z",
        endedAt: "2026-11-11T09:02:00.000Z",
      },
    ])
    expect(await entries.list("cooldown")).toEqual([])
    expect(await entries.running()).toBeUndefined()
  })
})

describe("deleting a step a late hand-over ticks", () => {
  it("undo brings it back ticked, dated when it ended", async () => {
    const { routines, activities } = await setup()
    await routines.apply("focus", { kind: "playAll" }, "focus")
    later(90)

    const snapshot = await activities.delete("round1")
    if (!snapshot) throw new Error("Expected a snapshot")
    expect(snapshot.row).toMatchObject({
      status: "done",
      completedAt: "2026-11-11T09:01:00.000Z",
    })
    await activities.restore(snapshot)

    expect(await activities.byId("round1")).toMatchObject({
      status: "done",
      completedAt: "2026-11-11T09:01:00.000Z",
    })
  })
})

describe("changing the type of an activity whose countdown ran out unseen", () => {
  it("ends it where its old timer ran out", async () => {
    const { db, routines, activities, entries } = await setup()
    const types = new ActivityTypesRepository(db, { workspaceId: "ws-1" })
    const short = await types.create({ name: "Short", color: "chart-1" })
    await types.update(short.id, { timer: down(60) })
    const long = await types.create({ name: "Long", color: "chart-2" })
    await types.update(long.id, { timer: down(600) })
    await activities.changeType("practice", short.id)
    await routines.apply("drill", { kind: "playAll" })
    later(150)

    await activities.changeType("practice", long.id)

    expect(await entries.list("practice")).toMatchObject([
      {
        startedAt: "2026-11-11T09:01:00.000Z",
        endedAt: "2026-11-11T09:02:00.000Z",
      },
    ])
    expect(await entries.running()).toBeUndefined()
  })
})

describe("Done with a date on the playing activity", () => {
  it("keeps the date it was given", async () => {
    const { routines, activities } = await setup()
    await routines.apply("release", { kind: "playAll" })
    later(30)

    await routines.setStatus(
      "review",
      "done",
      parseUtc("2026-11-11T09:00:20.000Z")
    )

    expect(await activities.byId("review")).toMatchObject({
      status: "done",
      completedAt: "2026-11-11T09:00:20.000Z",
    })
  })
})

describe("one timer at a time", () => {
  it("closes a timer left running on an activity that's gone", async () => {
    const { db, routines, entries } = await setup()
    await db.timeEntries.bulkAdd([
      {
        id: "orphan",
        workspaceId: "ws-1",
        activityId: "gone",
        startedAt: parseUtc("2026-11-11T08:59:00.000Z"),
        endedAt: null,
        source: "timer",
      },
      {
        id: "ahead",
        workspaceId: "ws-1",
        activityId: "gone-too",
        startedAt: parseUtc("2026-11-11T09:05:00.000Z"),
        endedAt: null,
        source: "timer",
      },
    ])

    await routines.apply("release", { kind: "playAll" })

    expect((await db.timeEntries.get("orphan"))?.endedAt).toBe(
      "2026-11-11T09:00:00.000Z"
    )
    expect((await db.timeEntries.get("ahead"))?.endedAt).toBe(
      "2026-11-11T09:05:00.000Z"
    )
    expect((await entries.running())?.activityId).toBe("review")
  })
})

describe("the routine kept in reach", () => {
  it("is a paused one behind other recent runs, but not past the latest five", async () => {
    const { db, routines, activities } = await setup()
    await routines.apply("release", { kind: "playAll" })
    later(5)
    await routines.apply("release", { kind: "pause" })
    const areaId = await areaOf(activities, "release")
    const others = ["inbox", "calendar", "scales", "essay", "budget"]
    await activities.createMany(
      others.map((id) => ({
        id,
        areaId,
        title: id,
        status: "todo" as const,
        origin: null,
      }))
    )
    for (const id of others.slice(0, 4)) await db.routineRuns.put(playedRun(id))
    expect((await routines.active())?.root.id).toBe("release")

    await db.routineRuns.put(playedRun("budget"))
    expect(await routines.active()).toBeNull()
  })

  it("keeps a routine whose part played on its own finished while the rest hasn't", async () => {
    const { routines } = await setup()
    await routines.apply("focus", { kind: "playAll" }, "focus")
    later(150)
    await routines.apply("release", { kind: "sync" })

    expect((await routines.session("release"))?.phase).toBe("scopeDone")
    expect((await routines.active())?.root.id).toBe("release")
  })

  it("leaves out a routine played to the end once a step of it is reopened", async () => {
    const { routines, activities } = await setup()
    await routines.apply("release", { kind: "playAll" })
    later(720)
    await routines.apply("release", { kind: "sync" })

    await activities.setStatus("round1", "todo")

    expect((await routines.session("release"))?.phase).toBe("paused")
    expect(await routines.active()).toBeNull()
  })
})

describe("a status change while a hand-over waits to be written", () => {
  it("Done on an activity not reached yet loses no time, and the next one starts on time", async () => {
    const { routines, activities, entries } = await setup()
    await routines.apply("release", { kind: "playAll" })
    later(630)

    await activities.setStatus("round2", "done")

    expect((await entries.list("review"))[0]?.endedAt).toBe(
      "2026-11-11T09:10:00.000Z"
    )
    expect(await entries.running()).toMatchObject({
      activityId: "round1",
      startedAt: "2026-11-11T09:10:00.000Z",
    })
    later(60)
    const session = await routines.apply("release", { kind: "sync" })
    expect((await entries.list("round1"))[0]?.endedAt).toBe(
      "2026-11-11T09:11:00.000Z"
    )
    expect(await entries.list("round2")).toEqual([])
    expect(session.phase).toBe("finished")
  })

  it("Canceled on a step that already ran out keeps it canceled, ended when it ran out", async () => {
    const { routines, activities, entries } = await setup()
    await routines.apply("focus", { kind: "playAll" }, "focus")
    later(90)

    await activities.setStatus("round1", "canceled")
    await routines.apply("release", { kind: "sync" })

    expect((await activities.byId("round1"))?.status).toBe("canceled")
    expect((await entries.list("round1"))[0]?.endedAt).toBe(
      "2026-11-11T09:01:00.000Z"
    )
    expect(await entries.running()).toMatchObject({
      activityId: "round2",
      startedAt: "2026-11-11T09:01:00.000Z",
    })
  })

  it("reopening a step that already ran out keeps it open", async () => {
    const { db, routines, activities, entries } = await setup()
    await routines.apply("focus", { kind: "playAll" }, "focus")
    later(90)

    await activities.setStatus("round1", "todo")
    await routines.apply("release", { kind: "sync" })

    expect((await activities.byId("round1"))?.status).toBe("todo")
    expect((await db.routineRuns.get("release"))?.passed).not.toContain(
      "round1"
    )
    expect(await entries.running()).toMatchObject({
      activityId: "round2",
      startedAt: "2026-11-11T09:01:00.000Z",
    })
  })
})

// A talk: a 10-minute draft, a 2-minute rest, then a 5-minute edit.
const talk = async (activities: ActivitiesRepository) => {
  const areaId = await areaOf(activities, "release")
  const base = { areaId, status: "todo" as const, origin: null }
  await activities.createMany([
    { ...base, id: "talk", title: "Talk" },
    {
      ...base,
      id: "draft",
      parentId: "talk",
      title: "Draft",
      timer: down(600),
    },
    {
      ...base,
      id: "rest",
      parentId: "talk",
      title: "Rest",
      timer: down(120),
      generated: "gap",
    },
    { ...base, id: "edit", parentId: "talk", title: "Edit", timer: down(300) },
  ])
}

describe("shortening a countdown below the time it has run", () => {
  const expectHandedOverNow = async (
    entries: TimeEntriesRepository,
    activities: ActivitiesRepository
  ) => {
    expect(await entries.list("draft")).toMatchObject([
      {
        startedAt: "2026-11-11T09:00:00.000Z",
        endedAt: "2026-11-11T09:08:00.000Z",
      },
    ])
    expect(await entries.running()).toMatchObject({
      activityId: "rest",
      startedAt: "2026-11-11T09:08:00.000Z",
    })
    expect(await entries.list("edit")).toEqual([])
    expect((await activities.byId("draft"))?.status).toBe("todo")
  }

  it("ends it at the edit, and the rest starts then", async () => {
    const { routines, activities, entries } = await setup()
    await talk(activities)
    await routines.apply("talk", { kind: "playAll" })
    later(480)

    await activities.setTimer("draft", down(300))

    await expectHandedOverNow(entries, activities)
    later(30)
    await routines.apply("talk", { kind: "sync" })
    await expectHandedOverNow(entries, activities)
  })

  it("ends it at the edit when its type's timer is shortened", async () => {
    const { db, routines, activities, entries } = await setup()
    const types = new ActivityTypesRepository(db, { workspaceId: "ws-1" })
    const writing = await types.create({ name: "Writing", color: "chart-1" })
    await types.update(writing.id, { timer: down(600) })
    await talk(activities)
    await activities.setTimer("draft", null)
    await activities.changeType("draft", writing.id)
    await routines.apply("talk", { kind: "playAll" })
    later(480)

    await routines.retime(() => types.update(writing.id, { timer: down(300) }))

    await expectHandedOverNow(entries, activities)
  })

  it("ends it at the edit when a type change shortens it", async () => {
    const { db, routines, activities, entries } = await setup()
    const types = new ActivityTypesRepository(db, { workspaceId: "ws-1" })
    const long = await types.create({ name: "Long", color: "chart-2" })
    await types.update(long.id, { timer: down(600) })
    const quick = await types.create({ name: "Quick", color: "chart-3" })
    await types.update(quick.id, { timer: down(300) })
    await talk(activities)
    await activities.setTimer("draft", null)
    await activities.changeType("draft", long.id)
    await routines.apply("talk", { kind: "playAll" })
    later(480)

    await activities.changeType("draft", quick.id)

    await expectHandedOverNow(entries, activities)
  })
})

describe("Done or added time on an activity already done", () => {
  it("keeps the date it was done", async () => {
    const { routines, activities } = await setup()
    await routines.setStatus(
      "standup",
      "done",
      parseUtc("2026-11-11T08:00:00.000Z")
    )
    later(60)

    await activities.setStatus("standup", "done")
    await activities.logTime([
      {
        activityId: "standup",
        startedAt: parseUtc("2026-11-11T08:50:00.000Z"),
        endedAt: parseUtc("2026-11-11T08:55:00.000Z"),
      },
    ])

    expect(await activities.byId("standup")).toMatchObject({
      status: "done",
      completedAt: "2026-11-11T08:00:00.000Z",
    })
  })
})

describe("a series made from a typed activity", () => {
  it("plays its type's sound", async () => {
    const { db, routines, activities } = await setup()
    const types = new ActivityTypesRepository(db, { workspaceId: "ws-1" })
    const scales = await types.create({ name: "Scales", color: "chart-3" })
    await types.update(scales.id, {
      timer: { mode: "down", seconds: 60, sound: "chime" },
    })
    const areaId = await areaOf(activities, "release")
    const base = { areaId, status: "todo" as const, origin: null }
    await activities.createMany([
      { ...base, id: "set", title: "Scales", typeId: scales.id, series: true },
      {
        ...base,
        id: "set1",
        parentId: "set",
        title: "Scales 1",
        typeId: scales.id,
        generated: "step",
      },
      {
        ...base,
        id: "set2",
        parentId: "set",
        title: "Scales 2",
        typeId: scales.id,
        generated: "step",
      },
    ])

    expect((await routines.session("set"))?.root.timer.sound).toBe("chime")
  })
})

describe("undoing a delete after a promoted countdown ran out alone", () => {
  it("never times the next one, which sat idle meanwhile", async () => {
    const { routines, activities, entries } = await setup()
    const areaId = await areaOf(activities, "release")
    const base = { areaId, status: "todo" as const, origin: null }
    await activities.createMany([
      { ...base, id: "scales", title: "Scales" },
      {
        ...base,
        id: "major",
        parentId: "scales",
        title: "Major",
        timer: down(60),
      },
      {
        ...base,
        id: "minor",
        parentId: "scales",
        title: "Minor",
        timer: down(60),
      },
    ])
    await routines.apply("scales", { kind: "playAll" })
    later(10)
    const snapshot = await activities.delete("scales")
    if (!snapshot) throw new Error("Expected a snapshot")
    later(110)

    await activities.restore(snapshot)
    await routines.apply("scales", { kind: "sync" })

    expect(await entries.list("major")).toMatchObject([
      {
        startedAt: "2026-11-11T09:00:00.000Z",
        endedAt: "2026-11-11T09:01:00.000Z",
      },
    ])
    expect(await entries.list("minor")).toEqual([])
    expect(await entries.running()).toBeUndefined()
  })
})

describe("reopening the last step of a finished routine", () => {
  it("reads as played, not idle, but doesn't bring the dock back", async () => {
    const { routines, activities } = await setup()
    await routines.apply("release", { kind: "playAll" })
    later(720)
    expect((await routines.apply("release", { kind: "sync" })).phase).toBe(
      "finished"
    )

    await activities.setStatus("round2", "todo")

    const session = await routines.session("release")
    expect(session?.phase).toBe("paused")
    expect(session?.current?.node.id).toBe("round2")
    expect(session && primaryOf(session).label).toBe("Do again")
    expect(await routines.active()).toBeNull()
  })

  it("leaves a solo activity finished with Done out of the dock once reopened", async () => {
    const { routines, activities } = await setup()
    await routines.apply("notes", { kind: "playAll" })
    later(60)
    await activities.setStatus("notes", "done")
    later(3600)

    await activities.setStatus("notes", "todo")

    expect((await routines.session("notes"))?.phase).toBe("paused")
    expect(await routines.active()).toBeNull()
  })

  it("still reads idle when the only time timed came with a part moved in", async () => {
    const { routines, activities } = await setup()
    await routines.apply("standup", { kind: "playAll" })
    later(30)
    await routines.apply("standup", { kind: "pause" })

    await routines.move("standup", "drill")

    const session = await routines.session("drill")
    expect(session?.phase).toBe("idle")
    expect((await activities.byId("standup"))?.parentId).toBe("drill")
  })
})

describe("moving the playing activity out of the part played on its own", () => {
  it("plays on through the whole routine, not back to the part's first one", async () => {
    const { db, routines, activities, entries } = await setup()
    const areaId = await areaOf(activities, "release")
    const base = { areaId, status: "todo" as const, origin: null }
    await activities.createMany([
      { ...base, id: "lesson", title: "Lesson" },
      { ...base, id: "pieces", parentId: "lesson", title: "Pieces" },
      {
        ...base,
        id: "etude",
        parentId: "pieces",
        title: "Etude",
        timer: down(60),
      },
      {
        ...base,
        id: "sonata",
        parentId: "pieces",
        title: "Sonata",
        timer: down(60),
      },
      {
        ...base,
        id: "sight",
        parentId: "lesson",
        title: "Sight-reading",
        timer: down(60),
      },
    ])
    await routines.apply("pieces", { kind: "playAll" }, "pieces")
    expect((await entries.running())?.activityId).toBe("etude")
    later(10)

    await routines.move("etude", "lesson")
    expect((await db.routineRuns.get("lesson"))?.scopeId).toBeNull()
    later(60)
    await routines.apply("lesson", { kind: "sync" })

    expect(await entries.list("sonata")).toEqual([])
    expect(await entries.running()).toMatchObject({
      activityId: "sight",
      startedAt: "2026-11-11T09:01:00.000Z",
    })
  })

  it("keeps the part when the playing activity moves within it", async () => {
    const { db, routines, activities } = await setup()
    const areaId = await areaOf(activities, "release")
    const base = { areaId, status: "todo" as const, origin: null }
    await activities.createMany([
      { ...base, id: "lesson", title: "Lesson" },
      { ...base, id: "pieces", parentId: "lesson", title: "Pieces" },
      {
        ...base,
        id: "etude",
        parentId: "pieces",
        title: "Etude",
        timer: down(60),
      },
      { ...base, id: "drills", parentId: "pieces", title: "Drills" },
      {
        ...base,
        id: "arpeggio",
        parentId: "drills",
        title: "Arpeggio",
        timer: down(60),
      },
    ])
    await routines.apply("pieces", { kind: "playAll" }, "pieces")
    later(10)

    await routines.move("etude", "drills")

    expect((await db.routineRuns.get("lesson"))?.scopeId).toBe("pieces")
  })
})

// Writing in open-ended drafts, generated as a series, so each can be split into laps.
const withDrafts = async () => {
  const context = await setup()
  const areaId = await areaOf(context.activities, "release")
  const base = { areaId, status: "todo" as const, origin: null }
  await context.activities.createMany([
    { ...base, id: "writing", title: "Writing", series: true },
    {
      ...base,
      id: "draft1",
      parentId: "writing",
      title: "Draft 1",
      generated: "step" as const,
    },
    {
      ...base,
      id: "draft2",
      parentId: "writing",
      title: "Draft 2",
      generated: "step" as const,
    },
  ])
  return context
}

const lapsOf = async (activities: ActivitiesRepository, id: string) =>
  (await activities.children(id)).map((lap) => lap.id)

describe("a generated step split into laps", () => {
  it("Lap, Lap, Next stores it done", async () => {
    const { routines, activities } = await withDrafts()
    await routines.apply("writing", { kind: "playAll" })
    later(30)
    await routines.apply("writing", { kind: "lap" })
    later(30)
    await routines.apply("writing", { kind: "lap" })
    later(30)
    await routines.apply("writing", { kind: "next" })

    expect((await activities.byId("draft1"))?.status).toBe("done")
    expect((await routines.session("writing"))?.current?.node.id).toBe("draft2")
  })

  it("is ticked when its last lap is ticked while paused", async () => {
    const { routines, activities } = await withDrafts()
    await routines.apply("writing", { kind: "playAll" })
    later(30)
    await routines.apply("writing", { kind: "lap" })
    later(30)
    await routines.apply("writing", { kind: "pause" })
    const [, last] = await lapsOf(activities, "draft1")

    await routines.apply("writing", { kind: "toggleDone", id: last ?? "" })

    expect((await activities.byId("draft1"))?.status).toBe("done")
  })

  it("is ticked when its last lap is marked done from the status menu while paused", async () => {
    const { routines, activities } = await withDrafts()
    await routines.apply("writing", { kind: "playAll" })
    later(30)
    await routines.apply("writing", { kind: "lap" })
    later(30)
    await routines.apply("writing", { kind: "pause" })
    const [, last] = await lapsOf(activities, "draft1")

    await activities.setStatus(last ?? "", "done")

    expect((await activities.byId("draft1"))?.status).toBe("done")
  })

  it("reopens when Previous plays its last lap again", async () => {
    const { routines, activities, entries } = await withDrafts()
    await routines.apply("writing", { kind: "playAll" })
    later(30)
    await routines.apply("writing", { kind: "lap" })
    later(30)
    await routines.apply("writing", { kind: "next" })
    expect((await activities.byId("draft1"))?.status).toBe("done")
    const [, last] = await lapsOf(activities, "draft1")

    later(10)
    await routines.apply("writing", { kind: "prev" })

    expect((await entries.running())?.activityId).toBe(last)
    expect((await activities.byId("draft1"))?.status).toBe("todo")
  })

  it("canceled while a lap runs, stays canceled however its last lap ends", async () => {
    const { routines, activities, entries } = await withDrafts()
    await routines.apply("writing", { kind: "playAll" })
    later(30)
    await routines.apply("writing", { kind: "lap" })
    later(30)
    const [, last] = await lapsOf(activities, "draft1")

    await activities.setStatus("draft1", "canceled")

    expect((await entries.running())?.activityId).toBe("draft2")
    expect((await entries.list(last ?? ""))[0]?.endedAt).toBe(
      "2026-11-11T09:01:00.000Z"
    )
    await routines.apply("writing", { kind: "toggleDone", id: last ?? "" })
    expect((await activities.byId("draft1"))?.status).toBe("canceled")
    await activities.setStatus(last ?? "", "todo")
    await activities.setStatus(last ?? "", "done")
    expect((await activities.byId("draft1"))?.status).toBe("canceled")
  })

  it("is ticked when a replayed last lap is marked done from the status menu", async () => {
    const { routines, activities } = await withDrafts()
    await routines.apply("writing", { kind: "playAll" })
    later(30)
    await routines.apply("writing", { kind: "lap" })
    later(30)
    await routines.apply("writing", { kind: "lap" })
    later(30)
    await routines.apply("writing", { kind: "next" })
    later(10)
    await routines.apply("writing", { kind: "prev" })
    later(10)
    await routines.apply("writing", { kind: "pause" })
    const last = (await lapsOf(activities, "draft1")).at(-1) ?? ""
    expect((await activities.byId("draft1"))?.status).toBe("todo")

    await activities.setStatus(last, "done")

    expect((await activities.byId("draft1"))?.status).toBe("done")
  })

  it("isn't ticked when every one of its laps is canceled", async () => {
    const { routines, activities } = await withDrafts()
    await routines.apply("writing", { kind: "playAll" })
    later(30)
    await routines.apply("writing", { kind: "lap" })
    later(30)
    await routines.apply("writing", { kind: "pause" })
    const [first, last] = await lapsOf(activities, "draft1")

    await activities.setStatus(first ?? "", "canceled")
    await activities.setStatus(last ?? "", "canceled")

    expect((await activities.byId("draft1"))?.status).toBe("todo")
  })

  it("isn't ticked when its last lap is canceled while it runs, the others already canceled", async () => {
    const { routines, activities, entries } = await withDrafts()
    await routines.apply("writing", { kind: "playAll" })
    later(30)
    await routines.apply("writing", { kind: "lap" })
    later(30)
    const [first, last] = await lapsOf(activities, "draft1")
    await activities.setStatus(first ?? "", "canceled")
    expect((await entries.running())?.activityId).toBe(last)

    await activities.setStatus(last ?? "", "canceled")

    expect((await activities.byId(last ?? ""))?.status).toBe("canceled")
    expect((await activities.byId("draft1"))?.status).toBe("todo")
    expect((await entries.running())?.activityId).toBe("draft2")
  })
})

describe("canceling the group that holds the playing activity", () => {
  it("stops it and moves on past the group", async () => {
    const { routines, activities, entries } = await setup()
    await routines.apply("release", { kind: "playAll" })
    later(630)
    await routines.apply("release", { kind: "sync" })
    expect((await entries.running())?.activityId).toBe("round1")

    await activities.setStatus("focus", "canceled")

    expect(await entries.running()).toBeUndefined()
    expect((await entries.list("round1"))[0]?.endedAt).toBe(
      "2026-11-11T09:10:30.000Z"
    )
    expect((await activities.byId("round1"))?.status).toBe("todo")
    expect((await routines.session("release"))?.phase).toBe("finished")
  })

  it("puts the activity it stopped back in the run when the group is reopened", async () => {
    const { routines, activities } = await setup()
    await routines.apply("release", { kind: "playAll" })
    later(630)
    await routines.apply("release", { kind: "sync" })
    await activities.setStatus("focus", "canceled")

    await activities.setStatus("focus", "todo")

    const session = await routines.session("release")
    expect(session?.current?.node.id).toBe("round1")
    expect(session?.run.passed).not.toContain("round1")
  })

  it("keeps a done activity chosen to play again in the run when the group is reopened", async () => {
    const { routines, activities, entries } = await setup()
    const areaId = await areaOf(activities, "release")
    const base = { areaId, status: "todo" as const, origin: null }
    await activities.createMany([
      { ...base, id: "deploy", title: "Deploy" },
      {
        ...base,
        id: "ship",
        parentId: "deploy",
        title: "Ship",
        timer: down(60),
      },
      { ...base, id: "checks", parentId: "deploy", title: "Checks" },
      {
        ...base,
        id: "smoke",
        parentId: "checks",
        title: "Smoke test",
        timer: down(300),
      },
    ])
    await activities.setStatus("ship", "done")
    await activities.setStatus("smoke", "done")
    await routines.apply("deploy", { kind: "jumpTo", id: "smoke" })
    await routines.apply("deploy", { kind: "play" })
    later(30)
    await activities.setStatus("checks", "canceled")
    expect(await entries.running()).toBeUndefined()

    await activities.setStatus("checks", "todo")

    const session = await routines.session("deploy")
    expect(session?.phase).toBe("paused")
    expect(session?.current?.node.id).toBe("smoke")
    await routines.apply("deploy", { kind: "play" })
    expect((await entries.running())?.activityId).toBe("smoke")
    expect((await activities.byId("smoke"))?.status).toBe("done")
  })
})
