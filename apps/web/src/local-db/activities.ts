import * as Y from "yjs"
import {
  addSeconds,
  isCivilDate,
  now,
  parseUtc,
  type UtcDatetime,
} from "@knight-os/server/core"
import { activityKey } from "@/activities/areas"
import { byCreation } from "@/activities/sub-activities"
import { resolveTypeFields } from "@/activities/type-tree"
import {
  formatFieldValue,
  keepValidValues,
  parseFieldValues,
  setFieldValue,
} from "@/activities/fields"
import { isOpenStatus, type ActivityStatus } from "@/activities/status"
import {
  parseTimerConfig,
  type TimerConfig,
  type TimerSound,
} from "@/activities/timer"
import { DOCUMENT_FRAGMENT } from "@/editor/document-content"
import type {
  ActivityFieldRow,
  ActivityOrigin,
  ActivityRow,
  GeneratedKind,
  LocalDb,
  MentionRow,
  RoutineRunRow,
  TimeEntryRow,
} from "./db"
import { ActivityTypesRepository, byFieldName } from "./activity-types"
import { RoutinesRepository } from "./routines"
import { TimeEntriesRepository, type LoggedSession } from "./time-entries"
import {
  contentUpdatesTable,
  contentWritesSettled,
  readContentUpdates,
  seedContentWithTitle,
  type ContentUpdate,
} from "./y-content"

type ActivitiesContext = {
  workspaceId: string
}

type DeletedActivity = {
  row: Omit<ActivityRow, "content">
  contentUpdates: ContentUpdate[]
  timeEntries: TimeEntryRow[]
  childIds: string[]
  run: RoutineRunRow | null
}

type NewActivity = {
  id: string
  areaId: string
  goalId?: string | null
  parentId?: string | null
  typeId?: string | null
  fields?: Record<string, unknown>
  dueDate?: string | null
  title: string
  notes?: string
  status: ActivityStatus
  origin: ActivityOrigin | null
  timer?: TimerConfig | null
  generated?: GeneratedKind | null
  series?: boolean
}

type SeriesHolder = Omit<NewActivity, "parentId" | "generated" | "series">

type LoggedSpan = Omit<LoggedSession, "activityId">

type CopyPlan = {
  source: ActivityRow
  copyId: string
  parentCopyId: string | null
}

class InvalidParentError extends Error {}

const latestEnd = (sessions: { endedAt: UtcDatetime }[]) =>
  sessions.reduce<UtcDatetime | null>(
    (latest, session) =>
      latest === null || session.endedAt > latest ? session.endedAt : latest,
    null
  )

const outsideParents = (created: NewActivity[]) => {
  const ids = new Set(created.map((activity) => activity.id))
  return created.flatMap((activity) =>
    activity.parentId && !ids.has(activity.parentId) ? [activity.parentId] : []
  )
}

const requireDueDate = (dueDate: string | null) => {
  if (dueDate !== null && !isCivilDate(dueDate)) {
    throw new Error("A due date is a YYYY-MM-DD date.")
  }
  return dueDate
}

const elementsNamed = (ydoc: Y.Doc, nodeName: string) =>
  [
    ...ydoc
      .getXmlFragment(DOCUMENT_FRAGMENT)
      .createTreeWalker(
        (node) => node instanceof Y.XmlElement && node.nodeName === nodeName
      ),
  ].filter((node) => node instanceof Y.XmlElement)

// `completedAt` is when it was really finished, which a late hand-over write knows better
// than the clock.
const statusChange = (
  row: ActivityRow,
  status: ActivityStatus,
  completedAt: UtcDatetime | null = null
) => {
  const timestamp = parseUtc(now())
  return {
    status,
    reopenStatus: isOpenStatus(row.status) ? row.status : row.reopenStatus,
    completedAt: status === "done" ? (completedAt ?? timestamp) : null,
    updatedAt: timestamp,
  }
}

// "Reps 8 · Weight 60", in the type's field order, then any values it holds for other fields.
const fieldDetails = (row: ActivityRow, fields: ActivityFieldRow[]) =>
  fields
    .flatMap((field) => {
      const value = row.fields[field.id]
      return value === undefined
        ? []
        : [`${field.name} ${formatFieldValue(field, value)}`]
    })
    .join(" · ")

