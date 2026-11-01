# AGENTS.md

All project rules, coding style, architecture guidelines, and conventions are defined in [CLAUDE.md](./CLAUDE.md). Read and follow CLAUDE.md before proceeding with any task.

- Repository functions that read beyond the active workspace's own rows must carry the word `visible` in their name (e.g. `findVisible`, `listVisibleByTag`). Functions without `visible` in the name must be scoped to the active workspace.

## Cloud Agent

The VM image can place Node 22 ahead of Node 24 on `PATH` (`/exec-daemon/node`). This repo requires Node 24, and `better-sqlite3` is built for that runtime. Put `/usr/local/bin` first before install, dev, or test commands:

```bash
export PATH="/usr/local/bin:$PATH"
```

Node 24.22.2 is at `/usr/local/bin/node`. The dev server listens on port 3000. Sign in at http://localhost:3000 so the origin matches `BETTER_AUTH_URL`. When `.env` is missing, setup copies `.env.example` and generates `BETTER_AUTH_SECRET`. On boot, migrations are applied, and `admin@example.com` is created with password `password123` when that user is missing.
