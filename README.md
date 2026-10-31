# Knight OS

A personal operating system for life: issues, documents, habits and goals, organised into workspaces.

Built on the KNAPS stack, with SQLite in place of Postgres and path-based workspaces in place of subdomain tenants.

## Layout

pnpm workspace over `apps/*` and `packages/*`.

| Path | What it is |
| --- | --- |
| `apps/web` | `@knight-os/web`: TanStack Start app (React 19, Vite 8, Tailwind v4, Base UI, Jotai) and the tRPC client |
| `packages/server` | `@knight-os/server`: tRPC routers, use cases, repositories, drizzle schema for `app.db` |
| `packages/auth` | `@knight-os/auth`: better-auth on `auth.db`, workspaces (better-auth organizations), permissions |

`packages/server/src` is layered on purpose: `db/` (schema and connection), `data-access/` (repositories), `use-cases/` (business logic), `trpc/` (transport). `CLAUDE.md` has the rules for which layer may do what.

## How data is split

- `data/auth.db`: users, sessions, workspaces and members (better-auth tables). The plugin's `invitations` table exists but stays empty: invitations are turned off.
- `data/app.db`: everything the app owns. Every table has a `workspace_id`.

Both paths come from `AUTH_DATABASE_PATH` and `APP_DATABASE_PATH`. Relative paths resolve against the repository root; use absolute paths in production.

## Workspaces

A workspace is a better-auth organization. Only app admins create workspaces, from `/admin/workspaces`, naming an existing user as its owner; people can't create their own or invite others. Its slug is its address: `/<workspace>` is its home, `/<workspace>/settings/...` its settings. Workspace tRPC procedures take a `workspace` input (the slug), check membership, and put the workspace, role and permissions on `ctx`. Slugs that collide with app routes (`admin`, `sign-in`, `api`, ...) are reserved in `packages/auth/src/utils`.

## Setup

Requires Node 24 and pnpm (pinned in `packageManager`; `corepack enable` picks it up). No Docker.

```bash
pnpm install
```

```bash
cp .env.example .env
```

Set `BETTER_AUTH_SECRET` in `.env` (`openssl rand -base64 32`), then create both databases:

```bash
pnpm db:migrate
```

```bash
pnpm dev
```

Open http://localhost:3000 and create an account (e.g. `admin@example.com` / `password123`). Make yourself an app admin, then create workspaces at `/admin/workspaces`:

```bash
pnpm --filter @knight-os/auth make-admin admin@example.com
```

Password reset emails are printed to the server log.

## Everyday commands

```bash
pnpm typecheck    # tsc (TypeScript 7) in every package
pnpm lint         # eslint (typescript-eslint runs on the TypeScript 6 API)
pnpm test         # vitest in every package
pnpm db:generate  # generate migrations from schema changes (auth and server)
pnpm db:migrate   # apply migrations to auth.db and app.db
```

`pnpm --filter @knight-os/server db:studio` and `pnpm --filter @knight-os/auth db:studio` open drizzle studio on ports 5555 and 5556.

After changing better-auth plugins or options, regenerate the auth schema, then its migration:

```bash
pnpm --filter @knight-os/auth auth:schema
```

Never hand-edit a generated migration. Delete it and regenerate.

## TypeScript 6 and 7

`tsc` is TypeScript 7 (`@typescript/native`). The `typescript` package is aliased to `@typescript/typescript6` because typescript-eslint does not support TypeScript 7 yet. This follows the side-by-side setup from the TypeScript 7.0 release notes. Drop the alias once typescript-eslint supports 7.
# BiOS
