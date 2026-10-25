# Activities and documents: discovery

Draft, 2026-10-25. Inputs: a hands-on session in a Linear test document, the knight-os prototype artifact, the Life OS vision, and [obsidian-inventory.md](obsidian-inventory.md).

**Summary:** Linear gets the writing feel right and gets the link between documents and issues half right. Turning text into an issue takes one click and leaves a live chip behind. But the checkbox and the issue drift apart, the issue never learns which document it came from, and sub-issues show up twice. "Write in documents, execute with activities" depends on exactly those three seams. knight-os should copy Linear's editor feel and fix the seams. The 12 decisions at the end need your call before we build.

## How the pieces relate

```
Document ──contains──▶ activity block    a checklist line that is a live activity
Document ──mentions──▶ activity, document an inline chip, typed with @
Activity ──body──────▶ document          same editor, same blocks
Activity ──documents─▶ documents         attached plans, notes, references
Any item ◀─backlinks── wherever it is mentioned or was created
```

People and the agent work the same way: ideas and plans go in documents, and activities hold the work. One block model serves daily pages, plain documents and activity bodies.

## What Linear does (tested 2026-10-25)

### Writing

| Behaviour | What happens | knight-os |
| --- | --- | --- |
| Markdown shortcuts | `## `, `- `, `[] `, `**bold**` and `` `code` `` convert as you type. An empty line exits a list. | Keep |
| Slash menu | H1–H3, bulleted, numbered, checklist, media, files, code block, diagram, LaTeX, collapsible section, quote. Filtering also shows table, divider and create sub-document. Most items have a shortcut. | Keep the core set. Defer media, LaTeX and table. |
| Selection toolbar | Block type; bold, italic, strike, underline; link, quote, collapsible, inline code, code block, list type; then **create issue**, ask agent, comment. | Keep. On mobile it needs another place (see Mobile). |
| Block handles | Drag to reorder. A heading's menu offers *Copy link* (deep link to the heading) and *Make collapsible*. | Keep |
| @ mentions | One search across people, projects, issues and documents, grouped by type. | Keep, without people |
| Same editor everywhere | An issue description uses the same editor, menus and toolbar as a document. | Keep: this is "the body of an activity is a document". |

### Converting text to issues

| Behaviour | What happens | knight-os |
| --- | --- | --- |
| One line | *Create issue from selection* (Ctrl Shift O). No dialog: the text becomes a chip (status icon, ID, title), and a toast confirms with follow-up actions. | Keep the one-click feel |
| Several lines | The button becomes *Convert list to issues*, one per line. | Keep |
| Inside an issue | The button becomes *Convert list to sub-issues*. | Keep: the action follows context. |
| Defaults | New issues land in Backlog with no project, even when the document lives in a project. | **Change:** inherit area and project from the document |
| Chip | Hover shows ID, title and status. The status updates live in the document. | Keep |
| Checkbox | The checkbox stays next to the chip as separate state. Ticked POS-21 stayed in Backlog; POS-22 set to Done stayed unticked. | **Change:** one control (D2) |
| Origin | The new issue doesn't link back. Its activity log only says "created the issue". | **Change:** record the origin and show backlinks |
| Sub-issues | A checklist converted inside an issue shows twice: as chips in the description and in the Sub-issues list, in a different order. | **Change:** one place (D4) |
| Opening | Clicking a chip leaves the document for the issue page. | **Change:** a peek panel (D8) |

### Organising and history

| Behaviour | What happens | knight-os |
| --- | --- | --- |
| Home | A document has exactly one home: a team, a project or an initiative (*Move to*). | Adapt to area, project, goal, activity or none (D10) |
| Documents list | A table grouped by home, with Created, Last edited and Owner columns, plus filter and display options. | Keep, grouped by home |
| Issue ↔ document | An issue can't hold a document, only a mention in its text or a URL. | **Change:** a real attachment (D6) |
| History | Snapshots grouped by day, with Restore. *Show author names* highlights who wrote what. | Keep. Agent edits must show up this way. |
| Export | Copy content as Markdown; download as Markdown or PDF. | Keep Markdown in and out (the importer needs it) |

### A hazard to avoid

Pressing Escape in the slash menu also took focus out of the editor. The next letters I typed ran global shortcuts: a create-issue dialog opened and the page jumped to my profile. In knight-os, Escape inside the editor only closes menus. Global single-key shortcuts never fire while the cursor was just in a document.

## Proposed experience

### 1. Writing

