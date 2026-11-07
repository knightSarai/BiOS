import { z } from "zod"
import { Form } from "@/components/forms/Form"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { useAppForm } from "@/hooks/form"
import { useCreateActivityType } from "@/local-db/activity-type-mutations"
import type { ActivityTypeRow } from "@/local-db/db"
import type { TypeColor } from "../activity-types"
import { colorSchema } from "../areas"
import { ColorPicker } from "./ColorPicker"

const newTypeSchema = z.object({
  name: z.string().trim().min(1, "Give the type a name."),
  color: colorSchema,
})

function NewTypeForm({
  workspaceId,
  onCreated,
  onCancel,
}: {
  workspaceId: string
  onCreated: (type: ActivityTypeRow) => void
  onCancel: () => void
}) {
  const createType = useCreateActivityType(workspaceId)
  const form = useAppForm({
    defaultValues: { name: "", color: "chart-1" as TypeColor },
    validators: {
      onSubmit: newTypeSchema,
      onSubmitAsync: async ({ value }) => {
        try {
          onCreated(await createType.mutateAsync(newTypeSchema.parse(value)))
        } catch (error) {
          return {
            form:
              error instanceof Error
                ? error.message
                : "Couldn't create the type.",
          }
        }
        return null
      },
    },
  })

  return (
    <Form onSubmit={() => void form.handleSubmit()}>
      <FieldGroup className="gap-3">
        <form.AppForm>
          <form.FormError />
        </form.AppForm>
        <form.AppField name="name">
          {(field) => (
            <field.TextInput
              label="Type name"
              placeholder="Book, Recipe, Trip…"
              autoFocus
              required
            />
          )}
        </form.AppField>
        <form.Field name="color">
          {(field) => (
            <ColorPicker
              value={field.state.value}
              onChange={field.handleChange}
            />
          )}
        </form.Field>
        <p className="text-xs text-muted-foreground">
          Add its fields and status names in Settings.
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Back
          </Button>
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <Button type="submit" disabled={isSubmitting}>
                Create type
              </Button>
            )}
          </form.Subscribe>
        </div>
      </FieldGroup>
    </Form>
  )
}

export { NewTypeForm }
