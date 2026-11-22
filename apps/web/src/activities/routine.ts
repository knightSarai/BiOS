import type { TimerConfig } from "./timer"

type RoutineNode = {
  id: string
  title: string
  timer: TimerConfig
  typeId: string | null
  generated: "step" | "gap" | "lap" | null
  series: boolean
  children: RoutineNode[]
}

type Leaf = { node: RoutineNode; parent: RoutineNode }

// Timed time waits until the activity is finished. Done or Start over discards it; time is
// added back as typed in, if wanted. Rows from before keep "recorded". Discarded time is kept
// so the clock and hand-overs still read what ran.
type Recording = "pending" | "recorded" | "discarded"

type Entry = {
  id: string
  activityId: string
  start: number
} & (
  | { manual: false; end: number | null; recording: Recording }
  // Typed in afterwards: never running, never moved, and it counts in the run it was
  // typed in (`logged`), however long ago the session itself was.
  | { manual: true; end: number; logged: number }
)

type Run = {
  entries: Entry[]
  cursor: string | null
  // Moving past a real activity doesn't make it done.
  passed: string[]
  done: string[]
  // Canceled never plays, not even when its part is played again.
  canceled: string[]
  // Chosen to play again: they play although they're ticked done, and keep the tick.
  replay: string[]
  scopeId: string | null
  runStart: number
  attemptFrom: Record<string, number>
  joinedAt: Record<string, number>
  // Time logged before the timer first played the routine mustn't make it look paused.
  started: boolean
}

// "scopeDone": the activity or group played on its own has finished; the routine hasn't.
type Phase = "idle" | "running" | "paused" | "scopeDone" | "finished"

const isStep = (node: RoutineNode) => node.generated !== null

const leavesOf = (root: RoutineNode) => {
  const leaves: Leaf[] = []
  const visit = (node: RoutineNode, parent: RoutineNode) => {
    if (node.children.length === 0) {
      leaves.push({ node, parent })
      return
    }
    for (const child of node.children) visit(child, node)
  }
  for (const child of root.children) visit(child, root)
  return root.children.length === 0 ? [{ node: root, parent: root }] : leaves
}

const nodesOf = (root: RoutineNode): RoutineNode[] => [
  root,
  ...root.children.flatMap(nodesOf),
]

const findNode = (root: RoutineNode, id: string) =>
  nodesOf(root).find((node) => node.id === id) ?? null

const leavesWithin = (root: RoutineNode, scopeId: string | null) => {
  const leaves = leavesOf(root)
  if (scopeId === null || scopeId === root.id) return leaves
  const scope = findNode(root, scopeId)
  if (!scope) return leaves
  const ids = new Set(nodesOf(scope).map((node) => node.id))
  return leaves.filter((leaf) => ids.has(leaf.node.id))
}

const entrySeconds = (entry: Entry, now: number) =>
  Math.max(0, (entry.end ?? now) - entry.start)

const runningEntry = (run: Run) =>
  run.entries.find((entry) => !entry.manual && entry.end === null) ?? null

const runFloor = (run: Run, id: string) =>
  Math.max(run.runStart, run.joinedAt[id] ?? -Infinity)

const inRun = (run: Run) => (entry: Entry) =>
  (entry.manual ? entry.logged : entry.start) >= runFloor(run, entry.activityId)

const entriesInRun = (run: Run) => run.entries.filter(inRun(run))

const timedInRun = (run: Run) =>
  entriesInRun(run).filter((entry) => !entry.manual)

const attemptStart = (run: Run, id: string) =>
  Math.max(runFloor(run, id), run.attemptFrom[id] ?? -Infinity)

// Settled time belongs to an attempt that's over, so a reopened or replayed activity's clock
// starts fresh.
const inAttempt = (run: Run, id: string) => (entry: Entry) =>
  !entry.manual &&
  entry.recording === "pending" &&
  entry.activityId === id &&
  entry.start >= attemptStart(run, id)

// Only the timer moves an activity's clock; time typed in counts toward its total, not
// toward a countdown.
const clockSeconds = (run: Run, id: string, now: number) =>
  run.entries
    .filter(inAttempt(run, id))
    .reduce((total, entry) => total + entrySeconds(entry, now), 0)

