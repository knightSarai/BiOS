import {
  addSeconds,
  now,
  parseUtc,
  secondsBetween,
  type UtcDatetime,
} from "@knight-os/server/core"
import {
  act,
  endedInAttempt,
  endOverrun,
  findNode,
  hasTimerActivity,
  leavesOf,
  leavesWithin,
  nextOpenAfter,
  runRowChanged,
  runningEntry,
  sessionOf,
  tickLapped,
  timedInRun,
  touchesRun,
  withCanceledInside,
  type Action,
  type Entry,
  type Outcome,
  type RoutineNode,
  type Run,
  type Session,
} from "@/activities/routine"
import { byCreation } from "@/activities/sub-activities"
import { isOpenStatus, type ActivityStatus } from "@/activities/status"
import { resolveTimer } from "@/activities/timer"
import { ActivitiesRepository, statusChange } from "./activities"
import type { ActivityRow, LocalDb, RoutineRunRow, TimeEntryRow } from "./db"

type RoutinesContext = { workspaceId: string }

class MissingRoutineError extends Error {}

const EPOCH = parseUtc("1970-01-01T00:00:00.000Z")
const toSeconds = (instant: UtcDatetime) => secondsBetween(EPOCH, instant)
const toInstant = (seconds: number) => addSeconds(EPOCH, seconds)

const secondsOf = (instants: Record<string, UtcDatetime>) =>
  Object.fromEntries(
    Object.entries(instants).map(([id, at]) => [id, toSeconds(at)])
  )

const instantsOf = (seconds: Record<string, number>) =>
  Object.fromEntries(
    Object.entries(seconds).map(([id, at]) => [id, toInstant(at)])
  )

// Paused routines among this many of the latest runs stay in reach.
const RECENT_RUNS = 5

// What the dock follows on every page: a routine running, paused partway with a place to
// resume from, or whose part played on its own finished while the rest hasn't. One played to
// the end isn't, even after a step of it is reopened.
const inProgress = (session: Session) =>
  session.phase === "running" ||
  (session.phase === "paused" &&
    session.run.cursor !== null &&
    hasTimerActivity(session.run)) ||
  (session.phase === "scopeDone" && hasTimerActivity(session.run))

const subtreeIds = (rows: Map<string, ActivityRow>, id: string) => {
  const ids = new Set([id])
  let grew = true
  while (grew) {
    grew = false
    for (const row of rows.values()) {
      if (row.parentId !== null && ids.has(row.parentId) && !ids.has(row.id)) {
        ids.add(row.id)
        grew = true
      }
    }
  }
  return ids
}

const pick = <T>(record: Record<string, T>, keep: (id: string) => boolean) =>
  Object.fromEntries(Object.entries(record).filter(([id]) => keep(id)))

// A row that only records when activities joined: the timer never played this run. With no
// cursor it can't be in progress either, so it's skipped without taking a recent run's place.
const isJoinOnly = (run: RoutineRunRow) =>
  run.cursor === null &&
  run.passed.length === 0 &&
  run.replay.length === 0 &&
  run.scopeId === null &&
  run.runStart === null &&
  Object.keys(run.attemptFrom).length === 0

// Play leaves a cursor, a part played on its own or a Start over on the run, and a run played
// to the end still has its timed time. What a moved part carries in (what it got past, its
// attempts, time from before it joined) and ticks never make a routine played.
const wasPlayed = (stored: RoutineRunRow, run: Run) =>
  stored.cursor !== null ||
  stored.scopeId !== null ||
  stored.runStart !== null ||
  timedInRun(run).length > 0

const withoutIds = (
  run: RoutineRunRow,
  ids: Set<string>,
  at: UtcDatetime
): RoutineRunRow => ({
  ...run,
  cursor: run.cursor !== null && ids.has(run.cursor) ? null : run.cursor,
  scopeId: run.scopeId !== null && ids.has(run.scopeId) ? null : run.scopeId,
  passed: run.passed.filter((id) => !ids.has(id)),
  replay: run.replay.filter((id) => !ids.has(id)),
  attemptFrom: pick(run.attemptFrom, (id) => !ids.has(id)),
  joinedAt: pick(run.joinedAt, (id) => !ids.has(id)),
  updatedAt: at,
})

