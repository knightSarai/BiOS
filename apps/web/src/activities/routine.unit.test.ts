import { describe, expect, it } from "vitest"
import {
  act,
  clockSeconds,
  faceOf,
  findNode,
  isFinished,
  leavesOf,
  loggedSeconds,
  runningEntry,
  sessionOf,
  tickLapped,
  type Action,
  type RoutineNode,
  type Run,
} from "./routine"

const down = (seconds: number) => ({
  mode: "down" as const,
  seconds,
  sound: "none" as const,
})
const up = { mode: "up" as const, sound: "none" as const }

const node = (
  id: string,
  timer: RoutineNode["timer"],
  children: RoutineNode[] = [],
  generated: RoutineNode["generated"] = null
): RoutineNode => ({
  id,
  title: id,
  timer,
  typeId: null,
  generated,
  series: false,
  children,
})

// Guitar practice: scales, then two rounds of chord changes with a rest between, then a song.
const practice = node("practice", up, [
  node("scales", down(600)),
  node("changes", up, [
    node("round1", down(60), [], "step"),
    node("rest", down(15), [], "step"),
    node("round2", down(60), [], "step"),
  ]),
  node("song", up),
])

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

const ids = () => {
  let next = 0
  return () => `id-${(next += 1)}`
}

// Applies actions at the given second, carrying the run (and any new laps) forward.
const play = (
  steps: [number, Action][],
  root = practice,
  within: string | null = null
) => {
  const newId = ids()
  return steps.reduce(
    (state, [at, action]) => {
      const outcome = act(state.root, state.run, action, at, newId, within)
      const laps = outcome.laps
      const grow = (each: RoutineNode): RoutineNode => ({
        ...each,
        children: [
          ...each.children.map(grow),
          ...laps
            .filter((lap) => lap.parentId === each.id)
            .map((lap) => node(lap.id, up, [], "lap")),
        ],
      })
      return {
        root: laps.length > 0 ? grow(state.root) : state.root,
        run: outcome.run,
      }
    },
    { root, run: emptyRun() }
  )
}

const at = (state: { root: RoutineNode; run: Run }, now: number) =>
  sessionOf(state.root, state.run, now, ids())

const practiceNode = (id: string) => {
  const found = findNode(practice, id)
  if (!found) throw new Error(`No ${id} in the practice routine`)
  return found
}

describe("playing a routine", () => {
  it("starts on the first activity and counts down", () => {
    const state = play([[0, { kind: "playAll" }]])
    const session = at(state, 120)
    expect(session.phase).toBe("running")
    expect(session.current?.node.id).toBe("scales")
    expect(session.next?.node.id).toBe("round1")
  })

  it("hands a finished countdown straight to the next activity at the moment it ran out", () => {
    const state = play([[0, { kind: "playAll" }]])
    const session = at(state, 670)
    expect(session.current?.node.id).toBe("rest")
    const round = session.run.entries.find(
      (entry) => entry.activityId === "round1"
    )
    expect(round).toMatchObject({ start: 600, end: 660 })
  })

  it("ticks generated steps done when passed, but not real activities", () => {
    const session = at(play([[0, { kind: "playAll" }]]), 800)
    expect(session.run.passed).toEqual(["scales", "round1", "rest", "round2"])
    expect(session.run.done).toEqual(["round1", "rest", "round2"])
    expect(session.current?.node.id).toBe("song")
  })

  it("keeps a count-up going until you move on, then finishes", () => {
    const state = play([
      [0, { kind: "playAll" }],
      [900, { kind: "next" }],
    ])
    const session = at(state, 900)
    expect(session.phase).toBe("finished")
    expect(loggedSeconds(session.run, practice, 900)).toBe(900)
  })

  it("pauses and resumes a countdown where it was cut short", () => {
    const state = play([
      [0, { kind: "playAll" }],
      [100, { kind: "pause" }],
      [500, { kind: "play" }],
    ])
    const session = at(state, 600)
    expect(session.phase).toBe("running")
    expect(session.current?.node.id).toBe("scales")
    expect(loggedSeconds(session.run, practice, 600)).toBe(200)
  })

  it("Done on the running activity ticks it and carries on running", () => {
    const state = play([
      [0, { kind: "playAll" }],
      [30, { kind: "toggleDone", id: "scales" }],
    ])
    const session = at(state, 40)
    expect(session.run.done).toContain("scales")
    expect(session.current?.node.id).toBe("round1")
    expect(session.phase).toBe("running")
  })

  it("Previous restarts the activity before it when running", () => {
    const state = play([
      [0, { kind: "playAll" }],
      [610, { kind: "prev" }],
    ])
    const session = at(state, 620)
    expect(session.current?.node.id).toBe("scales")
    expect(session.run.passed).not.toContain("scales")
  })
})

