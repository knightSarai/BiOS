import {
  addCivilDays,
  formatDayLabel,
  toLocalDate,
  type UtcDatetime,
} from "@knight-os/server/core"
import { isOpenStatus, type ActivityStatus } from "./status"

const LIST_DATES = ["due", "created", "updated"] as const
const LIST_STATUSES = ["open", "all"] as const

type ListDate = (typeof LIST_DATES)[number]
type ListStatuses = (typeof LIST_STATUSES)[number]

const DUE_GROUPS = [
  "overdue",
  "today",
  "tomorrow",
  "next-7-days",
  "later",
  "no-date",
] as const
const PAST_GROUPS = [
  "today",
  "yesterday",
  "last-7-days",
  "this-month",
  "earlier",
] as const

type DateGroup = (typeof DUE_GROUPS)[number] | (typeof PAST_GROUPS)[number]

const listDateLabels: Record<ListDate, string> = {
  due: "Due date",
  created: "Created",
  updated: "Updated",
}

const dateGroupLabels: Record<DateGroup, string> = {
  overdue: "Overdue",
  today: "Today",
  tomorrow: "Tomorrow",
  "next-7-days": "Next 7 days",
  later: "Later",
  "no-date": "No due date",
  yesterday: "Yesterday",
  "last-7-days": "Last 7 days",
  "this-month": "This month",
  earlier: "Earlier",
}

type ListedActivity = {
  status: ActivityStatus
  dueDate: string | null
  createdAt: UtcDatetime
  updatedAt: UtcDatetime
}

const dateGroupsFor = (by: ListDate): readonly DateGroup[] =>
  by === "due" ? DUE_GROUPS : PAST_GROUPS

// The workspace-local day an activity falls on, for the chosen date.
const listDay = (activity: ListedActivity, by: ListDate, timezone: string) => {
  switch (by) {
    case "due":
      return activity.dueDate
    case "created":
      return toLocalDate(activity.createdAt, timezone)
    case "updated":
      return toLocalDate(activity.updatedAt, timezone)
  }
}

// Days are YYYY-MM-DD, so they compare as strings.
const dateGroupOf = (
  day: string | null,
  by: ListDate,
  today: string
): DateGroup => {
  if (by === "due") {
    if (day === null) return "no-date"
    if (day < today) return "overdue"
    if (day === today) return "today"
    if (day === addCivilDays(today, 1)) return "tomorrow"
    if (day <= addCivilDays(today, 7)) return "next-7-days"
    return "later"
  }
  if (day === null || day >= today) return "today"
  if (day === addCivilDays(today, -1)) return "yesterday"
  if (day >= addCivilDays(today, -6)) return "last-7-days"
  if (day.slice(0, 7) === today.slice(0, 7)) return "this-month"
  return "earlier"
}

const isListed = (activity: ListedActivity, statuses: ListStatuses) =>
  statuses === "all" || isOpenStatus(activity.status)

// Soonest due first; for created and updated, the most recent first.
const listOrder =
  (by: ListDate) =>
  <Row extends ListedActivity>(a: Row, b: Row) => {
    switch (by) {
      case "due":
        return (
          (a.dueDate ?? "9999-12-31").localeCompare(
            b.dueDate ?? "9999-12-31"
          ) || b.updatedAt.localeCompare(a.updatedAt)
        )
      case "created":
        return b.createdAt.localeCompare(a.createdAt)
      case "updated":
        return b.updatedAt.localeCompare(a.updatedAt)
    }
  }

const listDayLabel = (day: string | null, by: ListDate) => {
  if (day === null) return null
  const prefix = by === "due" ? "Due" : by === "created" ? "Created" : "Updated"
  return `${prefix} ${formatDayLabel(day)}`
}

export {
  LIST_DATES,
  LIST_STATUSES,
  dateGroupLabels,
  dateGroupOf,
  dateGroupsFor,
  isListed,
  listDateLabels,
  listDay,
  listDayLabel,
  listOrder,
}
export type { DateGroup, ListDate, ListStatuses }
