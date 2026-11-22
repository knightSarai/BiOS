import {
  prosemirrorToYXmlFragment,
  yXmlFragmentToProseMirrorRootNode,
} from "y-prosemirror"
import type * as Y from "yjs"
import { DexieYProvider } from "y-dexie"
import {
  restoreDrawing,
  type DrawingColor,
  type Shape,
} from "@knight-os/drawing"
import {
  addSeconds,
  now,
  toLocalDate,
  parseUtc,
  startOfDayUtc,
  type UtcDatetime,
} from "@knight-os/server/core"
import type { ActivityStatus } from "@/activities/status"
import type { TimerConfig } from "@/activities/timer"
import { DOCUMENT_FRAGMENT } from "@/editor/document-content"
import { schema } from "@/editor/schema"
import { ActivitiesRepository, type NewActivity } from "@/local-db/activities"
import { ActivityTypesRepository } from "@/local-db/activity-types"
import { AreasRepository } from "@/local-db/areas"
import { getLocalDb, type TimeEntryRow } from "@/local-db/db"
import { GoalsRepository } from "@/local-db/goals"
import type { DailyNoteFormat } from "@/journal/daily-note"
import { notebookContext } from "@/local-db/notebook-queries"
import { contentWritesSettled } from "@/local-db/y-content"
import { ensureDailyNote } from "@/notebook/use-cases"

// Dev only: run from the browser console to see a realistic training block.
// await (await import("/src/dev/seed-workout.ts")).seedWorkout()

type Block = Record<string, unknown>

const text = (value: string, bold = false) =>
  bold
    ? { type: "text", text: value, marks: [{ type: "strong" }] }
    : { type: "text", text: value }
const p = (...parts: (string | ReturnType<typeof text>)[]): Block => ({
  type: "paragraph",
  content: parts.map((part) => (typeof part === "string" ? text(part) : part)),
})
const h = (level: number, value: string): Block => ({
  type: "heading",
  attrs: { level },
  content: [text(value)],
})
const ul = (...items: (string | Block)[]): Block => ({
  type: "bullet_list",
  content: items.map((item) => ({
    type: "list_item",
    content: [typeof item === "string" ? p(item) : item],
  })),
})
const tasks = (...items: [string, boolean][]): Block => ({
  type: "task_list",
  content: items.map(([value, checked]) => ({
    type: "task_item",
    attrs: { checked },
    content: [p(value)],
  })),
})
const mermaid = (code: string): Block => ({
  type: "mermaid",
  content: [text(code.trim())],
})
const quote = (value: string): Block => ({
  type: "blockquote",
  content: [p(value)],
})

// Sketches in the app's own drawing blocks, kept rough so they read as hand-drawn.
type Style = {
  stroke?: DrawingColor
  fill?: DrawingColor | null
  dashed?: boolean
  width?: 1 | 2 | 4
}

const sketch = () => {
  const shapes: Shape[] = []
  const base = (id: string, style: Style) => ({
    id,
    z: shapes.length,
    stroke: style.stroke ?? "foreground",
    width: style.width ?? 2,
    dashed: style.dashed ?? false,
    rough: true,
  })
  const box = (
    id: string,
    kind: "rect" | "ellipse" | "diamond",
    [x, y, w, h]: [number, number, number, number],
    label = "",
    style: Style = {}
  ) => {
    const shape = {
      ...base(id, style),
      kind,
      x,
      y,
      w,
      h,
      fill: style.fill ?? null,
      label,
    }
    shapes.push(shape)
    return shape
  }
  const arrow = (
    id: string,
    from:
      | [number, number]
      | { id: string; x: number; y: number; w: number; h: number },
    to:
      | [number, number]
      | { id: string; x: number; y: number; w: number; h: number },
    label = "",
    style: Style = {}
  ) => {
    const end = (point: typeof from, side: "start" | "end") =>
      Array.isArray(point)
        ? { shapeId: null, x: point[0], y: point[1] }
        : {
            shapeId: point.id,
            x: side === "start" ? point.x + point.w : point.x,
            y: point.y + point.h / 2,
          }
    shapes.push({
      ...base(id, style),
      kind: "arrow",
      start: end(from, "start"),
      end: end(to, "end"),
      label,
    })
  }
  const write = (
    id: string,
    [x, y]: [number, number],
    value: string,
    size: "s" | "m" | "l" = "s",
    style: Style = {}
  ) =>
    shapes.push({ ...base(id, style), kind: "text", x, y, text: value, size })
  const pen = (id: string, points: [number, number][], style: Style = {}) =>
    shapes.push({ ...base(id, style), kind: "pen", points })
  return { shapes, box, arrow, write, pen }
}

