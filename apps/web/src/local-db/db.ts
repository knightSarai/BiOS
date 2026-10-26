import { Dexie, type EntityTable } from "dexie"
import yDexie from "y-dexie"
import type * as Y from "yjs"
import type { UtcDatetime } from "@knight-os/server/core"
import type { AreaColor } from "@/activities/areas"
import type { ActivityStatus } from "@/activities/status"

type DocumentRow = {
  id: string
  workspaceId: string
  title: string
  createdAt: UtcDatetime
  updatedAt: UtcDatetime
  content: Y.Doc
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

type LocalDb = Dexie & {
  documents: EntityTable<DocumentRow, "id">
  areas: EntityTable<AreaRow, "id">
  activities: EntityTable<ActivityRow, "id">
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
  return db
}

let browserDb: LocalDb | undefined

const getLocalDb = () => {
  browserDb ??= createLocalDb("knight-os")
  return browserDb
}

export { createLocalDb, getLocalDb }
export type { ActivityOrigin, ActivityRow, AreaRow, DocumentRow, LocalDb }
