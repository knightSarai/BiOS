import { DexieYProvider, type YUpdateRow } from "y-dexie"
import { now, parseUtc } from "@knight-os/server/core"
import { seedDocumentWithTitle } from "@/editor/document-content"
import { activityKey } from "@/activities/areas"
import { isOpenStatus, type ActivityStatus } from "@/activities/status"
import type { ActivityOrigin, ActivityRow, LocalDb } from "./db"

type ActivitiesContext = {
  workspaceId: string
}

type DeletedActivity = {
  row: Omit<ActivityRow, "content">
  contentUpdates: Omit<YUpdateRow, "i">[]
}

type NewActivity = {
  id: string
  areaId: string
  title: string
  status: ActivityStatus
  origin: ActivityOrigin | null
}

const statusChange = (row: ActivityRow, status: ActivityStatus) => {
  const timestamp = parseUtc(now())
  return {
    status,
    reopenStatus: isOpenStatus(row.status) ? row.status : row.reopenStatus,
    completedAt: status === "done" ? timestamp : null,
    updatedAt: timestamp,
  }
}

class ActivitiesRepository {
  constructor(
    private readonly db: LocalDb,
    private readonly ctx: ActivitiesContext
  ) {}

  private scoped(id: string) {
    return this.db.activities
      .where("id")
      .equals(id)
      .filter((row) => row.workspaceId === this.ctx.workspaceId)
  }

  list(filter: { areaId?: string } = {}) {
    return this.db.activities
      .where("[workspaceId+updatedAt]")
      .between([this.ctx.workspaceId, ""], [this.ctx.workspaceId, "￿"])
      .reverse()
      .filter((row) => !filter.areaId || row.areaId === filter.areaId)
      .toArray()
  }

  async byId(id: string) {
    const row = await this.db.activities.get(id)
    return row?.workspaceId === this.ctx.workspaceId ? row : null
  }

  async summary(id: string) {
    const row = await this.byId(id)
    if (!row) return null
    const area = await this.db.areas.get(row.areaId)
    return {
      id: row.id,
      key: activityKey(area?.key ?? "?", row.number),
      title: row.title,
      status: row.status,
    }
  }

  async openCountsByArea() {
    const counts = new Map<string, number>()
    await this.db.activities
      .where("workspaceId")
      .equals(this.ctx.workspaceId)
      .each((row) => {
        if (isOpenStatus(row.status)) {
          counts.set(row.areaId, (counts.get(row.areaId) ?? 0) + 1)
        }
      })
    return counts
  }

  async createMany(activities: NewActivity[]) {
    const created = await this.insertMany(activities)
    await this.seedContents(activities)
    return created
  }

  async seedContents(activities: { id: string; title: string }[]) {
    for (const activity of activities) {
      await this.seedContent(activity.id, activity.title)
    }
  }

  async ensureContent(id: string) {
    const row = await this.byId(id)
    if (row) await this.seedContent(row.id, row.title)
  }

  private async seedContent(id: string, title: string) {
    const row = await this.byId(id)
    if (!row) return
    const provider = DexieYProvider.load(row.content)
    try {
      await provider.whenLoaded
      seedDocumentWithTitle(row.content, title)
      await this.contentWritesSettled()
    } finally {
      DexieYProvider.release(row.content)
    }
  }

  private contentUpdatesTable() {
    const name = this.db.activities.schema.yProps?.find(
      (yProp) => yProp.prop === "content"
    )?.updatesTable
    if (!name) throw new Error("Activities have no content updates table.")
    return this.db.table<YUpdateRow, number, Omit<YUpdateRow, "i">>(name)
  }

  // IndexedDB runs transactions on one store in order, so this read only
  // finishes after the seed update y-dexie just queued has been written.
  private async contentWritesSettled() {
    await this.contentUpdatesTable().count()
  }

