import { Dexie, type EntityTable } from "dexie"
import yDexie from "y-dexie"
import type * as Y from "yjs"
import {
  addSeconds,
  now,
  parseUtc,
  type UtcDatetime,
} from "@knight-os/server/core"
import type { StatusNames, TypeColor } from "@/activities/activity-types"
import type { AreaColor } from "@/activities/areas"
import type { FieldKind, FieldOption, FieldValues } from "@/activities/fields"
import { isOpenStatus, type ActivityStatus } from "@/activities/status"
import type { Recording } from "@/activities/routine"
import type { TimerConfig } from "@/activities/timer"
import type { GoalStatus } from "@/goals/status"
import type { OwnerKey } from "@/notebook/owners"
import { keyBetween, keysAfter } from "@/notebook/sort-keys"
import { DEFAULT_DOCUMENT_ICON } from "@/notebook/stored-icon"
import {
  attemptSeconds,
  attemptStarts,
  gapsIn,
  intervalChildren,
  lapGroups,
  legacyLength,
  loggedSeconds,
  stepsTotal,
  stoppedAt,
  upgradeTimer,
  upgradeTypeTimer,
  type LegacyEntry,
} from "./timer-migration"

// IndexedDB cannot index null, so top-level items point at this parent id.
const ROOT_FOLDER_ID = "root"

type DocumentRow = {
  id: string
  workspaceId: string
  title: string
  folderId: string
  sortKey: string
  icon: string | null
  excerpt: string
  createdAt: UtcDatetime
  updatedAt: UtcDatetime
  content: Y.Doc
}

type FolderRole = "plain" | "areas" | "goals" | "area-activities"

type FolderRow = {
  id: string
  workspaceId: string
  parentId: string
  name: string
  sortKey: string
  role: FolderRole
  ownerKey: OwnerKey | null
  followsOwner: boolean
  createdAt: UtcDatetime
  updatedAt: UtcDatetime
}

type AttachmentRow = {
  id: string
  workspaceId: string
  documentId: string
  ownerKey: OwnerKey
  createdAt: UtcDatetime
}

type MentionSourceKey = `${"document" | "activity" | "goal"}:${string}`
type MentionTargetKey = `${"document" | "activity"}:${string}`

type MentionRow = {
  id: string
  workspaceId: string
  sourceKey: MentionSourceKey
  targetKey: MentionTargetKey
  blockId: string | null
}

type AreaRow = {
  id: string
  workspaceId: string
  key: string
  name: string
  color: AreaColor
  nextNumber: number
  createdAt: UtcDatetime
}

type ActivityOrigin =
  | { kind: "document"; documentId: string; blockId: string | null }
  | { kind: "activity"; activityId: string; blockId: string | null }

// Generated sub-activities tick themselves done when the routine moves past them.
type GeneratedKind = "step" | "gap" | "lap"

type ActivityRow = {
  id: string
  workspaceId: string
  areaId: string
  goalId: string | null
  parentId: string | null
  typeId: string | null
  fields: FieldValues
  dueDate: string | null
  number: number
  title: string
  status: ActivityStatus
  reopenStatus: ActivityStatus
  origin: ActivityOrigin | null
  timer: TimerConfig | null
  generated: GeneratedKind | null
  series: boolean
  createdAt: UtcDatetime
  updatedAt: UtcDatetime
  completedAt: UtcDatetime | null
  content: Y.Doc
}

type TimeEntryRow = {
  id: string
  workspaceId: string
  activityId: string
  startedAt: UtcDatetime
  endedAt: UtcDatetime | null
} & (
  | { source: "timer"; recording: Recording }
  // The session may be days old, so when it was typed in decides which run it counts in.
  | { source: "manual"; endedAt: UtcDatetime; loggedAt: UtcDatetime }
)

// Keyed by the routine's top activity. Time and ticks live on the activities; this keeps
// only what the timer can't read back from them.
type RoutineRunRow = {
  id: string
  workspaceId: string
  cursor: string | null
  passed: string[]
  replay: string[]
  scopeId: string | null
  runStart: UtcDatetime | null
  attemptFrom: Record<string, UtcDatetime>
  joinedAt: Record<string, UtcDatetime>
  updatedAt: UtcDatetime
}

