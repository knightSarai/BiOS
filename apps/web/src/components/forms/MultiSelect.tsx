import { useFieldContext, useStore } from "@/hooks/form"
import { cn } from "@/lib/utils"
import { Field, FieldLabel } from "@/components/ui/field"
import {
  MultiSelectInput,
  type MultiSelectOption,
} from "@/components/common/MultiSelectInput"
import { FieldErrorText } from "./FieldErrorText"

export function MultiSelect({
  label,
  placeholder,
  emptyMessage,
  options,
  maxVisibleChips,
  required,
  showDirty,
  showClear,
}: {
  label?: string
  placeholder?: string
  emptyMessage?: string
  options: ReadonlyArray<MultiSelectOption<number>>
  maxVisibleChips?: number
  required?: boolean
  showDirty?: boolean
  showClear?: boolean
}) {
  const field = useFieldContext<number[]>()
  const isDirty = !!showDirty && !field.state.meta.isDefaultValue
  const submitted = useStore(field.form.store, (s) => s.submissionAttempts > 0)
  const showError =
    (field.state.meta.isBlurred || submitted) &&
    field.state.meta.errors.length > 0

  return (
    <Field>
      {label != null && (
        <FieldLabel htmlFor={field.name}>
          {label}
          {required && (
            <span className="ml-0.5 text-destructive" aria-hidden>
              *
            </span>
          )}
        </FieldLabel>
      )}
      <div className="relative">
        <MultiSelectInput
          id={field.name}
          options={options}
          value={field.state.value ?? []}
          onChange={(next) => field.handleChange(next)}
          placeholder={placeholder}
          emptyMessage={emptyMessage}
          maxVisibleChips={maxVisibleChips}
          showClear={showClear}
          onBlur={field.handleBlur}
          className={cn(isDirty && "bg-primary/5 pr-6")}
        />
        {isDirty && (
          <span className="pointer-events-none absolute inset-y-0 right-2 my-auto size-1.5 rounded-full bg-primary" />
        )}
      </div>
      {showError && <FieldErrorText errors={field.state.meta.errors} />}
    </Field>
  )
}
