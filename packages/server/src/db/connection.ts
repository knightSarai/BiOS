import { drizzle } from "drizzle-orm/better-sqlite3"
import { openSqlite } from "@knight-os/auth/sqlite"
import * as schema from "./schema"

export const db = drizzle({
  client: openSqlite(process.env.APP_DATABASE_PATH ?? "data/app.db"),
  casing: "snake_case",
  schema,
})

export type AppDB = typeof db
type AppTransaction = Parameters<Parameters<AppDB["transaction"]>[0]>[0]
export type AppDBOrTx = AppDB | AppTransaction