const subtreeOf = (node: RoutineNode) =>
  new Set(nodesOf(node).map((each) => each.id))

const countsInTotals = (entry: Entry) =>
  entry.manual || entry.recording !== "discarded"

const entriesWithin = (run: Run, node: RoutineNode) => {
  const ids = subtreeOf(node)
  return run.entries
    .filter(inRun(run))
    .filter((entry) => ids.has(entry.activityId) && countsInTotals(entry))
}

const recordedSeconds = (run: Run, node: RoutineNode, now: number) =>
  entriesWithin(run, node)
    .filter((entry) => entry.manual || entry.recording === "recorded")
    .reduce((total, entry) => total + entrySeconds(entry, now), 0)

// Everything an activity holds across all its runs: recorded timer time and time added.
const heldSeconds = (run: Run, node: RoutineNode, now: number) => {
  const ids = subtreeOf(node)
  return run.entries
    .filter(
      (entry) =>
        ids.has(entry.activityId) &&
        (entry.manual || entry.recording === "recorded")
    )
    .reduce((total, entry) => total + entrySeconds(entry, now), 0)
}

// Done discards everything waiting under what was finished.
const settleTime = (run: Run, ids: Set<string>): Run => ({
  ...run,
  entries: run.entries.map((entry) =>
    !entry.manual &&
    entry.recording === "pending" &&
    entry.end !== null &&
    ids.has(entry.activityId)
      ? { ...entry, recording: "discarded" }
      : entry
  ),
})

const loggedSeconds = (run: Run, node: RoutineNode, now: number) =>
  entriesWithin(run, node).reduce(
    (total, entry) => total + entrySeconds(entry, now),
    0
  )

const typedInSeconds = (run: Run, node: RoutineNode) =>
  entriesWithin(run, node)
    .filter((entry) => entry.manual)
    .reduce((total, entry) => total + entrySeconds(entry, 0), 0)

// Instants are stored to the millisecond, so a countdown that ran out can read up to a
// millisecond short after a reload.
const CLOCK_TOLERANCE_SECONDS = 0.001

const isFinished = (node: RoutineNode, run: Run, now: number) =>
  node.timer.mode === "down" &&
  clockSeconds(run, node.id, now) >=
    node.timer.seconds - CLOCK_TOLERANCE_SECONDS

const isBehind = (run: Run, id: string) =>
  run.canceled.includes(id) ||
  run.passed.includes(id) ||
  (run.done.includes(id) && !run.replay.includes(id))

const isCanceled = (run: Run, id: string) => run.canceled.includes(id)

// A canceled group cancels what's inside it: none of it plays, is logged or is marked done.
const withCanceledInside = (root: RoutineNode, run: Run): Run => {
  const inside = nodesOf(root)
    .filter((node) => run.canceled.includes(node.id))
    .flatMap(nodesOf)
    .map((node) => node.id)
  const canceled = [...new Set([...run.canceled, ...inside])]
  return canceled.length === run.canceled.length ? run : { ...run, canceled }
}

const nextOpenAfter = (leaves: Leaf[], run: Run, id: string | null) => {
  const index = id === null ? -1 : leaves.findIndex((l) => l.node.id === id)
  return (
    leaves.slice(index + 1).find((leaf) => !isBehind(run, leaf.node.id)) ?? null
  )
}

// Previous skips canceled activities, which never play.
const previousBefore = (leaves: Leaf[], run: Run, id: string) => {
  const index = leaves.findIndex((leaf) => leaf.node.id === id)
  return (
    leaves
      .slice(0, Math.max(0, index))
      .filter((leaf) => !isCanceled(run, leaf.node.id))
      .at(-1) ?? null
  )
}

const without = (ids: string[], id: string) => ids.filter((each) => each !== id)

const withId = (ids: string[], id: string) =>
  ids.includes(id) ? ids : [...ids, id]

const parentOf = (root: RoutineNode, id: string) =>
  nodesOf(root).find((each) =>
    each.children.some((child) => child.id === id)
  ) ?? null

const lappedStepOf = (root: RoutineNode, id: string) => {
  const parent =
    findNode(root, id)?.generated === "lap" ? parentOf(root, id) : null
  return parent && isStep(parent) ? parent : null
}