const emptyRun = (
  base: Pick<RoutineRunRow, "id" | "workspaceId">,
  at: UtcDatetime
): RoutineRunRow => ({
  ...base,
  cursor: null,
  passed: [],
  replay: [],
  scopeId: null,
  runStart: null,
  attemptFrom: {},
  joinedAt: {},
  updatedAt: at,
})

const latestOf = (instants: (UtcDatetime | null | undefined)[]) =>
  instants.reduce<UtcDatetime | null>(
    (latest, at) => (at && (latest === null || at > latest) ? at : latest),
    null
  )

const onlyIds = (
  run: RoutineRunRow,
  ids: Set<string>,
  at: UtcDatetime
): RoutineRunRow => ({
  ...run,
  cursor: run.cursor !== null && ids.has(run.cursor) ? run.cursor : null,
  scopeId: null,
  passed: run.passed.filter((id) => ids.has(id)),
  replay: run.replay.filter((id) => ids.has(id)),
  attemptFrom: pick(run.attemptFrom, (id) => ids.has(id)),
  joinedAt: pick(run.joinedAt, (id) => ids.has(id)),
  updatedAt: at,
})

// What the routine an activity moves into learns about it. Its earlier time never counts
// there, but what it moved past and its attempts come along, whether or not that routine
// ran. Only a routine that ran takes its place too: one that never did starts from the top.
const joinedRun = (
  joined: RoutineRunRow | null,
  carried: RoutineRunRow | null,
  base: Pick<RoutineRunRow, "id" | "workspaceId">,
  ids: Set<string>,
  at: UtcDatetime
): RoutineRunRow => {
  const joinedAt = Object.fromEntries([...ids].map((id) => [id, at]))
  const target = joined ?? emptyRun(base, at)
  if (!carried) {
    return {
      ...target,
      joinedAt: { ...target.joinedAt, ...joinedAt },
      updatedAt: at,
    }
  }
  return {
    ...target,
    cursor: isJoinOnly(target)
      ? target.cursor
      : (target.cursor ?? carried.cursor),
    passed: [...new Set([...target.passed, ...carried.passed])],
    replay: [...new Set([...target.replay, ...carried.replay])],
    attemptFrom: { ...target.attemptFrom, ...carried.attemptFrom },
    joinedAt: { ...target.joinedAt, ...joinedAt },
    updatedAt: at,
  }
}

// A part that ran as a routine of its own while its parent was deleted comes back with how
// far it got there. A Start over it had there still holds, as a floor on its activities.
const rejoinedRun = (
  into: RoutineRunRow,
  part: RoutineRunRow,
  ids: Set<string>,
  at: UtcDatetime
): RoutineRunRow => {
  const kept = withoutIds(into, ids, at)
  const floors = Object.fromEntries(
    [...ids].flatMap((id) => {
      const floor = latestOf([part.runStart, part.joinedAt[id]])
      return floor === null ? [] : [[id, floor]]
    })
  )
  return {
    ...kept,
    cursor: part.cursor ?? kept.cursor,
    passed: [...kept.passed, ...part.passed],
    replay: [...kept.replay, ...part.replay],
    attemptFrom: { ...kept.attemptFrom, ...part.attemptFrom },
    joinedAt: { ...kept.joinedAt, ...floors },
  }
}

type Loaded = {
  root: RoutineNode
  rows: Map<string, ActivityRow>
  run: Run
  stored: Map<string, TimeEntryRow>
  hasRunRow: boolean
}

const newId = () => crypto.randomUUID()

// The activity as open as far as the engine knows, for an action that closes it itself.
const reopenedFor = (loaded: Loaded, id: string): Loaded => ({
  ...loaded,
  run: {
    ...loaded.run,
    done: loaded.run.done.filter((each) => each !== id),
    canceled: loaded.run.canceled.filter((each) => each !== id),
  },
})

