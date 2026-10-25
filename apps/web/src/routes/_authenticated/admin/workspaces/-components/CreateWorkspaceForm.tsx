import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"
import { toSlug } from "@knight-os/auth/utils"
import { createWorkspaceSchema } from "@knight-os/auth/validation"
import { timezoneSchema } from "@knight-os/server/core"
import { Form } from "@/components/forms/Form"
import { FieldGroup } from "@/components/ui/field"
import { useAppForm } from "@/hooks/form"
import { getUserFacingErrorMessage } from "@/lib/errors"
import { useTRPC } from "@/trpc/react"

const formSchema = createWorkspaceSchema.extend({ timezone: timezoneSchema })

export function CreateWorkspaceForm() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const create = useMutation(trpc.admin.workspaces.create.mutationOptions())

  const form = useAppForm({
    defaultValues: {
      name: "",
      slug: "",
      ownerEmail: "",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    validators: {
      onChange: formSchema,
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
      await Promise.all([
        queryClient.invalidateQueries(trpc.admin.workspaces.pathFilter()),
        queryClient.invalidateQueries(trpc.workspaces.list.queryFilter()),
      ])
      await navigate({ to: "/admin/workspaces" })
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

        <form.AppField
          name="name"
          listeners={{
            onChange: ({ value }) => {
              if (!form.getFieldMeta("slug")?.isTouched) {
                form.setFieldValue("slug", toSlug(value), {
                  dontUpdateMeta: true,
                })
              }
            },
          }}
        >
          {(field) => <field.TextInput label="Name" required />}
        </form.AppField>

        <form.AppField name="slug">
          {(field) => <field.TextInput label="Address" required />}
        </form.AppField>

        <form.AppField name="ownerEmail">
          {(field) => (
            <field.TextInput
              label="Owner email"
              type="email"
              placeholder="Someone who already has an account"
              required
            />
          )}
        </form.AppField>

        <form.AppField name="timezone">
          {(field) => <field.TimezoneCombobox label="Timezone" required />}
        </form.AppField>

        <form.AppForm>
          <form.SubmitButton
            label="Create workspace"
            loadingLabel="Creating…"
          />
        </form.AppForm>
      </FieldGroup>
    </Form>
  )
}
