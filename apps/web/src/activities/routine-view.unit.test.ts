import { describe, expect, it } from "vitest"
import {
  act,
  sessionOf,
  type Action,
  type RoutineNode,
  type Run,
} from "./routine"
import {
  actualVersusPlanned,
  controlsOf,
  cuesAhead,
  dockOn,
  failureOf,
  fullScreenExit,
  fullScreenOf,
  isPaused,
  keptAfterExit,
  jumpHint,
  lapOf,
  nextOf,
  offersStartOver,
  pageViewOf,
  playOnlyHint,
  primaryOf,
  progressText,
  roughly,
  shownRoutine,
  stepInfo,
  stepSuffix,
  summaryOf,
  timeNote,
} from "./routine-view"

const down = (seconds: number) => ({
  mode: "down" as const,
  seconds,
  sound: "bell" as const,
})
const up = { mode: "up" as const, sound: "bell" as const }

const node = (
  id: string,
  timer: RoutineNode["timer"],
  options: Partial<Omit<RoutineNode, "id" | "timer">> = {}
): RoutineNode => ({
  id,
  title: id,
  timer,
  typeId: null,
  generated: null,
  series: false,
  children: [],
  ...options,
})

// Untyped on purpose: only the generated kind tells a rest from the work.
const step = (id: string, seconds: number, kind: "step" | "gap") =>
  node(id, down(seconds), { title: id, generated: kind })

// Guitar practice: tuning, then three rounds of chord changes with rests, then a song.
const practice = node("practice", up, {
  children: [
    node("tuning", down(120)),
    node("changes", up, {
      series: true,
      children: [
        step("Changes 1", 60, "step"),
        step("Rest", 15, "gap"),
        step("Changes 2", 60, "step"),
        step("Rest ", 15, "gap"),
        step("Changes 3", 60, "step"),
      ],
    }),
    node("song", up),
  ],
})

const emptyRun = (): Run => ({
  entries: [],
  cursor: null,
  passed: [],
  done: [],
  canceled: [],
  replay: [],
  scopeId: null,
  runStart: 0,
  attemptFrom: {},
  joinedAt: {},
  started: false,
})

const played = (
  root: RoutineNode,
  steps: [number, Action][],
  now: number,
  within?: string
) => {
  let next = 0
  const newId = () => `id-${(next += 1)}`
  const run = steps.reduce(
    (current, [second, action]) =>
      act(root, current, action, second, newId, within ?? null).run,
    emptyRun()
  )
  return sessionOf(root, run, now, newId)
}

const at = (steps: [number, Action][], now: number, within?: string) =>
  played(practice, steps, now, within)

describe("step labels", () => {
  it("counts the work in a series and leaves the rests out", () => {
    const session = at(
      [
        [1000, { kind: "playAll" }],
        [1010, { kind: "next" }],
      ],
      1011
    )
    expect(session.current?.node.id).toBe("Changes 1")
    expect(stepInfo(session)).toEqual({ kind: "work", index: 1, count: 3 })
    expect(stepSuffix(session)).toBe(" of 3")
    expect(nextOf(session)).toMatchObject({ label: "Done", skip: false })
  })

  it("names a rest by the work it follows, and lets you skip it", () => {
    const session = at([[1000, { kind: "playAll" }]], 1000 + 120 + 60 + 5)
    expect(session.current?.node.id).toBe("Rest")
    expect(stepInfo(session)).toEqual({ kind: "gap", after: "Changes 1" })
    expect(stepSuffix(session)).toBe("")
    expect(nextOf(session)).toMatchObject({ label: "Skip", skip: true })
  })

  it("writes the place after a title that doesn't end in its number", () => {
    const scales = node("scales", up, {
      children: [
        node("warm", up, {
          children: [
            node("Scales", down(30), { typeId: "practice" }),
            node("Arpeggios", down(30), { typeId: "practice" }),
          ],
        }),
      ],
    })
    const session = sessionOf(
      scales,
      { ...emptyRun(), cursor: "Arpeggios" },
      0,
      () => "x"
    )
    expect(stepSuffix(session)).toBe(" · 2 of 2")
  })

  it("offers Lap on a count-up and Finish on the last one", () => {
    const session = at(
      [
        [0, { kind: "playAll" }],
        [5, { kind: "jumpTo", id: "song" }],
        [6, { kind: "play" }],
      ],
      10
    )
    expect(lapOf(session)?.hint).toBe(
      "Split song: this time becomes Lap 1, Lap 2 starts"
    )
    expect(nextOf(session)?.label).toBe("Finish")
    expect(primaryOf(session).label).toBe("Pause")
  })

  it("asks before starting a finished routine over, but replays a finished part", () => {
    const done = { ...emptyRun(), passed: practice.children.flatMap(leafIds) }
    const finished = sessionOf(practice, done, 0, () => "x")
    expect(primaryOf(finished).action).toEqual({ kind: "askStartOver" })
    expect(primaryOf({ ...finished, within: "changes" }).label).toBe(
      "Play again"
    )
  })
})

