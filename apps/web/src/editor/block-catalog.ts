const blockCatalog = [
  {
    kind: "paragraph",
    label: "Text",
    aliases: ["paragraph", "plain"],
    keys: "Mod-Alt-0",
  },
  {
    kind: "heading1",
    label: "Heading 1",
    aliases: ["h1", "title"],
    keys: "Mod-Alt-1",
  },
  {
    kind: "heading2",
    label: "Heading 2",
    aliases: ["h2", "subtitle"],
    keys: "Mod-Alt-2",
  },
  { kind: "heading3", label: "Heading 3", aliases: ["h3"], keys: "Mod-Alt-3" },
  {
    kind: "bullet_list",
    label: "Bulleted list",
    aliases: ["ul", "unordered", "bullets"],
    keys: "Mod-Shift-8",
  },
  {
    kind: "ordered_list",
    label: "Numbered list",
    aliases: ["ol", "ordered", "numbers"],
    keys: "Mod-Shift-9",
  },
  {
    kind: "task_list",
    label: "Checklist",
    aliases: ["todo", "to-do", "task", "checkbox"],
    keys: "Mod-Shift-7",
  },
  {
    kind: "blockquote",
    label: "Quote",
    aliases: ["blockquote", "citation"],
    keys: "Mod-Shift-.",
  },
  {
    kind: "code_block",
    label: "Code block",
    aliases: ["code", "snippet", "pre"],
    keys: "Mod-Shift-\\",
  },
  {
    kind: "collapsible",
    label: "Collapsible section",
    aliases: ["toggle", "details", "fold"],
    keys: "Mod-Shift-6",
  },
  {
    kind: "horizontal_rule",
    label: "Divider",
    aliases: ["hr", "separator", "line", "rule"],
    keys: "Mod-Shift--",
  },
] as const

type BlockCatalogItem = (typeof blockCatalog)[number]
type BlockKind = BlockCatalogItem["kind"]

const matchRank = (item: BlockCatalogItem, query: string) => {
  const label = item.label.toLowerCase()
  if (label.startsWith(query)) return 0
  if (label.split(" ").some((word) => word.startsWith(query))) return 1
  if (item.aliases.some((alias) => alias.startsWith(query))) return 2
  if (
    label.includes(query) ||
    item.aliases.some((alias) => alias.includes(query))
  ) {
    return 3
  }
  return null
}

const filterBlockCatalog = (rawQuery: string): BlockCatalogItem[] => {
  const query = rawQuery.trim().toLowerCase()
  if (!query) return [...blockCatalog]
  return blockCatalog
    .map((item, order) => ({ item, order, rank: matchRank(item, query) }))
    .filter((entry) => entry.rank !== null)
    .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0) || a.order - b.order)
    .map((entry) => entry.item)
}

export { blockCatalog, filterBlockCatalog }
export type { BlockCatalogItem, BlockKind }
