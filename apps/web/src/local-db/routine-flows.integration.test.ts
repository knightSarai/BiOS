import "fake-indexeddb/auto"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { now, parseUtc } from "@knight-os/server/core"
import { backToBack, endOf, logPlan } from "@/activities/log-time"
import {
  findNode,
  loggedSeconds,
  runningEntry,
  sessionOf,
  type Session,
} from "@/activities/routine"
import {
  actualVersusPlanned,
  cuesAhead,
  timeNote,
} from "@/activities/routine-view"
import { seriesSteps } from "@/activities/series"
import { ActivitiesRepository } from "./activities"
import { ActivityTypesRepository } from "./activity-types"
import { AreasRepository } from "./areas"
import { createLocalDb, type LocalDb } from "./db"
import { RoutinesRepository, toSeconds } from "./routines"
import { TimeEntriesRepository } from "./time-entries"

// Whole user journeys through the real repositories: what a click writes, what a reload
// reads back, and what the timer shows from it.

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

const at = (minutes: number, seconds = 0) =>
  `2026-11-11T09:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.000Z`

const down = (seconds: number) => ({
  mode: "down" as const,
  seconds,
  sound: "bell" as const,
})

const up = { mode: "up" as const, sound: "bell" as const }

const ctx = { workspaceId: "ws-1" }

const openDb = () => {
  const db = createLocalDb(`routine-flows-${crypto.randomUUID()}`)
  openDbs.push(db)
  return db
}

const repositories = (db: LocalDb) => ({
  activities: new ActivitiesRepository(db, ctx),
  routines: new RoutinesRepository(db, ctx),
  entries: new TimeEntriesRepository(db, ctx),
})

// Guitar practice: a warm-up, two generated scale rounds, a song played at your own pace
// and a short cool-down.
const guitarPractice = async () => {
  const db = openDb()
  const repos = repositories(db)
  const music = await new AreasRepository(db, ctx).ensureDefault("Music")
  const base = { areaId: music.id, status: "todo" as const, origin: null }
  await repos.activities.createMany([
    { ...base, id: "guitar", title: "Guitar practice", timer: up },
    {
      ...base,
      id: "warmup",
      parentId: "guitar",
      title: "Warm-up",
      timer: down(300),
    },
    {
      ...base,
      id: "scales",
      parentId: "guitar",
      title: "Scales",
      series: true,
    },
    {
      ...base,
      id: "scales1",
      parentId: "scales",
      title: "Scales 1",
      timer: down(120),
      generated: "step",
    },
    {
      ...base,
      id: "scales2",
      parentId: "scales",
      title: "Scales 2",
      timer: down(120),
      generated: "step",
    },
    { ...base, id: "song", parentId: "guitar", title: "Song", timer: up },
    {
      ...base,
      id: "cooldown",
      parentId: "guitar",
      title: "Cool-down",
      timer: down(60),
    },
  ])
  return { db, ...repos }
}

const timerEntries = async (db: LocalDb) =>
  (await db.timeEntries.toArray())
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .map((entry) => ({
      activityId: entry.activityId,
      startedAt: entry.startedAt,
      endedAt: entry.endedAt,
      source: entry.source,
    }))

const statusesOf = async (activities: ActivitiesRepository, ids: string[]) =>
  Object.fromEntries(
    await Promise.all(
      ids.map(
        async (id) => [id, (await activities.byId(id))?.status ?? null] as const
      )
    )
  )

// What a page reads after a reload: the stored routine, rolled forward to the clock.
const readBack = async (routines: RoutinesRepository, activityId: string) => {
  const state = await routines.state(activityId)
  if (!state) throw new Error("Expected a routine")
  return sessionOf(
    state.root,
    state.run,
    toSeconds(parseUtc(now())),
    () => "unsaved"
  )
}

const noteFor = (session: Session, id: string) => {
  const node = findNode(session.root, id)
  if (!node) throw new Error(`No activity ${id}`)
  return timeNote(actualVersusPlanned(session, node))
}

