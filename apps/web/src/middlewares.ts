import { getSession } from "@knight-os/auth/services"
import { createMiddleware } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"

export const userSessionMiddleware = createMiddleware().server(
  async ({ context, next }) => {
    const authContext = await getSession(getRequestHeaders())

    return next({
      context: {
        ...(context ?? {}),
        user: authContext?.user ?? null,
        session: authContext?.session ?? null,
      },
    })
  }
)
