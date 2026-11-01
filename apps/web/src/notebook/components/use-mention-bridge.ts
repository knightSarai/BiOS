import { useMemo } from "react"
import {
  QueryObserver,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query"
import { useRouter } from "@tanstack/react-router"
import { formatActivityTimestamp, now, parseUtc } from "@knight-os/server/core"
import type { MentionBridge, MentionCandidate } from "@/editor/mention-bridge"
import { notebookTreeQuery, ownersQuery } from "@/local-db/notebook-queries"
import { indexFolders, pathTo } from "../tree"

const RESULT_LIMIT = 8

type MentionWorkspace = { id: string; slug: string; timezone: string }

const createMentionBridge = (
  queryClient: QueryClient,
  workspace: MentionWorkspace,
  open: (documentId: string) => void
): MentionBridge => {
  const tree = () =>
    queryClient.getQueryData(notebookTreeQuery(workspace.id).queryKey)
  const owners = () =>
    queryClient.getQueryData(ownersQuery(workspace.id).queryKey) ?? []

  const pathOf = (folderId: string) => {
    const data = tree()
    if (!data) return ""
    return pathTo(folderId, indexFolders(data.folders))
      .map((folder) => folder.name)
      .join(" / ")
  }

  return {
    search: (query) => {
      const needle = query.trim().toLowerCase()
      const documents: MentionCandidate[] = (tree()?.documents ?? [])
        .filter((row) =>
          (row.title || "untitled").toLowerCase().includes(needle)
        )
        .slice(0, RESULT_LIMIT)
        .map((row) => ({
          kind: "document",
          id: row.id,
          title: row.title,
          icon: row.icon,
          journal: row.journal !== null,
          path: pathOf(row.folderId),
        }))
      const activities: MentionCandidate[] = owners()
        .flatMap((owner) =>
          owner.kind === "activity" &&
          `${owner.activityKey} ${owner.title}`.toLowerCase().includes(needle)
            ? [
                {
                  kind: "activity" as const,
                  id: owner.id,
                  key: owner.activityKey,
                  title: owner.title,
                  status: owner.status,
                },
              ]
            : []
        )
        .slice(0, RESULT_LIMIT)
      return [...documents, ...activities].slice(0, RESULT_LIMIT)
    },
    observe: (documentId, onChange) => {
      const observer = new QueryObserver(
        queryClient,
        notebookTreeQuery(workspace.id)
      )
      const emit = () => {
        const data = observer.getCurrentResult().data
        if (!data) return onChange(undefined)
        const row = data.documents.find(
          (document) => document.id === documentId
        )
        onChange(
          row
            ? {
                title: row.title,
                icon: row.icon,
                journal: row.journal !== null,
              }
            : null
        )
      }
      const unsubscribe = observer.subscribe(emit)
      emit()
      return unsubscribe
    },
    preview: (documentId) => {
      const row = tree()?.documents.find(
        (document) => document.id === documentId
      )
      if (!row) return null
      return {
        title: row.title,
        icon: row.icon,
        journal: row.journal !== null,
        path: pathOf(row.folderId),
        excerpt: row.excerpt,
        edited: formatActivityTimestamp(
          row.updatedAt,
          workspace.timezone,
          parseUtc(now())
        ),
      }
    },
    open,
  }
}

const useMentionBridge = (workspace: MentionWorkspace) => {
  const queryClient = useQueryClient()
  const router = useRouter()
  const { id, slug, timezone } = workspace
  useQuery(notebookTreeQuery(id))
  useQuery(ownersQuery(id))

  // The editor mounts once per bridge, so a new bridge each render would remount it.
  return useMemo(
    () =>
      createMentionBridge(queryClient, { id, slug, timezone }, (documentId) => {
        void router.navigate({
          to: "/$workspace/documents/$documentId",
          params: { workspace: slug, documentId },
        })
      }),
    [queryClient, router, id, slug, timezone]
  )
}

export { useMentionBridge }
