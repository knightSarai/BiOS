import { dropCursor } from "prosemirror-dropcursor"
import { gapCursor } from "prosemirror-gapcursor"
import { keymap } from "prosemirror-keymap"
import { EditorState, TextSelection, type Transaction } from "prosemirror-state"
import { EditorView } from "prosemirror-view"
import { DexieYProvider } from "y-dexie"
import {
  initProseMirrorDoc,
  ySyncPlugin,
  ySyncPluginKey,
  yUndoPlugin,
  yUndoPluginKey,
} from "y-prosemirror"
import type * as Y from "yjs"
import { blockIdsPlugin } from "./block-ids"
import { DOCUMENT_FRAGMENT, seedDocument, titleOf } from "./document-content"
import { editorUiPlugin, readUi, setFlashPos, slashItems } from "./editor-ui"
import { editorInputRules } from "./input-rules"
import { editorBaseKeymap, editorKeymap } from "./keymap"
import type { ActivityBridge } from "./activity-bridge"
import {
  ACTIVITY_CREATION_META,
  createActivitiesCommand,
  onSelectedActivity,
} from "./activity-commands"
import { trackActivityUndo } from "./activity-undo"
import { createNodeViews } from "./node-views"
import { schema } from "./schema"
import { titleAccessoryPlugin } from "./title-accessory"

const CONTENT_SAVE_DELAY_MS = 500
const BLOCK_FLASH_MS = 1600

const editorClassName = [
  "min-h-[60vh] pb-[40vh] text-base leading-6 focus-visible:outline-none",
  "[&_[data-placeholder]]:before:pointer-events-none [&_[data-placeholder]]:before:float-start [&_[data-placeholder]]:before:h-0",
  "[&_[data-placeholder]]:before:text-muted-foreground/70 [&_[data-placeholder]]:before:content-[attr(data-placeholder)]",
  "[&_.ProseMirror-selectednode]:rounded-sm [&_.ProseMirror-selectednode]:bg-selection [&_.ProseMirror-selectednode]:outline-ring/60",
].join(" ")

type MountEditorOptions = {
  element: HTMLElement
  ydoc: Y.Doc
  focusBlockId?: string
  slashMenuId: string
  titleAccessory: HTMLElement | null
  onRequestLink: () => void
  activities: ActivityBridge
  onError: (message: string) => void
  onState: (snapshot: { view: EditorView; state: EditorState } | null) => void
  onContentChange: (title: string) => void
  onLoaded: (title: string) => void
}

const editorAttributes = (state: EditorState, slashMenuId: string) => {
  const base = {
    class: editorClassName,
    "aria-label": "Document",
    "aria-multiline": "true",
    role: "textbox",
    spellcheck: "true",
  }
  const { slash } = readUi(state)
  if (!slash) return base
  const active = slashItems(slash)[slash.index]
  return {
    ...base,
    "aria-controls": slashMenuId,
    "aria-activedescendant": active ? `${slashMenuId}-${active.kind}` : "",
  }
}

const findBlockPos = (view: EditorView, blockId: string) => {
  const found: number[] = []
  view.state.doc.descendants((node, pos) => {
    if (found.length > 0) return false
    if (node.attrs.id === blockId) found.push(pos)
    return !node.isTextblock
  })
  return found[0] ?? null
}

const scrollToBlock = (view: EditorView, blockId: string) => {
  const target = findBlockPos(view, blockId)
  if (target === null) return false
  const dom = view.nodeDOM(target)
  if (dom instanceof HTMLElement) dom.scrollIntoView({ block: "center" })
  const selection = TextSelection.near(view.state.doc.resolve(target + 1))
  view.dispatch(view.state.tr.setSelection(selection))
  setFlashPos(view, target)
  setTimeout(() => {
    if (!view.isDestroyed) setFlashPos(view, null)
  }, BLOCK_FLASH_MS)
  return true
}

const isUndoOrRedo = (tr: Transaction) => {
  const meta = tr.getMeta(ySyncPluginKey) as
    { isUndoRedoOperation?: boolean } | undefined
  return meta?.isUndoRedoOperation === true
}