describe("playing only part of a routine", () => {
  it("waits for Start, then stops when that part is done", () => {
    const state = play([
      [0, { kind: "playOnly", id: "changes" }],
      [10, { kind: "play" }],
    ])
    expect(at(state, 10).current?.node.id).toBe("round1")
    const finished = at(state, 200)
    expect(finished.phase).toBe("scopeDone")
    expect(finished.run.entries.some((e) => e.activityId === "song")).toBe(
      false
    )
  })

  it("from a sub-activity's page, keeps actions inside it", () => {
    const state = play([[0, { kind: "playAll" }]], practice, "changes")
    expect(state.run.scopeId).toBe("changes")
    expect(at(state, 0).current?.node.id).toBe("round1")
  })
})

describe("laps", () => {
  const run = node("run", up)

  it("turns the lapped activity into Lap 1 (the time so far) and Lap 2 (running)", () => {
    const state = play(
      [
        [0, { kind: "playAll" }],
        [240, { kind: "lap" }],
      ],
      run
    )
    const [first, second] = findNode(state.root, "run")?.children ?? []
    expect(first?.generated).toBe("lap")
    expect(state.run.entries[0]).toMatchObject({
      activityId: first?.id,
      end: 240,
    })
    expect(state.run.done).toEqual([first?.id])
    const session = at(state, 300)
    expect(session.current?.node.id).toBe(second?.id)
    expect(session.phase).toBe("running")
  })

  it("adds the next lap below the same activity", () => {
    const state = play(
      [
        [0, { kind: "playAll" }],
        [240, { kind: "lap" }],
        [400, { kind: "lap" }],
      ],
      run
    )
    expect(leavesOf(state.root)).toHaveLength(3)
  })
})

describe("start over", () => {
  it("clears ticks and progress but keeps the time already logged", () => {
    const state = play([
      [0, { kind: "playAll" }],
      [700, { kind: "startOver" }],
    ])
    const session = at(state, 700)
    expect(session.phase).toBe("idle")
    expect(session.run.done).toEqual([])
    expect(session.run.entries).toHaveLength(4)
    expect(loggedSeconds(session.run, practice, 700)).toBe(0)
  })
})

describe("time typed in afterwards", () => {
  // 25 minutes of scales, done yesterday and typed in at 50 (well after it ended).
  const typedIn = {
    id: "typed",
    activityId: "scales",
    start: -90_000,
    end: -88_500,
    manual: true as const,
    logged: 50,
  }
  const withTyped = (run: Run, entry = typedIn): Run => ({
    ...run,
    entries: [...run.entries, entry],
  })

  it("counts toward the activity's time without starting its clock", () => {
    const session = sessionOf(practice, withTyped(emptyRun()), 60, ids())
    expect(session.phase).toBe("idle")
    expect(loggedSeconds(session.run, practice, 60)).toBe(1500)
    expect(clockSeconds(session.run, "scales", 60)).toBe(0)
    expect(runningEntry(session.run)).toBeNull()
  })

  it("is never moved or changed by the timer, laps included", () => {
    const run = node("run", up)
    const typedOnRun = { ...typedIn, activityId: "run" }
    const steps: Action[] = [
      { kind: "playAll" },
      { kind: "pause" },
      { kind: "play" },
      { kind: "lap" },
      { kind: "next" },
      { kind: "startOver" },
    ]
    const newId = ids()
    const final = steps.reduce(
      (state, action, index) => {
        const outcome = act(
          state.root,
          state.run,
          action,
          100 + index * 60,
          newId
        )
        const laps = outcome.laps.map((lap) => node(lap.id, up, [], "lap"))
        return {
          root:
            laps.length > 0
              ? { ...state.root, children: [...state.root.children, ...laps] }
              : state.root,
          run: outcome.run,
        }
      },
      { root: run, run: withTyped(emptyRun(), typedOnRun) }
    )
    expect(final.run.entries.filter((entry) => entry.manual)).toEqual([
      typedOnRun,
    ])
  })

  it("counts in the run it was typed in, even for a session from before Start over", () => {
    const restarted = { ...emptyRun(), runStart: 40 }
    expect(loggedSeconds(withTyped(restarted), practice, 60)).toBe(1500)
    expect(
      loggedSeconds(withTyped({ ...restarted, runStart: 70 }), practice, 80)
    ).toBe(0)
  })

  it("leaves a countdown's clock alone, so Start still plays it from the top", () => {
    const state = play([[100, { kind: "playAll" }]])
    const session = at({ ...state, run: withTyped(state.run) }, 160)
    const current = session.current
    if (!current) throw new Error("Expected a current activity")
    expect(current.node.id).toBe("scales")
    expect(faceOf(current.node, session.run, 160).remaining).toBe(540)
  })
})

