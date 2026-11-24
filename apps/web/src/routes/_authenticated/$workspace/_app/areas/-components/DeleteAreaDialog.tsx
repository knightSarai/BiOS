import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { atom, useAtom } from "jotai"
import { toast } from "sonner"
import { activityKey } from "@/activities/areas"
import { ColorDot } from "@/activities/components/ColorDot"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useDeleteArea } from "@/local-db/activity-mutations"
import { activityListQuery } from "@/local-db/activity-queries"
import { defaultAreaIdFor } from "@/local-db/areas"
import type { AreaRow } from "@/local-db/db"
import { entityDocumentsQuery } from "@/local-db/notebook-queries"

const deleteAreaDialogOpenAtom = atom<string | null>(null)
const moveIntoAtom = atom<string | null>(null)

type DeleteAreaDialogProps = {
  area: AreaRow
  areas: AreaRow[]
  workspace: { id: string; slug: string }
}

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`

function DeleteAreaDialog({ area, areas, workspace }: DeleteAreaDialogProps) {
  const [openFor, setOpenFor] = useAtom(deleteAreaDialogOpenAtom)
  const [chosen, setChosen] = useAtom(moveIntoAtom)
  const open = openFor === area.id
  const setOpen = (next: boolean) => {
    setOpenFor(next ? area.id : null)
    if (!next) setChosen(null)
  }
  const navigate = useNavigate()
  const remove = useDeleteArea(workspace.id)
  const { data: activities } = useQuery({
    ...activityListQuery(workspace.id),
    enabled: open,
  })
  const { data: documents } = useQuery({
    ...entityDocumentsQuery(workspace.id, { kind: "area", id: area.id }),
    enabled: open,
  })

  const others = areas.filter((other) => other.id !== area.id)
  const fallback =
    others.find((other) => other.id === defaultAreaIdFor(workspace.id)) ??
    others[0]
  const into = others.find((other) => other.id === chosen) ?? fallback
  const moving = (activities ?? []).filter(
    (activity) => activity.areaId === area.id
  ).length
  const ownDocuments = documents?.inFolder.length ?? 0
  const attachedDocuments = documents?.attached.length ?? 0
  const items = others.map((other) => ({ value: other.id, label: other.name }))

  const confirm = async () => {
    if (!into) return
    setOpen(false)
    await navigate({
      to: "/$workspace/areas/$areaId",
      params: { workspace: workspace.slug, areaId: into.id },
    })
    try {
      const { moved } = await remove.mutateAsync({
        id: area.id,
        intoAreaId: into.id,
      })
      toast.success(
        moved > 0
          ? `Deleted ${area.name}; ${plural(moved, "activity", "activities")} moved to ${into.name}`
          : `Deleted ${area.name}`
      )
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : `Couldn't delete ${area.name}.`
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {area.name}?</DialogTitle>
        </DialogHeader>
        {into ? (
          <dl className="grid grid-cols-[76px_minmax(0,1fr)] items-center gap-x-2 gap-y-1 text-sm">
            <dt className="text-xs text-muted-foreground">Move to</dt>
            <dd>
              <Select
                items={items}
                value={into.id}
                onValueChange={(next: string | null) => {
                  if (next) setChosen(next)
                }}
              >
                <SelectTrigger
                  aria-label="Move to"
                  className="w-full max-md:h-11"
                >
                  <ColorDot color={into.color} className="size-2 shrink-0" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {others.map((other) => (
                    <SelectItem key={other.id} value={other.id}>
                      <ColorDot
                        color={other.color}
                        className="size-2 shrink-0"
                      />
                      {other.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </dd>
            <dt className="text-xs text-muted-foreground">Activities</dt>
            <dd className="min-h-8 content-center tabular-nums">
              {moving === 0
                ? "None"
                : `${moving} · become ${activityKey(into.key, into.nextNumber)}${
                    moving > 1
                      ? ` to ${activityKey(into.key, into.nextNumber + moving - 1)}`
                      : ""
                  }`}
            </dd>
            <dt className="text-xs text-muted-foreground">Documents</dt>
            <dd className="min-h-8 content-center tabular-nums">
              {ownDocuments === 0 && attachedDocuments === 0
                ? "None"
                : [
                    ownDocuments > 0 ? `${ownDocuments} move` : null,
                    attachedDocuments > 0
                      ? `${plural(attachedDocuments, "attached one stays", "attached ones stay")} where ${attachedDocuments === 1 ? "it is" : "they are"}`
                      : null,
                  ]
                    .filter((part) => part !== null)
                    .join(" · ")}
            </dd>
          </dl>
        ) : null}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            Cancel
          </DialogClose>
          <Button
            variant="destructive"
            disabled={!into || remove.isPending}
            onClick={() => void confirm()}
          >
            {moving > 0 ? `Move ${moving} and delete` : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export { DeleteAreaDialog, deleteAreaDialogOpenAtom }
