import { describe, expect, it } from "vitest"
import type { FolderRole } from "@/local-db/db"
import type { JournalRef } from "@/journal/periods"
import type { OwnerKey } from "./owners"
import {
  buildTree,
  canMoveFolder,
  foldersInTreeOrder,
  indexFolders,
  ownerOfFolder,
  pathTo,
  subtreeFolderIds,
  type TreeNode,
} from "./tree"

type Folder = {
  id: string
  parentId: string
  name: string
  sortKey: string
  role: FolderRole
  period: string | null
  ownerKey: OwnerKey | null
}

type Doc = {
  id: string
  folderId: string
  title: string
  sortKey: string
  icon: string | null
  journal: JournalRef | null
}

const folder = (
  id: string,
  parentId: string,
  extra: Partial<Folder> = {}
): Folder => ({
  id,
  parentId,
  name: id,
  sortKey: "V",
  role: "plain",
  period: null,
  ownerKey: null,
  ...extra,
})

const doc = (id: string, folderId: string, extra: Partial<Doc> = {}): Doc => ({
  id,
  folderId,
  title: id,
  sortKey: "V",
  icon: null,
  journal: null,
  ...extra,
})

const labels = (nodes: TreeNode<Folder, Doc>[]): unknown[] =>
  nodes.map((node) =>
    node.kind === "folder"
      ? { [node.folder.name]: labels(node.children) }
      : node.document.title
  )

const folders = [
  folder("areas", "root", { role: "areas", sortKey: "A" }),
  folder("health", "areas", { ownerKey: "area:h" }),
  folder("activities", "health", { role: "area-activities" }),
  folder("hlt32", "activities", { ownerKey: "activity:a32" }),
  folder("notes", "hlt32"),
  folder("knowledge", "root", { sortKey: "K" }),
]

describe("buildTree", () => {
  it("nests folders and documents, folders first, by sort key", () => {
    const tree = buildTree(folders, [
      doc("b", "root", { sortKey: "b" }),
      doc("a", "root", { sortKey: "a" }),
      doc("gym", "hlt32"),
    ])
    expect(labels(tree)).toEqual([
      {
        areas: [
          { health: [{ activities: [{ hlt32: [{ notes: [] }, "gym"] }] }] },
        ],
      },
      { knowledge: [] },
      "a",
      "b",
    ])
  })

  it("puts orphans at the top level", () => {
    expect(labels(buildTree([], [doc("lost", "gone")]))).toEqual(["lost"])
  })

  it("sorts journal folders newest first with the year page and Weeks on top", () => {
    const journalFolders = [
      folder("journal", "root", { role: "journal" }),
      folder("2026", "journal", { role: "journal-year", period: "2026" }),
      folder("oct", "2026", { role: "journal-month", period: "2026-10" }),
      folder("nov", "2026", { role: "journal-month", period: "2026-11" }),
      folder("weeks", "2026", { role: "journal-weeks", period: "2026" }),
    ]
    const tree = buildTree(journalFolders, [
      doc("Year 2026", "2026", {
        journal: { period: "year", key: "2026", date: "2026-01-01" },
      }),
      doc("Sat 31 Oct", "oct", {
        journal: { period: "day", key: "2026-10-31", date: "2026-10-31" },
      }),
      doc("Fri 30 Oct", "oct", {
        journal: { period: "day", key: "2026-10-30", date: "2026-10-30" },
      }),
    ])
    expect(labels(tree)).toEqual([
      {
        journal: [
          {
            "2026": [
              "Year 2026",
              { weeks: [] },
              { nov: [] },
              { oct: ["Sat 31 Oct", "Fri 30 Oct"] },
            ],
          },
        ],
      },
    ])
  })
})

describe("foldersInTreeOrder", () => {
  it("lists every folder right after its parent, in sidebar order", () => {
    const shuffled = [...folders].reverse()
    expect(
      foldersInTreeOrder(shuffled).map(
        ({ folder, depth }) => `${depth}:${folder.id}`
      )
    ).toEqual([
      "0:areas",
      "1:health",
      "2:activities",
      "3:hlt32",
      "4:notes",
      "0:knowledge",
    ])
  })
})

describe("paths and ownership", () => {
  const byId = indexFolders(folders)

  it("builds the path from the top", () => {
    expect(pathTo("notes", byId).map((f) => f.id)).toEqual([
      "areas",
      "health",
      "activities",
      "hlt32",
      "notes",
    ])
  })

  it("finds the nearest entity that uses a folder", () => {
    expect(ownerOfFolder("notes", byId)).toBe("activity:a32")
    expect(ownerOfFolder("activities", byId)).toBe("area:h")
    expect(ownerOfFolder("knowledge", byId)).toBeNull()
  })

  it("refuses to move a folder into itself or its children", () => {
    expect(canMoveFolder("health", "notes", byId)).toBe(false)
    expect(canMoveFolder("health", "health", byId)).toBe(false)
    expect(canMoveFolder("notes", "knowledge", byId)).toBe(true)
    expect(canMoveFolder("notes", "root", byId)).toBe(true)
  })

  it("lists a subtree, optionally stopping at folders other entities use", () => {
    expect(subtreeFolderIds("health", folders)).toEqual([
      "health",
      "activities",
      "hlt32",
      "notes",
    ])
    expect(
      subtreeFolderIds("health", folders, { stopAtOtherOwners: true })
    ).toEqual(["health", "activities"])
  })
})
