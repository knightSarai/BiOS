type SlotProps = { children?: React.ReactNode }

function SettingsPage({
  title,
  children,
}: {
  title: string
  children?: React.ReactNode
}) {
  return (
    <div className="absolute inset-0 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-10 px-4 pt-10 pb-16 md:px-8 md:pt-16">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {children}
      </div>
    </div>
  )
}

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children?: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-3">
      <header className="flex flex-col gap-0.5">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {description ? (
          <p className="text-muted-foreground">{description}</p>
        ) : null}
      </header>
      {children}
    </section>
  )
}

function SettingsCard({ children }: SlotProps) {
  return (
    <div className="divide-y overflow-hidden rounded-lg border bg-card">
      {children}
    </div>
  )
}

function SettingsRow({
  label,
  htmlFor,
  description,
  children,
}: {
  label: string
  htmlFor?: string
  description?: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex min-h-15 flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <label htmlFor={htmlFor} className="font-medium">
          {label}
        </label>
        {description ? (
          <p className="text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="flex w-full justify-end sm:w-64">{children}</div>
    </div>
  )
}

export { SettingsPage, SettingsSection, SettingsCard, SettingsRow }