class RoutinesRepository {
  constructor(
    private readonly db: LocalDb,
    private readonly ctx: RoutinesContext
  ) {}

  private async row(id: string) {
    const row = await this.db.activities.get(id)
    return row?.workspaceId === this.ctx.workspaceId ? row : null
  }

  async rootOf(activityId: string) {
    let row = await this.row(activityId)
    const seen = new Set<string>()
    while (row?.parentId && !seen.has(row.parentId)) {
      seen.add(row.id)
      const parent = await this.row(row.parentId)
      if (!parent) break
      row = parent
    }
    return row
  }

  private async load(rootId: string): Promise<Loaded | null> {
    const top = await this.row(rootId)
    if (!top) return null
    const rows = new Map([[top.id, top]])
    let frontier = [top.id]
    while (frontier.length > 0) {
      const children = await this.db.activities
        .where("parentId")
        .anyOf(frontier)
        .filter((row) => row.workspaceId === this.ctx.workspaceId)
        .toArray()
      frontier = children
        .filter((row) => !rows.has(row.id))
        .map((row) => row.id)
      for (const child of children) rows.set(child.id, child)
    }
    const types = new Map(
      (
        await this.db.activityTypes
          .where("workspaceId")
          .equals(this.ctx.workspaceId)
          .toArray()
      ).map((type) => [type.id, type])
    )
    const childrenOf = (id: string) =>
      [...rows.values()]
        .filter((row) => row.parentId === id && row.id !== rootId)
        .sort(byCreation)
    const build = (row: ActivityRow): RoutineNode => {
      const children = childrenOf(row.id).map(build)
      const typeTimer = row.typeId
        ? (types.get(row.typeId)?.timer ?? null)
        : null
      return {
        id: row.id,
        title: row.title,
        timer:
          children.length > 0
            ? {
                mode: "up",
                sound: row.timer?.sound ?? typeTimer?.sound ?? "none",
              }
            : resolveTimer(row.timer, typeTimer),
        typeId: row.typeId,
        generated: row.generated,
        series: row.series,
        children,
      }
    }
    const entries = await this.db.timeEntries
      .where("[workspaceId+activityId]")
      .anyOf([...rows.keys()].map((id) => [this.ctx.workspaceId, id]))
      .toArray()
    const stored = await this.runRow(rootId)
    const run: Run = {
      entries: entries
        .map((entry): Entry => {
          const timed = {
            id: entry.id,
            activityId: entry.activityId,
            start: toSeconds(entry.startedAt),
          }
          if (entry.source === "timer") {
            return {
              ...timed,
              manual: false,
              end: entry.endedAt === null ? null : toSeconds(entry.endedAt),
            }
          }
          return {
            ...timed,
            manual: true,
            end: toSeconds(entry.endedAt),
            logged: toSeconds(entry.loggedAt),
          }
        })
        .sort((a, b) => a.start - b.start),
      cursor: stored?.cursor ?? null,
      passed: stored?.passed ?? [],
      done: [...rows.values()]
        .filter((row) => row.status === "done")
        .map((row) => row.id),
      canceled: [...rows.values()]
        .filter((row) => row.status === "canceled")
        .map((row) => row.id),
      replay: stored?.replay ?? [],
      scopeId: stored?.scopeId ?? null,
      runStart: stored?.runStart ? toSeconds(stored.runStart) : 0,
      attemptFrom: secondsOf(stored?.attemptFrom ?? {}),
      joinedAt: secondsOf(stored?.joinedAt ?? {}),
      started: false,
    }
    const root = build(top)
    return {
      root,
      rows,
      stored: new Map(entries.map((entry) => [entry.id, entry])),
      hasRunRow: stored !== null,
      run: withCanceledInside(root, {
        ...run,
        started: stored !== null && wasPlayed(stored, run),
      }),
    }
  }

  private async runRow(rootId: string) {
    const run = await this.db.routineRuns.get(rootId)
    return run?.workspaceId === this.ctx.workspaceId ? run : null
  }