class ActivitiesRepository {
  constructor(
    private readonly db: LocalDb,
    private readonly ctx: ActivitiesContext
  ) {}

  private scoped(id: string) {
    return this.db.activities
      .where("id")
      .equals(id)
      .filter((row) => row.workspaceId === this.ctx.workspaceId)
  }

  list(filter: { areaId?: string } = {}) {
    return this.db.activities
      .where("[workspaceId+updatedAt]")
      .between([this.ctx.workspaceId, ""], [this.ctx.workspaceId, "￿"])
      .reverse()
      .filter((row) => !filter.areaId || row.areaId === filter.areaId)
      .toArray()
  }

  async byId(id: string) {
    const row = await this.db.activities.get(id)
    return row?.workspaceId === this.ctx.workspaceId ? row : null
  }

  async summary(id: string) {
    const row = await this.byId(id)
    return row ? this.summarize(row, await this.fieldsShownOn()) : null
  }

  private async summarize(
    row: ActivityRow,
    fieldsOf: (row: ActivityRow) => ActivityFieldRow[]
  ) {
    const area = await this.db.areas.get(row.areaId)
    return {
      id: row.id,
      key: activityKey(area?.key ?? "?", row.number),
      title: row.title,
      status: row.status,
      parentId: row.parentId,
      typeId: row.typeId,
      details: fieldDetails(row, fieldsOf(row)),
    }
  }

  // Reads the definitions once, so summarizing many activities doesn't reread them per row.
  private async fieldsShownOn() {
    const repository = this.types()
    const [types, links, library] = await Promise.all([
      repository.list(),
      repository.typeFieldLinks(),
      repository.library(),
    ])
    return (row: ActivityRow) => {
      const typeFields =
        row.typeId === null
          ? []
          : resolveTypeFields(types, links, library, row.typeId)
      const onType = new Set(typeFields.map((field) => field.id))
      const held = library.filter(
        (field) => !onType.has(field.id) && field.id in row.fields
      )
      return [...typeFields, ...held]
    }
  }

  async children(parentId: string) {
    const rows = await this.db.activities
      .where("parentId")
      .equals(parentId)
      .filter((row) => row.workspaceId === this.ctx.workspaceId)
      .toArray()
    return rows.sort(byCreation)
  }

  // Every level under the activity, each with its parentId so the tree can be rebuilt.
  async subActivities(parentId: string) {
    const ids = await this.descendantIds(parentId)
    const rows = await this.db.activities.bulkGet([...ids])
    const found = rows.filter(
      (row): row is ActivityRow => row?.workspaceId === this.ctx.workspaceId
    )
    const fieldsOf = await this.fieldsShownOn()
    return Promise.all(
      found.sort(byCreation).map((row) => this.summarize(row, fieldsOf))
    )
  }

  private async ancestorIds(id: string) {
    const found = new Set<string>()
    let row = await this.byId(id)
    while (row?.parentId && !found.has(row.parentId)) {
      found.add(row.parentId)
      row = await this.byId(row.parentId)
    }
    return found
  }

  private async descendantIds(id: string) {
    const found = new Set<string>()
    let frontier = [id]
    while (frontier.length > 0) {
      const next: string[] = []
      for (const parentId of frontier) {
        for (const child of await this.children(parentId)) {
          if (found.has(child.id)) continue
          found.add(child.id)
          next.push(child.id)
        }
      }
      frontier = next
    }
    return found
  }

  // Everything except the activity itself and its own sub-activities, which would make a loop.
  async parentCandidates(id: string) {
    const excluded = await this.descendantIds(id)
    excluded.add(id)
    const [rows, areas] = await Promise.all([
      this.list(),
      this.db.areas.where("workspaceId").equals(this.ctx.workspaceId).toArray(),
    ])
    const areaKeys = new Map(areas.map((area) => [area.id, area.key]))
    return rows
      .filter((row) => !excluded.has(row.id))
      .map((row) => ({
        id: row.id,
        key: activityKey(areaKeys.get(row.areaId) ?? "?", row.number),
        title: row.title,
        status: row.status,
      }))
  }

