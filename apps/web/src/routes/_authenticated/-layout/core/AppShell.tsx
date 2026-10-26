import { Fragment } from "react"
import { useAtom } from "jotai"
import { Link, useMatches } from "@tanstack/react-router"
import { ChevronRight, Menu } from "lucide-react"
import { Toaster } from "@/components/common/Toaster"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { mobileMenuOpenAtom } from "@layout/atoms"
import type { NavSection } from "@layout/nav-types"

type SidebarProps = {
  menu: React.ReactNode
  nav: NavSection[]
  sections?: (onNavigate?: () => void) => React.ReactNode
  footer?: React.ReactNode
}

type AppShellProps = SidebarProps & {
  header?: React.ReactNode
  children: React.ReactNode
}

const navRowClassName =
  "flex min-h-8 w-full items-center gap-[9px] rounded-md px-2 text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[status=active]:bg-selection data-[status=active]:text-sidebar-accent-foreground max-md:min-h-11"

function NavLinks({
  nav,
  onNavigate,
}: {
  nav: NavSection[]
  onNavigate?: () => void
}) {
  return nav.map((section, index) => (
    <div key={section.label ?? index} className="flex flex-col gap-0.5">
      {section.label ? (
        <div className="px-2 pt-[18px] pb-1.5 text-[11px] font-medium tracking-[0.04em] text-muted-foreground uppercase">
          {section.label}
        </div>
      ) : null}
      {section.links.map((link) => (
        <Link
          key={link.route}
          to={link.route}
          activeOptions={{ exact: link.exact ?? false }}
          onClick={onNavigate}
          className={navRowClassName}
        >
          <link.icon className="size-4 shrink-0" />
          <span className="flex-1 truncate">{link.label}</span>
        </Link>
      ))}
    </div>
  ))
}

function SidebarContent({
  menu,
  nav,
  sections,
  footer,
  onNavigate,
}: SidebarProps & { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col gap-0.5 overflow-y-auto px-2.5 py-3">
      {menu}
      <NavLinks nav={nav} onNavigate={onNavigate} />
      {sections?.(onNavigate)}
      <div className="min-h-6 flex-1" />
      {footer}
    </div>
  )
}

function Breadcrumb() {
  const crumbs = useMatches({
    select: (matches) =>
      matches.flatMap((match) =>
        match.staticData.crumb
          ? [{ ...match.staticData.crumb, to: match.pathname }]
          : []
      ),
  })

  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-0.5">
      {crumbs.map((crumb, index) => {
        const isLast = index === crumbs.length - 1
        const content = (
          <>
            {crumb.icon ? (
              <crumb.icon className="size-[15px] shrink-0 text-accent-text" />
            ) : null}
            <span className="truncate">{crumb.label}</span>
          </>
        )

        return (
          <Fragment key={crumb.to}>
            {index > 0 ? (
              <ChevronRight
                aria-hidden
                className="size-3 shrink-0 text-muted-foreground"
              />
            ) : null}
            {isLast ? (
              <span
                aria-current="page"
                className="flex min-h-7 items-center gap-[7px] rounded-md px-1.5 whitespace-nowrap text-foreground max-md:min-h-11"
              >
                {content}
              </span>
            ) : (
              <Link
                to={crumb.to}
                className="flex min-h-7 items-center gap-[7px] rounded-md px-1.5 whitespace-nowrap text-muted-foreground transition-colors hover:bg-accent hover:text-foreground max-md:min-h-11"
              >
                {content}
              </Link>
            )}
          </Fragment>
        )
      })}
    </nav>
  )
}

function MobileNavButton() {
  const [, setMobileOpen] = useAtom(mobileMenuOpenAtom)

  return (
    <Button
      variant="ghost"
      size="icon"
      className="-ml-2 md:hidden"
      onClick={() => setMobileOpen(true)}
      aria-label="Open navigation"
    >
      <Menu />
    </Button>
  )
}

function AppShell({
  menu,
  nav,
  sections,
  footer,
  header,
  children,
}: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useAtom(mobileMenuOpenAtom)

  return (
    <div className="flex h-svh bg-sidebar text-[13px] text-foreground">
      <nav aria-label="Main" className="hidden w-[220px] shrink-0 md:block">
        <SidebarContent
          menu={menu}
          nav={nav}
          sections={sections}
          footer={footer}
        />
      </nav>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 bg-sidebar p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
            <SheetDescription>Main navigation</SheetDescription>
          </SheetHeader>
          <SidebarContent
            menu={menu}
            nav={nav}
            sections={sections}
            footer={footer}
            onNavigate={() => setMobileOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <main className="m-2 flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border bg-background md:ml-0">
        {header === undefined ? (
          <header className="flex min-h-[46px] shrink-0 items-center gap-1 overflow-x-auto border-b px-4 md:px-[26px]">
            <MobileNavButton />
            <Breadcrumb />
          </header>
        ) : (
          header
        )}
        <div className="relative min-h-0 flex-1">{children}</div>
      </main>
      <Toaster />
    </div>
  )
}

export { AppShell, MobileNavButton, navRowClassName }
