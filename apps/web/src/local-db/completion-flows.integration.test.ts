import "fake-indexeddb/auto"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Dexie } from "dexie"
import yDexie from "y-dexie"
import { now, parseUtc } from "@knight-os/server/core"
import {
  findNode,
  heldSeconds,
  loggedSeconds,
  recordedSeconds,
  runningEntry,
  type Session,
} from "@/activities/routine"
import {
  addTimeDraft,
  countedOf,
  logPlan,
  waitingOf,
} from "@/activities/log-time"
import { pageViewOf, timerEnded } from "@/activities/routine-view"
import { ActivitiesRepository } from "./activities"
import { AreasRepository } from "./areas"
import { createLocalDb, type LocalDb } from "./db"
import { RoutinesRepository, type Discarded } from "./routines"

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
  sound: "bell" as const,
})

const up = { mode: "up" as const, sound: "bell" as const }

const ctx = { workspaceId: "ws-1" }

const setup = async () => {
  const db = createLocalDb(`completion-flows-${crypto.randomUUID()}`)
  openDbs.push(db)
  const activities = new ActivitiesRepository(db, ctx)
  const routines = new RoutinesRepository(db, ctx)
  const area = await new AreasRepository(db, ctx).ensureDefault("Life")
  const base = { areaId: area.id, status: "todo" as const, origin: null }
  await activities.createMany([
    { ...base, id: "tea", title: "Steep tea", timer: down(60) },
    { ...base, id: "read", title: "Read chapter 4", timer: up },
    { ...base, id: "guitar", title: "Guitar practice", timer: up },
    {
      ...base,
      id: "tuning",
      parentId: "guitar",
      title: "Tuning",
      timer: down(60),
    },
    {
      ...base,
      id: "scales",
      parentId: "guitar",
      title: "Scales",
      timer: down(120),
    },
    { ...base, id: "song", parentId: "guitar", title: "Song", timer: up },
    { ...base, id: "hiit", title: "Intervals", timer: up },
    {
      ...base,
      id: "set",
      parentId: "hiit",
      title: "Set",
      series: true,
    },
    {
      ...base,
      id: "round1",
      parentId: "set",
      title: "Round 1",
      timer: down(30),
      generated: "step",
    },
    {
      ...base,
      id: "round2",
      parentId: "set",
      title: "Round 2",
      timer: down(30),
      generated: "step",
    },
    {
      ...base,
      id: "cooldown",
      parentId: "hiit",
      title: "Cool-down",
      timer: up,
    },
  ])
  return { db, activities, routines }
}

const recordings = async (db: LocalDb, activityId: string) =>
  (await db.timeEntries.toArray())
    .filter((entry) => entry.activityId === activityId)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .map((entry) => (entry.source === "timer" ? entry.recording : "manual"))

const sessionFor = async (routines: RoutinesRepository, id: string) => {
  const session = await routines.session(id)
  if (!session) throw new Error(`Expected a routine for ${id}`)
  return session
}

const statusOf = async (activities: ActivitiesRepository, id: string) =>
  (await activities.byId(id))?.status

// What a Done just discarded, as the Add time form is offered it.
const offered = (discarded: Discarded[], id?: string) =>
  discarded
    .filter((stretch) => id === undefined || stretch.activityId === id)
    .reduce((total, stretch) => total + stretch.seconds, 0)

// Timer time still waiting for the activity to be finished.
const waiting = (session: Session, id?: string) =>
  session.run.entries
    .filter(
      (entry) =>
        !entry.manual &&
        entry.recording === "pending" &&
        (id === undefined || entry.activityId === id) &&
        !session.run.canceled.includes(entry.activityId)
    )
    .reduce(
      (total, entry) => total + (entry.end ?? session.now) - entry.start,
      0
    )