// A generated step split into laps ticks itself once all its laps are behind, however the
// last one closed; a canceled one stays canceled, and one whose every lap was canceled was
// never done.
const tickLapped = (run: Run, root: RoutineNode, id: string): Run => {
  const lapped = lappedStepOf(root, id)
  if (!lapped || isCanceled(run, lapped.id) || run.done.includes(lapped.id)) {
    return run
  }
  const finished =
    lapped.children.every((lap) => isBehind(run, lap.id)) &&
    lapped.children.some((lap) => !isCanceled(run, lap.id))
  return finished ? { ...run, done: [...run.done, lapped.id] } : run
}

// Canceled already counts as behind; marking it passed or dropping it from the replays would
// keep it behind once the group that canceled it is reopened.
const passBy = (run: Run, root: RoutineNode, node: RoutineNode): Run =>
  tickLapped(
    {
      ...run,
      passed: isCanceled(run, node.id)
        ? run.passed
        : withId(run.passed, node.id),
      replay: isCanceled(run, node.id)
        ? run.replay
        : without(run.replay, node.id),
      done:
        isStep(node) && !isCanceled(run, node.id) && !run.done.includes(node.id)
          ? [...run.done, node.id]
          : run.done,
    },
    root,
    node.id
  )

const closeRunning = (run: Run, at: number): Run => ({
  ...run,
  entries: run.entries.map((entry) =>
    !entry.manual && entry.end === null
      ? { ...entry, end: Math.max(entry.start, at) }
      : entry
  ),
})

type Ids = () => string

const openEntry = (run: Run, id: string, at: number, newId: Ids): Run => ({
  ...run,
  cursor: id,
  entries: [
    ...run.entries,
    {
      id: newId(),
      activityId: id,
      start: at,
      end: null,
      manual: false,
      recording: "pending",
    },
  ],
})

// A countdown that really ran out starts again from the top; one that was cut short resumes.
// Playing a lap again reopens the step it splits.
const startOn = (
  run: Run,
  root: RoutineNode,
  id: string,
  at: number,
  newId: Ids
): Run => {
  const node = findNode(root, id)
  if (!node || node.children.length > 0) return run
  const again = isFinished(node, run, at)
  const reopened = [isStep(node) ? id : null, lappedStepOf(root, id)?.id]
  return openEntry(
    {
      ...run,
      passed: run.passed.filter((passedId) => passedId !== id),
      done: run.done.filter((doneId) => !reopened.includes(doneId)),
      attemptFrom: again ? { ...run.attemptFrom, [id]: at } : run.attemptFrom,
    },
    id,
    at,
    newId
  )
}

const endsHere = (leaves: Leaf[], run: Run, node: RoutineNode) =>
  !isStep(node) && nextOpenAfter(leaves, run, node.id) === null

// A countdown that runs out hands straight to the next activity; a count-up keeps going
// until you move on. Rolling forward on read means no effect drives the hand-over.
const settle = (root: RoutineNode, stored: Run, now: number, newId: Ids) => {
  const leaves = leavesWithin(root, stored.scopeId)
  let run = stored
  for (let guard = 0; guard <= leaves.length; guard += 1) {
    const live = runningEntry(run)
    if (!live) return run
    const node = findNode(root, live.activityId)
    if (!node || node.timer.mode !== "down") return run
    const elapsed = clockSeconds(run, node.id, now)
    if (elapsed < node.timer.seconds - CLOCK_TOLERANCE_SECONDS) return run
    // A countdown shortened below what it had already run ends where this entry began.
    const finishedAt = Math.max(
      live.start,
      now - Math.max(0, elapsed - node.timer.seconds)
    )
    // The last countdown of an activity you wrote stops at "Timer ended": the bell says check
    // on it, and only you say it's done.
    if (endsHere(leaves, run, node)) {
      return closeRunning(run, finishedAt)
    }
    run = passBy(closeRunning(run, finishedAt), root, node)
    const next = nextOpenAfter(leaves, run, node.id)
    if (!next) return { ...run, cursor: null }
    run = startOn(run, root, next.node.id, finishedAt, newId)
  }
  return run
}

