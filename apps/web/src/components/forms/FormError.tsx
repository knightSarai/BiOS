import { AlertCircle } from "lucide-react"
import { useFormContext } from "@/hooks/form"

export function FormError() {
  const form = useFormContext()

  return (
    <form.Subscribe selector={(state) => state.errorMap}>
      {(errorMap) => {
        const error = (errorMap.onSubmit as { form?: string } | undefined)
          ?.form
        return error ? (
          <div className="flex items-center gap-2.5 rounded-sm border border-destructive/20 bg-destructive/5 px-4 py-3 text-xs text-destructive">
            <AlertCircle className="size-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null
      }}
    </form.Subscribe>
  )
}
