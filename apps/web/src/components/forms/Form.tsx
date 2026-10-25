type FormProps = {
  onSubmit: () => void
  id?: string
  className?: string
  children: React.ReactNode
}

export function Form({ onSubmit, id, className, children }: FormProps) {
  return (
    <form
      id={id}
      noValidate
      className={className}
      onSubmit={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onSubmit()
      }}
    >
      {children}
    </form>
  )
}
