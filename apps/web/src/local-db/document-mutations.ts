import { useMutation, useQueryClient } from "@tanstack/react-query"
import { documentsRepository } from "./document-queries"

const useSyncDocumentTitle = (workspaceId: string, id: string) => {
  const queryClient = useQueryClient()

  return useMutation({
    networkMode: "always",
    mutationFn: (title: string) =>
      documentsRepository(workspaceId).syncTitle(id, title),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["local-db", workspaceId] }),
  })
}

export { useSyncDocumentTitle }