describe("scope from a sub-activity's page", () => {
  const wholeThenOnPage = (steps: [number, Action][]) => {
    const whole = play([[0, { kind: "playAll" }]])
    const newId = ids()
    return steps.reduce(
      (state, [time, action]) => ({
        ...state,
        run: act(state.root, state.run, action, time, newId, "changes").run,
      }),
      whole
    )
  }

  it("pause then resume there carries on with the whole routine", () => {
    const state = wholeThenOnPage([
      [100, { kind: "pause" }],
      [200, { kind: "play" }],
    ])
    expect(state.run.scopeId).toBeNull()
    const session = at(state, 900)
    expect(session.current?.node.id).toBe("song")
    expect(session.phase).toBe("running")
  })

  it("ticking a sub-activity there doesn't narrow the routine", () => {
    const state = wholeThenOnPage([[100, { kind: "toggleDone", id: "round2" }]])
    expect(state.run.scopeId).toBeNull()
    expect(state.run.done).toContain("round2")
    expect(at(state, 110).current?.node.id).toBe("scales")
  })

  it("Previous stays inside the part being played", () => {
    const state = play([
      [0, { kind: "playOnly", id: "changes" }],
      [10, { kind: "play" }],
      [20, { kind: "prev" }],
    ])
    const session = at(state, 30)
    expect(session.current?.node.id).toBe("round1")
    expect(session.run.entries.some((e) => e.activityId === "scales")).toBe(
      false
    )
  })
})

describe("idle until the timer plays it", () => {
  const timedBefore: Run["entries"][number] = {
    id: "old",
    activityId: "scales",
    start: -5000,
    end: -4000,
    manual: false,
    recording: "pending",
  }

  it("old timed entries on a routine never played leave it idle", () => {
    const run = { ...emptyRun(), entries: [timedBefore] }
    expect(at({ root: practice, run }, 0).phase).toBe("idle")
  })

  it("ticks alone never make it paused or finished", () => {
    const allDone = leavesOf(practice).map((leaf) => leaf.node.id)
    expect(
      at({ root: practice, run: { ...emptyRun(), done: ["scales"] } }, 0).phase
    ).toBe("idle")
    expect(
      at({ root: practice, run: { ...emptyRun(), done: allDone } }, 0).phase
    ).toBe("idle")
    const played = { ...emptyRun(), started: true, done: allDone }
    expect(at({ root: practice, run: played }, 0).phase).toBe("idle")
  })

  it("ticking a box on an idle routine doesn't start or narrow it", () => {
    const outcome = act(
      practice,
      emptyRun(),
      { kind: "toggleDone", id: "round1" },
      0,
      ids(),
      "changes"
    )
    expect(outcome.run.started).toBe(false)
    expect(outcome.run.scopeId).toBeNull()
    expect(outcome.run.done).toEqual(["round1"])
  })

  it("is played once the timer has run", () => {
    const state = play([
      [0, { kind: "playAll" }],
      [30, { kind: "pause" }],
    ])
    expect(state.run.started).toBe(true)
    expect(at(state, 40).phase).toBe("paused")
  })
})

