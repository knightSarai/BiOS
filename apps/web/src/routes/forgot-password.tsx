import { useMemo } from "react"
import { createFileRoute, Link, redirect } from "@tanstack/react-router"
import { useMutation } from "@tanstack/react-query"
import { atom, useAtom } from "jotai"
import { MailCheck } from "lucide-react"
import { authClient } from "@knight-os/auth/client"
import { forgotPasswordSchema } from "@knight-os/auth/validation"
import { useAppForm } from "@/hooks/form"
import { AuthShell } from "@/components/auth/AuthShell"
import { FieldGroup } from "@/components/ui/field"
import { Form } from "@/components/forms/Form"

export const Route = createFileRoute("/forgot-password")({
  beforeLoad: ({ context }) => {
    if (context.auth) {
      throw redirect({ to: "/" })
    }
  },
  component: ForgotPassword,
})

function ForgotPassword() {
  const successAtom = useMemo(() => atom(false), [])
  const [success, setSuccess] = useAtom(successAtom)

  const requestReset = useMutation({
    mutationFn: async (input: { email: string }) => {
      const { data, error } = await authClient.requestPasswordReset({
        email: input.email,
        redirectTo: "/reset-password",
      })
      if (error) throw new Error(error.message ?? "Failed to send reset email")
      return data
    },
    onSuccess: () => setSuccess(true),
  })

  const form = useAppForm({
    defaultValues: {
      email: "",
    },
    validators: {
      onChange: forgotPasswordSchema,
      onSubmitAsync: async ({ value }) => {
        try {
          await requestReset.mutateAsync(value)
        } catch (error: unknown) {
          return {
            form:
              error instanceof Error
                ? error.message
                : "Failed to send reset email",
          }
        }
        return null
      },
    },
    onSubmit: () => {},
  })

  if (success) {
    return (
      <AuthShell>
        <div className="flex flex-col items-center gap-6 py-4">
          <MailCheck className="size-10 text-green-600" />
          <div className="text-center">
            <p className="font-medium">Check Your Email</p>
            <p className="mt-1 text-sm text-muted-foreground">
              If an account exists for that email, a password reset link is on
              its way.
            </p>
          </div>
          <Link
            to="/sign-in"
            className="text-sm font-medium text-primary hover:underline"
          >
            Back to Sign In
          </Link>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Forgot your password?"
      description="Enter your email and we'll send you a reset link."
    >
      <Form onSubmit={() => void form.handleSubmit()}>
        <FieldGroup className="gap-5">
          <form.AppForm>
            <form.FormError />
          </form.AppForm>

          <form.AppField name="email">
            {(field) => (
              <field.TextInput
                label="Email"
                type="email"
                autoComplete="username"
                required
              />
            )}
          </form.AppField>

          <form.AppForm>
            <form.SubmitButton
              label="Send reset link"
              loadingLabel="Sending…"
            />
          </form.AppForm>

          <Link
            to="/sign-in"
            className="text-center text-sm font-medium text-primary hover:underline"
          >
            Back to Sign In
          </Link>
        </FieldGroup>
      </Form>
    </AuthShell>
  )
}
