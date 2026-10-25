import type { AppRouter } from "@knight-os/server/trpc"
import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query"
import { createTRPCClient, httpBatchStreamLink } from "@trpc/client"
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query"
import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import superjson from "superjson"
import { toast } from "sonner"
import {
  getUserFacingErrorMessage,
  isTRPCClientError,
  isUnauthorizedError,
} from "@/lib/errors"
import { getAppRouter } from "@/lib/app-router"
import { TRPCProvider } from "./react"

const redirectToSignIn = (error: unknown) => {
  if (!isUnauthorizedError(error)) return false
  getAppRouter()?.navigate({ to: "/sign-in", reloadDocument: true })
  return true
}

function getBaseUrl() {
  if (typeof window !== "undefined") return ""
  const port = process.env.PORT ?? process.env.VITE_DEV_SERVER_PORT ?? "3000"
  return `http://localhost:${port}`
}

const getHeaders = createServerFn({ method: "GET" }).handler(async () =>
  Object.fromEntries(getRequestHeaders())
)

function makeQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (typeof window === "undefined") return
        if (redirectToSignIn(error)) return
        if (query.state.data !== undefined) {
          toast.error(getUserFacingErrorMessage(error))
        }
      },
    }),
    mutationCache: new MutationCache({
      onError: (error) => {
        if (typeof window === "undefined") return
        if (!isTRPCClientError(error)) return
        if (redirectToSignIn(error)) return
        toast.error(getUserFacingErrorMessage(error))
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
      },
      dehydrate: { serializeData: superjson.serialize },
      hydrate: { deserializeData: superjson.deserialize },
    },
  })
}

let browserQueryClient: QueryClient | undefined

export function getQueryClient() {
  if (typeof window === "undefined") return makeQueryClient()
  if (!browserQueryClient) browserQueryClient = makeQueryClient()
  return browserQueryClient
}

export const trpcClient = createTRPCClient<AppRouter>({
  links: [
    httpBatchStreamLink({
      transformer: superjson,
      url: `${getBaseUrl()}/api/trpc`,
      async headers() {
        if (typeof window !== "undefined") return {}
        return await getHeaders()
      },
    }),
  ],
})

const trpcOptions = createTRPCOptionsProxy<AppRouter>({
  client: trpcClient,
  queryClient: getQueryClient(),
})

export function getContext() {
  return {
    queryClient: getQueryClient(),
    trpc: trpcOptions,
  }
}

export function Provider({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={getQueryClient()}>
      <TRPCProvider trpcClient={trpcClient} queryClient={getQueryClient()}>
        {children}
      </TRPCProvider>
    </QueryClientProvider>
  )
}
