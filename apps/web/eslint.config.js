import eslintReact from "@eslint-react/eslint-plugin"
import js from "@eslint/js"
import reactHooks from "eslint-plugin-react-hooks"
import tseslint from "typescript-eslint"
import { defineConfig } from "eslint/config"

const driverMessage =
  "The web app never opens SQLite. Reach data through a tRPC procedure."

const restrictedImportsRule = [
  "error",
  {
    paths: [
      { name: "better-sqlite3", message: driverMessage },
      { name: "drizzle-orm/better-sqlite3", message: driverMessage },
      { name: "@knight-os/auth/sqlite", message: driverMessage },
      {
        name: "@knight-os/auth",
        importNames: ["buildAuthOptions"],
        message:
          "buildAuthOptions is a config factory for building auth instances; the app should import `auth` from @knight-os/auth, not rebuild it.",
      },
      {
        name: "@knight-os/server/db",
        message:
          "@knight-os/server/db opens the app database and is server-only. Use @knight-os/server/db/schema for table definitions on the client.",
      },
    ],
  },
]

const restrictedSyntaxRule = [
  "error",
  {
    selector: 'CallExpression[callee.name="drizzle"]',
    message: driverMessage,
  },
]

export default defineConfig(
  {
    ignores: [
      "src/routeTree.gen.ts",
      "**/.output/**",
      "**/.nitro/**",
      "**/.tanstack/**",
      "**/.vite/**",
      "**/dist/**",
      "**/coverage/**",
    ],
  },
  {
    files: ["**/*.{ts,tsx,js,jsx}"],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
      eslintReact.configs["recommended-typescript"],
      reactHooks.configs.flat.recommended,
    ],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      "react-x": {
        version: "19.3.0",
      },
    },
    rules: {
      "no-restricted-imports": restrictedImportsRule,
      "no-restricted-syntax": restrictedSyntaxRule,
      "prefer-const": "warn",
      "no-empty": "warn",
      "no-useless-escape": "warn",
      "@typescript-eslint/no-redundant-type-constituents": "off",
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/require-await": "warn",
      "@typescript-eslint/no-unsafe-assignment": "warn",
      "@typescript-eslint/no-unnecessary-type-assertion": "warn",
      "@typescript-eslint/no-unsafe-call": "warn",
      "@typescript-eslint/no-unsafe-member-access": "warn",
      "@typescript-eslint/no-misused-promises": [
        "warn",
        {
          checksVoidReturn: false,
        },
      ],
      "@typescript-eslint/only-throw-error": "warn",
      "@typescript-eslint/no-floating-promises": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unsafe-return": "warn",
      "@typescript-eslint/await-thenable": "warn",
      "@typescript-eslint/no-unsafe-argument": "warn",
      "@typescript-eslint/prefer-promise-reject-errors": "warn",
      "@typescript-eslint/no-duplicate-type-constituents": "warn",
      "@eslint-react/rules-of-hooks": "off",
      "@eslint-react/exhaustive-deps": "off",
      "@eslint-react/error-boundaries": "off",
      "@eslint-react/purity": "off",
      "@eslint-react/set-state-in-effect": "off",
      "@eslint-react/set-state-in-render": "off",
      "@eslint-react/static-components": "off",
      "@eslint-react/unsupported-syntax": "off",
      "@eslint-react/use-memo": "off",
    },
  },
  {
    files: ["src/components/ui/**"],
    rules: {
      "@eslint-react/no-nested-component-definitions": "off",
    },
  }
)
