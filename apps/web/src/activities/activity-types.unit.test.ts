import { describe, expect, it } from "vitest"
import {
  cleanStatusNames,
  statusName,
  type StatusNames,
} from "./activity-types"

describe("cleanStatusNames", () => {
  it("trims names, drops blank ones and ignores unknown statuses", () => {
    const names = {
      backlog: " Want to read ",
      todo: "   ",
      done: "Read",
      archived: "Shelved",
    } as StatusNames
    expect(cleanStatusNames(names)).toEqual({
      backlog: "Want to read",
      done: "Read",
    })
  })
})

describe("statusName", () => {
  it("uses the type's name and falls back to the default", () => {
    const names: StatusNames = { backlog: "Want to read" }
    expect(statusName("backlog", names)).toBe("Want to read")
    expect(statusName("progress", names)).toBe("In progress")
    expect(statusName("todo", null)).toBe("To do")
  })
})
