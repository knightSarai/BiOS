import { CalendarDays } from "lucide-react"
import type { NavSection } from "@layout/nav-types"

const nav: NavSection[] = [
  {
    links: [{ icon: CalendarDays, label: "Today", route: "/today" }],
  },
]

export { nav }
