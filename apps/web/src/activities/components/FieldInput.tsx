import { useId } from "react"
import { CalendarDays, Star } from "lucide-react"
import { formatDayLabel } from "@knight-os/server/core"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { markValidity, refreshValidity } from "@/lib/mark-validity"
import { cn } from "@/lib/utils"
import type { FieldDefinition, FieldValue } from "../fields"
import { DueDateMenu } from "./DueDateMenu"

type FieldLayout = "stacked" | "row"

type FieldInputProps = {
  inputId: string
  labelId: string
  field: FieldDefinition & { name: string }
  value: FieldValue | undefined
  timezone: string
  layout: FieldLayout
  // Saved fields commit on blur so typing doesn't write on every key; the new-activity form commits on change.
  commitOnBlur?: boolean
  onChange: (value: unknown) => void
}

const RATINGS = [1, 2, 3, 4, 5] as const

const NUMBER_PATTERN = "-?\\d+(\\.\\d+)?"

const COMPLETE_NUMBER = new RegExp(`^${NUMBER_PATTERN}$`)

// Commas stay so "1,5" is flagged as invalid instead of silently becoming 15.
const NOT_NUMBER_CHARACTERS = /[^\d.,-]/g

// Runs on every change, so typed, pasted and mobile-keyboard input are all covered.
const keepNumberCharacters = (input: HTMLInputElement) => {
  const text = input.value
  const cleaned = text.replace(NOT_NUMBER_CHARACTERS, "")
  if (cleaned === text) return
  const caret = input.selectionStart ?? text.length
  const removedBeforeCaret =
    caret - text.slice(0, caret).replace(NOT_NUMBER_CHARACTERS, "").length
  input.value = cleaned
  input.setSelectionRange(
    caret - removedBeforeCaret,
    caret - removedBeforeCaret
  )
}

const invalidMessages: Partial<Record<FieldDefinition["kind"], string>> = {
  number: "Enter a number.",
  url: "Enter a full link, like https://example.com",
}

// Partial input like "1." or "-" stays text so typing isn't rewritten; the repository rejects it if saved as is.
const toNumber = (text: string) => {
  const trimmed = text.trim()
  if (!trimmed) return null
  return COMPLETE_NUMBER.test(trimmed) ? Number(trimmed) : text
}

function TextLikeInput({
  inputId,
  field,
  value,
  layout,
  commitOnBlur,
  onChange,
}: Omit<FieldInputProps, "timezone" | "labelId">) {
  const kind = field.kind
  const parse = (text: string) =>
    kind === "number" ? toNumber(text) : text.trim() || null
  const shown = value === undefined ? "" : String(value)
  const errorId = `${inputId}-error`
  const invalidMessage = invalidMessages[kind]
  const inputProps = {
    id: inputId,
    dir: "auto" as const,
    type: kind === "url" ? "url" : "text",
    pattern: kind === "number" ? NUMBER_PATTERN : undefined,
    inputMode:
      kind === "number"
        ? ("decimal" as const)
        : kind === "url"
          ? ("url" as const)
          : undefined,
    placeholder:
      kind === "url" ? "https://" : layout === "row" ? "Empty" : undefined,
    className: cn(
      "peer user-invalid:border-destructive user-invalid:ring-2 user-invalid:ring-destructive/20 max-md:h-11",
      layout === "row"
        ? "h-7 truncate border-transparent bg-transparent text-[13px] placeholder:text-muted-foreground/60 hover:bg-muted focus-visible:bg-muted md:text-[13px] dark:bg-transparent dark:hover:bg-muted dark:focus-visible:bg-muted"
        : "h-8"
    ),
  }

  return (
    <div className="flex min-w-0 flex-col gap-1">
      {commitOnBlur ? (
        <Input
          key={shown}
          {...inputProps}
          defaultValue={shown}
          onBlur={(event) => {
            markValidity(event.currentTarget, errorId)
            if (!event.currentTarget.checkValidity()) return
            const next = parse(event.currentTarget.value)
            if (next !== (value ?? null)) onChange(next)
          }}
          onChange={(event) => {
            if (kind === "number") keepNumberCharacters(event.currentTarget)
            refreshValidity(event.currentTarget, errorId)
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur()
          }}
        />
      ) : (
        <Input
          {...inputProps}
          value={shown}
          onBlur={(event) => markValidity(event.currentTarget, errorId)}
          onChange={(event) => {
            if (kind === "number") keepNumberCharacters(event.currentTarget)
            refreshValidity(event.currentTarget, errorId)
            const text = event.currentTarget.value
            if (kind === "number") onChange(toNumber(text))
            else onChange(text.trim() ? text : null)
          }}
        />
      )}
      {invalidMessage ? (
        <p
          id={errorId}
          role="alert"
          className={cn(
            "hidden text-xs text-destructive peer-user-invalid:block",
            layout === "row" && "px-2"
          )}
        >
          {invalidMessage}
        </p>
      ) : null}
    </div>
  )
}

