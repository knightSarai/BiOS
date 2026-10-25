import { useId, type ReactNode } from "react"
import { useFieldContext, useStore } from "@/hooks/form"
import { cn } from "@/lib/utils"
import { Field, FieldLabel } from "@/components/ui/field"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { FieldErrorText } from "./FieldErrorText"

type ToggleOption<Value> = { value: Value; label: string }

type Props<Value> = {
  label: ReactNode
  options: readonly ToggleOption<Value>[]
  required?: boolean
  readOnly?: boolean
  disabled?: boolean
  showDirty?: boolean
}

export function ToggleGroupField<Value extends string | boolean>({
  label,
  options,
  required,
  readOnly,
  disabled,
  showDirty,
}: Props<Value>) {
  const field = useFieldContext<Value>()
  const labelId = useId()
  const isDirty = !!showDirty && !field.state.meta.isDefaultValue
  const submitted = useStore(field.form.store, (s) => s.submissionAttempts > 0)
  const selectedLabel = options.find(
    (option) => option.value === field.state.value
  )?.label

  return (
    <Field>
      <FieldLabel id={labelId}>
        {label}
        {required && (
          <span className="ml-0.5 text-destructive" aria-hidden>
            *
          </span>
        )}
      </FieldLabel>
      {readOnly ? (
        <div className="flex h-7 items-center text-sm">
          {selectedLabel ?? <span className="text-muted-foreground">—</span>}
        </div>
      ) : (
        <ToggleGroup
          aria-labelledby={labelId}
          variant="outline"
          spacing={0}
          disabled={disabled}
          value={[String(field.state.value)]}
          onValueChange={([next]) => {
            const picked = options.find(
              (option) => String(option.value) === next
            )
            if (picked) field.handleChange(picked.value)
          }}
          onBlur={field.handleBlur}
          className={cn(isDirty && "bg-primary/5")}
        >
          {options.map((option) => (
            <ToggleGroupItem
              key={String(option.value)}
              value={String(option.value)}
              className="aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"
            >
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}
      {(field.state.meta.isBlurred || submitted) &&
        field.state.meta.errors.length > 0 && (
          <FieldErrorText errors={field.state.meta.errors} />
        )}
    </Field>
  )
}
