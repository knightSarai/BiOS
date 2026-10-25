import type { getRouter } from "@/router"

type AppRouterInstance = ReturnType<typeof getRouter>

let router: AppRouterInstance | null = null

export const registerRouter = (instance: AppRouterInstance) => {
  router = instance
}

export const getAppRouter = () => router