const leafIds = (each: RoutineNode): string[] =>
  each.children.length === 0 ? [each.id] : each.children.flatMap(leafIds)

describe("the view from a sub-activity's page", () => {
  it("sees only its own activities and stays idle while another part runs", () => {
    const session = at([[0, { kind: "playAll" }]], 10)
    const view = pageViewOf(session, "changes")
    expect(view.leaves.map((leaf) => leaf.node.id)).toEqual(
      leafIds(practice.children[1])
    )
    expect(view.phase).toBe("idle")
    expect(view.current?.node.id).toBe("Changes 1")
    expect(view.within).toBe("changes")
  })

  it("follows the part when it's the one running", () => {
    const session = at([[0, { kind: "playAll" }]], 130)
    const view = pageViewOf(session, "changes")
    expect(view.phase).toBe("running")
    expect(view.position).toBe(1)
  })
})

describe("cuesAhead", () => {
  it("rings work after work, rest before a rest, and finish at the end of a countdown run", () => {
    const changes = practice.children[1]
    const session = at([[0, { kind: "playOnly", id: "changes" }]], 0)
    const running = sessionOf(
      practice,
      act(practice, session.run, { kind: "play" }, 100, () => "y").run,
      100,
      () => "z"
    )
    expect(running.scope?.id).toBe(changes.id)
    expect(cuesAhead(running)).toEqual([
      { at: 160, cue: "rest" },
      { at: 175, cue: "work" },
      { at: 235, cue: "rest" },
      { at: 250, cue: "work" },
      { at: 310, cue: "finish" },
    ])
  })

  it("stops at a count-up, which only ends when you move on", () => {
    const session = at([[0, { kind: "playAll" }]], 30)
    const cues = cuesAhead(session)
    expect(cues[0]).toEqual({ at: 120, cue: "work" })
    expect(cues.at(-1)).toEqual({ at: 120 + 60 * 3 + 15 * 2, cue: "work" })
  })

  it("schedules nothing while paused", () => {
    const session = at(
      [
        [0, { kind: "playAll" }],
        [5, { kind: "pause" }],
      ],
      30
    )
    expect(cuesAhead(session)).toEqual([])
  })
})

describe("progress text", () => {
  it("rounds what's left and says when some of it can't be counted", () => {
    expect(roughly(20)).toBe("under a minute")
    expect(roughly(25 * 60)).toBe("25 min")
    expect(roughly(90 * 60)).toBe("1 h 30 min")
    const session = at([[0, { kind: "playAll" }]], 60)
    expect(progressText(session)).toBe("at least 5 min to go")
  })
})