const drawing = (drawingId: string, shapes: Shape[]): Block => ({
  type: "drawing",
  attrs: { drawingId, snapshot: JSON.stringify(shapes) },
})

const hitMap = () => {
  const s = sketch()
  s.write("title", [20, 0], "Where I got hit", "m")
  s.box("head", "ellipse", [70, 40, 70, 84])
  s.box("torso", "rect", [40, 136, 130, 160])
  s.box("arm-l", "rect", [10, 140, 26, 120])
  s.box("arm-r", "rect", [174, 140, 26, 120])
  const hits: [number, number][] = [
    [128, 228],
    [140, 240],
    [122, 252],
    [136, 262],
    [148, 222],
    [70, 236],
    [60, 252],
    [100, 200],
    [92, 170],
  ]
  hits.forEach(([x, y], index) =>
    s.box(`hit-${index}`, "ellipse", [x, y, 14, 14], "", {
      stroke: "chart-2",
      fill: "chart-2",
      width: 1,
    })
  )
  s.box("jab", "ellipse", [112, 70, 12, 12], "", {
    stroke: "chart-2",
    fill: "chart-2",
    width: 1,
  })
  s.write("note-body", [250, 210], "Most shots landed\non the body", "s")
  s.arrow("to-liver", [246, 226], [166, 240], "", { stroke: "chart-2" })
  s.write(
    "note-liver",
    [250, 270],
    "Liver side, after\nthrowing the jab",
    "s",
    {
      stroke: "muted",
    }
  )
  s.write("note-head", [250, 70], "Head mostly covered", "s", {
    stroke: "muted",
  })
  s.arrow("to-head", [246, 80], [142, 80], "", {
    stroke: "muted",
    dashed: true,
  })
  return s.shapes
}

const energyCurve = () => {
  const s = sketch()
  s.write("title", [0, 0], "Energy across the rounds", "m")
  s.arrow("y-axis", [40, 250], [40, 40], "", { stroke: "muted" })
  s.arrow("x-axis", [40, 250], [560, 250], "", { stroke: "muted" })
  s.write("y-label", [52, 34], "Energy", "s", { stroke: "muted" })
  ;["Shadow", "R1", "R2", "R3", "R4", "R5", "R6"].forEach((label, index) =>
    s.write(`round-${index}`, [62 + index * 72, 262], label, "s", {
      stroke: "muted",
    })
  )
  s.pen(
    "energy",
    [
      [70, 70],
      [110, 64],
      [140, 72],
      [180, 90],
      [220, 104],
      [250, 126],
      [290, 140],
      [320, 166],
      [360, 178],
      [400, 196],
      [440, 214],
      [480, 228],
      [510, 240],
    ],
    { stroke: "chart-1", width: 4 }
  )
  s.box("empty", "ellipse", [494, 222, 34, 34], "", { stroke: "chart-2" })
  s.write("near-vomit", [400, 110], "Near vomiting", "s", { stroke: "chart-2" })
  s.arrow("to-empty", [450, 132], [506, 220], "", { stroke: "chart-2" })
  s.write("still-there", [170, 40], "Timing and movement\nstill there", "s")
  return s.shapes
}

const bodyCombo = () => {
  const s = sketch()
  s.write("title", [0, 0], "Body-shot drill (heavy bag)", "m")
  const jab = s.box("jab", "rect", [0, 50, 120, 60], "Jab to the head")
  const dip = s.box("dip", "diamond", [160, 40, 120, 80], "Bend the\nknees")
  const left = s.box(
    "left",
    "rect",
    [320, 50, 130, 60],
    "Left hand\nto the body",
    {
      fill: "chart-3",
    }
  )
  const right = s.box(
    "right",
    "rect",
    [490, 50, 130, 60],
    "Right hand\nto the body",
    {
      fill: "chart-2",
    }
  )
  s.arrow("a1", jab, dip)
  s.arrow("a2", dip, left)
  s.arrow("a3", left, right)
  s.box("out", "ellipse", [490, 160, 130, 54], "Pivot out")
  s.arrow("a4", [555, 112], [555, 158])
  s.write(
    "cue",
    [0, 150],
    "Don't lean in. Eyes up,\nchin behind the shoulder.",
    "s",
    {
      stroke: "muted",
    }
  )
  return s.shapes
}