describe("playing a part again", () => {
  it("runs every countdown in it in full, through each hand-over", () => {
    const state = play([
      [0, { kind: "playOnly", id: "changes" }],
      [0, { kind: "play" }],
      [200, { kind: "play" }],
    ])
    expect(at(state, 199).phase).toBe("running")
    const second = at(state, 200 + 60 + 15 + 30)
    expect(second.current?.node.id).toBe("round2")
    expect(
      faceOf(practiceNode("round2"), second.run, second.now)
    ).toMatchObject({ remaining: 30 })
    const done = at(state, 200 + 135 + 1)
    expect(done.phase).toBe("scopeDone")
    const replayed = done.run.entries.filter((entry) => entry.start >= 200)
    expect(
      replayed.map((entry) => [entry.activityId, entry.start, entry.end])
    ).toEqual([
      ["round1", 200, 260],
      ["rest", 260, 275],
      ["round2", 275, 335],
    ])
  })
})

describe("laps after an earlier run", () => {
  it("move only this attempt's time into Lap 1", () => {
    const run = node("run", up)
    const state = play(
      [
        [0, { kind: "playAll" }],
        [100, { kind: "pause" }],
        [200, { kind: "startOver" }],
        [300, { kind: "playAll" }],
        [400, { kind: "lap" }],
      ],
      run
    )
    const [first] = findNode(state.root, "run")?.children ?? []
    expect(
      state.run.entries.map((entry) => [entry.activityId, entry.start])
    ).toEqual([
      ["run", 0],
      [first?.id, 300],
      [expect.any(String), 400],
    ])
  })
})

describe("a stale cursor", () => {
  it("falls back to the next open activity", () => {
    const run = {
      ...emptyRun(),
      started: true,
      cursor: "deleted",
      passed: ["scales"],
    }
    const session = at({ root: practice, run }, 0)
    expect(session.current?.node.id).toBe("round1")
    const outcome = act(practice, run, { kind: "play" }, 0, ids())
    expect(runningEntry(outcome.run)?.activityId).toBe("round1")
  })
})

describe("a countdown shortened while it runs", () => {
  it("hands over no earlier than the running entry began", () => {
    const state = play([
      [0, { kind: "playAll" }],
      [300, { kind: "pause" }],
      [400, { kind: "play" }],
    ])
    const shortened: RoutineNode = {
      ...practice,
      children: practice.children.map((child) =>
        child.id === "scales" ? { ...child, timer: down(60) } : child
      ),
    }
    const session = sessionOf(shortened, state.run, 450, ids())
    const scales = session.run.entries.filter(
      (entry) => entry.activityId === "scales"
    )
    expect(scales.map((entry) => [entry.start, entry.end])).toEqual([
      [0, 300],
      [400, 400],
    ])
    expect(session.current?.node.id).toBe("round1")
    expect(
      session.run.entries.find((entry) => entry.activityId === "round1")
    ).toMatchObject({ start: 400, end: null })
  })
})

describe("a clock with milliseconds", () => {
  it("reads a countdown stored a millisecond short as finished", () => {
    const start = 1794387600.123
    const run: Run = {
      ...emptyRun(),
      started: true,
      cursor: "scales",
      runStart: start,
      entries: [
        {
          id: "e1",
          activityId: "scales",
          start,
          end: start + 600 - 0.001,
          manual: false,
          recording: "pending",
        },
      ],
    }
    const session = sessionOf(practice, run, start + 700, ids())
    expect(isFinished(practiceNode("scales"), session.run, session.now)).toBe(
      true
    )
    const again = act(practice, run, { kind: "play" }, start + 700, ids()).run
    expect(again.attemptFrom.scales).toBe(start + 700)
    expect(clockSeconds(again, "scales", start + 710)).toBeCloseTo(10, 6)
  })
})

describe("ticking the step a paused routine is on", () => {
  it("moves on to the next open one, so Resume doesn't untick it", () => {
    const state = play([
      [0, { kind: "playAll" }],
      [610, { kind: "pause" }],
      [620, { kind: "toggleDone", id: "round1" }],
    ])
    expect(state.run.done).toContain("round1")
    expect(state.run.cursor).toBe("rest")
    const resumed = act(practice, state.run, { kind: "play" }, 630, ids()).run
    expect(resumed.done).toContain("round1")
    expect(runningEntry(resumed)?.activityId).toBe("rest")
  })

  it("leaves no cursor when it was the last one in scope", () => {
    const state = play([
      [0, { kind: "playOnly", id: "song" }],
      [5, { kind: "toggleDone", id: "song" }],
    ])
    expect(state.run.cursor).toBeNull()
  })
})