describe("the note after an activity's time", () => {
  const tuning = practice.children[0]
  const typed = (seconds: number) => ({
    id: `typed-${seconds}`,
    activityId: "tuning",
    start: 0,
    end: seconds,
    manual: true as const,
    logged: 5000,
  })
  const noteFor = (run: Run) =>
    timeNote(
      actualVersusPlanned(
        sessionOf(practice, run, 6000, () => "x"),
        tuning
      )
    )

  it("says logged when the time was typed in, even if it was under the plan", () => {
    const run = { ...emptyRun(), done: ["tuning"], entries: [typed(100)] }
    const result = actualVersusPlanned(
      sessionOf(practice, run, 6000, () => "x"),
      tuning
    )
    expect(result).toMatchObject({ actual: 100, planned: 120, early: true })
    expect(timeNote(result)).toBe("logged")
  })

  it("says part logged when some was timed and some typed in", () => {
    const timed = {
      id: "timed",
      activityId: "tuning",
      start: 5100,
      end: 5130,
      manual: false as const,
    }
    expect(noteFor({ ...emptyRun(), entries: [typed(60), timed] })).toBe(
      "part logged"
    )
  })

  it("keeps ended early for timed work and says nothing when it ran to plan", () => {
    const timed = (end: number) => ({
      id: "timed",
      activityId: "tuning",
      start: 5000,
      end,
      manual: false as const,
    })
    expect(
      noteFor({ ...emptyRun(), done: ["tuning"], entries: [timed(5060)] })
    ).toBe("ended early")
    expect(
      noteFor({ ...emptyRun(), done: ["tuning"], entries: [timed(5120)] })
    ).toBeNull()
  })

  it("rolls typed-in time up to the parent", () => {
    const changes = practice.children[1]
    const run = {
      ...emptyRun(),
      entries: [{ ...typed(60), activityId: "Changes 2" }],
    }
    const result = actualVersusPlanned(
      sessionOf(practice, run, 6000, () => "x"),
      changes
    )
    expect(result).toMatchObject({ actual: 60, typedIn: "all" })
  })
})

describe("the buttons a timer offers", () => {
  it("offers only Play again once the part played on its own is done", () => {
    const session = at(
      [
        [0, { kind: "playOnly", id: "tuning" }],
        [1, { kind: "play" }],
        [10, { kind: "next" }],
      ],
      11
    )
    expect(session.phase).toBe("scopeDone")
    const controls = controlsOf(session)
    expect(controls.primary.label).toBe("Play again")
    expect(controls.prev).toBeNull()
    expect(controls.lap).toBeNull()
    expect(controls.next).toBeNull()
  })

  it("can't go back from the first activity of the part playing on its own", () => {
    const session = at(
      [
        [0, { kind: "playOnly", id: "changes" }],
        [1, { kind: "play" }],
      ],
      5
    )
    expect(session.current?.node.id).toBe("Changes 1")
    expect(controlsOf(session).prev).toMatchObject({ disabled: true })
  })

  it("says Start after Play only this, and Resume once something was timed", () => {
    const picked = at([[0, { kind: "playOnly", id: "changes" }]], 5)
    expect(picked.phase).toBe("paused")
    expect(primaryOf(picked)).toMatchObject({
      label: "Start",
      action: { kind: "play" },
    })
    const paused = at(
      [
        [0, { kind: "playOnly", id: "changes" }],
        [1, { kind: "play" }],
        [5, { kind: "pause" }],
      ],
      6
    )
    expect(primaryOf(paused).label).toBe("Resume")
  })
})

describe("Finish on a sub-activity's page", () => {
  const onLastChange = (within?: string) =>
    at(
      [
        [0, { kind: "playAll" }],
        [1, { kind: "jumpTo", id: "Changes 3" }],
        [2, { kind: "play" }],
      ],
      3,
      within
    )

  it("says Done on the page's last one while the routine carries on after it", () => {
    const view = pageViewOf(onLastChange(), "changes")
    expect(view.next?.node.id).toBe("song")
    expect(nextOf(view)?.label).toBe("Done")
  })

  it("says Finish when the page's part is all that was started", () => {
    const view = pageViewOf(onLastChange("changes"), "changes")
    expect(view.next).toBeNull()
    expect(nextOf(view)?.label).toBe("Finish")
  })
})

