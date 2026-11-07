import type { ActivityStatus } from "./status"

type TreeItem = { id: string; parentId: string | null }

type TreeNode<Item> = {
  item: Item
  // Shown only so its sub-activities sit under it; it isn't part of the group itself.
  context: boolean
  children: TreeNode<Item>[]
}

// Canceled sub-activities leave the count, so dropping one doesn't hold progress back.
const subActivityProgress = (statuses: ActivityStatus[]) => {
  const counted = statuses.filter((status) => status !== "canceled")
  return {
    done: counted.filter((status) => status === "done").length,
    total: counted.length,
  }
}

const byCreation = <Row extends { createdAt: string; number: number }>(
  a: Row,
  b: Row
) => a.createdAt.localeCompare(b.createdAt) || a.number - b.number

const childrenByParent = <Item extends TreeItem>(items: Item[]) => {
  const children = new Map<string, Item[]>()
  for (const item of items) {
    if (item.parentId === null) continue
    children.set(item.parentId, [...(children.get(item.parentId) ?? []), item])
  }
  return children
}

const buildTree = <Item extends TreeItem>(
  roots: Item[],
  children: Map<string, Item[]>,
  isContext: (item: Item) => boolean
) => {
  const placed = new Set<string>()
  const build = (items: Item[]): TreeNode<Item>[] =>
    items.flatMap((item) => {
      if (placed.has(item.id)) return []
      placed.add(item.id)
      return [
        {
          item,
          context: isContext(item),
          children: build(children.get(item.id) ?? []),
        },
      ]
    })
  return build(roots)
}

// Every activity under `id`, at any depth, in the order `items` lists them.
const descendantsOf = <Item extends TreeItem>(items: Item[], id: string) => {
  const children = childrenByParent(items)
  const found = new Set<string>([id])
  const visit = (parentId: string) => {
    for (const child of children.get(parentId) ?? []) {
      if (found.has(child.id)) continue
      found.add(child.id)
      visit(child.id)
    }
  }
  visit(id)
  return items.filter((item) => item.id !== id && found.has(item.id))
}

const subActivityTree = <Item extends TreeItem>(
  items: Item[],
  rootId: string
) => {
  const children = childrenByParent(items)
  return buildTree(children.get(rootId) ?? [], children, () => false)
}

// A list group nests its members under their parents. A parent outside the group
// comes along as context, as in Linear, so a sub-activity never loses its place.
const groupTree = <Item extends TreeItem>(
  items: Item[],
  isMember: (item: Item) => boolean,
  childOrder: (a: Item, b: Item) => number
) => {
  const byId = new Map(items.map((item) => [item.id, item]))
  const shown = new Set<string>()
  for (const member of items.filter(isMember)) {
    let item: Item | undefined = member
    while (item && !shown.has(item.id)) {
      shown.add(item.id)
      item = item.parentId === null ? undefined : byId.get(item.parentId)
    }
  }
  const visible = items.filter((item) => shown.has(item.id))
  const children = new Map(
    [...childrenByParent(visible)].map(([parentId, rows]) => [
      parentId,
      rows.toSorted(childOrder),
    ])
  )
  const roots = visible.filter(
    (item) => item.parentId === null || !shown.has(item.parentId)
  )
  return buildTree(roots, children, (item) => !isMember(item))
}

export {
  byCreation,
  descendantsOf,
  groupTree,
  subActivityProgress,
  subActivityTree,
}
export type { TreeNode }
