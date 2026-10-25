import { useFieldContext, useStore } from "@/hooks/form"
import { cn, maskValue } from "@/lib/utils"
import { Field, FieldLabel } from "@/components/ui/field"
import { FieldErrorText } from "./FieldErrorText"
import { Input } from "@/components/ui/input"

export function TextInput({
  label,
  groups,
  separator,
  showDirty,
  showErrorsWhileTyping,
  displayValue,
  ...inputProps
}: {
  label?: string
  showDirty?: boolean
  showErrorsWhileTyping?: boolean
  displayValue?: string
  type?: "text" | "email" | "tel" | "search" | "password" | "url"
} & Partial<Parameters<typeof maskValue>[1]> &
  Omit<
    React.ComponentProps<typeof Input>,
    "value" | "onChange" | "onBlur" | "type"
  >) {
  const field = useFieldContext<string>()
  const mask = groups && { groups, separator }
  const isDirty = !!showDirty && !field.state.meta.isDefaultValue
  const submitted = useStore(field.form.store, (s) => s.submissionAttempts > 0)
  const showErrors =
    (field.state.meta.isBlurred ||
      submitted ||
      (!!showErrorsWhileTyping &&
        !field.state.meta.isDefaultValue &&
        field.state.meta.errorSourceMap?.onChange === "field")) &&
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
      <div className="relative">
        <Input
          id={inputProps.id ?? field.name}
          name={field.name}
          value={
            inputProps.readOnly && displayValue !== undefined
              ? displayValue
              : mask
                ? maskValue(field.state.value, mask).display
                : field.state.value
          }
          onChange={(e) =>
            field.handleChange(
              mask ? maskValue(e.target.value, mask).value : e.target.value
            )
          }
          onBlur={() => {
            const trimmed = field.state.value.trim()
            if (trimmed !== field.state.value) field.handleChange(trimmed)
            field.handleBlur()
          }}
          {...inputProps}
          placeholder={
            inputProps.readOnly && !inputProps.placeholder
              ? "—"
              : inputProps.placeholder
          }
          className={cn(
            inputProps.readOnly &&
              "border-transparent bg-transparent px-0 shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent",
            isDirty && "bg-primary/5",
            inputProps.className
          )}
        />
        {isDirty && (
          <span className="pointer-events-none absolute inset-y-0 right-3 my-auto size-1.5 rounded-full bg-primary" />
        )}
      </div>
      {showErrors && <FieldErrorText errors={field.state.meta.errors} />}
    </Field>
  )
}
