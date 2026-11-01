import { atom } from "jotai"
import { atomWithStorage } from "jotai/utils"

type NotebookItemRef = { kind: "folder" | "document"; id: string }

type NotebookItemTarget = NotebookItemRef & {
  title: string
  anchor: Element | null
  movable?: boolean
}

// Storage can be missing or throw (private windows, blocked site data); the tree then just starts collapsed.
const safeLocalStorage = {
  getItem: (key: string, initialValue: Record<string, string[]>) => {
    try {
      const raw = globalThis.localStorage?.getItem(key)
      return raw ? (JSON.parse(raw) as Record<string, string[]>) : initialValue
    } catch {
      return initialValue
    }
  },
  setItem: (key: string, value: Record<string, string[]>) => {
    try {
      globalThis.localStorage?.setItem(key, JSON.stringify(value))
    } catch {
      return
    }
  },
  removeItem: (key: string) => {
    try {
      globalThis.localStorage?.removeItem(key)
    } catch {
      return
    }
  },
}

const expandedFoldersAtom = atomWithStorage<Record<string, string[]>>(
  "bios:notebook-expanded",
  {},
  safeLocalStorage,
  { getOnInit: true }
)

// Folders the user collapsed while they sat on the path to the open page;
// tied to that page so the next navigation reveals its own path again.
const hiddenRevealAtom = atom<{
  anchorId: string
  folderIds: string[]
} | null>(null)

const renamingAtom = atom<NotebookItemRef | null>(null)
const movingAtom = atom<NotebookItemTarget | null>(null)
const deletingAtom = atom<NotebookItemTarget | null>(null)
type IconTarget = { kind: "document" | "goal"; id: string }

const iconPickerAtom = atom<{
  target: IconTarget
  anchor: Element | null
} | null>(null)
const actionSheetAtom = atom<NotebookItemTarget | null>(null)

export {
  actionSheetAtom,
  deletingAtom,
  expandedFoldersAtom,
  hiddenRevealAtom,
  iconPickerAtom,
  movingAtom,
  renamingAtom,
}
export type { IconTarget, NotebookItemRef, NotebookItemTarget }