describe("a paused step ticked done outside the timer", () => {
  it("Resume moves on to the next open one instead of playing it again", () => {
    const state = play([
      [0, { kind: "playAll" }],
      [100, { kind: "pause" }],
    ])
    const ticked: Run = { ...state.run, done: [...state.run.done, "scales"] }
    expect(at({ ...state, run: ticked }, 110).current?.node.id).toBe("round1")
    const resumed = act(practice, ticked, { kind: "play" }, 120, ids()).run
    expect(runningEntry(resumed)?.activityId).toBe("round1")
    expect(resumed.done).toContain("scales")
    expect(
      resumed.entries.filter((entry) => entry.activityId === "scales")
    ).toHaveLength(1)
  })
})

describe("unticking a step the routine moved past", () => {
  it("puts it back in the run, so it plays again", () => {
    const state = play([
      [0, { kind: "playAll" }],
      [700, { kind: "pause" }],
      [710, { kind: "toggleDone", id: "round1" }],
      [720, { kind: "jumpTo", id: "scales" }],
      [720, { kind: "play" }],
    ])
    expect(state.run.done).not.toContain("round1")
    expect(state.run.passed).not.toContain("round1")
    expect(at(state, 1330).current?.node.id).toBe("round1")
  })
})

describe("playing a finished part again", () => {
  // Release review: two real countdowns in a group, both ticked done by hand once played.
  const review = node("release", up, [
    node("checks", up, [node("tests", down(30)), node("docs", down(30))]),
    node("ship", up),
  ])

  it("plays every activity in it, ticked ones included, and keeps their ticks", () => {
    const first = play(
      [
        [0, { kind: "playOnly", id: "checks" }],
        [0, { kind: "play" }],
      ],
      review
    )
    // The group's last countdown stops at "Timer ended" and waits for a choice.
    expect(at(first, 60).phase).toBe("paused")
    expect(at(first, 60).current?.node.id).toBe("docs")
    const ticked: Run = {
      ...at(first, 60).run,
      done: ["tests", "docs"],
    }
    const again = act(review, ticked, { kind: "play" }, 100, ids()).run
    expect(runningEntry(again)?.activityId).toBe("tests")
    const handedOver = sessionOf(review, again, 135, ids())
    expect(handedOver.phase).toBe("running")
    expect(handedOver.current?.node.id).toBe("docs")
    expect(handedOver.run.done).toEqual(["tests", "docs"])
    const ended = sessionOf(review, again, 170, ids())
    expect(ended.phase).toBe("paused")
    expect(ended.current?.node.id).toBe("docs")
  })
})

describe("going to an activity while the timer runs", () => {
  it("pauses there instead of playing it", () => {
    const state = play([
      [0, { kind: "playAll" }],
      [100, { kind: "jumpTo", id: "song" }],
    ])
    expect(runningEntry(state.run)).toBeNull()
    expect(state.run.cursor).toBe("song")
    const session = at(state, 110)
    expect(session.phase).toBe("paused")
    expect(session.current?.node.id).toBe("song")
    expect(
      state.run.entries.find((entry) => entry.activityId === "scales")?.end
    ).toBe(100)
  })
})

describe("a timer running with no cursor stored", () => {
  it("is on the activity it's running, not the first open one", () => {
    const run: Run = {
      ...emptyRun(),
      entries: [
        {
          id: "e1",
          activityId: "song",
          start: 50,
          end: null,
          manual: false,
          recording: "pending",
        },
      ],
    }
    const session = at({ root: practice, run }, 80)
    expect(session.phase).toBe("running")
    expect(session.current?.node.id).toBe("song")
    expect(session.run.cursor).toBe("song")
    const next = act(practice, run, { kind: "next" }, 90, ids()).run
    expect(next.passed).toEqual(["song"])
    expect(runningEntry(next)).toBeNull()
  })
})

