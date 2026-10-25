export { isAPIError, APIError } from "better-auth/api"

export const WORKSPACE_SLUG_MIN_LENGTH = 2
export const WORKSPACE_SLUG_MAX_LENGTH = 48

const WORKSPACE_SLUG_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/

export const RESERVED_WORKSPACE_SLUGS = [
  "admin",
  "api",
  "assets",
  "forgot-password",
  "no-workspace",
  "reset-password",
  "settings",
  "sign-in",
  "sign-out",
  "sign-up",
] as const

export const toSlug = (name: string) =>
  name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")

export const isReservedWorkspaceSlug = (slug: string) =>
  (RESERVED_WORKSPACE_SLUGS as readonly string[]).includes(slug)

export const isValidWorkspaceSlug = (slug: string) =>
  slug.length >= WORKSPACE_SLUG_MIN_LENGTH &&
  slug.length <= WORKSPACE_SLUG_MAX_LENGTH &&
  WORKSPACE_SLUG_PATTERN.test(slug) &&
  !isReservedWorkspaceSlug(slug)

export const getAppBaseUrl = () => {
  const url = process.env.BETTER_AUTH_URL
  if (!url) throw new Error("BETTER_AUTH_URL environment variable is required")
  return url.replace(/\/$/, "")
}
