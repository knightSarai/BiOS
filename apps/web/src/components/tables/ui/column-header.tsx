import type { Column, Header, RowData } from "@tanstack/react-table"
import { flexRender, Subscribe } from "@tanstack/react-table"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronsUpDownIcon,
  PinIcon,
  PinOffIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import type { AppTableFeatures } from "../table-features"

function DataTableColumnHeader<TData extends RowData>({
  header,
}: {
  header: Header<AppTableFeatures, TData, unknown>
}) {
  const { column } = header
  const content = header.isPlaceholder
    ? null
    : flexRender(column.columnDef.header, header.getContext())

  if (!column.getCanSort()) {
    return <span className="text-sm">{content}</span>
  }

  return (
    <Button
      variant="ghost"
      size="xs"
      className="-ml-2 gap-1 text-sm"
      onClick={column.getToggleSortingHandler()}
    >
      <span>{content}</span>
      <Subscribe
        source={column.table.atoms.sorting}
        selector={(sorting) =>
          sorting.find((sort) => sort.id === column.id)?.desc
        }
      >
        {(desc) =>
          desc === undefined ? (
            <ChevronsUpDownIcon className="size-3" />
          ) : desc ? (
            <ArrowDownIcon className="size-3" />
          ) : (
            <ArrowUpIcon className="size-3" />
          )
        }
      </Subscribe>
    </Button>
  )
}

function ColumnResizeHandle<TData extends RowData>({
  header,
}: {
  header: Header<AppTableFeatures, TData, unknown>
}) {
  return (
    <Subscribe
      source={header.column.table.atoms.columnResizing}
      selector={(resizing) => resizing.isResizingColumn === header.column.id}
    >
      {(isResizing) => (
        <div
          onMouseDown={header.getResizeHandler()}
          onTouchStart={header.getResizeHandler()}
          onDoubleClick={() => header.column.resetSize()}
          className={cn(
            "absolute top-0 right-0 z-10 h-full w-1 cursor-col-resize touch-none select-none",
            "opacity-0 group-hover/row:opacity-100 [tr:hover_&]:opacity-100",
            "bg-border hover:bg-primary/60",
            isResizing && "bg-primary opacity-100!"
          )}
        />
      )}
    </Subscribe>
  )
}

function PinToggle<TData extends RowData>({
  column,
}: {
  column: Column<AppTableFeatures, TData, unknown>
}) {
  return (
    <Subscribe
      source={column.table.atoms.columnPinning}
      selector={(pinning) =>
        pinning.start.includes(column.id) || pinning.end.includes(column.id)
      }
    >
      {(isPinned) => (
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => column.pin(isPinned ? false : "start")}
        >
          {isPinned ? (
            <PinOffIcon className="size-3" />
          ) : (
            <PinIcon className="size-3" />
          )}
        </Button>
      )}
    </Subscribe>
  )
}

export { DataTableColumnHeader, ColumnResizeHandle, PinToggle }
