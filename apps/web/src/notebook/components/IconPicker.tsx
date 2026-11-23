import { Radio } from "@base-ui/react/radio"
import { RadioGroup } from "@base-ui/react/radio-group"
import { atom, useAtom, useAtomValue, useSetAtom } from "jotai"
import { useQuery } from "@tanstack/react-query"
import { atomWithStorage } from "jotai/utils"
import { Check, FileText, Search } from "lucide-react"
import { z } from "zod"
import { Popover, PopoverContent } from "@/components/ui/popover"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { documentQuery } from "@/local-db/document-queries"
import { useSetGoalIcon } from "@/local-db/goal-mutations"
import { goalQuery } from "@/local-db/goal-queries"
import { useSetDocumentIcon } from "@/local-db/notebook-mutations"
import { cn } from "@/lib/utils"
import { EMOJI_CATEGORIES, searchEmoji, type Emoji } from "../emoji-catalog"
import {
  ICON_CATEGORIES,
  iconLabel,
  searchIcons,
  type CatalogIcon,
} from "../icon-catalog"
import { ICON_PATHS } from "../icon-paths.generated"
import {
  DEFAULT_DOCUMENT_ICON,
  DEFAULT_ICON_COLOR,
  hasCustomIcon,
  ICON_COLOR_NAMES,
  ICON_COLORS,
  iconValue,
  isIconColor,
  parseStoredIcon,
  type IconColor,
  type StoredIcon,
} from "../stored-icon"
import { iconPickerAtom } from "./atoms"
import { IconGlyph } from "./StoredIcon"
import type { NotebookWorkspace } from "./use-notebook-actions"

const RECENT_LIMIT = 8

const selectedClassName = "bg-accent ring-1 ring-border"

type PickerTab = "icons" | "emojis"

const pickerTabAtom = atom<PickerTab | null>(null)
const emojiQueryAtom = atom("")
const iconQueryAtom = atom("")

const safeStorage = <T,>(schema: z.ZodType<T>) => ({
  getItem: (key: string, initialValue: T) => {
    try {
      const raw = globalThis.localStorage?.getItem(key)
      if (!raw) return initialValue
      const parsed = schema.safeParse(JSON.parse(raw))
      return parsed.success ? parsed.data : initialValue
    } catch {
      return initialValue
    }
  },
  setItem: (key: string, value: T) => {
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
})

const recentIconsAtom = atomWithStorage(
  "bios:recent-icons",
  [],
  safeStorage(z.array(z.string())),
  { getOnInit: true }
)

const iconColorAtom = atomWithStorage<IconColor>(
  "bios:icon-color",
  DEFAULT_ICON_COLOR,
  safeStorage(z.enum(ICON_COLOR_NAMES)),
  { getOnInit: true }
)

function SectionLabel({ children }: { children: string }) {
  return (
    <h3 className="px-1 text-[10px] font-medium tracking-[0.04em] text-muted-foreground uppercase">
      {children}
    </h3>
  )
}

function EmojiGrid({
  label,
  emoji,
  selected,
  onPick,
}: {
  label: string
  emoji: Emoji[]
  selected: string | null
  onPick: (emoji: string) => void
}) {
  return (
    <section className="flex flex-col gap-1">
      <SectionLabel>{label}</SectionLabel>
      <div className="grid grid-cols-9">
        {emoji.map((entry) => (
          <button
            key={`${label}-${entry.emoji}`}
            type="button"
            title={entry.name}
            aria-label={entry.name}
            aria-pressed={entry.emoji === selected}
            onClick={() => onPick(entry.emoji)}
            className={cn(
              "flex aspect-square items-center justify-center rounded-md text-base hover:bg-accent",
              entry.emoji === selected && selectedClassName
            )}
          >
            {entry.emoji}
          </button>
        ))}
      </div>
    </section>
  )
}

function IconGrid({
  label,
  icons,
  glyphClassName,
  selected,
  onPick,
}: {
  label: string
  icons: CatalogIcon[]
  glyphClassName: string
  selected: string | null
  onPick: (name: string) => void
}) {
  return (
    <section className="flex flex-col gap-1">
      <SectionLabel>{label}</SectionLabel>
      <div className="grid grid-cols-10">
        {icons.map((entry) => {
          const paths = ICON_PATHS.get(entry.name)
          if (!paths) return null
          return (
            <button
              key={entry.name}
              type="button"
              title={iconLabel(entry.name)}
              aria-label={iconLabel(entry.name)}
              aria-pressed={entry.name === selected}
              onClick={() => onPick(entry.name)}
              className={cn(
                "flex aspect-square items-center justify-center rounded-md hover:bg-accent",
                entry.name === selected && selectedClassName
              )}
            >
              <IconGlyph
                paths={paths}
                className={cn("size-4", glyphClassName)}
              />
            </button>
          )
        })}
      </div>
    </section>
  )
}

function ColorSwatches() {
  const [selected, setSelected] = useAtom(iconColorAtom)
  return (
    <RadioGroup
      value={selected}
      onValueChange={(value) => {
        if (typeof value === "string" && isIconColor(value)) setSelected(value)
      }}
      aria-label="Icon color"
      className="flex items-center justify-between border-b px-2.5 py-2"
    >
      {ICON_COLOR_NAMES.map((color) => (
        <Radio.Root
          key={color}
          value={color}
          aria-label={ICON_COLORS[color].label}
          title={ICON_COLORS[color].label}
          className={cn(
            "flex size-5 items-center justify-center rounded-full ring-offset-2 ring-offset-popover transition-shadow hover:ring-2 hover:ring-border focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden",
            ICON_COLORS[color].swatch
          )}
        >
          <Radio.Indicator>
            <Check aria-hidden className="size-3 text-background" />
          </Radio.Indicator>
        </Radio.Root>
      ))}
    </RadioGroup>
  )
}

function SearchField({
  label,
  value,
  onChange,
  onSubmit,
}: {
  label: string
  value: string
  onChange: (query: string) => void
  onSubmit: () => void
}) {
  return (
    <div className="p-2">
      <div className="flex items-center gap-1.5 rounded-md border px-2">
        <Search aria-hidden className="size-3 text-muted-foreground" />
        <input
          autoFocus
          aria-label={label}
          placeholder={label}
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return
            event.preventDefault()
            onSubmit()
          }}
          className="h-7 min-w-0 flex-1 bg-transparent text-xs outline-hidden placeholder:text-muted-foreground"
        />
      </div>
    </div>
  )
}

