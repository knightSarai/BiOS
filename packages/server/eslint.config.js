import tseslint from "typescript-eslint"
import { defineConfig } from "eslint/config"

const driverMessage =
  "Only src/db opens the app database. Use the db handle from #db, reached through a procedure's ctx."

const dayjsTzMessage =
  "On a .tz() value, dayjs startOf/endOf and unit comparisons take the offset from the host timezone and are wrong on daylight saving days. Use startOfDayUtc, endOfDayUtc or toLocalDate from core/datetime."

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
        {
          selector:
            'CallExpression[callee.property.name=/^(startOf|endOf)$/]:has(CallExpression[callee.property.name="tz"])',
          message: dayjsTzMessage,
        },
        {
          selector:
            'CallExpression[callee.property.name=/^(isSame|isBefore|isAfter|isSameOrBefore|isSameOrAfter)$/][arguments.length=2]:has(CallExpression[callee.property.name="tz"])',
          message: dayjsTzMessage,
        },
      ],
    },
  },
  {
    files: ["src/db/**/*.ts"],
    rules: { "no-restricted-imports": "off", "no-restricted-syntax": "off" },
  },
)
