import { useMemo } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useMutation } from "@tanstack/react-query"
import { atom, useAtom } from "jotai"
import { AlertCircle, CheckCircle2 } from "lucide-react"
import { authClient } from "@knight-os/auth/client"
import { resetPasswordSchema } from "@knight-os/auth/validation"
import { useAppForm } from "@/hooks/form"
import { AuthShell } from "@/components/auth/AuthShell"
import { Checkbox } from "@/components/ui/checkbox"
import { FieldGroup } from "@/components/ui/field"
import { Form } from "@/components/forms/Form"

type ResetPasswordSearch = { token?: string }

export const Route = createFileRoute("/reset-password")({
  validateSearch: (search: Record<string, unknown>): ResetPasswordSearch => ({
    token: typeof search.token === "string" ? search.token : undefined,
  }),
  component: ResetPassword,
})

function ResetPassword() {
  const { token } = Route.useSearch()
  const navigate = useNavigate()
  const successAtom = useMemo(() => atom(false), [])
  const [success, setSuccess] = useAtom(successAtom)
  const showPasswordAtom = useMemo(() => atom(false), [])
  const [showPassword, setShowPassword] = useAtom(showPasswordAtom)

  const resetPassword = useMutation({
    mutationFn: async (input: { newPassword: string; token: string }) => {
      const { data, error } = await authClient.resetPassword(input)
      if (error) throw new Error(error.message ?? "Failed to reset password")
      return data
    },
    onSuccess: () => setSuccess(true),
  })

  const form = useAppForm({
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
    validators: {
      onChange: resetPasswordSchema,
      onSubmitAsync: async ({ value }) => {
        if (value.password !== value.confirmPassword) {
          return {
            fields: {
              confirmPassword: "Passwords do not match",
            },
          }
        }

        if (!token) {
          return { form: "Invalid or missing reset token" }
        }

        try {
          await resetPassword.mutateAsync({
            newPassword: value.password,
            token,
          })
        } catch (error: unknown) {
          return {
            form:
              error instanceof Error
                ? error.message
                : "Failed to reset password",
          }
        }
        return null
      },
    },
    onSubmit: () => {},
  })

  if (!token) {
    return (
      <AuthShell>
        <div className="flex flex-col items-center gap-4 py-8">
          <AlertCircle className="size-10 text-destructive" />
          <div className="text-center">
            <p className="font-medium">Invalid Link</p>
            <p className="mt-1 text-sm text-muted-foreground">
              This password reset link is invalid or has expired.
            </p>
          </div>
        </div>
      </AuthShell>
    )
  }

  if (success) {
    return (
      <AuthShell>
        <div className="flex flex-col items-center gap-6 py-4">
          <CheckCircle2 className="size-10 text-green-600" />
          <div className="text-center">
            <p className="font-medium">Password Set Successfully</p>
            <p className="mt-1 text-sm text-muted-foreground">
              You can now sign in with your new password.
            </p>
          </div>
          <button
            type="button"
            className="text-sm font-medium text-primary hover:underline"
            onClick={() => navigate({ to: "/", reloadDocument: true })}
          >
            Go to Sign In
          </button>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Set Your Password"
      description="Create a password to access your account."
    >
      <Form onSubmit={() => void form.handleSubmit()}>
        <FieldGroup className="gap-5">
          <form.AppForm>
            <form.FormError />
          </form.AppForm>

          <div className="flex flex-col gap-2">
            <form.AppField name="password">
              {(field) => (
                <field.TextInput
                  label="Password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                />
              )}
            </form.AppField>

            <form.AppField name="confirmPassword">
              {(field) => (
                <field.TextInput
                  label="Confirm Password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                />
              )}
            </form.AppField>

            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox
                checked={showPassword}
                onCheckedChange={(checked) => setShowPassword(checked)}
                aria-label={
                  showPassword ? "Hide password" : "Show password as plain text"
                }
              />
              Show password
            </label>
          </div>

          <form.AppForm>
            <form.SubmitButton
              label="Set Password"
              loadingLabel="Setting password..."
            />
          </form.AppForm>
        </FieldGroup>
      </Form>
    </AuthShell>
  )
}
