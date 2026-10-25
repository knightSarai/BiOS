import pino, { type DestinationStream, type Logger } from "pino"
import prettyStream from "pino-pretty"

export type AppLogger = Logger

export const resolveLogLevel = (env: {
  LOG_LEVEL?: string
  NODE_ENV?: string
}): string => {
  if (env.LOG_LEVEL) return env.LOG_LEVEL
  return env.NODE_ENV === "production" ? "info" : "debug"
}

const shouldPrettyPrint = (env: { LOG_FORMAT?: string }) =>
  env.LOG_FORMAT === "pretty"

const isLoggingDisabled = (env: { LOG_DISABLED?: string }) =>
  env.LOG_DISABLED === "true"

type CreateLoggerOptions = {
  level?: string
  pretty?: boolean
  enabled?: boolean
  destination?: DestinationStream
}

export const createLogger = (options: CreateLoggerOptions = {}): AppLogger => {
  const baseOptions = {
    enabled: options.enabled ?? !isLoggingDisabled(process.env),
    level: options.level ?? resolveLogLevel(process.env),
    timestamp: pino.stdTimeFunctions.isoTime,
    serializers: { err: pino.stdSerializers.err },
  }

  if (options.destination) return pino(baseOptions, options.destination)
  if (options.pretty) return pino(baseOptions, prettyStream({ colorize: true }))
  return pino(baseOptions)
}

export const logger: AppLogger = createLogger({
  pretty: shouldPrettyPrint(process.env),
})
