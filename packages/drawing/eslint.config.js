import tseslint from "typescript-eslint"
import { defineConfig } from "eslint/config"

export default defineConfig(
  { ignores: ["**/dist/**", "**/coverage/**"] },
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: "latest",
      sourceType: "module",
    },
  }
)
