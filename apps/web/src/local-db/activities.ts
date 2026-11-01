import { isCivilDate, now, parseUtc } from "@knight-os/server/core"
import { activityKey } from "@/activities/areas"
import {
  keepValidValues,
  parseFieldValues,
  setFieldValue,
} from "@/activities/fields"
import { isOpenStatus, type ActivityStatus } from "@/activities/status"
import { compareSortKeys } from "@/notebook/sort-keys"
import type { ActivityOrigin, ActivityRow, LocalDb } from "./db"
import {
  contentUpdatesTable,
  seedContentWithTitle,
  type ContentUpdate,
} from "./y-content"

type ActivitiesContext = {
  workspaceId: string
}

type DeletedActivity = {
  row: Omit<ActivityRow, "content">
  contentUpdates: ContentUpdate[]
}

type NewActivity = {
  id: string
  areaId: string
  goalId?: string | null
  typeId?: string | null
  fields?: Record<string, unknown>
  dueDate?: string | null
  title: string
  status: ActivityStatus
  origin: ActivityOrigin | null
}

const requireDueDate = (dueDate: string | null) => {
  if (dueDate !== null && !isCivilDate(dueDate)) {
    throw new Error("A due date is a YYYY-MM-DD date.")
  }
  return dueDate
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
    await seedContentWithTitle(this.db, "activities", row.content, title)
  }

  private contentUpdatesTable() {
    return contentUpdatesTable(this.db, "activities")
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
            goalId: row.goalId,
            typeId: row.typeId,
            fields: row.fields,
            dueDate: row.dueDate,
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
      [
        this.db.activities,
        this.db.activityTypes,
        this.db.activityTypeFields,
        updates,
      ],
      async () => {
        if (await this.byId(snapshot.row.id)) return false
        await updates.where("k").equals(snapshot.row.id).delete()
        const fields = await this.typeFields(snapshot.row.typeId)
        await this.db.activities.add({
          ...snapshot.row,
          fields: keepValidValues(fields, snapshot.row.fields),
        })
        await updates.bulkAdd(snapshot.contentUpdates)
        return true
      }
    )
    if (restored && snapshot.contentUpdates.length === 0) {
      await this.seedContent(snapshot.row.id, snapshot.row.title)
    }
    return restored
  }

  private async typeFields(typeId: string | null) {
    if (typeId === null) return []
    const type = await this.db.activityTypes.get(typeId)
    if (type?.workspaceId !== this.ctx.workspaceId) {
      throw new Error("The type for this activity does not exist.")
    }
    const rows = await this.db.activityTypeFields
      .where("[workspaceId+typeId]")
      .equals([this.ctx.workspaceId, typeId])
      .toArray()
    return rows.sort((a, b) => compareSortKeys(a.sortKey, b.sortKey))
  }

  insertMany(activities: NewActivity[]) {
    return this.db.transaction(
      "rw",
      [
        this.db.areas,
        this.db.activities,
        this.db.activityTypes,
        this.db.activityTypeFields,
      ],
      async () => {
        const timestamp = parseUtc(now())
        const created: { id: string; key: string }[] = []
        for (const activity of activities) {
          const area = await this.db.areas.get(activity.areaId)
          if (area?.workspaceId !== this.ctx.workspaceId) {
            throw new Error("The area for this activity does not exist.")
          }
          const typeId = activity.typeId ?? null
          const fields = parseFieldValues(
            await this.typeFields(typeId),
            activity.fields ?? {}
          )
          await this.db.areas.update(area.id, {
            nextNumber: area.nextNumber + 1,
          })
          await this.db.activities.add({
            id: activity.id,
            workspaceId: this.ctx.workspaceId,
            areaId: area.id,
            goalId: activity.goalId ?? null,
            typeId,
            fields,
            dueDate: requireDueDate(activity.dueDate ?? null),
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

  async setGoal(id: string, goalId: string | null) {
    await this.scoped(id).modify({ goalId, updatedAt: parseUtc(now()) })
  }

  async setDueDate(id: string, dueDate: string | null) {
    await this.scoped(id).modify({
      dueDate: requireDueDate(dueDate),
      updatedAt: parseUtc(now()),
    })
  }

  setFieldValue(id: string, fieldId: string, value: unknown) {
    return this.db.transaction(
      "rw",
      [this.db.activities, this.db.activityTypes, this.db.activityTypeFields],
      async () => {
        const row = await this.byId(id)
        if (!row) return
        const field = (await this.typeFields(row.typeId)).find(
          (candidate) => candidate.id === fieldId
        )
        if (!field) throw new Error("This field is not on the activity's type.")
        await this.db.activities.update(id, {
          fields: setFieldValue(row.fields, field, value),
          updatedAt: parseUtc(now()),
        })
      }
    )
  }

  changeType(id: string, typeId: string | null) {
    return this.db.transaction(
      "rw",
      [this.db.activities, this.db.activityTypes, this.db.activityTypeFields],
      async () => {
        const row = await this.byId(id)
        if (!row || row.typeId === typeId) return
        const fields = await this.typeFields(typeId)
        await this.db.activities.update(id, {
          typeId,
          fields: keepValidValues(fields, row.fields),
          updatedAt: parseUtc(now()),
        })
      }
    )
  }

  listForGoal(goalId: string) {
    return this.db.activities
      .where("goalId")
      .equals(goalId)
      .filter((row) => row.workspaceId === this.ctx.workspaceId)
      .toArray()
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
