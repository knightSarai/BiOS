import { z } from "zod"
import { DATE_ORDERS, DATE_SEPARATORS } from "./datetime"

const IANA_TIMEZONES = new Set(Intl.supportedValuesOf("timeZone"))

export const timezoneSchema = z
  .string()
  .refine((value) => IANA_TIMEZONES.has(value), {
    message: "Must be a valid IANA timezone",
  })

export const workspaceGeneralSettingsSchema = z.object({
  timezone: timezoneSchema,
  dateOrder: z.enum(DATE_ORDERS),
  dateSeparator: z.enum(DATE_SEPARATORS),
})

export type WorkspaceGeneralSettings = z.infer<
  typeof workspaceGeneralSettingsSchema
>

export const DEFAULT_WORKSPACE_GENERAL_SETTINGS: WorkspaceGeneralSettings = {
  timezone: "UTC",
  dateOrder: "YMD",
  dateSeparator: "-",
}

export const themeSchema = z.enum(["light", "dark", "system"])

export type Theme = z.infer<typeof themeSchema>

export const THEME = themeSchema.enum

export const preferencesSchema = z.object({
  theme: themeSchema,
})

export type Preferences = z.infer<typeof preferencesSchema>

export const DEFAULT_PREFERENCES: Preferences = { theme: THEME.system }
