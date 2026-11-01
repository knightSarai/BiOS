import { DeleteNotebookItemDialog } from "./DeleteNotebookItemDialog"
import { IconPicker } from "./IconPicker"
import { MovePopover } from "./MovePopover"
import { RowActionSheet } from "./RowActionSheet"
import type { NotebookWorkspace } from "./use-notebook-actions"

function NotebookDialogs({ workspace }: { workspace: NotebookWorkspace }) {
  return (
    <>
      <MovePopover workspace={workspace} />
      <DeleteNotebookItemDialog workspace={workspace} />
      <IconPicker workspace={workspace} />
      <RowActionSheet workspace={workspace} />
    </>
  )
}

export { NotebookDialogs }
