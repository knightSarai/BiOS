import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"
import { ShieldCheck } from "lucide-react"
import { AppShell } from "@layout/core/AppShell"
import { ThemeToggle } from "@layout/core/ThemeToggle"
import { nav } from "./-nav/data"
import { AdminMenu } from "./-nav/AdminMenu"

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: ({ context }) => {
    if (context.auth?.user.role !== "admin") {
      throw redirect({ to: "/" })
    }
    return { auth: context.auth }
  },
  staticData: { crumb: { label: "Admin", icon: ShieldCheck } },
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <AppShell menu={<AdminMenu />} nav={nav} footer={<ThemeToggle />}>
      <Outlet />
    </AppShell>
  )
}