describe("which routine the dock shows", () => {
  // A work checklist, so a second routine can be paused while the practice runs.
  const review = node("review", up, {
    children: [node("inbox", up), node("calendar", up)],
  })
  const reviewPaused = played(
    review,
    [
      [0, { kind: "playAll" }],
      [5, { kind: "pause" }],
    ],
    6
  )
  const practiceRunning = at([[0, { kind: "playAll" }]], 10)
  const practicePaused = at(
    [
      [0, { kind: "playAll" }],
      [5, { kind: "pause" }],
    ],
    10
  )
  const reviewIdle = played(review, [], 0)

  it("keeps a routine running elsewhere in reach on another routine's page", () => {
    expect(shownRoutine(reviewPaused, "review", practiceRunning)).toMatchObject(
      {
        session: { root: { id: "practice" } },
        pageId: null,
        onOwnPage: false,
      }
    )
  })

  it("shows the page's own routine once it has been played", () => {
    expect(shownRoutine(reviewPaused, "review", practicePaused)).toMatchObject({
      session: { root: { id: "review" } },
      pageId: "review",
      onOwnPage: true,
    })
  })

  it("shows the paused routine on a page whose own routine never ran", () => {
    expect(shownRoutine(reviewIdle, "review", practicePaused)).toMatchObject({
      session: { root: { id: "practice" } },
      onOwnPage: false,
    })
  })

  it("shows the whole routine on a sub-page whose part isn't the one playing", () => {
    expect(
      shownRoutine(practiceRunning, "song", practiceRunning)
    ).toMatchObject({
      session: { root: { id: "practice" } },
      pageId: null,
      onOwnPage: false,
    })
  })

  it("shows nothing when no routine has been played", () => {
    expect(shownRoutine(reviewIdle, "review", null)).toBeNull()
  })

  it("keeps the routine full screen is open for there, finished or started over", () => {
    const reviewFinished = played(
      review,
      [
        [0, { kind: "playAll" }],
        [5, { kind: "next" }],
        [9, { kind: "next" }],
      ],
      10
    )
    expect(reviewFinished.phase).toBe("finished")
    expect(
      fullScreenOf(reviewFinished, shownRoutine(null, null, null))
    ).toMatchObject({
      session: { root: { id: "review" } },
      onOwnPage: false,
    })
    const startedOver = played(
      review,
      [
        [0, { kind: "playAll" }],
        [5, { kind: "next" }],
        [9, { kind: "next" }],
        [12, { kind: "startOver" }],
      ],
      15
    )
    expect(startedOver.phase).toBe("idle")
    expect(
      fullScreenOf(startedOver, shownRoutine(null, null, null))
    ).toMatchObject({
      session: { root: { id: "review" } },
    })
  })

  it("keeps full screen on its routine after Start over while the dock shows another paused one", () => {
    const startedOver = played(
      review,
      [
        [0, { kind: "playAll" }],
        [5, { kind: "pause" }],
        [8, { kind: "startOver" }],
      ],
      10
    )
    const dock = shownRoutine(null, null, practicePaused)
    expect(dock).toMatchObject({ session: { root: { id: "practice" } } })
    expect(fullScreenOf(startedOver, dock)).toMatchObject({
      session: { root: { id: "review" } },
      pageId: null,
    })
    expect(fullScreenOf(null, dock)).toBe(dock)
  })
})

describe("Previous on a sub-activity's page", () => {
  it("is enabled when the routine plays on from before the page, as the engine moves", () => {
    const session = at([[0, { kind: "playAll" }]], 130)
    expect(session.current?.node.id).toBe("Changes 1")
    const page = pageViewOf(session, "changes")
    expect(controlsOf(page).prev).toMatchObject({ disabled: false })
    const moved = act(
      practice,
      session.run,
      { kind: "prev" },
      131,
      () => "p",
      "changes"
    ).run
    expect(moved.cursor).toBe("tuning")
  })
})

describe("paused presentation", () => {
  it("isn't paused after Play only this until something was timed", () => {
    const picked = at([[0, { kind: "playOnly", id: "changes" }]], 5)
    expect(picked.phase).toBe("paused")
    expect(isPaused(picked)).toBe(false)
    const paused = at(
      [
        [0, { kind: "playOnly", id: "changes" }],
        [1, { kind: "play" }],
        [5, { kind: "pause" }],
      ],
      6
    )
    expect(isPaused(paused)).toBe(true)
  })
})

describe("a clock with milliseconds", () => {
  const start = 1794387600.123
  const shortRun = (): Run => ({
    ...emptyRun(),
    started: true,
    runStart: start,
    cursor: "tuning",
    entries: [
      {
        id: "t1",
        activityId: "tuning",
        start,
        end: start + 120 - 0.001,
        manual: false,
      },
    ],
  })

  it("offers Do again, not Resume, for a countdown stored a millisecond short", () => {
    const session = sessionOf(practice, shortRun(), start + 200, () => "x")
    expect(primaryOf(session).label).toBe("Do again")
  })

  it("schedules a countdown that ran out a millisecond short in full when handed to again", () => {
    const run: Run = {
      ...emptyRun(),
      started: true,
      runStart: start,
      cursor: "tuning",
      entries: [
        {
          id: "c1",
          activityId: "Changes 1",
          start,
          end: start + 60 - 0.001,
          manual: false,
        },
        {
          id: "t1",
          activityId: "tuning",
          start: start + 100,
          end: null,
          manual: false,
        },
      ],
    }
    const session = sessionOf(practice, run, start + 110, () => "x")
    expect(session.current?.node.id).toBe("tuning")
    const cues = cuesAhead(session)
    expect(cues[0]?.at).toBeCloseTo(start + 220, 6)
    expect(cues[1]?.at).toBeCloseTo(start + 280, 6)
  })
})

