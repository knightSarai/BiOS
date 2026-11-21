import {
  now,
  parseUtc,
  secondsBetween,
  type UtcDatetime,
} from "@knight-os/server/core"
import { MAX_TIMER_SECONDS } from "@/activities/timer"
import type { LocalDb, TimeEntryRow } from "./db"

type LoggedSession = {
  activityId: string
  startedAt: UtcDatetime
  endedAt: UtcDatetime
}

class InvalidLogError extends Error {}

// What's wrong with time typed in, checked before anything is saved; null when it's fine.
const logProblem = (sessions: LoggedSession[], at: UtcDatetime) => {
  for (const session of sessions) {
    const seconds = secondsBetween(session.startedAt, session.endedAt)
    if (seconds <= 0) return "A logged session needs some time."
    if (seconds > MAX_TIMER_SECONDS) {
      return "A logged session can be at most 24 hours."
    }
    if (session.endedAt > at) return "A logged session can't end in the future."
  }
  return null
}

type TimeEntriesContext = {
  workspaceId: string
}

class TimeEntriesRepository {
  constructor(
    private readonly db: LocalDb,
    private readonly ctx: TimeEntriesContext
  ) {}

  private forActivity(activityId: string) {
    return this.db.timeEntries
      .where("[workspaceId+activityId]")
      .equals([this.ctx.workspaceId, activityId])
  }

  async list(activityId: string) {
    const rows = await this.forActivity(activityId).toArray()
    return rows.sort((a, b) => a.startedAt.localeCompare(b.startedAt))
  }

  running() {
    return this.db.timeEntries
      .where("[workspaceId+startedAt]")
      .between([this.ctx.workspaceId, ""], [this.ctx.workspaceId, "￿"])
      .filter((row) => row.endedAt === null)
      .first()
  }

  // Time typed in afterwards, for sessions done without the timer. Several at once (one
  // per sub-activity) are saved together or not at all.
  async log(sessions: LoggedSession[]) {
    const at = parseUtc(now())
    const problem = logProblem(sessions, at)
    if (problem) throw new InvalidLogError(problem)
    return this.db.transaction(
      "rw",
      this.db.activities,
      this.db.timeEntries,
      async () => {
        const rows: TimeEntryRow[] = []
        for (const session of sessions) {
          const activity = await this.db.activities.get(session.activityId)
          if (activity?.workspaceId !== this.ctx.workspaceId) {
            throw new InvalidLogError("That activity doesn't exist.")
          }
          rows.push({
            id: crypto.randomUUID(),
            workspaceId: this.ctx.workspaceId,
            activityId: session.activityId,
            startedAt: session.startedAt,
            endedAt: session.endedAt,
            source: "manual",
            loggedAt: at,
          })
        }
        await this.db.timeEntries.bulkAdd(rows)
        return rows
      }
    )
  }
}

export { InvalidLogError, TimeEntriesRepository, logProblem }
export type { LoggedSession, TimeEntriesContext }
