import {
  formatDayLabel,
  formatMonthName,
  formatWeekLabel,
  isoWeekDays,
  isoWeekKey,
  isoWeekOf,
} from "@knight-os/server/core"

const JOURNAL_PERIODS = ["day", "week", "year"] as const

type JournalPeriod = (typeof JOURNAL_PERIODS)[number]

// `date` is the period's first day; `key` identifies the page.
type JournalRef = { period: JournalPeriod; key: string; date: string }

type JournalFolderRole =
  "journal" | "journal-year" | "journal-weeks" | "journal-month"

type JournalFolderSpec = {
  role: JournalFolderRole
  period: string
  name: string
}

const journalRefFor = (period: JournalPeriod, date: string): JournalRef => {
  if (period === "day") return { period, key: date, date }
  if (period === "week") {
    return {
      period,
      key: isoWeekKey(isoWeekOf(date)),
      date: isoWeekDays(date)[0],
    }
  }
  const year = date.slice(0, 4)
  return { period, key: year, date: `${year}-01-01` }
}

const journalKeyOf = (ref: Pick<JournalRef, "period" | "key">) =>
  `${ref.period}:${ref.key}`

const journalTitle = (ref: JournalRef) => {
  if (ref.period === "day") return formatDayLabel(ref.date)
  if (ref.period === "week") return formatWeekLabel(ref.date)
  return `Year ${ref.key}`
}

// A week lives in the year that holds its Thursday, which can differ from the year of its Monday.
const journalFolderPath = (ref: JournalRef): JournalFolderSpec[] => {
  const root: JournalFolderSpec = {
    role: "journal",
    period: "",
    name: "Journal",
  }
  const yearOf = (year: string): JournalFolderSpec => ({
    role: "journal-year",
    period: year,
    name: year,
  })
  if (ref.period === "year") return [root, yearOf(ref.key)]
  if (ref.period === "week") {
    const year = ref.key.slice(0, 4)
    return [
      root,
      yearOf(year),
      { role: "journal-weeks", period: year, name: "Weeks" },
    ]
  }
  return [
    root,
    yearOf(ref.date.slice(0, 4)),
    {
      role: "journal-month",
      period: ref.date.slice(0, 7),
      name: formatMonthName(ref.date),
    },
  ]
}

export {
  JOURNAL_PERIODS,
  journalFolderPath,
  journalKeyOf,
  journalRefFor,
  journalTitle,
}
export type { JournalFolderRole, JournalFolderSpec, JournalPeriod, JournalRef }
