import { compareSortKeys } from "@/notebook/sort-keys"

const MAX_TYPE_DEPTH = 3

type TypeNode = { id: string; parentId: string | null }

type FieldLink = { typeId: string; fieldId: string; sortKey: string }

class InvalidTypeParentError extends Error {}

const byId = <T extends TypeNode>(types: T[]) =>
  new Map(types.map((type) => [type.id, type]))

// Root first, ending with the type itself; a parent missing from the list ends the chain.
const typeLineage = <T extends TypeNode>(types: T[], id: string): T[] => {
  const nodes = byId(types)
  const lineage: T[] = []
  const seen = new Set<string>()
  for (
    let node = nodes.get(id);
    node && !seen.has(node.id);
    node = node.parentId === null ? undefined : nodes.get(node.parentId)
  ) {
    seen.add(node.id)
    lineage.unshift(node)
  }
  return lineage
}

const typeDepth = (types: TypeNode[], id: string) =>
  typeLineage(types, id).length

const subtypeIds = (types: TypeNode[], id: string) =>
  types.filter((type) => type.parentId === id).map((type) => type.id)

const descendantTypeIds = (types: TypeNode[], id: string): Set<string> => {
  const found = new Set<string>()
  const visit = (parentId: string) => {
    for (const childId of subtypeIds(types, parentId)) {
      if (found.has(childId)) continue
      found.add(childId)
      visit(childId)
    }
  }
  visit(id)
  return found
}

// Levels from the type down to its deepest subtype, counting the type itself.
const subtreeHeight = (types: TypeNode[], id: string): number =>
  1 +
  Math.max(
    0,
    ...subtypeIds(types, id).map((childId) => subtreeHeight(types, childId))
  )

const checkTypeParent = (
  types: TypeNode[],
  id: string,
  parentId: string | null
) => {
  if (parentId === null) return
  if (!types.some((type) => type.id === parentId)) {
    throw new InvalidTypeParentError("That parent type doesn't exist.")
  }
  if (parentId === id || descendantTypeIds(types, id).has(parentId)) {
    throw new InvalidTypeParentError(
      "A type can't sit under itself or one of its subtypes."
    )
  }
  if (typeDepth(types, parentId) + subtreeHeight(types, id) > MAX_TYPE_DEPTH) {
    throw new InvalidTypeParentError(
      `Types go at most ${MAX_TYPE_DEPTH} levels deep.`
    )
  }
}

const parentChoices = <T extends TypeNode>(types: T[], id: string) =>
  types.filter((candidate) => {
    try {
      checkTypeParent(types, id, candidate.id)
      return true
    } catch {
      return false
    }
  })

// Depth-first, each level in the order given, so subtypes sit right under their parent.
const typeTree = <T extends TypeNode>(types: T[]) => {
  const ids = new Set(types.map((type) => type.id))
  const ordered: (T & { depth: number })[] = []
  const visit = (parentId: string | null, depth: number) => {
    for (const type of types) {
      const isRoot = type.parentId === null || !ids.has(type.parentId)
      if (parentId === null ? !isRoot : type.parentId !== parentId) continue
      ordered.push({ ...type, depth })
      visit(type.id, depth + 1)
    }
  }
  visit(null, 1)
  return ordered
}

// A type's fields: its ancestors' first, root down, then its own; a field linked twice in the
// line shows once, where it is first linked.
const resolveTypeFields = <Field extends { id: string }>(
  types: TypeNode[],
  links: FieldLink[],
  fields: Field[],
  typeId: string
) => {
  const fieldsById = new Map(fields.map((field) => [field.id, field]))
  const seen = new Set<string>()
  return typeLineage(types, typeId).flatMap((type) =>
    links
      .filter((link) => link.typeId === type.id)
      .sort((a, b) => compareSortKeys(a.sortKey, b.sortKey))
      .flatMap((link) => {
        const field = fieldsById.get(link.fieldId)
        if (!field || seen.has(field.id)) return []
        seen.add(field.id)
        return [{ ...field, sourceTypeId: type.id }]
      })
  )
}

export {
  InvalidTypeParentError,
  MAX_TYPE_DEPTH,
  checkTypeParent,
  descendantTypeIds,
  parentChoices,
  resolveTypeFields,
  subtypeIds,
  typeDepth,
  typeLineage,
  typeTree,
}
export type { FieldLink, TypeNode }
