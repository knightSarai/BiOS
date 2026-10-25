import { TRPCError, type TRPC_ERROR_CODE_KEY } from "@trpc/server"
import { isAPIError } from "@knight-os/auth/utils"
import { DomainError, GENERIC_ERROR_MESSAGE } from "#core/errors"

const CODE_BY_STATUS: Record<number, TRPC_ERROR_CODE_KEY> = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  422: "UNPROCESSABLE_CONTENT",
  429: "TOO_MANY_REQUESTS",
}

export const translateError = (error: TRPCError): TRPCError => {
  const { cause } = error

  if (cause instanceof DomainError) {
    const code = CODE_BY_STATUS[cause.httpStatus]

    if (code) {
      return new TRPCError({
        code,
        message: cause.message,
        cause,
      })
    }
  }

  if (isAPIError(cause)) {
    const code =
      CODE_BY_STATUS[cause.statusCode] ??
      (cause.statusCode < 500 ? "BAD_REQUEST" : "INTERNAL_SERVER_ERROR")

    return new TRPCError({
      code,
      message:
        code === "INTERNAL_SERVER_ERROR"
          ? GENERIC_ERROR_MESSAGE
          : cause.message,
      cause,
    })
  }

  if (error.code === "INTERNAL_SERVER_ERROR") {
    return new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: GENERIC_ERROR_MESSAGE,
      cause: cause ?? error,
    })
  }

  return error
}