const mountEditor = (options: MountEditorOptions) => {
  let view: EditorView | null = null
  let stopUndoTracking = () => {}
  let disposed = false
  let pendingTitle: string | null = null
  let saveTimer: ReturnType<typeof setTimeout> | undefined

  const flushContent = () => {
    clearTimeout(saveTimer)
    if (pendingTitle === null) return
    options.onContentChange(pendingTitle)
    pendingTitle = null
  }

  const scheduleContentSave = (title: string) => {
    pendingTitle = title
    clearTimeout(saveTimer)
    saveTimer = setTimeout(flushContent, CONTENT_SAVE_DELAY_MS)
  }

  const onSaveError = () =>
    options.onError("Changes couldn't be saved on this device.")
  const onPageHide = () => flushContent()
  const browserWindow = options.element.ownerDocument.defaultView
  browserWindow?.addEventListener("pagehide", onPageHide)

  const provider = DexieYProvider.load(options.ydoc)
  provider.on("error", onSaveError)

  const open = () => {
    if (disposed) return
    seedDocument(options.ydoc)
    const fragment = options.ydoc.getXmlFragment(DOCUMENT_FRAGMENT)
    const { doc, mapping } = initProseMirrorDoc(fragment, schema)

    const state = EditorState.create({
      schema,
      doc,
      plugins: [
        editorUiPlugin,
        keymap({
          "Mod-k": () => {
            options.onRequestLink()
            return true
          },
          "Mod-Shift-o": createActivitiesCommand(options.activities.create),
          Enter: onSelectedActivity(options.activities.open),
          "Mod-Enter": onSelectedActivity(options.activities.toggleDone),
        }),
        editorInputRules,
        editorKeymap,
        editorBaseKeymap,
        ySyncPlugin(fragment, { mapping }),
        yUndoPlugin(),
        dropCursor({ color: "var(--color-accent-text)", width: 2 }),
        gapCursor(),
        blockIdsPlugin,
        ...(options.titleAccessory
          ? [titleAccessoryPlugin(options.titleAccessory)]
          : []),
      ],
    })
    const undoManager = yUndoPluginKey.getState(state)?.undoManager
    const undoTracking = undoManager ? trackActivityUndo(undoManager) : null
    stopUndoTracking = () => undoTracking?.destroy()

    const editor: EditorView = new EditorView(options.element, {
      state,
      nodeViews: createNodeViews(options.activities),
      attributes: (state) => editorAttributes(state, options.slashMenuId),
      dispatchTransaction(tr) {
        if (disposed) return
        const createdIds = tr.getMeta(ACTIVITY_CREATION_META) as
          string[] | undefined
        if (createdIds) undoTracking?.startCreation()
        const next = editor.state.apply(tr)
        editor.updateState(next)
        if (createdIds) undoTracking?.finishCreation(createdIds)
        const reversed =
          tr.docChanged && isUndoOrRedo(tr) ? undoTracking?.reversed() : null
        if (reversed?.direction === "undo") {
          options.activities.discard(reversed.activityIds)
        } else if (reversed?.direction === "redo") {
          options.activities.restore(reversed.activityIds)
        }
        options.onState({ view: editor, state: next })
        if (tr.docChanged) scheduleContentSave(titleOf(next.doc))
      },
    })

    view = editor
    options.onState({ view: editor, state: editor.state })

    options.onLoaded(titleOf(editor.state.doc))

    const scrolled = options.focusBlockId
      ? scrollToBlock(editor, options.focusBlockId)
      : false
    if (!scrolled && editor.state.doc.child(0).content.size === 0) {
      editor.dispatch(
        editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 1))
      )
      editor.focus()
    }
  }

  void provider.whenLoaded.then(open, () => {
    if (!disposed) options.onError("This document couldn't be opened.")
  })

  return () => {
    disposed = true
    flushContent()
    browserWindow?.removeEventListener("pagehide", onPageHide)
    provider.off("error", onSaveError)
    view?.destroy()
    stopUndoTracking()
    options.onState(null)
    DexieYProvider.release(options.ydoc)
  }
}

export { mountEditor }
export type { MountEditorOptions }
