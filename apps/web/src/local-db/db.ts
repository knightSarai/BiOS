import { Dexie, type EntityTable } from "dexie"
import yDexie from "y-dexie"
import type * as Y from "yjs"
import type { UtcDatetime } from "@knight-os/server/core"
import type { StatusNames, TypeColor } from "@/activities/activity-types"
import type { AreaColor } from "@/activities/areas"
import type { FieldKind, FieldOption, FieldValues } from "@/activities/fields"
import type { ActivityStatus } from "@/activities/status"
import type { GoalStatus } from "@/goals/status"
import type { JournalFolderRole, JournalRef } from "@/journal/periods"
import type { OwnerKey } from "@/notebook/owners"
import { keyBetween, keysAfter } from "@/notebook/sort-keys"
import { DEFAULT_DOCUMENT_ICON } from "@/notebook/stored-icon"

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
  journal: JournalRef | null
  journalKey: string | null
  createdAt: UtcDatetime
  updatedAt: UtcDatetime
  content: Y.Doc
}

type FolderRole =
  "plain" | "areas" | "goals" | "area-activities" | JournalFolderRole

type FolderRow = {
  id: string
  workspaceId: string
  parentId: string
  name: string
  sortKey: string
  role: FolderRole
  period: string | null
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

type ActivityRow = {
  id: string
  workspaceId: string
  areaId: string
  goalId: string | null
  typeId: string | null
  fields: FieldValues
  dueDate: string | null
  number: number
  title: string
  status: ActivityStatus
  reopenStatus: ActivityStatus
  origin: ActivityOrigin | null
  createdAt: UtcDatetime
  updatedAt: UtcDatetime
  completedAt: UtcDatetime | null
  content: Y.Doc
}

type ActivityTypeRow = {
  id: string
  workspaceId: string
  name: string
  color: TypeColor
  icon: string | null
  statusNames: StatusNames
  createdAt: UtcDatetime
  updatedAt: UtcDatetime
}

type ActivityTypeFieldRow = {
  id: string
  workspaceId: string
  typeId: string
  name: string
  kind: FieldKind
  options: FieldOption[]
  sortKey: string
  createdAt: UtcDatetime
  updatedAt: UtcDatetime
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
  activityTypeFields: EntityTable<ActivityTypeFieldRow, "id">
  goals: EntityTable<GoalRow, "id">
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
        row.journal = null
        row.journalKey = null
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
  return db
}

let browserDb: LocalDb | undefined

const getLocalDb = () => {
  browserDb ??= createLocalDb("knight-os")
  return browserDb
}

export { createLocalDb, getLocalDb, ROOT_FOLDER_ID }
export type {
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
}
