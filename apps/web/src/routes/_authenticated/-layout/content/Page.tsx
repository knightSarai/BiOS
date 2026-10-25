import { createPortal } from "react-dom"
import { useRender } from "@base-ui/react/use-render"
import { atom, useAtomValue, useSetAtom } from "jotai"
import { ChevronLeft } from "lucide-react"
import { Form as BaseForm } from "@/components/forms/Form"
import { buttonVariants } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

const headerActionsAtom = atom<HTMLDivElement | null>(null)
const hasTabsAtom = atom(false)

const actionButtonsClassName =
  "flex shrink-0 items-center justify-end gap-2 [&_[data-slot=button]:not([data-panel-toggle])]:min-w-24 max-md:[&_[data-slot=button]:not([data-panel-toggle])]:flex-1"

type PageSlotProps = {
  children?: React.ReactNode
}

function Layout({ children }: PageSlotProps) {
  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden">
      {children}
    </div>
  )
}

function Header({ children }: PageSlotProps) {
  const setHeaderActions = useSetAtom(headerActionsAtom)

  return (
    <header
      data-slot="page-header"
      className="flex shrink-0 items-center gap-3 px-4 pt-7 pb-4 md:px-8 max-md:contents"
    >
      <div className="flex min-w-0 items-center gap-3 max-md:shrink-0 max-md:px-4 max-md:pt-7 max-md:pb-4 md:flex-1">
        {children}
      </div>
      <div
        ref={setHeaderActions}
        data-slot="page-header-actions"
        className={cn(
          actionButtonsClassName,
          "empty:hidden max-md:order-last max-md:border-t max-md:px-4 max-md:py-2"
        )}
      />
    </header>
  )
}

type PageBackProps = {
  render: React.ReactElement
  label: string
}

function Back({ render, label }: PageBackProps) {
  const link = useRender({
    defaultTagName: "a",
    render,
    props: {
      className: cn(
        buttonVariants({ variant: "secondary", size: "icon" }),
        "shrink-0 max-sm:-mr-2 max-sm:-ml-3 max-sm:size-8 max-sm:bg-transparent max-sm:hover:bg-transparent max-sm:[&_svg:not([class*='size-'])]:size-5"
      ),
      "aria-label": label,
      title: label,
      children: <ChevronLeft />,
    },
  })

  return (
    <>
      {link}
      <Separator orientation="vertical" className="h-auto max-sm:hidden" />
    </>
  )
}

function HeaderContent({ children }: PageSlotProps) {
  return <div className="flex min-w-0 flex-1 flex-col gap-0.5">{children}</div>
}

function Eyebrow({ children }: PageSlotProps) {
  return (
    <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
      {children}
    </div>
  )
}

function Title({ children }: PageSlotProps) {
  return (
    <h1 className="text-xl font-semibold tracking-tight max-sm:line-clamp-2">
      {children}
    </h1>
  )
}

function Subtitle({ children }: PageSlotProps) {
  return <p className="truncate text-[13px] text-muted-foreground">{children}</p>
}

function HeaderActions({ children }: PageSlotProps) {
  return (
    <div className="ml-auto flex shrink-0 items-center gap-2 self-start sm:self-auto">
      {children}
    </div>
  )
}

function Tabs({ children }: PageSlotProps) {
  const setHasTabs = useSetAtom(hasTabsAtom)

  return (
    <div
      ref={(el) => setHasTabs(el !== null)}
      data-slot="page-tabs"
      className="shrink-0 border-b px-4 pt-2 md:px-8"
    >
      {children}
    </div>
  )
}

function Body({ children }: PageSlotProps) {
  return (
    <div
      data-slot="page-body"
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      {children}
    </div>
  )
}

type PageFormProps = {
  onSubmit: () => void
  children: React.ReactNode
}

function Form({ onSubmit, children }: PageFormProps) {
  return (
    <BaseForm
      onSubmit={onSubmit}
      className="flex h-full flex-col [&_[data-slot=field-label]]:font-semibold"
    >
      {children}
    </BaseForm>
  )
}

type PageActionBarProps = {
  children: React.ReactNode
}

function ActionBar({ children }: PageActionBarProps) {
  const headerActions = useAtomValue(headerActionsAtom)
  const hasTabs = useAtomValue(hasTabsAtom)

  if (headerActions && !hasTabs) {
    return createPortal(
      <form noValidate className="contents">
        {children}
      </form>,
      headerActions
    )
  }

  return (
    <div
      data-slot="page-action-bar"
      className={cn(
        actionButtonsClassName,
        "px-4 py-2 max-md:order-last max-md:border-t md:px-8"
      )}
    >
      {children}
    </div>
  )
}

type PageScrollAreaProps = {
  children: React.ReactNode
}

function ScrollArea({ children }: PageScrollAreaProps) {
  return (
    <div className="h-full min-h-0 min-w-0 flex-1 overflow-y-auto">
      {children}
    </div>
  )
}

type PageContentProps = {
  children: React.ReactNode
}

function Content({ children }: PageContentProps) {
  return (
    <div className="flex flex-col gap-8 px-4 pt-1 pb-12 md:px-8 [&>section:first-child]:border-t-0 [&>section:first-child]:pt-0">
      {children}
    </div>
  )
}

export const Page = {
  Layout,
  Header,
  Back,
  HeaderContent,
  Eyebrow,
  Title,
  Subtitle,
  HeaderActions,
  Tabs,
  Body,
  Form,
  ActionBar,
  ScrollArea,
  Content,
}
