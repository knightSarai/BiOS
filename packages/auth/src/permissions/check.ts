import type { AppPermission } from "./ac"
import { roles } from "./roles"

export type EffectivePermissions = Record<string, string[]>

export const parseMemberRoles = (raw: string | null | undefined): string[] =>
  (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)

export const hasMemberRole = (
  raw: string | null | undefined,
  role: string
): boolean => parseMemberRoles(raw).includes(role)

export const resolveEffectivePermissions = (
  raw: string | null | undefined
): EffectivePermissions => {
  const granted = new Map<string, Set<string>>()

  for (const roleName of parseMemberRoles(raw)) {
    const role = roles[roleName as keyof typeof roles]
    if (!role) continue
    for (const [resource, actions] of Object.entries(role.statements)) {
      const set = granted.get(resource) ?? new Set<string>()
      for (const action of actions as readonly string[]) set.add(action)
      granted.set(resource, set)
    }
  }

  return Object.fromEntries(
    Array.from(granted.entries()).map(([resource, actions]) => [
      resource,
      Array.from(actions),
    ])
  )
}

export const isAllowed = (
  required: AppPermission,
  effective: EffectivePermissions
): boolean =>
  Object.entries(required).every(([resource, actions]) => {
    const granted = effective[resource]
    return (
      !!granted &&
      (actions as readonly string[]).every((action) => granted.includes(action))
    )
  })
