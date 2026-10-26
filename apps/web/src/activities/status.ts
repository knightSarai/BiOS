const ACTIVITY_STATUSES = [
  "backlog",
  "todo",
  "progress",
  "done",
  "canceled",
] as const

type ActivityStatus = (typeof ACTIVITY_STATUSES)[number]

const statusLabels: Record<ActivityStatus, string> = {
  backlog: "Backlog",
  todo: "To do",
  progress: "In progress",
  done: "Done",
  canceled: "Canceled",
}

const statusIcons: Record<
  ActivityStatus,
  { color: string; dash: string; pie: string; check: boolean; cross: boolean }
> = {
  backlog: {
    color: "var(--color-muted-foreground)",
    dash: "2 2.2",
    pie: "0 19",
    check: false,
    cross: false,
  },
  todo: {
    color: "var(--color-foreground)",
    dash: "none",
    pie: "0 19",
    check: false,
    cross: false,
  },
  progress: {
    color: "var(--color-warning-text)",
    dash: "none",
    pie: "9.4 19",
    check: false,
    cross: false,
  },
  done: {
    color: "var(--color-accent-text)",
    dash: "none",
    pie: "19 19",
    check: true,
    cross: false,
  },
  canceled: {
    color: "var(--color-muted-foreground)",
    dash: "none",
    pie: "0 19",
    check: false,
    cross: true,
  },
}

const isOpenStatus = (status: ActivityStatus) =>
  status !== "done" && status !== "canceled"

export { ACTIVITY_STATUSES, isOpenStatus, statusIcons, statusLabels }
export type { ActivityStatus }
