import { useMemo } from "react"
import { atom, useAtom } from "jotai"
import { Timer } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  EMPTY,
  backspace,
  deleteForward,
  inputEdit,
  replacedValue,
  tidyValue,
  toNextGroup,
  typeDigit,
  valueToSeconds,
  type Edit,
} from "../duration"

// Writes the edit straight to the field and puts the cursor back, then reports it; the
// re-render then finds the same value and leaves the cursor where it is.
const commit = (
  input: HTMLInputElement,
  edit: Edit,
  onChange: (value: string) => void
) => {
  input.value = edit.value
  input.setSelectionRange(edit.caret, edit.caret)
  onChange(edit.value)
}

// The bare MM:SS field, typed over like a time input: the cursor sits on a digit, typing
// replaces it and moves on, ← → move, Backspace zeroes the digit to the left. Three minutes
// is 0 then 3; typing right before the colon adds minutes (120:00), and leaving the field
// shows an hour or more as H:MM:SS.
// `onChange` hears every edit, for a form's draft; `onCommit` hears only the result, on
// Enter or leaving the field, for a value saved straight away.
function DurationDigits({
  value,
  label,
  className,
  onChange,
  onCommit,
}: {
  value: string
  label: string
  className?: string
  onChange?: (value: string) => void
  onCommit?: (value: string) => void
}) {
  // Keeps the typed text while focused, since a caller may rebuild the value from seconds
  // (90:00 would turn into 1:30:00 mid-typing); one draft per field, so useMemo keeps it stable.
  const draftAtom = useMemo(() => atom<string | null>(null), [])
  const [draft, setDraft] = useAtom(draftAtom)
  const shown = draft ?? value
  const report = (next: string) => {
    setDraft(next)
    onChange?.(next)
  }
  return (
    <input
      value={shown}
      aria-label={label}
      inputMode="numeric"
      autoComplete="off"
      onKeyDown={(event) => {
        if (event.ctrlKey || event.metaKey || event.altKey) return
        if (event.key === "Enter" && onCommit) {
          event.currentTarget.blur()
          return
        }
        const input = event.currentTarget
        const caret = input.selectionStart ?? 0
        const whole =
          input.selectionStart === 0 &&
          input.selectionEnd === input.value.length
        const start = whole ? EMPTY : shown
        const from = whole ? 0 : caret
        const edit = /^\d$/.test(event.key)
          ? typeDigit(start, from, event.key)
          : event.key === "Backspace"
            ? backspace(start, from)
            : event.key === "Delete"
              ? deleteForward(start, from)
              : [":", ".", ","].includes(event.key)
                ? toNextGroup(start, from)
                : null
        if (!edit) return
        event.preventDefault()
        commit(input, edit, report)
      }}
      // Phone keyboards may skip key events; replay what the input event did instead.
      onChange={(event) => {
        const input = event.currentTarget
        const native = event.nativeEvent
        if (!(native instanceof InputEvent)) {
          commit(input, replacedValue(input.value, shown), report)
          return
        }
        commit(
          input,
          inputEdit(
            {
              value: input.value,
              caret: input.selectionStart ?? 0,
              type: native.inputType,
              data: native.data,
            },
            shown
          ),
          report
        )
      }}
      onBlur={() => {
        if (draft === null) return
        const tidy = tidyValue(draft)
        if (tidy !== draft) onChange?.(tidy)
        if (valueToSeconds(tidy) !== valueToSeconds(value)) onCommit?.(tidy)
        setDraft(null)
      }}
      className={cn(
        "field-sizing-content min-w-[5ch] bg-transparent tabular-nums outline-none",
        className
      )}
    />
  )
}

function DurationChip({
  value,
  label,
  zeroLabel,
  downLabel,
  title = "Type a duration over 00:00; 00:00 is a stopwatch",
  icon = true,
  className,
  onChange,
  onCommit,
}: {
  value: string
  label: string
  zeroLabel: string
  downLabel?: string
  icon?: boolean
  title?: string
  className?: string
  onChange?: (value: string) => void
  onCommit?: (value: string) => void
}) {
  const zero = valueToSeconds(value) === 0
  return (
    <label
      title={title}
      className={cn(
        "flex h-[30px] cursor-text items-center gap-1.5 rounded-md border bg-background px-2.5 text-[13px] focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30 max-md:h-11",
        className
      )}
    >
      {icon ? (
        <Timer aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      ) : null}
      <DurationDigits
        value={value}
        label={label}
        onChange={onChange}
        onCommit={onCommit}
        className={cn(zero && "text-muted-foreground")}
      />
      {zero && zeroLabel ? (
        <span className="text-muted-foreground">{zeroLabel}</span>
      ) : !zero && downLabel ? (
        <span className="text-muted-foreground">{downLabel}</span>
      ) : null}
    </label>
  )
}

export { DurationChip, DurationDigits }
