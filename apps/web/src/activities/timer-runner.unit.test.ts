import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  armRoutine,
  disarmPending,
  disarmRoutine,
  isArmed,
  unlockAudio,
} from "./timer-runner"

// The runner remembers the latest arm across tests, so each test starts later than the last.
let base = 0

const WS = "ws-1"

beforeEach(() => {
  base += 10_000
  vi.useFakeTimers()
  vi.stubGlobal("document", { addEventListener: () => undefined })
})

afterEach(() => {
  disarmRoutine(WS)
  disarmRoutine("ws-2")
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const arm = (
  asOf: number,
  ids: string[],
  cueAt: number | null,
  onHandOver = vi.fn(),
  running = cueAt !== null
) => {
  armRoutine({
    workspaceId: WS,
    asOf: base + asOf,
    running,
    routineId: ids[0] ?? "",
    ids,
    sound: "none",
    cues: cueAt === null ? [] : [{ at: base + cueAt, cue: "work" }],
    clock: () => base + asOf,
    onHandOver,
  })
  return onHandOver
}

describe("armRoutine", () => {
  it("ignores a result read before the one already armed", () => {
    const newer = arm(1000, ["release"], 1005)
    const older = arm(990, ["release"], 995)
    vi.advanceTimersByTime(10_000)
    expect(newer).toHaveBeenCalledTimes(1)
    expect(older).not.toHaveBeenCalled()
  })

  it("a later pause disarms, and an older running result can't re-arm it", () => {
    const handOver = arm(1000, ["release"], 1005)
    arm(1001, ["release"], null)
    arm(1000.5, ["release"], 1006)
    vi.advanceTimersByTime(10_000)
    expect(handOver).not.toHaveBeenCalled()
    expect(isArmed(WS, "release")).toBe(false)
  })

  it("an idle routine elsewhere never disarms the one running", () => {
    const running = arm(1000, ["release", "review"], 1005)
    arm(1001, ["notes"], null)
    expect(isArmed(WS, "review")).toBe(true)
    vi.advanceTimersByTime(10_000)
    expect(running).toHaveBeenCalledTimes(1)
  })
})

describe("hand-over timeouts", () => {
  it("waits only for the next hand-over; its sync arms the one after", () => {
    const onHandOver = vi.fn()
    armRoutine({
      workspaceId: WS,
      asOf: base + 1000,
      running: true,
      routineId: "release",
      ids: ["release"],
      sound: "none",
      cues: [5, 10, 15].map((after) => ({
        at: base + 1000 + after,
        cue: "work" as const,
      })),
      clock: () => base + 1000,
      onHandOver,
    })
    expect(vi.getTimerCount()).toBe(1)
    vi.advanceTimersByTime(20_000)
    expect(onHandOver).toHaveBeenCalledTimes(1)
  })

  it("never fires early for a hand-over months away", () => {
    const handOver = arm(1000, ["retreat"], 1000 + 60 * 60 * 24 * 60)
    vi.advanceTimersByTime(1000)
    expect(handOver).not.toHaveBeenCalled()
  })
})

type FakeOscillator = { startsAt: number; disconnect: () => void }

// Only the parts of Web Audio the runner touches.
class FakeAudioContext {
  currentTime = 0
  destination = {}
  oscillators: FakeOscillator[] = []
  resume() {
    return Promise.resolve()
  }
  createGain() {
    const param = {
      setValueAtTime: () => param,
      exponentialRampToValueAtTime: () => param,
    }
    return { gain: param, connect: () => this.destination }
  }
  createOscillator() {
    const oscillator = {
      type: "sine",
      frequency: { value: 0 },
      startsAt: -1,
      connect: (gain: { connect: () => unknown }) => gain,
      start: (at: number) => {
        oscillator.startsAt = at
      },
      stop: () => undefined,
      disconnect: vi.fn(),
    }
    this.oscillators.push(oscillator)
    return oscillator
  }
}

describe("sounds across a hand-over", () => {
  it("lets the cue sounding now ring out and cancels only those ahead, until a pause", () => {
    vi.stubGlobal("AudioContext", FakeAudioContext)
    const context = unlockAudio() as unknown as FakeAudioContext
    context.currentTime = 50
    const armAt = (
      asOf: number,
      running: boolean,
      cueAts: number[],
      silence = false
    ) =>
      armRoutine({
        workspaceId: WS,
        asOf: base + asOf,
        running,
        silence,
        routineId: "practice",
        ids: ["practice", "scales"],
        sound: "bell",
        cues: cueAts.map((at) => ({ at: base + at, cue: "work" as const })),
        clock: () => base + asOf,
        onHandOver: () => undefined,
      })

    armAt(0, true, [10, 70])
    const first = context.oscillators.filter((o) => o.startsAt === 60)
    const ahead = context.oscillators.filter((o) => o.startsAt === 120)
    expect(first.length).toBeGreaterThan(0)

    context.currentTime = 60.1
    armAt(10, true, [70])
    expect(
      first.every((o) => vi.mocked(o.disconnect).mock.calls.length === 0)
    ).toBe(true)
    expect(
      ahead.every((o) => vi.mocked(o.disconnect).mock.calls.length === 1)
    ).toBe(true)

    armAt(11, false, [], true)
    expect(
      first.every((o) => vi.mocked(o.disconnect).mock.calls.length === 1)
    ).toBe(true)
    expect(
      context.oscillators.every(
        (o) => vi.mocked(o.disconnect).mock.calls.length >= 1
      )
    ).toBe(true)
  })
})

describe("a cue when the audio clock trails the routine's", () => {
  it("keeps the hand-over's cue that its own sync re-arms", () => {
    vi.stubGlobal("AudioContext", FakeAudioContext)
    const context = unlockAudio() as unknown as FakeAudioContext
    context.currentTime = 400
    const armAt = (asOf: number, cueAts: number[]) =>
      armRoutine({
        workspaceId: WS,
        asOf: base + asOf,
        running: true,
        routineId: "inbox",
        ids: ["inbox", "triage"],
        sound: "chime",
        cues: cueAts.map((at) => ({ at: base + at, cue: "work" as const })),
        clock: () => base + asOf,
        onHandOver: () => undefined,
      })
    armAt(0, [10, 70])
    const handOver = context.oscillators.filter((o) => o.startsAt === 410)
    expect(handOver.length).toBeGreaterThan(0)

    context.currentTime = 409.9
    armAt(10, [70])

    expect(
      handOver.every((o) => vi.mocked(o.disconnect).mock.calls.length === 0)
    ).toBe(true)
  })
})

describe("the finish cue", () => {
  it("rings out when the routine finishes by itself, and stops on Start over", () => {
    vi.stubGlobal("AudioContext", FakeAudioContext)
    const context = unlockAudio() as unknown as FakeAudioContext
    context.currentTime = 200
    const armAt = (asOf: number, running: boolean, silence = false) =>
      armRoutine({
        workspaceId: WS,
        asOf: base + asOf,
        running,
        silence,
        routineId: "standup",
        ids: ["standup"],
        sound: "bell",
        cues: running ? [{ at: base + 10, cue: "finish" as const }] : [],
        clock: () => base + asOf,
        onHandOver: () => undefined,
      })
    armAt(0, true)
    const finish = context.oscillators.filter((o) => o.startsAt === 210)
    expect(finish.length).toBeGreaterThan(0)
    const disconnected = () =>
      finish.filter((o) => vi.mocked(o.disconnect).mock.calls.length > 0)

    context.currentTime = 210.2
    armAt(10, false)
    expect(disconnected()).toEqual([])
    expect(isArmed(WS, "standup")).toBe(true)

    armAt(11, false, true)
    expect(disconnected()).toHaveLength(finish.length)
    expect(isArmed(WS, "standup")).toBe(false)
  })
  it("keeps ringing through a re-sync with nothing running, which only drops a waiting hand-over", () => {
    vi.stubGlobal("AudioContext", FakeAudioContext)
    const context = unlockAudio() as unknown as FakeAudioContext
    context.currentTime = 300
    const armAt = (asOf: number, running: boolean) =>
      armRoutine({
        workspaceId: WS,
        asOf: base + asOf,
        running,
        routineId: "standup",
        ids: ["standup"],
        sound: "bell",
        cues: running ? [{ at: base + 10, cue: "finish" as const }] : [],
        clock: () => base + asOf,
        onHandOver: () => undefined,
      })
    armAt(0, true)
    const finish = context.oscillators.filter((o) => o.startsAt === 310)
    context.currentTime = 310.2
    armAt(10, false)

    disarmPending(WS)

    expect(isArmed(WS, "standup")).toBe(true)
    expect(
      finish.every((o) => vi.mocked(o.disconnect).mock.calls.length === 0)
    ).toBe(true)

    const handOver = arm(20, ["standup"], 30)
    disarmPending(WS)
    vi.advanceTimersByTime(20_000)
    expect(handOver).not.toHaveBeenCalled()
    expect(isArmed(WS, "standup")).toBe(false)
  })
})

describe("re-arming before a cue is due", () => {
  const armAt = (
    asOf: number,
    cues: { at: number; cue: "work" | "finish" }[]
  ) =>
    armRoutine({
      workspaceId: WS,
      asOf: base + asOf,
      running: true,
      routineId: "essay",
      ids: ["essay", "outline", "draft"],
      sound: "beep",
      cues: cues.map((each) => ({ ...each, at: base + each.at })),
      clock: () => base + asOf,
      onHandOver: () => undefined,
    })
  const live = (context: FakeAudioContext, startsAt: number) =>
    context.oscillators.filter(
      (o) =>
        Math.abs(o.startsAt - startsAt) < 1e-6 &&
        vi.mocked(o.disconnect).mock.calls.length === 0
    )

  it("schedules a cue just ahead once, not again beside the first", () => {
    vi.stubGlobal("AudioContext", FakeAudioContext)
    const context = unlockAudio() as unknown as FakeAudioContext
    context.currentTime = 500
    armAt(0, [{ at: 10, cue: "work" }])
    expect(live(context, 510)).toHaveLength(1)

    context.currentTime = 509.9
    armAt(9.9, [{ at: 10, cue: "work" }])

    expect(live(context, 510)).toHaveLength(1)
  })

  it("drops the old finish cue once the countdown is made longer", () => {
    vi.stubGlobal("AudioContext", FakeAudioContext)
    const context = unlockAudio() as unknown as FakeAudioContext
    context.currentTime = 600
    armAt(0, [{ at: 10, cue: "finish" }])

    context.currentTime = 609.9
    armAt(9.9, [{ at: 70, cue: "finish" }])

    expect(live(context, 610)).toEqual([])
    expect(live(context, 670).length).toBeGreaterThan(0)
  })
})

describe("routines in two workspaces", () => {
  it("a resync with nothing running in one never disarms the other's", () => {
    const work = arm(1000, ["release"], 1005)
    armRoutine({
      workspaceId: "ws-2",
      asOf: base + 1001,
      running: true,
      routineId: "practice",
      ids: ["practice"],
      sound: "none",
      cues: [{ at: base + 1010, cue: "work" }],
      clock: () => base + 1001,
      onHandOver: () => undefined,
    })
    disarmPending("ws-2")

    expect(isArmed(WS, "release")).toBe(true)
    expect(isArmed("ws-2", "practice")).toBe(false)
    vi.advanceTimersByTime(10_000)
    expect(work).toHaveBeenCalledTimes(1)
  })
})
