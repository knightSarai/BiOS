import { cn } from "@/lib/utils"

type CommitInputProps = {
  value: string
  label: string
  placeholder?: string
  allowEmpty?: boolean
  className?: string
  onCommit: (value: string) => void
}

// Uncontrolled so stored data isn't mirrored in client state; the caller keys it by value to reset after a save.
function CommitInput({
  value,
  label,
  placeholder,
  allowEmpty,
  className,
  onCommit,
}: CommitInputProps) {
  const commit = (input: HTMLInputElement) => {
    const next = input.value.trim()
    if (next === value) return
    if (!next && !allowEmpty) {
      input.value = value
      return
    }
    onCommit(next)
  }

  return (
    <input
      aria-label={label}
      defaultValue={value}
      placeholder={placeholder}
      dir="auto"
      onBlur={(event) => commit(event.currentTarget)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault()
          event.currentTarget.blur()
        }
        if (event.key === "Escape") {
          event.preventDefault()
          event.currentTarget.value = value
          event.currentTarget.blur()
        }
      }}
      className={cn(
        "min-w-0 rounded-md bg-transparent px-2 outline-none placeholder:text-muted-foreground hover:bg-accent focus:bg-background focus:ring-2 focus:ring-ring/30",
        className
      )}
    />
  )
}

export { CommitInput }