describe("Done from the Status", () => {
  it("discards what the timer measured, offers it back, and adding it counts it once", async () => {
    const { db, activities, routines } = await setup()
    await routines.apply("read", { kind: "playAll" })
    later(90)
    await routines.apply("read", { kind: "pause" })
    const paused = await sessionFor(routines, "read")
    expect(waiting(paused)).toBe(90)

    const discarded = await activities.setStatus("read", "done")

    expect(await statusOf(activities, "read")).toBe("done")
    expect(discarded).toEqual([
      {
        activityId: "read",
        seconds: 90,
        endedAt: parseUtc("2026-11-11T09:01:30.000Z"),
      },
    ])
    await activities.logTime([
      {
        activityId: "read",
        startedAt: parseUtc("2026-11-11T09:00:00.000Z"),
        endedAt: parseUtc("2026-11-11T09:01:30.000Z"),
      },
    ])
    expect(await statusOf(activities, "read")).toBe("done")
    expect((await recordings(db, "read")).sort()).toEqual([
      "discarded",
      "manual",
    ])
    const done = await sessionFor(routines, "read")
    expect(recordedSeconds(done.run, done.root, done.now)).toBe(90)
  })

  it("offers whole seconds, though the timer keeps milliseconds", async () => {
    const { activities, routines } = await setup()
    await routines.apply("read", { kind: "playAll" })
    vi.setSystemTime(new Date(Date.now() + 3974))
    await routines.apply("read", { kind: "pause" })

    const discarded = await activities.setStatus("read", "done")

    expect(countedOf(discarded).seconds).toBe(4)
  })

  it("keeps a paused stopwatch's time out of the totals with plain Mark done, and finishes it", async () => {
    const { db, activities, routines } = await setup()
    await routines.apply("read", { kind: "playAll" })
    later(90)
    await routines.apply("read", { kind: "pause" })

    await activities.setStatus("read", "done")

    expect(await recordings(db, "read")).toEqual(["discarded"])
    const done = await sessionFor(routines, "read")
    expect(done.phase).toBe("finished")
    expect(loggedSeconds(done.run, done.root, done.now)).toBe(0)
    expect(await routines.active()).toBeNull()
  })

  it("discards waiting time when the status menu marks it done", async () => {
    const { db, activities, routines } = await setup()
    await routines.apply("read", { kind: "playAll" })
    later(30)
    await routines.apply("read", { kind: "pause" })

    await activities.setStatus("read", "done")

    expect(await recordings(db, "read")).toEqual(["discarded"])
  })

  it("settles a sub-activity's time when its box is ticked", async () => {
    const { db, activities, routines } = await setup()
    await routines.apply("guitar", { kind: "playAll" })
    later(20)

    await activities.toggleDone("tuning")

    expect(await recordings(db, "tuning")).toEqual(["discarded"])
    const session = await sessionFor(routines, "guitar")
    expect(session.phase).toBe("running")
    expect(session.current?.node.id).toBe("scales")
  })

  it("does nothing more when Done reaches an activity already done", async () => {
    const { db, activities, routines } = await setup()
    await routines.apply("read", { kind: "playAll" })
    later(30)
    await activities.setStatus("read", "done")

    expect(await activities.setStatus("read", "done")).toEqual([])

    expect(await recordings(db, "read")).toEqual(["discarded"])
  })
})

describe("the last countdown", () => {
  it("stops at Timer ended and waits for a choice", async () => {
    const { db, activities, routines } = await setup()
    await routines.apply("tea", { kind: "playAll" })
    later(75)

    const ended = await routines.apply("tea", { kind: "sync" })

    expect(timerEnded(ended)).toBe(true)
    expect(runningEntry(ended.run)).toBeNull()
    expect(await statusOf(activities, "tea")).toBe("todo")
    expect(await recordings(db, "tea")).toEqual(["pending"])
    expect((await routines.active())?.root.id).toBe("tea")
  })

  it("keeps the earlier time waiting when it's played again without a choice", async () => {
    const { db, activities, routines } = await setup()
    await routines.apply("tea", { kind: "playAll" })
    later(75)
    await routines.apply("tea", { kind: "sync" })
    await routines.apply("tea", { kind: "play" })
    later(30)
    await routines.apply("tea", { kind: "pause" })
    const again = await sessionFor(routines, "tea")
    expect(waiting(again)).toBe(90)

    const discarded = await activities.setStatus("tea", "done")

    expect(offered(discarded)).toBe(90)
    expect(await recordings(db, "tea")).toEqual(["discarded", "discarded"])
  })

  it("still hands over in the middle of a routine", async () => {
    const { routines } = await setup()
    await routines.apply("guitar", { kind: "playAll" })
    later(70)

    const session = await routines.apply("guitar", { kind: "sync" })

    expect(session.phase).toBe("running")
    expect(session.current?.node.id).toBe("scales")
  })
})

