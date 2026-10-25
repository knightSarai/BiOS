import type { AppDBOrTx } from "#db"
import type { RepositoryContext } from "#data-access/context"
import type { AppLogger } from "#services"

export type UserContext = RepositoryContext & {
  db: AppDBOrTx
  headers: Headers
  logger: AppLogger
}
