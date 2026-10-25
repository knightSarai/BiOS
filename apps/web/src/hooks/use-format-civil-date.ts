import { formatCivilDate } from "@knight-os/server/core"
import { useWorkspaceSettings } from "./use-workspace-settings"

export function useFormatCivilDate() {
  const { dateOrder, dateSeparator } = useWorkspaceSettings()

  return (value: string) =>
    formatCivilDate(value, { order: dateOrder, separator: dateSeparator })
}
