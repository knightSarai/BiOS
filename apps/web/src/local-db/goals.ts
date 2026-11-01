import { now, parseUtc } from "@knight-os/server/core"
import type { GoalStatus } from "@/goals/status"
import type { GoalRow, LocalDb } from "./db"
import {
  contentUpdatesTable,
  readContentUpdates,
  seedContentWithTitle,
  type ContentUpdate,
} from "./y-content"

type GoalsContext = {
  workspaceId: string
}

type DeletedGoal = {
  row: Omit<GoalRow, "content">
  contentUpdates: ContentUpdate[]
  activityIds: string[]
}

class GoalsRepository {
  constructor(
    private readonly db: LocalDb,
    private readonly ctx: GoalsContext
  ) {}

  private scoped(id: string) {
    return this.db.goals
      .where("id")
      .equals(id)
      .filter((row) => row.workspaceId === this.ctx.workspaceId)
  }

  list() {
    return this.db.goals
      .where("[workspaceId+updatedAt]")
      .between([this.ctx.workspaceId, ""], [this.ctx.workspaceId, "￿"])
      .reverse()
      .toArray()
  }

  async byId(id: string) {
    const row = await this.db.goals.get(id)
    return row?.workspaceId === this.ctx.workspaceId ? row : null
  }

  async create(title: string) {
    const timestamp = parseUtc(now())
    const id = crypto.randomUUID()
    await this.db.goals.add({
      id,
      workspaceId: this.ctx.workspaceId,
      title: title.trim(),
      status: "one-day",
      targetMonth: null,
      icon: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    await this.ensureContent(id)
    return id
  }

  async ensureContent(id: string) {
    const row = await this.byId(id)
    if (row)
      await seedContentWithTitle(this.db, "goals", row.content, row.title)
  }

  async syncTitle(id: string, title: string) {
    await this.scoped(id)
      .filter((row) => row.title !== title && title !== "")
      .modify({ title, updatedAt: parseUtc(now()) })
  }

  async saveTitle(id: string, title: string) {
    await this.scoped(id).modify({ title, updatedAt: parseUtc(now()) })
  }

  async setStatus(id: string, status: GoalStatus) {
    await this.scoped(id).modify({ status, updatedAt: parseUtc(now()) })
  }

  async setTargetMonth(id: string, targetMonth: string | null) {
    await this.scoped(id).modify({ targetMonth, updatedAt: parseUtc(now()) })
  }

  async setIcon(id: string, icon: string | null) {
    await this.scoped(id).modify({ icon, updatedAt: parseUtc(now()) })
  }

  delete(id: string) {
    const updates = contentUpdatesTable(this.db, "goals")
    return this.db.transaction(
      "rw",
      [this.db.goals, this.db.activities, updates],
      async (): Promise<DeletedGoal | null> => {
        const row = await this.byId(id)
        if (!row) return null
        const contentUpdates = await readContentUpdates(this.db, "goals", id)
        const activityIds = await this.db.activities
          .where("goalId")
          .equals(id)
          .primaryKeys()
        await this.db.activities
          .where("goalId")
          .equals(id)
          .modify({ goalId: null })
        await updates.where("k").equals(id).delete()
        await this.db.goals.delete(id)
        return {
          row: {
            id: row.id,
            workspaceId: row.workspaceId,
            title: row.title,
            status: row.status,
            targetMonth: row.targetMonth,
            icon: row.icon,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          },
          contentUpdates,
          activityIds,
        }
      }
    )
  }

  async restore(snapshot: DeletedGoal) {
    if (snapshot.row.workspaceId !== this.ctx.workspaceId) return false
    const updates = contentUpdatesTable(this.db, "goals")
    return this.db.transaction(
      "rw",
      [this.db.goals, this.db.activities, updates],
      async () => {
        if (await this.byId(snapshot.row.id)) return false
        await this.db.goals.add(snapshot.row)
        await updates.bulkAdd(snapshot.contentUpdates)
        await this.db.activities
          .where("id")
          .anyOf(snapshot.activityIds)
          .modify({ goalId: snapshot.row.id })
        return true
      }
    )
  }
}

export { GoalsRepository }
export type { DeletedGoal, GoalsContext }