type ActivityTypeRow = {
  id: string
  workspaceId: string
  parentId: string | null
  name: string
  color: TypeColor
  icon: string | null
  statusNames: StatusNames
  timer: TimerConfig | null
  createdAt: UtcDatetime
  updatedAt: UtcDatetime
}

type ActivityFieldRow = {
  id: string
  workspaceId: string
  name: string
  kind: FieldKind
  options: FieldOption[]
  createdAt: UtcDatetime
  updatedAt: UtcDatetime
}

// Links a workspace field to a type; the type's subtypes inherit it.
type ActivityTypeFieldRow = {
  id: string
  workspaceId: string
  typeId: string
  fieldId: string
  sortKey: string
  createdAt: UtcDatetime
}

type GoalRow = {
  id: string
  workspaceId: string
  title: string
  status: GoalStatus
  targetMonth: string | null
  icon: string | null
  createdAt: UtcDatetime
  updatedAt: UtcDatetime
  content: Y.Doc
}

type LocalDb = Dexie & {
  documents: EntityTable<DocumentRow, "id">
  folders: EntityTable<FolderRow, "id">
  attachments: EntityTable<AttachmentRow, "id">
  mentions: EntityTable<MentionRow, "id">
  areas: EntityTable<AreaRow, "id">
  activities: EntityTable<ActivityRow, "id">
  activityTypes: EntityTable<ActivityTypeRow, "id">
  activityFields: EntityTable<ActivityFieldRow, "id">
  activityTypeFields: EntityTable<ActivityTypeFieldRow, "id">
  goals: EntityTable<GoalRow, "id">
  timeEntries: EntityTable<TimeEntryRow, "id">
  routineRuns: EntityTable<RoutineRunRow, "id">
}

