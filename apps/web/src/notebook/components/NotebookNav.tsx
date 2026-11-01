import { ClientOnly, Link } from "@tanstack/react-router"
import { FilePlus2, FolderPlus, Plus } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ROOT_FOLDER_ID } from "@/local-db/db"
import { NotebookTree } from "./NotebookTree"
import {
  useNotebookActions,
  type NotebookWorkspace,
} from "./use-notebook-actions"

type NotebookNavProps = {
  workspace: NotebookWorkspace
  onNavigate?: () => void
}

function NotebookNav({ workspace, onNavigate }: NotebookNavProps) {
  const actions = useNotebookActions(workspace)

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between pt-[18px] pr-1 pb-1.5 pl-2">
        <Link
          to="/$workspace/notebook"
          params={{ workspace: workspace.slug }}
          onClick={onNavigate}
          className="text-[11px] font-medium tracking-[0.04em] text-muted-foreground uppercase hover:text-foreground"
        >
          Notebook
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                aria-label="New in notebook"
                className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground aria-expanded:bg-sidebar-accent aria-expanded:text-foreground max-md:size-11"
              />
            }
          >
            <Plus className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuItem
              className="min-h-8 max-md:min-h-11"
              onClick={() => {
                onNavigate?.()
                void actions.newDocument(ROOT_FOLDER_ID)
              }}
            >
              <FilePlus2 className="text-muted-foreground" />
              New document
            </DropdownMenuItem>
            <DropdownMenuItem
              className="min-h-8 max-md:min-h-11"
              onClick={() => void actions.newFolder(ROOT_FOLDER_ID)}
            >
              <FolderPlus className="text-muted-foreground" />
              New folder
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <p className="px-2 py-1 text-xs text-muted-foreground">
              Creates it at the top of the notebook. Use a folder's + to create
              inside it.
            </p>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {/* The tree reads this device's database, which the server can't see. */}
      <ClientOnly>
        <NotebookTree workspace={workspace} onNavigate={onNavigate} />
      </ClientOnly>
    </div>
  )
}

export { NotebookNav }