const roadmap = () => {
  const s = sketch()
  s.write("title", [0, 0], "Comeback roadmap", "m")
  const done = { fill: "chart-5" as const }
  const swim = s.box("swim", "rect", [0, 50, 140, 56], "Swimming", done)
  const mobility = s.box(
    "mobility",
    "rect",
    [200, 50, 140, 56],
    "Mobility",
    done
  )
  const resistance = s.box(
    "resistance",
    "rect",
    [400, 50, 140, 56],
    "Resistance",
    done
  )
  s.box("shadow", "rect", [400, 170, 140, 56], "Shadowboxing", done)
  s.box("sparring", "rect", [200, 170, 140, 56], "Sparring\n(now)", {
    fill: "chart-4",
  })
  s.box("running", "rect", [0, 170, 140, 56], "Running\n(next)", {
    dashed: true,
  })
  s.arrow("r1", swim, mobility)
  s.arrow("r2", mobility, resistance)
  s.arrow("r3", [470, 108], [470, 168])
  s.arrow("r4", [398, 198], [342, 198])
  s.arrow("r5", [198, 198], [142, 198], "", { dashed: true })
  s.write(
    "legend",
    [0, 250],
    "Filled green: done · amber: now · dashed: next",
    "s",
    {
      stroke: "muted",
    }
  )
  return s.shapes
}

const writeBody = async (
  table: "activities" | "goals",
  content: Y.Doc,
  title: string,
  blocks: Block[]
) => {
  const drawings = blocks.flatMap((block) => {
    const attrs = block.attrs as
      { drawingId?: string; snapshot?: string } | undefined
    return block.type === "drawing" && attrs?.drawingId && attrs.snapshot
      ? [{ drawingId: attrs.drawingId, snapshot: attrs.snapshot }]
      : []
  })
  const doc = schema.nodeFromJSON({
    type: "doc",
    content: [
      { type: "title", content: [text(title)] },
      ...blocks.map((block) =>
        block.type === "drawing"
          ? { ...block, attrs: { ...(block.attrs as object), snapshot: null } }
          : block
      ),
    ],
  })
  const provider = DexieYProvider.load(content)
  try {
    await provider.whenLoaded
    for (const { drawingId, snapshot } of drawings) {
      restoreDrawing(content, drawingId, snapshot)
    }
    prosemirrorToYXmlFragment(doc, content.getXmlFragment(DOCUMENT_FRAGMENT))
    await contentWritesSettled(getLocalDb(), table)
  } finally {
    DexieYProvider.release(content)
  }
}

type Session = {
  title: string
  type: "boxing" | "strength" | "round" | "exercise" | "set"
  status: ActivityStatus
  day: string
  start?: string
  seconds?: number
  fields?: Record<string, unknown>
  body?: Block[]
  children?: Session[]
}

const round = (
  title: string,
  kind: string,
  day: string,
  status: ActivityStatus,
  focus?: string
): Session => ({
  title,
  type: "round",
  status,
  day,
  fields: { kind, ...(focus ? { focus } : {}) },
})

const sets = (
  exercise: string,
  day: string,
  reps: (number | null)[],
  assistance?: string
): Session[] =>
  reps.map((count, index) => ({
    title: `${exercise} · set ${index + 1}`,
    type: "set",
    status: "done",
    day,
    fields: {
      ...(count === null ? {} : { reps: count }),
      ...(assistance ? { assistance } : {}),
    },
  }))

