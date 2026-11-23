import { useMemo } from "react"
import { atom, useAtom } from "jotai"
import { Check, Plus } from "lucide-react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import type { TypeColor } from "../activity-types"
import { NewTypeForm } from "./NewTypeForm"
import { TypeIcon } from "./TypeIcon"

type TypeOption = {
  id: string
  name: string
  color: TypeColor
  icon: string | null
  depth?: number
}

type TypeMenuProps = {
  types: TypeOption[]
  value: string | null
  workspaceId: string
  trigger: React.ReactElement
  onChange: (typeId: string | null) => void
  label?: string
  noneLabel?: string
  canCreate?: boolean
}

const depthPadding: Record<number, string> = { 2: "pl-7", 3: "pl-12" }

const rowClassName =
  "flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-accent max-md:min-h-11"

function TypeMenu({
  types,
  value,
  workspaceId,
  trigger,
  onChange,
  label = "Type",
  noneLabel = "No type",
  canCreate = true,
}: TypeMenuProps) {
  // One menu state per instance; useMemo keeps the atom stable across renders.
  const menuAtom = useMemo(
    () =>
      atom<{ open: boolean; creating: boolean }>({
        open: false,
        creating: false,
      }),
    []
  )
  const [{ open, creating }, setMenu] = useAtom(menuAtom)
  const pick = (typeId: string | null) => {
    if (typeId !== value) onChange(typeId)
    setMenu({ open: false, creating: false })
  }
  const choices = [
    { id: null, name: noneLabel, color: null, icon: null, depth: 1 },
    ...types,
  ]

  return (
    <Popover
      open={open}
      onOpenChange={(next) => setMenu({ open: next, creating: false })}
    >
      <PopoverTrigger render={trigger} />
      <PopoverContent align="start" className="w-72 gap-1 p-1">
        {creating ? (
          <div className="p-2">
            <NewTypeForm
              workspaceId={workspaceId}
              onCancel={() => setMenu({ open: true, creating: false })}
              onCreated={(type) => pick(type.id)}
            />
          </div>
        ) : (
          <>
            <p className="px-2 pt-1.5 pb-1 text-xs text-muted-foreground">
              {label}
            </p>
            {choices.map((option) => (
              <button
                key={option.id ?? "none"}
                type="button"
                className={cn(rowClassName, depthPadding[option.depth ?? 1])}
                onClick={() => pick(option.id)}
              >
                <TypeIcon color={option.color} icon={option.icon} />
                <span
                  className={
                    option.id === null
                      ? "flex-1 text-muted-foreground"
                      : "flex-1 truncate"
                  }
                >
                  {option.name}
                </span>
                {option.id === value ? (
                  <Check className="size-4 text-accent-text" />
                ) : null}
              </button>
            ))}
            {canCreate ? (
              <>
                <Separator className="my-1" />
                <button
                  type="button"
                  className={cn(rowClassName, "text-muted-foreground")}
                  onClick={() => setMenu({ open: true, creating: true })}
                >
                  <Plus className="size-3.5" />
                  New type…
                </button>
              </>
            ) : null}
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}

export { TypeMenu }
export type { TypeOption }
