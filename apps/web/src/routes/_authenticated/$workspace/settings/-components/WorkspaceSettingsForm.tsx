import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "@tanstack/react-router"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"
import {
  DATE_ORDERS,
  DATE_SEPARATORS,
  workspaceGeneralSettingsSchema,
  type WorkspaceGeneralSettings,
} from "@knight-os/server/core"
import { Button } from "@/components/ui/button"
import { Form } from "@/components/forms/Form"
import { useAppForm } from "@/hooks/form"
import { useTRPC } from "@/trpc/react"
import { SettingsCard, SettingsRow } from "./SettingsPage"

const DATE_ORDER_LABELS = {
  DMY: "Day / Month / Year",
  MDY: "Month / Day / Year",
  YMD: "Year / Month / Day",
} satisfies Record<(typeof DATE_ORDERS)[number], string>

const dateOrderOptions = DATE_ORDERS.map((value) => ({
  value,
  label: DATE_ORDER_LABELS[value],
}))

const dateSeparatorOptions = DATE_SEPARATORS.map((value) => ({
  value,
  label: value,
}))

const formSchema = z.object({
  name: z.string().trim().min(1).max(100),
  general: workspaceGeneralSettingsSchema,
})

type Props = {
  workspace: string
  initial: { name: string; general: WorkspaceGeneralSettings }
  canUpdate: boolean
}

export function WorkspaceSettingsForm({ workspace, initial, canUpdate }: Props) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const router = useRouter()

  const update = useMutation(
    trpc.settings.workspace.update.mutationOptions({
      onSuccess: async () => {
        toast.success("Workspace settings saved")
        await Promise.all([
          queryClient.invalidateQueries(trpc.settings.workspace.pathFilter()),
          queryClient.invalidateQueries(trpc.workspaces.pathFilter()),
        ])
        await router.invalidate()
      },
    })
  )

  const form = useAppForm({
    defaultValues: initial,
    validators: { onChange: formSchema },
    onSubmit: ({ value }) => update.mutate({ workspace, ...value }),
  })

  return (
    <Form
      onSubmit={() => void form.handleSubmit()}
      className="flex flex-col gap-3"
    >
      <SettingsCard>
        <SettingsRow label="Name" htmlFor="name">
          <form.AppField name="name">
            {(field) => <field.TextInput required readOnly={!canUpdate} />}
          </form.AppField>
        </SettingsRow>
        <SettingsRow
          label="Address"
          description="The workspace lives at this path"
        >
          <span className="w-full truncate text-right text-muted-foreground">
            /{workspace}
          </span>
        </SettingsRow>
        <SettingsRow
          label="Timezone"
          htmlFor="general.timezone"
          description="Used for dates, the daily page and greetings"
        >
          <form.AppField name="general.timezone">
            {(field) => <field.TimezoneCombobox required />}
          </form.AppField>
        </SettingsRow>
        <SettingsRow label="Date order" htmlFor="general.dateOrder">
          <form.AppField name="general.dateOrder">
            {(field) => (
              <field.Select options={dateOrderOptions} readOnly={!canUpdate} />
            )}
          </form.AppField>
        </SettingsRow>
        <SettingsRow label="Date separator" htmlFor="general.dateSeparator">
          <form.AppField name="general.dateSeparator">
            {(field) => (
              <field.Select
                options={dateSeparatorOptions}
                readOnly={!canUpdate}
              />
            )}
          </form.AppField>
        </SettingsRow>
      </SettingsCard>

      {canUpdate ? (
        <form.Subscribe
          selector={(s) => ({
            isDirty: s.isDirty,
            isSubmitting: s.isSubmitting,
            canSubmit: s.canSubmit,
          })}
        >
          {({ isDirty, isSubmitting, canSubmit }) => (
            <Button
              type="submit"
              size="lg"
              className="self-end"
              disabled={
                !isDirty || !canSubmit || isSubmitting || update.isPending
              }
            >
              {isSubmitting || update.isPending ? (
                <>
                  <Loader2 className="animate-spin" />
                  Saving...
                </>
              ) : (
                "Save"
              )}
            </Button>
          )}
        </form.Subscribe>
      ) : null}
    </Form>
  )
}
