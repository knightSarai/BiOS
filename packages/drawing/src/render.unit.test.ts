import { describe, expect, it } from "vitest"
import { renderShapes } from "./render"
import type { Palette } from "./render"
import { arrow, box } from "./test-shapes"

const palette: Palette = {
  color: (token) => `c(${token})`,
  fill: (token) => `f(${token})`,
  canvas: "canvas",
  ink: "ink",
  muted: "muted",
}

describe("renderShapes", () => {
  it("draws a hand-drawn box as a fill and a stable jittered outline", () => {
    const shape = {
      ...box("a", 0, 0, 100, 50),
      rough: true,
      fill: "chart-1" as const,
    }
    const first = renderShapes([shape], palette)
    const second = renderShapes([shape], palette)
    expect(first.map((p) => p.key)).toEqual(["a:fill", "a"])
    expect(first[1]).toMatchObject({ fill: null, stroke: "c(foreground)" })
    expect(first).toEqual(second)
    const clean = renderShapes([{ ...shape, rough: false }], palette)
    expect(
      first[1]?.type === "path" &&
        clean[0]?.type === "path" &&
        first[1].d !== clean[0].d
    ).toBe(true)
  })

  it("draws a filled box with its stroke and a centred label", () => {
    const primitives = renderShapes(
      [
        {
          ...box("a", 0, 0, 100, 50),
          fill: "chart-4",
          stroke: "chart-3",
          label: "Active",
        },
      ],
      palette
    )
    expect(primitives).toMatchObject([
      {
        type: "path",
        key: "a",
        fill: "f(chart-4)",
        stroke: "c(chart-3)",
        strokeWidth: 2,
        dash: null,
      },
      {
        type: "text",
        key: "a:label",
        x: 50,
        y: 25,
        lines: ["Active"],
        color: "ink",
        anchor: "middle",
      },
    ])
  })

  it("dashes a dashed stroke relative to its width", () => {
    const [shape] = renderShapes(
      [{ ...box("a", 0, 0), dashed: true, width: 4 }],
      palette
    )
    expect(shape).toMatchObject({ dash: "12 12" })
  })

  it("draws an arrow as a shaft, a filled head and a label on the canvas colour", () => {
    const primitives = renderShapes(
      [
        {
          ...arrow("x", null, null, { x1: 0, y1: 0, x2: 100, y2: 0 }),
          label: "now",
        },
      ],
      palette
    )
    expect(primitives.map((p) => p.key)).toEqual([
      "x",
      "x:head",
      "x:label-bg",
      "x:label",
    ])
    expect(primitives[1]).toMatchObject({ fill: "c(foreground)" })
    expect(primitives[2]).toMatchObject({ fill: "canvas" })
  })

  it("splits multi-line labels and centres the block", () => {
    const [, label] = renderShapes(
      [{ ...box("a", 0, 0, 100, 100), label: "One\nTwo" }],
      palette
    )
    expect(label).toMatchObject({ lines: ["One", "Two"] })
    expect(label?.type === "text" ? label.y : 0).toBeLessThan(50)
  })
})
