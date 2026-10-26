import type { ActivityStatus } from "@/activities/status"

type ActivityChipSummary = {
  key: string
  title: string
  status: ActivityStatus
}

type ActivityDraft = {
  activityId: string
  title: string
  status: ActivityStatus
  blockId: string | null
}

type ActivityBridge = {
  observe: (
    activityId: string,
    onChange: (summary: ActivityChipSummary | null | undefined) => void
  ) => () => void
  toggleDone: (activityId: string) => void
  open: (activityId: string) => void
  create: (drafts: ActivityDraft[]) => void
  discard: (activityIds: string[]) => void
  restore: (activityIds: string[]) => void
}

export type { ActivityBridge, ActivityChipSummary, ActivityDraft }
