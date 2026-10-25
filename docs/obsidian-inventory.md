# Obsidian inventory: the main test

Draft, 2026-10-24. Source: `~/Documents/knight-wiki` (read only, nothing changed).

**Verdict:** the vault mostly fits issues, documents, timers, and visions and goals. Nine gaps need a decision before the data model is final (see [Gaps](#gaps-to-decide)). The biggest ones are habits, measurements over time, saved views, and periodic pages beyond the daily one.

## What is in the vault

| Area | Notes | How it is used |
| --- | --- | --- |
| Daily notes (`journal/`, `archive/`) | 475 (Aug 2023 to Sep 2026) | Template: habit flags in frontmatter, `# Tasks`, `# Workout` (Morning, Evening). Only 83 of the 176 notes since 2025 have anything beyond the template. |
| Weekly notes | 21 | Training programmes, reading targets ("30 mins daily"), shopping lists, course to-dos |
| Yearly notes | 7 (2020 to 2026) | Retrospective prose, then `# Objectives` and `# Goals`. Goals are ticked when done and struck through when dropped. The 2026 period runs birthday to birthday. |
| Beyond the Borders project | 20 notes + 1 checklist | Obsidian Projects plugin: `status` (To-do, In progress, Done) and a type tag (Book, Course, Path, Preparation, Project). Table view plus a board grouped by status. Some notes hold long study notes and code. |
| Knowledge notes (`dev/`, `articles/`, `IELTS/`, `Topics`) | ~75 | Reference notes, nested folders, code blocks (ts, js, bash, json, html, python), 2 mermaid diagrams |
| Books and media | ~5 | A book list, reading notes with dated sections, quotes, screenshots, one review |
| Reading list (`To Read.md`) | 1 | A checklist of article URLs plus loose Amazon links |
| Finance | 10 | Monthly notes with `started` and `saved` properties, a buying wishlist (checklist), a weekly expenses list, notes on money owed to or by people |
| Insights | 5 | 4 Dataview queries + 1 hand-kept monthly table (finance, career, weight) |
| Drawings | 13 | Excalidraw files |

Other facts that shape the build:

- **Tasks:** 702 task lines. 322 of the 450 open ones are the empty `- [ ]` placeholder from the daily template, so about 128 are real open tasks. 106 are nested under another task. 16 carry `[completion:: date]`.
- **Links:** only 52 wikilinks, mostly a hub note that links AWS topics. 36 embeds, nearly all pasted images.
- **Editor habits:** vim mode is on; 9 notes contain Arabic (the RTL plugin is installed); the calendar plugin is used to navigate daily and weekly notes.
- **Plugins:** dataview, obsidian-projects, calendar, kanban (2 empty boards), excalidraw, table-editor, vimrc, rtl.

## The queries that must keep working

Every Dataview query reads the daily notes. These are the views Life OS has to reproduce on day one.

| Query | What it does | Life OS equivalent |
| --- | --- | --- |
| Tasks | All open tasks from daily notes grouped by note, and all open tasks outside the journal and archive | Issue view: status open, grouped by source document |
| Good Days | Days with study, read, stretch and a workout all done; Fridays and Saturdays need only read and stretch | Saved query over habit check-ins (gap G1) |
| Study | Days where `study` is true, newest first | Habit history for Study |
| Workout | Days with a workout and its types, newest first | Timer sessions linked to Workout issues |

## Mapping to primitives

| Obsidian thing | Life OS primitive | Notes |
| --- | --- | --- |
| Daily note | Document with a date (the daily page) | The 53% of daily notes left as an untouched template support "empty pages are quietly discarded" |
| `- [ ]` in any note | Issue, linked back to the block it came from | Must stay visible and tickable where it was written (G6) |
| Nested task | Sub-issue | 106 cases |
| `[completion:: date]` | `completedAt` on the issue | |
| Habit flags (`workout`, `study`, `read`, `stretch`) | Not covered yet | G1 |
| Workout section, weekly training programme | Timer structure (template) + timer sessions linked to a Workout issue | "3 rd shadowboxing, 8 rd push-ups x10" is exactly a saved circuit |
| Weekly note | Weekly page document | G4 |
| Yearly Objectives | Visions with a one-year start and end | Birthday-to-birthday periods confirm flexible dates |
| Yearly Goals | Goals under those visions | Struck-through goals need a Canceled status (G8) |
| Yearly retrospective | Document linked to the year's visions | |
| Beyond the Borders | A goal (or vision) | |
| Its 20 notes | Issues typed Book, Course, Path, Preparation, Project; their long notes become the issue description or a linked document | Board grouped by status needs saved views (G3) |
| Beyond the Borders checklist | Document whose to-dos became sub-issues of the goal | |
| Book, reading notes | Book issue (status, author, started, finished) + a linked notes document | Dated sections in one note per book work as-is in a document |
| `To Read.md` URLs | Article issues with a URL property | Capture from a pasted link |
| Knowledge notes | Documents in collections (G7) | Need code highlighting and mermaid |
| Buying wishlist | Purchase issue type with a price property | G9 |
| Monthly saved amount, weight | Not covered yet | G2 |
| Images, Excalidraw | Not covered yet | G5 |

## Gaps to decide

| # | Gap | Evidence | Proposed answer |
| --- | --- | --- | --- |
| G1 | **Habits.** Daily yes/no check-ins and a "good day" rule. | 436 daily notes carry the four flags; 2 of 4 queries depend on them | A Habit issue type that repeats, with one check-in per day. A timer session linked to the habit ticks it automatically ("measure reality"). Good Days becomes a saved query. |
| G2 | **Measurements over time:** weight, money saved per month. | `insights/BTB.md`, `Finance/2024/*` `started`/`saved` | A dated value log on an issue property (each change to a number property is kept as history). Avoids a new primitive and feeds Theme 8 dashboards. |
| G3 | **Saved views:** table and board, filter, group by property. | Obsidian Projects board, all 4 Dataview queries | Add views as a first-class part of Theme 1, as Linear does. Without them issues are just a list. |
| G4 | **Weekly and yearly pages**, not only daily. | 21 weekly, 7 yearly notes; the calendar plugin | Treat the daily page as one case of a periodic page: day, week or year, each optional. |
| G5 | **Attachments and embeds.** | 27 png, 3 jpg, 36 embeds, 13 Excalidraw | Image upload and paste in documents from day one. Excalidraw imports as an image or file for now. |
| G6 | **Inline issues.** A to-do in a document becomes an issue but stays readable in place. | Every checklist in the vault reads as a list in context | The editor renders the issue inline and keeps its status in sync both ways. This needs stable block IDs, so it decides the editor. |
| G7 | **Organising documents.** | `dev/AWS/...`, `dev/Netwroking/...` | Collections (one level of nesting is enough for this vault) plus backlinks |
| G8 | **Canceled status.** | Struck-through goals in 2025 | Statuses per type: Backlog, To do, In progress, Done, Canceled |
| G9 | **Finance** is in the vault but not on the roadmap. | 10 notes | Decide whether it is a Library-style theme (Purchase and Expense issue types) or stays out for now |

## Editor requirements this vault adds

- Vim keybindings
- Right-to-left text and mixed Arabic and English
- Code blocks with highlighting; mermaid
- Paste an image straight into a document
- Markdown in and out, so the importer and any export stay lossless

## What the importer must do

1. Daily, weekly and yearly notes become periodic pages dated from the file name.
2. Drop the template's empty `- [ ]` and empty headings, and skip notes that are only the template.
3. Every real `- [ ]` and `- [x]` becomes an issue linked to its source block; nesting becomes sub-issues; `[completion::]` sets the completion date.
4. Frontmatter habit flags become habit check-ins on that date.
5. Notes in the Beyond the Borders folder become typed issues under one goal, using `status` and the first tag.
6. Yearly Objectives and Goals become visions and goals, with struck-through ones marked Canceled.
7. Everything else becomes a document in a collection that mirrors its folder; wikilinks and embeds become links and attachments.
8. Leave out `dev/AWS/ACCOUNTS` and any key or certificate files. The file names there (`CRED.md`, a `.pem` key, admin CSVs) point to credentials, which belong in a password manager, not Life OS. They were not opened for this inventory.
