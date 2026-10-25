import { createAccessControl } from "better-auth/plugins/access"
import { defaultStatements } from "better-auth/plugins/organization/access"

export const appStatements = {
  workspaceSettings: ["view", "update"],
} as const

export const ac = createAccessControl({
  ...defaultStatements,
  ...appStatements,
} as const)

type AppStatement = typeof appStatements

export type AppResource = keyof AppStatement

export type AppAction<TResource extends AppResource> =
  AppStatement[TResource][number]

export type AppPermission = {
  [K in AppResource]: {
    [P in K]: readonly [AppAction<K>, ...AppAction<K>[]]
  }
}[AppResource]
