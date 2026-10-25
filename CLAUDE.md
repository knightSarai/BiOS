# CLAUDE.md

Purpose: These rules define my personal coding style and architectural preferences. Follow them strictly in all suggestions, code generation, and refactoring.

## Technical Rules

- Use cases are functions using only native data structures; no direct request cycle or DB access.
- All DB access goes through repository injected via context objects. Keep DB schemas/config isolated.
- If the endpoint is only doing simple CRUD operations then there is no need to create repository, and it will be fine to access DB directly from the router.
- Prefer explicit over implicit code.
- Use a declarative style; manage reactive state declaratively.
- Don't decide if something is needed or not; discuss options with examples and let me make the decision.

## Coding Style & Naming Conventions
- Language: TypeScript (strict). Prefer types over interfaces; no weak typing.
- Files: `kebab-case.ts`; React components `PascalCase.tsx`.
- Repository functions that read beyond the active workspace's own rows must carry the word `visible` in their name (e.g. `findVisible`, `listVisibleByTag`). Functions without `visible` in the name must be scoped to the active workspace (`workspace_id`).

## Architecture & Data Access

- Never mirror server data in client state.
- Always try to rely on TS inference before creating types; use utilities to infer types (built-in TS utilities, `z.infer`, drizzle's `InferSelectModel`, `InferInsertModel`, `createInsertSchema` from `drizzle-zod`, etc.).

## UI Rules

- Always use Tailwind CSS, Base UI React, and Jotai. No custom styling, no Context, no useState.
- Use server state tools (e.g. TanStack Query) for server state; use Jotai for client/UI state only.
- useEffect is your last resort — don't use it as long as there is at least one alternative. Drive state by actions, not by effects.
- React Compiler is on. Never write `useMemo`, `useCallback` or `memo()` for performance; use them only when identity is required for correctness (e.g. creating an atom once per component instance) and say why in the PR.
- Never use `window.location` for navigation. Always use TanStack Router's `navigate()` or `redirect()`. Use `reloadDocument: true` when a full page reload is needed (e.g., after auth changes).
- Never use `window` directly for things that have framework equivalents (navigation, history, URL parsing). Browser APIs like `window.matchMedia` for responsive detection are fine.

## Testing Guidelines

- Tests must ship with features (before or after code, not after release).
- Prefer integration/E2E over unit tests; avoid UI tests except critical logic. Test pure functions where possible.

## Agent-Specific Notes

- Don't write route files manually if the framework auto-generates routing code from file creation.
- Use pnpm to add UI components from component libraries — don't write them yourself.

## Team Workflow

- No self-merge. Every PR merges through review + green checks — humans and agents alike.
- Agents never push without the operator's explicit per-request instruction; permission is single-use.
- Agents never commit until the operator has reviewed the diff.
- Never weaken CI to make something pass (skip tests, lower thresholds, gate checks behind conditions) — hard stop, ask first.

## Research & Verification

- External SDK/API contracts get verified against current docs before implementing — never from model memory.
- Agent-authored work is not done until verified: typecheck + tests run, and reviewed by someone (or some model) other than the author.

## Database Safety

- Two SQLite files: `auth.db` (better-auth, owned by `packages/auth`) and `app.db` (app data, owned by `packages/server`). Never join across them in SQL; resolve auth rows through `@knight-os/auth/data-access`.
- Every app table carries `workspace_id`. Workspace procedures resolve the workspace from the `workspace` input; never take a workspace id from the client.
- Never hand-edit generated drizzle migrations — delete the stale migration and regenerate with `pnpm db:generate`.

## Conventions

- Comments: default to zero. Only when the WHY is non-obvious — no section banners, no "this does X".
- Dates: only via core/datetime helpers (dayjs + UtcDatetime). Never raw `new Date()`/`Date.now()` in feature code.
