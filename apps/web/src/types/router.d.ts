import type { LucideIcon } from "lucide-react"

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    crumb?: {
      label: string
      icon?: LucideIcon
    }
  }
}

export {}
