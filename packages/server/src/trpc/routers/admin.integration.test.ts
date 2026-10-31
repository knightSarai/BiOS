import { describe, expect, it } from "vitest"
import { auth } from "@knight-os/auth"
import { findUserByEmail } from "@knight-os/auth/data-access"
import {
  createTestUser,
  sessionHeaders,
  TEST_PASSWORD,
} from "#db/test-users"
import { createTRPCContext } from "#trpc/context"
import { createCallerFactory } from "#trpc/init"
import { appRouter } from "#trpc/router"

const createCaller = createCallerFactory(appRouter)

const callerFor = async (email: string) => {
  const headers = await sessionHeaders(email)
  const session = await auth.api.getSession({ headers })
  if (!session) throw new Error(`No session for ${email}`)
  return createCaller(
    createTRPCContext({
      headers,
      session: session.session,
      user: session.user,
    })
  )
}

const adminCaller = async () => {
  const admin = await createTestUser(
    `admin-${crypto.randomUUID()}@example.test`,
    "admin"
  )
  return callerFor(admin.email)
}

describe("public sign-up", () => {
  it("is rejected", async () => {
    await expect(
      auth.api.signUpEmail({
        body: {
          name: "Walk In",
          email: "walk-in@example.test",
          password: TEST_PASSWORD,
        },
      })
    ).rejects.toMatchObject({ statusCode: 400 })

    expect(await findUserByEmail("walk-in@example.test")).toBeNull()
  })
})

describe("admin.users.create", () => {
  it("creates a user who can sign in with the given password", async () => {
    const caller = await adminCaller()

    await caller.admin.users.create({
      name: "New Person",
      email: "New.Person@example.test",
      password: "a-fresh-password",
      role: "user",
    })

    const user = await findUserByEmail("new.person@example.test")
    expect(user).toMatchObject({ name: "New Person", role: "user" })

    await expect(
      sessionHeaders("new.person@example.test", "a-fresh-password")
    ).resolves.toBeInstanceOf(Headers)
  })

  it("can create another admin", async () => {
    const caller = await adminCaller()

    await caller.admin.users.create({
      name: "Second Admin",
      email: "second-admin@example.test",
      password: TEST_PASSWORD,
      role: "admin",
    })

    const user = await findUserByEmail("second-admin@example.test")
    expect(user?.role).toBe("admin")
  })

  it("rejects an email that already has an account", async () => {
    const caller = await adminCaller()
    const existing = await createTestUser("taken@example.test")

    await expect(
      caller.admin.users.create({
        name: "Duplicate",
        email: existing.email,
        password: TEST_PASSWORD,
        role: "user",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  })

  it("rejects a password shorter than 8 characters", async () => {
    const caller = await adminCaller()

    await expect(
      caller.admin.users.create({
        name: "Short",
        email: "short@example.test",
        password: "short",
        role: "user",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })

    expect(await findUserByEmail("short@example.test")).toBeNull()
  })

  it("is forbidden for a non-admin", async () => {
    const member = await createTestUser("member@example.test")
    const caller = await callerFor(member.email)

    await expect(
      caller.admin.users.create({
        name: "Sneaky",
        email: "sneaky@example.test",
        password: TEST_PASSWORD,
        role: "admin",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" })

    expect(await findUserByEmail("sneaky@example.test")).toBeNull()
  })
})