  setParent(id: string, parentId: string | null) {
    return this.db.transaction("rw", this.db.activities, async () => {
      const row = await this.byId(id)
      if (!row || row.parentId === parentId) return
      if (parentId !== null) {
        if (!(await this.byId(parentId))) {
          throw new InvalidParentError("That parent activity doesn't exist.")
        }
        if (parentId === id || (await this.descendantIds(id)).has(parentId)) {
          throw new InvalidParentError(
            "An activity can't be inside its own sub-activity."
          )
        }
      }
      await this.db.activities.update(id, {
        parentId,
        updatedAt: parseUtc(now()),
      })
    })
  }

  async openCountsByArea() {
    const counts = new Map<string, number>()
    await this.db.activities
      .where("workspaceId")
      .equals(this.ctx.workspaceId)
      .each((row) => {
        if (isOpenStatus(row.status) && row.generated === null) {
          counts.set(row.areaId, (counts.get(row.areaId) ?? 0) + 1)
        }
      })
    return counts
  }

  private routineTables() {
    return [
      this.db.areas,
      this.db.activities,
      this.db.activityTypes,
      this.db.activityFields,
      this.db.activityTypeFields,
      this.db.timeEntries,
      this.db.routineRuns,
    ]
  }

  private withTimeEntries<T>(write: () => Promise<T>) {
    return this.db.transaction("rw", this.routineTables(), write)
  }

  // Done with time typed in was finished when that time ended, not when it was saved.
  private async completeAt(ids: string[], ended: UtcDatetime | null) {
    if (ended === null) return
    await this.db.activities
      .where("id")
      .anyOf(ids)
      .filter(
        (row) =>
          row.workspaceId === this.ctx.workspaceId && row.status === "done"
      )
      .modify({ completedAt: ended })
  }

  // Time typed in with the activities saves with them or not at all.
  async createMany(activities: NewActivity[], logged: LoggedSession[] = []) {
    const created = await this.withTimeEntries(async () => {
      const rows = await this.insertMany(activities)
      if (logged.length > 0) {
        await new TimeEntriesRepository(this.db, this.ctx).log(logged)
        await this.completeAt(
          activities.map((activity) => activity.id),
          latestEnd(logged)
        )
      }
      return rows
    })
    await this.seedContents(activities)
    return created
  }

  // Repeats under an empty parent make it a series. A parent that already has
  // sub-activities keeps them, and the repeats go under a new `holder` among them. Time
  // typed in goes on whichever holds the repeats.
  async addSeries(
    parentId: string,
    holder: SeriesHolder,
    repeats: NewActivity[],
    logged: LoggedSpan[] = []
  ) {
    const { created, nested } = await this.withTimeEntries(async () => {
      if (!(await this.byId(parentId))) {
        throw new InvalidParentError("That parent activity doesn't exist.")
      }
      const nested = (await this.children(parentId)).length > 0
      const seriesId = nested ? holder.id : parentId
      const inserted = [
        ...(nested ? [{ ...holder, parentId, series: true }] : []),
        ...repeats.map((repeat) => ({ ...repeat, parentId: seriesId })),
      ]
      const created = await this.insertMany(inserted)
      if (!nested) {
        await this.db.activities.update(parentId, {
          series: true,
          updatedAt: parseUtc(now()),
        })
      }
      if (logged.length > 0) {
        await new TimeEntriesRepository(this.db, this.ctx).log(
          logged.map((span) => ({ ...span, activityId: seriesId }))
        )
        await this.completeAt(
          inserted.map((activity) => activity.id),
          latestEnd(logged)
        )
      }
      return { created, nested }
    })
    // A new holder carries the notes; its repeats don't repeat them.
    await this.seedContents(
      nested
        ? [holder, ...repeats.map((repeat) => ({ ...repeat, notes: "" }))]
        : repeats
    )
    return created
  }

