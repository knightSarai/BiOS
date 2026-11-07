import * as Y from "yjs"
import { addSeconds, isCivilDate, now, parseUtc } from "@knight-os/server/core"
import { activityKey } from "@/activities/areas"
import { byCreation } from "@/activities/sub-activities"
import {
  formatFieldValue,
  keepValidValues,
  parseFieldValues,
  setFieldValue,
} from "@/activities/fields"
import { isOpenStatus, type ActivityStatus } from "@/activities/status"
import { parseTimerConfig, type TimerConfig } from "@/activities/timer"
import { DOCUMENT_FRAGMENT } from "@/editor/document-content"
import { compareSortKeys } from "@/notebook/sort-keys"
import type {
  ActivityOrigin,
  ActivityRow,
  LocalDb,
  MentionRow,
  TimeEntryRow,
} from "./db"
import {
  contentUpdatesTable,
  contentWritesSettled,
  readContentUpdates,
  seedContentWithTitle,
  type ContentUpdate,
} from "./y-content"

type ActivitiesContext = {
  workspaceId: string
}

type DeletedActivity = {
  row: Omit<ActivityRow, "content">
  contentUpdates: ContentUpdate[]
  timeEntries: TimeEntryRow[]
  childIds: string[]
}

type NewActivity = {
  id: string
  areaId: string
  goalId?: string | null
  parentId?: string | null
  typeId?: string | null
  fields?: Record<string, unknown>
  dueDate?: string | null
  title: string
  notes?: string
  status: ActivityStatus
  origin: ActivityOrigin | null
  timer?: TimerConfig | null
}

type CopyPlan = {
  source: ActivityRow
  copyId: string
  parentCopyId: string | null
}

class InvalidParentError extends Error {}

const requireDueDate = (dueDate: string | null) => {
  if (dueDate !== null && !isCivilDate(dueDate)) {
    throw new Error("A due date is a YYYY-MM-DD date.")
  }
  return dueDate
}

