import { parseUtc, now } from "@knight-os/server/core"
import type { LocalDb } from "./db"

type DocumentsContext = {
  workspaceId: string
}

class DocumentsRepository {
  constructor(
    private readonly db: LocalDb,
    private readonly ctx: DocumentsContext
  ) {}

  list() {
    return this.db.documents
      .where("[workspaceId+updatedAt]")
      .between([this.ctx.workspaceId, ""], [this.ctx.workspaceId, "￿"])
      .reverse()
      .toArray()
  }

  async byId(id: string) {
    const row = await this.db.documents.get(id)
    return row?.workspaceId === this.ctx.workspaceId ? row : null
  }

  async create() {
    const timestamp = parseUtc(now())
    const id = crypto.randomUUID()
    await this.db.documents.add({
      id,
      workspaceId: this.ctx.workspaceId,
      title: "",
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    return id
  }

  async syncTitle(id: string, title: string) {
    await this.db.documents
      .where("id")
      .equals(id)
      .filter(
        (row) => row.workspaceId === this.ctx.workspaceId && row.title !== title
      )
      .modify({ title, updatedAt: parseUtc(now()) })
  }

  async saveTitle(id: string, title: string) {
    await this.db.documents
      .where("id")
      .equals(id)
      .filter((row) => row.workspaceId === this.ctx.workspaceId)
      .modify({ title, updatedAt: parseUtc(now()) })
  }
}

export { DocumentsRepository }
export type { DocumentsContext }