describe("a clock after its time was settled", () => {
  it("reopens a done stopwatch played again, and Done offers only the new time", async () => {
    const { db, activities, routines } = await setup()
    await routines.apply("read", { kind: "playAll" })
    later(60)
    await activities.setStatus("read", "done")

    await routines.apply("read", { kind: "playAll" }, null, "read")
    expect(await statusOf(activities, "read")).toBe("progress")
    later(20)
    const replay = await routines.apply("read", { kind: "pause" })

    expect(findNode(replay.root, "read")).not.toBeNull()
    expect(waiting(replay)).toBe(20)
    const discarded = await activities.setStatus("read", "done")
    expect(offered(discarded)).toBe(20)
    expect(await recordings(db, "read")).toEqual(["discarded", "discarded"])
  })

  it("doesn't pull settled time into a lap", async () => {
    const { db, activities, routines } = await setup()
    await routines.apply("read", { kind: "playAll" })
    later(60)
    await activities.setStatus("read", "done")
    await routines.apply("read", { kind: "playAll" })
    later(10)

    await routines.apply("read", { kind: "lap" })

    const laps = (await db.activities.toArray()).filter(
      (row) => row.parentId === "read"
    )
    const firstLap = laps.find((row) => row.title === "Lap 1")
    expect(firstLap).toBeDefined()
    const lapRecordings = await recordings(db, firstLap?.id ?? "")
    expect(lapRecordings).toEqual(["pending"])
    expect(await recordings(db, "read")).toEqual(["discarded"])
  })
})

describe("finishing a routine with activities still open", () => {
  it("pauses where it plays, starts nothing else, and ends the run", async () => {
    const { db, activities, routines } = await setup()
    await routines.apply("guitar", { kind: "playAll" })
    later(80)
    await routines.apply("guitar", { kind: "sync" })

    const discarded = await activities.setStatus("guitar", "done")

    const session = await sessionFor(routines, "guitar")
    expect(runningEntry(session.run)).toBeNull()
    expect(session.phase).toBe("finished")
    expect(offered(discarded, "tuning")).toBe(60)
    expect(offered(discarded, "scales")).toBe(20)
    expect(await recordings(db, "tuning")).toEqual(["discarded"])
    expect(await recordings(db, "scales")).toEqual(["discarded"])
    expect(await recordings(db, "song")).toEqual([])
    expect(await statusOf(activities, "song")).toBe("todo")
    expect(await routines.active()).toBeNull()
  })

  it("plays again once the routine is reopened", async () => {
    const { activities, routines } = await setup()
    await routines.apply("guitar", { kind: "playAll" })
    later(20)
    await activities.setStatus("guitar", "done")

    await activities.setStatus("guitar", "todo")

    const session = await sessionFor(routines, "guitar")
    expect(session.phase).not.toBe("finished")
    const played = await routines.apply("guitar", { kind: "playAll" })
    expect(played.phase).toBe("running")
  })

  it("lets a step reopened under it play again", async () => {
    const { activities, routines } = await setup()
    await routines.apply("guitar", { kind: "playAll" })
    later(20)
    await activities.setStatus("guitar", "done")

    await activities.toggleDone("song")
    await activities.toggleDone("song")

    const view = pageViewOf(await sessionFor(routines, "guitar"), "song")
    expect(view.phase).not.toBe("finished")
    const played = await routines.apply("guitar", { kind: "playAll" }, "song")
    expect(runningEntry(played.run)?.activityId).toBe("song")
  })

  it("lets a step moved out of it play where it lands", async () => {
    const { db, activities, routines } = await setup()
    await routines.apply("guitar", { kind: "playAll" })
    later(20)
    await activities.setStatus("guitar", "done")
    expect((await db.routineRuns.get("guitar"))?.passed).toContain("song")

    await routines.move("song", "hiit")

    expect((await db.routineRuns.get("hiit"))?.passed ?? []).not.toContain(
      "song"
    )
    const played = await routines.apply("hiit", { kind: "playAll" }, "song")
    expect(runningEntry(played.run)?.activityId).toBe("song")
  })

  it("lets a step taken out on its own play", async () => {
    const { db, activities, routines } = await setup()
    await routines.apply("guitar", { kind: "playAll" })
    later(20)
    await activities.setStatus("guitar", "done")

    await routines.move("song", null)

    expect((await db.routineRuns.get("song"))?.passed ?? []).not.toContain(
      "song"
    )
    const played = await routines.apply("song", { kind: "playAll" })
    expect(runningEntry(played.run)?.activityId).toBe("song")
  })

  it("plays a step added to it later", async () => {
    const { activities, routines } = await setup()
    await routines.apply("guitar", { kind: "playAll" })
    later(20)
    await activities.setStatus("guitar", "done")
    await activities.setStatus("guitar", "todo")
    await activities.createMany([
      {
        id: "chords",
        areaId: (await activities.byId("guitar"))?.areaId ?? "",
        parentId: "guitar",
        title: "Chords",
        status: "todo",
        origin: null,
        timer: up,
      },
    ])

    const played = await routines.apply("guitar", { kind: "playAll" }, "chords")
    expect(runningEntry(played.run)?.activityId).toBe("chords")
  })

  it("lets a canceled step brought back under it play", async () => {
    const { activities, routines } = await setup()
    await activities.setStatus("song", "canceled")
    await routines.apply("guitar", { kind: "playAll" })
    later(20)
    await activities.setStatus("guitar", "done")

    await activities.setStatus("song", "todo")

    const played = await routines.apply("guitar", { kind: "playAll" }, "song")
    expect(runningEntry(played.run)?.activityId).toBe("song")
  })

  it("only changes status on a routine that never played", async () => {
    const { db, activities } = await setup()

    await activities.setStatus("guitar", "done")

    expect(await db.routineRuns.get("guitar")).toBeUndefined()
    expect(await statusOf(activities, "song")).toBe("todo")
  })
})