const sessions: Session[] = [
  {
    title: "First sparring of the comeback",
    type: "boxing",
    status: "done",
    day: "2026-10-31",
    start: "18:34",
    seconds: 66 * 60 + 29,
    fields: { avgHr: 136, maxHr: 188, calories: 722, load: 165, effort: 5 },
    body: [
      p(
        text("First sparring since coming back. ", true),
        "Warm-up, one 5-minute shadow round, then about six 5-minute sparring rounds (~30 min of sparring). Partner was fast, around 65 kg."
      ),
      h(2, "How it felt"),
      ul(
        "Technique, timing and movement are still there.",
        "Conditioning is low. Very tired by the end, close to vomiting in the last round.",
        "Got hit to the body a lot."
      ),
      h(2, "Where the damage came from"),
      drawing("a1b2c3d4e5f60001", hitMap()),
      drawing("a1b2c3d4e5f60002", energyCurve()),
      h(2, "Time in heart-rate zones"),
      mermaid(`
xychart-beta
  title "Minutes per zone (max HR 188)"
  x-axis [Z1, Z2, Z3, Z4, Z5]
  y-axis "Minutes" 0 --> 20
  bar [15.4, 16.5, 14.2, 14.9, 5.4]
`),
      h(2, "Garmin"),
      ul(
        "1:06:29, avg HR 136, max HR 188, 722 kcal",
        "Aerobic TE 3.7, anaerobic TE 2.7 (Tempo), load 165",
        "Body Battery −8"
      ),
      h(2, "Next time"),
      tasks(
        ["Elbows tight, cover the body on exits", false],
        ["Pace the first two rounds", false],
        ["Book the next sparring with the same partner", false]
      ),
    ],
    children: [
      round("Warm-up", "Warm-up", "2026-10-31", "done"),
      round("Shadow round", "Shadowboxing", "2026-10-31", "done"),
      ...[1, 2, 3, 4, 5, 6].map((index) =>
        round(
          `Sparring round ${index}`,
          "Sparring",
          "2026-10-31",
          "done",
          index === 6 ? "Emptied the tank, near vomiting" : undefined
        )
      ),
    ],
  },
  {
    title: "Bodyweight strength",
    type: "strength",
    status: "done",
    day: "2026-11-02",
    start: "15:37",
    seconds: 52 * 60 + 19,
    fields: { avgHr: 105, maxHr: 133, calories: 340, load: 10, effort: 5 },
    body: [
      p("Warm-up, then 3 sets each to max."),
      quote(
        "Garmin counted 17 sets / 133 reps, but it mislabels the exercises (‘deadlift’, ‘sit-up’), so per-exercise reps are unreliable. It tagged the pull-ups as 3 sets / 21 reps."
      ),
      h(2, "Garmin"),
      ul("52:19, avg HR 105, max HR 133, 340 kcal", "Aerobic TE 1.0, load 10"),
    ],
    children: [
      {
        title: "Pull-ups",
        type: "exercise",
        status: "done",
        day: "2026-11-02",
        children: sets("Pull-ups", "2026-11-02", [8, 7, 6]),
      },
      {
        title: "Dips",
        type: "exercise",
        status: "done",
        day: "2026-11-02",
        children: sets("Dips", "2026-11-02", [null, null, null]),
      },
      {
        title: "Australian rows",
        type: "exercise",
        status: "done",
        day: "2026-11-02",
        children: sets("Australian rows", "2026-11-02", [null, null, null]),
      },
      {
        title: "Push-ups",
        type: "exercise",
        status: "done",
        day: "2026-11-02",
        children: sets("Push-ups", "2026-11-02", [null, null, null]),
      },
      {
        title: "Ab wheel rollouts",
        type: "exercise",
        status: "done",
        day: "2026-11-02",
        children: sets("Ab wheel rollouts", "2026-11-02", [null, null, null]),
      },
    ],
  },
  {
    title: "Technique and bag work",
    type: "boxing",
    status: "done",
    day: "2026-11-03",
    start: "18:00",
    seconds: 67 * 60,
    fields: { avgHr: 123, maxHr: 153, load: 43, effort: 3 },
    body: [
      p(
        "All rounds 5 minutes. Focus on the body: left hand to the body, right hand to the body."
      ),
      h(2, "Round time by drill"),
      mermaid(`
pie showData
  title Minutes by drill
  "Boxing school" : 20
  "Shadowboxing" : 10
  "Heavy bag" : 10
  "Double-end bag" : 5
`),
      h(2, "The drill"),
      drawing("a1b2c3d4e5f60003", bodyCombo()),
      h(2, "Session flow"),
      mermaid(`
flowchart LR
  A[Boxing school<br/>4 x 5 min] --> B[Shadowboxing<br/>2 x 5 min]
  B --> C[Heavy bag<br/>2 x 5 min]
  C --> D[Double-end bag<br/>1 x 5 min]
`),
      h(2, "Garmin"),
      ul("67 min, avg HR 123, max HR 153, load 43"),
    ],
    children: [
      ...[1, 2, 3, 4].map((index) =>
        round(`Boxing school ${index}`, "Boxing school", "2026-11-03", "done")
      ),
      round("Shadow 1", "Shadowboxing", "2026-11-03", "done"),
      round("Shadow 2", "Shadowboxing", "2026-11-03", "done"),
      round(
        "Heavy bag 1",
        "Heavy bag",
        "2026-11-03",
        "done",
        "Left hand to the body"
      ),
      round(
        "Heavy bag 2",
        "Heavy bag",
        "2026-11-03",
        "done",
        "Right hand to the body"
      ),
      round("Double-end bag", "Double-end bag", "2026-11-03", "done"),
    ],
  },
  {
    title: "Bodyweight strength",
    type: "strength",
    status: "done",
    day: "2026-11-06",
    start: "16:00",
    seconds: 38 * 60,
    fields: { avgHr: 94, effort: 4 },
    body: [
      p("Self-reported, approximate reps. Garmin counted 15 sets / 86 reps."),
      h(2, "Reps per set"),
      mermaid(`
xychart-beta
  title "Reps per set"
  x-axis ["Set 1", "Set 2", "Set 3"]
  y-axis "Reps" 0 --> 22
  line [8, 8, 8]
  line [6, 6, 6]
  line [20, 8, 8]
`),
      p("Lines: band-assisted chin-ups, dips, push-ups."),
    ],
    children: [
      {
        title: "Band-assisted chin-ups",
        type: "exercise",
        status: "done",
        day: "2026-11-06",
        children: sets("Chin-ups", "2026-11-06", [8, 8, 8], "Band"),
      },
      {
        title: "Dips",
        type: "exercise",
        status: "done",
        day: "2026-11-06",
        children: sets("Dips", "2026-11-06", [6, 6, 6]),
      },
      {
        title: "Straight-arm chin-ups",
        type: "exercise",
        status: "done",
        day: "2026-11-06",
        children: sets("Straight-arm chin-ups", "2026-11-06", [10, 10, 10]),
      },
      {
        title: "Push-ups",
        type: "exercise",
        status: "done",
        day: "2026-11-06",
        children: sets("Push-ups", "2026-11-06", [20, 8, 8]),
      },
      {
        title: "Wall slides",
        type: "exercise",
        status: "done",
        day: "2026-11-06",
      },
    ],
  },
  {
    title: "Sparring",
    type: "boxing",
    status: "todo",
    day: "2026-11-08",
    body: [
      p("Second sparring. Same plan, pace the first rounds."),
      tasks(["Gumshield", false], ["16 oz gloves", false], ["Headgear", false]),
    ],
    children: [
      round("Warm-up", "Warm-up", "2026-11-08", "todo"),
      round("Shadow round", "Shadowboxing", "2026-11-08", "todo"),
      ...[1, 2, 3, 4, 5, 6].map((index) =>
        round(`Sparring round ${index}`, "Sparring", "2026-11-08", "todo")
      ),
    ],
  },
  {
    title: "Bodyweight strength",
    type: "strength",
    status: "todo",
    day: "2026-11-09",
  },
  {
    title: "Technique and bag work",
    type: "boxing",
    status: "todo",
    day: "2026-11-10",
  },
  {
    title: "Bodyweight strength",
    type: "strength",
    status: "todo",
    day: "2026-11-11",
  },
  {
    title: "Pads and conditioning",
    type: "boxing",
    status: "todo",
    day: "2026-11-12",
  },
]