  delete(id: string) {
    const updates = this.contentUpdatesTable()
    return this.db.transaction(
      "rw",
      this.db.activities,
      updates,
      async (): Promise<DeletedActivity | null> => {
        const row = await this.byId(id)
        if (!row) return null
        const contentUpdates = await updates.where("k").equals(id).toArray()
        await updates.where("k").equals(id).delete()
        await this.db.activities.delete(id)
        return {
          row: {
            id: row.id,
            workspaceId: row.workspaceId,
            areaId: row.areaId,
            number: row.number,
            title: row.title,
            status: row.status,
            reopenStatus: row.reopenStatus,
            origin: row.origin,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            completedAt: row.completedAt,
          },
          contentUpdates: contentUpdates.map(({ k, u, f }) => ({ k, u, f })),
        }
      }
    )
  }

  async restore(snapshot: DeletedActivity) {
    if (snapshot.row.workspaceId !== this.ctx.workspaceId) return false
    const updates = this.contentUpdatesTable()
    const restored = await this.db.transaction(
      "rw",
      this.db.activities,
      updates,
      async () => {
        if (await this.byId(snapshot.row.id)) return false
        await updates.where("k").equals(snapshot.row.id).delete()
        await this.db.activities.add(snapshot.row)
        await updates.bulkAdd(snapshot.contentUpdates)
        return true
      }
    )
    if (restored && snapshot.contentUpdates.length === 0) {
      await this.seedContent(snapshot.row.id, snapshot.row.title)
    }
    return restored
  }

  insertMany(activities: NewActivity[]) {
    return this.db.transaction(
      "rw",
      this.db.areas,
      this.db.activities,
      async () => {
        const timestamp = parseUtc(now())
        const created: { id: string; key: string }[] = []
        for (const activity of activities) {
          const area = await this.db.areas.get(activity.areaId)
          if (area?.workspaceId !== this.ctx.workspaceId) {
            throw new Error("The area for this activity does not exist.")
          }
          await this.db.areas.update(area.id, {
            nextNumber: area.nextNumber + 1,
          })
          await this.db.activities.add({
            id: activity.id,
            workspaceId: this.ctx.workspaceId,
            areaId: area.id,
            number: area.nextNumber,
            title: activity.title,
            status: activity.status,
            reopenStatus: isOpenStatus(activity.status)
              ? activity.status
              : "todo",
            origin: activity.origin,
            createdAt: timestamp,
            updatedAt: timestamp,
            completedAt: activity.status === "done" ? timestamp : null,
          })
          created.push({
            id: activity.id,
            key: activityKey(area.key, area.nextNumber),
          })
        }
        return created
      }
    )
  }

  async setStatus(id: string, status: ActivityStatus) {
    await this.scoped(id).modify((row) => {
      Object.assign(row, statusChange(row, status))
    })
  }

  async toggleDone(id: string) {
    await this.scoped(id).modify((row) => {
      const next = row.status === "done" ? row.reopenStatus : "done"
      Object.assign(row, statusChange(row, next))
    })
  }

  moveToArea(id: string, areaId: string) {
    return this.db.transaction(
      "rw",
      this.db.areas,
      this.db.activities,
      async () => {
        const row = await this.byId(id)
        const area = await this.db.areas.get(areaId)
        if (!row || area?.workspaceId !== this.ctx.workspaceId) return
        if (row.areaId === areaId) return
        await this.db.areas.update(area.id, { nextNumber: area.nextNumber + 1 })
        await this.db.activities.update(id, {
          areaId,
          number: area.nextNumber,
          updatedAt: parseUtc(now()),
        })
      }
    )
  }

  async syncTitle(id: string, title: string) {
    await this.scoped(id)
      .filter((row) => row.title !== title && title !== "")
      .modify({ title, updatedAt: parseUtc(now()) })
  }

  async saveTitle(id: string, title: string) {
    await this.scoped(id).modify({ title, updatedAt: parseUtc(now()) })
  }
}

export { ActivitiesRepository }
export type { ActivitiesContext, DeletedActivity, NewActivity }
