import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"
import { Provider } from "jotai"

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: ({ context, location }) => {
    if (!context.auth) {
      throw redirect({
        to: "/sign-in",
        search: { returnTo: location.href },
      })
    }
    return { auth: context.auth }
  },
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <Provider>
      <Outlet />
    </Provider>
  )
}