// Ticks alone never make a routine paused, nor progress carried in by a moved part: only
// time the timer ran in this run does.
const hasTimerActivity = (run: Run) => run.started && timedInRun(run).length > 0

const phaseOf = (
  root: RoutineNode,
  leaves: Leaf[],
  scoped: Leaf[],
  run: Run,
  now: number
): Phase => {
  if (runningEntry(run)) return "running"
  const played = hasTimerActivity(run) || (run.started && run.cursor !== null)
  if (
    leaves.every((leaf) => isBehind(run, leaf.node.id)) &&
    (run.passed.length > 0 ||
      hasTimerActivity(run) ||
      loggedSeconds(run, root, now) > 0)
  )
    return "finished"
  if (!played) return "idle"
  if (
    run.scopeId !== null &&
    scoped.every((leaf) => isBehind(run, leaf.node.id))
  )
    return "scopeDone"
  return "paused"
}

const faceOf = (node: RoutineNode, run: Run, now: number) => {
  const elapsed = clockSeconds(run, node.id, now)
  if (node.timer.mode === "up") {
    return { elapsed, remaining: null, fraction: null }
  }
  const remaining = Math.max(0, node.timer.seconds - elapsed)
  return {
    elapsed,
    remaining,
    fraction: Math.min(1, elapsed / node.timer.seconds),
  }
}

// How far a leaf counts toward its slice of the bar: a countdown by its clock, a count-up once done.
const leafProgress = (leaf: Leaf, run: Run, now: number) => {
  if (isBehind(run, leaf.node.id)) return 1
  const face = faceOf(leaf.node, run, now)
  if (face.fraction !== null) return face.fraction
  return face.elapsed > 0 ? 0.5 : 0
}

const UP_SHARE_SECONDS = 60

const leafWeight = (leaf: Leaf) =>
  leaf.node.timer.mode === "down" ? leaf.node.timer.seconds : UP_SHARE_SECONDS

const plannedSeconds = (leaves: Leaf[]) =>
  leaves.reduce(
    (total, leaf) =>
      total + (leaf.node.timer.mode === "down" ? leaf.node.timer.seconds : 0),
    0
  )

// A cursor or scope whose activity was deleted (or gained sub-activities) is dropped, so the
// routine carries on from its next open activity instead of getting stuck. A stopped cursor
// on an activity ticked done elsewhere moves on, so Resume never plays it again. A timer
// running on an activity puts the routine there, even when no cursor was stored for it (as
// after the upgrade).
const withoutStale = (root: RoutineNode, run: Run, leaves: Leaf[]): Run => {
  const scopeId =
    run.scopeId !== null && findNode(root, run.scopeId) ? run.scopeId : null
  const live = runningEntry(run)
  const isLeaf = (id: string) => leaves.some((leaf) => leaf.node.id === id)
  const cursor = live && isLeaf(live.activityId) ? live.activityId : run.cursor
  if (cursor === null || !isLeaf(cursor)) {
    return { ...run, scopeId, cursor: null }
  }
  if (!isBehind(run, cursor) || live?.activityId === cursor) {
    return { ...run, scopeId, cursor }
  }
  return {
    ...run,
    scopeId,
    cursor:
      nextOpenAfter(leavesWithin(root, scopeId), run, cursor)?.node.id ?? null,
  }
}

// `within` is the page the timer is seen from; Start there plays only that activity.
const sessionOf = (
  root: RoutineNode,
  stored: Run,
  now: number,
  newId: Ids,
  within: string | null = null
) => {
  const leaves = leavesOf(root)
  const run = withoutStale(
    root,
    settle(root, withCanceledInside(root, stored), now, newId),
    leaves
  )
  const scoped = leavesWithin(root, run.scopeId)
  const phase = phaseOf(root, leaves, scoped, run, now)
  // Everything ticked by hand before the timer ever ran still starts from the top. A part
  // played on its own that has finished shows its summary, not what lies beyond it.
  const currentId =
    phase === "scopeDone"
      ? null
      : (run.cursor ??
        nextOpenAfter(scoped, run, null)?.node.id ??
        nextOpenAfter(leaves, run, null)?.node.id ??
        (phase === "idle" ? (scoped[0] ?? leaves[0])?.node.id : null) ??
        null)
  const current = leaves.find((leaf) => leaf.node.id === currentId) ?? null
  const next = current ? nextOpenAfter(scoped, run, current.node.id) : null
  const scope = run.scopeId === null ? null : findNode(root, run.scopeId)
  return {
    root,
    leaves,
    scoped,
    scope,
    run,
    now,
    phase,
    current,
    next,
    position: current ? leaves.indexOf(current) + 1 : leaves.length,
    within,
  }
}

