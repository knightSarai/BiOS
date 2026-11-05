import { DexieYProvider, type YUpdateRow } from "y-dexie"
import * as Y from "yjs"
import {
  DOCUMENT_FRAGMENT,
  seedDocument,
  seedDocumentNotes,
  seedDocumentWithTitle,
} from "@/editor/document-content"
import type { LocalDb } from "./db"

type ContentTableName = "documents" | "activities" | "goals"

type ContentUpdate = Omit<YUpdateRow, "i">

const contentUpdatesTable = (db: LocalDb, tableName: ContentTableName) => {
  const name = db
    .table(tableName)
    .schema.yProps?.find((yProp) => yProp.prop === "content")?.updatesTable
  if (!name) throw new Error(`${tableName} have no content updates table.`)
  return db.table<YUpdateRow, number, ContentUpdate>(name)
}

// IndexedDB runs transactions on one store in order, so this read only
// finishes after the update y-dexie just queued has been written.
const contentWritesSettled = async (
  db: LocalDb,
  tableName: ContentTableName
) => {
  await contentUpdatesTable(db, tableName).count()
}

const seedContentWithTitle = async (
  db: LocalDb,
  tableName: ContentTableName,
  content: Y.Doc,
  title: string,
  notes = ""
) => {
  const provider = DexieYProvider.load(content)
  try {
    await provider.whenLoaded
    seedDocumentWithTitle(content, title)
    seedDocumentNotes(content, notes)
    await contentWritesSettled(db, tableName)
  } finally {
    DexieYProvider.release(content)
  }
}

// An open editor shares this Y.Doc, so the new title shows up there too.
const replaceTitleInContent = async (
  db: LocalDb,
  tableName: ContentTableName,
  content: Y.Doc,
  title: string
) => {
  const provider = DexieYProvider.load(content)
  try {
    await provider.whenLoaded
    seedDocument(content)
    const titleElement = content.getXmlFragment(DOCUMENT_FRAGMENT).get(0)
    if (!(titleElement instanceof Y.XmlElement)) return
    content.transact(() => {
      titleElement.delete(0, titleElement.length)
      if (title) titleElement.insert(0, [new Y.XmlText(title)])
    })
    await contentWritesSettled(db, tableName)
  } finally {
    DexieYProvider.release(content)
  }
}

const readContentUpdates = async (
  db: LocalDb,
  tableName: ContentTableName,
  id: string
): Promise<ContentUpdate[]> => {
  const rows = await contentUpdatesTable(db, tableName)
    .where("k")
    .equals(id)
    .toArray()
  return rows.map(({ k, u, f }) => ({ k, u, f }))
}

export {
  contentUpdatesTable,
  readContentUpdates,
  replaceTitleInContent,
  seedContentWithTitle,
}
export type { ContentTableName, ContentUpdate }