  async state(activityId: string) {
    const root = await this.rootOf(activityId)
    if (!root) return null
    const loaded = await this.load(root.id)
    return loaded ? { root: loaded.root, run: loaded.run } : null
  }

  // Rolled forward past countdowns that ran out; nothing is written until the next action.
  async session(activityId: string, within: string | null = null) {
    const state = await this.state(activityId)
    if (!state) return null
    return sessionOf(
      state.root,
      state.run,
      toSeconds(parseUtc(now())),
      newId,
      within
    )
  }

  // The routine to keep in reach on every page: the one running, or else the last one paused
  // partway. Ticks alone never put a routine here.
  // A run row outlives its routine when its top activity is deleted or moved under another, so
  // those rows, and rows that only record moves, aren't counted among the recent ones.
  async active() {
    for (const entry of await this.runningEntries()) {
      const session = await this.session(entry.activityId)
      if (session?.phase === "running") {
        return { root: session.root, run: session.run }
      }
    }
    const runs = await this.db.routineRuns
      .where("[workspaceId+updatedAt]")
      .between([this.ctx.workspaceId, ""], [this.ctx.workspaceId, "￿"])
      .reverse()
      .toArray()
    let looked = 0
    for (const run of runs) {
      if (looked >= RECENT_RUNS) break
      if (isJoinOnly(run)) continue
      if ((await this.rootOf(run.id))?.id !== run.id) continue
      looked += 1
      const session = await this.session(run.id)
      if (session && inProgress(session)) {
        return { root: session.root, run: session.run }
      }
    }
    return null
  }

  // A timer left running on an activity that's gone is closed here, so it can't hide the
  // routine really playing behind it.
  playingRoutineId() {
    return this.db.transaction("rw", this.tables(), async () => {
      const at = parseUtc(now())
      let playing: string | null = null
      for (const entry of await this.runningEntries()) {
        const root = await this.rootOf(entry.activityId)
        if (root) {
          playing ??= root.id
          continue
        }
        await this.db.timeEntries.update(entry.id, {
          endedAt: entry.startedAt > at ? entry.startedAt : at,
        })
      }
      return playing
    })
  }

  private runningEntries() {
    return this.db.timeEntries
      .where("[workspaceId+startedAt]")
      .between([this.ctx.workspaceId, ""], [this.ctx.workspaceId, "￿"])
      .filter((entry) => entry.endedAt === null)
      .toArray()
  }

  private tables() {
    return [
      this.db.areas,
      this.db.activities,
      this.db.activityTypes,
      this.db.activityTypeFields,
      this.db.timeEntries,
      this.db.routineRuns,
    ]
  }

  apply(
    activityId: string,
    action: Action | { kind: "sync" },
    within: string | null = null
  ) {
    return this.db.transaction("rw", this.tables(), async () => {
      const top = await this.rootOf(activityId)
      const loaded = top ? await this.load(top.id) : null
      if (!top || !loaded) {
        throw new MissingRoutineError("That activity doesn't exist.")
      }
      const at = parseUtc(now())
      const seconds = toSeconds(at)
      // A canceled activity never plays, yet ticking its box marks it done.
      const ready: Loaded =
        action.kind === "toggleDone" &&
        loaded.rows.get(action.id)?.status === "canceled"
          ? reopenedFor(loaded, action.id)
          : loaded
      const outcome =
        action.kind === "sync"
          ? this.settled(ready, seconds)
          : act(ready.root, ready.run, action, seconds, newId, within)

      if (runningEntry(outcome.run)) await this.stopOthers(ready, at)
      await this.commit(top, ready, outcome, at)
      return sessionOf(
        (await this.load(top.id))?.root ?? loaded.root,
        outcome.run,
        seconds,
        newId,
        within
      )
    })
  }

  private settled(loaded: Loaded, seconds: number): Outcome {
    const run = sessionOf(loaded.root, loaded.run, seconds, newId).run
    return {
      run: {
        ...run,
        started: loaded.run.started || touchesRun(loaded.run, run),
      },
      laps: [],
    }
  }