  // Time added by hand after an activity is done; it never changes a status. It replaces
  // timer time still waiting on done activities at or under it (a step that ticked itself),
  // which Add time offers, so the same stretch is never counted twice. An activity still
  // open keeps its clock.
  logTime(sessions: LoggedSession[]) {
    return this.withTimeEntries(async () => {
      const rows = await new TimeEntriesRepository(this.db, this.ctx).log(
        sessions
      )
      const subtree = await this.subtreeIds([
        ...new Set(sessions.map((session) => session.activityId)),
      ])
      const ids = (await this.db.activities.bulkGet(subtree)).flatMap((row) =>
        row?.status === "done" ? [row.id] : []
      )
      await this.db.timeEntries
        .where("[workspaceId+activityId]")
        .anyOf(ids.map((id) => [this.ctx.workspaceId, id]))
        .modify((entry) => {
          if (
            entry.source === "timer" &&
            entry.recording === "pending" &&
            entry.endedAt !== null
          ) {
            entry.recording = "discarded"
          }
        })
      return rows
    })
  }

  private async subtreeIds(ids: string[]): Promise<string[]> {
    const below = await Promise.all(
      ids.map(async (id) =>
        this.subtreeIds((await this.children(id)).map((child) => child.id))
      )
    )
    return [...ids, ...below.flat()]
  }

  async seedContents(
    activities: { id: string; title: string; notes?: string }[]
  ) {
    for (const activity of activities) {
      await this.seedContent(activity.id, activity.title, activity.notes)
    }
  }

  async ensureContent(id: string) {
    const row = await this.byId(id)
    if (row) await this.seedContent(row.id, row.title)
  }

  private async seedContent(id: string, title: string, notes = "") {
    const row = await this.byId(id)
    if (!row) return
    await seedContentWithTitle(this.db, "activities", row.content, title, notes)
  }

  private contentUpdatesTable() {
    return contentUpdatesTable(this.db, "activities")
  }

  delete(id: string) {
    const updates = this.contentUpdatesTable()
    return this.db.transaction(
      "rw",
      [...this.routineTables(), updates],
      async (): Promise<DeletedActivity | null> => {
        if (!(await this.byId(id))) return null
        await this.routines().catchUp(id)
        await this.routines().splitOff(id)
        // Read after the catch-up, which may have ticked it, so undo brings back that tick.
        const row = await this.byId(id)
        if (!row) return null
        const run = await this.db.routineRuns.get(id)
        const contentUpdates = await updates.where("k").equals(id).toArray()
        const timeEntries = this.db.timeEntries
          .where("[workspaceId+activityId]")
          .equals([this.ctx.workspaceId, id])
        const deletedAt = parseUtc(now())
        // A timer running at deletion is closed, so undo doesn't count the deleted time.
        const deletedEntries = (await timeEntries.toArray()).map((entry) => ({
          ...entry,
          endedAt: entry.endedAt ?? deletedAt,
        }))
        await timeEntries.delete()
        await updates.where("k").equals(id).delete()
        // Sub-activities stay, without a parent, as in Linear; undo puts them back under it.
        const childIds = (await this.children(id)).map((child) => child.id)
        await this.db.activities
          .where("id")
          .anyOf(childIds)
          .modify({ parentId: null })
        await this.db.activities.delete(id)
        await this.db.routineRuns
          .where("id")
          .equals(id)
          .filter((each) => each.workspaceId === this.ctx.workspaceId)
          .delete()
        return {
          row: {
            id: row.id,
            workspaceId: row.workspaceId,
            areaId: row.areaId,
            goalId: row.goalId,
            parentId: row.parentId,
            typeId: row.typeId,
            fields: row.fields,
            dueDate: row.dueDate,
            number: row.number,
            title: row.title,
            status: row.status,
            reopenStatus: row.reopenStatus,
            origin: row.origin,
            timer: row.timer,
            generated: row.generated,
            series: row.series,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            completedAt: row.completedAt,
          },
          contentUpdates: contentUpdates.map(({ k, u, f }) => ({ k, u, f })),
          timeEntries: deletedEntries,
          childIds,
          run: run?.workspaceId === this.ctx.workspaceId ? run : null,
        }
      }
    )
  }

