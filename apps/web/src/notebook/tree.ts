import type { DocumentRow, FolderRole, FolderRow } from "@/local-db/db"
import { ROOT_FOLDER_ID } from "@/local-db/db"
import type { OwnerKey } from "./owners"

type TreeFolder = Pick<
  FolderRow,
  "id" | "parentId" | "name" | "sortKey" | "role" | "period" | "ownerKey"
>

type TreeDocument = Pick<
  DocumentRow,
  "id" | "folderId" | "title" | "sortKey" | "icon" | "journal"
>

type TreeNode<F extends TreeFolder, D extends TreeDocument> =
  | { kind: "folder"; folder: F; children: TreeNode<F, D>[] }
  | { kind: "document"; document: D }

const JOURNAL_ROLES: FolderRole[] = [
  "journal",
  "journal-year",
  "journal-weeks",
  "journal-month",
]

const isJournalFolder = (role: FolderRole) => JOURNAL_ROLES.includes(role)

// Journal folders sort newest first, with the year page and Weeks above the months.
const journalRank = <F extends TreeFolder, D extends TreeDocument>(
  node: TreeNode<F, D>
) => {
  if (node.kind === "document") {
    return node.document.journal?.period === "year" ? 0 : 3
  }
  return node.folder.role === "journal-weeks" ? 1 : 2
}

const journalSortValue = <F extends TreeFolder, D extends TreeDocument>(
  node: TreeNode<F, D>
) =>
  node.kind === "folder"
    ? (node.folder.period ?? node.folder.name)
    : (node.document.journal?.key ?? node.document.title)

const compareNodes =
  (parentRole: FolderRole | null) =>
  <F extends TreeFolder, D extends TreeDocument>(
    a: TreeNode<F, D>,
    b: TreeNode<F, D>
  ) => {
    if (parentRole && isJournalFolder(parentRole)) {
      const rank = journalRank(a) - journalRank(b)
      if (rank !== 0) return rank
      return journalSortValue(b).localeCompare(journalSortValue(a))
    }
    if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1
    const keyA = a.kind === "folder" ? a.folder.sortKey : a.document.sortKey
    const keyB = b.kind === "folder" ? b.folder.sortKey : b.document.sortKey
    if (keyA !== keyB) return keyA < keyB ? -1 : 1
    const nameA = a.kind === "folder" ? a.folder.name : a.document.title
    const nameB = b.kind === "folder" ? b.folder.name : b.document.title
    return nameA.localeCompare(nameB)
  }

const buildTree = <F extends TreeFolder, D extends TreeDocument>(
  folders: F[],
  documents: D[]
) => {
  const childrenOf = new Map<string, TreeNode<F, D>[]>()
  const push = (parentId: string, node: TreeNode<F, D>) => {
    const siblings = childrenOf.get(parentId) ?? []
    siblings.push(node)
    childrenOf.set(parentId, siblings)
  }
  const folderIds = new Set(folders.map((folder) => folder.id))
  const nodes = new Map<string, TreeNode<F, D> & { kind: "folder" }>()
  for (const folder of folders) {
    const node = { kind: "folder" as const, folder, children: [] }
    nodes.set(folder.id, node)
    push(
      folderIds.has(folder.parentId) ? folder.parentId : ROOT_FOLDER_ID,
      node
    )
  }
  for (const document of documents) {
    push(
      folderIds.has(document.folderId) ? document.folderId : ROOT_FOLDER_ID,
      { kind: "document", document }
    )
  }
  for (const [parentId, siblings] of childrenOf) {
    const parentRole = nodes.get(parentId)?.folder.role ?? null
    siblings.sort(compareNodes(parentRole))
    const parent = nodes.get(parentId)
    if (parent) parent.children = siblings
  }
  return childrenOf.get(ROOT_FOLDER_ID) ?? []
}

const foldersInTreeOrder = <F extends TreeFolder>(folders: F[]) => {
  const ordered: { folder: F; depth: number }[] = []
  const walk = (nodes: TreeNode<F, TreeDocument>[], depth: number) => {
    for (const node of nodes) {
      if (node.kind !== "folder") continue
      ordered.push({ folder: node.folder, depth })
      walk(node.children, depth + 1)
    }
  }
  walk(buildTree<F, TreeDocument>(folders, []), 0)
  return ordered
}

const indexFolders = <F extends TreeFolder>(folders: F[]) =>
  new Map(folders.map((folder) => [folder.id, folder]))

const pathTo = <F extends TreeFolder>(
  folderId: string,
  byId: Map<string, F>
) => {
  const path: F[] = []
  const seen = new Set<string>()
  let current = byId.get(folderId)
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    path.unshift(current)
    current = byId.get(current.parentId)
  }
  return path
}

const isSameOrInside = <F extends TreeFolder>(
  folderId: string,
  ancestorId: string,
  byId: Map<string, F>
) => pathTo(folderId, byId).some((folder) => folder.id === ancestorId)

const canMoveFolder = <F extends TreeFolder>(
  folderId: string,
  targetParentId: string,
  byId: Map<string, F>
) =>
  targetParentId === ROOT_FOLDER_ID ||
  !isSameOrInside(targetParentId, folderId, byId)

// A folder another entity uses belongs to that entity, so it ends the walk.
const ownerOfFolder = <F extends TreeFolder>(
  folderId: string,
  byId: Map<string, F>
): OwnerKey | null => {
  const path = pathTo(folderId, byId)
  for (let index = path.length - 1; index >= 0; index--) {
    const owner = path[index].ownerKey
    if (owner) return owner
  }
  return null
}

const subtreeFolderIds = <F extends TreeFolder>(
  rootId: string,
  folders: F[],
  options: { stopAtOtherOwners?: boolean } = {}
) => {
  const children = new Map<string, F[]>()
  for (const folder of folders) {
    const siblings = children.get(folder.parentId) ?? []
    siblings.push(folder)
    children.set(folder.parentId, siblings)
  }
  const ids = [rootId]
  for (let index = 0; index < ids.length; index++) {
    for (const child of children.get(ids[index]) ?? []) {
      if (options.stopAtOtherOwners && child.ownerKey) continue
      ids.push(child.id)
    }
  }
  return ids
}

export {
  buildTree,
  canMoveFolder,
  foldersInTreeOrder,
  indexFolders,
  isJournalFolder,
  isSameOrInside,
  ownerOfFolder,
  pathTo,
  subtreeFolderIds,
}
export type { TreeDocument, TreeFolder, TreeNode }
