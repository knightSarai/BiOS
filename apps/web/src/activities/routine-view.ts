// What the timer says about a routine: labels, counts and the view from a sub-activity's
// page. Pure, so the panel, the dock and full screen all read the same words.

import {
  CLOCK_TOLERANCE_SECONDS,
  clockSeconds,
  faceOf,
  isBehind,
  isCanceled,
  isFinished,
  leavesWithin,
  loggedSeconds,
  nextOpenAfter,
  nodesOf,
  previousBefore,
  recordedSeconds,
  runningEntry,
  timedInRun,
  typedInSeconds,
  type Action,
  type Leaf,
  type RoutineNode,
  type Session,
} from "./routine"
import { formatClock, type TimerCue } from "./timer"

// Settled entries end at float instants, so round away the dust before flooring.
const clock = (seconds: number) =>
  formatClock(Math.round(seconds * 1000) / 1000, "down")

const isLive = (session: Session) =>
  session.phase === "running" || session.phase === "paused"

// "Play only this" sets a cursor before anything is timed; until Start it isn't paused.
const isPaused = (session: Session) =>
  session.phase === "paused" && timedInRun(session.run).length > 0

// Progress and "Round 1 of 4" count the work, never the rests between repeats.
const isGap = (leaf: Leaf) => leaf.node.generated === "gap"

const plannedOf = (node: RoutineNode) =>
  node.timer.mode === "down" ? node.timer.seconds : null

// What an activity took against what it was meant to take, kept after it ends early.
const actualVersusPlanned = (session: Session, node: RoutineNode) => {
  const actual = loggedSeconds(session.run, node, session.now)
  const leaves = leavesWithin(session.root, node.id)
  const planned = leaves.reduce(
    (sum, leaf) => sum + (plannedOf(leaf.node) ?? 0),
    0
  )
  const behind = leaves.every((leaf) => isBehind(session.run, leaf.node.id))
  const typedIn = typedInSeconds(session.run, node)
  return {
    actual,
    planned: planned > 0 ? planned : null,
    early: behind && planned > 0 && actual < planned - 0.5,
    typedIn: typedIn === 0 ? "none" : actual - typedIn < 0.5 ? "all" : "some",
  } as const
}

// The note after an activity's time. Time typed in says so first, since nobody timed it
// and "ended early" would claim more than anyone knows.
const timeNote = (result: ReturnType<typeof actualVersusPlanned>) => {
  if (result.typedIn === "all") return "logged"
  if (result.typedIn === "some") return "part logged"
  return result.early ? "ended early" : null
}

type Primary = {
  label: string
  icon: "pause" | "play" | "again"
  action: Action
  disabled: boolean
}

// Canceled activities never play, so a routine of nothing else has nothing to start.
const nothingToPlay = (session: Session) =>
  session.leaves.every((leaf) => isCanceled(session.run, leaf.node.id))

const primaryOf = (session: Session): Primary => {
  const primary = primaryAction(session)
  const plays = primary.action.kind !== "pause"
  return { ...primary, disabled: plays && nothingToPlay(session) }
}

const primaryAction = (session: Session): Omit<Primary, "disabled"> => {
  switch (session.phase) {
    case "running":
      return { label: "Pause", icon: "pause", action: { kind: "pause" } }
    // Start over clears ticks, so it lives in the menu; the main button only plays it again.
    case "finished":
      return { label: "Do again", icon: "again", action: { kind: "playAll" } }
    case "scopeDone":
      return { label: "Do again", icon: "again", action: { kind: "play" } }
    case "idle":
      return { label: "Start", icon: "play", action: { kind: "playAll" } }
    case "paused":
      if (
        session.current &&
        isFinished(session.current.node, session.run, session.now)
      ) {
        return { label: "Do again", icon: "again", action: { kind: "play" } }
      }
      return isPaused(session)
        ? { label: "Resume", icon: "play", action: { kind: "play" } }
        : { label: "Start", icon: "play", action: { kind: "play" } }
  }
}

// What a timer with nothing to play sums up: the part played on its own once it's done,
// else the whole routine.
const summaryOf = (session: Session) => {
  const node =
    session.phase === "scopeDone" && session.scope
      ? session.scope
      : session.root
  return {
    node,
    complete: session.phase === "finished" || session.phase === "scopeDone",
    seconds: loggedSeconds(session.run, node, session.now),
    recorded: recordedSeconds(session.run, node, session.now),
  }
}

