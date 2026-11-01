import { useNavigate } from "@tanstack/react-router"
import { ChevronLeft, ChevronRight } from "lucide-react"
import {
  addCivilDays,
  formatDayLabel,
  formatWeekLabel,
  isoWeekDays,
  now,
  toLocalDate,
} from "@knight-os/server/core"
import { useOpenJournalPage } from "@/local-db/notebook-mutations"
import { cn } from "@/lib/utils"
import type { JournalPeriod, JournalRef } from "../periods"

type JournalStripProps = {
  journal: JournalRef
  workspace: { id: string; slug: string; timezone: string }
}

const chipClassName =
  "flex min-h-7 shrink-0 items-center rounded-full border px-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground max-md:min-h-11"

const stepClassName =
  "flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground max-md:size-11"

function JournalStrip({ journal, workspace }: JournalStripProps) {
  const navigate = useNavigate()
  const openPage = useOpenJournalPage(workspace.id)
  const today = toLocalDate(now(), workspace.timezone)

  const open = async (period: JournalPeriod, date: string) => {
    const documentId = await openPage.mutateAsync({ period, date })
    await navigate({
      to: "/$workspace/documents/$documentId",
      params: { workspace: workspace.slug, documentId },
    })
  }

  // A week page belongs to the year in its key, which can differ from its Monday's year.
  const pageYear = journal.key.slice(0, 4)
  const step = journal.period === "day" ? 1 : journal.period === "week" ? 7 : 0
  const yearStep = (offset: number) => `${Number(journal.key) + offset}-01-01`
  const previous = () =>
    journal.period === "year"
      ? open("year", yearStep(-1))
      : open(journal.period, addCivilDays(journal.date, -step))
  const next = () =>
    journal.period === "year"
      ? open("year", yearStep(1))
      : open(journal.period, addCivilDays(journal.date, step))

  return (
    <nav
      aria-label="Journal"
      className="-mx-1 mb-3 flex [scrollbar-width:none] items-center gap-1 overflow-x-auto pb-1"
    >
      <button
        type="button"
        aria-label="Previous"
        onClick={() => void previous()}
        className={stepClassName}
      >
        <ChevronLeft className="size-4" />
      </button>
      {journal.period === "week" ? (
        isoWeekDays(journal.date).map((day) => (
          <button
            key={day}
            type="button"
            onClick={() => void open("day", day)}
            className={cn(
              chipClassName,
              day === today && "border-accent-text text-foreground"
            )}
          >
            {formatDayLabel(day)}
          </button>
        ))
      ) : journal.period === "day" ? (
        <>
          <button
            type="button"
            onClick={() => void open("week", journal.date)}
            className={chipClassName}
          >
            {formatWeekLabel(journal.date)}
          </button>
          {journal.date !== today ? (
            <button
              type="button"
              onClick={() => void open("day", today)}
              className={chipClassName}
            >
              Today
            </button>
          ) : null}
        </>
      ) : (
        <button
          type="button"
          onClick={() => void open("week", today)}
          className={chipClassName}
        >
          This week
        </button>
      )}
      {journal.period !== "year" ? (
        <button
          type="button"
          onClick={() => void open("year", `${pageYear}-01-01`)}
          className={chipClassName}
        >
          Year {pageYear}
        </button>
      ) : null}
      <button
        type="button"
        aria-label="Next"
        onClick={() => void next()}
        className={stepClassName}
      >
        <ChevronRight className="size-4" />
      </button>
    </nav>
  )
}

export { JournalStrip }
