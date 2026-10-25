import { Loader2 } from "lucide-react"
import { useFormContext } from "@/hooks/form"
import { Button } from "@/components/ui/button"
import { Field } from "@/components/ui/field"

export function SubmitButton({
  label,
  loadingLabel,
}: {
  label: string
  loadingLabel?: string
}) {
  const form = useFormContext()

  return (
    <form.Subscribe selector={(state) => state.isSubmitting}>
      {(isSubmitting) => (
        <Field className="pt-2">
          <Button type="submit" size="lg">
            {isSubmitting ? (
              <>
                <Loader2 className="animate-spin" />
                {loadingLabel ?? label}
              </>
            ) : (
              label
            )}
          </Button>
        </Field>
      )}
    </form.Subscribe>
  )
}
