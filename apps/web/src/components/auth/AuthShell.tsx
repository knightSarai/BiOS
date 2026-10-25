import { cn } from "@/lib/utils"
import { Brand } from "@/components/common/Brand"

type AuthShellProps = {
  children?: React.ReactNode
  title?: React.ReactNode
  description?: React.ReactNode
  className?: string
}

export function AuthShell({
  children,
  title,
  description,
  className,
}: AuthShellProps) {
  return (
    <div className="fixed top-0 left-0 grid h-dvh w-full place-items-center overflow-y-auto bg-sidebar">
      <div className="w-full max-w-104 px-4">
        <div
          className={cn(
            "rounded-sm bg-background px-8 pt-8 pb-10 shadow-lg ring-1 ring-foreground/5",
            className
          )}
        >
          <div className="mb-8 flex flex-col items-center">
            <Brand
              className={cn("text-lg", (title || description) && "mb-4")}
            />
            {title ? (
              <h1 className="text-base font-medium text-foreground">{title}</h1>
            ) : null}
            {description ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}
