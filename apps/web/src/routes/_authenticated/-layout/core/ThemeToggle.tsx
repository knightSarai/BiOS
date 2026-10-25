import { useRouteContext } from "@tanstack/react-router"
import { Moon, Sun } from "lucide-react"
import { THEME } from "@knight-os/server/core"
import { useSetTheme } from "@/hooks/use-set-theme"

function ThemeToggle() {
  const { resolvedTheme } = useRouteContext({ from: "__root__" })
  const setTheme = useSetTheme()

  const isDark = () =>
    resolvedTheme === THEME.system
      ? document.documentElement.classList.contains("dark")
      : resolvedTheme === THEME.dark

  const label =
    resolvedTheme === THEME.dark
      ? "Light theme"
      : resolvedTheme === THEME.light
        ? "Dark theme"
        : "Switch theme"
  const Icon = resolvedTheme === THEME.dark ? Sun : Moon

  return (
    <button
      type="button"
      disabled={setTheme.isPending}
      onClick={() =>
        setTheme.mutate({ theme: isDark() ? THEME.light : THEME.dark })
      }
      className="flex min-h-8 w-full items-center gap-[9px] rounded-md px-2 text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground max-md:min-h-11"
    >
      <Icon className="size-4 shrink-0" />
      <span>{label}</span>
    </button>
  )
}

export { ThemeToggle }
