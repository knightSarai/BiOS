import { useSetAtom } from "jotai"
import { FileText, SmilePlus } from "lucide-react"
import { iconPickerAtom, type IconTarget } from "./atoms"
import { StoredIcon } from "./StoredIcon"

// "Add icon" shows while hovering an ancestor marked `group/page`.
function PageIconButton({
  target,
  icon,
}: {
  target: IconTarget
  icon: string | null
}) {
  const setIconPicker = useSetAtom(iconPickerAtom)
  const open = (anchor: Element) => setIconPicker({ target, anchor })

  if (icon) {
    return (
      <button
        type="button"
        aria-label="Change icon"
        onClick={(event) => open(event.currentTarget)}
        className="mb-1 -ml-1 flex size-8 items-center justify-center rounded-md hover:bg-accent"
      >
        <StoredIcon
          value={icon}
          className="size-6 text-[22px]"
          fallback={
            <FileText
              aria-hidden
              strokeWidth={1.75}
              className="size-6 text-muted-foreground"
            />
          }
        />
      </button>
    )
  }
  return (
    <button
      type="button"
      onClick={(event) => open(event.currentTarget)}
      className="mb-1 flex min-h-7 items-center gap-1.5 rounded-md px-1.5 text-xs text-muted-foreground opacity-0 transition-opacity group-hover/page:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100 max-md:min-h-11 max-md:opacity-100"
    >
      <SmilePlus className="size-3.5" />
      Add icon
    </button>
  )
}

export { PageIconButton }
