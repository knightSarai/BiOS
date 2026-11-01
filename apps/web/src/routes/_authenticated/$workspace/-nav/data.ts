import { CalendarDays, CircleDashed, Target } from "lucide-react"
import type { NavSection } from "@layout/nav-types"

const nav: NavSection[] = [
  {
    links: [
      { icon: CalendarDays, label: "Today", route: "/today" },
      { icon: CircleDashed, label: "Activities", route: "/activities" },
      { icon: Target, label: "Goals", route: "/goals" },
    ],
  },
]

export { nav }
