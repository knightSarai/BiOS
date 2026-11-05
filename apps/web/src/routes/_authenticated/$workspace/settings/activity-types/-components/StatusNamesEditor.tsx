import type { StatusNames } from "@/activities/activity-types"
import { StatusIcon } from "@/activities/components/StatusIcon"
import { ACTIVITY_STATUSES, statusLabels } from "@/activities/status"
import { useRenameTypeStatus } from "@/local-db/activity-type-mutations"
import { SettingsCard } from "../../-components/SettingsPage"
import { CommitInput } from "./CommitInput"

function StatusNamesEditor({
  typeId,
  statusNames,
  workspaceId,
}: {
  typeId: string
  statusNames: StatusNames
  workspaceId: string
}) {
  const renameStatus = useRenameTypeStatus(workspaceId)

  return (
    <SettingsCard>
      {ACTIVITY_STATUSES.map((status) => (
        <div
          key={status}
          className="grid grid-cols-[20px_96px_minmax(0,1fr)] items-center gap-3 px-4 py-2"
        >
          <StatusIcon status={status} />
          <span className="text-xs text-muted-foreground">
            {statusLabels[status]}
          </span>
          <CommitInput
            key={statusNames[status] ?? ""}
            value={statusNames[status] ?? ""}
            label={`Name for ${statusLabels[status]}`}
            placeholder={statusLabels[status]}
            allowEmpty
            className="h-9 border max-md:h-11"
            onCommit={(name) =>
              renameStatus.mutate({ id: typeId, status, name })
            }
          />
        </div>
      ))}
    </SettingsCard>
  )
}

export { StatusNamesEditor }
