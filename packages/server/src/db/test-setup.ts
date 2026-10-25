import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import { openSqlite } from "@knight-os/auth/sqlite"

const dataDir = mkdtempSync(join(tmpdir(), "knight-os-test-"))

const databases = [
  {
    env: "AUTH_DATABASE_PATH",
    migrations: "../../../auth/src/db/migrations",
  },
  {
    env: "APP_DATABASE_PATH",
    migrations: "./migrations",
  },
] as const

for (const database of databases) {
  const path = join(dataDir, `${database.env.toLowerCase()}.db`)
  process.env[database.env] = path

  const sqlite = openSqlite(path)
  migrate(drizzle({ client: sqlite }), {
    migrationsFolder: fileURLToPath(
      new URL(database.migrations, import.meta.url)
    ),
  })
  sqlite.close()
}

process.env.BETTER_AUTH_URL = "http://localhost:3000"
process.env.BETTER_AUTH_SECRET = "test-secret-at-least-32-characters-long"
