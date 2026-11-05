import { useId } from "react"
import { CalendarDays, Star } from "lucide-react"
import { formatDayLabel } from "@knight-os/server/core"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"
import type { FieldDefinition, FieldValue } from "../fields"
import { DueDateMenu } from "./DueDateMenu"

type FieldInputProps = {
  inputId: string
  labelId: string
  field: FieldDefinition & { name: string }
  value: FieldValue | undefined
  timezone: string
  // Saved fields commit on blur so typing doesn't write on every key; the new-activity form commits on change.
  commitOnBlur?: boolean
  onChange: (value: unknown) => void
}

const RATINGS = [1, 2, 3, 4, 5] as const

const COMPLETE_NUMBER = /^-?\d+(\.\d+)?$/

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
  commitOnBlur,
  onChange,
}: Omit<FieldInputProps, "timezone" | "labelId">) {
  const kind = field.kind
  const parse = (text: string) =>
    kind === "number" ? toNumber(text) : text.trim() || null
  const shown = value === undefined ? "" : String(value)
  const inputProps = {
    id: inputId,
    dir: "auto" as const,
    inputMode:
      kind === "number"
        ? ("decimal" as const)
        : kind === "url"
          ? ("url" as const)
          : undefined,
    placeholder: kind === "url" ? "https://" : undefined,
    className: "h-8 max-md:h-11",
  }

  return commitOnBlur ? (
    <Input
      key={shown}
      {...inputProps}
      defaultValue={shown}
      onBlur={(event) => {
        const next = parse(event.currentTarget.value)
        if (next !== (value ?? null)) onChange(next)
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur()
      }}
    />
  ) : (
    <Input
      {...inputProps}
      value={shown}
      onChange={(event) => {
        const text = event.currentTarget.value
        if (kind === "number") onChange(toNumber(text))
        else onChange(text.trim() ? text : null)
      }}
    />
  )
}

function FieldControl({
  inputId,
  labelId,
  field,
  value,
  timezone,
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
              variant="outline"
              className={cn(
                "h-8 justify-start font-normal max-md:h-11",
                !date && "text-muted-foreground"
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
        <p className="text-xs text-muted-foreground">
          No options yet. Add them in Settings.
        </p>
      ) : (
        <ToggleGroup
          id={inputId}
          aria-labelledby={labelId}
          variant="outline"
          size="sm"
          spacing={4}
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
          className="flex-wrap"
        >
          {field.options.map((option) => (
            <ToggleGroupItem
              key={option.id}
              value={option.id}
              className="max-md:h-11"
            >
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )
    }
    case "checkbox":
      return (
        <div className="flex h-8 items-center max-md:h-11">
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
          className="flex h-8 items-center max-md:h-11"
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
