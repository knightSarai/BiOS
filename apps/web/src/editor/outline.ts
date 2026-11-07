import type { Node } from "prosemirror-model"

type OutlineHeading = { pos: number; level: number; text: string }

const outlineOf = (doc: Node) => {
  const headings: OutlineHeading[] = []
  doc.descendants((node, pos) => {
    if (node.type.name === "heading") {
      const text = node.textContent.trim()
      if (text) headings.push({ pos, level: node.attrs.level as number, text })
    }
    return !node.isTextblock
  })
  return headings
}

const activeHeadingIndex = (tops: number[], threshold: number) =>
  Math.max(
    tops.findLastIndex((top) => top <= threshold),
    0
  )

export { activeHeadingIndex, outlineOf }
export type { OutlineHeading }
