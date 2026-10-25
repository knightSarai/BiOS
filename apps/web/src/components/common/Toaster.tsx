import { Toaster as SonnerToaster, type ToasterProps } from "sonner"
import { Loader2Icon } from "lucide-react"

function Dot({ token }: { token: "success" | "info" | "warning" | "error" }) {
  return (
    <span
      aria-hidden
      className="block size-2 shrink-0 rounded-full"
      style={{ backgroundColor: `var(--${token}-text)` }}
    />
  )
}

export function Toaster(props: ToasterProps) {
  return (
    <SonnerToaster
      position="bottom-right"
      closeButton
      icons={{
        success: <Dot token="success" />,
        info: <Dot token="info" />,
        warning: <Dot token="warning" />,
        error: <Dot token="error" />,
        loading: (
          <Loader2Icon className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
        ),
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "relative flex w-full max-w-[420px] items-center gap-3 rounded-lg border border-l-[3px] border-border bg-popover py-3 pl-4 pr-10 text-popover-foreground shadow-lg",
          title: "text-sm font-medium leading-snug",
          description: "text-xs text-muted-foreground leading-snug",
          closeButton:
            "absolute right-2 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted",
          actionButton:
            "ml-auto inline-flex shrink-0 items-center px-2 text-xs font-medium text-primary hover:underline",
          cancelButton:
            "inline-flex shrink-0 items-center px-2 text-xs font-medium text-muted-foreground hover:underline",
          success: "border-l-[var(--success-text)]",
          info: "border-l-[var(--info-text)]",
          warning: "border-l-[var(--warning-text)]",
          error: "border-l-[var(--error-text)]",
        },
      }}
      {...props}
    />
  )
}
