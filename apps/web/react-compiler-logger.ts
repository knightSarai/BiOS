import { relative } from "node:path"
import type {
  Logger,
  LoggerEvent,
  SourceLocation,
} from "babel-plugin-react-compiler"

const lineOf = (loc: SourceLocation | null) =>
  loc && typeof loc !== "symbol" ? loc.start.line : "?"

const describeEvent = (event: LoggerEvent) => {
  if (event.kind === "CompileError") {
    const { reason, description } = event.detail
    return `${lineOf(event.detail.primaryLocation() ?? event.fnLoc)} ${event.kind} ${description ? `${reason}: ${description}` : reason}`
  }
  if (event.kind === "CompileSkip")
    return `${lineOf(event.loc ?? event.fnLoc)} ${event.kind} ${event.reason}`
  if (event.kind === "PipelineError")
    return `${lineOf(event.fnLoc)} ${event.kind} ${event.data}`
  return null
}

export const reactCompilerLogger = {
  logEvent(filename, event) {
    const entry = describeEvent(event)
    const file = filename ? relative(process.cwd(), filename) : "<unknown>"
    if (entry) process.stderr.write(`${file}:${entry}\n`)
  },
} satisfies Logger
