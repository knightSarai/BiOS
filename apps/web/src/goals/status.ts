const GOAL_STATUSES = [
  "one-day",
  "current",
  "in-progress",
  "achieved",
  "dropped",
] as const

type GoalStatus = (typeof GOAL_STATUSES)[number]

const goalStatusLabels: Record<GoalStatus, string> = {
  "one-day": "One Day",
  current: "Current",
  "in-progress": "In Progress",
  achieved: "Achieved",
  dropped: "Dropped",
}

export { GOAL_STATUSES, goalStatusLabels }
export type { GoalStatus }
