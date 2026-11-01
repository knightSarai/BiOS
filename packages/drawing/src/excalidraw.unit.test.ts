import LZString from "lz-string"
import { describe, expect, it } from "vitest"
import { importExcalidraw } from "./excalidraw"

const element = (fields: Record<string, unknown>) => ({
  x: 0,
  y: 0,
  width: 100,
  height: 50,
  strokeColor: "#1e1e1e",
  backgroundColor: "transparent",
  strokeWidth: 2,
  strokeStyle: "solid",
  roughness: 1,
  isDeleted: false,
  ...fields,
})

const scene = {
  type: "excalidraw",
  elements: [
    element({
      id: "r",
      type: "rectangle",
      backgroundColor: "#ffec99",
      boundElements: [{ id: "t", type: "text" }],
    }),
    element({
      id: "t",
      type: "text",
      text: "Inbox",
      originalText: "Inbox",
      containerId: "r",
    }),
    element({
      id: "e",
      type: "ellipse",
      x: 300,
      strokeColor: "#1971c2",
      strokeStyle: "dashed",
      roughness: 0,
    }),
    element({
      id: "a",
      type: "arrow",
      x: 100,
      y: 25,
      points: [
        [0, 0],
        [200, 0],
      ],
      startBinding: { elementId: "r" },
      endBinding: { elementId: "e" },
    }),
    element({
      id: "free",
      type: "text",
      x: 10,
      y: 200,
      text: "Note",
      fontSize: 28,
      strokeColor: "#e03131",
    }),
    element({
      id: "line",
      type: "line",
      x: 0,
      y: 300,
      points: [
        [0, 0],
        [50, 10],
        [100, 0],
      ],
    }),
    element({ id: "img", type: "image" }),
    element({ id: "gone", type: "rectangle", isDeleted: true }),
  ],
}

let counter = 0
const makeId = () => `n${++counter}`

describe("importExcalidraw", () => {
  it("converts shapes, labels, bindings and styles from a .excalidraw file", () => {
    counter = 0
    const result = importExcalidraw(JSON.stringify(scene), makeId)
    expect(result?.skipped).toEqual({ image: 1 })
    const shapes = result?.shapes ?? []
    expect(shapes.map((s) => s.kind)).toEqual([
      "rect",
      "ellipse",
      "arrow",
      "text",
      "pen",
    ])
    const [rect, ellipse, arrow, text, pen] = shapes
    expect(rect).toMatchObject({
      label: "Inbox",
      fill: "chart-4",
      stroke: "foreground",
      rough: true,
    })
    expect(ellipse).toMatchObject({
      stroke: "chart-3",
      dashed: true,
      rough: false,
      fill: null,
    })
    expect(arrow).toMatchObject({
      start: { shapeId: rect?.id },
      end: { shapeId: ellipse?.id, x: 300, y: 25 },
    })
    expect(text).toMatchObject({ text: "Note", size: "l", stroke: "chart-2" })
    expect(pen).toMatchObject({
      points: [
        [0, 300],
        [50, 310],
        [100, 300],
      ],
    })
  })

  it("reads an Obsidian note with a compressed drawing", () => {
    const compressed = LZString.compressToBase64(JSON.stringify(scene))
      .match(/.{1,256}/g)
      ?.join("\n\n")
    const note = `---\nexcalidraw-plugin: parsed\n---\n# Excalidraw Data\n## Text Elements\nInbox ^t\n\n%%\n## Drawing\n\`\`\`compressed-json\n${compressed}\n\`\`\`\n%%`
    expect(importExcalidraw(note, makeId)?.shapes).toHaveLength(5)
  })

  it("reads an Obsidian note with a plain JSON drawing", () => {
    const note = `# Excalidraw Data\n\n%%\n## Drawing\n\`\`\`json\n${JSON.stringify(scene)}\n\`\`\`\n%%`
    expect(importExcalidraw(note, makeId)?.shapes).toHaveLength(5)
  })

  it("returns null for something that isn't a drawing", () => {
    expect(importExcalidraw("just some notes", makeId)).toBeNull()
    expect(importExcalidraw(JSON.stringify({ hello: 1 }), makeId)).toBeNull()
  })
})

describe("importExcalidraw edge cases", () => {
  it("fails cleanly on damaged compressed data", () => {
    const damaged =
      "## Drawing\n```compressed-json\nykxAUFUXjjHsh/Drd1nFsa\n```"
    expect(importExcalidraw(damaged, makeId)).toBeNull()
  })

  it("reads notes saved with Windows line endings", () => {
    const compressed = LZString.compressToBase64(JSON.stringify(scene))
    const note = `# Excalidraw Data\r\n## Drawing\r\n\`\`\`compressed-json\r\n${compressed}\r\n\`\`\`\r\n`
    expect(importExcalidraw(note, makeId)?.shapes).toHaveLength(5)
  })

  it("drops shapes that can't be drawn, keeps the first of duplicate ids and reports simplifications", () => {
    const result = importExcalidraw(
      JSON.stringify({
        elements: [
          element({ id: "empty", type: "freedraw", points: [] }),
          element({ id: "dup", type: "rectangle", angle: 0.5 }),
          element({ id: "dup", type: "ellipse" }),
          element({
            id: "bent",
            type: "arrow",
            points: [
              [0, 0],
              [50, 50],
              [100, 0],
            ],
          }),
        ],
      }),
      makeId
    )
    expect(result?.shapes.map((s) => s.kind)).toEqual(["rect", "arrow"])
    expect(result?.simplified).toEqual({ "rotated shape": 1, "bent arrow": 1 })
    expect(result?.skipped).toEqual({ "invalid shape": 1 })
  })
})

describe("importExcalidraw tallies", () => {
  it("counts a rotated labelled box once and a rotated image only as left out", () => {
    const result = importExcalidraw(
      JSON.stringify({
        elements: [
          element({ id: "box", type: "rectangle", angle: 1 }),
          element({
            id: "label",
            type: "text",
            text: "Hi",
            containerId: "box",
            angle: 1,
          }),
          element({ id: "pic", type: "image", angle: 1 }),
        ],
      }),
      makeId
    )
    expect(result?.simplified).toEqual({ "rotated shape": 1 })
    expect(result?.skipped).toEqual({ image: 1 })
  })
})
