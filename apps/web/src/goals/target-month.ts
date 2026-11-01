const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]

const TARGET_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

const isTargetMonth = (value: string) => TARGET_MONTH_PATTERN.test(value)

const formatTargetMonth = (value: string) =>
  isTargetMonth(value)
    ? `${MONTHS[Number(value.slice(5, 7)) - 1]} ${value.slice(0, 4)}`
    : value

const monthsOfYear = (year: number) =>
  MONTHS.map((label, index) => ({
    value: `${year}-${String(index + 1).padStart(2, "0")}`,
    label,
  }))

export { formatTargetMonth, isTargetMonth, monthsOfYear }
