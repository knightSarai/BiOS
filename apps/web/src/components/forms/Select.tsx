import { useFieldContext, useStore } from "@/hooks/form"
import { cn } from "@/lib/utils"
import {
  Select as SelectRoot,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Field, FieldLabel } from "@/components/ui/field"
import { FieldErrorText } from "./FieldErrorText"

export type SelectOption = { value: string; label: string }

type Props = {
  label?: string
  options: readonly SelectOption[]
  placeholder?: string
  required?: boolean
  readOnly?: boolean
  showDirty?: boolean
  onBeforeChange?: (next: string | null) => boolean
}

export function Select({
  label,
  options,
  placeholder,
  required,
  readOnly,
  showDirty,
  onBeforeChange,
}: Props) {
  const field = useFieldContext<string | null>()
  const isDirty = !!showDirty && !field.state.meta.isDefaultValue
  const submitted = useStore(field.form.store, (s) => s.submissionAttempts > 0)
  const selectedLabel = options.find(
    (option) => option.value === field.state.value
  )?.label

  return (
    <Field>
      {label != null && (
        <FieldLabel htmlFor={readOnly ? undefined : field.name}>
          {label}
          {required && (
            <span className="ml-0.5 text-destructive" aria-hidden>
              *
            </span>
          )}
        </FieldLabel>
      )}
      <div className="relative">
        {readOnly ? (
          <div className="flex h-7 items-center text-sm">
            {selectedLabel ?? <span className="text-muted-foreground">—</span>}
          </div>
        ) : (
          <SelectRoot
            items={options}
            value={field.state.value}
            onValueChange={(value, eventDetails) => {
              if (onBeforeChange?.(value) === false) {
                eventDetails.cancel()
                return
              }
              field.handleChange(value)
            }}
          >
            <SelectTrigger
              id={field.name}
              onBlur={field.handleBlur}
              className={cn("w-full", isDirty && "bg-primary/5")}
            >
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </SelectRoot>
        )}
        {isDirty && (
          <span className="pointer-events-none absolute inset-y-0 right-7 my-auto size-1.5 rounded-full bg-primary" />
        )}
      </div>
      {(field.state.meta.isBlurred || submitted) &&
        field.state.meta.errors.length > 0 && (
          <FieldErrorText errors={field.state.meta.errors} />
        )}
    </Field>
  )
}
