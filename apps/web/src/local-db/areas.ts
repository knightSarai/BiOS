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

class AreaKeyTakenError extends Error {}

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
    return `default-${this.ctx.workspaceId}`
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
}

export { AreaKeyTakenError, AreasRepository }
export type { AreasContext, NewArea }
