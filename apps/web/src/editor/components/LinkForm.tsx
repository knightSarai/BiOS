import { Check, Unlink } from "lucide-react"
import type { EditorView } from "prosemirror-view"
import { Button } from "@/components/ui/button"
import { setLink } from "../commands"

type LinkFormProps = {
  view: EditorView
  draft: string
  onClose: () => void
}

function LinkForm({ view, draft, onClose }: LinkFormProps) {
  const finish = (href: string | null) => {
    if (href !== null) setLink(href)(view.state, view.dispatch)
    onClose()
    view.focus()
  }

  return (
    <form
      className="flex items-center gap-1"
      onSubmit={(event) => {
        event.preventDefault()
        const href = new FormData(event.currentTarget).get("href")
        finish(typeof href === "string" ? href : "")
      }}
    >
      <input
        name="href"
        type="text"
        inputMode="url"
        autoComplete="off"
        autoFocus
        defaultValue={draft}
        placeholder="Paste or type a link"
        aria-label="Link address"
        className="h-8 w-64 min-w-0 flex-1 rounded-md bg-transparent px-2 text-base outline-none placeholder:text-muted-foreground max-md:h-11"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault()
            finish(null)
          }
        }}
      />
      {draft ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Remove link"
          className="max-md:size-11"
          onClick={() => finish("")}
        >
          <Unlink />
        </Button>
      ) : null}
      <Button
        type="submit"
        variant="ghost"
        size="icon"
        aria-label="Apply link"
        className="max-md:size-11"
      >
        <Check />
      </Button>
    </form>
  )
}

export { LinkForm }
