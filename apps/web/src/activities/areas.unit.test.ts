import { describe, expect, it } from "vitest"
import { colorName, colorSchema, cssColor, toSixDigitHex } from "./areas"

describe("colorSchema", () => {
  it("accepts the presets and six-digit hex colours", () => {
    expect(colorSchema.parse("chart-3")).toBe("chart-3")
    expect(colorSchema.parse("#4f86b8")).toBe("#4f86b8")
  })

  it("rejects anything else", () => {
    for (const color of ["chart-9", "#4f86b", "4f86b8", "#4F86B8", "blue"]) {
      expect(colorSchema.safeParse(color).success).toBe(false)
    }
  })
})

describe("cssColor", () => {
  it("uses the theme variable for presets and the hex as is", () => {
    expect(cssColor("chart-1")).toBe("var(--chart-1)")
    expect(cssColor("#4f86b8")).toBe("#4f86b8")
  })
})

describe("colorName", () => {
  it("names presets, the extra palette and custom picks", () => {
    expect(colorName("chart-2")).toBe("Rose")
    expect(colorName("#4f86b8")).toBe("Ocean")
    expect(colorName("#123456")).toBe("Custom colour #123456")
  })
})

describe("toSixDigitHex", () => {
  it("expands shorthand and normalises case and the leading #", () => {
    expect(toSixDigitHex("#FFF")).toBe("#ffffff")
    expect(toSixDigitHex("4f86b8")).toBe("#4f86b8")
    expect(toSixDigitHex(" #4F86B8 ")).toBe("#4f86b8")
  })
})
