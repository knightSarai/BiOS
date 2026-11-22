import { useNavigate } from "@tanstack/react-router"
import { atom, useAtom } from "jotai"
import { Plus } from "lucide-react"
import { toast } from "sonner"
import { FIELD_KINDS, fieldKindLabels } from "@/activities/fields"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { useCreateField } from "@/local-db/activity-type-mutations"

const closedForm = { open: false, name: "" }

const newFieldAtom = atom(closedForm)

const rowClassName =
  "flex min-h-8 w-full items-center rounded-md px-2 text-left text-sm hover:bg-accent disabled:opacity-50 max-md:min-h-11"

function NewFieldButton({
  workspace,
}: {
  workspace: { id: string; slug: string }
}) {
  const [form, setForm] = useAtom(newFieldAtom)
  const navigate = useNavigate()
  const createField = useCreateField(workspace.id)
  const name = form.name.trim()

  return (
    <Popover
      open={form.open}
      onOpenChange={(open) =>
        setForm(open ? { ...closedForm, open } : closedForm)
      }
    >
      <PopoverTrigger render={<Button variant="outline" />}>
        <Plus data-icon="inline-start" />
        New field
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 gap-1 p-1">
        <input
          autoFocus
          aria-label="Field name"
          placeholder="Field name"
          dir="auto"
          value={form.name}
          onChange={(event) =>
            setForm({ ...form, name: event.currentTarget.value })
          }
          className="m-1 h-8 rounded-md border bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/30 max-md:h-11"
        />
        <Separator className="my-1" />
        {FIELD_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            className={rowClassName}
            disabled={name === "" || createField.isPending}
            onClick={() =>
              createField.mutate(
                { name, kind },
                {
                  onSuccess: (field) => {
                    setForm(closedForm)
                    void navigate({
                      to: "/$workspace/settings/fields/$fieldId",
                      params: { workspace: workspace.slug, fieldId: field.id },
                    })
                  },
                  onError: (error) =>
                    toast.error(
                      error instanceof Error
                        ? error.message
                        : "Couldn't create the field."
                    ),
                }
              )
            }
          >
            {fieldKindLabels[kind]}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}

export { NewFieldButton }
