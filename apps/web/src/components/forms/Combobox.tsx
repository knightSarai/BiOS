import { useMemo, type ReactNode } from "react"
import { Combobox as ComboboxCollection } from "@base-ui/react/combobox"
import { useFieldContext, useStore } from "@/hooks/form"
import { cn } from "@/lib/utils"
import {
  Combobox as ComboboxRoot,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"
import { Field, FieldLabel } from "@/components/ui/field"
import { FieldErrorText } from "./FieldErrorText"

export type ComboboxOption = { value: number; label: string }

type Props = {
  label: ReactNode
  options: readonly ComboboxOption[]
  placeholder?: string
  required?: boolean
  emptyMessage?: string
  showClear?: boolean
  readOnly?: boolean
  showDirty?: boolean
  onBeforeChange?: (next: number | null) => boolean
}

export function Combobox({
  label,
  options,
  placeholder,
  required,
  emptyMessage = "No results found.",
  showClear,
  readOnly,
  showDirty,
  onBeforeChange,
}: Props) {
  const field = useFieldContext<number | null>()
  const isDirty = !!showDirty && !field.state.meta.isDefaultValue
  const submitted = useStore(field.form.store, (s) => s.submissionAttempts > 0)
  const fieldValue = field.state.value || null
  const items = useMemo(
    () =>
      ComboboxCollection.createItems(options, {
        getValue: (option) => option.value,
        getLabel: (option) => option.label,
      }),
    [options]
  )

  return (
    <Field>
      <FieldLabel htmlFor={readOnly ? undefined : field.name}>
        {label}
        {required && (
          <span className="ml-0.5 text-destructive" aria-hidden>
            *
          </span>
        )}
      </FieldLabel>
      <div className="relative">
        {readOnly ? (
          <div className="flex h-7 items-center text-sm">
            {options.find((option) => option.value === fieldValue)?.label ?? (
              <span className="text-muted-foreground">—</span>
            )}
          </div>
        ) : (
          <ComboboxRoot
            items={items}
            value={fieldValue}
            onValueChange={(value, eventDetails) => {
              if (onBeforeChange?.(value) === false) {
                eventDetails.cancel()
                return
              }
              field.handleChange(value)
            }}
            autoHighlight
          >
            <ComboboxInput
              id={field.name}
              placeholder={placeholder}
              onBlur={field.handleBlur}
              className={cn("w-full", isDirty && "bg-primary/5")}
              showClear={showClear}
            />
            <ComboboxContent>
              <ComboboxEmpty>{emptyMessage}</ComboboxEmpty>
              <ComboboxList>
                {(option: ComboboxOption) => (
                  <ComboboxItem key={option.value} value={option.value}>
                    {option.label}
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </ComboboxRoot>
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
