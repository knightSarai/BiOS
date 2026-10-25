import { useFieldContext, useStore } from "@/hooks/form"
import { cn } from "@/lib/utils"
import { Field, FieldLabel } from "@/components/ui/field"
import { FieldErrorText } from "./FieldErrorText"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"

export function NumberField({
  label,
  prefix,
  suffix,
  showDirty,
  ...inputProps
}: {
  label?: string
  prefix?: React.ReactNode
  suffix?: React.ReactNode
  showDirty?: boolean
} & Omit<
  React.ComponentProps<typeof Input>,
  "value" | "onChange" | "onBlur" | "type"
>) {
  const field = useFieldContext<number | null>()
  const isDirty = !!showDirty && !field.state.meta.isDefaultValue
  const submitted = useStore(field.form.store, (s) => s.submissionAttempts > 0)
  const showError =
    (field.state.meta.isBlurred || submitted) &&
    field.state.meta.errors.length > 0

  return (
    <Field>
      {label != null && (
        <FieldLabel htmlFor={inputProps.id ?? field.name}>
          {label}
          {inputProps.required && (
            <span className="ml-0.5 text-destructive" aria-hidden>
              *
            </span>
          )}
        </FieldLabel>
      )}
      <InputGroup
        className={cn(
          inputProps.readOnly &&
            "border-transparent bg-transparent shadow-none has-[[data-slot=input-group-control]:focus-visible]:border-transparent has-[[data-slot=input-group-control]:focus-visible]:ring-0 dark:bg-transparent",
          isDirty && "bg-primary/5"
        )}
      >
        {prefix != null && (
          <InputGroupAddon align="inline-start">{prefix}</InputGroupAddon>
        )}
        <InputGroupInput
          {...inputProps}
          id={inputProps.id ?? field.name}
          name={field.name}
          type="number"
          value={field.state.value ?? ""}
          onChange={(e) => {
            const raw = e.target.value
            field.handleChange(raw === "" ? null : Number(raw))
          }}
          onBlur={field.handleBlur}
          aria-invalid={showError || undefined}
          placeholder={
            inputProps.readOnly && !inputProps.placeholder
              ? "—"
              : inputProps.placeholder
          }
          className={cn(inputProps.readOnly && "px-0", inputProps.className)}
        />
        {isDirty && (
          <span className="pointer-events-none mr-2 size-1.5 shrink-0 rounded-full bg-primary" />
        )}
        {suffix != null && (
          <InputGroupAddon align="inline-end">{suffix}</InputGroupAddon>
        )}
      </InputGroup>
      {showError && <FieldErrorText errors={field.state.meta.errors} />}
    </Field>
  )
}