const goalBody: Block[] = [
  p(
    "Back to boxing at NXT Albion after a long break. Build conditioning first, then sparring, then running."
  ),
  drawing("a1b2c3d4e5f60004", roadmap()),
  h(2, "Weekly schedule"),
  ul("Strength: Fri, Mon, Wed", "Boxing: Sun, Tue, Thu (sparring has started)"),
  h(2, "Return plan (Oct 2025)"),
  tasks(
    ["Swimming", true],
    ["Mobility", true],
    ["Resistance training", true],
    ["Shadowboxing", true],
    ["Running", false]
  ),
  h(2, "Average heart rate by session"),
  mermaid(`
xychart-beta
  title "Avg HR (bpm)"
  x-axis ["31 Oct", "2 Nov", "3 Nov", "6 Nov"]
  y-axis "bpm" 80 --> 140
  bar [136, 105, 123, 94]
  line [136, 105, 123, 94]
`),
  h(2, "Running history"),
  mermaid(`
xychart-beta
  title "Kilometres run"
  x-axis ["Nov–Dec 2014", "2015", "2014–2017 total"]
  y-axis "km" 0 --> 1500
  bar [166, 500, 1382]
`),
  ul(
    "University years: often ran carrying a bag with gear and books, which may be linked to later health problems.",
    "PB 1 km: 2:14. Not confirmed in Nike data; fastest GPS 1 km split is 3:40 (18 Nov 2014).",
    "PB 5 km: ~18:00. Not confirmed in Nike data; fastest GPS 5 km is 23:10 (8 Sep 2018)."
  ),
]

