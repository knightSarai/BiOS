import { now, parseCivilDate, toCivilDate } from "@knight-os/server/core"

const YEARS_BEHIND = 5
const YEARS_AHEAD = 10

export const calendarBounds = () => {
  const year = Number(toCivilDate(now()).slice(0, 4))
  return {
    startMonth: parseCivilDate(`${year - YEARS_BEHIND}-01-01`),
    endMonth: parseCivilDate(`${year + YEARS_AHEAD}-12-31`),
  }
}
