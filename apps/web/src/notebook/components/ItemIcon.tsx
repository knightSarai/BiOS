import { CalendarDays, FileText, Folder, FolderOpen } from "lucide-react"
import type { JournalRef } from "@/journal/periods"
import type { FolderRole } from "@/local-db/db"
import { cn } from "@/lib/utils"

type DocumentIconProps = {
  icon: string | null
  journal: JournalRef | null
  className?: string
}

function DocumentIcon({ icon, journal, className }: DocumentIconProps) {
  if (icon) {
    return (
      <span
        aria-hidden
        className={cn(
          "flex size-4 shrink-0 items-center justify-center text-[13px] leading-none",
          className
        )}
      >
        {icon}
      </span>
    )
  }
  const Icon = journal ? CalendarDays : FileText
  return (
    <Icon
      aria-hidden
      className={cn("size-4 shrink-0 text-muted-foreground", className)}
    />
  )
}

type FolderIconProps = {
  role: FolderRole
  open?: boolean
  className?: string
}

function FolderIcon({ role, open, className }: FolderIconProps) {
  const Icon = role === "journal" ? CalendarDays : open ? FolderOpen : Folder
  return (
    <Icon
      aria-hidden
      className={cn("size-4 shrink-0 text-muted-foreground", className)}
    />
  )
}

export { DocumentIcon, FolderIcon }
