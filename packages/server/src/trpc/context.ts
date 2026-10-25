import { randomUUID } from "node:crypto"
import type { AuthSession, AuthUser } from "@knight-os/auth"
import { logger } from "#services"

export const createTRPCContext = (opts: {
  headers: Headers
  session: AuthSession | null
  user: AuthUser | null
  requestId?: string
}) => {
  const requestId = opts.requestId ?? randomUUID()

  return {
    headers: opts.headers,
    user: opts.user,
    session: opts.session,
    requestId,
    logger: logger.child({
      requestId,
      ...(opts.user && { userId: opts.user.id }),
    }),
  }
}

export type TRPCContext = ReturnType<typeof createTRPCContext>
