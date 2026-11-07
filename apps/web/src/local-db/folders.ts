import { now, parseUtc } from "@knight-os/server/core"
import type { OwnerKey } from "@/notebook/owners"
import { keyBetween } from "@/notebook/sort-keys"
import { canMoveFolder, indexFolders, subtreeFolderIds } from "@/notebook/tree"
import { ROOT_FOLDER_ID, type FolderRole, type LocalDb } from "./db"
import {
  deleteDocumentsWithin,
  restoreDocuments,
  type DeletedDocuments,
} from "./document-snapshots"

type FoldersContext = {
  workspaceId: string
}

type NewFolder = {
  parentId?: string
  name: string
  role?: FolderRole
  ownerKey?: OwnerKey | null
}

class FolderLoopError extends Error {}

class FoldersRepository {
  constructor(
    private readonly db: LocalDb,
    private readonly ctx: FoldersContext
  ) {}

  private scoped(id: string) {
    return this.db.folders
      .where("id")
      .equals(id)
      .filter((row) => row.workspaceId === this.ctx.workspaceId)
  }

  list() {
    return this.db.folders
      .where("workspaceId")
      .equals(this.ctx.workspaceId)
      .toArray()
  }

  async byId(id: string) {
    const row = await this.db.folders.get(id)
    return row?.workspaceId === this.ctx.workspaceId ? row : null
  }

  children(parentId: string) {
    return this.db.folders
      .where("[workspaceId+parentId]")
      .equals([this.ctx.workspaceId, parentId])
      .toArray()
  }

  async byOwner(ownerKey: OwnerKey) {
    const row = await this.db.folders
      .where("[workspaceId+ownerKey]")
      .equals([this.ctx.workspaceId, ownerKey])
      .first()
    return row ?? null
  }

  async findChild(parentId: string, role: FolderRole) {
    const children = await this.children(parentId)
    return children.find((row) => row.role === role) ?? null
  }

  // IndexedDB runs read-write transactions on the same store one at a time,
  // also across tabs, so two callers can't both miss and create the folder.
  findOrCreateChild(
    parentId: string,
    spec: { role: FolderRole; name: string }
  ) {
    return this.db.transaction("rw", this.db.folders, async () => {
      const existing = await this.findChild(parentId, spec.role)
      return existing ?? this.create({ parentId, ...spec })
    })
  }

  findOrCreatePlainChild(parentId: string, name: string) {
    return this.db.transaction("rw", this.db.folders, async () => {
      const children = await this.children(parentId)
      const existing = children.find(
        (row) => row.role === "plain" && row.name === name
      )
      return existing ?? this.create({ parentId, name })
    })
  }

  findOrCreateOwned(
    ownerKey: OwnerKey,
    folder: { parentId: string; name: string }
  ) {
    return this.db.transaction("rw", this.db.folders, async () => {
      const existing = await this.byOwner(ownerKey)
      return existing ?? this.create({ ...folder, ownerKey })
    })
  }

  private async lastSortKey(parentId: string) {
    const children = await this.children(parentId)
    return children.reduce<string | null>(
      (last, row) => (last === null || row.sortKey > last ? row.sortKey : last),
      null
    )
  }

  async create(folder: NewFolder) {
    const parentId = folder.parentId ?? ROOT_FOLDER_ID
    const timestamp = parseUtc(now())
    const row = {
      id: crypto.randomUUID(),
      workspaceId: this.ctx.workspaceId,
      parentId,
      name: folder.name.trim() || "Untitled folder",
      sortKey: keyBetween(await this.lastSortKey(parentId), null),
      role: folder.role ?? "plain",
      ownerKey: folder.ownerKey ?? null,
      followsOwner: Boolean(folder.ownerKey),
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    await this.db.folders.add(row)
    return row
  }

  async rename(id: string, name: string, options: { byOwner?: boolean } = {}) {
    const trimmed = name.trim()
    if (!trimmed) return
    await this.scoped(id).modify((row) => {
      row.name = trimmed
      row.updatedAt = parseUtc(now())
      if (!options.byOwner) row.followsOwner = false
    })
  }

  async move(
    id: string,
    parentId: string,
    options: { sortKey?: string; byOwner?: boolean } = {}
  ) {
    const folders = await this.list()
    if (!canMoveFolder(id, parentId, indexFolders(folders))) {
      throw new FolderLoopError("A folder can't go inside itself.")
    }
    const sortKey =
      options.sortKey ?? keyBetween(await this.lastSortKey(parentId), null)
    await this.scoped(id).modify((row) => {
      if (!options.byOwner && row.parentId !== parentId) {
        row.followsOwner = false
      }
      row.parentId = parentId
      row.sortKey = sortKey
      row.updatedAt = parseUtc(now())
    })
  }

  async place(
    id: string,
    placement: { parentId: string; sortKey: string; followsOwner: boolean }
  ) {
    await this.scoped(id).modify({ ...placement, updatedAt: parseUtc(now()) })
  }

  async reorder(id: string, sortKey: string) {
    await this.scoped(id).modify({ sortKey, updatedAt: parseUtc(now()) })
  }

  async delete(id: string): Promise<DeletedDocuments | null> {
    const folders = await this.list()
    if (!folders.some((row) => row.id === id)) return null
    const folderIds = subtreeFolderIds(id, folders)
    const documents = await Promise.all(
      folderIds.map((folderId) =>
        this.db.documents
          .where("[workspaceId+folderId]")
          .equals([this.ctx.workspaceId, folderId])
          .primaryKeys()
      )
    )
    return deleteDocumentsWithin(
      this.db,
      this.ctx.workspaceId,
      documents.flat(),
      folderIds
    )
  }

  restore(snapshot: DeletedDocuments) {
    return restoreDocuments(this.db, this.ctx.workspaceId, snapshot)
  }
}

export { FolderLoopError, FoldersRepository }
export type { FoldersContext, NewFolder }