const createLocalDb = (name: string): LocalDb => {
  const db = new Dexie(name, { addons: [yDexie] }) as LocalDb
  db.version(1).stores({
    documents: "id, workspaceId, [workspaceId+updatedAt], content: Y.Doc",
  })
  db.version(2).stores({
    areas: "id, workspaceId, [workspaceId+key]",
    activities:
      "id, workspaceId, areaId, [areaId+number], [workspaceId+updatedAt], content: Y.Doc",
  })
  db.version(3)
    .stores({
      documents:
        "id, workspaceId, [workspaceId+updatedAt], [workspaceId+folderId], [workspaceId+journalKey], content: Y.Doc",
      folders:
        "id, workspaceId, [workspaceId+parentId], [workspaceId+ownerKey]",
      attachments: "id, [workspaceId+documentId], [workspaceId+ownerKey]",
      mentions: "id, [workspaceId+sourceKey], [workspaceId+targetKey]",
      activities:
        "id, workspaceId, areaId, goalId, [areaId+number], [workspaceId+updatedAt], content: Y.Doc",
      goals: "id, workspaceId, [workspaceId+updatedAt], content: Y.Doc",
    })
    .upgrade(async (tx) => {
      const documents = tx.table<DocumentRow, string>("documents")
      const newestFirst = (await documents.toArray()).sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt)
      )
      const sortKeys = keysAfter(null, newestFirst.length)
      const keys = new Map(
        newestFirst.map((row, index) => [row.id, sortKeys[index]])
      )
      await documents.toCollection().modify((row) => {
        row.folderId = ROOT_FOLDER_ID
        row.sortKey = keys.get(row.id) ?? keyBetween(null, null)
        row.icon = null
        row.excerpt = ""
      })
      await tx
        .table("activities")
        .toCollection()
        .modify((row: Partial<ActivityRow>) => {
          row.goalId = null
        })
    })
  db.version(4)
    .stores({
      goals: "id, workspaceId, [workspaceId+updatedAt], content: Y.Doc",
    })
    .upgrade(async (tx) => {
      await tx
        .table<GoalRow, string>("goals")
        .toCollection()
        .modify((row) => {
          row.icon = null
        })
    })
  db.version(5)
    .stores({
      goals: "id, workspaceId, [workspaceId+updatedAt], content: Y.Doc",
    })
    .upgrade(async (tx) => {
      await tx
        .table<{ status: string }, string>("goals")
        .toCollection()
        .filter((row) => row.status === "active")
        .modify({ status: "current" })
    })
  db.version(6)
    .stores({
      activities:
        "id, workspaceId, areaId, goalId, typeId, [areaId+number], [workspaceId+updatedAt], content: Y.Doc",
      activityTypes: "id, workspaceId",
      activityTypeFields: "id, [workspaceId+typeId]",
    })
    .upgrade(async (tx) => {
      await tx
        .table<ActivityRow, string>("activities")
        .toCollection()
        .modify((row) => {
          row.typeId = null
          row.fields = {}
          row.dueDate = null
        })
    })
  db.version(7)
    .stores({
      documents:
        "id, workspaceId, [workspaceId+updatedAt], [workspaceId+folderId], [workspaceId+journalKey], content: Y.Doc",
    })
    .upgrade(async (tx) => {
      await tx
        .table<DocumentRow, string>("documents")
        .toCollection()
        .filter((row) => row.icon === null)
        .modify({ icon: DEFAULT_DOCUMENT_ICON })
    })
  // Journal folders and pages become ordinary notebook items, left where they are.
  db.version(8)
    .stores({
      documents:
        "id, workspaceId, [workspaceId+updatedAt], [workspaceId+folderId], content: Y.Doc",
    })
    .upgrade(async (tx) => {
      const journalRoles = [
        "journal",
        "journal-year",
        "journal-weeks",
        "journal-month",
      ]
      await tx
        .table<
          Omit<FolderRow, "role"> & { role: string; period?: string | null },
          string
        >("folders")
        .toCollection()
        .modify((row) => {
          if (journalRoles.includes(row.role)) row.role = "plain"
          delete row.period
        })
      await tx
        .table<
          DocumentRow & { journal?: unknown; journalKey?: unknown },
          string
        >("documents")
        .toCollection()
        .modify((row) => {
          delete row.journal
          delete row.journalKey
        })
    })
  db.version(9)
    .stores({
      timeEntries: "id, [workspaceId+activityId], [workspaceId+startedAt]",
    })
    .upgrade(async (tx) => {
      await tx
        .table<ActivityRow, string>("activities")
        .toCollection()
        .modify({ timer: null })
      await tx
        .table<ActivityTypeRow, string>("activityTypes")
        .toCollection()
        .modify({ timer: null })
    })
  db.version(10)
    .stores({
      activities:
        "id, workspaceId, areaId, goalId, typeId, parentId, [areaId+number], [workspaceId+updatedAt], content: Y.Doc",
    })
    .upgrade(async (tx) => {
      // Until now a sub-activity was one written in its parent's body. A parent
      // deleted since then, or in another workspace, leaves it without one.
      const activities = tx.table<ActivityRow, string>("activities")
      const workspaceOf = new Map(
        (await activities.toArray()).map((row) => [row.id, row.workspaceId])
      )
      await activities.toCollection().modify((row) => {
        const parentId =
          row.origin?.kind === "activity" ? row.origin.activityId : null
        row.parentId =
          parentId !== null && workspaceOf.get(parentId) === row.workspaceId
            ? parentId
            : null
      })
    })
  // Timers become up or down. Intervals and laps turn into generated sub-activities,
  // carrying the time already logged with them.
  db.version(11)
    .stores({
      routineRuns: "id, [workspaceId+updatedAt]",
    })
    .upgrade(async (tx) => {
      // Rows are added without content; it's seeded when the activity is first opened.
      const activities = tx.table<Omit<ActivityRow, "content">, string>(
        "activities"
      )
      const areas = tx.table<AreaRow, string>("areas")
      const entries = tx.table<TimeEntryRow & { endsLap?: boolean }, string>(
        "timeEntries"
      )
      const types = tx.table<ActivityTypeRow, string>("activityTypes")
      const typeTimers = new Map(
        (await types.toArray()).map((type) => [type.id, type.timer as unknown])
      )
      const rows = await activities.toArray()
      const allEntries = await entries.toArray()
      const timestamp = parseUtc(now())
      const parents = new Set(rows.flatMap((row) => row.parentId ?? []))
      let order = 0
      const addChild = async (
        parent: Pick<ActivityRow, "id" | "areaId" | "workspaceId">,
        child: {
          title: string
          timer: TimerConfig
          typeId: string | null
          generated: GeneratedKind | null
          series?: boolean
          done: boolean
        }
      ) => {
        const area = await areas.get(parent.areaId)
        if (!area) return null
        await areas.update(area.id, { nextNumber: area.nextNumber + 1 })
        // A millisecond apart, so lists sorted by creation keep this order.
        const createdAt = addSeconds(timestamp, order++ / 1000)
        const id = crypto.randomUUID()
        await activities.add({
          id,
          workspaceId: parent.workspaceId,
          areaId: parent.areaId,
          goalId: null,
          parentId: parent.id,
          typeId: child.typeId,
          fields: {},
          dueDate: null,
          number: area.nextNumber,
          title: child.title,
          status: child.done ? "done" : "todo",
          reopenStatus: "todo",
          origin: null,
          timer: child.timer,
          generated: child.generated,
          series: child.series ?? false,
          createdAt,
          updatedAt: createdAt,
          completedAt: child.done ? createdAt : null,
        })
        return id
      }
      for (const row of rows) {
        const own = row.timer as unknown
        const fromType = row.typeId ? typeTimers.get(row.typeId) : null
        const hasChildren = parents.has(row.id)
        // Its own sub-activities stay as they are: rounds from its own intervals go under a
        // series of their own beside them, and a type's intervals add none.
        const rounds = intervalChildren(hasChildren ? own : (own ?? fromType))
        const laps = lapGroups(
          allEntries.filter(
            (entry) => entry.activityId === row.id
          ) as LegacyEntry[]
        )
        const upgraded = upgradeTimer(row.timer)
        const sound = upgraded?.sound ?? rounds[0]?.timer.sound ?? "none"
        await activities.update(row.id, {
          timer:
            rounds.length > 0 || laps.length > 0
              ? { mode: "up", sound }
              : upgraded,
          generated: null,
          series: rounds.length > 0 && !hasChildren,
        })
        const seriesId =
          hasChildren && rounds.length > 0
            ? await addChild(row, {
                title: row.title,
                timer: { mode: "up", sound },
                typeId: null,
                generated: null,
                series: true,
                done: row.status === "done",
              })
            : row.id
        for (const round of rounds) {
          if (seriesId === null) break
          await addChild(
            { ...row, id: seriesId },
            {
              title: round.title,
              timer: round.timer,
              typeId: round.kind === "step" ? row.typeId : null,
              generated: round.kind,
              done: row.status === "done",
            }
          )
        }
        // A parent is timed through what's below it, so a timer left running on it stops
        // where its old countdown would have, or now for a count-up; its time so far stays on it.
        // A lapped countdown's open lap counts up once moved, so it stops where the countdown
        // would have; a lapped stopwatch keeps running on its open lap.
        const length = legacyLength(own ?? fromType)
        const stops =
          laps.length > 0 ? length !== null : hasChildren || rounds.length > 0
        if (stops) {
          const logged = loggedSeconds(
            allEntries.filter((entry) => entry.activityId === row.id)
          )
          await entries
            .where("[workspaceId+activityId]")
            .equals([row.workspaceId, row.id])
            .filter((entry) => entry.endedAt === null)
            .modify((entry) => {
              entry.endedAt = stoppedAt(
                entry.startedAt,
                length,
                logged,
                timestamp
              )
            })
        }
        for (const lap of laps) {
          const id = await addChild(row, {
            title: lap.title,
            timer: { mode: "up", sound: upgraded?.sound ?? "none" },
            typeId: row.typeId,
            generated: "lap",
            done: lap.ended,
          })
          if (id)
            await entries
              .where("id")
              .anyOf(lap.entryIds)
              .modify({ activityId: id })
        }
      }
      await entries.toCollection().modify((entry) => {
        entry.source = "timer"
        delete entry.endsLap
      })
      await types.toCollection().modify((row) => {
        row.timer = upgradeTypeTimer(row.timer)
      })
    })
  // For databases already on version 11: rests become explicit gaps, a timer still running on
  // a parent of generated steps stops, and runs that only recorded a tick are dropped.
  db.version(12).upgrade(async (tx) => {
    const activities = tx.table<Omit<ActivityRow, "content">, string>(
      "activities"
    )
    const rows = await activities.toArray()
    const generatedUnder = (parentId: string) =>
      rows
        .filter((row) => row.parentId === parentId && row.generated === "step")
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    for (const parent of rows.filter((row) => row.series)) {
      for (const id of gapsIn(generatedUnder(parent.id))) {
        await activities.update(id, { generated: "gap" })
      }
    }
    const timestamp = parseUtc(now())
    const parentsOfSteps = new Set(
      rows.flatMap((row) =>
        row.generated !== null && row.generated !== "lap" && row.parentId
          ? [row.parentId]
          : []
      )
    )
    const typeTimers = new Map(
      (await tx.table<ActivityTypeRow, string>("activityTypes").toArray()).map(
        (type) => [type.id, type.timer]
      )
    )
    // The rounds' countdowns stand in for the intervals timer v11 no longer has.
    const totalOf = (parentId: string) => {
      const children = rows.filter((row) => row.parentId === parentId)
      if (children.some((child) => child.generated === null)) return null
      return stepsTotal(
        children.map(
          (child) =>
            child.timer ??
            (child.typeId ? (typeTimers.get(child.typeId) ?? null) : null)
        )
      )
    }
    const runTable = tx.table<RoutineRunRow, string>("routineRuns")
    const attemptFrom = attemptStarts(rows, await runTable.toArray())
    const timeEntries = tx.table<TimeEntryRow, string>("timeEntries")
    const allEntries = await timeEntries.toArray()
    await timeEntries
      .filter(
        (entry) =>
          entry.endedAt === null && parentsOfSteps.has(entry.activityId)
      )
      .modify((entry) => {
        entry.endedAt = stoppedAt(
          entry.startedAt,
          totalOf(entry.activityId),
          attemptSeconds(
            allEntries,
            entry.activityId,
            attemptFrom(entry.activityId)
          ),
          timestamp
        )
      })
    await runTable
      .filter(
        (run) =>
          run.cursor === null &&
          run.passed.length === 0 &&
          run.runStart === null &&
          Object.keys(run.attemptFrom).length === 0
      )
      .delete()
  })
  db.version(13).upgrade(async (tx) => {
    await tx
      .table<RoutineRunRow, string>("routineRuns")
      .toCollection()
      .modify((run) => {
        run.joinedAt ??= {}
      })
  })
  // A parent is timed through what's below it, so a timer still running on one never ends by
  // itself. It stops where its own countdown would have stopped it, or now for a count-up.
  db.version(14).upgrade(async (tx) => {
    const rows = await tx
      .table<Omit<ActivityRow, "content">, string>("activities")
      .toArray()
    const byId = new Map(rows.map((row) => [row.id, row]))
    const parents = new Set(rows.flatMap((row) => row.parentId ?? []))
    const typeTimers = new Map(
      (await tx.table<ActivityTypeRow, string>("activityTypes").toArray()).map(
        (type) => [type.id, type.timer]
      )
    )
    const runTable = tx.table<RoutineRunRow, string>("routineRuns")
    await runTable.toCollection().modify((run) => {
      run.replay ??= []
    })
    const attemptFrom = attemptStarts(rows, await runTable.toArray())
    const timeEntries = tx.table<TimeEntryRow, string>("timeEntries")
    const allEntries = await timeEntries.toArray()
    const timestamp = parseUtc(now())
    await timeEntries
      .filter(
        (entry) => entry.endedAt === null && parents.has(entry.activityId)
      )
      .modify((entry) => {
        const row = byId.get(entry.activityId)
        const timer =
          row?.timer ??
          (row?.typeId ? (typeTimers.get(row.typeId) ?? null) : null)
        entry.endedAt = stoppedAt(
          entry.startedAt,
          timer?.mode === "down" ? timer.seconds : null,
          attemptSeconds(
            allEntries,
            entry.activityId,
            attemptFrom(entry.activityId)
          ),
          timestamp
        )
      })
  })
  // Timed time now waits until its activity is finished. Time still open waiting; time on an
  // activity closed, or inside a routine or group already closed, was kept when it closed,
  // unless a routine is still playing that activity, whose clock reads it.
  db.version(15).upgrade(async (tx) => {
    const playing = new Set(
      (await tx.table<RoutineRunRow, string>("routineRuns").toArray()).flatMap(
        (run) => run.cursor ?? []
      )
    )
    const rows = new Map(
      (
        await tx
          .table<Omit<ActivityRow, "content">, string>("activities")
          .toArray()
      ).map((row) => [row.id, row])
    )
    const closed = (id: string | null): boolean => {
      const row = id === null ? undefined : rows.get(id)
      return (
        row !== undefined && (!isOpenStatus(row.status) || closed(row.parentId))
      )
    }
    const kept = (id: string) => {
      const row = rows.get(id)
      if (!row) return false
      return (
        !isOpenStatus(row.status) || (!playing.has(id) && closed(row.parentId))
      )
    }
    await tx
      .table<TimeEntryRow, string>("timeEntries")
      .filter((entry) => entry.source === "timer")
      .modify((entry) => {
        if (entry.source !== "timer") return
        entry.recording =
          entry.endedAt !== null && kept(entry.activityId)
            ? "recorded"
            : "pending"
      })
  })
  // Fields move out of their type into the workspace's field library, keeping their ids so
  // the values activities hold stay attached.
  db.version(16)
    .stores({
      activityFields: "id, workspaceId",
      activityTypeFields:
        "id, [workspaceId+typeId], [workspaceId+fieldId], &[workspaceId+typeId+fieldId]",
    })
    .upgrade(async (tx) => {
      await tx
        .table<ActivityTypeRow, string>("activityTypes")
        .toCollection()
        .modify((row) => {
          row.parentId = null
        })
      type OldFieldRow = Omit<ActivityTypeFieldRow, "fieldId"> &
        Pick<ActivityFieldRow, "name" | "kind" | "options" | "updatedAt">
      const links = tx.table<ActivityTypeFieldRow, string>("activityTypeFields")
      const old = (await links.toArray()) as unknown as OldFieldRow[]
      await tx.table<ActivityFieldRow, string>("activityFields").bulkAdd(
        old.map((row) => ({
          id: row.id,
          workspaceId: row.workspaceId,
          name: row.name,
          kind: row.kind,
          options: row.options,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        }))
      )
      await links.bulkPut(
        old.map((row) => ({
          id: row.id,
          workspaceId: row.workspaceId,
          typeId: row.typeId,
          fieldId: row.id,
          sortKey: row.sortKey,
          createdAt: row.createdAt,
        }))
      )
    })
  return db
}

let browserDb: LocalDb | undefined

const getLocalDb = () => {
  browserDb ??= createLocalDb("knight-os")
  return browserDb
}

export { createLocalDb, getLocalDb, ROOT_FOLDER_ID }
export type {
  ActivityFieldRow,
  ActivityOrigin,
  ActivityRow,
  ActivityTypeFieldRow,
  ActivityTypeRow,
  AreaRow,
  AttachmentRow,
  DocumentRow,
  FolderRole,
  FolderRow,
  GoalRow,
  LocalDb,
  MentionRow,
  MentionSourceKey,
  MentionTargetKey,
  GeneratedKind,
  RoutineRunRow,
  TimeEntryRow,
}
