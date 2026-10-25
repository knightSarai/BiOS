import { existsSync } from "node:fs"
import { defineConfig } from "drizzle-kit"
import { resolveDataPath } from "./src/sqlite"

if (existsSync("../../.env")) process.loadEnvFile("../../.env")

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "sqlite",
  casing: "snake_case",
  dbCredentials: {
    url: resolveDataPath(process.env.AUTH_DATABASE_PATH ?? "data/auth.db"),
  },
})
