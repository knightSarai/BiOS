import { CalendarDays, FileText } from "lucide-react"
import type { NavSection } from "@layout/nav-types"

const nav: NavSection[] = [
  {
    links: [
      { icon: CalendarDays, label: "Today", route: "/today" },
      { icon: FileText, label: "Documents", route: "/documents" },
    ],
  },
]

export { nav }
