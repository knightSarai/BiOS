import type { AreaColor } from "./areas"
import { ACTIVITY_STATUSES, statusLabels, type ActivityStatus } from "./status"

type TypeColor = AreaColor

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

export { cleanStatusNames, statusName }
export type { StatusNames, TypeColor }
