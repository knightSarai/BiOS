import { GENERIC_ERROR_MESSAGE } from "@knight-os/server/core"
import { Button } from "@/components/ui/button"
import { useRouter } from "@tanstack/react-router"
import { isTRPCClientError, type TRPCErrorCode } from "@/lib/errors"

const codeOf = (error: unknown): TRPCErrorCode | undefined =>
  isTRPCClientError(error) ? error.data?.code : undefined

export function RouteError({
  error,
  children,
}: {
  error?: unknown
  children?: React.ReactNode
}) {
  const router = useRouter()
  const message = GENERIC_ERROR_MESSAGE
  const code = codeOf(error)

  if (children && code === "NOT_FOUND") return <>{children}</>

  if (code === "FORBIDDEN") {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="space-y-1">
          <p className="text-sm font-medium">You don&apos;t have access</p>
          <p className="max-w-md text-sm text-muted-foreground">
            You don&apos;t have permission to view this page. Contact an
            administrator if you think this is a mistake.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="space-y-1">
        <p className="text-sm font-medium">Something went wrong</p>
        <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      </div>
      <Button variant="outline" size="sm" onClick={() => router.invalidate()}>
        Try again
      </Button>
    </div>
  )
}
