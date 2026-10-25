import { useAtom } from "jotai/react"
import { useSetAtom } from "jotai/react"
import { SearchIcon, XIcon } from "lucide-react"

import { Input } from "@/components/ui/input"
import { type atomWithDebounce } from "../atoms.ts"

function DataTableSearch({
  filterAtoms,
  placeholder = "Search all columns...",
}: {
  filterAtoms: ReturnType<typeof atomWithDebounce<string>>
  placeholder?: string
}) {
  const [currentFilter] = useAtom(filterAtoms.currentValueAtom)
  const setFilter = useSetAtom(filterAtoms.debouncedValueAtom)

  return (
    <div className="relative w-full max-w-sm">
      <SearchIcon className="absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={currentFilter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder={placeholder}
        className="pl-7"
      />
      {currentFilter && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => setFilter("")}
          className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <XIcon className="size-3.5" />
        </button>
      )}
    </div>
  )
}

export { DataTableSearch }
