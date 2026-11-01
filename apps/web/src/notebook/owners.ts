const OWNER_KINDS = ["area", "activity", "goal"] as const

type OwnerKind = (typeof OWNER_KINDS)[number]
type OwnerKey = `${OwnerKind}:${string}`
type Owner = { kind: OwnerKind; id: string }

const ownerKeyOf = (owner: Owner): OwnerKey => `${owner.kind}:${owner.id}`

const parseOwnerKey = (key: string): Owner | null => {
  const separator = key.indexOf(":")
  const kind = key.slice(0, separator)
  const id = key.slice(separator + 1)
  if (!OWNER_KINDS.includes(kind as OwnerKind) || !id) return null
  return { kind: kind as OwnerKind, id }
}

const activityFolderName = (activityKey: string, title: string) =>
  `${activityKey} ${title.trim() || "Untitled"}`

const goalFolderName = (title: string) => title.trim() || "Untitled goal"

export { activityFolderName, goalFolderName, ownerKeyOf, parseOwnerKey }
export type { Owner, OwnerKey, OwnerKind }
