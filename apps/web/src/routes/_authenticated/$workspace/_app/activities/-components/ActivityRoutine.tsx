// The sidebar keeps the properties in view, Status and the timer first among them.
function PropertiesAside({ children }: { children: React.ReactNode }) {
  return (
    <aside
      aria-label="Activity properties"
      className="flex w-70 shrink-0 flex-col gap-6 pb-16 max-lg:hidden lg:sticky lg:top-14 lg:max-h-[calc(100dvh-7rem)] lg:self-start lg:overflow-y-auto"
    >
      {children}
    </aside>
  )
}

export { PropertiesAside }