describe("Start on a routine ticked done by hand", () => {
  it("names the first activity and plays from the top, keeping the hand ticks", () => {
    const allDone = leavesOf(practice).map((leaf) => leaf.node.id)
    const ticked = { root: practice, run: { ...emptyRun(), done: allDone } }
    const idle = at(ticked, 0)
    expect(idle.phase).toBe("idle")
    expect(idle.current?.node.id).toBe("scales")
    const started = act(practice, ticked.run, { kind: "playAll" }, 10, ids())
    expect(runningEntry(started.run)?.activityId).toBe("scales")
    expect(started.run.done).toEqual(["scales", "song"])
    expect(at({ root: practice, run: started.run }, 20).phase).toBe("running")
  })

  it("plays a lone activity that was ticked done", () => {
    const lone = node("journal", down(300))
    const run = { ...emptyRun(), done: ["journal"] }
    const idle = at({ root: lone, run }, 0)
    expect(idle.phase).toBe("idle")
    expect(idle.current?.node.id).toBe("journal")
    const started = act(lone, run, { kind: "playAll" }, 10, ids()).run
    expect(runningEntry(started)?.activityId).toBe("journal")
    expect(at({ root: lone, run: started }, 20).current?.node.id).toBe(
      "journal"
    )
  })
})

describe("a countdown within a millisecond of its end", () => {
  it("hands over, as it reads finished", () => {
    const run: Run = {
      ...emptyRun(),
      started: true,
      cursor: "scales",
      entries: [
        {
          id: "e1",
          activityId: "scales",
          start: 0,
          end: null,
          manual: false,
          recording: "pending",
        },
      ],
    }
    const session = sessionOf(practice, run, 600 - 0.0005, ids())
    expect(session.current?.node.id).toBe("round1")
    expect(
      session.run.entries.find((entry) => entry.activityId === "scales")?.end
    ).toBe(600 - 0.0005)
  })
})

describe("a canceled activity", () => {
  // Close of day: inbox, a call that was called off, then notes; all inside "wrap up".
  const day = node("day", up, [
    node("wrapUp", up, [
      node("inbox", down(10)),
      node("call", down(10)),
      node("notes", down(10)),
    ]),
    node("plan", down(10)),
  ])
  const withCanceled = (): Run => ({ ...emptyRun(), canceled: ["call"] })
  const run = (steps: [number, Action][], within: string | null = null) => {
    const newId = ids()
    return steps.reduce(
      (current, [second, action]) =>
        act(day, current, action, second, newId, within).run,
      withCanceled()
    )
  }
  const timedOn = (state: Run, id: string) =>
    state.entries.filter((entry) => entry.activityId === id)

  it("is skipped when the routine plays through", () => {
    const played = sessionOf(day, run([[0, { kind: "playAll" }]]), 100, ids())
    expect(played.phase).toBe("paused")
    expect(played.current?.node.id).toBe("plan")
    expect(timedOn(played.run, "call")).toEqual([])
  })

  it("isn't played when a finished routine is played again", () => {
    const finished = sessionOf(
      day,
      run([
        [0, { kind: "playAll" }],
        [100, { kind: "next" }],
      ]),
      100,
      ids()
    ).run
    const again = act(day, finished, { kind: "playAll" }, 200, ids()).run
    expect(runningEntry(again)?.activityId).toBe("inbox")
    expect(again.replay).not.toContain("call")
    const later = sessionOf(day, again, 400, ids())
    expect(later.current?.node.id).toBe("plan")
    expect(timedOn(later.run, "call")).toEqual([])
  })

  it("isn't played when a finished part is played again from its page", () => {
    const finished = sessionOf(
      day,
      run(
        [
          [0, { kind: "playAll" }],
          [100, { kind: "next" }],
        ],
        "wrapUp"
      ),
      100,
      ids()
    ).run
    const again = act(
      day,
      finished,
      { kind: "playAll" },
      200,
      ids(),
      "wrapUp"
    ).run
    const later = sessionOf(day, again, 400, ids(), "wrapUp")
    expect(later.current?.node.id).toBe("notes")
    expect(timedOn(later.run, "call")).toEqual([])
  })

  it("Previous steps over it", () => {
    const back = run([
      [0, { kind: "playAll" }],
      [12, { kind: "prev" }],
    ])
    expect(runningEntry(back)?.activityId).toBe("inbox")
    expect(timedOn(back, "call")).toEqual([])
  })

  it("can't be gone to", () => {
    const paused = run([
      [0, { kind: "playAll" }],
      [5, { kind: "pause" }],
    ])
    const jumped = act(day, paused, { kind: "jumpTo", id: "call" }, 6, ids())
    expect(jumped.run.cursor).toBe("inbox")
    expect(jumped.run.replay).not.toContain("call")
  })

  it("stays behind even when it was chosen to play again", () => {
    const replayed = { ...withCanceled(), replay: ["call"], done: ["call"] }
    const session = sessionOf(
      day,
      act(day, replayed, { kind: "playAll" }, 0, ids()).run,
      15,
      ids()
    )
    expect(session.current?.node.id).toBe("notes")
  })
})

