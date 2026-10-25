import tseslint from "typescript-eslint"
import { defineConfig } from "eslint/config"

const driverMessage =
  "Only src/db and src/sqlite.ts open SQLite. Import the auth db handle from #db instead."

export default defineConfig(
  { ignores: ["**/dist/**", "**/coverage/**", "src/db/migrations/**"] },
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: "latest",
      sourceType: "module",
    },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "better-sqlite3", message: driverMessage },
            { name: "drizzle-orm/better-sqlite3", message: driverMessage },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        { selector: 'CallExpression[callee.name="drizzle"]', message: driverMessage },
      ],
    },
  },
  {
    files: ["src/db/**/*.ts", "src/sqlite.ts"],
    rules: { "no-restricted-imports": "off", "no-restricted-syntax": "off" },
  },
)