- Blocks for v0: paragraph, H1–H3, bulleted, numbered, checklist, quote, code block, divider, collapsible section. Marks: bold, italic, strike, inline code, link.
- Markdown shortcuts, the slash menu and the selection toolbar as in Linear. Each block gets a handle for drag and actions.
- Every block has a stable ID from the start. Deep links to blocks, activity origins, backlinks and agent edits all depend on it (obsidian-inventory G6).
- Mixed Arabic and English: each block picks its direction from its first strong character.

### 2. Turning text into activities

Three ways in, all with one outcome:

1. **Select and convert:** select lines, then press Mod Shift O or the toolbar button. Each line becomes an activity block.
2. **Checklist line:** type `[] Book a sparring session`. Whether that becomes an activity immediately depends on the document (D3).
3. **Inline mention:** type `@` and pick an existing activity, or choose *Create "…"* to make one without leaving the line.

What the user sees on a daily page:

```
Before                               After converting
[ ] Book a sparring session          ◌ Book a sparring session        HLT-32
[ ] Weekly weigh-in                  ◌ Weekly weigh-in        Sun 25  HLT-34
```

A toast says *2 activities created* and offers undo, plus quick-set for project and due date. New activities take the area and project of the document's home. When a converted line is nested under an activity block, it becomes that activity's sub-activity.

### 3. Activity blocks

An activity block is a checklist line that **is** the activity. It has no separate checkbox:

