import { initTRPC } from "@trpc/server"
import superjson from "superjson"
import type { TRPCContext } from "./context"
import { translateError } from "./error-translator"

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape }) {
    const { stack: _stack, ...data } = shape.data
    return { ...shape, data }
  },
})

const loggingMiddleware = t.middleware(async ({ ctx, next, path, type }) => {
  const start = performance.now()

  const result = await next()
  const durationMs = Math.round(performance.now() - start)

  if (result.ok) {
    ctx.logger.info({ path, type, ok: true, durationMs }, "trpc")
  } else {
    const code = result.error.code
    const level = code === "INTERNAL_SERVER_ERROR" ? "error" : "warn"
    ctx.logger[level](
      { path, type, ok: false, durationMs, code, err: result.error },
      "trpc",
    )
  }

  return result
})

const errorTranslator = t.middleware(async ({ next }) => {
  const result = await next()
  if (result.ok) return result
  throw translateError(result.error)
})

export const createTRPCRouter = t.router
export const createCallerFactory = t.createCallerFactory
export const baseProcedure = t.procedure
  .use(loggingMiddleware)
  .use(errorTranslator)
export const middleware = t.middleware