describe("a part played on its own that has finished", () => {
  it("shows no activity beyond it, so the summary is the part's", () => {
    const state = play([
      [0, { kind: "playOnly", id: "changes" }],
      [10, { kind: "play" }],
    ])
    const done = at(state, 200)
    expect(done.phase).toBe("scopeDone")
    expect(done.current).toBeNull()
    expect(done.next).toBeNull()
    const again = act(practice, done.run, { kind: "play" }, 200, ids()).run
    expect(runningEntry(again)?.activityId).toBe("round1")
  })
})

describe("a canceled group", () => {
  const canceledChanges = (): Run => ({ ...emptyRun(), canceled: ["changes"] })

  it("cancels what's inside it: the routine hands over past it, and Next and Previous skip it", () => {
    const played = act(
      practice,
      canceledChanges(),
      { kind: "playAll" },
      0,
      ids()
    )
    const handedOver = sessionOf(practice, played.run, 610, ids())
    expect(handedOver.current?.node.id).toBe("song")
    expect(handedOver.run.done).toEqual([])
    expect(handedOver.run.canceled).toEqual(
      expect.arrayContaining(["round1", "rest", "round2"])
    )
    const back = act(practice, handedOver.run, { kind: "prev" }, 620, ids())
    expect(back.run.cursor).toBe("scales")
  })

  it("never plays, even when picked to play on its own", () => {
    const outcome = act(
      practice,
      canceledChanges(),
      { kind: "jumpTo", id: "round1" },
      0,
      ids()
    )
    expect(outcome.run.cursor).toBeNull()
  })
})

// A writing session: open-ended drafts, generated as a series.
const drafts = node("drafts", up, [
  node("draft1", up, [], "step"),
  node("draft2", up, [], "step"),
])

describe("a generated step split into laps", () => {
  it("ticks itself when its last lap is ticked while paused", () => {
    const state = play(
      [
        [0, { kind: "playAll" }],
        [10, { kind: "lap" }],
        [20, { kind: "pause" }],
        [25, { kind: "toggleDone", id: "id-3" }],
      ],
      drafts
    )
    expect(state.run.done).toEqual(["id-2", "id-3", "draft1"])
    expect(state.run.cursor).toBe("draft2")
  })

  it("reopens when Previous plays one of its laps again", () => {
    const state = play(
      [
        [0, { kind: "playAll" }],
        [10, { kind: "lap" }],
        [20, { kind: "next" }],
      ],
      drafts
    )
    expect(state.run.done).toContain("draft1")
    const back = act(state.root, state.run, { kind: "prev" }, 30, ids()).run
    expect(runningEntry(back)?.activityId).toBe("id-3")
    expect(back.done).not.toContain("draft1")
  })

  it("stays canceled when its last lap is passed", () => {
    const state = play(
      [
        [0, { kind: "playAll" }],
        [10, { kind: "lap" }],
      ],
      drafts
    )
    const canceled = { ...state.run, canceled: ["draft1"] }
    const next = act(state.root, canceled, { kind: "next" }, 20, ids()).run
    expect(next.done).not.toContain("draft1")
    const ticked = act(
      state.root,
      { ...canceled, cursor: "id-3", entries: [] },
      { kind: "toggleDone", id: "id-3" },
      20,
      ids()
    ).run
    expect(ticked.done).not.toContain("draft1")
  })

  it("isn't ticked when every one of its laps is canceled", () => {
    const state = play(
      [
        [0, { kind: "playAll" }],
        [10, { kind: "lap" }],
        [20, { kind: "pause" }],
      ],
      drafts
    )
    const allCanceled = { ...state.run, done: [], canceled: ["id-2", "id-3"] }
    expect(tickLapped(allCanceled, state.root, "id-3").done).not.toContain(
      "draft1"
    )
    const oneLeft = { ...state.run, done: ["id-3"], canceled: ["id-2"] }
    expect(tickLapped(oneLeft, state.root, "id-3").done).toContain("draft1")
  })
})
