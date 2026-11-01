import type { ActivityStatus } from "@/activities/status"

type MentionCandidate =
  | {
      kind: "document"
      id: string
      title: string
      icon: string | null
      path: string
    }
  | {
      kind: "activity"
      id: string
      key: string
      title: string
      status: ActivityStatus
    }

type MentionSummary = {
  title: string
  icon: string | null
}

type MentionPreview = MentionSummary & {
  path: string
  excerpt: string
  edited: string
}

type MentionBridge = {
  search: (query: string) => MentionCandidate[]
  observe: (
    documentId: string,
    onChange: (summary: MentionSummary | null | undefined) => void
  ) => () => void
  preview: (documentId: string) => MentionPreview | null
  open: (documentId: string) => void
}

export type { MentionBridge, MentionCandidate, MentionPreview, MentionSummary }
