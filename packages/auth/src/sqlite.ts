import { mkdirSync } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import Database from "better-sqlite3"

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url))

export const resolveDataPath = (path: string) =>
  isAbsolute(path) ? path : resolve(REPO_ROOT, path)

export const openSqlite = (path: string) => {
  const file = resolveDataPath(path)
  mkdirSync(dirname(file), { recursive: true })

  const sqlite = new Database(file)
  sqlite.pragma("journal_mode = WAL")
  sqlite.pragma("foreign_keys = ON")
  sqlite.pragma("busy_timeout = 5000")
  return sqlite
}

const SQLITE_CONSTRAINT_UNIQUE = "SQLITE_CONSTRAINT_UNIQUE"
const SQLITE_CONSTRAINT_PRIMARYKEY = "SQLITE_CONSTRAINT_PRIMARYKEY"
const SQLITE_CONSTRAINT_FOREIGNKEY = "SQLITE_CONSTRAINT_FOREIGNKEY"

const asSqliteError = (err: unknown) =>
  err instanceof Database.SqliteError
    ? err
    : err instanceof Error && err.cause instanceof Database.SqliteError
      ? err.cause
      : null

export const isUniqueViolation = (err: unknown, column?: string) => {
  const sqliteErr = asSqliteError(err)
  if (
    sqliteErr?.code !== SQLITE_CONSTRAINT_UNIQUE &&
    sqliteErr?.code !== SQLITE_CONSTRAINT_PRIMARYKEY
  ) {
    return false
  }
  return column === undefined || sqliteErr.message.includes(column)
}

export const isForeignKeyViolation = (err: unknown) =>
  asSqliteError(err)?.code === SQLITE_CONSTRAINT_FOREIGNKEY
