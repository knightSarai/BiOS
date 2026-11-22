import { Link, useNavigate } from "@tanstack/react-router"
import { atom, useAtom } from "jotai"
import { Plus } from "lucide-react"
import { toast } from "sonner"
import type { TypeColor } from "@/activities/activity-types"
import { NewTypeForm } from "@/activities/components/NewTypeForm"
import { TypeIcon } from "@/activities/components/TypeIcon"
import { TypeMenu } from "@/activities/components/TypeMenu"
import {
  MAX_TYPE_DEPTH,
  parentChoices,
  typeDepth,
} from "@/activities/type-tree"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useSetTypeParent } from "@/local-db/activity-type-mutations"
import { cn } from "@/lib/utils"

type PlacedType = {
  id: string
  name: string
  color: TypeColor
  parentId: string | null
  depth: number
}

const newSubtypeOpenAtom = atom(false)

const valueClassName =
  "flex min-h-8 min-w-0 items-center gap-2 rounded-md px-2 text-left hover:bg-accent max-md:min-h-11"

function Row({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

function TypePlacement({
  type,
  types,
  workspace,
}: {
  type: Omit<PlacedType, "depth">
  types: PlacedType[]
  workspace: { id: string; slug: string }
}) {
  const navigate = useNavigate()
  const setParent = useSetTypeParent(workspace.id)
  const [newSubtypeOpen, setNewSubtypeOpen] = useAtom(newSubtypeOpenAtom)
  const parent = types.find((entry) => entry.id === type.parentId) ?? null
  const subtypes = types.filter((entry) => entry.parentId === type.id)
  const canHaveSubtypes = typeDepth(types, type.id) < MAX_TYPE_DEPTH

  return (
    <div className="flex flex-col gap-1">
      <Row label="Parent type">
        <TypeMenu
          types={parentChoices(types, type.id)}
          value={type.parentId}
          workspaceId={workspace.id}
          label="Parent type"
          noneLabel="No parent"
          canCreate={false}
          onChange={(parentId) =>
            setParent.mutate(
              { id: type.id, parentId },
              {
                onError: (error) =>
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : "Couldn't move the type."
                  ),
              }
            )
          }
          trigger={
            <button
              type="button"
              aria-label={`Parent type: ${parent?.name ?? "No parent"}`}
              className={valueClassName}
            >
              <TypeIcon color={parent?.color ?? null} />
              <span
                className={cn("truncate", !parent && "text-muted-foreground")}
              >
                {parent?.name ?? "No parent"}
              </span>
            </button>
          }
        />
      </Row>
      <Row label="Subtypes">
        <div className="flex flex-wrap items-center gap-1">
          {subtypes.map((subtype) => (
            <Link
              key={subtype.id}
              to="/$workspace/settings/activity-types/$typeId"
              params={{ workspace: workspace.slug, typeId: subtype.id }}
              className={valueClassName}
            >
              <TypeIcon color={subtype.color} />
              <span className="truncate">{subtype.name}</span>
            </Link>
          ))}
          {canHaveSubtypes ? (
            <Popover open={newSubtypeOpen} onOpenChange={setNewSubtypeOpen}>
              <PopoverTrigger
                render={
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground max-md:h-11"
                  />
                }
              >
                <Plus data-icon="inline-start" />
                New subtype
              </PopoverTrigger>
              <PopoverContent align="start" className="w-80">
                <NewTypeForm
                  workspaceId={workspace.id}
                  parent={{ id: type.id, color: type.color }}
                  onCancel={() => setNewSubtypeOpen(false)}
                  onCreated={(created) => {
                    setNewSubtypeOpen(false)
                    void navigate({
                      to: "/$workspace/settings/activity-types/$typeId",
                      params: { workspace: workspace.slug, typeId: created.id },
                    })
                  }}
                />
              </PopoverContent>
            </Popover>
          ) : subtypes.length === 0 ? (
            <span className="px-2 text-muted-foreground">None</span>
          ) : null}
        </div>
      </Row>
    </div>
  )
}

export { TypePlacement }