type OpenWorkspace = {
  id: string
  settings: { timezone: string } & DailyNoteFormat
}

// The workspace open in this tab, read from the router so the seed lands where you're looking.
const openWorkspace = () => {
  const router = (
    globalThis as {
      __TSR_ROUTER__?: {
        state: { matches: { context?: { workspace?: OpenWorkspace } }[] }
      }
    }
  ).__TSR_ROUTER__
  const workspace = router?.state.matches
    .map((match) => match.context?.workspace)
    .find((candidate) => candidate !== undefined)
  if (!workspace)
    throw new Error("Open a workspace page first, then run the seed.")
  return workspace
}

const seedWorkout = async () => {
  const db = getLocalDb()
  const open = openWorkspace()
  const workspace = open.id
  const timezone = open.settings.timezone
  const ctx = { workspaceId: workspace }
  const areas = new AreasRepository(db, ctx)
  const types = new ActivityTypesRepository(db, ctx)
  const activities = new ActivitiesRepository(db, ctx)
  const goals = new GoalsRepository(db, ctx)

  const area =
    (await db.areas.where("workspaceId").equals(workspace).first()) ??
    (await areas.ensureDefault("Training"))

  type MadeType = {
    id: string
    ids: Record<string, string>
    options: Record<string, Record<string, string>>
  }

  // A subtype also answers to its parent's field keys, since it inherits those fields.
  const makeType = async (
    name: string,
    color: "chart-1" | "chart-2" | "chart-3" | "chart-4" | "chart-5",
    timer: TimerConfig,
    fields: {
      key: string
      name: string
      kind: "number" | "rating" | "text" | "choice"
      options?: string[]
    }[],
    parent?: MadeType
  ): Promise<MadeType> => {
    const type = await types.create({ name, color, parentId: parent?.id })
    await types.update(type.id, { timer })
    const ids: Record<string, string> = { ...parent?.ids }
    const options: Record<string, Record<string, string>> = {
      ...parent?.options,
    }
    for (const field of fields) {
      const existing = (await types.library()).find(
        (candidate) => candidate.name === field.name
      )
      if (existing) await types.linkField(type.id, existing.id)
      const row = existing ?? (await types.addField(type.id, field))
      ids[field.key] = row.id
      options[field.key] = Object.fromEntries(
        row.options.map((option) => [option.label, option.id])
      )
    }
    return { id: type.id, ids, options }
  }

  const sessionFields = [
    { key: "avgHr", name: "Avg HR", kind: "number" as const },
    { key: "maxHr", name: "Max HR", kind: "number" as const },
    { key: "calories", name: "Calories", kind: "number" as const },
    { key: "load", name: "Training load", kind: "number" as const },
    { key: "effort", name: "Effort", kind: "rating" as const },
  ]
  const workout = await makeType(
    "Workout",
    "chart-1",
    { mode: "up", sound: "none" },
    sessionFields
  )
  const typeIds = {
    boxing: await makeType(
      "Boxing",
      "chart-1",
      { mode: "up", sound: "bell" },
      [],
      workout
    ),
    strength: await makeType(
      "Strength",
      "chart-2",
      { mode: "up", sound: "none" },
      [],
      workout
    ),
    round: await makeType(
      "Round",
      "chart-3",
      { mode: "down", seconds: 300, sound: "bell" },
      [
        {
          key: "kind",
          name: "Drill",
          kind: "choice",
          options: [
            "Warm-up",
            "Shadowboxing",
            "Sparring",
            "Boxing school",
            "Heavy bag",
            "Double-end bag",
          ],
        },
        { key: "focus", name: "Focus", kind: "text" },
      ]
    ),
    exercise: await makeType(
      "Exercise",
      "chart-4",
      { mode: "up", sound: "none" },
      []
    ),
    set: await makeType(
      "Set",
      "chart-5",
      { mode: "down", seconds: 90, sound: "beep" },
      [
        { key: "reps", name: "Reps", kind: "number" },
        {
          key: "assistance",
          name: "Assistance",
          kind: "choice",
          options: ["None", "Band"],
        },
      ]
    ),
  }

  const goalId = await goals.create("Fight-ready comeback")
  await db.goals.update(goalId, { status: "in-progress" })
  const goal = await db.goals.get(goalId)
  if (goal) await writeBody("goals", goal.content, goal.title, goalBody)

  const at = (day: string, time = "12:00") => {
    const [hours = 0, minutes = 0] = time.split(":").map(Number)
    return addSeconds(
      parseUtc(startOfDayUtc(day, timezone)),
      hours * 3600 + minutes * 60
    )
  }

  const insert = async (session: Session, parentId: string | null) => {
    const type = typeIds[session.type]
    const fields = Object.fromEntries(
      Object.entries(session.fields ?? {}).map(([key, value]) => [
        type.ids[key],
        typeof value === "string" && type.options[key]?.[value]
          ? type.options[key][value]
          : value,
      ])
    )
    const id = crypto.randomUUID()
    const activity: NewActivity = {
      id,
      areaId: area.id,
      goalId: parentId === null ? goalId : null,
      parentId,
      typeId: type.id,
      fields,
      dueDate: parentId === null ? session.day : null,
      title: session.title,
      status: session.status,
      origin: null,
    }
    await activities.createMany([activity])
    const stamp: UtcDatetime = at(session.day, session.start)
    const finished =
      session.seconds === undefined ? stamp : addSeconds(stamp, session.seconds)
    await db.activities.update(id, {
      createdAt: session.status === "done" ? stamp : at("2026-11-07", "20:00"),
      updatedAt:
        session.status === "done" ? finished : at("2026-11-07", "20:00"),
      completedAt: session.status === "done" ? finished : null,
    })
    if (session.seconds !== undefined) {
      const entry: TimeEntryRow = {
        id: crypto.randomUUID(),
        workspaceId: workspace,
        activityId: id,
        startedAt: stamp,
        endedAt: finished,
        source: "timer",
        recording: "recorded",
      }
      await db.timeEntries.add(entry)
    }
    if (session.body) {
      const row = await db.activities.get(id)
      if (row)
        await writeBody("activities", row.content, session.title, session.body)
    }
    for (const child of session.children ?? []) await insert(child, id)
  }

  for (const session of sessions) await insert(session, null)
  return { workspaceId: workspace, goalId, sessions: sessions.length }
}

