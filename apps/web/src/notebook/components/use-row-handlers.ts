import { useSetAtom } from "jotai"
import {
  deletingAtom,
  iconPickerAtom,
  movingAtom,
  renamingAtom,
  type NotebookItemTarget,
} from "./atoms"
import type { RowActionHandlers } from "./row-actions"
import {
  useNotebookActions,
  type NotebookWorkspace,
} from "./use-notebook-actions"

// The anchor is read when the action runs, because the row may not be in the DOM yet while rendering.
const useRowHandlers = (
  workspace: NotebookWorkspace,
  item: Omit<NotebookItemTarget, "anchor">,
  anchor: { readonly current: Element | null }
): RowActionHandlers => {
  const actions = useNotebookActions(workspace)
  const setRenaming = useSetAtom(renamingAtom)
  const setMoving = useSetAtom(movingAtom)
  const setDeleting = useSetAtom(deletingAtom)
  const setIconPicker = useSetAtom(iconPickerAtom)

  return {
    newDocument: () => void actions.newDocument(item.id),
    newFolder: () => void actions.newFolder(item.id),
    rename: () => setRenaming({ kind: item.kind, id: item.id }),
    move: () => setMoving({ ...item, anchor: anchor.current }),
    changeIcon: () =>
      setIconPicker({
        target: { kind: "document", id: item.id },
        anchor: anchor.current,
      }),
    copyLink: () => void actions.copyLink(item.kind, item.id),
    duplicate: () => void actions.duplicateDocument(item.id),
    remove: () => setDeleting({ ...item, anchor: null }),
  }
}

export { useRowHandlers }