describe("Done on an activity played again", () => {
  it("offers the new time once Do again has reopened it", async () => {
    const { db, activities, routines } = await setup()
    await routines.apply("read", { kind: "playAll" })
    later(40)
    await activities.setStatus("read", "done")

    await routines.apply("read", { kind: "playAll" }, null, "read")
    later(15)
    await routines.apply("read", { kind: "pause" })
    const discarded = await activities.setStatus("read", "done")

    expect(offered(discarded)).toBe(15)
    expect(await recordings(db, "read")).toEqual(["discarded", "discarded"])
  })

  it("replays a done routine from the top, its ticked steps included", async () => {
    const { activities, routines } = await setup()
    await routines.apply("guitar", { kind: "playAll" })
    later(70)
    await routines.apply("guitar", { kind: "sync" })
    await activities.setStatus("guitar", "done")

    const replay = await routines.apply(
      "guitar",
      { kind: "playAll" },
      null,
      "guitar"
    )

    expect(await statusOf(activities, "guitar")).toBe("progress")
    expect(replay.phase).toBe("running")
    expect(runningEntry(replay.run)?.activityId).toBe("tuning")
  })

  it("replays a done routine whole after only a part of it was played on its own", async () => {
    const { activities, routines } = await setup()
    await activities.setStatus("guitar", "done")
    await routines.apply("guitar", { kind: "playOnly", id: "tuning" })
    await routines.apply("guitar", { kind: "play" })
    later(70)
    await routines.apply("guitar", { kind: "sync" })

    const replay = await routines.apply(
      "guitar",
      { kind: "playAll" },
      null,
      "guitar"
    )

    expect(await statusOf(activities, "guitar")).toBe("progress")
    expect(replay.scope?.id ?? "guitar").toBe("guitar")
    expect(runningEntry(replay.run)?.activityId).toBe("tuning")
  })

  it("doesn't reopen anything for an action that doesn't start the timer", async () => {
    const { activities, routines } = await setup()
    await routines.apply("guitar", { kind: "playAll" })
    later(20)
    await activities.setStatus("guitar", "done")

    await routines.apply(
      "guitar",
      { kind: "playOnly", id: "song" },
      null,
      "guitar"
    )

    expect(await statusOf(activities, "guitar")).toBe("done")
  })

  it("leaves an activity that isn't done as it is", async () => {
    const { activities, routines } = await setup()

    await routines.apply("read", { kind: "playAll" }, null, "read")

    expect(await statusOf(activities, "read")).toBe("todo")
  })

  it("discards waiting time on Start over", async () => {
    const { db, routines } = await setup()
    await routines.apply("read", { kind: "playAll" })
    later(40)

    await routines.apply("read", { kind: "startOver" })

    expect(await recordings(db, "read")).toEqual(["discarded"])
  })
})

describe("plain Mark done on the step it's paused on", () => {
  it("moves on and keeps the routine ready to resume", async () => {
    const { db, activities, routines } = await setup()
    await routines.apply("guitar", { kind: "playAll" })
    later(20)
    await routines.apply("guitar", { kind: "pause" })

    await activities.setStatus("tuning", "done")

    expect(await recordings(db, "tuning")).toEqual(["discarded"])
    const session = await sessionFor(routines, "guitar")
    expect(session.phase).toBe("paused")
    expect(session.current?.node.id).toBe("scales")
    expect((await routines.active())?.root.id).toBe("guitar")
  })
})

describe("a step that ticked itself", () => {
  it("offers its time back when its routine is marked done", async () => {
    const { db, activities, routines } = await setup()
    await routines.apply("hiit", { kind: "playOnly", id: "round1" })
    await routines.apply("hiit", { kind: "play" })
    later(45)
    await routines.apply("hiit", { kind: "sync" })
    expect(await statusOf(activities, "round1")).toBe("done")
    expect(await recordings(db, "round1")).toEqual(["pending"])

    const discarded = await activities.setStatus("hiit", "done")

    expect(offered(discarded, "round1")).toBe(30)
    expect(await recordings(db, "round1")).toEqual(["discarded"])
  })
})

