import { auth } from "#auth"

export const getSession = async (headers: Headers) =>
  await auth.api.getSession({ headers })