// Next moves on (Skip on a rest) without marking anything done: finishing an activity is
// always its status, so its timed time is never settled by accident.
// On the last activity there's nothing to move on to.
const nextOf = (session: Session) => {
  const current = session.current
  const next = session.next?.node
  if (!current || !next) return null
  const planned = plannedOf(current.node)
  const kept = planned
    ? ` (keeps ${clock(faceOf(current.node, session.run, session.now).elapsed)} of ${clock(planned)})`
    : ""
  const skip = isGap(current)
  return {
    label: skip ? "Skip" : "Next",
    skip,
    hint: `${skip ? "Skip" : "Leave"} ${current.node.title}${kept} and start ${next.title}`,
    action: { kind: "next", from: current.node.id } satisfies Action,
  }
}

// Only time from this attempt becomes a lap; with none, there'd be an empty Lap 1. A rest
// between repeats is never split into laps.
const lapOf = (session: Session) => {
  const current = session.current
  if (!current || current.node.timer.mode !== "up") return null
  if (isGap(current)) return null
  if (clockSeconds(session.run, current.node.id, session.now) <= 0) return null
  return {
    label: "Lap",
    hint:
      current.node.generated === "lap"
        ? `Start Lap ${current.parent.children.length + 1} under ${current.parent.title}`
        : `Split ${current.node.title}: this time becomes Lap 1, Lap 2 starts`,
    action: { kind: "lap", from: current.node.id } satisfies Action,
  }
}

// The buttons a surface shows, so the keyboard can offer exactly the same ones. A routine
// ticked done by hand before it was ever timed only offers Start: passing its first activity
// would make it read finished with nothing timed.
const controlsOf = (session: Session) => {
  const current = session.current
  const fromTheTop =
    session.phase === "idle" &&
    current !== null &&
    isBehind(session.run, current.node.id)
  const moving =
    session.phase !== "finished" && session.phase !== "scopeDone" && !fromTheTop
  return {
    primary: primaryOf(session),
    prev:
      moving && current
        ? {
            disabled:
              previousBefore(session.scoped, session.run, current.node.id) ===
              null,
            action: { kind: "prev", from: current.node.id } satisfies Action,
          }
        : null,
    lap: moving ? lapOf(session) : null,
    next: moving ? nextOf(session) : null,
  }
}

// Start over is offered once the routine has been played (it starts the whole routine over).
const offersStartOver = (session: Session) => {
  const { phase } = session
  return (
    phase === "running" ||
    isPaused(session) ||
    phase === "finished" ||
    phase === "scopeDone"
  )
}

// The last countdown ran out and waits for you: check on it, then say it's done.
const timerEnded = (session: Session) =>
  session.phase === "paused" &&
  session.current !== null &&
  session.next === null &&
  isFinished(session.current.node, session.run, session.now)

// Done, an activity plays again whole: on the routine's own page from the top, not just the
// part played on its own last. While the routine is still open, a part played on its own
// plays again by itself.
const replayOf = (session: Session, pageId: string): Action | null => {
  if (
    pageId !== session.root.id ||
    (session.phase === "scopeDone" &&
      !session.run.done.includes(session.root.id))
  ) {
    return againOf(session)
  }
  return session.leaves.every((leaf) => isCanceled(session.run, leaf.node.id))
    ? null
    : { kind: "playAll" }
}

// The activity the timer belongs to: the page it's seen from, else the part playing on its
// own, else the whole routine. A part whose finish ended the whole routine hands it back.
const timerTargetId = (session: Session) =>
  session.within ??
  (session.phase === "finished" ? null : session.scope?.id) ??
  session.root.id

// Played to the end, the routine plays again from the top; a part played on its own plays
// that part again. Null when there's nothing left to play.
const againOf = (session: Session): Action | null => {
  const part = session.phase === "scopeDone"
  const pool = part ? session.scoped : session.leaves
  if (pool.every((leaf) => isCanceled(session.run, leaf.node.id))) return null
  return part ? { kind: "play" } : { kind: "playAll" }
}

