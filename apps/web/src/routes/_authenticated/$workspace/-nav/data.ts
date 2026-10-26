import { CalendarDays, CircleDashed, FileText } from "lucide-react"
import type { NavSection } from "@layout/nav-types"

const nav: NavSection[] = [
  {
    links: [
      { icon: CalendarDays, label: "Today", route: "/today" },
      { icon: CircleDashed, label: "Activities", route: "/activities" },
      { icon: FileText, label: "Documents", route: "/documents" },
    ],
  },
]

export { nav }