describe("going to an activity on the bar", () => {
  it("says it pauses while the timer runs, and not when it's stopped", () => {
    const running = at([[0, { kind: "playAll" }]], 10)
    expect(jumpHint(running, "Song")).toBe("Go to Song (pauses)")
    const paused = at(
      [
        [0, { kind: "playAll" }],
        [5, { kind: "pause" }],
      ],
      10
    )
    expect(jumpHint(paused, "Song")).toBe("Go to Song")
  })
})

describe("Play only this in a row's menu", () => {
  it("says it pauses while the timer runs, from any page of the routine", () => {
    const running = at([[0, { kind: "playAll" }]], 10)
    expect(playOnlyHint(running)).toBe("waits for Start (pauses)")
    const songPage = pageViewOf(running, "song")
    expect(songPage.phase).toBe("idle")
    expect(playOnlyHint(songPage)).toBe("waits for Start (pauses)")
    const paused = at(
      [
        [0, { kind: "playAll" }],
        [5, { kind: "pause" }],
      ],
      10
    )
    expect(playOnlyHint(paused)).toBe("waits for Start")
  })
})

describe("a routine ticked done by hand before it was timed", () => {
  it("offers only Start, from its first activity", () => {
    const ticked = sessionOf(
      practice,
      { ...emptyRun(), done: leafIds(practice) },
      0,
      () => "id"
    )
    expect(ticked.current?.node.id).toBe(leafIds(practice)[0])
    expect(controlsOf(ticked)).toMatchObject({
      primary: { label: "Start", action: { kind: "playAll" } },
      prev: null,
      lap: null,
      next: null,
    })
  })
})

describe("a part played on its own that has finished", () => {
  const finished = () =>
    at(
      [
        [0, { kind: "playOnly", id: "tuning" }],
        [1, { kind: "play" }],
      ],
      200
    )

  it("sums up that part, not the activity after it", () => {
    const session = finished()
    expect(session.phase).toBe("scopeDone")
    expect(session.current).toBeNull()
    expect(summaryOf(session)).toEqual({
      node: practice.children[0],
      complete: true,
      seconds: 120,
    })
    expect(controlsOf(session).primary.label).toBe("Play again")
  })

  it("reads finished on that part's page", () => {
    const view = pageViewOf(finished(), "tuning")
    expect(view.phase).toBe("finished")
    expect(primaryOf(view).label).toBe("Play again")
  })
})

describe("leaving full screen", () => {
  it("steps back only to a page this visit opened it from", () => {
    expect(fullScreenExit(true, true)).toBe("back")
    expect(fullScreenExit(false, true)).toBe("replace")
    expect(fullScreenExit(true, false)).toBe("replace")
  })

  it("keeps a routine full screen was entered for again while the exit navigated", () => {
    expect(keptAfterExit("morning", "morning")).toBeNull()
    expect(keptAfterExit("practice", "morning")).toBe("practice")
  })
})