  private async commit(
    top: ActivityRow,
    loaded: Loaded,
    outcome: Outcome,
    at: UtcDatetime
  ) {
    if (outcome.laps.length > 0) {
      await new ActivitiesRepository(this.db, this.ctx).insertRows(
        outcome.laps.map((lap) => {
          const parent = loaded.rows.get(lap.parentId)
          return {
            id: lap.id,
            areaId: parent?.areaId ?? top.areaId,
            parentId: lap.parentId,
            typeId: lap.typeId,
            title: lap.title,
            status: "todo" as const,
            origin: null,
            timer: {
              mode: "up" as const,
              sound: parent?.timer?.sound ?? "none",
            },
            generated: "lap" as const,
          }
        })
      )
    }
    await this.writeEntries(loaded.stored, outcome.run.entries)
    await this.writeTicks(loaded.run.done, outcome.run)
    await this.writeRun(top.id, loaded, outcome.run, at)
  }

  // One timer runs at a time. Another routine is paused through its own run, so its
  // countdowns stop where they ran out and earlier attempts and Start over are respected.
  private async stopOthers(loaded: Loaded, at: UtcDatetime) {
    const running = (await this.runningEntries()).filter(
      (entry) => !loaded.rows.has(entry.activityId)
    )
    const roots = new Map<string, ActivityRow>()
    for (const entry of running) {
      const root = await this.rootOf(entry.activityId)
      if (root) {
        roots.set(root.id, root)
        continue
      }
      await this.db.timeEntries.update(entry.id, {
        endedAt: entry.startedAt > at ? entry.startedAt : at,
      })
    }
    for (const root of roots.values()) await this.pause(root, at)
  }

  private async pause(root: ActivityRow, at: UtcDatetime) {
    const loaded = await this.load(root.id)
    if (!loaded) return
    const outcome = act(
      loaded.root,
      loaded.run,
      { kind: "pause" },
      toSeconds(at),
      newId
    )
    await this.commit(root, loaded, outcome, at)
  }

  // Hand-overs that fell due are written first, so nothing added is timed from before it
  // existed. An activity that gains its first sub-activities is timed through them from then
  // on: a countdown on it that ran out first hands over as the timer would have; one still
  // going stops now, and the routine waits on the first new open activity under it.
  adopt<T>(parentIds: string[], change: () => Promise<T>) {
    return this.db.transaction("rw", this.tables(), async () => {
      const at = parseUtc(now())
      const seconds = toSeconds(at)
      const waiting: { rootId: string; parentId: string }[] = []
      for (const parentId of new Set(parentIds)) {
        const top = await this.rootOf(parentId)
        const loaded = top ? await this.load(top.id) : null
        const node = loaded ? findNode(loaded.root, parentId) : null
        if (!top || !loaded || !node) continue
        const settled = this.settled(loaded, seconds)
        const becomesParent = node.children.length === 0
        const playing =
          becomesParent && runningEntry(settled.run)?.activityId === parentId
        const outcome = playing
          ? act(loaded.root, loaded.run, { kind: "pause" }, seconds, newId)
          : settled
        await this.commit(top, loaded, outcome, at)
        const waits =
          playing || (loaded.hasRunRow && outcome.run.cursor === parentId)
        if (becomesParent && waits) waiting.push({ rootId: top.id, parentId })
      }
      const result = await change()
      for (const { rootId, parentId } of waiting) {
        await this.waitOn(rootId, parentId, at)
      }
      return result
    })
  }

  private async waitOn(rootId: string, parentId: string, at: UtcDatetime) {
    const loaded = await this.load(rootId)
    const stored = await this.runRow(rootId)
    if (!loaded || !stored) return
    const inside = findNode(loaded.root, parentId)
      ? leavesWithin(loaded.root, parentId)
      : []
    const last = inside.at(-1)
    const target =
      nextOpenAfter(inside, loaded.run, null) ??
      (last
        ? nextOpenAfter(leavesOf(loaded.root), loaded.run, last.node.id)
        : null)
    await this.db.routineRuns.put({
      ...stored,
      cursor: target?.node.id ?? null,
      updatedAt: at,
    })
  }

