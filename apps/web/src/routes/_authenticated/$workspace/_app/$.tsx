import { createFileRoute } from "@tanstack/react-router"
import { NotFound } from "@/components/common/NotFound"

export const Route = createFileRoute("/_authenticated/$workspace/_app/$")({
  component: NotFoundPage,
})

function NotFoundPage() {
  return (
    <NotFound className="flex-1 py-20">
      <NotFound.Title>404</NotFound.Title>
      <NotFound.Description>Page not found</NotFound.Description>
    </NotFound>
  )
}
