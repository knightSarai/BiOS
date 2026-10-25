import {
  isAllowed,
  type EffectivePermissions,
} from "@knight-os/auth/permissions"
import type { NavSection } from "@layout/nav-types"

const joinPath = (basePath: string, route: string) =>
  route === "/" ? basePath : `${basePath}${route}`

export const resolveNav = (
  sections: NavSection[],
  basePath: string,
  effective: EffectivePermissions
): NavSection[] =>
  sections.flatMap((section) => {
    const links = section.links
      .filter((link) => !link.permission || isAllowed(link.permission, effective))
      .map((link) => ({ ...link, route: joinPath(basePath, link.route) }))

    return links.length ? [{ ...section, links }] : []
  })
