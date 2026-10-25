import { describe, expect, it } from "vitest"
import { TRPCClientError } from "@trpc/client"
import { GENERIC_ERROR_MESSAGE } from "@knight-os/server/core"
import { getUserFacingErrorMessage, isUnauthorizedError } from "./errors"

const clientError = (message: string, code: string, httpStatus: number) =>
  new TRPCClientError(message, {
    result: {
      error: { code: -32000, message, data: { code, httpStatus } },
    },
  })

describe("getUserFacingErrorMessage", () => {
  it("returns the server message for 4xx errors", () => {
    const error = clientError('Name "Acme" is already taken', "CONFLICT", 409)

    expect(getUserFacingErrorMessage(error)).toBe(
      'Name "Acme" is already taken',
    )
  })

  it("returns the generic message for 5xx errors", () => {
    const error = clientError(
      "duplicate key value violates unique constraint",
      "INTERNAL_SERVER_ERROR",
      500,
    )

    expect(getUserFacingErrorMessage(error)).toBe(GENERIC_ERROR_MESSAGE)
  })

  it("returns the generic message for non-tRPC errors", () => {
    expect(getUserFacingErrorMessage(new TypeError("x is not a function"))).toBe(
      GENERIC_ERROR_MESSAGE,
    )
  })

  it("returns the generic message when the error carries no data", () => {
    const error = new TRPCClientError("Unable to transform response")

    expect(getUserFacingErrorMessage(error)).toBe(GENERIC_ERROR_MESSAGE)
  })
})

describe("isUnauthorizedError", () => {
  it("is true for UNAUTHORIZED tRPC errors", () => {
    const error = clientError("UNAUTHORIZED", "UNAUTHORIZED", 401)

    expect(isUnauthorizedError(error)).toBe(true)
  })

  it("is false for other tRPC errors", () => {
    const error = clientError("Supplier not found", "NOT_FOUND", 404)

    expect(isUnauthorizedError(error)).toBe(false)
  })

  it("is false for non-tRPC errors", () => {
    expect(isUnauthorizedError(new Error("UNAUTHORIZED"))).toBe(false)
  })
})
