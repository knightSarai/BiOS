import { useRouteContext } from "@tanstack/react-router"
import { THEME, type Theme } from "@knight-os/server/core"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useSetTheme } from "@/hooks/use-set-theme"

const options: { value: Theme; label: string }[] = [
  { value: THEME.system, label: "System preference" },
  { value: THEME.light, label: "Light" },
  { value: THEME.dark, label: "Dark" },
]

export function ThemeSelect({ id }: { id: string }) {
  const { resolvedTheme } = useRouteContext({ from: "__root__" })
  const setTheme = useSetTheme()

  return (
    <Select
      items={options}
      value={resolvedTheme}
      onValueChange={(theme) => {
        if (theme) setTheme.mutate({ theme })
      }}
    >
      <SelectTrigger id={id} className="w-full sm:w-48">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
