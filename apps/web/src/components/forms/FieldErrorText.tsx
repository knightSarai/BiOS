type FieldErrorTextProps = {
  errors: unknown[]
}

export function FieldErrorText({ errors }: FieldErrorTextProps) {
  if (errors.length === 0) return null
  return (
    <em role="alert" className="text-xs text-destructive">
      {errors
        .map((err) => {
          if (typeof err === "string") return err
          if (err && typeof err === "object" && "message" in err) {
            return typeof err.message === "string" ? err.message : ""
          }
          return ""
        })
        .join(", ")}
    </em>
  )
}
