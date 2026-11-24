import { useQuery } from "@tanstack/react-query"
import { useParams, useRouteContext } from "@tanstack/react-router"
import { atom, useAtom, useSetAtom } from "jotai"
import { Trash } from "lucide-react"
import { toast } from "sonner"
import { colorName } from "@/activities/areas"
import { ColorDot } from "@/activities/components/ColorDot"
import { ColorPicker } from "@/activities/components/ColorPicker"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useUpdateArea } from "@/local-db/activity-mutations"
import { areasQuery } from "@/local-db/activity-queries"
import { defaultAreaIdFor, type AreaChanges } from "@/local-db/areas"
import { InlineName } from "@/notebook/components/InlineName"
import { crumbMenuItemClassName as itemClassName } from "@layout/core/copy-to-clipboard"
import { PageCrumb } from "@layout/core/PageCrumb"
import { DeleteAreaDialog, deleteAreaDialogOpenAtom } from "./DeleteAreaDialog"

const ROUTE_ID = "/_authenticated/$workspace/_app/areas/$areaId"

const renamingAreaAtom = atom<string | null>(null)

// Annotated because the route's own definition includes this crumb, and the dialog's typed
// link to the route would otherwise make their types depend on each other.
function AreaCrumb(): React.JSX.Element {
  const { areaId } = useParams({ from: ROUTE_ID })
  const { workspace } = useRouteContext({ from: ROUTE_ID })
  const { data: areas } = useQuery(areasQuery(workspace))
  const openDelete = useSetAtom(deleteAreaDialogOpenAtom)
  const [renaming, setRenaming] = useAtom(renamingAreaAtom)
  const update = useUpdateArea(workspace.id)
  const area = areas?.find((candidate) => candidate.id === areaId)
  if (!areas || !area) return <PageCrumb>Area</PageCrumb>
  const deletable = area.id !== defaultAreaIdFor(workspace.id)
  const change = (changes: AreaChanges) =>
    update.mutate(
      { id: area.id, changes },
      { onError: (error) => toast.error(error.message) }
    )

  return (
    <>
      <PageCrumb
        icon={
          <Popover>
            <PopoverTrigger
              aria-label={`Colour, ${colorName(area.color)}`}
              title="Change colour"
              className="-mx-1 flex size-5 shrink-0 items-center justify-center rounded-sm transition-colors hover:bg-accent data-popup-open:bg-accent max-md:-mx-3 max-md:size-11"
            >
              <ColorDot color={area.color} className="size-2" />
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-2">
              <ColorPicker
                value={area.color}
                onChange={(color) => change({ color })}
              />
            </PopoverContent>
          </Popover>
        }
        actionsLabel={`Actions for ${area.name}`}
        actions={
          deletable ? (
            <DropdownMenuItem
              className={itemClassName}
              variant="destructive"
              onClick={() => openDelete(area.id)}
            >
              <Trash />
              Delete
            </DropdownMenuItem>
          ) : undefined
        }
      >
        {renaming === area.id ? (
          <InlineName
            label="Area name"
            defaultValue={area.name}
            onSubmit={(name) => {
              setRenaming(null)
              change({ name })
            }}
            onCancel={() => setRenaming(null)}
          />
        ) : (
          <button
            type="button"
            title="Rename"
            aria-label={`Rename ${area.name}`}
            onClick={() => setRenaming(area.id)}
            className="-mx-1 min-w-0 truncate rounded-sm px-1 text-left transition-colors hover:bg-accent"
          >
            <span dir="auto">{area.name}</span>
          </button>
        )}
      </PageCrumb>
      {deletable ? (
        <DeleteAreaDialog
          area={area}
          areas={areas}
          workspace={{ id: workspace.id, slug: workspace.slug }}
        />
      ) : null}
    </>
  )
}

export { AreaCrumb }
