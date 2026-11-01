import { ACTIVITY_STATUSES, statusLabels, type ActivityStatus } from "./status"

const TYPE_COLORS = ["gray", "teal", "purple", "rose", "blue", "amber"] as const

type TypeColor = (typeof TYPE_COLORS)[number]

type StatusNames = Partial<Record<ActivityStatus, string>>

const statusName = (status: ActivityStatus, names: StatusNames | null) =>
  names?.[status]?.trim() || statusLabels[status]

const cleanStatusNames = (names: StatusNames): StatusNames =>
  Object.fromEntries(
    ACTIVITY_STATUSES.flatMap((status) => {
      const name = names[status]?.trim()
      return name ? [[status, name] as const] : []
    })
  )

export { TYPE_COLORS, cleanStatusNames, statusName }
export type { StatusNames, TypeColor }