type Session = ReturnType<typeof sessionOf>

// `from` is the activity the timer showed as current when the action was asked for; once
// the routine has moved on (a second tap landing after the first), the action is dropped.
type Action =
  | { kind: "play" }
  | { kind: "playAll" }
  | { kind: "playOnly"; id: string }
  | { kind: "jumpTo"; id: string }
  | { kind: "widen" }
  | { kind: "pause" }
  | { kind: "lap"; from?: string }
  | { kind: "next"; from?: string }
  | { kind: "prev"; from?: string }
  | { kind: "toggleDone"; id: string; from?: string }
  | { kind: "startOver" }

type AddedLap = {
  id: string
  parentId: string
  title: string
  typeId: string | null
}

type Outcome = { run: Run; laps: AddedLap[] }

const withLaps = (root: RoutineNode, laps: AddedLap[]): RoutineNode => ({
  ...root,
  children: [
    ...root.children.map((child) => withLaps(child, laps)),
    ...laps
      .filter((lap) => lap.parentId === root.id)
      .map((lap) => ({
        id: lap.id,
        title: lap.title,
        timer: { mode: "up" as const, sound: root.timer.sound },
        typeId: lap.typeId,
        generated: "lap" as const,
        series: false,
        children: [],
      })),
  ],
})

const sameIds = (a: string[], b: string[]) =>
  a.length === b.length && a.every((id, index) => id === b[index])

const timedState = (run: Run) =>
  run.entries
    .filter((entry) => !entry.manual)
    .map((entry) => `${entry.id}:${entry.activityId}:${entry.end}`)

const touchesRun = (before: Run, after: Run) =>
  before.cursor !== after.cursor ||
  before.scopeId !== after.scopeId ||
  before.runStart !== after.runStart ||
  !sameIds(before.passed, after.passed) ||
  !sameIds(
    Object.entries(before.attemptFrom).flat().map(String),
    Object.entries(after.attemptFrom).flat().map(String)
  ) ||
  !sameIds(timedState(before), timedState(after))

// Replays alone don't start a routine, but they must still be stored.
const runRowChanged = (before: Run, after: Run) =>
  touchesRun(before, after) || !sameIds(before.replay, after.replay)

// When the activity's timer last stopped in this attempt; earlier runs don't date it.
const endedInAttempt = (run: Run, id: string) => {
  const ends = run.entries
    .filter(inAttempt(run, id))
    .flatMap((entry) => (entry.end === null ? [] : [entry.end]))
  return ends.length > 0 ? Math.max(...ends) : null
}

const act = (
  root: RoutineNode,
  stored: Run,
  action: Action,
  now: number,
  newId: Ids,
  within: string | null = null
): Outcome => {
  const outcome = actOn(root, stored, action, now, newId, within)
  return {
    ...outcome,
    run: {
      ...outcome.run,
      started: stored.started || touchesRun(stored, outcome.run),
    },
  }
}

