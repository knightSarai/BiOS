import { useAtom } from "jotai"
import { toast } from "sonner"
import { z } from "zod"
import {
  AREA_COLORS,
  AREA_KEY_PATTERN,
  areaKeyFromName,
  type AreaColor,
} from "@/activities/areas"
import { Form } from "@/components/forms/Form"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FieldGroup } from "@/components/ui/field"
import { useAppForm } from "@/hooks/form"
import { useCreateArea } from "@/local-db/activity-mutations"
import { newAreaDialogOpenAtom } from "./atoms"

const colorNames: Record<AreaColor, string> = {
  "chart-1": "Plum",
  "chart-2": "Rose",
  "chart-3": "Blue",
  "chart-4": "Amber",
  "chart-5": "Teal",
}

const newAreaSchema = z.object({
  name: z.string().trim().min(1, "Give the area a name."),
  key: z
    .string()
    .trim()
    .toUpperCase()
    .regex(AREA_KEY_PATTERN, "Use 2 to 5 letters, like HLT."),
  color: z.enum(AREA_COLORS),
})

type NewAreaDialogProps = {
  workspaceId: string
}

function NewAreaDialog({ workspaceId }: NewAreaDialogProps) {
  const [open, setOpen] = useAtom(newAreaDialogOpenAtom)
  const createArea = useCreateArea(workspaceId)

  const form = useAppForm({
    defaultValues: {
      name: "",
      key: "",
      color: "chart-2" as AreaColor,
    },
    validators: {
      onChange: newAreaSchema,
      onSubmitAsync: async ({ value }) => {
        try {
          await createArea.mutateAsync(newAreaSchema.parse(value))
        } catch (error) {
          return {
            form:
              error instanceof Error
                ? error.message
                : "Couldn't create the area.",
          }
        }
        return null
      },
    },
    onSubmit: ({ value }) => {
      toast.success(`${value.name.trim()} created`)
      form.reset()
      setOpen(false)
    },
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New area</DialogTitle>
          <DialogDescription>
            A broad part of life, such as Health or Career. Its key starts the
            ID of every activity in it, like HLT-12.
          </DialogDescription>
        </DialogHeader>
        <Form
          onSubmit={() => void form.handleSubmit()}
          className="flex flex-col gap-5"
        >
          <FieldGroup className="gap-4">
            <form.AppForm>
              <form.FormError />
            </form.AppForm>
            <form.AppField
              name="name"
              listeners={{
                onChange: ({ value }) => {
                  if (!form.getFieldMeta("key")?.isTouched) {
                    form.setFieldValue("key", areaKeyFromName(value), {
                      dontUpdateMeta: true,
                    })
                  }
                },
              }}
            >
              {(field) => <field.TextInput label="Name" required autoFocus />}
            </form.AppField>
            <form.AppField name="key">
              {(field) => (
                <field.TextInput
                  label="Key"
                  required
                  autoCapitalize="characters"
                />
              )}
            </form.AppField>
            <form.AppField name="color">
              {(field) => (
                <field.ToggleGroupField
                  label="Color"
                  options={AREA_COLORS.map((color) => ({
                    value: color,
                    label: colorNames[color],
                  }))}
                />
              )}
            </form.AppField>
            <form.AppForm>
              <form.SubmitButton label="Create area" loadingLabel="Creating…" />
            </form.AppForm>
          </FieldGroup>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

export { NewAreaDialog }
