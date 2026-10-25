import {
  createFormHook,
  createFormHookContexts,
  useStore,
} from "@tanstack/react-form"
import { Combobox } from "@/components/forms/Combobox"
import { ToggleGroupField } from "@/components/forms/ToggleGroupField"
import { DatePickerField } from "@/components/forms/DatePickerField"
import { FormError } from "@/components/forms/FormError"
import { InputGroupField } from "@/components/forms/InputGroupField"
import { MultiSelect } from "@/components/forms/MultiSelect"
import { NumberField } from "@/components/forms/NumberField"
import { Select } from "@/components/forms/Select"
import { SubmitButton } from "@/components/forms/SubmitButton"
import { TextArea } from "@/components/forms/TextArea"
import { TextInput } from "@/components/forms/TextInput"
import { TimezoneCombobox } from "@/components/forms/TimezoneCombobox"

export const { fieldContext, formContext, useFieldContext, useFormContext } =
  createFormHookContexts()

export const { useAppForm } = createFormHook({
  fieldComponents: {
    DatePickerField,
    TextInput,
    TextArea,
    TimezoneCombobox,
    Select,
    Combobox,
    InputGroupField,
    MultiSelect,
    NumberField,
    ToggleGroupField,
  },
  formComponents: {
    FormError,
    SubmitButton,
  },
  fieldContext,
  formContext,
})

export { useStore }