const gamePlan = () => {
  const s = sketch()
  s.write("title", [0, 0], "Game plan", "m")
  s.box("ring", "rect", [0, 44, 360, 300], "", { stroke: "muted", width: 4 })
  const me = s.box("me", "ellipse", [70, 220, 56, 56], "Me", {
    stroke: "chart-5",
    fill: "chart-5",
  })
  const partner = s.box(
    "partner",
    "ellipse",
    [230, 120, 56, 56],
    "65 kg\nfast",
    {
      stroke: "chart-2",
      fill: "chart-2",
    }
  )
  s.arrow("jab", me, partner, "jab", { stroke: "chart-5" })
  s.pen(
    "circle-left",
    [
      [98, 290],
      [70, 300],
      [40, 280],
      [30, 240],
      [40, 200],
      [66, 176],
    ],
    { stroke: "chart-4", dashed: true }
  )
  s.write("circle-note", [20, 306], "Circle left, away\nfrom his right", "s", {
    stroke: "chart-4",
  })
  s.write("rule-1", [400, 70], "1. Jab, then exit at an angle", "s")
  s.write("rule-2", [400, 110], "2. Elbows tight on every exit", "s")
  s.write("rule-3", [400, 150], "3. Body shot only after a jab lands", "s")
  s.write("rule-4", [400, 190], "4. Rounds 1-2 at 70%", "s")
  s.box(
    "stop",
    "diamond",
    [400, 240, 210, 90],
    "Gassed?\nClinch, breathe,\nreset",
    {
      stroke: "chart-2",
    }
  )
  return s.shapes
}

