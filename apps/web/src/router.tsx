import { createRouter as createTanStackRouter } from "@tanstack/react-router"
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query"
import { THEME } from "@knight-os/server/core"
import { routeTree } from "./routeTree.gen"
import { getContext, Provider } from "./trpc/client"
import { registerRouter } from "./lib/app-router"
import { RouteError } from "./components/common/RouteError"

export function getRouter() {
  const context = getContext()

  const router = createTanStackRouter({
    routeTree,
    context: {
      ...context,
      auth: null,
      resolvedTheme: THEME.system,
    },
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: RouteError,
    Wrap: ({ children }) => <Provider>{children}</Provider>,
  })

  setupRouterSsrQueryIntegration({ router, queryClient: context.queryClient })

  registerRouter(router)

  return router
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
