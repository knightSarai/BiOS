import { queryOptions } from "@tanstack/react-query"
import { getLocalDb } from "./db"
import { DocumentsRepository } from "./documents"

const documentsRepository = (workspaceId: string) =>
  new DocumentsRepository(getLocalDb(), { workspaceId })

const documentKeys = {
  all: (workspaceId: string) => ["local-db", workspaceId, "documents"] as const,
  list: (workspaceId: string) =>
    [...documentKeys.all(workspaceId), "list"] as const,
  detail: (workspaceId: string, id: string) =>
    [...documentKeys.all(workspaceId), "detail", id] as const,
}

// Local reads and writes never wait for the network, so they keep working offline.
const documentListQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: documentKeys.list(workspaceId),
    queryFn: () => documentsRepository(workspaceId).list(),
    networkMode: "always",
    staleTime: 0,
  })

const documentQuery = (workspaceId: string, id: string) =>
  queryOptions({
    queryKey: documentKeys.detail(workspaceId, id),
    queryFn: () => documentsRepository(workspaceId).byId(id),
    networkMode: "always",
    structuralSharing: false,
    staleTime: Infinity,
  })

export { documentKeys, documentListQuery, documentQuery, documentsRepository }
