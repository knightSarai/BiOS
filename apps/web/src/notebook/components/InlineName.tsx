type InlineNameProps = {
  defaultValue: string
  label: string
  onSubmit: (value: string) => void
  onCancel: () => void
}

const focusAndSelect = (input: HTMLInputElement | null) => {
  if (!input) return
  input.focus()
  input.select()
}

function InlineName({
  defaultValue,
  label,
  onSubmit,
  onCancel,
}: InlineNameProps) {
  const finish = (input: HTMLInputElement) => {
    const value = input.value.trim()
    if (value && value !== defaultValue) onSubmit(value)
    else onCancel()
  }

  return (
    <input
      ref={focusAndSelect}
      aria-label={label}
      defaultValue={defaultValue}
      dir="auto"
      onBlur={(event) => finish(event.currentTarget)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault()
          event.currentTarget.blur()
        }
        if (event.key === "Escape") {
          event.preventDefault()
          event.currentTarget.value = defaultValue
          event.currentTarget.blur()
        }
      }}
      className="relative z-10 min-w-0 flex-1 rounded-sm bg-background px-1 text-foreground ring-1 ring-ring outline-hidden"
    />
  )
}

export { InlineName }
