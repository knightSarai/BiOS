import { useMemo } from "react"
import {
  createFileRoute,
  redirect,
  Link,
  useNavigate,
} from "@tanstack/react-router"
import { useMutation } from "@tanstack/react-query"
import { atom, useAtom } from "jotai"
import { authClient } from "@knight-os/auth/client"
import { signUpSchema } from "@knight-os/auth/validation"
import { AuthShell } from "@/components/auth/AuthShell"
import { Checkbox } from "@/components/ui/checkbox"
import { FieldGroup } from "@/components/ui/field"
import { useAppForm } from "@/hooks/form"
import { Form } from "@/components/forms/Form"

type SignUpSearch = { returnTo?: string }

export const Route = createFileRoute("/sign-up")({
  validateSearch: (search: Record<string, unknown>): SignUpSearch => ({
    returnTo: typeof search.returnTo === "string" ? search.returnTo : undefined,
  }),
  beforeLoad: ({ context, search }) => {
    if (context.auth) {
      throw redirect({ to: search.returnTo ?? "/" })
    }
  },
  component: SignUp,
})

function SignUp() {
  const navigate = useNavigate()
  const { returnTo } = Route.useSearch()
  const showPasswordAtom = useMemo(() => atom(false), [])
  const [showPassword, setShowPassword] = useAtom(showPasswordAtom)

  const signUp = useMutation({
    mutationFn: async (input: {
      email: string
      name: string
      password: string
    }) => {
      const { data, error } = await authClient.signUp.email(input)
      if (error) throw new Error(error.message ?? "Failed to create account")
      return data
    },
  })

  const form = useAppForm({
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
    validators: {
      onChange: signUpSchema,
      onSubmitAsync: async ({ value }) => {
        if (value.password !== value.confirmPassword) {
          return {
            fields: { confirmPassword: "Passwords do not match" },
          }
        }
        try {
          await signUp.mutateAsync({
            email: value.email,
            name: value.name,
            password: value.password,
          })
        } catch (error: unknown) {
          return {
            form:
              error instanceof Error
                ? error.message
                : "Failed to create account",
          }
        }
        return null
      },
    },
    onSubmit: () => {
      void navigate({
        to: returnTo ?? "/",
        reloadDocument: true,
      })
    },
  })

  return (
    <AuthShell title="Create your account">
      <Form onSubmit={() => void form.handleSubmit()}>
        <FieldGroup className="gap-5">
          <form.AppForm>
            <form.FormError />
          </form.AppForm>

          <form.AppField name="name">
            {(field) => (
              <field.TextInput
                label="Name"
                type="text"
                autoComplete="name"
                required
              />
            )}
          </form.AppField>

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

          <div className="flex flex-col gap-2">
            <form.AppField name="password">
              {(field) => (
                <field.TextInput
                  label="Password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                />
              )}
            </form.AppField>

            <form.AppField name="confirmPassword">
              {(field) => (
                <field.TextInput
                  label="Confirm Password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
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
              label="Create Account"
              loadingLabel="Creating..."
            />
          </form.AppForm>
        </FieldGroup>
      </Form>

      <div className="mt-6 text-center text-xs text-muted-foreground">
        Already have an account?{" "}
        <Link
          to="/sign-in"
          search={returnTo ? { returnTo } : undefined}
          className="font-medium text-primary hover:underline"
        >
          Sign in
        </Link>
      </div>
    </AuthShell>
  )
}
