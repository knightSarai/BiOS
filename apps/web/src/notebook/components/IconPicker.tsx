import { atom, useAtom } from "jotai"
import { atomWithStorage } from "jotai/utils"
import { Search } from "lucide-react"
import { Popover, PopoverContent } from "@/components/ui/popover"
import { useSetGoalIcon } from "@/local-db/goal-mutations"
import { useSetDocumentIcon } from "@/local-db/notebook-mutations"
import { EMOJI_CATEGORIES, searchEmoji, type Emoji } from "../emoji-catalog"
import { iconPickerAtom } from "./atoms"
import type { NotebookWorkspace } from "./use-notebook-actions"

const RECENT_LIMIT = 8

const iconQueryAtom = atom("")

const safeStorage = {
  getItem: (key: string, initialValue: string[]) => {
    try {
      const raw = globalThis.localStorage?.getItem(key)
      return raw ? (JSON.parse(raw) as string[]) : initialValue
    } catch {
      return initialValue
    }
  },
  setItem: (key: string, value: string[]) => {
    try {
      globalThis.localStorage?.setItem(key, JSON.stringify(value))
    } catch {
      return
    }
  },
  removeItem: (key: string) => {
    try {
      globalThis.localStorage?.removeItem(key)
    } catch {
      return
    }
  },
}

const recentIconsAtom = atomWithStorage<string[]>(
  "bios:recent-icons",
  [],
  safeStorage,
  { getOnInit: true }
)

function EmojiGrid({
  label,
  emoji,
  onPick,
}: {
  label: string
  emoji: Emoji[]
  onPick: (emoji: string) => void
}) {
  return (
    <section className="flex flex-col gap-1">
      <h3 className="px-1 text-[11px] font-medium tracking-[0.04em] text-muted-foreground uppercase">
        {label}
      </h3>
      <div className="grid grid-cols-8 gap-0.5">
        {emoji.map((entry) => (
          <button
            key={`${label}-${entry.emoji}`}
            type="button"
            title={entry.name}
            aria-label={entry.name}
            onClick={() => onPick(entry.emoji)}
            className="flex aspect-square items-center justify-center rounded-md text-xl hover:bg-accent"
          >
            {entry.emoji}
          </button>
        ))}
      </div>
    </section>
  )
}

function IconPicker({ workspace }: { workspace: NotebookWorkspace }) {
  const [picking, setPicking] = useAtom(iconPickerAtom)
  const [query, setQuery] = useAtom(iconQueryAtom)
  const [recent, setRecent] = useAtom(recentIconsAtom)
  const setDocumentIcon = useSetDocumentIcon(workspace.id)
  const setGoalIcon = useSetGoalIcon(workspace.id)
  const close = () => {
    setPicking(null)
    setQuery("")
  }

  const choose = (icon: string | null) => {
    if (!picking) return
    if (picking.target.kind === "goal") {
      setGoalIcon.mutate({ goalId: picking.target.id, icon })
    } else {
      setDocumentIcon.mutate({ documentId: picking.target.id, icon })
    }
    if (icon) {
      setRecent((current) =>
        [icon, ...current.filter((entry) => entry !== icon)].slice(
          0,
          RECENT_LIMIT
        )
      )
    }
    close()
  }
  const results = searchEmoji(query)

  return (
    <Popover open={picking !== null} onOpenChange={(open) => !open && close()}>
      <PopoverContent
        anchor={picking?.anchor ?? undefined}
        align="start"
        className="w-80 gap-0 p-0"
        aria-label="Choose an icon"
      >
        <div className="flex items-center justify-between border-b px-3 pt-1">
          <span className="border-b-2 border-accent-text py-2 text-xs font-medium">
            Emoji
          </span>
          <button
            type="button"
            onClick={() => choose(null)}
            className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Remove
          </button>
        </div>
        <div className="p-2">
          <div className="flex items-center gap-2 rounded-md border px-2.5">
            <Search aria-hidden className="size-3.5 text-muted-foreground" />
            <input
              autoFocus
              aria-label="Search emoji"
              placeholder="Search emoji"
              onChange={(event) => setQuery(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return
                event.preventDefault()
                const first = results[0]
                if (first) choose(first.emoji)
              }}
              className="h-8 min-w-0 flex-1 bg-transparent text-sm outline-hidden placeholder:text-muted-foreground"
            />
          </div>
        </div>
        <div className="flex max-h-80 flex-col gap-3 overflow-y-auto px-2 pb-2">
          {query.trim() ? (
            results.length > 0 ? (
              <EmojiGrid label="Results" emoji={results} onPick={choose} />
            ) : (
              <p className="px-1 py-3 text-xs text-muted-foreground">
                No emoji match.
              </p>
            )
          ) : (
            <>
              {recent.length > 0 ? (
                <EmojiGrid
                  label="Recent"
                  emoji={recent.map((emoji) => ({ emoji, name: emoji }))}
                  onPick={choose}
                />
              ) : null}
              {EMOJI_CATEGORIES.map((group) => (
                <EmojiGrid
                  key={group.name}
                  label={group.name}
                  emoji={group.emoji}
                  onPick={choose}
                />
              ))}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export { IconPicker }
