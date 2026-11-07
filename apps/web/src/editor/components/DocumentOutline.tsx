import { useAtomValue, useStore } from "jotai"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { activeHeadingIndex, outlineOf } from "../outline"
import type { EditorAtoms } from "./editor-atoms"

const ACTIVE_HEADING_OFFSET_PX = 96

const dashClassName: Record<number, string> = {
  1: "w-2.5",
  2: "ml-0.5 w-2",
  3: "ml-1 w-1.5",
}

const itemClassName: Record<number, string> = {
  1: "pl-2",
  2: "pl-6",
  3: "pl-10",
}

const scrollParentOf = (element: HTMLElement) => {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node)
    if (overflowY === "auto" || overflowY === "scroll") return node
  }
  return null
}

const keepEditorFocus = (event: React.PointerEvent) => event.preventDefault()

type DocumentOutlineProps = {
  atoms: EditorAtoms
}

function DocumentOutline({ atoms }: DocumentOutlineProps) {
  const store = useStore()
  const snapshot = useAtomValue(atoms.snapshot)
  const activeHeading = useAtomValue(atoms.activeHeading)
  const headings = snapshot ? outlineOf(snapshot.state.doc) : []

  const trackActiveHeading = (rail: HTMLElement | null) => {
    if (!rail) return
    const scroller = scrollParentOf(rail)
    if (!scroller) return
    const measure = () => {
      const view = store.get(atoms.snapshot)?.view
      if (!view) return
      const tops = outlineOf(view.state.doc).map(({ pos }) => {
        const dom = view.nodeDOM(pos)
        return dom instanceof HTMLElement
          ? dom.getBoundingClientRect().top
          : Number.POSITIVE_INFINITY
      })
      store.set(
        atoms.activeHeading,
        activeHeadingIndex(
          tops,
          scroller.getBoundingClientRect().top + ACTIVE_HEADING_OFFSET_PX
        )
      )
    }
    let measuredDoc = store.get(atoms.snapshot)?.state.doc
    const onSnapshot = () => {
      const doc = store.get(atoms.snapshot)?.state.doc
      if (doc === measuredDoc) return
      measuredDoc = doc
      measure()
    }
    measure()
    scroller.addEventListener("scroll", measure, { passive: true })
    const unsubscribe = store.sub(atoms.snapshot, onSnapshot)
    return () => {
      scroller.removeEventListener("scroll", measure)
      unsubscribe()
    }
  }

  const scrollToHeading = (pos: number) => {
    const dom = snapshot?.view.nodeDOM(pos)
    if (dom instanceof HTMLElement) {
      dom.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }

  if (headings.length === 0) return null

  return (
    <div
      ref={trackActiveHeading}
      className="absolute top-1/2 left-5 -translate-y-1/2 max-md:hidden"
    >
      <Popover>
        <PopoverTrigger
          openOnHover
          onPointerDown={keepEditorFocus}
          delay={0}
          closeDelay={150}
          aria-label="Outline"
          className="flex w-6.5 flex-col items-start gap-2 rounded-md p-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {headings.map((heading, index) => (
            <span
              key={heading.pos}
              className={cn(
                "h-0.5 shrink-0 rounded-full transition-colors",
                dashClassName[heading.level] ?? dashClassName[3],
                index === activeHeading
                  ? "bg-foreground"
                  : "bg-muted-foreground/40"
              )}
            />
          ))}
        </PopoverTrigger>
        <PopoverContent
          side="right"
          align="center"
          sideOffset={({ anchor }) => -anchor.width}
          initialFocus={false}
          finalFocus={false}
          className="max-h-[60vh] w-64 gap-0 overflow-y-auto p-1.5"
        >
          <nav aria-label="Outline" className="flex flex-col">
            {headings.map((heading, index) => (
              <button
                key={heading.pos}
                type="button"
                onPointerDown={keepEditorFocus}
                dir="auto"
                aria-current={index === activeHeading ? "location" : undefined}
                onClick={() => scrollToHeading(heading.pos)}
                className={cn(
                  "truncate rounded-md py-1.5 pr-2 text-start text-sm transition-colors outline-none hover:bg-accent focus-visible:bg-accent",
                  itemClassName[heading.level] ?? itemClassName[3],
                  index === activeHeading
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {heading.text}
              </button>
            ))}
          </nav>
        </PopoverContent>
      </Popover>
    </div>
  )
}

export { DocumentOutline }
