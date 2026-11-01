import { FileText, Folder, FolderOpen } from "lucide-react"
import { cn } from "@/lib/utils"
import { StoredIcon } from "./StoredIcon"

type DocumentIconProps = {
  icon: string | null
  className?: string
}

function DocumentIcon({ icon, className }: DocumentIconProps) {
  return (
    <StoredIcon
      value={icon}
      className={className}
      fallback={
        <FileText
          aria-hidden
          className={cn("size-4 shrink-0 text-muted-foreground", className)}
        />
      }
    />
  )
}

type FolderIconProps = {
  open?: boolean
  className?: string
}

function FolderIcon({ open, className }: FolderIconProps) {
  const Icon = open ? FolderOpen : Folder
  return (
    <Icon
      aria-hidden
      className={cn("size-4 shrink-0 text-muted-foreground", className)}
    />
  )
}

export { DocumentIcon, FolderIcon }
