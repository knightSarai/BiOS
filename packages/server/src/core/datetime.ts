import dayjs, { type ConfigType } from "dayjs"
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"
import customParseFormat from "dayjs/plugin/customParseFormat"
import type { WorkspaceGeneralSettings } from "./schemas"

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(customParseFormat)

export type UtcDatetime = string & { readonly _type: "UtcDatetime" }
export type DateString = string & { readonly _type: "DateString" }

export const DATE_ORDERS = ["DMY", "MDY", "YMD"] as const
export const DATE_SEPARATORS = ["/", "-", "."] as const

export type DateOrder = (typeof DATE_ORDERS)[number]
export type DateSeparator = (typeof DATE_SEPARATORS)[number]

const DEFAULT_DATE_ORDER: DateOrder = "YMD"
const DEFAULT_DATE_SEPARATOR: DateSeparator = "-"

const STRICT_UTC_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(?:Z|\+00:00)$/

export const parseUtc = (value: string | Date): UtcDatetime => {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new TypeError("Invalid UtcDatetime: Invalid Date")
    }
    return value.toISOString() as UtcDatetime
  }
  if (typeof value !== "string") {
    throw new TypeError(`Invalid UtcDatetime: ${String(value)}`)
  }
  const match = STRICT_UTC_PATTERN.exec(value)
  if (!match) {
    throw new TypeError(`Invalid UtcDatetime: ${value}`)
  }
  const [, year, month, day, hour, minute, second, ms] = match
  const y = Number(year)
  const mo = Number(month)
  const d = Number(day)
  const h = Number(hour)
  const mi = Number(minute)
  const s = Number(second)
  const msN = ms ? Number(ms.padEnd(3, "0")) : 0

  const date = new Date(Date.UTC(y, mo - 1, d, h, mi, s, msN))
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== mo - 1 ||
    date.getUTCDate() !== d ||
    date.getUTCHours() !== h ||
    date.getUTCMinutes() !== mi ||
    date.getUTCSeconds() !== s
  ) {
    throw new TypeError(`Invalid UtcDatetime: ${value}`)
  }
  return date.toISOString() as UtcDatetime
}

export const now = (): Date => dayjs.utc().toDate()

export const utcPlusSeconds = (seconds: number) =>
  parseUtc(dayjs.utc().add(seconds, "second").toDate())

const CIVIL_DATE_FORMAT = "YYYY-MM-DD"


export const isCivilDate = (value: string): boolean =>
  dayjs(value, CIVIL_DATE_FORMAT, true).isValid()

export const parseCivilDate = (value: string): Date =>
  dayjs(value, CIVIL_DATE_FORMAT).toDate()

export const addCivilDays = (value: string, days: number): string =>
  dayjs(value, CIVIL_DATE_FORMAT).add(days, "day").format(CIVIL_DATE_FORMAT)

export const toCivilDate = (date: Date): string =>
  dayjs(date).format(CIVIL_DATE_FORMAT)

export const startOfDayUtc = (date: string, timezone: string): Date =>
  dayjs.tz(date, timezone).toDate()

export const endOfDayUtc = (date: string, timezone: string): Date =>
  oneMillisecondBefore(startOfDayUtc(addCivilDays(date, 1), timezone))

export const toLocalDate = (instant: ConfigType, timezone: string): string =>
  dayjs.utc(instant).tz(timezone).format("YYYY-MM-DD")

export const sameInstant = (a: ConfigType, b: ConfigType): boolean =>
  dayjs(a).isSame(dayjs(b))

export const oneMillisecondBefore = (instant: ConfigType): Date =>
  dayjs(instant).subtract(1, "millisecond").toDate()

export const oneMillisecondAfter = (instant: ConfigType): Date =>
  dayjs(instant).add(1, "millisecond").toDate()

const ORDER_PARTS = {
  DMY: ["DD", "MM", "YYYY"],
  MDY: ["MM", "DD", "YYYY"],
  YMD: ["YYYY", "MM", "DD"],
} as const

type OrderParts = typeof ORDER_PARTS

type DateFormatPattern<
  Order extends DateOrder = DateOrder,
  Separator extends DateSeparator = DateSeparator,
> = Order extends DateOrder
  ? Separator extends DateSeparator
    ? `${OrderParts[Order][0]}${Separator}${OrderParts[Order][1]}${Separator}${OrderParts[Order][2]}`
    : never
  : never

export const composeDateFormatPattern = <
  O extends DateOrder,
  S extends DateSeparator,
>(
  order: O,
  separator: S,
): DateFormatPattern<O, S> =>
  ORDER_PARTS[order].join(separator) as DateFormatPattern<O, S>

/**
 * Importers MUST consult `dateOrder` when parsing user-uploaded date strings.
 * `dateSeparator` is cosmetic — accept any of `/ - .` regardless.
 */
export const formatDate = (
  instant: UtcDatetime,
  tz: string,
  opts: { order?: DateOrder; separator?: DateSeparator } = {},
): DateString =>
  dayjs
    .utc(instant)
    .tz(tz)
    .format(
      composeDateFormatPattern(
        opts.order ?? DEFAULT_DATE_ORDER,
        opts.separator ?? DEFAULT_DATE_SEPARATOR,
      ),
    ) as DateString

export const formatWorkspaceDate = (
  instant: string | Date,
  settings: Pick<
    WorkspaceGeneralSettings,
    "timezone" | "dateOrder" | "dateSeparator"
  >,
) =>
  formatDate(parseUtc(instant), settings.timezone, {
    order: settings.dateOrder,
    separator: settings.dateSeparator,
  })

export const formatCivilDate = (
  value: string,
  opts: { order?: DateOrder; separator?: DateSeparator } = {},
): DateString =>
  dayjs(value, CIVIL_DATE_FORMAT).format(
    composeDateFormatPattern(
      opts.order ?? DEFAULT_DATE_ORDER,
      opts.separator ?? DEFAULT_DATE_SEPARATOR,
    ),
  ) as DateString

export const formatActivityTimestamp = (
  instant: UtcDatetime,
  timezone: string,
  now: UtcDatetime,
) => {
  const local = dayjs.utc(instant).tz(timezone)
  const time = local.format("HH:mm")
  const localDate = toLocalDate(instant, timezone)
  const today = toLocalDate(now, timezone)

  if (localDate === today) return `Today · ${time}`
  if (localDate === addCivilDays(today, -1)) return `Yesterday · ${time}`

  const sameYear = localDate.slice(0, 4) === today.slice(0, 4)
  return `${local.format(sameYear ? "D MMM" : "D MMM YYYY")} · ${time}`
}

export const formatLongLocalDate = (instant: UtcDatetime, timezone: string) =>
  dayjs.utc(instant).tz(timezone).format("dddd, D MMMM")
