import { describe, expect, it } from "vitest"
import { auth } from "@knight-os/auth"
import {
  findUserById,
  getWorkspaceMembership,
} from "@knight-os/auth/data-access"
import { db } from "#db"
import { makeRepos } from "#data-access/make-repos"
import { createLogger } from "#services"
import {
  createWorkspace,
  WorkspaceOwnerNotFoundError,
  WorkspaceSlugTakenError,
} from "#use-cases/workspaces"

const PASSWORD = "correct-horse-battery-staple"

const signUp = async (email: string) => {
  const { user } = await auth.api.signUpEmail({
    body: { name: email.split("@")[0], email, password: PASSWORD },
  })
  const row = await findUserById(user.id)
  if (!row) throw new Error(`User ${email} was not stored`)
  return row
}

const sessionHeaders = async (email: string) => {
  const { headers } = await auth.api.signInEmail({
    body: { email, password: PASSWORD },
    returnHeaders: true,
  })
  const token = headers.get("set-cookie")?.split(";")[0]
  if (!token) throw new Error(`No session cookie for ${email}`)
  return new Headers({ cookie: token })
}

const adminContext = async () => {
  const admin = await signUp(`admin-${crypto.randomUUID()}@example.test`)
  return {
    user: admin,
    db,
    headers: new Headers(),
    logger: createLogger({ enabled: false }),
  }
}

describe("createWorkspace", () => {
  it("creates the workspace with the named user as its owner", async () => {
    const ctx = await adminContext()
    const owner = await signUp("owner@example.test")

    const created = await createWorkspace(ctx, {
      name: "Knight Life",
      slug: "knight-life",
      ownerEmail: owner.email,
      general: { timezone: "Australia/Brisbane" },
    })

    const membership = await getWorkspaceMembership(owner.id, "knight-life")
    expect(membership?.role).toBe("owner")
    expect(membership?.workspace.id).toBe(created.id)

    const adminMembership = await getWorkspaceMembership(
      ctx.user.id,
      "knight-life"
    )
    expect(adminMembership).toBeNull()

    const settings = await makeRepos(db, ctx).workspaceSettings.byWorkspaceId(
      created.id
    )
    expect(settings?.general.timezone).toBe("Australia/Brisbane")
  })

  it("rejects an owner email that has no account", async () => {
    const ctx = await adminContext()

    await expect(
      createWorkspace(ctx, {
        name: "Ghost",
        slug: "ghost",
        ownerEmail: "nobody@example.test",
      })
    ).rejects.toBeInstanceOf(WorkspaceOwnerNotFoundError)
  })

  it("rejects an address that is already taken", async () => {
    const ctx = await adminContext()
    const owner = await signUp("second-owner@example.test")
    const input = {
      name: "Taken",
      slug: "taken",
      ownerEmail: owner.email,
    }

    await createWorkspace(ctx, input)

    await expect(createWorkspace(ctx, input)).rejects.toBeInstanceOf(
      WorkspaceSlugTakenError
    )
  })
})

describe("better-auth workspace rules", () => {
  it("does not let a signed-in user create a workspace", async () => {
    await signUp("self-serve@example.test")
    const headers = await sessionHeaders("self-serve@example.test")

    await expect(
      auth.api.createOrganization({
        body: { name: "Mine", slug: "mine" },
        headers,
      })
    ).rejects.toMatchObject({ statusCode: 403 })
  })

  it("does not let an owner invite people", async () => {
    const ctx = await adminContext()
    const owner = await signUp("inviter@example.test")
    const created = await createWorkspace(ctx, {
      name: "No Invites",
      slug: "no-invites",
      ownerEmail: owner.email,
    })
    const headers = await sessionHeaders(owner.email)

    await expect(
      auth.api.createInvitation({
        body: {
          email: "friend@example.test",
          role: "member",
          organizationId: created.id,
        },
        headers,
      })
    ).rejects.toMatchObject({
      statusCode: 403,
      message: "Invitations are not available",
    })
  })
})
