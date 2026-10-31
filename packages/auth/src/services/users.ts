import type { z } from "zod"
import { auth } from "#auth"
import type { createUserSchema } from "../validation"

export const listAuthUsers = async (
  query: {
    limit?: number
    offset?: number
    searchValue?: string
    searchField?: "name" | "email"
    searchOperator?: "contains" | "starts_with" | "ends_with"
    sortBy?: string
    sortDirection?: "asc" | "desc"
  },
  headers: Headers
) => await auth.api.listUsers({ query, headers })

export const banUser = async (userId: string, headers: Headers) =>
  await auth.api.banUser({ body: { userId }, headers })

export const unbanUser = async (userId: string, headers: Headers) =>
  await auth.api.unbanUser({ body: { userId }, headers })

export const setUserRole = async (
  userId: string,
  role: "admin" | "user",
  headers: Headers
) => await auth.api.setRole({ body: { userId, role }, headers })

type CreateUserInput = z.infer<typeof createUserSchema>

export const createUser = async (input: CreateUserInput, headers: Headers) =>
  await auth.api.createUser({ body: input, headers })
