import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { openSqlite } from "../sqlite"

import * as schema from "./schema"
export * from "./schema"

export const db = drizzle({
  client: openSqlite(process.env.AUTH_DATABASE_PATH ?? "data/auth.db"),
  casing: "snake_case",
  schema,
})

export type DB = typeof db

export const promoteToAdmin = async (userId: string) =>
  db
    .update(schema.users)
    .set({ role: "admin" })
    .where(eq(schema.users.id, userId))