describe("a stale Done on an activity already done", () => {
  it("leaves a replay running", async () => {
    const { activities, routines } = await setup()
    await routines.apply("read", { kind: "playAll" })
    later(30)
    await activities.setStatus("read", "done")
    await routines.apply("read", { kind: "playAll" })
    later(10)

    await activities.setStatus("read", "done")

    const session = await sessionFor(routines, "read")
    expect(runningEntry(session.run)?.activityId).toBe("read")
  })
})

describe("canceled, then done", () => {
  it("discards the time from before it was canceled", async () => {
    const { db, activities, routines } = await setup()
    await routines.apply("read", { kind: "playAll" })
    later(30)
    await routines.apply("read", { kind: "pause" })
    await activities.setStatus("read", "canceled")

    await activities.setStatus("read", "done")

    expect(await recordings(db, "read")).toEqual(["discarded"])
  })
})

describe("time added after Done", () => {
  it("counts in what the activity took across every run, Start over included", async () => {
    const { activities, routines } = await setup()
    await activities.setStatus("read", "done")
    await activities.logTime([
      {
        activityId: "read",
        startedAt: parseUtc("2026-11-11T08:00:00.000Z"),
        endedAt: parseUtc("2026-11-11T08:01:00.000Z"),
      },
    ])
    await activities.setStatus("read", "todo")
    await routines.apply("read", { kind: "playAll" })
    later(10)
    await routines.apply("read", { kind: "startOver" })

    await activities.setStatus("read", "done")

    const session = await sessionFor(routines, "read")
    expect(heldSeconds(session.run, session.root, session.now)).toBe(60)
  })
})

describe("time added on a step that ticked itself", () => {
  it("replaces its waiting timer time, so the routine's Done never offers it again", async () => {
    const { db, activities, routines } = await setup()
    await routines.apply("hiit", { kind: "playOnly", id: "round1" })
    await routines.apply("hiit", { kind: "play" })
    later(45)
    await routines.apply("hiit", { kind: "sync" })
    expect(await recordings(db, "round1")).toEqual(["pending"])

    await activities.logTime([
      {
        activityId: "round1",
        startedAt: parseUtc("2026-11-11T09:00:00.000Z"),
        endedAt: parseUtc("2026-11-11T09:00:30.000Z"),
      },
    ])
    const discarded = await activities.setStatus("hiit", "done")

    expect((await recordings(db, "round1")).sort()).toEqual([
      "discarded",
      "manual",
    ])
    expect(offered(discarded, "round1")).toBe(0)
  })
})

describe("Done on a step that just ticked itself", () => {
  it("drops nothing, and adding the time still waiting on it replaces exactly that", async () => {
    const { db, activities, routines } = await setup()
    await routines.apply("hiit", { kind: "playOnly", id: "round1" })
    await routines.apply("hiit", { kind: "play" })
    later(45)
    await routines.apply("hiit", { kind: "sync" })

    expect(await activities.setStatus("round1", "done")).toEqual([])
    const session = await sessionFor(routines, "hiit")
    const round1 = findNode(session.root, "round1")
    if (!round1) throw new Error("Expected round 1")
    const waiting = waitingOf(round1, session.run)
    expect(waiting.seconds).toBe(30)
    const plan = logPlan(
      round1,
      addTimeDraft(waiting, "UTC"),
      "UTC",
      parseUtc(now())
    )
    if ("error" in plan) throw new Error(plan.error)
    expect(plan.sessions).toEqual([
      {
        activityId: "round1",
        startedAt: parseUtc("2026-11-11T09:00:00.000Z"),
        endedAt: parseUtc("2026-11-11T09:00:30.000Z"),
      },
    ])

    await activities.logTime(plan.sessions)
    expect((await recordings(db, "round1")).sort()).toEqual([
      "discarded",
      "manual",
    ])
  })
})

describe("time added on a routine", () => {
  it("leaves a step still open under it with its clock", async () => {
    const { db, activities, routines } = await setup()
    await routines.apply("guitar", { kind: "jumpTo", id: "scales" })
    await routines.apply("guitar", { kind: "play" })
    later(10)
    await routines.apply("guitar", { kind: "pause" })

    await activities.logTime([
      {
        activityId: "guitar",
        startedAt: parseUtc("2026-11-11T08:00:00.000Z"),
        endedAt: parseUtc("2026-11-11T08:10:00.000Z"),
      },
    ])

    expect(await recordings(db, "scales")).toEqual(["pending"])
  })
})

