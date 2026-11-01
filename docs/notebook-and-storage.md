# Notebook and storage: decisions

Draft, 2026-11-01. Inputs: [obsidian-inventory.md](obsidian-inventory.md), [activities-and-documents.md](activities-and-documents.md), a discussion on 2026-10-31, and Turso's docs as read on 2026-10-31.

**Summary:** BiOS replaces Obsidian, so documents need a folder tree. They also need to keep their links to areas, goals and activities. The database is the source of truth. A Markdown folder mirrors it so the notes stay yours, greppable and readable by agents. The notebook holds only folders and documents. Areas, goals and activities live outside it, and each one uses a notebook folder to store its documents. An entity's body is not a document. Storage is SQLite, synced to each device with Turso Sync. Document content is an append-only log of CRDT updates, because Turso settles conflicts per row. The storage decisions are deferred; the notebook decisions are made.

Projects are now called goals.

## Why the database and not files

The vault already behaves like a database. All four Dataview queries read frontmatter, 436 daily notes carry habit flags in frontmatter, and the Projects plugin keeps status boards. The vault holds only 52 wikilinks in three years. What it depends on is structured data, and files are the weakest place to keep that.

| Need | Files as the truth | Database as the truth |
| --- | --- | --- |
| A line in a document that is a live activity | The ID lives in the text (`- [ ] Book sparring <!-- HLT-32 -->`). One edit outside the app breaks it. | A block points at a row. |
| Views like Good Days, Study, the status board | Re-parse every file into an index, as Dataview does | A query |
| Phone and the Linux machine | iCloud doesn't run on Linux and Syncthing on iOS is weak, so we'd build a file-sync server anyway | Database sync, offline on each device |
| You and the agent editing one page | Whole-file conflicts: one edit wins or you get a conflicted copy | Edits merge per block |
| Renaming or moving folders | Paths are identity, so links get rewritten | IDs are identity, so nothing breaks |
| Ownership, grep, git, nvim, Claude Code | Built in | The Markdown mirror |

Files would win if most writing happened in nvim or Claude Code and the app only showed activities and views. The two-way mirror (N9 C) covers that case if it turns out to be true.

## The notebook

The notebook holds only folders and documents, like an Obsidian vault. Areas, goals and activities are not in it: they have their own sidebar sections and pages. Each entity uses one notebook folder to store its documents.

```
Notebook
├── Areas
│   └── Health                             used by the area Health
│       ├── Boxing plan
│       └── Activities
│           └── HLT-32 Book sparring       used by the activity HLT-32
│               ├── Gym options
│               └── Sparring notes
├── Goals
│   └── Boxing fundamentals                used by the goal
│       └── Training plan
├── Knowledge
│   └── AWS                                plain folder
└── Journal                                generated
    └── 2026
        └── 10
            └── 31
```

- In the tree these are ordinary folders. A small link mark shows that an entity uses one, and clicking the mark opens the entity.
- An entity's documents are everything under its folder, subfolders included. Its page lists them, and "New document" there creates one in that folder.
- The app creates an entity's folder when the entity gets its first document, so activities without documents leave no empty folders.
- The folder follows its entity. Renaming HLT-32 renames the folder. Moving HLT-32 to Finance as FIN-5 moves the folder to `Areas/Finance/Activities`. Once you rename or move the folder yourself, it stays where you put it, and the link still holds because it points at an ID.
- An activity's folder goes under its area, also when the activity belongs to a goal. A goal's page lists only its own documents, the ones in its folder and the ones attached to it, above its activities. Its activities' documents stay on the activity pages.
- A document can be attached to other entities without moving. Attach "Gym options" to HLT-40 and it stays in HLT-32's folder; HLT-40 lists it as attached.
- Moving a document out of an entity's folder keeps that entity as an attachment. Moving "Gym options" to `Knowledge/Training` leaves it attached to HLT-32. Tidying never loses a link.
- Deleting an entity keeps its folder and documents and removes the link mark. The app asks whether to trash the folder too; the default is No.
- Folders store a parent ID, never a path. The app builds paths for display and for the mirror.
- `Journal` holds daily, weekly and yearly pages (obsidian-inventory G4). The app creates its year and month folders.

An entity's body (an activity's, an area's or a goal's) is not a document. It uses the same editor, with blocks, `@` mentions and activity blocks for sub-activities, but it is stored on the entity, so it never appears in the notebook or in a Documents list. Mentions in a body still count as backlinks. A "Turn into document" action can copy a body into a new document in the entity's folder.

