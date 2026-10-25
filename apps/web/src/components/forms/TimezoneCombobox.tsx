import { useFieldContext } from "@/hooks/form"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"
import { Field, FieldLabel } from "@/components/ui/field"
import { FieldErrorText } from "./FieldErrorText"

const TIMEZONES = Intl.supportedValuesOf("timeZone")

export function TimezoneCombobox({
  label,
  placeholder,
  required,
}: {
  label?: string
  placeholder?: string
  required?: boolean
}) {
  const field = useFieldContext<string>()

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
      <Combobox
        items={TIMEZONES}
        value={field.state.value}
        onValueChange={(value) => field.handleChange(value ?? "")}
        autoHighlight
      >
        <ComboboxInput
          id={field.name}
          placeholder={placeholder}
          onBlur={field.handleBlur}
        />
        <ComboboxContent>
          <ComboboxEmpty>No timezone found.</ComboboxEmpty>
          <ComboboxList>
            {(item: string) => (
              <ComboboxItem key={item} value={item}>
                {item}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      {field.state.meta.isBlurred && field.state.meta.errors.length > 0 && (
        <FieldErrorText errors={field.state.meta.errors} />
      )}
    </Field>
  )
}
