import { useMemo } from "react"
import { atom, useAtom } from "jotai"
import {
  addCivilDays,
  now,
  parseCivilDate,
  toCivilDate,
  toLocalDate,
} from "@knight-os/server/core"
import { calendarBounds } from "@/components/forms/calendar-bounds"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

type DueDateMenuProps = {
  value: string | null
  timezone: string
  trigger: React.ReactElement
  onChange: (dueDate: string | null) => void
}

function DueDateMenu({ value, timezone, trigger, onChange }: DueDateMenuProps) {
  // One open state per menu instance; useMemo keeps the atom stable across renders.
  const openAtom = useMemo(() => atom(false), [])
  const [open, setOpen] = useAtom(openAtom)
  const today = toLocalDate(now(), timezone)
  const bounds = calendarBounds()
  const pick = (dueDate: string | null) => {
    onChange(dueDate)
    setOpen(false)
  }
  const shortcuts = [
    { label: "Today", date: today },
    { label: "Tomorrow", date: addCivilDays(today, 1) },
    { label: "Next week", date: addCivilDays(today, 7) },
  ]

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={trigger} />
      <PopoverContent align="start" className="w-auto gap-2 p-2">
        <div className="flex flex-wrap gap-1">
          {shortcuts.map((shortcut) => (
            <Button
              key={shortcut.label}
              type="button"
              variant="secondary"
              size="sm"
              className="max-md:h-11"
              onClick={() => pick(shortcut.date)}
            >
              {shortcut.label}
            </Button>
          ))}
          {value ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="max-md:h-11"
              onClick={() => pick(null)}
            >
              Clear
            </Button>
          ) : null}
        </div>
        <Calendar
          mode="single"
          captionLayout="dropdown"
          startMonth={bounds.startMonth}
          endMonth={bounds.endMonth}
          defaultMonth={parseCivilDate(value ?? today)}
          selected={value ? parseCivilDate(value) : undefined}
          onSelect={(date) => pick(date ? toCivilDate(date) : null)}
        />
      </PopoverContent>
    </Popover>
  )
}

export { DueDateMenu }