const todayBlocks: Block[] = [
  h(1, "Sparring day #2"),
  quote("It's six rounds, not one. Pace the first two, and win the last two."),
  drawing("a1b2c3d4e5f60005", gamePlan()),
  h(2, "The day"),
  mermaid(`
gantt
  title Sunday
  dateFormat HH:mm
  axisFormat %H:%M
  section Fuel
  Lunch, carbs and protein :done, 12:30, 45m
  Water, little and often  :active, 13:15, 285m
  Light snack              :16:30, 15m
  section Session
  Warm-up                  :crit, 18:00, 15m
  Shadow round             :18:15, 5m
  Sparring 6 x 5 min       :crit, 18:20, 35m
  Cool-down and stretch    :18:55, 15m
  section Recovery
  Protein shake            :19:15, 15m
  Log the session          :19:30, 15m
`),
  h(2, "Heart rate: last time vs target"),
  mermaid(`
xychart-beta
  title "Minutes per zone"
  x-axis [Z1, Z2, Z3, Z4, Z5]
  y-axis "Minutes" 0 --> 20
  bar [15.4, 16.5, 14.2, 14.9, 5.4]
  line [10, 18, 18, 12, 3]
`),
  p(
    text("Bars: ", true),
    "31 Oct sparring. ",
    text("Line: ", true),
    "today's target, less time in Z5 by pacing the early rounds."
  ),
  h(2, "Bag"),
  tasks(
    ["Gumshield", false],
    ["16 oz gloves and wraps", false],
    ["Headgear", false],
    ["Water bottle", false],
    ["Garmin charged", false]
  ),
  h(2, "After"),
  tasks(
    ["Log rounds and RPE on the Sparring activity", false],
    ["Note where I got hit", false]
  ),
]

// Appends a sparring-day plan to today's daily note, keeping what is already there.
const decorateToday = async () => {
  const db = getLocalDb()
  const open = openWorkspace()
  const today = toLocalDate(now(), open.settings.timezone)
  const documentId = await ensureDailyNote(
    notebookContext(open.id),
    today,
    open.settings
  )
  const row = await db.documents.get(documentId)
  if (!row) throw new Error("Today's note couldn't be created.")
  const provider = DexieYProvider.load(row.content)
  try {
    await provider.whenLoaded
    const fragment = row.content.getXmlFragment(DOCUMENT_FRAGMENT)
    const existing = yXmlFragmentToProseMirrorRootNode(
      fragment,
      schema
    ).toJSON() as {
      content?: Block[]
    }
    const kept = (existing.content ?? []).filter(
      (block, index) =>
        index === 0 || !(block.type === "paragraph" && !block.content)
    )
    for (const block of todayBlocks) {
      const attrs = block.attrs as
        { drawingId?: string; snapshot?: string } | undefined
      if (block.type === "drawing" && attrs?.drawingId && attrs.snapshot) {
        restoreDrawing(row.content, attrs.drawingId, attrs.snapshot)
      }
    }
    const doc = schema.nodeFromJSON({
      type: "doc",
      content: [
        ...kept,
        ...todayBlocks.map((block) =>
          block.type === "drawing"
            ? {
                ...block,
                attrs: { ...(block.attrs as object), snapshot: null },
              }
            : block
        ),
      ],
    })
    prosemirrorToYXmlFragment(doc, fragment)
    await contentWritesSettled(db, "documents")
  } finally {
    DexieYProvider.release(row.content)
  }
  return { documentId, date: today }
}

// Rewrites the seeded bodies in the open workspace, for data seeded before a body changed.
const redrawWorkout = async () => {
  const db = getLocalDb()
  const workspaceId = openWorkspace().id
  let updated = 0
  for (const session of sessions) {
    if (!session.body) continue
    const row = await db.activities
      .where("workspaceId")
      .equals(workspaceId)
      .filter(
        (activity) =>
          activity.parentId === null &&
          activity.title === session.title &&
          activity.dueDate === session.day
      )
      .first()
    if (!row) continue
    await writeBody("activities", row.content, session.title, session.body)
    updated += 1
  }
  const goal = await db.goals
    .filter(
      (row) =>
        row.workspaceId === workspaceId && row.title === "Fight-ready comeback"
    )
    .first()
  if (goal) {
    await writeBody("goals", goal.content, goal.title, goalBody)
    updated += 1
  }
  return { updated }
}

export { decorateToday, redrawWorkout, seedWorkout }
