import { describe, expect, it } from "vitest"
import { TRPCError } from "@trpc/server"
import { fetchRequestHandler } from "@trpc/server/adapters/fetch"
import { APIError } from "@knight-os/auth/utils"
import {
  baseProcedure,
  createCallerFactory,
  createTRPCRouter,
} from "./init"
import { createTRPCContext } from "./context"
import {
  BadRequestError,
  ConflictError,
  DomainError,
  ForbiddenError,
  GENERIC_ERROR_MESSAGE,
  NotFoundError,
  UnauthorizedError,
} from "#core/errors"

class RecordOwnedElsewhereError extends ConflictError {
  constructor() {
    super("Record is owned by another workspace")
  }
}

const router = createTRPCRouter({
  notFound: baseProcedure.query(() => {
    throw new NotFoundError("Workspace not found")
  }),
  forbidden: baseProcedure.query(() => {
    throw new ForbiddenError("Workspace admin access required")
  }),
  conflict: baseProcedure.query(() => {
    throw new ConflictError('Name "Acme" is already taken')
  }),
  conflictSubclass: baseProcedure.query(() => {
    throw new RecordOwnedElsewhereError()
  }),
  badRequest: baseProcedure.query(() => {
    throw new BadRequestError("Invalid cursor")
  }),
  unauthorized: baseProcedure.query(() => {
    throw new UnauthorizedError("Session expired")
  }),
  unmappedDomain: baseProcedure.query(() => {
    throw new DomainError("workspace lookup failed")
  }),
  authApiError: baseProcedure.query(() => {
    throw new APIError("FORBIDDEN", {
      message: "You are not allowed to update this organization",
    })
  }),
  unknown: baseProcedure.query(() => {
    throw new Error("SQLITE_BUSY: database is locked")
  }),
  intentionalTrpc: baseProcedure.query(() => {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Slow down" })
  }),
  internalTrpc: baseProcedure.query(() => {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "UNIQUE constraint failed: workspace_settings.workspace_id",
    })
  }),
})

const createCaller = createCallerFactory(router)
const caller = createCaller(
  createTRPCContext({ headers: new Headers(), session: null, user: null }),
)

describe("error translator middleware", () => {
  it("maps NotFoundError to NOT_FOUND with the domain message", async () => {
    await expect(caller.notFound()).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Workspace not found",
    })
  })

  it("maps ForbiddenError to FORBIDDEN with the domain message", async () => {
    await expect(caller.forbidden()).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Workspace admin access required",
    })
  })

  it("maps ConflictError to CONFLICT with the domain message", async () => {
    await expect(caller.conflict()).rejects.toMatchObject({
      code: "CONFLICT",
      message: 'Name "Acme" is already taken',
    })
  })

  it("maps a ConflictError subclass to CONFLICT with the domain message", async () => {
    await expect(caller.conflictSubclass()).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Record is owned by another workspace",
    })
  })

  it("maps BadRequestError to BAD_REQUEST with the domain message", async () => {
    await expect(caller.badRequest()).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Invalid cursor",
    })
  })

  it("maps UnauthorizedError to UNAUTHORIZED with the domain message", async () => {
    await expect(caller.unauthorized()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "Session expired",
    })
  })

  it("masks domain errors whose status has no transport code", async () => {
    await expect(caller.unmappedDomain()).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: GENERIC_ERROR_MESSAGE,
      cause: { message: "workspace lookup failed" },
    })
  })

  it("maps better-auth APIError to the matching code and keeps its message", async () => {
    await expect(caller.authApiError()).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "You are not allowed to update this organization",
    })
  })

  it("masks unknown errors with a generic message and keeps the original as cause", async () => {
    await expect(caller.unknown()).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: GENERIC_ERROR_MESSAGE,
      cause: { message: "SQLITE_BUSY: database is locked" },
    })
  })

  it("passes deliberately thrown non-5xx TRPCErrors through unchanged", async () => {
    await expect(caller.intentionalTrpc()).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
      message: "Slow down",
    })
  })

  it("masks the message of INTERNAL_SERVER_ERROR TRPCErrors too", async () => {
    await expect(caller.internalTrpc()).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: GENERIC_ERROR_MESSAGE,
    })
  })
})

describe("wire responses", () => {
  const handle = (path: string) =>
    fetchRequestHandler({
      endpoint: "/api/trpc",
      req: new Request(`http://test.local/api/trpc/${path}`),
      router,
      createContext: () =>
        createTRPCContext({ headers: new Headers(), session: null, user: null }),
    })

  it("returns 404 for NOT_FOUND domain errors", async () => {
    const res = await handle("notFound")

    expect(res.status).toBe(404)
  })

  it("returns 409 and the domain message for CONFLICT domain errors", async () => {
    const res = await handle("conflictSubclass")
    const body = await res.text()

    expect(res.status).toBe(409)
    expect(body).toContain("Record is owned by another workspace")
  })

  it("never leaks a stack or internal message in the response body", async () => {
    const res = await handle("unknown")
    const body = await res.text()

    expect(res.status).toBe(500)
    expect(body).not.toContain("stack")
    expect(body).not.toContain("ECONNREFUSED")
    expect(body).toContain(GENERIC_ERROR_MESSAGE)
  })
})