  // Hand-overs that fell due are written before the routine's tree or timers change, so the
  // change never rewrites how far a countdown got.
  catchUp(activityId: string) {
    return this.db.transaction("rw", this.tables(), async () => {
      const top = await this.rootOf(activityId)
      const loaded = top ? await this.load(top.id) : null
      if (!top || !loaded) return
      const at = parseUtc(now())
      await this.commit(top, loaded, this.settled(loaded, toSeconds(at)), at)
    })
  }

  async catchUpRunning() {
    for (const entry of await this.runningEntries()) {
      await this.catchUp(entry.activityId)
    }
  }

  // A timer edit lands on the routine as it is: hand-overs due under the old lengths are
  // written first, and a countdown the edit leaves at or past its new length ends at the
  // edit, so the activities after it never get time from before it.
  retime<T>(change: () => Promise<T>) {
    return this.db.transaction("rw", this.tables(), async () => {
      await this.catchUpRunning()
      const result = await change()
      const at = parseUtc(now())
      for (const entry of await this.runningEntries()) {
        const top = await this.rootOf(entry.activityId)
        const loaded = top ? await this.load(top.id) : null
        if (!top || !loaded) continue
        const run = endOverrun(loaded.root, loaded.run, toSeconds(at), newId)
        if (run === loaded.run) continue
        await this.commit(top, loaded, { run, laps: [] }, at)
      }
      return result
    })
  }

  // Sub-activities left without a parent by a delete become routines of their own, each
  // taking its share of the run, so earlier attempts still don't count and the time so far
  // stays.
  splitOff(id: string) {
    return this.db.transaction("rw", this.tables(), async () => {
      const top = await this.rootOf(id)
      const stored = top ? await this.runRow(top.id) : null
      const loaded = top && stored ? await this.load(top.id) : null
      if (!top || !stored || !loaded) return
      const at = parseUtc(now())
      const moved = new Set<string>()
      for (const child of loaded.rows.values()) {
        if (child.parentId !== id || child.id === top.id) continue
        const ids = subtreeIds(loaded.rows, child.id)
        for (const each of ids) moved.add(each)
        await this.db.routineRuns.put({
          ...onlyIds(stored, ids, at),
          id: child.id,
        })
      }
      if (top.id !== id && moved.size > 0) {
        await this.db.routineRuns.put(withoutIds(stored, moved, at))
      }
    })
  }

  rejoin(ids: string[]) {
    return this.db.transaction("rw", this.tables(), async () => {
      const at = parseUtc(now())
      for (const id of ids) {
        const part = await this.runRow(id)
        const top = await this.rootOf(id)
        const loaded = top && part ? await this.load(top.id) : null
        if (!part || !top || !loaded || top.id === id) continue
        const into =
          (await this.runRow(top.id)) ??
          emptyRun({ id: top.id, workspaceId: this.ctx.workspaceId }, at)
        await this.db.routineRuns.put(
          rejoinedRun(into, part, subtreeIds(loaded.rows, id), at)
        )
        await this.db.routineRuns.delete(id)
      }
    })
  }

