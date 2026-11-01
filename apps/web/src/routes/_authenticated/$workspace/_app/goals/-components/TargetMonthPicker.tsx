import { useRef } from "react"
import { Popover as PopoverPrimitive } from "@base-ui/react/popover"
import { atom, useAtom } from "jotai"
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react"
import { now, toLocalDate } from "@knight-os/server/core"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { formatTargetMonth, monthsOfYear } from "@/goals/target-month"
import { cn } from "@/lib/utils"

// Only the browsed year lives here; Base UI owns open, so leaving the page can't leave a picker open.
const browsingYearAtom = atom<number | null>(null)

type TargetMonthPickerProps = {
  value: string | null
  timezone: string
  onChange: (value: string | null) => void
}

const currentMonthIn = (timezone: string) =>
  toLocalDate(now(), timezone).slice(0, 7)

function TargetMonthPicker({
  value,
  timezone,
  onChange,
}: TargetMonthPickerProps) {
  const [browsingYear, setBrowsingYear] = useAtom(browsingYearAtom)
  const focusMonthRef = useRef<HTMLButtonElement>(null)
  const currentMonth = currentMonthIn(timezone)
  const focusMonth = value ?? currentMonth
  const startYear = Number(focusMonth.slice(0, 4))
  const year = browsingYear ?? startYear

  return (
    <Popover onOpenChange={(open) => open && setBrowsingYear(startYear)}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={
              value
                ? `Target month: ${formatTargetMonth(value)}`
                : "Set target month"
            }
            className="flex min-h-7 items-center gap-1.5 rounded-md px-1.5 hover:bg-accent aria-expanded:bg-accent max-md:min-h-11"
          />
        }
      >
        <CalendarDays aria-hidden className="size-3.5 text-muted-foreground" />
        {value ? (
          <span>{formatTargetMonth(value)}</span>
        ) : (
          <span className="text-muted-foreground">Set target month</span>
        )}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        initialFocus={focusMonthRef}
        className="w-64 gap-2 p-2"
      >
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Previous year"
            onClick={() => setBrowsingYear(year - 1)}
            className="max-md:size-11"
          >
            <ChevronLeft />
          </Button>
          <span aria-live="polite" className="text-sm font-medium tabular-nums">
            {year}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Next year"
            onClick={() => setBrowsingYear(year + 1)}
            className="max-md:size-11"
          >
            <ChevronRight />
          </Button>
        </div>
        <div
          role="group"
          aria-label={`Months in ${year}`}
          className="grid grid-cols-3 gap-1"
        >
          {monthsOfYear(year).map((month) => {
            const selected = month.value === value
            const current = month.value === currentMonth
            return (
              <PopoverPrimitive.Close
                key={month.value}
                render={
                  <button
                    ref={month.value === focusMonth ? focusMonthRef : undefined}
                    type="button"
                    aria-label={formatTargetMonth(month.value)}
                    aria-pressed={selected}
                    aria-current={current ? "date" : undefined}
                    onClick={() => onChange(month.value)}
                    className={cn(
                      "h-9 rounded-md text-sm transition-colors hover:bg-accent max-md:h-11",
                      current && !selected && "font-medium text-accent-text",
                      selected &&
                        "bg-primary text-primary-foreground hover:bg-primary/90"
                    )}
                  />
                }
              >
                {month.label}
              </PopoverPrimitive.Close>
            )
          })}
        </div>
        <div className="flex items-center justify-between border-t pt-2">
          <PopoverPrimitive.Close
            render={
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onChange(currentMonthIn(timezone))}
              />
            }
          >
            This month
          </PopoverPrimitive.Close>
          {value ? (
            <PopoverPrimitive.Close
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onChange(null)}
                  className="text-muted-foreground"
                />
              }
            >
              Clear
            </PopoverPrimitive.Close>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export { TargetMonthPicker }