describe("a routine, end to end", () => {
  it("runs to the end: countdowns hand over, steps tick, Done moves past a count-up", async () => {
    const { db, routines, activities } = await guitarPractice()

    await routines.apply("guitar", { kind: "playAll" })
    later(300 + 120 + 120 + 45)
    const onSong = await routines.apply("guitar", { kind: "sync" })
    expect(onSong.phase).toBe("running")
    expect(onSong.current?.node.id).toBe("song")

    later(15)
    const onCooldown = await routines.apply("guitar", { kind: "next" })
    expect(onCooldown.current?.node.id).toBe("cooldown")
    later(60)
    // The last countdown stops at "Timer ended"; Next moves past it.
    const ended = await routines.apply("guitar", { kind: "sync" })
    expect(ended.phase).toBe("paused")
    expect(ended.current?.node.id).toBe("cooldown")
    expect(runningEntry(ended.run)).toBeNull()
    const finished = await routines.apply("guitar", { kind: "next" })

    expect(finished.phase).toBe("finished")
    expect(runningEntry(finished.run)).toBeNull()
    expect(await timerEntries(db)).toEqual([
      {
        activityId: "warmup",
        startedAt: at(0),
        endedAt: at(5),
        source: "timer",
      },
      {
        activityId: "scales1",
        startedAt: at(5),
        endedAt: at(7),
        source: "timer",
      },
      {
        activityId: "scales2",
        startedAt: at(7),
        endedAt: at(9),
        source: "timer",
      },
      {
        activityId: "song",
        startedAt: at(9),
        endedAt: at(10),
        source: "timer",
      },
      {
        activityId: "cooldown",
        startedAt: at(10),
        endedAt: at(11),
        source: "timer",
      },
    ])
    // Generated steps tick themselves; real activities are only passed, never ticked.
    expect(
      await statusesOf(activities, [
        "warmup",
        "scales1",
        "scales2",
        "song",
        "cooldown",
      ])
    ).toEqual({
      warmup: "todo",
      scales1: "done",
      scales2: "done",
      song: "todo",
      cooldown: "todo",
    })
    expect(loggedSeconds(finished.run, finished.root, finished.now)).toBe(660)
  })

  it("after a reload, shows the right step and writes the missed hand-overs in one sync", async () => {
    const { db } = await guitarPractice()
    await repositories(db).routines.apply("guitar", { kind: "playAll" })

    later(300 + 120 + 30)
    const reloaded = repositories(db)
    const shown = await readBack(reloaded.routines, "song")
    expect(shown.phase).toBe("running")
    expect(shown.current?.node.id).toBe("scales2")
    expect(shown.position).toBe(3)
    expect((await reloaded.entries.running())?.activityId).toBe("warmup")

    await reloaded.routines.apply("guitar", { kind: "sync" })
    const written = await timerEntries(db)
    expect(written).toEqual([
      {
        activityId: "warmup",
        startedAt: at(0),
        endedAt: at(5),
        source: "timer",
      },
      {
        activityId: "scales1",
        startedAt: at(5),
        endedAt: at(7),
        source: "timer",
      },
      {
        activityId: "scales2",
        startedAt: at(7),
        endedAt: null,
        source: "timer",
      },
    ])
    expect((await reloaded.activities.byId("scales1"))?.status).toBe("done")

    // The cues ahead are what gets armed again: Scales 2 runs out at 9:00 and hands to the
    // song, which counts up, so nothing is scheduled after it.
    const resumed = await readBack(reloaded.routines, "guitar")
    expect(cuesAhead(resumed)).toEqual([
      { at: toSeconds(parseUtc(at(9))), cue: "work" },
    ])

    later(5)
    await reloaded.routines.apply("guitar", { kind: "sync" })
    expect(await timerEntries(db)).toEqual(written)
  })

  it("logs a past session as a total, then split back to back, without ever running it", async () => {
    const { db, routines, entries, activities } = await guitarPractice()
    const { root } = await readBack(routines, "guitar")

    const total = logPlan(
      root,
      { took: "45:00", when: { date: "2026-11-10", time: "19:00" } },
      "UTC",
      parseUtc(now())
    )
    if ("error" in total) throw new Error(total.error)
    await entries.log(total.sessions)

    const afterTotal = await readBack(routines, "guitar")
    expect(loggedSeconds(afterTotal.run, afterTotal.root, afterTotal.now)).toBe(
      2700
    )
    expect(noteFor(afterTotal, "guitar")).toBe("logged")
    expect(afterTotal.phase).toBe("idle")
    expect(runningEntry(afterTotal.run)).toBeNull()

    later(60)
    const split = {
      sessions: backToBack(
        [
          { activityId: "warmup", seconds: 300 },
          { activityId: "scales1", seconds: 120 },
          { activityId: "song", seconds: 600 },
          { activityId: "scales2", seconds: 0 },
          { activityId: "cooldown", seconds: 60 },
        ],
        endOf({ date: "2026-11-11", time: "08:30" }, "UTC", parseUtc(now()))
      ),
    }
    await entries.log(split.sessions)

    expect(
      split.sessions.map((session) => [
        session.activityId,
        session.startedAt,
        session.endedAt,
      ])
    ).toEqual([
      ["warmup", "2026-11-11T08:12:00.000Z", "2026-11-11T08:17:00.000Z"],
      ["scales1", "2026-11-11T08:17:00.000Z", "2026-11-11T08:19:00.000Z"],
      ["song", "2026-11-11T08:19:00.000Z", "2026-11-11T08:29:00.000Z"],
      ["cooldown", "2026-11-11T08:29:00.000Z", "2026-11-11T08:30:00.000Z"],
    ])
    // Adding time never changes a status.
    expect(
      await statusesOf(activities, ["guitar", "warmup", "scales1", "scales2"])
    ).toEqual({
      guitar: "todo",
      warmup: "todo",
      scales1: "todo",
      scales2: "todo",
    })

    const afterSplit = await readBack(routines, "guitar")
    expect(loggedSeconds(afterSplit.run, afterSplit.root, afterSplit.now)).toBe(
      2700 + 300 + 120 + 600 + 60
    )
    expect(noteFor(afterSplit, "guitar")).toBe("logged")
    expect(noteFor(afterSplit, "song")).toBe("logged")
    expect(runningEntry(afterSplit.run)).toBeNull()
    expect(await entries.running()).toBeUndefined()

    // Start over resets the run: what was typed in before it stays stored but no longer
    // counts toward this run, since it counts by when it was logged.
    const typed = await timerEntries(db)
    later(60)
    const fresh = await routines.apply("guitar", { kind: "startOver" })
    expect(fresh.phase).toBe("idle")
    expect(loggedSeconds(fresh.run, fresh.root, fresh.now)).toBe(0)
    expect(await timerEntries(db)).toEqual(typed)
    expect((await activities.byId("warmup"))?.status).toBe("todo")

    // Playing over it leaves the typed-in sessions exactly where they were.
    const playing = await routines.apply("guitar", { kind: "playAll" })
    expect(runningEntry(playing.run)).toMatchObject({
      activityId: "warmup",
      manual: false,
      recording: "pending",
    })
    later(400)
    await routines.apply("guitar", { kind: "sync" })
    const manual = (await timerEntries(db)).filter(
      (entry) => entry.source === "manual"
    )
    expect(manual).toEqual(typed)
  })

  it("plays a Repeat series added through addSeries in order, with gaps between", async () => {
    const db = openDb()
    const { activities, routines } = repositories(db)
    const work = await new AreasRepository(db, ctx).ensureDefault("Work")
    const types = new ActivityTypesRepository(db, ctx)
    const check = await types.create({ name: "Check", color: "chart-1" })
    const pause = await types.create({ name: "Pause", color: "chart-2" })
    await activities.createMany([
      {
        id: "release",
        areaId: work.id,
        title: "Release checklist",
        status: "todo",
        origin: null,
      },
    ])
    const steps = seriesSteps({
      title: "Smoke test",
      timer: down(120),
      typeId: check.id,
      repeat: 3,
      gap: {
        title: "Fix-up",
        duration: "01:00",
        typeId: pause.id,
        typeName: pause.name,
      },
      sound: "bell",
    })
    await activities.addSeries(
      "release",
      {
        id: "holder",
        areaId: work.id,
        title: "Smoke test",
        status: "todo",
        origin: null,
      },
      steps.map((step, index) => ({
        id: `step${index + 1}`,
        areaId: work.id,
        title: step.title,
        typeId: step.typeId,
        timer: step.timer,
        generated: step.generated,
        status: "todo",
        origin: null,
      }))
    )

    const started = await routines.apply("release", { kind: "playAll" })
    expect(started.leaves.map((leaf) => leaf.node.title)).toEqual([
      "Smoke test 1",
      "Fix-up",
      "Smoke test 2",
      "Fix-up",
      "Smoke test 3",
    ])
    const start = toSeconds(parseUtc(at(0)))
    expect(cuesAhead(started)).toEqual([
      { at: start + 120, cue: "rest" },
      { at: start + 180, cue: "work" },
      { at: start + 300, cue: "rest" },
      { at: start + 360, cue: "work" },
      { at: start + 480, cue: "finish" },
    ])

    later(130)
    const inGap = await readBack(routines, "release")
    expect(inGap.current?.node.title).toBe("Fix-up")
    expect(inGap.current?.node.id).toBe("step2")

    later(400)
    const finished = await routines.apply("release", { kind: "sync" })
    expect(finished.phase).toBe("finished")
    expect(
      (await timerEntries(db)).map((entry) => [
        entry.activityId,
        entry.startedAt,
        entry.endedAt,
      ])
    ).toEqual([
      ["step1", at(0), at(2)],
      ["step2", at(2), at(3)],
      ["step3", at(3), at(5)],
      ["step4", at(5), at(6)],
      ["step5", at(6), at(8)],
    ])
    expect(
      await statusesOf(activities, [
        "step1",
        "step2",
        "step3",
        "step4",
        "step5",
      ])
    ).toEqual({
      step1: "done",
      step2: "done",
      step3: "done",
      step4: "done",
      step5: "done",
    })
  })

  it("splits a running count-up into laps, back to back", async () => {
    const { db, routines, activities } = await guitarPractice()
    await routines.apply("guitar", { kind: "jumpTo", id: "song" })
    await routines.apply("guitar", { kind: "play" })

    later(90)
    await routines.apply("guitar", { kind: "lap" })
    later(60)
    const onLap3 = await routines.apply("guitar", { kind: "lap" })
    expect(onLap3.current?.node.title).toBe("Lap 3")
    expect(onLap3.current?.parent.id).toBe("song")
    later(30)
    const onCooldown = await routines.apply("guitar", { kind: "next" })

    const laps = await activities.children("song")
    expect(laps.map((lap) => [lap.title, lap.generated, lap.status])).toEqual([
      ["Lap 1", "lap", "done"],
      ["Lap 2", "lap", "done"],
      ["Lap 3", "lap", "done"],
    ])
    const lapIds = laps.map((lap) => lap.id)
    expect(await timerEntries(db)).toEqual([
      {
        activityId: lapIds[0],
        startedAt: at(0),
        endedAt: at(1, 30),
        source: "timer",
      },
      {
        activityId: lapIds[1],
        startedAt: at(1, 30),
        endedAt: at(2, 30),
        source: "timer",
      },
      {
        activityId: lapIds[2],
        startedAt: at(2, 30),
        endedAt: at(3),
        source: "timer",
      },
      {
        activityId: "cooldown",
        startedAt: at(3),
        endedAt: null,
        source: "timer",
      },
    ])
    const song = findNode(onCooldown.root, "song")
    if (!song) throw new Error("Expected the song")
    expect(loggedSeconds(onCooldown.run, song, onCooldown.now)).toBe(180)
    expect(onCooldown.current?.node.id).toBe("cooldown")
  })
})
