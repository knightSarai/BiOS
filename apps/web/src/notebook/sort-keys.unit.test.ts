import { describe, expect, it } from "vitest"
import { compareSortKeys, keyBetween, keysAfter } from "./sort-keys"

describe("keyBetween", () => {
  it("creates a first key", () => {
    expect(keyBetween(null, null)).toBe("V")
  })

  it("orders keys before, between and after", () => {
    const first = keyBetween(null, null)
    const before = keyBetween(null, first)
    const after = keyBetween(first, null)
    const between = keyBetween(first, after)
    expect([after, between, first, before].sort()).toEqual([
      before,
      first,
      between,
      after,
    ])
  })

  it("keeps finding room between adjacent keys", () => {
    let low = keyBetween(null, null)
    const high = keyBetween(low, null)
    for (let round = 0; round < 50; round++) {
      const next = keyBetween(low, high)
      expect(next > low && next < high).toBe(true)
      expect(next.endsWith("0")).toBe(false)
      low = next
    }
  })

  it("rejects keys in the wrong order", () => {
    expect(() => keyBetween("b", "a")).toThrow()
  })
})

describe("compareSortKeys", () => {
  it("orders by code unit, so an uppercase key comes before a lowercase one", () => {
    const keys = keysAfter(null, 2)
    expect(keys).toEqual(["V", "l"])
    expect([...keys].reverse().sort(compareSortKeys)).toEqual(["V", "l"])
    expect(compareSortKeys("V", "V")).toBe(0)
  })
})

describe("keysAfter", () => {
  it("returns increasing keys after the last one", () => {
    const keys = keysAfter("V", 3)
    expect(keys).toHaveLength(3)
    expect([...keys].sort()).toEqual(keys)
    expect(keys[0] > "V").toBe(true)
  })
})
