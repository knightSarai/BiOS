import { z } from "zod"
import { isCivilDate } from "@knight-os/server/core"

const FIELD_KINDS = [
  "text",
  "number",
  "date",
  "choice",
  "multiChoice",
  "checkbox",
  "url",
  "rating",
] as const

type FieldKind = (typeof FIELD_KINDS)[number]

type FieldOption = { id: string; label: string }

type FieldDefinition = {
  id: string
  kind: FieldKind
  options: FieldOption[]
}

type FieldValue = string | number | boolean | string[]

type FieldValues = Record<string, FieldValue>

const fieldKindLabels: Record<FieldKind, string> = {
  text: "Text",
  number: "Number",
  date: "Date",
  choice: "Choice",
  multiChoice: "Multiple choice",
  checkbox: "Checkbox",
  url: "Link",
  rating: "Rating",
}

const civilDate = z.string().refine(isCivilDate, "Expected a YYYY-MM-DD date")

const valueSchema = (field: FieldDefinition) => {
  const optionIds = field.options.map((option) => option.id)
  switch (field.kind) {
    case "text":
      return z.string().trim().min(1)
    case "number":
      return z.number()
    case "date":
      return civilDate
    case "choice":
      return z.string().refine((id) => optionIds.includes(id))
    case "multiChoice":
      return z
        .array(z.string().refine((id) => optionIds.includes(id)))
        .min(1)
        .transform((ids) => [...new Set(ids)])
    case "checkbox":
      return z.boolean()
    case "url":
      return z.url()
    case "rating":
      return z.number().int().min(1).max(5)
  }
}

class InvalidFieldValueError extends Error {}

// Absent means unset, so a cleared value is dropped rather than stored as null.
const setFieldValue = (
  values: FieldValues,
  field: FieldDefinition,
  value: unknown
): FieldValues => {
  const rest = Object.fromEntries(
    Object.entries(values).filter(([id]) => id !== field.id)
  )
  if (value === null || value === undefined) return rest
  const parsed = valueSchema(field).safeParse(value)
  if (!parsed.success) {
    throw new InvalidFieldValueError(
      `Invalid ${fieldKindLabels[field.kind].toLowerCase()} value.`
    )
  }
  return { ...rest, [field.id]: parsed.data }
}

const parseFieldValues = (
  fields: FieldDefinition[],
  values: Record<string, unknown>
): FieldValues =>
  fields.reduce<FieldValues>(
    (result, field) => setFieldValue(result, field, values[field.id]),
    {}
  )

// Values that no longer fit their field (deleted field, removed option) are dropped silently;
// only a deliberate change of type warns first.
const withoutRemovedOptions = (field: FieldDefinition, value: unknown) =>
  field.kind === "multiChoice" && Array.isArray(value)
    ? value.filter((id) => field.options.some((option) => option.id === id))
    : value

const keepValidValues = (
  fields: FieldDefinition[],
  values: FieldValues
): FieldValues =>
  fields.reduce<FieldValues>((result, field) => {
    const parsed = valueSchema(field).safeParse(
      withoutRemovedOptions(field, values[field.id])
    )
    return parsed.success ? { ...result, [field.id]: parsed.data } : result
  }, {})

const kindHasOptions = (kind: FieldKind) =>
  kind === "choice" || kind === "multiChoice"

// Fields belong to one type, so a type change loses every value the old type had set.
const valuesLostOnTypeChange = (
  fields: FieldDefinition[],
  values: FieldValues
) => fields.filter((field) => field.id in values)

export {
  FIELD_KINDS,
  InvalidFieldValueError,
  fieldKindLabels,
  keepValidValues,
  kindHasOptions,
  parseFieldValues,
  setFieldValue,
  valuesLostOnTypeChange,
}
export type { FieldDefinition, FieldKind, FieldOption, FieldValue, FieldValues }