  async restore(snapshot: DeletedActivity) {
    if (snapshot.row.workspaceId !== this.ctx.workspaceId) return false
    const updates = this.contentUpdatesTable()
    const restored = await this.db.transaction(
      "rw",
      [...this.routineTables(), updates],
      async () => {
        if (await this.byId(snapshot.row.id)) return false
        const parentId =
          snapshot.row.parentId !== null &&
          (await this.byId(snapshot.row.parentId))
            ? snapshot.row.parentId
            : null
        // A parent that was a leaf playing on its own is timed through what comes back under it.
        return this.routines().adopt(parentId === null ? [] : [parentId], () =>
          this.restoreRows(snapshot, parentId)
        )
      }
    )
    if (restored && snapshot.contentUpdates.length === 0) {
      await this.seedContent(snapshot.row.id, snapshot.row.title)
    }
    return restored
  }

  private async restoreRows(
    snapshot: DeletedActivity,
    parentId: string | null
  ) {
    const updates = this.contentUpdatesTable()
    await updates.where("k").equals(snapshot.row.id).delete()
    const fields = await this.types().fieldsByIds(
      Object.keys(snapshot.row.fields)
    )
    const typeId =
      snapshot.row.typeId !== null &&
      (await this.types().byId(snapshot.row.typeId))
        ? snapshot.row.typeId
        : null
    await this.db.activities.add({
      ...snapshot.row,
      parentId,
      typeId,
      fields: keepValidValues(fields, snapshot.row.fields),
    })
    await updates.bulkAdd(snapshot.contentUpdates)
    await this.db.timeEntries.bulkPut(snapshot.timeEntries)
    // Only children nobody has moved elsewhere since go back under it, and none that
    // became one of its ancestors meanwhile, which would close a loop.
    const ancestors = await this.ancestorIds(snapshot.row.id)
    const returning = await this.db.activities
      .where("id")
      .anyOf(snapshot.childIds)
      .filter(
        (row) =>
          row.workspaceId === this.ctx.workspaceId &&
          row.parentId === null &&
          !ancestors.has(row.id)
      )
      .primaryKeys()
    // Each played on its own meanwhile: a countdown that ran out there stopped there, and
    // mustn't hand over to a sibling once they're one routine again.
    for (const id of returning) await this.routines().catchUp(id)
    await this.db.activities
      .where("id")
      .anyOf(returning)
      .modify({ parentId: snapshot.row.id })
    if (snapshot.run && parentId === null) await this.restoreRun(snapshot.run)
    await this.routines().rejoin(returning)
    return true
  }

  // Only what is still in the routine comes back; a run row never points at activities
  // deleted or moved out meanwhile.
  private async restoreRun(run: RoutineRunRow) {
    if (await this.db.routineRuns.get(run.id)) return
    const inside = new Set([run.id, ...(await this.descendantIds(run.id))])
    const keep = (id: string) => inside.has(id)
    const pick = <T>(record: Record<string, T>) =>
      Object.fromEntries(Object.entries(record).filter(([id]) => keep(id)))
    await this.db.routineRuns.add({
      ...run,
      cursor: run.cursor !== null && keep(run.cursor) ? run.cursor : null,
      scopeId: run.scopeId !== null && keep(run.scopeId) ? run.scopeId : null,
      passed: run.passed.filter(keep),
      replay: run.replay.filter(keep),
      attemptFrom: pick(run.attemptFrom),
      joinedAt: pick(run.joinedAt),
    })
  }

  private async typeFields(typeId: string | null) {
    if (typeId === null) return []
    const type = await this.db.activityTypes.get(typeId)
    if (type?.workspaceId !== this.ctx.workspaceId) {
      throw new Error("The type for this activity does not exist.")
    }
    return this.types().fields(typeId)
  }

  private async valueFields(typeId: string | null, ids: string[]) {
    return this.withHeldFields(await this.typeFields(typeId), ids)
  }

  // The type's fields, then the other fields among `ids` that still exist, by name.
  private async withHeldFields(typeFields: ActivityFieldRow[], ids: string[]) {
    const onType = new Set(typeFields.map((field) => field.id))
    const others = await this.types().fieldsByIds(
      ids.filter((id) => !onType.has(id))
    )
    return [...typeFields, ...others.sort(byFieldName)]
  }

  private types() {
    return new ActivityTypesRepository(this.db, this.ctx)
  }