describe("Done on the activity playing", () => {
  const runFor = (steps: [number, Action][]) => {
    let next = 0
    const newId = () => `id-${(next += 1)}`
    return steps.reduce(
      (current, [second, action]) =>
        act(practice, current, action, second, newId).run,
      emptyRun()
    )
  }

  it("ticks an activity you wrote, then moves on", () => {
    const tuning = at([[0, { kind: "playAll" }]], 30)
    const done = nextOf(tuning)
    expect(done).toMatchObject({
      label: "Done",
      hint: "Mark tuning done (saved as 0:30 of 2:00) and start Changes 1",
      action: { kind: "toggleDone", id: "tuning", from: "tuning" },
    })
    if (!done) throw new Error("Expected Done")
    const run = runFor([
      [0, { kind: "playAll" }],
      [30, done.action],
    ])
    expect(run.done).toContain("tuning")
    const after = sessionOf(practice, run, 31, () => "x")
    expect(after.phase).toBe("running")
    expect(after.current?.node.id).toBe("Changes 1")
  })

  it("moves past a generated step, which ticks itself", () => {
    const changes = at(
      [
        [0, { kind: "playAll" }],
        [10, { kind: "next", from: "tuning" }],
      ],
      20
    )
    expect(changes.current?.node.id).toBe("Changes 1")
    expect(nextOf(changes)?.action).toEqual({
      kind: "next",
      from: "Changes 1",
    })
  })

  it("acts once on a double tap", () => {
    const tapped = runFor([
      [0, { kind: "playAll" }],
      [10, { kind: "toggleDone", id: "tuning", from: "tuning" }],
      [10, { kind: "toggleDone", id: "tuning", from: "tuning" }],
      [11, { kind: "next", from: "Changes 1" }],
      [11, { kind: "next", from: "Changes 1" }],
    ])
    expect(tapped.done).toContain("tuning")
    expect(sessionOf(practice, tapped, 12, () => "x").current?.node.id).toBe(
      "Rest"
    )
    const back = runFor([
      [0, { kind: "playAll" }],
      [10, { kind: "jumpTo", id: "Changes 2" }],
      [11, { kind: "prev", from: "Changes 2" }],
      [11, { kind: "prev", from: "Changes 2" }],
    ])
    expect(sessionOf(practice, back, 12, () => "x").current?.node.id).toBe(
      "Rest"
    )
  })
})

describe("Lap with nothing timed", () => {
  it("isn't offered, and the engine ignores it", () => {
    const steps: [number, Action][] = [
      [0, { kind: "playAll" }],
      [5, { kind: "jumpTo", id: "song" }],
    ]
    const paused = at(steps, 10)
    expect(paused.current?.node.id).toBe("song")
    expect(lapOf(paused)).toBeNull()
    expect(controlsOf(paused).lap).toBeNull()
    const outcome = act(practice, paused.run, { kind: "lap" }, 10, () => "lap")
    expect(outcome.laps).toEqual([])
  })
})

describe("a routine whose activities are all canceled", () => {
  const chores = node("chores", up, {
    children: [node("dishes", down(300)), node("laundry", up)],
  })

  it("has nothing to start", () => {
    const session = sessionOf(
      chores,
      { ...emptyRun(), canceled: ["dishes", "laundry"] },
      0,
      () => "x"
    )
    expect(session.phase).toBe("idle")
    expect(controlsOf(session).primary).toMatchObject({
      label: "Start",
      disabled: true,
    })
    const open = sessionOf(
      chores,
      { ...emptyRun(), canceled: ["dishes"] },
      0,
      () => "x"
    )
    expect(primaryOf(open).disabled).toBe(false)
  })
})

describe("Start over from a sub-activity's page", () => {
  it("is offered while the routine plays or pauses there, and once the part finished", () => {
    const running = at([[0, { kind: "playAll" }]], 130)
    expect(offersStartOver(pageViewOf(running, "changes"))).toBe(true)
    const paused = at(
      [
        [0, { kind: "playAll" }],
        [130, { kind: "pause" }],
      ],
      140
    )
    expect(offersStartOver(pageViewOf(paused, "changes"))).toBe(true)
    const finished = at(
      [
        [0, { kind: "playAll" }],
        [5, { kind: "jumpTo", id: "song" }],
        [6, { kind: "play" }],
        [9, { kind: "next" }],
      ],
      10
    )
    const songPage = pageViewOf(finished, "song")
    expect(songPage.phase).toBe("finished")
    expect(offersStartOver(songPage)).toBe(true)
  })

  it("isn't offered twice where the main button already starts over", () => {
    const done = { ...emptyRun(), passed: practice.children.flatMap(leafIds) }
    const finished = sessionOf(practice, done, 0, () => "x")
    expect(primaryOf(finished).action).toEqual({ kind: "askStartOver" })
    expect(offersStartOver(finished)).toBe(false)
  })
})

