import { appRouter, createTRPCContext } from "@knight-os/server/trpc"
import { createFileRoute } from "@tanstack/react-router"
import { fetchRequestHandler } from "@trpc/server/adapters/fetch"
import { userSessionMiddleware } from "../../middlewares"

const handle = ({
  request,
  context,
}: {
  request: Request
  context: Omit<Parameters<typeof createTRPCContext>[0], "headers">
}) =>
  fetchRequestHandler({
    req: request,
    router: appRouter,
    endpoint: "/api/trpc",
    createContext: () =>
      createTRPCContext({ headers: request.headers, ...context }),
  })

export const Route = createFileRoute("/api/trpc/$")({
  server: {
    middleware: [userSessionMiddleware],
    handlers: {
      GET: handle,
      POST: handle,
    },
  },
})
