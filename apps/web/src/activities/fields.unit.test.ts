import { describe, expect, it } from "vitest"
import {
  InvalidFieldValueError,
  formatFieldValue,
  keepValidValues,
  parseFieldValues,
  setFieldValue,
  valuesLostOnTypeChange,
  type FieldDefinition,
} from "./fields"

const field = (
  id: string,
  kind: FieldDefinition["kind"],
  options: string[] = []
): FieldDefinition => ({
  id,
  kind,
  options: options.map((label, index) => ({ id: `opt-${index}`, label })),
})

const author = field("author", "text")
const pages = field("pages", "number")
const finished = field("finished", "date")
const format = field("format", "choice", ["Paper", "Ebook"])
const tags = field("tags", "multiChoice", ["Systems", "Databases"])
const signed = field("signed", "checkbox")
const link = field("link", "url")
const rating = field("rating", "rating")

describe("setFieldValue", () => {
  it.each([
    [author, "  Martin Kleppmann  ", "Martin Kleppmann"],
    [pages, 616, 616],
    [finished, "2026-10-24", "2026-10-24"],
    [format, "opt-1", "opt-1"],
    [tags, ["opt-0", "opt-0", "opt-1"], ["opt-0", "opt-1"]],
    [signed, false, false],
    [link, "https://dataintensive.net", "https://dataintensive.net"],
    [rating, 4, 4],
  ])("stores a valid %s value", (definition, input, stored) => {
    expect(setFieldValue({}, definition, input)).toEqual({
      [definition.id]: stored,
    })
  })

  it.each([
    [author, "   "],
    [pages, "616"],
    [finished, "24/10/2026"],
    [format, "Paper"],
    [tags, []],
    [signed, "yes"],
    [link, "not a link"],
    [rating, 6],
    [rating, 2.5],
  ])("rejects an invalid %s value", (definition, input) => {
    expect(() => setFieldValue({}, definition, input)).toThrow(
      InvalidFieldValueError
    )
  })

  it("drops the key when the value is cleared", () => {
    expect(setFieldValue({ pages: 616, author: "A" }, pages, null)).toEqual({
      author: "A",
    })
  })
})

describe("parseFieldValues", () => {
  it("keeps only the type's fields and leaves unset ones absent", () => {
    expect(
      parseFieldValues([author, pages], {
        author: "Ichiro Kishimi",
        stray: "ignored",
      })
    ).toEqual({ author: "Ichiro Kishimi" })
  })
})

describe("keepValidValues", () => {
  it("drops values whose field or option no longer exists", () => {
    const paperOnly = field("format", "choice", ["Paper"])
    expect(
      keepValidValues([paperOnly], {
        format: "opt-1",
        pages: 616,
      })
    ).toEqual({})
  })
})

describe("keepValidValues with multiple choice", () => {
  it("drops only the removed option and keeps the rest of the selection", () => {
    const systemsOnly = field("tags", "multiChoice", ["Systems"])
    expect(
      keepValidValues([systemsOnly], { tags: ["opt-0", "opt-1"] })
    ).toEqual({ tags: ["opt-0"] })
  })

  it("drops the value when no selected option is left", () => {
    const systemsOnly = field("tags", "multiChoice", ["Systems"])
    expect(keepValidValues([systemsOnly], { tags: ["opt-1"] })).toEqual({})
  })
})

describe("valuesLostOnTypeChange", () => {
  it("lists the old type's fields that have a value", () => {
    const lost = valuesLostOnTypeChange([author, pages, rating], {
      author: "Martin Kleppmann",
      rating: 4,
    })
    expect(lost.map((definition) => definition.id)).toEqual([
      "author",
      "rating",
    ])
  })
})

describe("formatFieldValue", () => {
  it.each([
    [author, "Martin Kleppmann", "Martin Kleppmann"],
    [pages, 616, "616"],
    [finished, "2026-10-24", "Sat 24 Oct"],
    [format, "opt-1", "Ebook"],
    [format, "gone", "Removed option"],
    [tags, ["opt-0", "opt-1"], "Systems, Databases"],
    [signed, true, "Yes"],
    [rating, 4, "4 of 5"],
  ])("shows a %s value as text", (definition, value, text) => {
    expect(formatFieldValue(definition, value)).toBe(text)
  })
})
