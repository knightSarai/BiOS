import { now, parseUtc, type UtcDatetime } from "@knight-os/server/core"
import type { LocalDb, TimeEntryRow } from "./db"

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

  // One timer runs at a time, so starting one stops whichever else is running.
  start(activityId: string) {
    return this.db.transaction(
      "rw",
      this.db.activities,
      this.db.timeEntries,
      async () => {
        const activity = await this.db.activities.get(activityId)
        if (activity?.workspaceId !== this.ctx.workspaceId) {
          throw new Error("The activity for this timer does not exist.")
        }
        const running = await this.running()
        if (running?.activityId === activityId) return running
        const timestamp = parseUtc(now())
        if (running) {
          await this.db.timeEntries.update(running.id, { endedAt: timestamp })
        }
        const row: TimeEntryRow = {
          id: crypto.randomUUID(),
          workspaceId: this.ctx.workspaceId,
          activityId,
          startedAt: timestamp,
          endedAt: null,
          endsLap: false,
        }
        await this.db.timeEntries.add(row)
        return row
      }
    )
  }

  async stop(activityId: string, endedAt: UtcDatetime) {
    await this.forActivity(activityId)
      .filter((row) => row.endedAt === null)
      .modify((row) => {
        row.endedAt = endedAt < row.startedAt ? row.startedAt : endedAt
      })
  }

  // A lap ends the running entry and opens the next one at the same moment.
  lap(activityId: string, at: UtcDatetime) {
    return this.db.transaction("rw", this.db.timeEntries, async () => {
      const running = await this.forActivity(activityId)
        .filter((row) => row.endedAt === null)
        .first()
      if (!running || at <= running.startedAt) return null
      await this.db.timeEntries.update(running.id, {
        endedAt: at,
        endsLap: true,
      })
      const next: TimeEntryRow = {
        id: crypto.randomUUID(),
        workspaceId: this.ctx.workspaceId,
        activityId,
        startedAt: at,
        endedAt: null,
        endsLap: false,
      }
      await this.db.timeEntries.add(next)
      return next
    })
  }

  clear(activityId: string) {
    return this.db.transaction("rw", this.db.timeEntries, async () => {
      const rows = await this.forActivity(activityId).toArray()
      await this.forActivity(activityId).delete()
      return rows
    })
  }

  async restore(rows: TimeEntryRow[]) {
    await this.db.timeEntries.bulkPut(
      rows.filter((row) => row.workspaceId === this.ctx.workspaceId)
    )
  }
}

export { TimeEntriesRepository }
export type { TimeEntriesContext }
