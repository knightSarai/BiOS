import { SYSTEM_USER } from "@knight-os/auth/system-user"

type Actor = { id: string; name: string }

export const auditFieldsForCreate = (user?: Actor) => {
  const actor = user ?? SYSTEM_USER

  return {
    createdById: actor.id,
    createdByName: actor.name,
    updatedById: actor.id,
    updatedByName: actor.name,
  }
}

export const auditFieldsForUpdate = (user?: Actor) => {
  const actor = user ?? SYSTEM_USER

  return {
    updatedById: actor.id,
    updatedByName: actor.name,
  }
}
