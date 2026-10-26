import { useCallback, useId, useMemo } from "react"
import { useMediaQuery } from "@base-ui/react/unstable-use-media-query"
import { useStore } from "jotai"
import { toast } from "sonner"
import type * as Y from "yjs"
import type { ActivityBridge } from "../activity-bridge"
import { activeLinkHref, isInTitle } from "../commands"
import { readUi, setHoverPos } from "../editor-ui"
import { mountEditor } from "../mount-editor"
import { BlockHandle } from "./BlockHandle"
import { createEditorAtoms } from "./editor-atoms"
import { MobileEditorBar } from "./MobileEditorBar"
import { SelectionToolbar } from "./SelectionToolbar"
import { SlashMenu } from "./SlashMenu"

type DocumentEditorProps = {
  ydoc: Y.Doc
  focusBlockId?: string
  blockLink: (blockId: string) => string
  onContentChange: (title: string) => void
  onLoaded: (title: string) => void
  activities: ActivityBridge
}

function DocumentEditor({
  ydoc,
  focusBlockId,
  blockLink,
  onContentChange,
  onLoaded,
  activities,
}: DocumentEditorProps) {
  const store = useStore()
  const slashMenuId = useId()
  const coarsePointer = useMediaQuery("(pointer: coarse)", { noSsr: true })
  // The atoms hold this editor's UI state, so each instance needs its own set.
  const atoms = useMemo(() => createEditorAtoms(), [])
  // A new ref callback on every render would destroy and remount the editor.
  const mountRef = useCallback(
    (element: HTMLDivElement | null) => {
      if (!element) return
      return mountEditor({
        element,
        ydoc,
        focusBlockId,
        slashMenuId,
        onContentChange,
        onLoaded,
        activities,
        onError: (message) => toast.error(message),
        onState: (snapshot) => store.set(atoms.snapshot, snapshot),
        onRequestLink: () => {
          const snapshot = store.get(atoms.snapshot)
          if (!snapshot || isInTitle(snapshot.state)) return
          const href = activeLinkHref(snapshot.state)
          if (snapshot.state.selection.empty && href === null) return
          store.set(atoms.linkDraft, href ?? "")
        },
      })
    },
    [
      ydoc,
      focusBlockId,
      slashMenuId,
      onContentChange,
      onLoaded,
      activities,
      store,
      atoms,
    ]
  )

  const clearHover = () => {
    const snapshot = store.get(atoms.snapshot)
    if (!snapshot || store.get(atoms.blockMenuPos) !== null) return
    if (readUi(snapshot.state).hoverPos !== null)
      setHoverPos(snapshot.view, null)
  }

  return (
    <div className="relative" onMouseLeave={clearHover}>
      <div ref={mountRef} />
      <SlashMenu atoms={atoms} menuId={slashMenuId} />
      {coarsePointer ? (
        <MobileEditorBar
          atoms={atoms}
          blockLink={blockLink}
          activities={activities}
        />
      ) : (
        <>
          <BlockHandle atoms={atoms} blockLink={blockLink} />
          <SelectionToolbar atoms={atoms} activities={activities} />
        </>
      )}
    </div>
  )
}

export { DocumentEditor }