function NoMatches({ children }: { children: string }) {
  return <p className="px-1 py-3 text-xs text-muted-foreground">{children}</p>
}

function DefaultFileIcon({
  selected,
  onPick,
}: {
  selected: boolean
  onPick: () => void
}) {
  return (
    <section className="flex flex-col gap-1">
      <SectionLabel>Default</SectionLabel>
      <div className="grid grid-cols-10">
        <button
          type="button"
          title="file"
          aria-label="file"
          aria-pressed={selected}
          onClick={onPick}
          className={cn(
            "flex aspect-square items-center justify-center rounded-md hover:bg-accent",
            selected && selectedClassName
          )}
        >
          <FileText aria-hidden className="size-4 text-muted-foreground" />
        </button>
      </div>
    </section>
  )
}

function IconsPanel({
  current,
  offerDefault,
  tintClassName,
  onPick,
}: {
  current: StoredIcon | null
  offerDefault: boolean
  tintClassName: string | null
  onPick: (value: string) => void
}) {
  const [query, setQuery] = useAtom(iconQueryAtom)
  const chosenColor = useAtomValue(iconColorAtom)
  // A tinted picker's icons take their colour from the owner, so the stored colour stays neutral.
  const color = tintClassName === null ? chosenColor : DEFAULT_ICON_COLOR
  const glyphClassName = tintClassName ?? ICON_COLORS[color].text
  const results = searchIcons(query)
  const pick = (name: string) => onPick(iconValue(name, color))
  const selected = current?.kind === "icon" ? current.name : null

  return (
    <>
      {tintClassName === null ? <ColorSwatches /> : null}
      <SearchField
        label="Search icons"
        value={query}
        onChange={setQuery}
        onSubmit={() => {
          const first = results[0]
          if (first) pick(first.name)
        }}
      />
      <div className="flex max-h-64 flex-col gap-2.5 overflow-y-auto px-2 pb-2">
        {query.trim() ? (
          results.length > 0 ? (
            <IconGrid
              label="Results"
              icons={results}
              glyphClassName={glyphClassName}
              selected={selected}
              onPick={pick}
            />
          ) : (
            <NoMatches>No icons match.</NoMatches>
          )
        ) : (
          <>
            {offerDefault ? (
              <DefaultFileIcon
                selected={current === null || current.kind === "file"}
                onPick={() => onPick(DEFAULT_DOCUMENT_ICON)}
              />
            ) : null}
            {ICON_CATEGORIES.map((group) => (
              <IconGrid
                key={group.name}
                label={group.name}
                icons={group.icons}
                glyphClassName={glyphClassName}
                selected={selected}
                onPick={pick}
              />
            ))}
          </>
        )}
      </div>
    </>
  )
}