  // Done or Canceled on the activity the timer is playing moves the routine on, as ticking
  // it in the timer does. Reopening one the routine moved past puts it back in the run.
  // Hand-overs that fell due are written first, so the change lands on the routine as it is
  // now: a step that already ran out was ticked when it ended, before this changes it.
  // Only a change of status dates it, so marking a done activity done again keeps its date.
  setStatus(
    id: string,
    status: ActivityStatus,
    completedAt: UtcDatetime | null = null
  ) {
    return this.db.transaction("rw", this.tables(), async () => {
      if (!(await this.row(id))) return
      await this.catchUp(id)
      const row = await this.row(id)
      const top = row ? await this.rootOf(id) : null
      const loaded = top ? await this.load(top.id) : null
      if (!row || !top || !loaded) return
      const at = parseUtc(now())
      const seconds = toSeconds(at)
      const live = runningEntry(this.settled(loaded, seconds).run)
      // Whatever it was before, ticking the activity the timer is playing hands over. A
      // cancel is written first and handed over below, so the engine never counts it done
      // (a lapped step whose laps all end up canceled would be ticked).
      if (status === "done" && live?.activityId === id) {
        const ready = reopenedFor(loaded, id)
        const outcome = act(
          ready.root,
          ready.run,
          { kind: "toggleDone", id },
          seconds,
          newId
        )
        await this.commit(top, loaded, outcome, at)
        const ticked = await this.row(id)
        const redate = completedAt !== null && row.status !== status
        if (ticked && (ticked.status !== status || redate)) {
          await this.db.activities.update(
            id,
            statusChange(ticked, status, completedAt)
          )
        }
        return
      }
      if (row.status !== status) {
        await this.db.activities.update(
          id,
          statusChange(row, status, completedAt)
        )
      }
      if (
        status === "canceled" &&
        live &&
        subtreeIds(loaded.rows, id).has(live.activityId)
      ) {
        await this.handOverFrom(top, live.activityId, at)
      }
      await this.keepRunUp(top.id, row.status, id, status, at)
      // A replayed lap only counts as behind once it's out of the replays.
      if (!isOpenStatus(status)) await this.tickLappedStep(top.id, id)
    })
  }

  private async keepRunUp(
    rootId: string,
    was: ActivityStatus,
    id: string,
    status: ActivityStatus,
    at: UtcDatetime
  ) {
    const stored = await this.runRow(rootId)
    if (!stored) return
    const reopened = !isOpenStatus(was) && isOpenStatus(status)
    const passed = reopened
      ? stored.passed.filter((each) => each !== id)
      : stored.passed
    const replay = isOpenStatus(status)
      ? stored.replay
      : stored.replay.filter((each) => each !== id)
    if (
      passed.length === stored.passed.length &&
      replay.length === stored.replay.length
    )
      return
    await this.db.routineRuns.put({
      ...stored,
      passed,
      replay,
      updatedAt: at,
    })
  }

  private async handOverFrom(
    top: ActivityRow,
    playing: string,
    at: UtcDatetime
  ) {
    const loaded = await this.load(top.id)
    if (!loaded) return
    const outcome = act(
      loaded.root,
      loaded.run,
      { kind: "next", from: playing },
      toSeconds(at),
      newId
    )
    await this.commit(top, loaded, outcome, at)
  }

  private async tickLappedStep(rootId: string, id: string) {
    const loaded = await this.load(rootId)
    if (!loaded) return
    const ticked = tickLapped(loaded.run, loaded.root, id)
    if (ticked !== loaded.run) await this.writeTicks(loaded.run.done, ticked)
  }

  // Moving an activity between routines: it's paused through the routine it leaves, and what
  // it ran there never counts in the run of the one it joins. Made its own routine, it keeps
  // its old run's floors, attempts and ticks, so time before a Start over still doesn't count.
  move(id: string, parentId: string | null) {
    return this.db.transaction("rw", this.tables(), async () => {
      const row = await this.row(id)
      if (!row || row.parentId === parentId) return
      const from = await this.rootOf(id)
      const to = parentId === null ? null : await this.rootOf(parentId)
      if (!from) return
      await this.catchUp(from.id)
      if (to && to.id !== from.id) await this.catchUp(to.id)
      const loaded = await this.load(from.id)
      if (!loaded) return
      const subtree = subtreeIds(loaded.rows, id)
      const at = parseUtc(now())
      const live = runningEntry(loaded.run)
      if (to?.id !== from.id && live && subtree.has(live.activityId)) {
        await this.pause(from, at)
      }
      const activities = new ActivitiesRepository(this.db, this.ctx)
      await this.adopt(parentId === null ? [] : [parentId], () =>
        activities.setParent(id, parentId)
      )
      if (to?.id === from.id) {
        await this.widenPastPlaying(from.id, at)
        return
      }
      const left = await this.runRow(from.id)
      if (left && from.id === id) await this.db.routineRuns.delete(from.id)
      if (left && from.id !== id) {
        await this.db.routineRuns.put(withoutIds(left, subtree, at))
      }
      const carried = left ? onlyIds(left, subtree, at) : null
      if (parentId === null) {
        if (carried) await this.db.routineRuns.put({ ...carried, id })
        return
      }
      if (!to) return
      await this.db.routineRuns.put(
        joinedRun(
          await this.runRow(to.id),
          carried,
          { id: to.id, workspaceId: this.ctx.workspaceId },
          subtree,
          at
        )
      )
    })
  }