describe("where the dock shows", () => {
  const review = node("review", up, {
    children: [node("inbox", up), node("calendar", up)],
  })

  it("only once for a routine finished on its own page, on a phone too", () => {
    const finished = played(
      review,
      [
        [0, { kind: "playAll" }],
        [5, { kind: "next" }],
        [9, { kind: "next" }],
      ],
      10
    )
    const shown = shownRoutine(finished, "review", null)
    if (!shown) throw new Error("Expected the routine shown")
    expect(dockOn(shown)).toBe("nowhere")
  })

  it("on a phone while it plays on its own page, and everywhere else off it", () => {
    const running = played(review, [[0, { kind: "playAll" }]], 5)
    const own = shownRoutine(running, "review", running)
    const elsewhere = shownRoutine(null, null, running)
    if (!own || !elsewhere) throw new Error("Expected the routine shown")
    expect(dockOn(own)).toBe("phone")
    expect(dockOn(elsewhere)).toBe("everywhere")
  })
})

const playFrom = (
  root: RoutineNode,
  start: Run,
  steps: [number, Action][],
  now: number
) => {
  let next = 0
  const newId = () => `id-${(next += 1)}`
  const state = steps.reduce(
    (current, [second, action]) => {
      const outcome = act(current.root, current.run, action, second, newId)
      const grow = (each: RoutineNode): RoutineNode => ({
        ...each,
        children: [
          ...each.children.map(grow),
          ...outcome.laps
            .filter((lap) => lap.parentId === each.id)
            .map((lap) =>
              node(lap.id, up, { title: lap.title, generated: "lap" })
            ),
        ],
      })
      return { root: grow(current.root), run: outcome.run }
    },
    { root, run: start }
  )
  return sessionOf(state.root, state.run, now, newId)
}

describe("Previous with only canceled activities behind", () => {
  it("is disabled, as the engine has nowhere to go back to", () => {
    const session = playFrom(
      practice,
      { ...emptyRun(), canceled: ["tuning"] },
      [[0, { kind: "playAll" }]],
      5
    )
    expect(session.current?.node.id).toBe("Changes 1")
    expect(controlsOf(session).prev).toMatchObject({ disabled: true })
    const outcome = act(practice, session.run, { kind: "prev" }, 5, () => "x")
    expect(outcome.run.cursor).toBe("Changes 1")
  })

  it("is enabled past a canceled one when something before it can play", () => {
    const session = playFrom(
      practice,
      { ...emptyRun(), canceled: ["Changes 1"] },
      [
        [0, { kind: "playAll" }],
        [10, { kind: "next" }],
      ],
      12
    )
    expect(session.current?.node.id).toBe("Rest")
    expect(controlsOf(session).prev).toMatchObject({ disabled: false })
  })
})

// Practice with a rest of your own length between two open-ended passes.
const passes = node("passes", up, {
  series: true,
  children: [
    node("Pass 1", up, { generated: "step" }),
    node("Breather", up, { generated: "gap" }),
    node("Pass 2", up, { generated: "step" }),
  ],
})

describe("Lap on a rest", () => {
  it("isn't offered on a count-up rest, and the engine ignores it", () => {
    const session = playFrom(
      passes,
      emptyRun(),
      [
        [0, { kind: "playAll" }],
        [30, { kind: "next" }],
      ],
      40
    )
    expect(session.current?.node.id).toBe("Breather")
    expect(lapOf(session)).toBeNull()
    expect(controlsOf(session).lap).toBeNull()
    expect(
      act(passes, session.run, { kind: "lap" }, 40, () => "x").laps
    ).toEqual([])
  })
})

describe("a generated step split into laps", () => {
  it("ticks itself once its last lap is passed", () => {
    const lapping = playFrom(
      passes,
      emptyRun(),
      [
        [0, { kind: "playAll" }],
        [10, { kind: "lap" }],
      ],
      15
    )
    expect(lapping.run.done).not.toContain("Pass 1")
    const after = playFrom(
      passes,
      emptyRun(),
      [
        [0, { kind: "playAll" }],
        [10, { kind: "lap" }],
        [20, { kind: "next" }],
      ],
      25
    )
    expect(after.current?.node.id).toBe("Breather")
    expect(after.run.done).toEqual(["id-2", "id-3", "Pass 1"])
  })
})

describe("the message when an action fails", () => {
  it("blames the activity for a tick and the timer for the rest", () => {
    expect(failureOf({ kind: "toggleDone", id: "song" })).toBe(
      "Couldn't update that activity."
    )
    expect(failureOf({ kind: "pause" })).toBe("Couldn't update the timer.")
  })
})