- The leading icon is the status (the prototype's pie icon). Tap to tick: Done. Tap again: back to the status it had before. Long-press or right-click opens the status picker.
- Editing the line's text renames the activity, and renaming the activity anywhere updates the line.
- Ticking it in *My activities* ticks it here. The prototype already promises this: "Tick it here or in My activities; both stay in step."
- Canceled shows struck through, and In progress shows the half pie.
- The ID and due date sit faded on the right. They show on hover on desktop and always on mobile.
- Deleting the line asks whether to delete the activity or only remove it from the document. The default keeps the activity.

### 4. The activity page: the body is a document

```
HLT-32  Book a sparring session                         ┃ Status   To do
                                                        ┃ Area     Health
Light technical sparring only.                          ┃ Project  Boxing fundamentals
◌ Ask coach for a partner              HLT-36           ┃ Due      Wed 28 Oct
◌ Pack gloves and headgear             HLT-37           ┃
                                                        ┃ Documents
Notes from the last session...                          ┃   Boxing plan
                                                        ┃   + Attach document
Origin   Written on the daily page, Sat 24 Oct           ┃
Mentioned in   Boxing plan · Daily page 26 Oct           ┃ Timer   ▶
```

- The body uses the full editor, the same as any document.
- Activity blocks in the body are its sub-activities (D4).
- *Origin* links to the exact block the activity was written in.
- *Mentioned in* lists every document that holds a chip or block for this activity.

### 5. Attaching documents to an activity

- *Attach document* in the side panel searches existing documents or creates one ("Boxing plan").
- Mentioning a document in the activity body attaches it too. Removing the mention keeps the attachment, which you remove on purpose.
- The document shows the link from its side: *Attached to HLT-32*.

### 6. Finding things

- **Quick switcher (Mod K):** documents and activities by title or ID (`HLT-32`), with recent items first.
- **Documents list:** grouped by home (area, project, goal), sorted by last edited, filterable by area. Daily pages are hidden unless you ask for them.
- **Backlinks** at the foot of every document and activity.
- **@ search** uses the same index as the quick switcher.

### 7. The agent

- The agent edits documents through the same block operations a person uses. Its edits show in history and in the author-name view as "Agent".
- **Planning:** the agent writes a plan document and adds *proposed* activity blocks, drawn dashed and labelled Proposed. You accept one, or all at once. Accepted blocks become activities with the origin "Proposed by the agent in Boxing plan" (D9).
- **Tracking:** a plan document full of activity blocks is a live tracker by itself. A line at the top can read "4 of 9 done". The agent reads progress from the same blocks, with no separate tracking structure.

### 8. Mobile

- iOS and Android selection menus cover a floating toolbar. Formatting and *Convert to activity* therefore go in a bar docked above the keyboard.
- The slash menu works the same way and opens as a sheet.
- Tapping a chip opens a bottom sheet with status, due date and project. Swiping up opens the full activity.
- Tap the status icon to tick it. Long-press opens the status picker. Drag a block with a long-press on its handle.
- Touch targets are 44 px; the prototype already does this below 760 px.

## Decisions for you

Each decision gives its options with an example. "Lean" marks my suggestion; the choice is yours.

### D1. Editor foundation

- **A. Fully in-house:** our own contenteditable handling, model and rendering. Total control. The cost is input edge cases, each of which takes weeks: Android keyboards composing words, Arabic and RTL cursor movement, IME, clipboard, undo, vim mode.
- **B. ProseMirror as the engine, everything visible in-house.** We write the schema, blocks, chips, menus, toolbar, peek and mobile bar. ProseMirror supplies the model, the transactions and the input handling. It has no UI of its own, so it doesn't limit the experience. Linear's editor is ProseMirror (its editable element has the `ProseMirror` class), and every behaviour above is a plugin on it. *Lean.*
- **C. Lexical:** similar to B and more React-oriented, but with a weaker story for collaboration and sync.

### D2. What a converted line becomes

- **A. Chip:** the text is replaced by a chip (Linear).
- **B. Marker:** the text stays and gets a small linked status marker. The text and the activity title can diverge.
- **C. Activity block:** the line is the activity, and its icon is the status (section 3). Inline `@` mentions stay chips. *Lean.*

### D3. When a checklist line becomes an activity

- **A. Always:** every `[] ` line becomes an activity once you leave the line.
- **B. Never automatically:** only by convert.
- **C. Per document:** daily pages convert automatically (Theme 2: "To-dos written on a daily page automatically become activities"), other documents only by convert, and a document can opt in. *Lean.*

### D4. Sub-activities: body or list

- **A. The body is the source.** Sub-activities are the activity blocks in the body. *+ Add sub-activity* appends a block, and the agent adds sub-activities by editing the body. There is one place and one order. *Lean.*
- **B. A separate list, as in Linear.** Chips in the body and a Sub-activities list, kept in sync. This shows the same thing twice.
- **C. List only:** converting moves the lines out of the body into the list.

### D5. What the activity body is

- **A. An owned document:** the same document type and storage, with `owner: activity`. It is searchable but stays out of the Documents list. It can be split out into a standalone document later. *Lean.*
- **B. A plain description field** using the same editor, but not a document (no history, no backlinks of its own).

### D6. Attaching documents to activities

- **A. A many-to-many link** shown in the side panel; a mention in the body attaches automatically. *Lean.*
- **B. Embedding** the attached document inside the body. This is heavier and could come after A.

### D7. Where new activities land

- **A. Inherit from the document's home** (area, project), and nest under the parent activity block. *Lean.*
- **B. Always go to the default area with no project**, like Linear's Backlog.
- **C. Ask each time** with a small popover. This is slower and goes against "as low friction as pen and paper".

### D8. Opening an activity from a document

- **A. Peek:** a side panel on desktop and a bottom sheet on mobile, with *Open full page*. *Lean.*
- **B. Navigate** to the activity page (Linear).

### D9. Activities the agent creates

- **A. Direct:** the agent creates activities straight away.
- **B. Proposed:** the agent writes proposed blocks and you accept them. *Lean.* This keeps trust while the agent is new, and the data model only needs a flag.

### D10. Document homes

- **A. One home:** an area, project, goal or activity, or none (loose). *Lean.*
- **B. Collections or folders** too (obsidian-inventory G7). This could come after A.

### D11. Local storage for the prototype

- **A. Raw IndexedDB** through a small wrapper.
- **B. Dexie** over IndexedDB, behind repository functions shaped like the future server API. TanStack Query reads through them, so the rule "server state via TanStack Query" holds. *Lean.*
- **C. localStorage:** limited to about 5 MB and synchronous. It doesn't scale to documents.

### D12. Sync readiness

- **A. Store ProseMirror JSON now** and move to a CRDT when sync arrives (a migration later).
- **B. Store documents as Yjs from day one,** locally through IndexedDB. There is no migration later, and agent edits merge cleanly with yours even while you type. *Lean* if D1 is B.

## Suggested build order in apps/web

1. **Editor core:** blocks, marks, markdown shortcuts, slash menu, selection toolbar, drag handles, local persistence. Desktop and mobile.
2. **Activity blocks:** convert, two-way status, rename sync, the `@` chip, the peek panel.
3. **Activity page:** the body document, sub-activities in the body, attached documents, origin and backlinks.
4. **Finding things:** the quick switcher, the Documents list, backlinks.
5. **Agent proposals:** proposed blocks, accept, attribution in history.

Each step ships with tests. Pure logic (status mapping, conversion, markdown in and out) gets unit tests, and each flow gets an end-to-end test.