function EmojisPanel({
  current,
  onPick,
}: {
  current: StoredIcon | null
  onPick: (value: string) => void
}) {
  const [query, setQuery] = useAtom(emojiQueryAtom)
  const [recent, setRecent] = useAtom(recentIconsAtom)
  const results = searchEmoji(query)
  const selected = current?.kind === "emoji" ? current.emoji : null
  const pick = (emoji: string) => {
    setRecent((current) =>
      [emoji, ...current.filter((entry) => entry !== emoji)].slice(
        0,
        RECENT_LIMIT
      )
    )
    onPick(emoji)
  }

  return (
    <>
      <SearchField
        label="Search emoji"
        value={query}
        onChange={setQuery}
        onSubmit={() => {
          const first = results[0]
          if (first) pick(first.emoji)
        }}
      />
      <div className="flex max-h-64 flex-col gap-2.5 overflow-y-auto px-2 pb-2">
        {query.trim() ? (
          results.length > 0 ? (
            <EmojiGrid
              label="Results"
              emoji={results}
              selected={selected}
              onPick={pick}
            />
          ) : (
            <NoMatches>No emoji match.</NoMatches>
          )
        ) : (
          <>
            {recent.length > 0 ? (
              <EmojiGrid
                label="Recent"
                emoji={recent.map((emoji) => ({ emoji, name: emoji }))}
                selected={selected}
                onPick={pick}
              />
            ) : null}
            {EMOJI_CATEGORIES.map((group) => (
              <EmojiGrid
                key={group.name}
                label={group.name}
                emoji={group.emoji}
                selected={selected}
                onPick={pick}
              />
            ))}
          </>
        )}
      </div>
    </>
  )
}

const resetIconChooserAtom = atom(null, (_get, set) => {
  set(pickerTabAtom, null)
  set(emojiQueryAtom, "")
  set(iconQueryAtom, "")
})

// `tintClassName` colours every icon for an owner that sets the colour itself, and hides the swatches.
function IconChooser({
  value,
  removeTo,
  offerDefault,
  tintClassName,
  onChoose,
}: {
  value: string | null
  removeTo: string | null
  offerDefault: boolean
  tintClassName: string | null
  onChoose: (icon: string | null) => void
}) {
  const [tab, setTab] = useAtom(pickerTabAtom)
  const current = value ? parseStoredIcon(value) : null

  return (
    <Tabs
      value={tab ?? (current?.kind === "emoji" ? "emojis" : "icons")}
      onValueChange={(next) => setTab(next === "emojis" ? "emojis" : "icons")}
      className="gap-0"
    >
      <div className="flex items-center justify-between border-b px-2.5 pt-0.5">
        <TabsList variant="line" className="gap-3 p-0">
          <TabsTrigger value="icons" className="px-0 py-1.5">
            Icons
          </TabsTrigger>
          <TabsTrigger value="emojis" className="px-0 py-1.5">
            Emojis
          </TabsTrigger>
        </TabsList>
        {hasCustomIcon(value) ? (
          <button
            type="button"
            onClick={() => onChoose(removeTo)}
            className="rounded-md px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Remove
          </button>
        ) : null}
      </div>
      <TabsContent value="icons">
        <IconsPanel
          current={current}
          offerDefault={offerDefault}
          tintClassName={tintClassName}
          onPick={onChoose}
        />
      </TabsContent>
      <TabsContent value="emojis">
        <EmojisPanel current={current} onPick={onChoose} />
      </TabsContent>
    </Tabs>
  )
}

function IconPicker({ workspace }: { workspace: NotebookWorkspace }) {
  const [picking, setPicking] = useAtom(iconPickerAtom)
  const resetChooser = useSetAtom(resetIconChooserAtom)
  const setDocumentIcon = useSetDocumentIcon(workspace.id)
  const setGoalIcon = useSetGoalIcon(workspace.id)
  const target = picking?.target ?? null
  const documentIcon = useQuery({
    ...documentQuery(workspace.id, target?.id ?? ""),
    enabled: target?.kind === "document",
    select: (row) => row?.icon ?? null,
  }).data
  const goalIcon = useQuery({
    ...goalQuery(workspace.id, target?.id ?? ""),
    enabled: target?.kind === "goal",
    select: (row) => row?.icon ?? null,
  }).data
  const currentValue =
    (target?.kind === "goal" ? goalIcon : documentIcon) ?? null
  const close = () => {
    setPicking(null)
    resetChooser()
  }

  const choose = (icon: string | null) => {
    if (!picking) return
    if (picking.target.kind === "goal") {
      setGoalIcon.mutate({ goalId: picking.target.id, icon })
    } else {
      setDocumentIcon.mutate({ documentId: picking.target.id, icon })
    }
    close()
  }

  return (
    <Popover open={picking !== null} onOpenChange={(open) => !open && close()}>
      <PopoverContent
        anchor={picking?.anchor ?? undefined}
        align="start"
        className="w-72 gap-0 p-0"
        aria-label="Choose an icon"
      >
        <IconChooser
          value={currentValue}
          removeTo={target?.kind === "document" ? DEFAULT_DOCUMENT_ICON : null}
          offerDefault={target?.kind === "document"}
          tintClassName={null}
          onChoose={choose}
        />
      </PopoverContent>
    </Popover>
  )
}

export { IconChooser, IconPicker, resetIconChooserAtom }
