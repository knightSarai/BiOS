import { describe, expect, it } from "vitest"
import {
  InvalidTypeParentError,
  checkTypeParent,
  parentChoices,
  resolveTypeFields,
  typeTree,
} from "./type-tree"

const type = (id: string, parentId: string | null = null) => ({ id, parentId })

// Workout › Strength › Calisthenics, Workout › Boxing, Practice › Guitar, Work
const types = [
  type("workout"),
  type("practice"),
  type("strength", "workout"),
  type("guitar", "practice"),
  type("calisthenics", "strength"),
  type("boxing", "workout"),
  type("work"),
]

describe("typeTree", () => {
  it("puts each subtype right under its parent, keeping the given order per level", () => {
    expect(typeTree(types).map((node) => [node.id, node.depth])).toEqual([
      ["workout", 1],
      ["strength", 2],
      ["calisthenics", 3],
      ["boxing", 2],
      ["practice", 1],
      ["guitar", 2],
      ["work", 1],
    ])
  })

  it("shows a type whose parent is missing at the top level", () => {
    expect(typeTree([type("orphan", "gone")])).toEqual([
      { id: "orphan", parentId: "gone", depth: 1 },
    ])
  })
})

describe("checkTypeParent", () => {
  it("allows a move that stays within three levels", () => {
    expect(() => checkTypeParent(types, "work", "practice")).not.toThrow()
    expect(() => checkTypeParent(types, "work", "guitar")).not.toThrow()
    expect(() => checkTypeParent(types, "strength", null)).not.toThrow()
  })

  it("rejects loops", () => {
    expect(() => checkTypeParent(types, "workout", "workout")).toThrow(
      InvalidTypeParentError
    )
    expect(() => checkTypeParent(types, "workout", "calisthenics")).toThrow(
      InvalidTypeParentError
    )
  })

  it("rejects a move that makes the tree deeper than three levels", () => {
    expect(() => checkTypeParent(types, "practice", "boxing")).toThrow(
      InvalidTypeParentError
    )
    expect(() => checkTypeParent(types, "work", "calisthenics")).toThrow(
      InvalidTypeParentError
    )
  })

  it("rejects a parent that doesn't exist", () => {
    expect(() => checkTypeParent(types, "work", "nope")).toThrow(
      InvalidTypeParentError
    )
  })

  it("offers only the parents a type can move under", () => {
    expect(parentChoices(types, "strength").map((node) => node.id)).toEqual([
      "workout",
      "practice",
      "work",
    ])
    expect(parentChoices(types, "work").map((node) => node.id)).toEqual([
      "workout",
      "practice",
      "strength",
      "guitar",
      "boxing",
    ])
  })
})

describe("resolveTypeFields", () => {
  const field = (id: string) => ({ id, name: id })
  const fields = ["effort", "avgHr", "sets", "reps", "skill"].map(field)
  const links = [
    { typeId: "workout", fieldId: "avgHr", sortKey: "a2" },
    { typeId: "workout", fieldId: "effort", sortKey: "a1" },
    { typeId: "strength", fieldId: "sets", sortKey: "a1" },
    { typeId: "strength", fieldId: "effort", sortKey: "a2" },
    { typeId: "calisthenics", fieldId: "skill", sortKey: "a1" },
    { typeId: "calisthenics", fieldId: "gone", sortKey: "a2" },
  ]

  it("lists inherited fields root first, then the type's own, each once", () => {
    expect(
      resolveTypeFields(types, links, fields, "calisthenics").map((entry) => [
        entry.id,
        entry.sourceTypeId,
      ])
    ).toEqual([
      ["effort", "workout"],
      ["avgHr", "workout"],
      ["sets", "strength"],
      ["skill", "calisthenics"],
    ])
  })

  it("gives a type with no parent only its own fields", () => {
    expect(
      resolveTypeFields(types, links, fields, "boxing").map((entry) => entry.id)
    ).toEqual(["effort", "avgHr"])
    expect(resolveTypeFields(types, links, fields, "work")).toEqual([])
  })
})