  private routines() {
    return new RoutinesRepository(this.db, this.ctx)
  }

  insertMany(activities: NewActivity[]) {
    return this.withTimeEntries(() =>
      this.routines().adopt(outsideParents(activities), () =>
        this.insertRows(activities)
      )
    )
  }

  insertRows(activities: NewActivity[]) {
    return this.db.transaction(
      "rw",
      [
        this.db.areas,
        this.db.activities,
        this.db.activityTypes,
        this.db.activityFields,
        this.db.activityTypeFields,
      ],
      async () => {
        const batchStart = parseUtc(now())
        const created: { id: string; key: string }[] = []
        for (const [index, activity] of activities.entries()) {
          // A millisecond apart, so lists sorted by creation keep the batch's order.
          const timestamp = addSeconds(batchStart, index / 1000)
          const area = await this.db.areas.get(activity.areaId)
          if (area?.workspaceId !== this.ctx.workspaceId) {
            throw new Error("The area for this activity does not exist.")
          }
          const parentId = activity.parentId ?? null
          if (parentId !== null && !(await this.byId(parentId))) {
            throw new InvalidParentError("That parent activity doesn't exist.")
          }
          const typeId = activity.typeId ?? null
          const values = activity.fields ?? {}
          const fields = parseFieldValues(
            await this.valueFields(typeId, Object.keys(values)),
            values
          )
          await this.db.areas.update(area.id, {
            nextNumber: area.nextNumber + 1,
          })
          await this.db.activities.add({
            id: activity.id,
            workspaceId: this.ctx.workspaceId,
            areaId: area.id,
            goalId: activity.goalId ?? null,
            parentId,
            typeId,
            fields,
            dueDate: requireDueDate(activity.dueDate ?? null),
            number: area.nextNumber,
            title: activity.title,
            status: activity.status,
            reopenStatus: isOpenStatus(activity.status)
              ? activity.status
              : "todo",
            origin: activity.origin,
            timer:
              activity.timer === undefined || activity.timer === null
                ? null
                : parseTimerConfig(activity.timer),
            generated: activity.generated ?? null,
            series: activity.series ?? false,
            createdAt: timestamp,
            updatedAt: timestamp,
            completedAt: activity.status === "done" ? timestamp : null,
          })
          created.push({
            id: activity.id,
            key: activityKey(area.key, area.nextNumber),
          })
        }
        return created
      }
    )
  }

  setStatus(id: string, status: ActivityStatus) {
    return this.routines().setStatus(id, status)
  }

  async toggleDone(id: string) {
    const row = await this.byId(id)
    if (!row) return
    await this.routines().setStatus(
      id,
      row.status === "done" ? row.reopenStatus : "done"
    )
  }

  moveToArea(id: string, areaId: string) {
    return this.db.transaction(
      "rw",
      this.db.areas,
      this.db.activities,
      async () => {
        const row = await this.byId(id)
        const area = await this.db.areas.get(areaId)
        if (!row || area?.workspaceId !== this.ctx.workspaceId) return
        if (row.areaId === areaId) return
        await this.db.areas.update(area.id, { nextNumber: area.nextNumber + 1 })
        await this.db.activities.update(id, {
          areaId,
          number: area.nextNumber,
          updatedAt: parseUtc(now()),
        })
      }
    )
  }

  // Numbered in their old order, so HOME-3 comes before HOME-14 in the new area too.
  moveAllToArea(fromAreaId: string, toAreaId: string) {
    return this.db.transaction(
      "rw",
      this.db.areas,
      this.db.activities,
      async () => {
        const into = await this.db.areas.get(toAreaId)
        if (into?.workspaceId !== this.ctx.workspaceId) {
          throw new Error("The area to move into doesn't exist.")
        }
        const rows = (
          await this.db.activities
            .where("workspaceId")
            .equals(this.ctx.workspaceId)
            .filter((row) => row.areaId === fromAreaId)
            .toArray()
        ).sort((a, b) => a.number - b.number)
        const timestamp = parseUtc(now())
        for (const [index, row] of rows.entries()) {
          await this.db.activities.update(row.id, {
            areaId: into.id,
            number: into.nextNumber + index,
            updatedAt: timestamp,
          })
        }
        await this.db.areas.update(into.id, {
          nextNumber: into.nextNumber + rows.length,
        })
        return rows.map((row) => row.id)
      }
    )
  }

