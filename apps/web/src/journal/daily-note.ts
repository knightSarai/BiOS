import {
  formatCivilDate,
  formatShortMonthName,
  formatYear,
  type WorkspaceGeneralSettings,
} from "@knight-os/server/core"

type DailyNoteFormat = Pick<
  WorkspaceGeneralSettings,
  "dateOrder" | "dateSeparator"
>

// A daily note is found by its place and title only, so a moved or renamed note stops being that day's note.
const dailyNoteLocation = (date: string, format: DailyNoteFormat) => ({
  folders: ["Journal", "Daily", formatYear(date), formatShortMonthName(date)],
  title: formatCivilDate(date, {
    order: format.dateOrder,
    separator: format.dateSeparator,
  }),
})

export { dailyNoteLocation }
export type { DailyNoteFormat }