function FieldControl({
  inputId,
  labelId,
  field,
  value,
  timezone,
  layout,
  commitOnBlur,
  onChange,
}: FieldInputProps) {
  switch (field.kind) {
    case "text":
    case "number":
    case "url":
      return (
        <TextLikeInput
          inputId={inputId}
          field={field}
          value={value}
          layout={layout}
          commitOnBlur={commitOnBlur}
          onChange={onChange}
        />
      )
    case "date": {
      const date = typeof value === "string" ? value : null
      return (
        <DueDateMenu
          value={date}
          timezone={timezone}
          onChange={onChange}
          trigger={
            <Button
              id={inputId}
              type="button"
              variant={layout === "row" ? "ghost" : "outline"}
              className={cn(
                "justify-start font-normal max-md:h-11",
                layout === "row" ? "h-7 px-2 text-[13px]" : "h-8",
                !date &&
                  (layout === "row"
                    ? "text-muted-foreground/60"
                    : "text-muted-foreground")
              )}
            >
              <CalendarDays data-icon="inline-start" />
              {date ? formatDayLabel(date) : "Pick a date"}
            </Button>
          }
        />
      )
    }
    case "choice":
    case "multiChoice": {
      const selected = Array.isArray(value)
        ? value
        : typeof value === "string"
          ? [value]
          : []
      return field.options.length === 0 ? (
        <p
          className={cn(
            "text-xs text-muted-foreground",
            layout === "row" && "px-2 py-1.5 max-md:py-3.5"
          )}
        >
          No options yet. Add them in Settings.
        </p>
      ) : (
        <ToggleGroup
          id={inputId}
          aria-labelledby={labelId}
          variant={layout === "row" ? "default" : "outline"}
          size="sm"
          spacing={layout === "row" ? 1 : 4}
          multiple={field.kind === "multiChoice"}
          value={selected}
          onValueChange={(next) =>
            onChange(
              field.kind === "multiChoice"
                ? next.length > 0
                  ? next
                  : null
                : (next[0] ?? null)
            )
          }
          className={cn("flex-wrap", layout === "row" && "min-h-7 px-1")}
        >
          {field.options.map((option) => (
            <ToggleGroupItem
              key={option.id}
              value={option.id}
              className={cn(
                "max-md:h-11",
                layout === "row" &&
                  "text-xs font-normal text-muted-foreground/70 aria-pressed:bg-selection aria-pressed:font-medium aria-pressed:text-accent-text"
              )}
            >
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )
    }
    case "checkbox":
      return (
        <div
          className={cn(
            "flex items-center max-md:h-11",
            layout === "row" ? "h-7 px-2" : "h-8"
          )}
        >
          <Checkbox
            id={inputId}
            checked={value === true}
            onCheckedChange={(checked) => onChange(checked ? true : null)}
          />
        </div>
      )
    case "rating": {
      const rating = typeof value === "number" ? value : 0
      return (
        <div
          id={inputId}
          role="group"
          aria-labelledby={labelId}
          className={cn(
            "flex items-center max-md:h-11",
            layout === "row" ? "h-7 px-1" : "h-8"
          )}
        >
          {RATINGS.map((stars) => (
            <Button
              key={stars}
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={stars === 1 ? "1 star" : `${stars} stars`}
              aria-pressed={stars <= rating}
              className="max-md:size-11"
              onClick={() => onChange(stars === rating ? null : stars)}
            >
              <Star
                className={cn(
                  "text-chart-4",
                  stars <= rating && "fill-current"
                )}
              />
            </Button>
          ))}
        </div>
      )
    }
  }
}

function FieldInput(props: Omit<FieldInputProps, "inputId" | "labelId">) {
  // The same field can render twice (side panel and mobile), so ids come from useId.
  const inputId = useId()
  const labelId = `${inputId}-label`
  if (props.layout === "row") {
    return (
      <Field className="grid grid-cols-[128px_minmax(0,1fr)] items-start gap-2 max-md:grid-cols-[96px_minmax(0,1fr)]">
        <FieldLabel
          id={labelId}
          htmlFor={inputId}
          title={props.field.name}
          className="block pt-1.5 text-[13px] leading-4 font-normal text-muted-foreground max-md:pt-3.5"
        >
          <span className="line-clamp-2 break-words">{props.field.name}</span>
        </FieldLabel>
        <FieldControl {...props} inputId={inputId} labelId={labelId} />
      </Field>
    )
  }
  return (
    <Field className="gap-1.5">
      <FieldLabel
        id={labelId}
        htmlFor={inputId}
        className="text-xs font-normal text-muted-foreground"
      >
        {props.field.name}
      </FieldLabel>
      <FieldControl {...props} inputId={inputId} labelId={labelId} />
    </Field>
  )
}

export { FieldInput }