// Only Start from a page narrows the timer to it; every other action keeps the stored scope.
const actOn = (
  root: RoutineNode,
  stored: Run,
  action: Action,
  now: number,
  newId: Ids,
  within: string | null
): Outcome => {
  const session = sessionOf(root, stored, now, newId, within)
  const { run, leaves, scoped, current } = session
  const live = runningEntry(run)
  const stopped = closeRunning(run, now)
  const done = (next: Run, laps: AddedLap[] = []): Outcome => ({
    run: next,
    laps,
  })
  const unchanged = done(run)
  if ("from" in action && action.from !== undefined) {
    if (current?.node.id !== action.from) return unchanged
  }
  const moveTo = (moved: Run, target: RoutineNode | null) => {
    if (!target) return done({ ...moved, cursor: null })
    return done(
      live
        ? startOn(moved, root, target.id, now, newId)
        : { ...moved, cursor: target.id }
    )
  }
  // From the scope's first unfinished activity, or from the top when all are done; picking
  // "only this" waits for Start.
  const playScope = (scopeId: string | null, start: boolean) => {
    const inside = leavesWithin(root, scopeId).filter(
      (leaf) => !isCanceled(stopped, leaf.node.id)
    )
    const open = inside.find((leaf) => !isBehind(stopped, leaf.node.id))
    const ids = new Set(inside.map((leaf) => leaf.node.id))
    // Played again, every countdown in it counts from the top, and ticked ones play too.
    const reopened: Run = open
      ? stopped
      : {
          ...stopped,
          passed: stopped.passed.filter((id) => !ids.has(id)),
          done: stopped.done.filter((id) => {
            const node = findNode(root, id)
            return !ids.has(id) || !node || !isStep(node)
          }),
          replay: [...stopped.replay.filter((id) => !ids.has(id)), ...ids],
          attemptFrom: {
            ...stopped.attemptFrom,
            ...Object.fromEntries(
              inside
                .filter((leaf) => leaf.node.timer.mode === "down")
                .map((leaf) => [leaf.node.id, now])
            ),
          },
        }
    const target = open ?? inside[0]
    if (!target) return unchanged
    return done(
      start
        ? startOn({ ...reopened, scopeId }, root, target.node.id, now, newId)
        : {
            ...reopened,
            scopeId,
            cursor: target.node.id,
            passed: reopened.passed.filter((id) => id !== target.node.id),
          }
    )
  }

  switch (action.kind) {
    case "play":
      if (live || session.phase === "finished") return unchanged
      if (session.phase === "scopeDone")
        return playScope(within ?? run.scopeId, true)
      if (!current) return unchanged
      if (isBehind(run, current.node.id)) return playScope(run.scopeId, true)
      return done(startOn(run, root, current.node.id, now, newId))
    case "playAll": {
      if (within) return playScope(within, true)
      const open = nextOpenAfter(leaves, stopped, null)
      const target =
        current && !isBehind(stopped, current.node.id) ? current : open
      if (!target) return playScope(null, true)
      return done(
        startOn({ ...stopped, scopeId: null }, root, target.node.id, now, newId)
      )
    }
    case "playOnly":
      return playScope(action.id, false)
    // Jumping outside a "play only" group goes back to the whole routine.
    case "jumpTo": {
      if (isCanceled(run, action.id)) return unchanged
      const inScope = scoped.some((leaf) => leaf.node.id === action.id)
      return done({
        ...stopped,
        scopeId: inScope ? run.scopeId : null,
        cursor: action.id,
        passed: without(stopped.passed, action.id),
        replay: withId(stopped.replay, action.id),
      })
    }
    case "widen":
      return done({
        ...run,
        scopeId: null,
        cursor:
          session.phase === "scopeDone"
            ? (nextOpenAfter(leaves, run, null)?.node.id ?? null)
            : run.cursor,
      })
    case "pause":
      return done(stopped)
    case "next": {
      if (!current) return unchanged
      const moved = passBy(stopped, root, current.node)
      return moveTo(
        moved,
        nextOpenAfter(scoped, moved, current.node.id)?.node ?? null
      )
    }
    // The first lap turns the activity into a parent holding "Lap 1" (this attempt's time
    // so far) and "Lap 2"; time from earlier runs stays on the parent.
    // Nothing timed in this attempt has nothing to split off as a lap, and a rest is never
    // split.
    case "lap": {
      if (!current || current.node.timer.mode !== "up") return unchanged
      if (current.node.generated === "gap") return unchanged
      if (clockSeconds(run, current.node.id, now) <= 0) return unchanged
      const lapped =
        current.node.generated === "lap" ? current.parent : current.node
      const lap = (number: number): AddedLap => ({
        id: newId(),
        parentId: lapped.id,
        title: `Lap ${number}`,
        typeId: lapped.typeId,
      })
      if (current.node.generated === "lap") {
        const added = lap(lapped.children.length + 1)
        const tree = withLaps(root, [added])
        const passed = passBy(stopped, tree, current.node)
        return done(
          live
            ? startOn(passed, tree, added.id, now, newId)
            : { ...passed, cursor: added.id },
          [added]
        )
      }
      const first = lap(1)
      const second = lap(2)
      const tree = withLaps(root, [first, second])
      const moved: Run = {
        ...stopped,
        entries: stopped.entries.map((entry) =>
          inAttempt(stopped, lapped.id)(entry)
            ? { ...entry, activityId: first.id }
            : entry
        ),
        passed: [...stopped.passed, first.id],
        done: [...stopped.done, first.id],
      }
      return done(
        live
          ? startOn(moved, tree, second.id, now, newId)
          : { ...moved, cursor: second.id },
        [first, second]
      )
    }
    case "prev": {
      if (!current) return unchanged
      const target = previousBefore(scoped, run, current.node.id)
      if (!target) return unchanged
      const back = {
        ...stopped,
        replay: withId(stopped.replay, target.node.id),
      }
      return done(
        live
          ? startOn(back, root, target.node.id, now, newId)
          : {
              ...back,
              cursor: target.node.id,
              passed: without(back.passed, target.node.id),
            }
      )
    }
    case "toggleDone": {
      const id = action.id
      if (run.done.includes(id)) {
        // Unticked, a step the routine moved past plays again.
        return done({
          ...run,
          done: without(run.done, id),
          passed: without(run.passed, id),
        })
      }
      if (live && current?.node.id === id) {
        const moved = passBy(
          { ...stopped, done: [...stopped.done, id] },
          root,
          current.node
        )
        return moveTo(moved, nextOpenAfter(scoped, moved, id)?.node ?? null)
      }
      const ticked = tickLapped(
        { ...run, done: [...run.done, id], replay: without(run.replay, id) },
        root,
        id
      )
      // Ticking the step it's paused on moves past it, so Resume doesn't play it again.
      return done(
        run.cursor === id
          ? {
              ...ticked,
              cursor: nextOpenAfter(scoped, ticked, id)?.node.id ?? null,
            }
          : ticked
      )
    }
    case "startOver":
      return done({
        ...settleTime(stopped, subtreeOf(root)),
        cursor: null,
        passed: [],
        done: [],
        replay: [],
        scopeId: null,
        runStart: now,
        attemptFrom: {},
        joinedAt: {},
      })
  }
}