  setTimer(id: string, timer: TimerConfig | null) {
    return this.routines().retime(async () => {
      await this.scoped(id).modify({
        timer: timer === null ? null : parseTimerConfig(timer),
        updatedAt: parseUtc(now()),
      })
    })
  }

  // Changes only the sound, so a countdown keeps its time. An activity with no timer of its
  // own takes its type's, so it's left alone rather than frozen with a copy of that timer;
  // a parent always counts up, so it can take a count-up of its own.
  async setSound(id: string, sound: TimerSound) {
    await this.db.transaction("rw", this.db.activities, async () => {
      const row = await this.byId(id)
      if (!row) return
      const isParent = (await this.children(id)).length > 0
      const timer: TimerConfig | null = row.timer
        ? { ...row.timer, sound }
        : isParent
          ? { mode: "up", sound }
          : null
      if (!timer) return
      await this.scoped(id).modify({
        timer: parseTimerConfig(timer),
        updatedAt: parseUtc(now()),
      })
    })
  }

  // Copies the activity and all its sub-activities, down the whole tree. Lines and
  // @-mentions in the copied bodies point at the copies. The copies start as To do
  // with no due date and no logged time; field values carry over as the plan.
  async duplicate(id: string) {
    const source = await this.byId(id)
    if (!source) return null
    const plans: CopyPlan[] = []
    // As in Linear, a copied sub-activity stays under the same parent.
    await this.planCopies(source, source.parentId, plans)
    const copyIds = new Map(plans.map((plan) => [plan.source.id, plan.copyId]))
    await contentWritesSettled(this.db, "activities")
    const contents = new Map<string, Uint8Array>()
    for (const plan of plans) {
      const content = await this.copiedContent(plan.source.id, copyIds)
      if (content) contents.set(plan.copyId, content)
    }
    const updates = this.contentUpdatesTable()
    const created = await this.db.transaction(
      "rw",
      [...this.routineTables(), this.db.mentions, updates],
      () =>
        this.routines().adopt(
          source.parentId === null ? [] : [source.parentId],
          async () => {
            const rows = await this.insertRows(
              plans.map(({ source: row, copyId, parentCopyId }) => {
                const copiedOrigin =
                  row.origin?.kind === "activity"
                    ? copyIds.get(row.origin.activityId)
                    : undefined
                return {
                  id: copyId,
                  areaId: row.areaId,
                  goalId: row.goalId,
                  parentId: parentCopyId,
                  typeId: row.typeId,
                  fields: row.fields,
                  dueDate: null,
                  title: row.title,
                  status: "todo" as const,
                  origin: copiedOrigin
                    ? {
                        kind: "activity" as const,
                        activityId: copiedOrigin,
                        blockId: row.origin?.blockId ?? null,
                      }
                    : null,
                  timer: row.timer,
                  generated: row.generated,
                  series: row.series,
                }
              })
            )
            await updates.bulkAdd(
              [...contents].map(([copyId, content]) => ({
                k: copyId,
                u: content,
              }))
            )
            await this.copyMentions(copyIds)
            return rows
          }
        )
    )
    await this.seedContents(
      plans
        .filter((plan) => !contents.has(plan.copyId))
        .map((plan) => ({ id: plan.copyId, title: plan.source.title }))
    )
    return created[0] ?? null
  }

  // Parents are planned before their children, so each copy's parent exists when it's inserted.
  private async planCopies(
    source: ActivityRow,
    parentCopyId: string | null,
    plans: CopyPlan[]
  ) {
    const copyId = crypto.randomUUID()
    plans.push({ source, copyId, parentCopyId })
    for (const child of await this.children(source.id)) {
      if (plans.some((plan) => plan.source.id === child.id)) continue
      await this.planCopies(child, copyId, plans)
    }
  }

