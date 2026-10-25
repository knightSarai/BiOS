import { Dexie, type EntityTable } from "dexie"
import yDexie from "y-dexie"
import type * as Y from "yjs"
import type { UtcDatetime } from "@knight-os/server/core"

type DocumentRow = {
  id: string
  workspaceId: string
  title: string
  createdAt: UtcDatetime
  updatedAt: UtcDatetime
  content: Y.Doc
}

type LocalDb = Dexie & {
  documents: EntityTable<DocumentRow, "id">
}

const createLocalDb = (name: string): LocalDb => {
  const db = new Dexie(name, { addons: [yDexie] }) as LocalDb
  db.version(1).stores({
    documents: "id, workspaceId, [workspaceId+updatedAt], content: Y.Doc",
  })
  return db
}

let browserDb: LocalDb | undefined

const getLocalDb = () => {
  browserDb ??= createLocalDb("knight-os")
  return browserDb
}

export { createLocalDb, getLocalDb }
export type { DocumentRow, LocalDb }