## Storage

SQLite holds everything. Most of the app is relational, so SQL fits:

| What the app stores | How SQLite holds it |
| --- | --- |
| The notebook tree | `parent_id`, with recursive queries for paths and subtrees |
| Links, attachments, backlinks | A link table; backlinks are one query |
| Areas, goals, activities, statuses | Rows with foreign keys |
| Saved views (filter, group, board) | A stored `WHERE` / `GROUP BY` / `ORDER BY` |
| Habit check-ins, weight, money saved | Dated rows; Good Days is an aggregate |
| Search | FTS5 |
| Extra properties per type (a purchase's price) | A JSON column; a typed table only for heavily filtered ones |

SQL doesn't merge text. Document content is a CRDT (Yjs), and SQLite keeps derived tables next to it: blocks, links and plain text for search.

SQLite beats Postgres here because the same engine runs on the phone, in the browser and on the server.

## Sync

Turso Sync keeps a full SQLite database on each device. In the browser, `@tursodatabase/sync-wasm` stores it in OPFS. Reads and writes are local, and `push()` and `pull()` exchange changes with Turso Cloud. Turso recommends it over embedded replicas.

Four facts shape the design:

1. **Conflicts are per row, last push wins.** When two devices change the same row, the later push replaces the whole row. A `transform` hook can rewrite each change before it's pushed. There is no CRDT support.
2. **Document content can't be one row.** If the phone and the laptop both edit "Boxing plan" offline, one device's edits would vanish. Content is an append-only table instead:

   ```
   document_updates(id, document_id, update, created_at)
   ```

   Two devices adding rows never conflict. Opening a document merges its rows. Compaction merges a document's rows into one snapshot row and deletes exactly the rows it merged, so rows another device adds meanwhile survive.
3. **Schema migrations are ours.** Turso deprecated multi-DB schemas for new users. Each migration runs on every cloud database and on each device's copy when the app starts. `PRAGMA user_version` is read-only on Turso Cloud, so migrations are tracked in a table.
4. **It is new and vendor-specific.** Turso's speed figures are its own claims, and partial sync is labelled experimental. The data is plain SQLite and leaves with us, but the sync protocol is Turso's. Leaving means writing our own push and pull, which is manageable with one user.

`auth.db` stays one shared database, since it's how the app finds a user's data. App tables keep `workspace_id`, so one user can still hold several workspaces.

## The Markdown mirror

The mirror writes the notebook to a folder as Markdown, one way:

```
~/notebook/
├── Areas/Health/Boxing plan.md
├── Areas/Health/Activities/HLT-32 Book sparring/
│   ├── Gym options.md
│   └── Sparring notes.md
└── Journal/2026/10/31.md
```

Each file starts with frontmatter that carries its ID, the entity whose folder holds it, and its attachments. Entity bodies are not documents, so the mirror leaves them out for now; writing them as their own files is a later call. An activity block becomes `- [ ] Book sparring (HLT-32)`, ticked when done. Editing a file does nothing, and the next write replaces it.

## Changes to the current build

- The Dexie store in `apps/web/src/local-db` is replaced by Turso Sync's local database.
- The `content: Y.Doc` columns on documents and activities become rows in `document_updates`.
- Documents gain a parent node. Folders and the notebook tree are new tables.

## Decisions

Decided items are marked. For the rest, "Lean" marks my suggestion; the choice is yours. N5 to N10 (engine, sync, content storage, row conflicts, mirror, database per user) are deferred as of 2026-11-01; the notebook work goes ahead without them.

### N1. Where documents live

- **A. Markdown files on disk** are the truth, and the app indexes them.
- **B. The database** is the truth, and a Markdown folder mirrors it. *Decided 2026-10-31.*

### N2. How entities and the notebook relate

*Replaced 2026-11-01.* The first version mixed areas, projects and activities into the tree as nodes. Now the notebook holds only folders and documents, and each entity uses a folder (E1 to E7).

### E1 to E7, B1. Entities and their folders

*All decided 2026-11-01.*

| # | Topic | Decision |
| --- | --- | --- |
| E1 | Link | Each entity uses one notebook folder. Its documents are what that folder holds. The link points at the folder's ID, so moving or renaming the folder keeps it. |
| E2 | Folder creation | When the entity gets its first document. |
| E3 | Entity changes | The folder follows the entity's name and area until you rename or move the folder yourself. |
| E4 | Subfolders | Everything under the folder counts, subfolders included. |
| E5 | Documents elsewhere | Attachments stay: an entity can list documents that live in other folders. |
| E6 | Default path | `Areas/<area>/Activities/<ID> <title>` for activities, `Areas/<area>` for areas, `Goals/<goal>` for goals. |
| E7 | Deleting an entity | The folder and documents stay. The app asks whether to trash the folder; the default is No. |
| B1 | Entity body | The same editor, stored on the entity, never a document. Sub-activities stay as activity blocks in the body. |

### N3. Periodic pages

- **A. A generated `Journal`** with year and month folders for daily, weekly and yearly pages. *Decided 2026-10-31.*
- **B. Plain folders** you manage yourself.

### N4. Where goals sit

A goal (formerly a project) spans areas, so it can't sit under one.

- **A. A top-level `Goals` folder** holds each goal's folder. Activities keep their folders under their area, and a goal's page lists its activities from every area. *Decided 2026-11-01.*
- **B. A goal's activities keep their folders under the goal.** Adding an activity to a goal would move its folder.

### N5. Database engine

- **A. SQLite** on every device and in the cloud. *Lean.*
- **B. Postgres** on the server with a SQLite cache on devices (PowerSync, ElectricSQL or Zero). Two engines and two dialects.
- **C. CRDT-only storage** (Automerge, Jazz). Sync comes free, but queries need a separate index.

### N6. Sync

- **A. Turso Sync** (`push`/`pull`, last push wins per row, OPFS in the browser). *Lean.*
- **B. Our own push and pull** over tRPC, with a change log per device. Full control and more code.

### N7. How document content is stored

- **A. One CRDT blob per document.** With last-push-wins, offline edits on two devices lose one side.
- **B. An append-only update log**, compacted into snapshots. *Lean.*

### N8. Field conflicts on rows

You change HLT-32's status on the phone and its title on the laptop while one is offline. Last push wins on the whole row, so one change is lost.

- **A. Accept it for now.** With one user it's rare. *Lean.*
- **B. Merge per field** through Turso's `transform` hook.
- **C. Narrower tables**, for example status changes as their own append-only rows.

### N9. The Markdown mirror

- **A. Manual export** from a button.
- **B. One-way and continuous.** A small CLI on the Linux machine pulls the database and rewrites changed files. *Lean.*
- **C. Two-way.** The CLI also watches the folder and turns edits into CRDT updates, matching files by the ID in their frontmatter. Build it only if you end up editing there.

### N10. One database or one per user

- **A. One database** now. *Lean.* You are the only user.
- **B. One per user** from the start. Every migration then loops over databases.

### N11. Finished activities in the tree

After a few months, Health holds 40 done activities.

- **A. Hide them** unless a filter shows them.
- **B. A collapsed `Done` group** under each area's `Activities`. *Lean.*
- **C. Show them all.**

### N12. Order inside a folder

- **A. Manual order** you drag, stored as fractional indexes.
- **B. Sort per folder** by name, created or edited. *Lean*, with manual order as one of the sorts later.

### N13. Two devices moving nodes at once

Offline, the phone moves `Knowledge` into `Training` while the laptop moves `Training` into `Knowledge`. Both syncs succeed and the tree has a loop.

- **A. Check after each pull.** If a loop exists, move the most recently moved node back to its previous parent. *Lean.*
- **B. Moves go through the server**, which rejects loops. Moving then needs a connection.

### N14. File names in the mirror

The database allows any title. A file system doesn't allow `/` or `:`, or two equal names in a folder.

- **A. Replace unsafe characters and number duplicates** (`Boxing plan (2).md`). *Lean.*
- **B. Put the ID in every file name** (`Boxing plan HLT-32.md`). Always unique, noisier.

### N15. Images and Excalidraw files

- **A. Object storage** (an S3-compatible bucket), with rows that point at the file. *Lean.*
- **B. Blobs in SQLite.** Simple, but they bloat every device's copy and every sync.

### N16. Deleting a folder or an area

- **A. A trash** that keeps the node and its children for 30 days, with restore. *Lean.*
- **B. Delete the node and move its children up** to the parent.

### N17. Obsidian import

- **A. Folders become plain folders.** Wikilinks become links by ID, and frontmatter habit flags become check-ins. *Lean.*
- **B. Import into one `Imported` folder** and sort it by hand later.

### N18 to N28. Tree interactions

Taken from a look at Notion's sidebar on 2026-11-01. *All decided 2026-11-01.*

| # | Topic | Decision |
| --- | --- | --- |
| N18 | Row controls | ⋯ shows on hover; folders also show +. Documents can't contain anything, so they have no chevron and no +. Right-click opens the ⋯ menu. On a phone, a long press does. |
| N19 | What + creates | A document in that folder. Folders come from the ⋯ menu. |
| N20 | The ⋯ menu | A shared core (Open in peek, Open in new tab, Rename, Move to, Copy link, Duplicate, Trash) plus items per type: New document and New folder on folders. Documents are attached from the activity, goal or area side only; a document lists what it is attached to, read-only (revised 2026-11-01). A folder an entity uses adds "Open HLT-32 Book sparring". The footer shows the last edit. (Revised 2026-11-01: entities are no longer tree rows.) |
| N21 | Move to | A popover with search, suggestions and a tree you open with chevrons. It never asks about the old home: the old home stays attached, and a toast says so and offers Undo. The leftover link is removed from the activity, goal or area side (revised 2026-11-01). |
| N22 | Drag in the tree | Documents and folders drag. Dropping onto a row moves inside it, and dropping between rows reorders. Dragging a folder an entity uses makes that placement yours (E3). Dropping on an activity's Documents section attaches the document, and dropping into a document's text inserts a mention. |
| N23 | Order | Folders use manual order. Activities groups sort by status and Journal sorts by date. This settles N12. |
| N24 | Search in the page menu | None. Mod K holds the commands. |
| N25 | Child pages in the body | Only through a `/children` block, which lists the children live where you put it. |
| N26 | Link preview | Hovering a link shows a card with the title, path and last edit. |
| N27 | Favorites | Not now. Today and Mod K's recent items cover quick access. |
| N28 | Moving on a phone | A long press opens the action sheet, and Move to opens the picker. No dragging. |

### N29 to N31. Weeks, icons and creating

*All decided 2026-11-01.*

| # | Topic | Decision |
| --- | --- | --- |
| N29 | Weekly pages | A `Weeks` folder under each year, next to the months: `Journal/2026/Weeks/Week 44 · 26 Oct – 1 Nov`. Every week page shows its date range. A week that spans New Year belongs to the year holding its Thursday (ISO). Daily pages link to their week, week pages list their days, and Today opens this week. |
| N30 | Icons | Documents can have an emoji (about 400) or a filled Phosphor icon (about 370, in 9 preset colors), picked from Icons and Emojis tabs. Every document stores the plain file icon by default, so the picker shows it as selected; Journal pages are no exception. Every folder, Journal included, uses the folder icon (revised 2026-11-01). Set it from the icon above the title or "Change icon" in the ⋯ menu. The icon shows in the tree, breadcrumbs, link previews, mentions, Mod K and Documents lists. The mirror stores it as `icon:` in frontmatter. |
| N31 | Creating | The + next to Notebook opens New document and New folder, created at the top level. A folder's + creates a document inside it; its ⋯ menu has New document and New folder. A new folder appears in the tree with its name selected for typing: Enter saves, Escape cancels. A new document opens with its title focused. |

## Suggested build order

1. **Storage:** Turso Sync on web and server, the update log for document content, migrations tracked in a table.
2. **Notebook tree:** folders, entity nodes, homes, attachments, moving and the loop check.
3. **Journal:** generated periodic pages.
4. **Mirror:** the one-way CLI.
5. **Import:** the Obsidian vault.

Each step ships with tests. The tree logic (paths, moves, loops) and the update-log merge are pure functions with unit tests. Sync and the mirror get end-to-end tests.

## Sources

- [Turso: building local-first apps](https://turso.tech/blog/building-local-first-apps-the-complete-guide-to-offline-first-database-sync) (July 2026): sync-wasm, OPFS, last-push-wins, `transform`
- [Turso TS SDK reference](https://docs.turso.tech/sdk/ts/reference): `push`, `pull`, `checkpoint`
- [Turso Sync benchmark](https://turso.tech/blog/sync-benchmark): vendor speed claims
- [Turso multi-DB schemas](https://docs.turso.tech/features/multi-db-schemas.md): deprecated for new users; `user_version` read-only on Turso Cloud
