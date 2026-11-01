import type { Node } from "prosemirror-model"
import { titleOf } from "./document-content"

type MentionKey = `${"document" | "activity"}:${string}`

type ContentMention = {
  targetKey: MentionKey
  blockId: string | null
}

type EditorContent = {
  title: string
  excerpt: string
  mentions: ContentMention[]
}

const EXCERPT_LENGTH = 160

const mentionKeyOf = (node: Node): MentionKey | null => {
  if (node.type.name === "activity") {
    return `activity:${node.attrs.activityId as string}`
  }
  if (node.type.name === "mention") {
    return `${node.attrs.targetKind as "document" | "activity"}:${node.attrs.targetId as string}`
  }
  return null
}

const excerptOf = (doc: Node) => {
  let excerpt = ""
  doc.forEach((block, _offset, index) => {
    if (index === 0 || excerpt) return
    const text = block.textContent.trim()
    if (text) excerpt = text
  })
  return excerpt.length > EXCERPT_LENGTH
    ? `${excerpt.slice(0, EXCERPT_LENGTH - 1).trimEnd()}…`
    : excerpt
}

const mentionsOf = (doc: Node) => {
  const mentions: ContentMention[] = []
  doc.forEach((block) => {
    const blockId = (block.attrs.id as string | null | undefined) ?? null
    block.descendants((node) => {
      const targetKey = mentionKeyOf(node)
      if (targetKey) mentions.push({ targetKey, blockId })
    })
  })
  return mentions
}

const contentOf = (doc: Node): EditorContent => ({
  title: titleOf(doc),
  excerpt: excerptOf(doc),
  mentions: mentionsOf(doc),
})

export { contentOf, excerptOf, mentionsOf }
export type { ContentMention, EditorContent, MentionKey }
