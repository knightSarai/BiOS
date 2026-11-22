import { atom, useAtom } from "jotai"
import { ChevronLeft, Plus } from "lucide-react"
import { toast } from "sonner"
import {
  FIELD_KINDS,
  fieldKindLabels,
  type FieldKind,
} from "@/activities/fields"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import {
  useAddTypeField,
  useLinkTypeField,
} from "@/local-db/activity-type-mutations"
import { cn } from "@/lib/utils"

type LibraryField = {
  id: string
  name: string
  kind: FieldKind
  typeIds: string[]
}

const closedMenu = { open: false, search: "", creating: null }

const addFieldMenuAtom = atom<{
  open: boolean
  search: string
  creating: string | null
}>(closedMenu)

const rowClassName =
  "flex min-h-8 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-accent max-md:min-h-11"

const sameName = (a: string, b: string) =>
  a.localeCompare(b, undefined, { sensitivity: "accent" }) === 0

function AddFieldMenu({
  typeId,
  onType,
  library,
  typeNames,
  workspaceId,
}: {
  typeId: string
  onType: Set<string>
  library: LibraryField[]
  typeNames: Map<string, string>
  workspaceId: string
}) {
  const [menu, setMenu] = useAtom(addFieldMenuAtom)
  const linkField = useLinkTypeField(workspaceId)
  const addField = useAddTypeField(workspaceId)
  const search = menu.search.trim()
  const matches = library.filter(
    (field) =>
      !onType.has(field.id) &&
      (field.name.toLowerCase().includes(search.toLowerCase()) ||
        sameName(field.name, search))
  )
  const canCreate =
    search !== "" && !library.some((field) => sameName(field.name, search))
  const close = () => setMenu(closedMenu)
  const usedBy = (field: LibraryField) =>
    field.typeIds.length === 0
      ? "No type"
      : field.typeIds.flatMap((id) => typeNames.get(id) ?? []).join(", ")

  return (
    <Popover
      open={menu.open}
      onOpenChange={(open) =>
        setMenu(open ? { ...closedMenu, open } : closedMenu)
      }
    >
      <PopoverTrigger render={<Button variant="outline" />}>
        <Plus data-icon="inline-start" />
        Add field
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 gap-1 p-1">
        {menu.creating === null ? (
          <>
            <input
              autoFocus
              aria-label="Search fields or name a new one"
              placeholder="Search or name a new field"
              dir="auto"
              value={menu.search}
              onChange={(event) =>
                setMenu({ ...menu, search: event.currentTarget.value })
              }
              onKeyDown={(event) => {
                if (event.key !== "Enter") return
                event.preventDefault()
                if (search === "") return
                const exact = library.filter((field) =>
                  sameName(field.name, search)
                )
                const [only] = exact
                if (exact.length === 1 && only && !onType.has(only.id)) {
                  linkField.mutate({ typeId, fieldId: only.id })
                  close()
                } else if (canCreate) {
                  setMenu({ ...menu, creating: search })
                }
              }}
              className="m-1 h-8 rounded-md border bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/30 max-md:h-11"
            />
            {matches.length > 0 ? (
              <div className="flex max-h-72 flex-col overflow-y-auto">
                {matches.map((field) => (
                  <button
                    key={field.id}
                    type="button"
                    className={rowClassName}
                    onClick={() => {
                      linkField.mutate({ typeId, fieldId: field.id })
                      close()
                    }}
                  >
                    <span className="flex-1 truncate">{field.name}</span>
                    <span className="w-20 shrink-0 text-xs text-muted-foreground">
                      {fieldKindLabels[field.kind]}
                    </span>
                    <span className="max-w-28 truncate text-xs text-muted-foreground">
                      {usedBy(field)}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
            {canCreate ? (
              <>
                {matches.length > 0 ? <Separator className="my-1" /> : null}
                <button
                  type="button"
                  className={rowClassName}
                  onClick={() => setMenu({ ...menu, creating: search })}
                >
                  <Plus className="size-3.5" />
                  <span className="truncate">Create “{search}”</span>
                </button>
              </>
            ) : null}
            {search !== "" && matches.length === 0 && !canCreate ? (
              <p className="px-2 py-1.5 text-sm text-muted-foreground">
                Already on this type.
              </p>
            ) : null}
          </>
        ) : (
          <>
            <button
              type="button"
              className={cn(rowClassName, "text-muted-foreground")}
              onClick={() => setMenu({ ...menu, creating: null })}
            >
              <ChevronLeft className="size-3.5" />
              <span className="truncate">Create “{menu.creating}” as</span>
            </button>
            <Separator className="my-1" />
            {FIELD_KINDS.map((kind) => (
              <button
                key={kind}
                type="button"
                className={rowClassName}
                disabled={addField.isPending}
                onClick={() => {
                  const name = menu.creating ?? ""
                  addField.mutate(
                    { typeId, name, kind },
                    {
                      onSuccess: close,
                      onError: (error) =>
                        toast.error(
                          error instanceof Error
                            ? error.message
                            : "Couldn't create the field."
                        ),
                    }
                  )
                }}
              >
                {fieldKindLabels[kind]}
              </button>
            ))}
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}

export { AddFieldMenu }
export type { LibraryField }
