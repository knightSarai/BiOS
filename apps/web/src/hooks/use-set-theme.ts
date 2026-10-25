import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "@tanstack/react-router"
import { toast } from "sonner"
import { useTRPC } from "@/trpc/react"

export function useSetTheme() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const router = useRouter()

  return useMutation(
    trpc.settings.user.update.mutationOptions({
      onSuccess: async (_data, preferences) => {
        queryClient.setQueryData(
          trpc.settings.user.get.queryKey(),
          preferences
        )
        await router.invalidate()
      },
      onError: () => toast.error("Couldn't save your theme. Please try again."),
    })
  )
}
