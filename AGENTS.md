# AGENTS.md

All project rules, coding style, architecture guidelines, and conventions are defined in [CLAUDE.md](./CLAUDE.md). Read and follow CLAUDE.md before proceeding with any task.

- Repository functions that read beyond the active workspace's own rows must carry the word `visible` in their name (e.g. `findVisible`, `listVisibleByTag`). Functions without `visible` in the name must be scoped to the active workspace.
