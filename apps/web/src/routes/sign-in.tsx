import { useMemo } from "react"
import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
} from "@tanstack/react-router"
import { useMutation } from "@tanstack/react-query"
import { atom, useAtom } from "jotai"
import { authClient } from "@knight-os/auth/client"
import { signInSchema } from "@knight-os/auth/validation"
import { AuthShell } from "@/components/auth/AuthShell"
import { Checkbox } from "@/components/ui/checkbox"
import { FieldGroup } from "@/components/ui/field"
import { useAppForm } from "@/hooks/form"
import { Form } from "@/components/forms/Form"

type SignInSearch = { returnTo?: string }

export const Route = createFileRoute("/sign-in")({
  validateSearch: (search: Record<string, unknown>): SignInSearch => ({
    returnTo: typeof search.returnTo === "string" ? search.returnTo : undefined,
  }),
  beforeLoad: ({ context, search }) => {
    if (context.auth) {
      throw redirect({ to: search.returnTo ?? "/" })
    }
  },
  component: SignIn,
})

function SignIn() {
  const navigate = useNavigate()
  const { returnTo } = Route.useSearch()
  const showPasswordAtom = useMemo(() => atom(false), [])
  const [showPassword, setShowPassword] = useAtom(showPasswordAtom)

  const signIn = useMutation({
    mutationFn: async (input: { email: string; password: string }) => {
      const { data, error } = await authClient.signIn.email(input)
      if (error) throw new Error(error.message ?? "Sign in failed")
      return data
    },
  })

  const form = useAppForm({
    defaultValues: {
      email: "",
      password: "",
    },
    validators: {
      onChange: signInSchema,
      onSubmitAsync: async ({ value }) => {
        try {
          await signIn.mutateAsync(value)
        } catch (error: unknown) {
          return {
            form: error instanceof Error ? error.message : "Sign in failed",
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
    <AuthShell title="Sign in to your account">
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

          <div className="flex flex-col gap-2">
            <form.AppField name="password">
              {(field) => (
                <field.TextInput
                  label="Password"
                  id="current-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                />
              )}
            </form.AppField>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Checkbox
                  checked={showPassword}
                  onCheckedChange={(checked) => setShowPassword(checked)}
                  aria-label={
                    showPassword
                      ? "Hide password"
                      : "Show password as plain text"
                  }
                />
                Show password
              </label>
              <Link
                to="/forgot-password"
                className="text-xs font-medium text-primary hover:underline"
              >
                Forgot password?
              </Link>
            </div>
          </div>

          <form.AppForm>
            <form.SubmitButton label="Sign in" loadingLabel="Signing in…" />
          </form.AppForm>
        </FieldGroup>
      </Form>

      <div className="mt-6 text-center text-xs text-muted-foreground">
        New here?{" "}
        <Link
          to="/sign-up"
          search={returnTo ? { returnTo } : {}}
          className="font-medium text-primary hover:underline"
        >
          Create an account
        </Link>
      </div>
    </AuthShell>
  )
}
