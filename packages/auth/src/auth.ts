import { betterAuth, type BetterAuthOptions } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { APIError } from "better-auth/api"
import { admin, organization } from "better-auth/plugins"
import { tanstackStartCookies } from "better-auth/tanstack-start"
import { db, type DB } from "./db"
import * as schema from "./db/schema"
import { getAppBaseUrl, isValidWorkspaceSlug } from "./utils"
import { passwordResetEmail, sendEmail } from "./email"
import { ac, roles } from "./permissions"

const assertValidWorkspaceSlug = (slug: string | undefined) => {
  if (slug !== undefined && !isValidWorkspaceSlug(slug)) {
    throw new APIError("BAD_REQUEST", {
      message: `"${slug}" cannot be used as a workspace address`,
    })
  }
}

export const buildAuthOptions = (database: DB) =>
  ({
    baseURL: getAppBaseUrl(),
    database: drizzleAdapter(database, {
      provider: "sqlite",
      usePlural: true,
      camelCase: false,
      schema,
    }),
    emailAndPassword: {
      enabled: true,
      sendResetPassword: async ({ user, url }) => {
        await sendEmail(passwordResetEmail({ to: user.email, url }))
      },
    },
    plugins: [
      admin(),
      organization({
        ac,
        roles,
        allowUserToCreateOrganization: false,
        organizationHooks: {
          beforeCreateOrganization: async ({ organization }) => {
            assertValidWorkspaceSlug(organization.slug)
          },
          beforeUpdateOrganization: async ({ organization }) => {
            assertValidWorkspaceSlug(organization.slug)
          },
          beforeCreateInvitation: async () => {
            throw new APIError("FORBIDDEN", {
              message: "Invitations are not available",
            })
          },
        },
      }),
      tanstackStartCookies(),
    ],
  }) satisfies BetterAuthOptions

export const auth = betterAuth(buildAuthOptions(db))

export type AuthContext = Awaited<ReturnType<typeof auth.api.getSession>>
export type AuthSession = NonNullable<AuthContext>["session"]
export type AuthUser = NonNullable<AuthContext>["user"]