describe("time a step held before it joined the routine", () => {
  it("is settled with the routine's Done but never offered as the routine's time", async () => {
    const { db, activities, routines } = await setup()
    await routines.apply("read", { kind: "playAll" })
    later(30)
    await routines.apply("read", { kind: "pause" })
    await routines.move("read", "guitar")

    const discarded = await activities.setStatus("guitar", "done")

    expect(offered(discarded, "read")).toBe(0)
    expect(await recordings(db, "read")).toEqual(["discarded"])
  })
})

describe("a stopwatch reopened after Done", () => {
  it("starts its clock fresh", async () => {
    const { activities, routines } = await setup()
    await routines.apply("read", { kind: "playAll" })
    later(45)
    await activities.setStatus("read", "done")

    await activities.setStatus("read", "todo")
    const played = await routines.apply("read", { kind: "playAll" })
    later(5)

    const session = await sessionFor(routines, "read")
    expect(waiting(session)).toBe(5)
    expect(played.phase).toBe("running")
  })
})

describe("moving inside a finished routine", () => {
  it("keeps the routine finished", async () => {
    const { db, activities, routines } = await setup()
    await activities.createMany([
      {
        id: "extras",
        areaId: (await activities.byId("guitar"))?.areaId ?? "",
        parentId: "guitar",
        title: "Extras",
        status: "todo",
        origin: null,
      },
    ])
    await routines.apply("guitar", { kind: "playAll" })
    later(20)
    await activities.setStatus("guitar", "done")

    await routines.move("song", "extras")

    expect((await db.routineRuns.get("guitar"))?.passed).toContain("song")
    expect((await sessionFor(routines, "guitar")).phase).toBe("finished")
  })
})

describe("Done on a group", () => {
  it("leaves a canceled step's time out", async () => {
    const { db, activities, routines } = await setup()
    await routines.apply("guitar", { kind: "playAll" })
    later(20)
    await routines.apply("guitar", { kind: "pause" })
    await activities.setStatus("tuning", "canceled")
    await routines.apply("guitar", { kind: "play" })
    later(10)
    await routines.apply("guitar", { kind: "pause" })
    const paused = await sessionFor(routines, "guitar")
    expect(waiting(paused)).toBe(10)

    const discarded = await activities.setStatus("guitar", "done")

    expect(offered(discarded, "tuning")).toBe(0)
    expect(offered(discarded)).toBe(10)
    expect(await recordings(db, "tuning")).toEqual(["discarded"])
    expect(await recordings(db, "scales")).toEqual(["discarded"])
  })
})

describe("finishing the last group while an earlier step is still open", () => {
  it("keeps the routine in the dock, ready to resume the open step", async () => {
    const { activities, routines } = await setup()
    const areaId = (await activities.byId("guitar"))?.areaId ?? ""
    const base = { areaId, status: "todo" as const, origin: null }
    await activities.createMany([
      { ...base, id: "day", title: "Close the day", timer: up },
      { ...base, id: "inbox", parentId: "day", title: "Inbox", timer: up },
      { ...base, id: "wrap", parentId: "day", title: "Wrap up" },
      { ...base, id: "notes", parentId: "wrap", title: "Notes", timer: up },
    ])
    await routines.apply("day", { kind: "jumpTo", id: "notes" })
    await routines.apply("day", { kind: "play" })
    later(20)

    await activities.setStatus("wrap", "done")

    const session = await sessionFor(routines, "day")
    expect(runningEntry(session.run)).toBeNull()
    expect(session.current?.node.id).toBe("inbox")
    expect((await routines.active())?.root.id).toBe("day")
  })
})

describe("Mark done on a step jumped to", () => {
  it("resumes at the step after it, not the one skipped", async () => {
    const { activities, routines } = await setup()
    await routines.apply("guitar", { kind: "jumpTo", id: "scales" })
    await routines.apply("guitar", { kind: "play" })
    later(15)
    await routines.apply("guitar", { kind: "pause" })

    await activities.setStatus("scales", "done")

    const session = await sessionFor(routines, "guitar")
    expect(session.current?.node.id).toBe("song")
  })
})

