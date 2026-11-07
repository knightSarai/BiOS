import { describe, expect, it } from "vitest"
import {
  byCreation,
  descendantsOf,
  groupTree,
  subActivityProgress,
  subActivityTree,
  type TreeNode,
} from "./sub-activities"

type Item = {
  id: string
  parentId: string | null
  status: string
  createdAt: string
  number: number
}

const item = (
  id: string,
  parentId: string | null,
  status = "todo",
  number = 0
): Item => ({ id, parentId, status, createdAt: "2026-11-08", number })

const shape = (nodes: TreeNode<Item>[]): unknown[] =>
  nodes.map((node) =>
    node.children.length > 0
      ? [
          node.context ? `(${node.item.id})` : node.item.id,
          shape(node.children),
        ]
      : node.context
        ? `(${node.item.id})`
        : node.item.id
  )

describe("subActivityProgress", () => {
  it("counts done out of everything not canceled", () => {
    expect(
      subActivityProgress(["done", "todo", "canceled", "progress", "done"])
    ).toEqual({ done: 2, total: 4 })
    expect(subActivityProgress([])).toEqual({ done: 0, total: 0 })
  })
})

describe("descendantsOf", () => {
  it("finds sub-activities at every depth", () => {
    const items = [
      item("gym", null),
      item("nested-1", "gym"),
      item("nested-2", "nested-1"),
      item("other", null),
    ]
    expect(descendantsOf(items, "gym").map((row) => row.id)).toEqual([
      "nested-1",
      "nested-2",
    ])
  })

  it("stops at a loop in the data", () => {
    const items = [item("a", "b"), item("b", "a")]
    expect(descendantsOf(items, "a").map((row) => row.id)).toEqual(["b"])
  })
})

describe("subActivityTree", () => {
  it("nests every level under the activity", () => {
    const items = [
      item("set-1", "bench"),
      item("bench", "push"),
      item("ohp", "push"),
      item("set-2", "bench"),
    ]
    expect(shape(subActivityTree(items, "push"))).toEqual([
      ["bench", ["set-1", "set-2"]],
      "ohp",
    ])
  })
})

describe("groupTree", () => {
  const isTodo = (row: Item) => row.status === "todo"

  it("brings a parent from another group along as context", () => {
    const items = [
      item("gym", null, "progress"),
      item("nested-1", "gym", "todo", 2),
      item("nested-2", "nested-1", "todo", 3),
    ]
    expect(shape(groupTree(items, isTodo, byCreation))).toEqual([
      ["(gym)", [["nested-1", ["nested-2"]]]],
    ])
  })

  it("nests members under a parent in the same group, without listing them twice", () => {
    const items = [
      item("sparring", null),
      item("partner", "sparring", "todo", 2),
      item("gloves", "sparring", "todo", 1),
      item("wraps", null),
    ]
    expect(shape(groupTree(items, isTodo, byCreation))).toEqual([
      ["sparring", ["gloves", "partner"]],
      "wraps",
    ])
  })

  it("leaves out sub-activities that aren't in the group", () => {
    const items = [item("test", null), item("ttt", "test", "done")]
    expect(shape(groupTree(items, isTodo, byCreation))).toEqual(["test"])
  })

  it("shows a sub-activity whose parent isn't listed at the top", () => {
    const items = [item("set", "elsewhere")]
    expect(shape(groupTree(items, isTodo, byCreation))).toEqual(["set"])
  })
})