  // Left in place, a part played on its own that no longer holds what's playing would hand
  // over back to the part's first activity; the whole routine plays on instead.
  private async widenPastPlaying(rootId: string, at: UtcDatetime) {
    const stored = await this.runRow(rootId)
    const loaded = stored?.scopeId ? await this.load(rootId) : null
    if (!stored || !loaded || stored.scopeId === null) return
    const playing = runningEntry(loaded.run)?.activityId ?? stored.cursor
    if (playing === null) return
    const inScope = leavesWithin(loaded.root, stored.scopeId).some(
      (leaf) => leaf.node.id === playing
    )
    if (inScope) return
    await this.db.routineRuns.put({ ...stored, scopeId: null, updatedAt: at })
  }

  private async writeEntries(
    stored: Map<string, TimeEntryRow>,
    entries: Entry[]
  ) {
    for (const entry of entries) {
      if (entry.manual) continue
      const before = stored.get(entry.id)
      const startedAt = toInstant(entry.start)
      const endedAt =
        entry.end === null ? null : toInstant(Math.max(entry.start, entry.end))
      if (!before) {
        await this.db.timeEntries.add({
          id: entry.id,
          workspaceId: this.ctx.workspaceId,
          activityId: entry.activityId,
          startedAt,
          endedAt,
          source: "timer",
        })
        continue
      }
      const changed =
        before.activityId !== entry.activityId ||
        (before.endedAt === null) !== (endedAt === null) ||
        (before.endedAt !== null &&
          endedAt !== null &&
          Math.abs(secondsBetween(before.endedAt, endedAt)) >= 0.001)
      if (changed) {
        await this.db.timeEntries.update(entry.id, {
          activityId: entry.activityId,
          endedAt,
        })
      }
    }
  }

  // A step the routine moved past was done when its time in this attempt ended, not when
  // this was written.
  private passedAt(run: Run, id: string) {
    if (!run.passed.includes(id)) return null
    const end = endedInAttempt(run, id)
    return end === null ? null : toInstant(end)
  }

  // Only a row's own status decides what's written, so a canceled one is never ticked done
  // or reopened by the routine passing it, playing it again, or starting over.
  private async writeTicks(before: string[], run: Run) {
    const after = run.done
    for (const id of after.filter((each) => !before.includes(each))) {
      const row = await this.row(id)
      if (!row || row.status === "done") continue
      await this.db.activities.update(
        id,
        statusChange(row, "done", this.passedAt(run, id))
      )
    }
    for (const id of before.filter((each) => !after.includes(each))) {
      const row = await this.row(id)
      if (row?.status !== "done") continue
      await this.db.activities.update(id, statusChange(row, row.reopenStatus))
    }
  }

  // Ticking boxes on a routine the timer never played leaves it without a run; one it has
  // keeps up with them.
  private async writeRun(
    rootId: string,
    loaded: Loaded,
    run: Run,
    at: UtcDatetime
  ) {
    if (!run.started && !loaded.hasRunRow) return
    if (loaded.hasRunRow && !runRowChanged(loaded.run, run)) return
    const row: RoutineRunRow = {
      id: rootId,
      workspaceId: this.ctx.workspaceId,
      cursor: run.cursor,
      passed: run.passed,
      replay: run.replay,
      scopeId: run.scopeId,
      runStart: run.runStart > 0 ? toInstant(run.runStart) : null,
      attemptFrom: instantsOf(run.attemptFrom),
      joinedAt: instantsOf(run.joinedAt),
      updatedAt: at,
    }
    await this.db.routineRuns.put(row)
  }
}

export { MissingRoutineError, RoutinesRepository, toSeconds }
export type { RoutinesContext }
