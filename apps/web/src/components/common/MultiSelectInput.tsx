import type { ReactNode } from "react"
import type { Combobox as ComboboxPrimitive } from "@base-ui/react"

import { cn } from "@/lib/utils"
import { InputGroupButton } from "@/components/ui/input-group"
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxClear,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
  useComboboxAnchor,
} from "@/components/ui/combobox"

export type MultiSelectOption<TValue extends number | string> = {
  value: TValue
  label: string
  icon?: ReactNode
}

function MultiSelectItem({
  value,
  label,
  icon,
}: MultiSelectOption<number | string>) {
  return (
    <ComboboxItem value={value}>
      {icon}
      {label}
    </ComboboxItem>
  )
}

export function MultiSelectInput<TValue extends number | string>({
  options,
  selectedOptions = [],
  value,
  onChange,
  placeholder = "Search...",
  emptyMessage = "No results found.",
  maxVisibleChips,
  showClear = false,
  showTrigger = false,
  onBlur,
  onSearch,
  id,
  className,
}: {
  options: ReadonlyArray<MultiSelectOption<TValue>>
  selectedOptions?: ReadonlyArray<MultiSelectOption<TValue>>
  value: TValue[]
  onChange: (
    value: TValue[],
    reason: ComboboxPrimitive.Root.ChangeEventReason
  ) => void
  placeholder?: string
  emptyMessage?: string
  maxVisibleChips?: number
  showClear?: boolean
  showTrigger?: boolean
  onBlur?: () => void
  onSearch?: (term: string) => void
  id?: string
  className?: string
}) {
  const optionByValue = new Map(
    [...selectedOptions, ...options].map((option) => [option.value, option])
  )
  const items = options.map((option) => option.value)
  const anchorRef = useComboboxAnchor()

  return (
    <Combobox
      items={items}
      multiple
      value={value}
      onValueChange={(next: TValue[], { reason }) => onChange(next, reason)}
      itemToStringLabel={(item: TValue) => optionByValue.get(item)?.label ?? ""}
      filter={onSearch ? null : undefined}
      onInputValueChange={(term, eventDetails) => {
        if (!onSearch || eventDetails.reason === "item-press") return
        if (eventDetails.reason === "input-clear" && eventDetails.isItemPress) {
          eventDetails.cancel()
          return
        }
        onSearch(term)
      }}
      onOpenChangeComplete={(open) => {
        if (!open) onSearch?.("")
      }}
    >
      <ComboboxChips
        ref={anchorRef}
        className={cn(
          "group/input-group",
          maxVisibleChips != null && "flex-nowrap",
          className
        )}
      >
        <div
          className={cn(
            "flex min-w-0 flex-1 items-center gap-1",
            maxVisibleChips != null
              ? "flex-nowrap overflow-hidden"
              : "flex-wrap"
          )}
        >
          <ComboboxValue>
            {(selected: TValue[]) => {
              const visible =
                maxVisibleChips != null
                  ? selected.slice(0, maxVisibleChips)
                  : selected
              const overflow = selected.length - visible.length
              return (
                <>
                  {visible.map((item) => {
                    const option = optionByValue.get(item)
                    if (!option) return null
                    return (
                      <ComboboxChip key={item} aria-label={option.label}>
                        {option.icon}
                        {option.label}
                      </ComboboxChip>
                    )
                  })}
                  {overflow > 0 && (
                    <ComboboxChip
                      aria-label={`${overflow} more`}
                      showRemove={false}
                    >
                      +{overflow}
                    </ComboboxChip>
                  )}
                </>
              )
            }}
          </ComboboxValue>
          <ComboboxChipsInput
            id={id}
            placeholder={value.length === 0 ? placeholder : undefined}
            onBlur={onBlur}
            className="placeholder:text-muted-foreground"
          />
        </div>
        {showClear && (
          <ComboboxClear aria-label="Clear selection" className="shrink-0" />
        )}
        {showTrigger && (
          <ComboboxTrigger
            render={<InputGroupButton variant="ghost" size="icon-xs" />}
            aria-label="Open"
            className="shrink-0 group-has-data-[slot=combobox-clear]/input-group:hidden"
          />
        )}
      </ComboboxChips>
      <ComboboxContent anchor={anchorRef}>
        <ComboboxEmpty>{emptyMessage}</ComboboxEmpty>
        <ComboboxList>
          {(item: TValue) => {
            const option = optionByValue.get(item)
            if (!option) return null
            return (
              <MultiSelectItem
                key={item}
                value={option.value}
                label={option.label}
                icon={option.icon}
              />
            )
          }}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
