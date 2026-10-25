import { Boxes, Home, Users } from "lucide-react"
import type { NavSection } from "@layout/nav-types"

const nav: NavSection[] = [
  {
    links: [
      { icon: Home, label: "Home", route: "/admin", exact: true },
      { icon: Boxes, label: "Workspaces", route: "/admin/workspaces" },
      { icon: Users, label: "Users", route: "/admin/users" },
    ],
  },
]

export { nav }
