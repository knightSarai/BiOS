import type { AppRouter } from "@knight-os/server/trpc"
import { THEME, type Theme } from "@knight-os/server/core"
import type { AuthContext } from "@knight-os/auth"
import { getSession } from "@knight-os/auth/services"
import { queryOptions, type QueryClient } from "@tanstack/react-query"
import {
  HeadContent,
  Scripts,
  ScriptOnce,
  createRootRouteWithContext,
  type ErrorComponentProps,
  useRouteContext,
} from "@tanstack/react-router"
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools"
import { TanStackDevtools } from "@tanstack/react-devtools"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import type { TRPCOptionsProxy } from "@trpc/tanstack-react-query"
import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { RouteError } from "@/components/common/RouteError"
import appCss from "../styles.css?url"

export type RouterAppContext = {
  queryClient: QueryClient
  trpc: TRPCOptionsProxy<AppRouter>
  auth: AuthContext
  resolvedTheme: Theme
}

const getConfig = createServerFn({ method: "GET" }).handler(async () => ({
  auth: await getSession(getRequestHeaders()),
}))

export const configQueryOptions = queryOptions({
  queryKey: ["config"],
  queryFn: () => getConfig(),
})

export const Route = createRootRouteWithContext<RouterAppContext>()({
  beforeLoad: async ({ context }) => {
    const { auth } = await context.queryClient.ensureQueryData(
      configQueryOptions
    )

    const preferences = auth
      ? await context.queryClient.ensureQueryData(
          context.trpc.settings.user.get.queryOptions()
        )
      : null

    return {
      auth,
      resolvedTheme: preferences?.theme ?? THEME.system,
    }
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Knight OS" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootDocument,
  errorComponent: RootError,
})

function RootError({ error }: ErrorComponentProps) {
  const clientMessage =
    error instanceof Error &&
    "httpStatus" in error &&
    typeof error.httpStatus === "number" &&
    error.httpStatus >= 400 &&
    error.httpStatus < 500
      ? error.message
      : null

  if (!clientMessage) return <RouteError error={error} />

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6 text-center">
      <p className="max-w-md text-sm text-muted-foreground">{clientMessage}</p>
    </div>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useRouteContext({ from: "__root__" })
  const htmlClassName =
    resolvedTheme === THEME.system
      ? typeof window !== "undefined" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : resolvedTheme

  return (
    <html lang="en" className={htmlClassName} suppressHydrationWarning>
      <head>
        <HeadContent />
        {resolvedTheme === THEME.system && (
          <ScriptOnce>
            {`document.documentElement.classList.toggle("dark", window.matchMedia("(prefers-color-scheme: dark)").matches)`}
          </ScriptOnce>
        )}
      </head>
      <body>
        {children}
        <TanStackDevtools
          config={{ position: "bottom-right" }}
          plugins={[
            {
              name: "Tanstack Router",
              render: <TanStackRouterDevtoolsPanel />,
            },
            { name: "Tanstack Query", render: <ReactQueryDevtools /> },
          ]}
        />
        <Scripts />
      </body>
    </html>
  )
}
