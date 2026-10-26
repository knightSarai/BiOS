import { useMutation, useQueryClient } from "@tanstack/react-query"
import { documentKeys, documentsRepository } from "./document-queries"

const useCreateDocument = (workspaceId: string) => {
  const queryClient = useQueryClient()

  return useMutation({
    networkMode: "always",
    mutationFn: () => documentsRepository(workspaceId).create(),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: documentKeys.all(workspaceId),
      }),
  })
}

const useSaveDocumentTitle = (workspaceId: string, id: string) => {
  const queryClient = useQueryClient()

  return useMutation({
    networkMode: "always",
    mutationFn: (title: string) =>
      documentsRepository(workspaceId).saveTitle(id, title),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: documentKeys.all(workspaceId),
      }),
  })
}

const useSyncDocumentTitle = (workspaceId: string, id: string) => {
  const queryClient = useQueryClient()

  return useMutation({
    networkMode: "always",
    mutationFn: (title: string) =>
      documentsRepository(workspaceId).syncTitle(id, title),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: documentKeys.all(workspaceId),
      }),
  })
}

export { useCreateDocument, useSaveDocumentTitle, useSyncDocumentTitle }
