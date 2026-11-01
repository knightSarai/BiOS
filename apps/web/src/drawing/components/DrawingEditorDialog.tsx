import { useRef, useSyncExternalStore } from "react"
import { useAtom, useAtomValue, type Atom, type PrimitiveAtom } from "jotai"
import { FileUp, Maximize, Minus, Plus, Redo2, Undo2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog"
import type { DrawingEditor, ImportSummary } from "../drawing-editor"
import { DrawingCanvas } from "./DrawingCanvas"
import { DrawingStylePanel } from "./DrawingStylePanel"
import { DrawingToolbar } from "./DrawingToolbar"

function ZoomControls({ editor }: { editor: DrawingEditor }) {
  const camera = useAtomValue(editor.atoms.camera)
  return (
    <div className="absolute bottom-3 left-3 z-10 flex items-center gap-0.5 rounded-lg bg-popover p-1 shadow-md ring-1 ring-foreground/10 max-md:hidden">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Zoom out"
        onClick={editor.zoomOut}
      >
        <Minus />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        aria-label="Reset zoom"
        onClick={editor.zoomReset}
        className="min-w-12 tabular-nums"
      >
        {Math.round((camera?.zoom ?? 1) * 100)}%
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Zoom in"
        onClick={editor.zoomIn}
      >
        <Plus />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Zoom to fit"
        onClick={editor.fit}
      >
        <Maximize />
      </Button>
    </div>
  )
}

const tally = (counts: Record<string, number>) =>
  Object.entries(counts).map(
    ([kind, total]) => `${total} ${kind}${total === 1 ? "" : "s"}`
  )

const importMessage = ({ count, skipped, simplified }: ImportSummary) => {
  const parts = [`Imported ${count} shape${count === 1 ? "" : "s"}.`]
  const left = tally(skipped)
  const changed = tally(simplified)
  if (left.length > 0) parts.push(`Left out ${left.join(", ")}.`)
  if (changed.length > 0) parts.push(`Simplified ${changed.join(", ")}.`)
  return parts.join(" ")
}

function ImportButton({ editor }: { editor: DrawingEditor }) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Import an Excalidraw drawing"
        title="Import an Excalidraw drawing (.excalidraw or Obsidian .excalidraw.md)"
        onClick={() => inputRef.current?.click()}
        className="max-md:size-10"
      >
        <FileUp />
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept=".excalidraw,.json,.md"
        className="hidden"
        onChange={async (event) => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ""
          if (!file) return
          const summary = await editor.importFile(file).catch(() => null)
          if (summary) toast.success(importMessage(summary))
          else toast.error("That file doesn't contain an Excalidraw drawing.")
        }}
      />
    </>
  )
}

function DrawingEditorView({ editor }: { editor: DrawingEditor }) {
  const snapshot = useSyncExternalStore(
    editor.session.subscribe,
    editor.session.getSnapshot
  )
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-1 border-b border-border px-3">
        <DialogTitle className="text-sm font-medium">Drawing</DialogTitle>
        <div className="flex-1" />
        <ImportButton editor={editor} />
        <Button
          variant="ghost"
          size="icon"
          aria-label="Undo (Ctrl Z)"
          title="Undo (Ctrl Z)"
          disabled={!snapshot.canUndo}
          onClick={editor.undo}
          className="max-md:size-10"
        >
          <Undo2 />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Redo (Ctrl Shift Z)"
          title="Redo (Ctrl Shift Z)"
          disabled={!snapshot.canRedo}
          onClick={editor.redo}
          className="max-md:size-10"
        >
          <Redo2 />
        </Button>
        <DialogClose render={<Button className="ml-1 max-md:h-9" />}>
          Done
        </DialogClose>
      </header>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <DrawingCanvas editor={editor} />
        <DrawingToolbar editor={editor} />
        <DrawingStylePanel editor={editor} />
        <ZoomControls editor={editor} />
      </div>
    </div>
  )
}

function DrawingEditorDialog({
  editorAtom,
  openAtom,
  onClosed,
}: {
  editorAtom: Atom<DrawingEditor | null>
  openAtom: PrimitiveAtom<boolean>
  onClosed: () => void
}) {
  const editor = useAtomValue(editorAtom)
  const [open, setOpen] = useAtom(openAtom)
  return (
    <Dialog
      open={open && editor !== null}
      onOpenChange={setOpen}
      onOpenChangeComplete={(isOpen) => {
        if (!isOpen) onClosed()
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="inset-0 top-0 left-0 flex h-dvh w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none bg-background p-0 text-sm ring-0 sm:max-w-none data-open:zoom-in-100 data-closed:zoom-out-100"
      >
        {editor ? <DrawingEditorView editor={editor} /> : null}
      </DialogContent>
    </Dialog>
  )
}

export { DrawingEditorDialog }