describe("Mark done on the last step, jumped to past open ones", () => {
  it("keeps the routine in the dock, ready to resume the first open step", async () => {
    const { activities, routines } = await setup()
    await routines.apply("guitar", { kind: "jumpTo", id: "song" })
    await routines.apply("guitar", { kind: "play" })
    later(15)
    await routines.apply("guitar", { kind: "pause" })

    await activities.setStatus("song", "done")

    const session = await sessionFor(routines, "guitar")
    expect(session.current?.node.id).toBe("tuning")
    expect((await routines.active())?.root.id).toBe("guitar")
  })
})

describe("finishing a group after a hand-over inside it", () => {
  it("keeps the time after the hand-over and starts nothing past the group", async () => {
    const { db, activities, routines } = await setup()
    const areaId = (await activities.byId("guitar"))?.areaId ?? ""
    const base = { areaId, status: "todo" as const, origin: null }
    await activities.createMany([
      { ...base, id: "session", title: "Study session", timer: up },
      { ...base, id: "block", parentId: "session", title: "Block" },
      {
        ...base,
        id: "read1",
        parentId: "block",
        title: "Read",
        timer: down(60),
      },
      { ...base, id: "notes1", parentId: "block", title: "Notes", timer: up },
      {
        ...base,
        id: "review",
        parentId: "session",
        title: "Review",
        timer: up,
      },
    ])
    await routines.apply("session", { kind: "playAll" })
    later(300)

    const discarded = await activities.setStatus("block", "done")

    expect(await recordings(db, "read1")).toEqual(["discarded"])
    expect(await recordings(db, "notes1")).toEqual(["discarded"])
    expect(await recordings(db, "review")).toEqual([])
    const session = await sessionFor(routines, "session")
    expect(runningEntry(session.run)).toBeNull()
    expect(offered(discarded, "read1")).toBe(60)
    expect(offered(discarded)).toBe(300)
  })
})

describe("finishing a group the timer is about to hand over into", () => {
  it("stops the step that would have started inside it", async () => {
    const { db, activities, routines } = await setup()
    const areaId = (await activities.byId("guitar"))?.areaId ?? ""
    const base = { areaId, status: "todo" as const, origin: null }
    await activities.createMany([
      { ...base, id: "bake", title: "Bake bread", timer: up },
      {
        ...base,
        id: "proof",
        parentId: "bake",
        title: "Proof",
        timer: down(30),
      },
      { ...base, id: "oven", parentId: "bake", title: "Oven" },
      { ...base, id: "loaf", parentId: "oven", title: "Loaf", timer: up },
    ])
    await routines.apply("bake", { kind: "playAll" })
    later(35)

    const discarded = await activities.setStatus("oven", "done")

    const session = await sessionFor(routines, "bake")
    expect(runningEntry(session.run)).toBeNull()
    expect(offered(discarded, "loaf")).toBe(5)
    expect(await recordings(db, "loaf")).toEqual(["discarded"])
    expect(await recordings(db, "proof")).toEqual(["pending"])
  })
})

describe("a stale Done on a step that just ticked itself", () => {
  it("keeps its time waiting", async () => {
    const { db, activities, routines } = await setup()
    await routines.apply("hiit", { kind: "playOnly", id: "round1" })
    await routines.apply("hiit", { kind: "play" })
    later(45)

    await activities.setStatus("round1", "done")

    expect(await recordings(db, "round1")).toEqual(["pending"])
  })
})

describe("finishing a group while only one of its steps was played", () => {
  it("gives no time to a step that never played", async () => {
    const { db, activities, routines } = await setup()
    const areaId = (await activities.byId("guitar"))?.areaId ?? ""
    const base = { areaId, status: "todo" as const, origin: null }
    await activities.createMany([
      { ...base, id: "kitchen", title: "Dinner", timer: up },
      { ...base, id: "sauce", parentId: "kitchen", title: "Sauce" },
      {
        ...base,
        id: "simmer",
        parentId: "sauce",
        title: "Simmer",
        timer: down(60),
      },
      {
        ...base,
        id: "reduce",
        parentId: "sauce",
        title: "Reduce",
        timer: down(60),
      },
    ])
    await routines.apply("kitchen", { kind: "playOnly", id: "simmer" })
    await routines.apply("kitchen", { kind: "play" })
    later(300)

    const discarded = await activities.setStatus("sauce", "done")

    expect(offered(discarded)).toBe(60)
    expect(await recordings(db, "simmer")).toEqual(["discarded"])
    expect(await recordings(db, "reduce")).toEqual([])
  })
})

