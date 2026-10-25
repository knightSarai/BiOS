import { cn } from "@/lib/utils"

function NotFoundRoot({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-4 text-center",
        className
      )}
    >
      {children}
    </div>
  )
}

function NotFoundTitle({ children }: { children: React.ReactNode }) {
  return <h1 className="text-2xl font-semibold tracking-tight">{children}</h1>
}

function NotFoundDescription({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>
}

function NotFoundActions({ children }: { children: React.ReactNode }) {
  return <div className="mt-2 flex items-center gap-2">{children}</div>
}

export const NotFound = Object.assign(NotFoundRoot, {
  Title: NotFoundTitle,
  Description: NotFoundDescription,
  Actions: NotFoundActions,
})
