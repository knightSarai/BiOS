import { now, parseUtc } from "@knight-os/server/core"
import { titledContentUpdate } from "@/editor/document-content"
import { keyBetween } from "@/notebook/sort-keys"
import { DEFAULT_DOCUMENT_ICON } from "@/notebook/stored-icon"
import { ROOT_FOLDER_ID, type LocalDb } from "./db"
import {
  deleteDocumentsWithin,
  restoreDocuments,
  type DeletedDocuments,
} from "./document-snapshots"
import {
  contentUpdatesTable,
  readContentUpdates,
  replaceTitleInContent,
  seedContentWithTitle,
} from "./y-content"

type DocumentsContext = {
  workspaceId: string
}

type NewDocument = {
  folderId?: string
  title?: string
}

type DocumentContent = {
  title: string
  excerpt: string
}

class DocumentsRepository {
  constructor(
    private readonly db: LocalDb,
    private readonly ctx: DocumentsContext
  ) {}

  private scoped(id: string) {
    return this.db.documents
      .where("id")
      .equals(id)
      .filter((row) => row.workspaceId === this.ctx.workspaceId)
  }

  list() {
    return this.db.documents
      .where("[workspaceId+updatedAt]")
      .between([this.ctx.workspaceId, ""], [this.ctx.workspaceId, "￿"])
      .reverse()
      .toArray()
  }

  async byId(id: string) {
    const row = await this.db.documents.get(id)
    return row?.workspaceId === this.ctx.workspaceId ? row : null
  }

  inFolder(folderId: string) {
    return this.db.documents
      .where("[workspaceId+folderId]")
      .equals([this.ctx.workspaceId, folderId])
      .toArray()
  }

  async inFolders(folderIds: string[]) {
    const rows = await Promise.all(folderIds.map((id) => this.inFolder(id)))
    return rows.flat()
  }

  async lastSortKey(folderId: string) {
    const rows = await this.inFolder(folderId)
    return rows.reduce<string | null>(
      (last, row) => (last === null || row.sortKey > last ? row.sortKey : last),
      null
    )
  }

  private async insert(document: NewDocument) {
    const folderId = document.folderId ?? ROOT_FOLDER_ID
    const timestamp = parseUtc(now())
    const id = crypto.randomUUID()
    await this.db.documents.add({
      id,
      workspaceId: this.ctx.workspaceId,
      title: document.title ?? "",
      folderId,
      sortKey: keyBetween(await this.lastSortKey(folderId), null),
      icon: DEFAULT_DOCUMENT_ICON,
      excerpt: "",
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    return id
  }

  private async seedTitle(id: string, title: string) {
    const row = await this.byId(id)
    if (row && title) {
      await seedContentWithTitle(this.db, "documents", row.content, title)
    }
  }

  async create(document: NewDocument = {}) {
    const id = await this.db.transaction("rw", this.db.documents, () =>
      this.insert(document)
    )
    await this.seedTitle(id, document.title ?? "")
    return id
  }

  // The lookup, the row and its titled content share one transaction, so a
  // second tab opening Today lands on the same page and never sees it untitled.
  async findOrCreateInFolder(folderId: string, title: string) {
    const updates = contentUpdatesTable(this.db, "documents")
    return this.db.transaction("rw", this.db.documents, updates, async () => {
      const existing = (await this.inFolder(folderId)).find(
        (row) => row.title === title
      )
      if (existing) return existing.id
      const id = await this.insert({ folderId, title })
      await updates.add({ k: id, u: titledContentUpdate(title), f: 1 })
      return id
    })
  }

  async syncTitle(id: string, title: string) {
    await this.scoped(id)
      .filter((row) => row.title !== title)
      .modify({ title, updatedAt: parseUtc(now()) })
  }

  async rename(id: string, title: string) {
    const row = await this.byId(id)
    if (!row) return
    const trimmed = title.trim()
    await replaceTitleInContent(this.db, "documents", row.content, trimmed)
    await this.scoped(id).modify({ title: trimmed, updatedAt: parseUtc(now()) })
  }

  async saveContent(id: string, content: DocumentContent) {
    await this.scoped(id).modify({ ...content, updatedAt: parseUtc(now()) })
  }

  async move(id: string, folderId: string, sortKey?: string) {
    const key = sortKey ?? keyBetween(await this.lastSortKey(folderId), null)
    await this.scoped(id).modify({
      folderId,
      sortKey: key,
      updatedAt: parseUtc(now()),
    })
  }

  async setIcon(id: string, icon: string | null) {
    await this.scoped(id).modify({ icon, updatedAt: parseUtc(now()) })
  }

  async duplicate(id: string) {
    const source = await this.byId(id)
    if (!source) return null
    const updates = contentUpdatesTable(this.db, "documents")
    const contentUpdates = await readContentUpdates(this.db, "documents", id)
    const siblings = (await this.inFolder(source.folderId))
      .map((row) => row.sortKey)
      .filter((key) => key > source.sortKey)
      .sort()
    const copyId = crypto.randomUUID()
    const timestamp = parseUtc(now())
    await this.db.transaction("rw", this.db.documents, updates, async () => {
      await this.db.documents.add({
        id: copyId,
        workspaceId: this.ctx.workspaceId,
        title: source.title,
        folderId: source.folderId,
        sortKey: keyBetween(source.sortKey, siblings[0] ?? null),
        icon: source.icon,
        excerpt: source.excerpt,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      await updates.bulkAdd(
        contentUpdates.map((update) => ({ ...update, k: copyId }))
      )
    })
    return copyId
  }

  delete(id: string): Promise<DeletedDocuments | null> {
    return deleteDocumentsWithin(this.db, this.ctx.workspaceId, [id])
  }

  restore(snapshot: DeletedDocuments) {
    return restoreDocuments(this.db, this.ctx.workspaceId, snapshot)
  }
}

export { DocumentsRepository }
export type { DocumentContent, DocumentsContext, NewDocument }
