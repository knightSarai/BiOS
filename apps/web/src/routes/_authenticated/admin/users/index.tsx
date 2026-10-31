import { createFileRoute } from "@tanstack/react-router"
import UsersList from "./-components/UsersList"

export const Route = createFileRoute("/_authenticated/admin/users/")({
  component: UsersList,
})
