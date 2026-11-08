import type { Mermaid, MermaidConfig } from "mermaid"

type DiagramTheme = "light" | "dark"

type RenderedDiagram =
  { ok: true; light: string; dark: string } | { ok: false; error: string }

const fontFamily = '"Inter Variable", Inter, system-ui, sans-serif'

// The --chart-1…5 colours from styles.css, the same in light and dark.
const chartColors = ["#b98ac0", "#d27f9b", "#7e9cd8", "#d9a441", "#5fb3a6"]

const chartVariables = (text: string, line: string, background: string) => ({
  // Mermaid fills pie6–pie12 from the greys otherwise, so the palette repeats.
  ...Object.fromEntries(
    Array.from({ length: 12 }, (_, index) => [
      `pie${index + 1}`,
      chartColors[index % chartColors.length],
    ])
  ),
  pieOpacity: "1",
  pieStrokeColor: background,
  pieOuterStrokeColor: background,
  pieSectionTextColor: "#201e1f",
  pieTitleTextColor: text,
  pieLegendTextColor: text,
  xyChart: {
    backgroundColor: background,
    titleColor: text,
    dataLabelColor: text,
    legendTextColor: text,
    xAxisTitleColor: text,
    xAxisLabelColor: text,
    xAxisTickColor: line,
    xAxisLineColor: line,
    yAxisTitleColor: text,
    yAxisLabelColor: text,
    yAxisTickColor: line,
    yAxisLineColor: line,
    plotColorPalette: chartColors.join(","),
  },
})

// Mermaid's theming only understands hex colours, so these mirror styles.css.
const themeVariables = {
  light: {
    background: "#ffffff",
    primaryColor: "#f1eef0",
    primaryTextColor: "#2c2c2c",
    primaryBorderColor: "#cfc9cc",
    secondaryColor: "#f3f4f4",
    tertiaryColor: "#fbfafa",
    lineColor: "#5c575a",
    edgeLabelBackground: "#ffffff",
    noteBkgColor: "#f2e4ea",
    noteBorderColor: "#d27f9b",
    noteTextColor: "#2c2c2c",
    fontFamily,
    fontSize: "14px",
    ...chartVariables("#2c2c2c", "#5c575a", "#ffffff"),
  },
  dark: {
    darkMode: true,
    background: "#201e1f",
    primaryColor: "#2c2c2c",
    primaryTextColor: "#f3f4f4",
    primaryBorderColor: "#4a4548",
    secondaryColor: "#2a2729",
    tertiaryColor: "#262324",
    lineColor: "#b3aeb1",
    edgeLabelBackground: "#201e1f",
    noteBkgColor: "#3b2235",
    noteBorderColor: "#853953",
    noteTextColor: "#f3f4f4",
    fontFamily,
    fontSize: "14px",
    ...chartVariables("#f3f4f4", "#b3aeb1", "#201e1f"),
  },
} satisfies Record<DiagramTheme, MermaidConfig["themeVariables"]>

const configFor = (theme: DiagramTheme): MermaidConfig => ({
  startOnLoad: false,
  securityLevel: "strict",
  suppressErrorRendering: true,
  // SVG text instead of HTML labels, so native SVG renderers can draw previews.
  htmlLabels: false,
  fontFamily,
  theme: "base",
  themeVariables: themeVariables[theme],
})

let mermaidModule: Promise<Mermaid> | undefined

const loadMermaid = () => {
  mermaidModule ??= import("mermaid").then(
    (module) => module.default,
    (error: unknown) => {
      mermaidModule = undefined
      throw error
    }
  )
  return mermaidModule
}

// initialize() is global, so each render's initialize + render pair must not
// interleave with another diagram's.
let queue: Promise<unknown> = Promise.resolve()

const renderTheme = async (
  mermaid: Mermaid,
  blockId: string,
  source: string,
  theme: DiagramTheme
) => {
  mermaid.initialize(configFor(theme))
  // The id scopes the SVG's own <style>, so it must not clash with a copy
  // that is already on the page.
  const id = `mermaid-${blockId}-${theme}-${crypto.randomUUID().slice(0, 8)}`
  const { svg } = await mermaid.render(id, source)
  return svg
}

const renderMermaid = (blockId: string, source: string) => {
  const task = async (): Promise<RenderedDiagram> => {
    let mermaid: Mermaid
    try {
      mermaid = await loadMermaid()
    } catch {
      return {
        ok: false,
        error: "The diagram renderer couldn't load. Edit the diagram to retry.",
      }
    }
    try {
      const light = await renderTheme(mermaid, blockId, source, "light")
      const dark = await renderTheme(mermaid, blockId, source, "dark")
      return { ok: true, light, dark }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }
  const result = queue.then(task, task)
  queue = result
  return result
}

export { renderMermaid }
export type { RenderedDiagram }
