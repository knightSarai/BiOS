import { useFieldContext, useStore } from "@/hooks/form"
import { cn } from "@/lib/utils"
import { Field, FieldLabel } from "@/components/ui/field"
import { FieldErrorText } from "./FieldErrorText"
import { Textarea } from "@/components/ui/textarea"

export function TextArea({
  label,
  showDirty,
  ...textareaProps
}: {
  label: string
  showDirty?: boolean
} & Omit<
  React.ComponentProps<typeof Textarea>,
  "value" | "onChange" | "onBlur"
>) {
  const field = useFieldContext<string>()
  const isDirty = !!showDirty && !field.state.meta.isDefaultValue
  const submitted = useStore(field.form.store, (s) => s.submissionAttempts > 0)

  return (
    <Field>
      <FieldLabel htmlFor={textareaProps.id ?? field.name}>
        {label}
        {textareaProps.required && (
          <span className="ml-0.5 text-destructive" aria-hidden>
            *
          </span>
        )}
      </FieldLabel>
      <div className="relative">
        <Textarea
          id={textareaProps.id ?? field.name}
          name={field.name}
          value={field.state.value}
          onChange={(e) => field.handleChange(e.target.value)}
          onBlur={() => {
            const trimmed = field.state.value.trim()
            if (trimmed !== field.state.value) field.handleChange(trimmed)
            field.handleBlur()
          }}
          {...textareaProps}
          placeholder={
            textareaProps.readOnly && !textareaProps.placeholder
              ? "—"
              : textareaProps.placeholder
          }
          className={cn(
            textareaProps.readOnly &&
              "border-transparent bg-transparent px-0 shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent",
            isDirty && "bg-primary/5",
            textareaProps.className
          )}
        />
        {isDirty && (
          <span className="pointer-events-none absolute top-2.5 right-3 size-1.5 rounded-full bg-primary" />
        )}
      </div>
      {(field.state.meta.isBlurred || submitted) &&
        field.state.meta.errors.length > 0 && (
          <FieldErrorText errors={field.state.meta.errors} />
        )}
    </Field>
  )
}
