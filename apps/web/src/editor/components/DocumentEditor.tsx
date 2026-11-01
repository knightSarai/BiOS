import { useCallback, useId, useMemo } from "react"
import { createPortal } from "react-dom"
import { useMediaQuery } from "@base-ui/react/unstable-use-media-query"
import { useStore } from "jotai"
import { toast } from "sonner"
import type * as Y from "yjs"
import { DrawingEditorDialog } from "@/drawing/components/DrawingEditorDialog"
import { createDrawingEditor } from "@/drawing/drawing-editor"
import type { ActivityBridge } from "../activity-bridge"
import type { MentionBridge } from "../mention-bridge"
import type { EditorContent } from "../mention-index"
import { activeLinkHref, isInTitle } from "../commands"
import { readUi, setHoverPos } from "../editor-ui"
import { mountEditor } from "../mount-editor"
import { BlockHandle } from "./BlockHandle"
import { createEditorAtoms } from "./editor-atoms"
import { MentionMenu } from "./MentionMenu"
import { createMentionHoverAtom, MentionPreview } from "./MentionPreview"
import { MobileEditorBar } from "./MobileEditorBar"
import { SelectionToolbar } from "./SelectionToolbar"
import { SlashMenu } from "./SlashMenu"

type DocumentEditorProps = {
  ydoc: Y.Doc
  focusBlockId?: string
  blockLink: (blockId: string) => string
  onContentChange: (content: EditorContent) => void
  onLoaded: (title: string) => void
  activities: ActivityBridge
  mentions?: MentionBridge
  titleAccessory?: React.ReactNode
}

function DocumentEditor({
  ydoc,
  focusBlockId,
  blockLink,
  onContentChange,
  onLoaded,
  activities,
  mentions,
  titleAccessory,
}: DocumentEditorProps) {
  const store = useStore()
  const slashMenuId = useId()
  const coarsePointer = useMediaQuery("(pointer: coarse)", { noSsr: true })
  // The atoms hold this editor's UI state, so each instance needs its own set.
  const atoms = useMemo(() => createEditorAtoms(), [])
  const mentionHoverAtom = useMemo(() => createMentionHoverAtom(), [])
  const mentionMenuId = useId()
  const hasTitleAccessory = titleAccessory !== undefined
  // ProseMirror keeps the widget only while it is handed the same DOM node.
  const titleAccessoryElement = useMemo(
    () => (hasTitleAccessory ? document.createElement("div") : null),
    [hasTitleAccessory]
  )
  // A new ref callback on every render would destroy and remount the editor.
  const mountRef = useCallback(
    (element: HTMLDivElement | null) => {
      if (!element) return
      const unmount = mountEditor({
        element,
        ydoc,
        focusBlockId,
        slashMenuId,
        titleAccessory: titleAccessoryElement,
        onContentChange,
        onLoaded,
        activities,
        mentions,
        onError: (message) => toast.error(message),
        onOpenDrawing: (drawingId) => {
          store.get(atoms.drawingEditor)?.destroy()
          store.set(
            atoms.drawingEditor,
            createDrawingEditor(ydoc, drawingId, store, atoms.drawingStyle)
          )
          store.set(atoms.drawingOpen, true)
        },
        onState: (snapshot) => store.set(atoms.snapshot, snapshot),
        onRequestLink: () => {
          const snapshot = store.get(atoms.snapshot)
          if (!snapshot || isInTitle(snapshot.state)) return
          const href = activeLinkHref(snapshot.state)
          if (snapshot.state.selection.empty && href === null) return
          store.set(atoms.linkDraft, href ?? "")
        },
      })
      return () => {
        store.get(atoms.drawingEditor)?.destroy()
        store.set(atoms.drawingEditor, null)
        store.set(atoms.drawingOpen, false)
        unmount()
      }
    },
    [
      ydoc,
      focusBlockId,
      slashMenuId,
      titleAccessoryElement,
      onContentChange,
      onLoaded,
      activities,
      mentions,
      store,
      atoms,
    ]
  )

  // The editor stays mounted until the dialog's exit animation finishes.
  const releaseDrawing = () => {
    store.get(atoms.drawingEditor)?.destroy()
    store.set(atoms.drawingEditor, null)
    store.get(atoms.snapshot)?.view.focus()
  }

  const clearHover = () => {
    const snapshot = store.get(atoms.snapshot)
    if (!snapshot || store.get(atoms.blockMenuPos) !== null) return
    if (readUi(snapshot.state).hoverPos !== null)
      setHoverPos(snapshot.view, null)
  }

  return (
    <div
      className="relative"
      onMouseLeave={() => {
        clearHover()
        store.set(mentionHoverAtom, null)
      }}
      onMouseOver={(event) => {
        const chip =
          event.target instanceof Element
            ? event.target.closest("[data-mention-id]")
            : null
        const current = store.get(mentionHoverAtom)
        if (chip instanceof HTMLElement && chip.dataset.mentionId) {
          if (current?.anchor !== chip) {
            store.set(mentionHoverAtom, {
              documentId: chip.dataset.mentionId,
              anchor: chip,
            })
          }
        } else if (current) {
          store.set(mentionHoverAtom, null)
        }
      }}
    >
      <div ref={mountRef} />
      {titleAccessoryElement
        ? createPortal(titleAccessory, titleAccessoryElement)
        : null}
      <SlashMenu atoms={atoms} menuId={slashMenuId} />
      {mentions ? (
        <>
          <MentionMenu atoms={atoms} bridge={mentions} menuId={mentionMenuId} />
          <MentionPreview hoverAtom={mentionHoverAtom} bridge={mentions} />
        </>
      ) : null}
      <DrawingEditorDialog
        editorAtom={atoms.drawingEditor}
        openAtom={atoms.drawingOpen}
        onClosed={releaseDrawing}
      />
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