// A timer edit that leaves the playing countdown at or past its new length ends it at the
// edit: the next activity starts now, and no time is credited to before the edit.
const endOverrun = (
  root: RoutineNode,
  stored: Run,
  now: number,
  newId: Ids
): Run => {
  const live = runningEntry(stored)
  const node = live ? findNode(root, live.activityId) : null
  if (!node || node.children.length > 0 || !isFinished(node, stored, now)) {
    return stored
  }
  const leaves = leavesWithin(root, stored.scopeId)
  const closed = closeRunning(withCanceledInside(root, stored), now)
  if (endsHere(leaves, closed, node)) return closed
  const run = passBy(closed, root, node)
  const next = nextOpenAfter(leaves, run, node.id)
  return next
    ? startOn(run, root, next.node.id, now, newId)
    : { ...run, cursor: null }
}

export {
  heldSeconds,
  act,
  CLOCK_TOLERANCE_SECONDS,
  clockSeconds,
  closeRunning,
  endedInAttempt,
  endOverrun,
  entriesInRun,
  faceOf,
  findNode,
  hasTimerActivity,
  isBehind,
  isCanceled,
  isFinished,
  leafProgress,
  leafWeight,
  leavesOf,
  leavesWithin,
  loggedSeconds,
  nextOpenAfter,
  nodesOf,
  plannedSeconds,
  previousBefore,
  recordedSeconds,
  runRowChanged,
  runningEntry,
  settleTime,
  subtreeOf,
  timedInRun,
  touchesRun,
  typedInSeconds,
  sessionOf,
  tickLapped,
  withCanceledInside,
}
export type {
  Action,
  Entry,
  Leaf,
  Outcome,
  Recording,
  RoutineNode,
  Run,
  Session,
}
