import { useMemo } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { atom, useAtom } from "jotai"
import { toast } from "sonner"
import type { z } from "zod"
import { createUserSchema } from "@knight-os/auth/validation"
import { Form } from "@/components/forms/Form"
import { Checkbox } from "@/components/ui/checkbox"
import { FieldGroup } from "@/components/ui/field"
import { useAppForm } from "@/hooks/form"
import { getUserFacingErrorMessage } from "@/lib/errors"
import { useTRPC } from "@/trpc/react"

const ROLE_OPTIONS = [
  { value: "user", label: "User" },
  { value: "admin", label: "Admin" },
] as const

const defaultValues: z.infer<typeof createUserSchema> = {
  name: "",
  email: "",
  password: "",
  role: "user",
}

export function CreateUserForm() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const showPasswordAtom = useMemo(() => atom(false), [])
  const [showPassword, setShowPassword] = useAtom(showPasswordAtom)

  const create = useMutation(trpc.admin.users.create.mutationOptions())

  const form = useAppForm({
    defaultValues,
    validators: {
      onChange: createUserSchema,
      onSubmitAsync: async ({ value }) => {
        try {
          await create.mutateAsync(value)
        } catch (error) {
          return { form: getUserFacingErrorMessage(error) }
        }
        return null
      },
    },
    onSubmit: async ({ value }) => {
      toast.success(`${value.name} created`)
      await queryClient.invalidateQueries(trpc.admin.users.list.queryFilter())
      await navigate({ to: "/admin/users" })
    },
  })

  return (
    <Form
      onSubmit={() => void form.handleSubmit()}
      className="flex w-full max-w-lg flex-col gap-6"
    >
      <FieldGroup className="gap-5">
        <form.AppForm>
          <form.FormError />
        </form.AppForm>

        <form.AppField name="name">
          {(field) => (
            <field.TextInput label="Name" autoComplete="off" required />
          )}
        </form.AppField>

        <form.AppField name="email">
          {(field) => (
            <field.TextInput
              label="Email"
              type="email"
              autoComplete="off"
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

        <form.AppField name="role">
          {(field) => (
            <field.Select label="Role" options={ROLE_OPTIONS} required />
          )}
        </form.AppField>

        <form.AppForm>
          <form.SubmitButton label="Create user" loadingLabel="Creating…" />
        </form.AppForm>
      </FieldGroup>
    </Form>
  )
}
