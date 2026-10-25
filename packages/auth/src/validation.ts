import { z } from "zod"
import {
  WORKSPACE_SLUG_MAX_LENGTH,
  WORKSPACE_SLUG_MIN_LENGTH,
  isReservedWorkspaceSlug,
} from "./utils"

export const signInSchema = z.object({
  email: z.email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
})

export const forgotPasswordSchema = z.object({
  email: z.email("Invalid email address"),
})

export const resetPasswordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string().min(1, "Please confirm your password"),
})

export const signUpSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string().min(1, "Please confirm your password"),
})

export const workspaceSlugSchema = z
  .string()
  .trim()
  .min(WORKSPACE_SLUG_MIN_LENGTH)
  .max(WORKSPACE_SLUG_MAX_LENGTH)
  .regex(
    /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/,
    "Use lowercase letters, numbers and hyphens"
  )
  .refine((slug) => !isReservedWorkspaceSlug(slug), "This name is reserved")

export const workspaceSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  slug: workspaceSlugSchema,
})

export const createWorkspaceSchema = workspaceSchema.extend({
  ownerEmail: z.email("Invalid email address"),
})