const elementsNamed = (ydoc: Y.Doc, nodeName: string) =>
  [
    ...ydoc
      .getXmlFragment(DOCUMENT_FRAGMENT)
      .createTreeWalker(
        (node) => node instanceof Y.XmlElement && node.nodeName === nodeName
      ),
  ].filter((node) => node instanceof Y.XmlElement)

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
    return row ? this.summarize(row) : null
  }

  private async summarize(row: ActivityRow) {
    const area = await this.db.areas.get(row.areaId)
    return {
      id: row.id,
      key: activityKey(area?.key ?? "?", row.number),
      title: row.title,
      status: row.status,
      parentId: row.parentId,
      typeId: row.typeId,
      details: await this.fieldDetails(row),
    }
  }

  async children(parentId: string) {
    const rows = await this.db.activities
      .where("parentId")
      .equals(parentId)
      .filter((row) => row.workspaceId === this.ctx.workspaceId)
      .toArray()
    return rows.sort(byCreation)
  }

  // Every level under the activity, each with its parentId so the tree can be rebuilt.
  async subActivities(parentId: string) {
    const ids = await this.descendantIds(parentId)
    const rows = await this.db.activities.bulkGet([...ids])
    const found = rows.filter(
      (row): row is ActivityRow => row?.workspaceId === this.ctx.workspaceId
    )
    return Promise.all(found.sort(byCreation).map((row) => this.summarize(row)))
  }

  private async ancestorIds(id: string) {
    const found = new Set<string>()
    let row = await this.byId(id)
    while (row?.parentId && !found.has(row.parentId)) {
      found.add(row.parentId)
      row = await this.byId(row.parentId)
    }
    return found
  }

  private async descendantIds(id: string) {
    const found = new Set<string>()
    let frontier = [id]
    while (frontier.length > 0) {
      const next: string[] = []
      for (const parentId of frontier) {
        for (const child of await this.children(parentId)) {
          if (found.has(child.id)) continue
          found.add(child.id)
          next.push(child.id)
        }
      }
      frontier = next
    }
    return found
  }

  // Everything except the activity itself and its own sub-activities, which would make a loop.
  async parentCandidates(id: string) {
    const excluded = await this.descendantIds(id)
    excluded.add(id)
    const [rows, areas] = await Promise.all([
      this.list(),
      this.db.areas.where("workspaceId").equals(this.ctx.workspaceId).toArray(),
    ])
    const areaKeys = new Map(areas.map((area) => [area.id, area.key]))
    return rows
      .filter((row) => !excluded.has(row.id))
      .map((row) => ({
        id: row.id,
        key: activityKey(areaKeys.get(row.areaId) ?? "?", row.number),
        title: row.title,
        status: row.status,
      }))
  }

  setParent(id: string, parentId: string | null) {
    return this.db.transaction("rw", this.db.activities, async () => {
      const row = await this.byId(id)
      if (!row || row.parentId === parentId) return
      if (parentId !== null) {
        if (!(await this.byId(parentId))) {
          throw new InvalidParentError("That parent activity doesn't exist.")
        }
        if (parentId === id || (await this.descendantIds(id)).has(parentId)) {
          throw new InvalidParentError(
            "An activity can't be inside its own sub-activity."
          )
        }
      }
      await this.db.activities.update(id, {
        parentId,
        updatedAt: parseUtc(now()),
      })
    })
  }

  // "Reps 8 · Weight 60", in the type's field order, for lines that show an activity inline.
  private async fieldDetails(row: ActivityRow) {
    if (row.typeId === null) return ""
    const fields = await this.db.activityTypeFields
      .where("[workspaceId+typeId]")
      .equals([this.ctx.workspaceId, row.typeId])
      .toArray()
    return fields
      .sort((a, b) => compareSortKeys(a.sortKey, b.sortKey))
      .flatMap((field) => {
        const value = row.fields[field.id]
        return value === undefined
          ? []
          : [`${field.name} ${formatFieldValue(field, value)}`]
      })
      .join(" · ")
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

  async seedContents(
    activities: { id: string; title: string; notes?: string }[]
  ) {
    for (const activity of activities) {
      await this.seedContent(activity.id, activity.title, activity.notes)
    }
  }

  async ensureContent(id: string) {
    const row = await this.byId(id)
    if (row) await this.seedContent(row.id, row.title)
  }

  private async seedContent(id: string, title: string, notes = "") {
    const row = await this.byId(id)
    if (!row) return
    await seedContentWithTitle(this.db, "activities", row.content, title, notes)
  }

  private contentUpdatesTable() {
    return contentUpdatesTable(this.db, "activities")
  }

  delete(id: string) {
    const updates = this.contentUpdatesTable()
    return this.db.transaction(
      "rw",
      [this.db.activities, this.db.timeEntries, updates],
      async (): Promise<DeletedActivity | null> => {
        const row = await this.byId(id)
        if (!row) return null
        const contentUpdates = await updates.where("k").equals(id).toArray()
        const timeEntries = this.db.timeEntries
          .where("[workspaceId+activityId]")
          .equals([this.ctx.workspaceId, id])
        const deletedAt = parseUtc(now())
        // A timer running at deletion is closed, so undo doesn't count the deleted time.
        const deletedEntries = (await timeEntries.toArray()).map((entry) => ({
          ...entry,
          endedAt: entry.endedAt ?? deletedAt,
        }))
        await timeEntries.delete()
        await updates.where("k").equals(id).delete()
        // Sub-activities stay, without a parent, as in Linear; undo puts them back under it.
        const childIds = (await this.children(id)).map((child) => child.id)
        await this.db.activities
          .where("id")
          .anyOf(childIds)
          .modify({ parentId: null })
        await this.db.activities.delete(id)
        return {
          row: {
            id: row.id,
            workspaceId: row.workspaceId,
            areaId: row.areaId,
            goalId: row.goalId,
            parentId: row.parentId,
            typeId: row.typeId,
            fields: row.fields,
            dueDate: row.dueDate,
            number: row.number,
            title: row.title,
            status: row.status,
            reopenStatus: row.reopenStatus,
            origin: row.origin,
            timer: row.timer,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            completedAt: row.completedAt,
          },
          contentUpdates: contentUpdates.map(({ k, u, f }) => ({ k, u, f })),
          timeEntries: deletedEntries,
          childIds,
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
        this.db.timeEntries,
        updates,
      ],
      async () => {
        if (await this.byId(snapshot.row.id)) return false
        await updates.where("k").equals(snapshot.row.id).delete()
        const fields = await this.typeFields(snapshot.row.typeId)
        const parentId =
          snapshot.row.parentId !== null &&
          (await this.byId(snapshot.row.parentId))
            ? snapshot.row.parentId
            : null
        await this.db.activities.add({
          ...snapshot.row,
          parentId,
          fields: keepValidValues(fields, snapshot.row.fields),
        })
        await updates.bulkAdd(snapshot.contentUpdates)
        await this.db.timeEntries.bulkPut(snapshot.timeEntries)
        // Only children nobody has moved elsewhere since go back under it, and none that
        // became one of its ancestors meanwhile, which would close a loop.
        const ancestors = await this.ancestorIds(snapshot.row.id)
        await this.db.activities
          .where("id")
          .anyOf(snapshot.childIds)
          .filter(
            (row) =>
              row.workspaceId === this.ctx.workspaceId &&
              row.parentId === null &&
              !ancestors.has(row.id)
          )
          .modify({ parentId: snapshot.row.id })
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
        const batchStart = parseUtc(now())
        const created: { id: string; key: string }[] = []
        for (const [index, activity] of activities.entries()) {
          // A millisecond apart, so lists sorted by creation keep the batch's order.
          const timestamp = addSeconds(batchStart, index / 1000)
          const area = await this.db.areas.get(activity.areaId)
          if (area?.workspaceId !== this.ctx.workspaceId) {
            throw new Error("The area for this activity does not exist.")
          }
          const parentId = activity.parentId ?? null
          if (parentId !== null && !(await this.byId(parentId))) {
            throw new InvalidParentError("That parent activity doesn't exist.")
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
            parentId,
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
            timer:
              activity.timer === undefined || activity.timer === null
                ? null
                : parseTimerConfig(activity.timer),
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

  async setTimer(id: string, timer: TimerConfig | null) {
    await this.scoped(id).modify({
      timer: timer === null ? null : parseTimerConfig(timer),
      updatedAt: parseUtc(now()),
    })
  }

  // Copies the activity and all its sub-activities, down the whole tree. Lines and
  // @-mentions in the copied bodies point at the copies. The copies start as To do
  // with no due date and no logged time; field values carry over as the plan.
  async duplicate(id: string) {
    const source = await this.byId(id)
    if (!source) return null
    const plans: CopyPlan[] = []
    // As in Linear, a copied sub-activity stays under the same parent.
    await this.planCopies(source, source.parentId, plans)
    const copyIds = new Map(plans.map((plan) => [plan.source.id, plan.copyId]))
    await contentWritesSettled(this.db, "activities")
    const contents = new Map<string, Uint8Array>()
    for (const plan of plans) {
      const content = await this.copiedContent(plan.source.id, copyIds)
      if (content) contents.set(plan.copyId, content)
    }
    const updates = this.contentUpdatesTable()
    const created = await this.db.transaction(
      "rw",
      [
        this.db.areas,
        this.db.activities,
        this.db.activityTypes,
        this.db.activityTypeFields,
        this.db.mentions,
        updates,
      ],
      async () => {
        const rows = await this.insertMany(
          plans.map(({ source: row, copyId, parentCopyId }) => {
            const copiedOrigin =
              row.origin?.kind === "activity"
                ? copyIds.get(row.origin.activityId)
                : undefined
            return {
              id: copyId,
              areaId: row.areaId,
              goalId: row.goalId,
              parentId: parentCopyId,
              typeId: row.typeId,
              fields: row.fields,
              dueDate: null,
              title: row.title,
              status: "todo" as const,
              origin: copiedOrigin
                ? {
                    kind: "activity" as const,
                    activityId: copiedOrigin,
                    blockId: row.origin?.blockId ?? null,
                  }
                : null,
              timer: row.timer,
            }
          })
        )
        await updates.bulkAdd(
          [...contents].map(([copyId, content]) => ({ k: copyId, u: content }))
        )
        await this.copyMentions(copyIds)
        return rows
      }
    )
    await this.seedContents(
      plans
        .filter((plan) => !contents.has(plan.copyId))
        .map((plan) => ({ id: plan.copyId, title: plan.source.title }))
    )
    return created[0] ?? null
  }

  // Parents are planned before their children, so each copy's parent exists when it's inserted.
  private async planCopies(
    source: ActivityRow,
    parentCopyId: string | null,
    plans: CopyPlan[]
  ) {
    const copyId = crypto.randomUUID()
    plans.push({ source, copyId, parentCopyId })
    for (const child of await this.children(source.id)) {
      if (plans.some((plan) => plan.source.id === child.id)) continue
      await this.planCopies(child, copyId, plans)
    }
  }

  private async copiedContent(sourceId: string, copyIds: Map<string, string>) {
    const contentUpdates = await readContentUpdates(
      this.db,
      "activities",
      sourceId
    )
    if (contentUpdates.length === 0) return null
    const ydoc = new Y.Doc()
    try {
      // y-dexie stores V2 updates.
      for (const update of contentUpdates) Y.applyUpdateV2(ydoc, update.u)
      for (const element of elementsNamed(ydoc, "activity")) {
        const activityId = element.getAttribute("activityId")
        const copiedId =
          typeof activityId === "string" ? copyIds.get(activityId) : undefined
        if (copiedId) element.setAttribute("activityId", copiedId)
      }
      for (const element of elementsNamed(ydoc, "mention")) {
        const targetId = element.getAttribute("targetId")
        const copiedId =
          element.getAttribute("targetKind") === "activity" &&
          typeof targetId === "string"
            ? copyIds.get(targetId)
            : undefined
        if (copiedId) element.setAttribute("targetId", copiedId)
      }
      return Y.encodeStateAsUpdateV2(ydoc)
    } finally {
      ydoc.destroy()
    }
  }

  private async copyMentions(copyIds: Map<string, string>) {
    const copies: MentionRow[] = []
    for (const [sourceId, copyId] of copyIds) {
      const rows = await this.db.mentions
        .where("[workspaceId+sourceKey]")
        .equals([this.ctx.workspaceId, `activity:${sourceId}`])
        .toArray()
      for (const row of rows) {
        const [kind, targetId] = row.targetKey.split(":") as [string, string]
        const copiedTarget =
          kind === "activity" ? copyIds.get(targetId) : undefined
        const targetKey = copiedTarget
          ? (`activity:${copiedTarget}` as const)
          : row.targetKey
        const sourceKey = `activity:${copyId}` as const
        copies.push({
          id: `${sourceKey}>${targetKey}`,
          workspaceId: this.ctx.workspaceId,
          sourceKey,
          targetKey,
          blockId: row.blockId,
        })
      }
    }
    await this.db.mentions.bulkAdd(copies)
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

export { ActivitiesRepository, InvalidParentError }
export type { ActivitiesContext, DeletedActivity, NewActivity }