// What's still ahead, as a rough length; untimed activities can't be counted.
const timeLeft = (session: Session) => {
  const pool = session.scope ? session.scoped : session.leaves
  return pool.reduce(
    (left, leaf) => {
      if (isBehind(session.run, leaf.node.id)) return left
      if (leaf.node.timer.mode === "up") {
        return { ...left, untimed: left.untimed + 1 }
      }
      const spent =
        session.current?.node.id === leaf.node.id
          ? faceOf(leaf.node, session.run, session.now).elapsed
          : 0
      return {
        ...left,
        seconds: left.seconds + Math.max(0, leaf.node.timer.seconds - spent),
      }
    },
    { seconds: 0, untimed: 0 }
  )
}

const roughly = (seconds: number) => {
  const minutes = Math.round(seconds / 60)
  if (minutes < 1) return "under a minute"
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`
}

const progressText = (session: Session) => {
  const left = timeLeft(session)
  if (left.seconds > 0) {
    return `${left.untimed > 0 ? "at least" : "about"} ${roughly(left.seconds)} to go`
  }
  return left.untimed > 0 ? "at your own pace from here" : "almost there"
}

// Which top-level part is running, counted the way the bar draws them.
const partOf = (session: Session) => {
  const current = session.current
  const parts = session.root.children
  if (!current || parts.length < 2) return null
  const index = parts.findIndex((part) =>
    nodesOf(part).some((node) => node.id === current.node.id)
  )
  const part = parts[index]
  return part
    ? { title: part.title, index: index + 1, count: parts.length }
    : null
}

// Where the current step sits in its group: "Round 1 of 4" for work, "after Round 1" for a gap.
const stepInfo = (session: Session) => {
  const current = session.current
  if (!current || current.parent.id === session.root.id) return null
  const siblings = session.leaves.filter(
    (leaf) => leaf.parent.id === current.parent.id
  )
  const work = siblings.filter((leaf) => !isGap(leaf))
  const position = siblings.findIndex(
    (leaf) => leaf.node.id === current.node.id
  )
  const previousWork = siblings
    .slice(0, position)
    .filter((leaf) => !isGap(leaf))
  if (isGap(current)) {
    return {
      kind: "gap" as const,
      after: previousWork.at(-1)?.node.title ?? null,
    }
  }
  return {
    kind: "work" as const,
    index: previousWork.length + 1,
    count: work.length,
  }
}

// The count written after the title: "Round 1" becomes "Round 1 of 4", "Scales" "Scales · 1 of 4".
const stepSuffix = (session: Session) => {
  const step = stepInfo(session)
  const title = session.current?.node.title ?? ""
  if (step?.kind !== "work" || step.count < 2) return ""
  return title.trim().endsWith(String(step.index))
    ? ` of ${step.count}`
    : ` · ${step.index} of ${step.count}`
}

// The timer as a sub-activity's page sees it: only its own activities.
const viewFor = (session: Session, page: RoutineNode): Session => {
  const ids = new Set(nodesOf(page).map((node) => node.id))
  const leaves = session.leaves.filter((leaf) => ids.has(leaf.node.id))
  // A finished part played on its own has no current activity, so its page reads finished.
  const inside =
    session.current !== null &&
    ids.has(session.current.node.id) &&
    (session.phase === "running" || session.phase === "paused")
  const allBehind = leaves.every((leaf) => isBehind(session.run, leaf.node.id))
  const current = inside
    ? session.current
    : (leaves.find((leaf) => !isBehind(session.run, leaf.node.id)) ??
      leaves[0] ??
      null)
  const timedHere = timedInRun(session.run).some((entry) =>
    ids.has(entry.activityId)
  )
  const phase: Session["phase"] = inside
    ? session.phase
    : allBehind &&
        (timedHere || loggedSeconds(session.run, page, session.now) > 0)
      ? "finished"
      : "idle"
  return {
    ...session,
    root: page.children.length > 0 ? page : { ...page, children: [page] },
    leaves,
    // Previous moves within what the routine is playing, as the engine does.
    scoped: session.scoped,
    scope: null,
    phase,
    current,
    // Next keeps playing the routine's own scope, so while the part runs, what comes after
    // it is the routine's next, which may lie outside this page.
    next: inside
      ? session.next
      : current
        ? nextOpenAfter(leaves, session.run, current.node.id)
        : null,
    position: current
      ? leaves.findIndex((leaf) => leaf.node.id === current.node.id) + 1
      : leaves.length,
    within: page.id,
  }
}

const pageViewOf = (session: Session, pageId: string) => {
  const page =
    pageId === session.root.id
      ? null
      : nodesOf(session.root).find((node) => node.id === pageId)
  return page ? viewFor(session, page) : session
}

// Which routine the dock shows. The page's own routine wins once its view has been played,
// unless another routine is running: that one must stay in reach everywhere.
const shownRoutine = (
  own: Session | null,
  pageId: string | null,
  active: Session | null
) => {
  const runningElsewhere =
    active !== null &&
    active.phase === "running" &&
    active.root.id !== own?.root.id
  if (own && pageId !== null && !runningElsewhere) {
    if (pageViewOf(own, pageId).phase !== "idle") {
      return { session: own, pageId, onOwnPage: true }
    }
    if (own.phase !== "idle") {
      return { session: own, pageId: null, onOwnPage: false }
    }
  }
  if (active && active.phase !== "idle") {
    return { session: active, pageId: null, onOwnPage: false }
  }
  return null
}

type Shown = ReturnType<typeof shownRoutine>

// On the routine's own page its timer row holds it, so the dock never shows it twice.
const dockOn = (shown: NonNullable<Shown>) =>
  shown.onOwnPage ? ("nowhere" as const) : ("everywhere" as const)

// Full screen stays on the routine it was opened for (`kept`), finished or started over, until
// you leave, whatever the dock moves on to meanwhile.
const fullScreenOf = (kept: Session | null, shown: Shown) => {
  if (!kept) return shown
  return {
    session: kept,
    pageId: shown?.session.root.id === kept.root.id ? shown.pageId : null,
    onOwnPage: false,
  }
}

// Leaving full screen steps back only when this visit opened it. A full-screen address
// reloaded or opened from a link has no page of ours behind it, so it's dropped instead.
const fullScreenExit = (enteredHere: boolean, canGoBack: boolean) =>
  enteredHere && canGoBack ? ("back" as const) : ("replace" as const)

// Full screen entered again while an exit was still navigating keeps the routine it entered for.
const keptAfterExit = (held: string | null, exitedFrom: string | null) =>
  held === exitedFrom ? null : held

// Going to an activity, or picking one to play on its own, stops the timer, so while it runs
// anywhere in the routine (a sub-activity's page may read idle meanwhile) the hint says so.
const pauses = (session: Session) =>
  runningEntry(session.run) ? " (pauses)" : ""

const jumpHint = (session: Session, title: string) =>
  `Go to ${title}${pauses(session)}`

const playOnlyHint = (session: Session) => `waits for Start${pauses(session)}`

// Ticking a box goes through the routine too, but what failed is the tick, not the timer.
const failureOf = (action: Action) =>
  action.kind === "toggleDone"
    ? "Couldn't update that activity."
    : "Couldn't update the timer."

type ScheduledCue = { at: number; cue: TimerCue }

// The hand-overs still ahead while nobody touches the timer: each countdown that runs out
// passes to the next activity (a rest or more work) until a count-up or the end.
const cuesAhead = (session: Session): ScheduledCue[] => {
  if (session.phase !== "running" || !session.current) return []
  const cues: ScheduledCue[] = []
  let leaf: Leaf | null = session.current
  let at = session.now
  for (let guard = 0; leaf && guard <= session.scoped.length; guard += 1) {
    const timer = leaf.node.timer
    if (timer.mode !== "down") return cues
    const remaining = faceOf(leaf.node, session.run, session.now).remaining ?? 0
    // A countdown that ran out in an earlier attempt starts from the top when handed to.
    at +=
      leaf !== session.current && remaining <= CLOCK_TOLERANCE_SECONDS
        ? timer.seconds
        : remaining
    const next = nextOpenAfter(session.scoped, session.run, leaf.node.id)
    cues.push({
      at,
      cue: next === null ? "finish" : isGap(next) ? "rest" : "work",
    })
    leaf = next
  }
  return cues
}

export {
  actualVersusPlanned,
  againOf,
  clock,
  controlsOf,
  cuesAhead,
  dockOn,
  failureOf,
  fullScreenExit,
  fullScreenOf,
  isLive,
  keptAfterExit,
  isPaused,
  jumpHint,
  lapOf,
  nextOf,
  offersStartOver,
  pageViewOf,
  partOf,
  playOnlyHint,
  primaryOf,
  progressText,
  roughly,
  shownRoutine,
  stepInfo,
  stepSuffix,
  summaryOf,
  timeLeft,
  timeNote,
  timerEnded,
  replayOf,
  timerTargetId,
}
export type { Primary, ScheduledCue }
