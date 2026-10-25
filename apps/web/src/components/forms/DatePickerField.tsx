import { useMemo } from "react"
import { atom, useAtom } from "jotai"
import { CalendarIcon, XIcon } from "lucide-react"
import { parseCivilDate, toCivilDate } from "@knight-os/server/core"
import { useFieldContext, useStore } from "@/hooks/form"
import { useFormatCivilDate } from "@/hooks/use-format-civil-date"
import { cn } from "@/lib/utils"
import { calendarBounds } from "./calendar-bounds"
import { FieldErrorText } from "./FieldErrorText"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Field, FieldLabel } from "@/components/ui/field"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export function DatePickerField({
  label,
  id,
  required,
  showDirty,
  placeholder = "Pick a date",
  minDate,
  nullable,
}: {
  label?: string
  id?: string
  required?: boolean
  showDirty?: boolean
  placeholder?: string
  minDate?: string
  nullable?: boolean
}) {
  const field = useFieldContext<string | null>()
  const emptyValue = nullable ? null : ""
  const value = field.state.value ?? ""
  const formatCivilDate = useFormatCivilDate()
  const openAtom = useMemo(() => atom(false), [])
  const [open, setOpen] = useAtom(openAtom)
  const bounds = calendarBounds()
  const isDirty = !!showDirty && !field.state.meta.isDefaultValue
  const submitted = useStore(field.form.store, (s) => s.submissionAttempts > 0)
  const showErrors =
    (field.state.meta.isBlurred || submitted) &&
    field.state.meta.errors.length > 0

  return (
    <Field>
      {label != null && (
        <FieldLabel htmlFor={id ?? field.name}>
          {label}
          {required && (
            <span className="ml-0.5 text-destructive" aria-hidden>
              *
            </span>
          )}
        </FieldLabel>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <div className="relative">
          <PopoverTrigger
            render={
              <Button
                type="button"
                id={id ?? field.name}
                variant="outline"
                className={cn(
                  "h-7 w-full justify-start border-input bg-input/20 px-2 text-sm font-normal hover:bg-input/30 md:text-xs/relaxed dark:bg-input/30",
                  value === "" && "text-muted-foreground",
                  !required && value !== "" && "pr-7",
                  isDirty && "bg-primary/5"
                )}
              >
                <CalendarIcon />
                {value === "" ? placeholder : formatCivilDate(value)}
              </Button>
            }
          />
          {!required && value !== "" && (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Clear date"
              className="absolute inset-y-0 right-1 my-auto"
              onClick={() => {
                field.handleChange(emptyValue)
                field.handleBlur()
              }}
            >
              <XIcon />
            </Button>
          )}
        </div>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            captionLayout="dropdown"
            startMonth={bounds.startMonth}
            endMonth={bounds.endMonth}
            defaultMonth={value === "" ? undefined : parseCivilDate(value)}
            disabled={
              minDate === undefined
                ? undefined
                : { before: parseCivilDate(minDate) }
            }
            selected={value === "" ? undefined : parseCivilDate(value)}
            onSelect={(date) => {
              field.handleChange(
                date === undefined ? emptyValue : toCivilDate(date)
              )
              field.handleBlur()
              setOpen(false)
            }}
          />
        </PopoverContent>
      </Popover>
      {showErrors && <FieldErrorText errors={field.state.meta.errors} />}
    </Field>
  )
}
