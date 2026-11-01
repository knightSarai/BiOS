import { Fragment } from "react"
import {
  Copy,
  CopyPlus,
  FilePlus2,
  FolderInput,
  FolderPlus,
  Link2,
  Pencil,
  SmilePlus,
  Trash2,
  type LucideIcon,
} from "lucide-react"
import {
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
} from "@/components/ui/context-menu"
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
} from "@/components/ui/dropdown-menu"

type RowAction = {
  key: string
  label: string
  icon: LucideIcon
  shortcut?: string
  destructive?: boolean
  separatorBefore?: boolean
  onSelect: () => void
}

type RowActionHandlers = {
  newDocument: () => void
  newFolder: () => void
  rename: () => void
  move: () => void
  changeIcon: () => void
  copyLink: () => void
  duplicate: () => void
  remove: () => void
}

const folderActions = (
  on: RowActionHandlers,
  options: { movable: boolean }
): RowAction[] => [
  {
    key: "new-document",
    label: "New document",
    icon: FilePlus2,
    onSelect: on.newDocument,
  },
  {
    key: "new-folder",
    label: "New folder",
    icon: FolderPlus,
    onSelect: on.newFolder,
  },
  {
    key: "rename",
    label: "Rename",
    icon: Pencil,
    shortcut: "F2",
    separatorBefore: true,
    onSelect: on.rename,
  },
  ...(options.movable
    ? [{ key: "move", label: "Move to", icon: FolderInput, onSelect: on.move }]
    : []),
  { key: "copy-link", label: "Copy link", icon: Link2, onSelect: on.copyLink },
  {
    key: "delete",
    label: "Delete",
    icon: Trash2,
    destructive: true,
    separatorBefore: true,
    onSelect: on.remove,
  },
]

const documentActions = (on: RowActionHandlers): RowAction[] => [
  {
    key: "rename",
    label: "Rename",
    icon: Pencil,
    shortcut: "F2",
    onSelect: on.rename,
  },
  { key: "move", label: "Move to", icon: FolderInput, onSelect: on.move },
  {
    key: "icon",
    label: "Change icon",
    icon: SmilePlus,
    onSelect: on.changeIcon,
  },
  {
    key: "copy-link",
    label: "Copy link",
    icon: Copy,
    separatorBefore: true,
    onSelect: on.copyLink,
  },
  {
    key: "duplicate",
    label: "Duplicate",
    icon: CopyPlus,
    onSelect: on.duplicate,
  },
  {
    key: "delete",
    label: "Delete",
    icon: Trash2,
    destructive: true,
    separatorBefore: true,
    onSelect: on.remove,
  },
]

const itemClassName = "min-h-8 max-md:min-h-11"

function DropdownRowActions({ actions }: { actions: RowAction[] }) {
  return actions.map((action) => (
    <Fragment key={action.key}>
      {action.separatorBefore ? <DropdownMenuSeparator /> : null}
      <DropdownMenuItem
        className={itemClassName}
        variant={action.destructive ? "destructive" : "default"}
        onClick={action.onSelect}
      >
        <action.icon
          className={action.destructive ? undefined : "text-muted-foreground"}
        />
        {action.label}
        {action.shortcut ? (
          <DropdownMenuShortcut>{action.shortcut}</DropdownMenuShortcut>
        ) : null}
      </DropdownMenuItem>
    </Fragment>
  ))
}

function ContextRowActions({ actions }: { actions: RowAction[] }) {
  return actions.map((action) => (
    <Fragment key={action.key}>
      {action.separatorBefore ? <ContextMenuSeparator /> : null}
      <ContextMenuItem
        className={itemClassName}
        variant={action.destructive ? "destructive" : "default"}
        onClick={action.onSelect}
      >
        <action.icon
          className={action.destructive ? undefined : "text-muted-foreground"}
        />
        {action.label}
        {action.shortcut ? (
          <ContextMenuShortcut>{action.shortcut}</ContextMenuShortcut>
        ) : null}
      </ContextMenuItem>
    </Fragment>
  ))
}

export { ContextRowActions, documentActions, DropdownRowActions, folderActions }
export type { RowAction, RowActionHandlers }
