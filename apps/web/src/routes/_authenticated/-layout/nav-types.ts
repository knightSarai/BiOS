import type { LucideIcon } from "lucide-react"
import type { AppPermission } from "@knight-os/auth/permissions"

type NavLink = {
  icon: LucideIcon
  label: string
  route: string
  exact?: boolean
  permission?: AppPermission
}

type NavSection = {
  label?: string
  links: NavLink[]
}

export type { NavLink, NavSection }