  private async copiedContent(sourceId: string, copyIds: Map<string, string>) {
    const contentUpdates = await readContentUpdates(
      this.db,
      "activities",
      sourceId
    )
    if (contentUpdates.length === 0) return null
    const ydoc = new Y.Doc()
    try {
      // y-dexie stores V2 updates.
      for (const update of contentUpdates) Y.applyUpdateV2(ydoc, update.u)
      for (const element of elementsNamed(ydoc, "activity")) {
        const activityId = element.getAttribute("activityId")
        const copiedId =
          typeof activityId === "string" ? copyIds.get(activityId) : undefined
        if (copiedId) element.setAttribute("activityId", copiedId)
      }
      for (const element of elementsNamed(ydoc, "mention")) {
        const targetId = element.getAttribute("targetId")
        const copiedId =
          element.getAttribute("targetKind") === "activity" &&
          typeof targetId === "string"
            ? copyIds.get(targetId)
            : undefined
        if (copiedId) element.setAttribute("targetId", copiedId)
      }
      return Y.encodeStateAsUpdateV2(ydoc)
    } finally {
      ydoc.destroy()
    }
  }

  private async copyMentions(copyIds: Map<string, string>) {
    const copies: MentionRow[] = []
    for (const [sourceId, copyId] of copyIds) {
      const rows = await this.db.mentions
        .where("[workspaceId+sourceKey]")
        .equals([this.ctx.workspaceId, `activity:${sourceId}`])
        .toArray()
      for (const row of rows) {
        const [kind, targetId] = row.targetKey.split(":") as [string, string]
        const copiedTarget =
          kind === "activity" ? copyIds.get(targetId) : undefined
        const targetKey = copiedTarget
          ? (`activity:${copiedTarget}` as const)
          : row.targetKey
        const sourceKey = `activity:${copyId}` as const
        copies.push({
          id: `${sourceKey}>${targetKey}`,
          workspaceId: this.ctx.workspaceId,
          sourceKey,
          targetKey,
          blockId: row.blockId,
        })
      }
    }
    await this.db.mentions.bulkAdd(copies)
  }

  async setGoal(id: string, goalId: string | null) {
    await this.scoped(id).modify({ goalId, updatedAt: parseUtc(now()) })
  }

  async setDueDate(id: string, dueDate: string | null) {
    await this.scoped(id).modify({
      dueDate: requireDueDate(dueDate),
      updatedAt: parseUtc(now()),
    })
  }

  setFieldValue(id: string, fieldId: string, value: unknown) {
    return this.db.transaction(
      "rw",
      [
        this.db.activities,
        this.db.activityTypes,
        this.db.activityFields,
        this.db.activityTypeFields,
      ],
      async () => {
        const row = await this.byId(id)
        if (!row) return
        const fields = await this.valueFields(
          row.typeId,
          Object.keys(row.fields)
        )
        const field = fields.find((candidate) => candidate.id === fieldId)
        if (!field) {
          throw new Error(
            "This field isn't on the activity's type and holds no value."
          )
        }
        await this.db.activities.update(id, {
          fields: setFieldValue(row.fields, field, value),
          updatedAt: parseUtc(now()),
        })
      }
    )
  }

  // Values stay with the activity, including those for fields the new type doesn't have.
  changeType(id: string, typeId: string | null) {
    return this.routines().retime(async () => {
      const row = await this.byId(id)
      if (!row || row.typeId === typeId) return
      await this.typeFields(typeId)
      await this.db.activities.update(id, {
        typeId,
        updatedAt: parseUtc(now()),
      })
    })
  }

  listForGoal(goalId: string) {
    return this.db.activities
      .where("goalId")
      .equals(goalId)
      .filter((row) => row.workspaceId === this.ctx.workspaceId)
      .toArray()
  }

  async syncTitle(id: string, title: string) {
    await this.scoped(id)
      .filter((row) => row.title !== title && title !== "")
      .modify({ title, updatedAt: parseUtc(now()) })
  }

  async saveTitle(id: string, title: string) {
    await this.scoped(id).modify({ title, updatedAt: parseUtc(now()) })
  }
}

export { ActivitiesRepository, InvalidParentError, statusChange }
export type { ActivitiesContext, DeletedActivity, NewActivity, SeriesHolder }
