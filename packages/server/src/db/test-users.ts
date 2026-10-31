import { auth } from "@knight-os/auth"
import { findUserById } from "@knight-os/auth/data-access"

export const TEST_PASSWORD = "correct-horse-battery-staple"

export const createTestUser = async (
  email: string,
  role: "admin" | "user" = "user"
) => {
  const { user } = await auth.api.createUser({
    body: { name: email.split("@")[0], email, password: TEST_PASSWORD, role },
  })
  const row = await findUserById(user.id)
  if (!row) throw new Error(`User ${email} was not stored`)
  return row
}

export const sessionHeaders = async (
  email: string,
  password: string = TEST_PASSWORD
) => {
  const { headers } = await auth.api.signInEmail({
    body: { email, password },
    returnHeaders: true,
  })
  const token = headers.get("set-cookie")?.split(";")[0]
  if (!token) throw new Error(`No session cookie for ${email}`)
  return new Headers({ cookie: token })
}
