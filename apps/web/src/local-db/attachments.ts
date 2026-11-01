import { now, parseUtc } from "@knight-os/server/core"
import type { OwnerKey } from "@/notebook/owners"
import type { LocalDb } from "./db"

type AttachmentsContext = {
  workspaceId: string
}

const attachmentId = (documentId: string, ownerKey: OwnerKey) =>
  `${documentId}|${ownerKey}`

class AttachmentsRepository {
  constructor(
    private readonly db: LocalDb,
    private readonly ctx: AttachmentsContext
  ) {}

  forDocument(documentId: string) {
    return this.db.attachments
      .where("[workspaceId+documentId]")
      .equals([this.ctx.workspaceId, documentId])
      .toArray()
  }

  forOwner(ownerKey: OwnerKey) {
    return this.db.attachments
      .where("[workspaceId+ownerKey]")
      .equals([this.ctx.workspaceId, ownerKey])
      .toArray()
  }

  async attach(documentId: string, ownerKey: OwnerKey) {
    const id = attachmentId(documentId, ownerKey)
    const existing = await this.db.attachments.get(id)
    if (existing) return false
    await this.db.attachments.add({
      id,
      workspaceId: this.ctx.workspaceId,
      documentId,
      ownerKey,
      createdAt: parseUtc(now()),
    })
    return true
  }

  async detach(documentId: string, ownerKey: OwnerKey) {
    const id = attachmentId(documentId, ownerKey)
    const existing = await this.db.attachments.get(id)
    if (existing?.workspaceId !== this.ctx.workspaceId) return
    await this.db.attachments.delete(id)
  }
}

export { AttachmentsRepository }
export type { AttachmentsContext }
