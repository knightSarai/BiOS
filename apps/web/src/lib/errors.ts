import { TRPCClientError } from "@trpc/client"
import { GENERIC_ERROR_MESSAGE } from "@knight-os/server/core"
import type { AppRouter } from "@knight-os/server/trpc"

export type TRPCErrorCode = NonNullable<
  TRPCClientError<AppRouter>["data"]
>["code"]

export const isTRPCClientError = (
  error: unknown
): error is TRPCClientError<AppRouter> => error instanceof TRPCClientError

export const isUnauthorizedError = (error: unknown) =>
  isTRPCClientError(error) && error.data?.code === "UNAUTHORIZED"

export const getUserFacingErrorMessage = (error: unknown) => {
  if (isTRPCClientError(error)) {
    const status = error.data?.httpStatus
    if (status && status >= 400 && status < 500) return error.message
  }
  return GENERIC_ERROR_MESSAGE
}
