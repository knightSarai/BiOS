import {
  adminAc,
  memberAc,
  ownerAc,
} from "better-auth/plugins/organization/access"
import { ac, appStatements } from "./ac"

const allAppPermissions = Object.fromEntries(
  Object.entries(appStatements).map(([resource, actions]) => [
    resource,
    [...actions],
  ])
)

export const ownerRole = ac.newRole({
  ...ownerAc.statements,
  ...allAppPermissions,
})

export const adminRole = ac.newRole({
  ...adminAc.statements,
  ...allAppPermissions,
})

export const memberRole = ac.newRole({
  ...memberAc.statements,
  workspaceSettings: ["view"],
})

export const roles = {
  owner: ownerRole,
  admin: adminRole,
  member: memberRole,
}

export type WorkspaceRole = keyof typeof roles
