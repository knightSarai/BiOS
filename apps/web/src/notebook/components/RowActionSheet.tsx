import { useAtom } from "jotai"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { actionSheetAtom, type NotebookItemTarget } from "./atoms"
import { documentActions, folderActions } from "./row-actions"
import { useRowHandlers } from "./use-row-handlers"
import type { NotebookWorkspace } from "./use-notebook-actions"

function RowActionSheet({ workspace }: { workspace: NotebookWorkspace }) {
  const [item, setItem] = useAtom(actionSheetAtom)

  return (
    <Sheet open={item !== null} onOpenChange={(open) => !open && setItem(null)}>
      <SheetContent side="bottom" className="rounded-t-2xl pb-6">
        <SheetHeader className="border-b">
          <SheetTitle dir="auto" className="truncate text-base">
            {item?.title}
          </SheetTitle>
          <SheetDescription>
            {item?.kind === "folder" ? "Folder" : "Document"}
          </SheetDescription>
        </SheetHeader>
        {item ? (
          <SheetActions
            workspace={workspace}
            item={item}
            onClose={() => setItem(null)}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

function SheetActions({
  workspace,
  item,
  onClose,
}: {
  workspace: NotebookWorkspace
  item: NotebookItemTarget
  onClose: () => void
}) {
  const handlers = useRowHandlers(
    workspace,
    { kind: item.kind, id: item.id, title: item.title },
    { current: item.anchor }
  )
  const actions =
    item.kind === "folder"
      ? folderActions(handlers, { movable: item.movable ?? true })
      : documentActions(handlers)

  return (
    <ul className="flex flex-col p-2">
      {actions.map((action) => (
        <li key={action.key}>
          {action.separatorBefore ? (
            <hr className="my-1 border-border" />
          ) : null}
          <button
            type="button"
            onClick={() => {
              onClose()
              action.onSelect()
            }}
            className={cn(
              "flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-sm active:bg-accent",
              action.destructive && "text-destructive"
            )}
          >
            <action.icon
              className={cn(
                "size-5",
                !action.destructive && "text-muted-foreground"
              )}
            />
            {action.label}
          </button>
        </li>
      ))}
    </ul>
  )
}

export { RowActionSheet }
