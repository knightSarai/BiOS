import { now, parseUtc } from "@knight-os/server/core"
import {
  AREA_KEY_PATTERN,
  areaKeyFromName,
  type AreaColor,
} from "@/activities/areas"
import type { LocalDb } from "./db"

type AreasContext = {
  workspaceId: string
}

type NewArea = {
  name: string
  key: string
  color: AreaColor
}

type AreaChanges = Partial<Pick<NewArea, "name" | "color">>

class AreaKeyTakenError extends Error {}

const defaultAreaIdFor = (workspaceId: string) => `default-${workspaceId}`

const defaultAreaKey = (workspaceName: string) => {
  const key = areaKeyFromName(workspaceName)
  return AREA_KEY_PATTERN.test(key) ? key : "GEN"
}

class AreasRepository {
  constructor(
    private readonly db: LocalDb,
    private readonly ctx: AreasContext
  ) {}

  private get defaultAreaId() {
    return defaultAreaIdFor(this.ctx.workspaceId)
  }

  isDefault(id: string) {
    return id === this.defaultAreaId
  }

  async list() {
    const rows = await this.db.areas
      .where("workspaceId")
      .equals(this.ctx.workspaceId)
      .toArray()
    return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  async byId(id: string) {
    const row = await this.db.areas.get(id)
    return row?.workspaceId === this.ctx.workspaceId ? row : null
  }

  ensureDefault(workspaceName: string) {
    return this.db.transaction("rw", this.db.areas, async () => {
      const existing = await this.db.areas.get(this.defaultAreaId)
      if (existing) return existing
      const row = {
        id: this.defaultAreaId,
        workspaceId: this.ctx.workspaceId,
        key: defaultAreaKey(workspaceName),
        name: workspaceName,
        color: "chart-1" as const,
        nextNumber: 1,
        createdAt: parseUtc(now()),
      }
      await this.db.areas.add(row)
      return row
    })
  }

  create(area: NewArea) {
    const key = area.key.trim().toUpperCase()
    if (!AREA_KEY_PATTERN.test(key)) {
      throw new Error("An area key is 2 to 5 letters.")
    }
    return this.db.transaction("rw", this.db.areas, async () => {
      const taken = await this.db.areas
        .where("[workspaceId+key]")
        .equals([this.ctx.workspaceId, key])
        .count()
      if (taken > 0) throw new AreaKeyTakenError(`${key} is already used.`)
      const row = {
        id: crypto.randomUUID(),
        workspaceId: this.ctx.workspaceId,
        key,
        name: area.name.trim(),
        color: area.color,
        nextNumber: 1,
        createdAt: parseUtc(now()),
      }
      await this.db.areas.add(row)
      return row
    })
  }

  async update(id: string, changes: AreaChanges) {
    const name = changes.name?.trim()
    if (name === "") throw new Error("Give the area a name.")
    await this.db.areas
      .where("id")
      .equals(id)
      .filter((row) => row.workspaceId === this.ctx.workspaceId)
      .modify({
        ...(name === undefined ? {} : { name }),
        ...(changes.color === undefined ? {} : { color: changes.color }),
      })
  }

  async delete(id: string) {
    if (this.isDefault(id)) throw new Error("The first area can't be deleted.")
    await this.db.areas
      .where("id")
      .equals(id)
      .filter((row) => row.workspaceId === this.ctx.workspaceId)
      .delete()
  }
}

export { AreaKeyTakenError, AreasRepository, defaultAreaIdFor }
export type { AreaChanges, AreasContext, NewArea }