describe("finishing a group the timer reached through earlier steps", () => {
  it("plays the earlier steps first and gives the group only its own time", async () => {
    const { activities, routines } = await setup()
    const areaId = (await activities.byId("guitar"))?.areaId ?? ""
    const base = { areaId, status: "todo" as const, origin: null }
    await activities.createMany([
      { ...base, id: "bread", title: "Bread", timer: up },
      {
        ...base,
        id: "rise",
        parentId: "bread",
        title: "Rise",
        timer: down(30),
      },
      {
        ...base,
        id: "shape",
        parentId: "bread",
        title: "Shape",
        timer: down(10),
      },
      { ...base, id: "bake", parentId: "bread", title: "Bake" },
      { ...base, id: "loaf2", parentId: "bake", title: "Loaf", timer: up },
    ])
    await routines.apply("bread", { kind: "playAll" })
    later(50)

    const discarded = await activities.setStatus("bake", "done")

    const session = await sessionFor(routines, "bread")
    expect(offered(discarded)).toBe(10)
    expect(offered(discarded, "loaf2")).toBe(10)
    expect(waiting(session, "shape")).toBe(10)
  })
})

describe("finishing a group that ends in a step that ticks itself", () => {
  it("keeps the routine ready to resume what comes after it", async () => {
    const { activities, routines } = await setup()
    await routines.apply("hiit", { kind: "playAll" })
    later(62)

    await activities.setStatus("set", "done")

    const session = await sessionFor(routines, "hiit")
    expect(session.current?.node.id).toBe("cooldown")
    expect((await routines.active())?.root.id).toBe("hiit")
  })
})

describe("finishing part of a routine after Start over, before it plays again", () => {
  it("leaves it waiting to start from the first open activity", async () => {
    const { activities, routines } = await setup()
    await routines.apply("guitar", { kind: "playAll" })
    later(20)
    await routines.apply("guitar", { kind: "startOver" })

    await activities.setStatus("scales", "done")

    const session = await sessionFor(routines, "guitar")
    expect(session.phase).toBe("idle")
    expect(session.current?.node.id).toBe("tuning")
  })
})

describe("Done on a step reopened in a finished routine", () => {
  it("doesn't bring the routine back into the dock", async () => {
    const { activities, routines } = await setup()
    await routines.apply("guitar", { kind: "playAll" })
    later(20)
    await activities.setStatus("guitar", "done")
    await activities.setStatus("tuning", "todo")
    await activities.setStatus("scales", "todo")

    await activities.setStatus("scales", "done")

    expect(await routines.active()).toBeNull()
  })
})

describe("upgrading from version 14", () => {
  it("keeps time inside anything closed and leaves the rest waiting, unless a routine plays it", async () => {
    const name = `recording-upgrade-${crypto.randomUUID()}`
    const old = new Dexie(name, { addons: [yDexie] })
    old.version(14).stores({
      activities:
        "id, workspaceId, areaId, goalId, typeId, parentId, [areaId+number], [workspaceId+updatedAt], content: Y.Doc",
      timeEntries: "id, [workspaceId+activityId], [workspaceId+startedAt]",
      routineRuns: "id, [workspaceId+updatedAt]",
    })
    const row = (id: string, status: string, parentId: string | null) => ({
      id,
      workspaceId: "ws-1",
      status,
      parentId,
    })
    await old
      .table("activities")
      .bulkAdd([
        row("routine", "done", null),
        row("step", "todo", "routine"),
        row("open", "todo", null),
        row("tea", "done", null),
        row("practice", "done", null),
        row("countdown", "todo", "practice"),
      ])
    await old
      .table("routineRuns")
      .add({ id: "practice", workspaceId: "ws-1", cursor: "countdown" })
    const entry = (id: string, activityId: string, endedAt: string | null) => ({
      id,
      workspaceId: "ws-1",
      activityId,
      startedAt: "2026-11-11T08:00:00.000Z",
      endedAt,
      source: "timer",
    })
    await old
      .table("timeEntries")
      .bulkAdd([
        entry("under-done-routine", "step", "2026-11-11T08:05:00.000Z"),
        entry("open", "open", "2026-11-11T08:05:00.000Z"),
        entry("closed", "tea", "2026-11-11T08:05:00.000Z"),
        entry("running", "tea", null),
        entry("playing", "countdown", "2026-11-11T08:05:00.000Z"),
      ])
    old.close()

    const db = createLocalDb(name)
    openDbs.push(db)
    const recording = async (id: string) => {
      const stored = await db.timeEntries.get(id)
      return stored?.source === "timer" ? stored.recording : null
    }
    expect(await recording("under-done-routine")).toBe("recorded")
    expect(await recording("open")).toBe("pending")
    expect(await recording("closed")).toBe("recorded")
    expect(await recording("running")).toBe("pending")
    expect(await recording("playing")).toBe("pending")
  })
})
