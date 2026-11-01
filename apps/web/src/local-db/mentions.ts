import type { LocalDb, MentionSourceKey, MentionTargetKey } from "./db"

type MentionsContext = {
  workspaceId: string
}

type MentionTarget = {
  targetKey: MentionTargetKey
  blockId: string | null
}

class MentionsRepository {
  constructor(
    private readonly db: LocalDb,
    private readonly ctx: MentionsContext
  ) {}

  // The editor sends every mention in the source on each save, so the old set is replaced, not merged.
  replaceForSource(sourceKey: MentionSourceKey, targets: MentionTarget[]) {
    return this.db.transaction("rw", this.db.mentions, async () => {
      await this.db.mentions
        .where("[workspaceId+sourceKey]")
        .equals([this.ctx.workspaceId, sourceKey])
        .delete()
      const unique = new Map(
        targets
          .filter((target) => target.targetKey !== sourceKey)
          .map((target) => [target.targetKey, target])
      )
      await this.db.mentions.bulkAdd(
        [...unique.values()].map((target) => ({
          id: `${sourceKey}>${target.targetKey}`,
          workspaceId: this.ctx.workspaceId,
          sourceKey,
          targetKey: target.targetKey,
          blockId: target.blockId,
        }))
      )
    })
  }

  backlinksTo(targetKey: MentionTargetKey) {
    return this.db.mentions
      .where("[workspaceId+targetKey]")
      .equals([this.ctx.workspaceId, targetKey])
      .toArray()
  }
}

export { MentionsRepository }
export type { MentionTarget, MentionsContext }
