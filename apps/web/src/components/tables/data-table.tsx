import { flexRender, Subscribe } from "@tanstack/react-table"
import type {
  ColumnDef,
  ColumnPinningState,
  Row,
  RowData,
  Table as TanstackTable,
} from "@tanstack/react-table"
import { memo, useMemo } from "react"
import { atom, useAtomValue, type Atom } from "jotai"
import { EyeOffIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { createClickIntent, type ClickIntent } from "@/lib/click-intent"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import DataTablePagination from "./data-table-pagination"

import { useDataTable } from "./hooks/use-data-table"
import { getCommonPinningStyles } from "./pinning-styles.ts"
import { DataTableSearch } from "./ui/search.tsx"
import { DataTableViewOptions } from "./ui/view-options.tsx"
import {
  ColumnResizeHandle,
  DataTableColumnHeader,
  PinToggle,
} from "./ui/column-header.tsx"
import { DataTableLoadingBody } from "./ui/loading-body.tsx"
import type { AppTableFeatures } from "./table-features"

const defaultHighlightAtom = atom<string | null>(null)

type RowClickHandler = ClickIntent

type DataTableRowProps<TData extends RowData> = {
  row: Row<AppTableFeatures, TData>
  columns: TanstackTable<AppTableFeatures, TData>["options"]["columns"]
  highlightedRowIdAtom: Atom<string | null>
  rowClickHandler: RowClickHandler
  onRowClick?: (row: TData) => void
  onRowDoubleClick?: (row: TData) => void
}

function DataTableRow<TData extends RowData>({
  row,
  columns,
  highlightedRowIdAtom,
  rowClickHandler,
  onRowClick,
  onRowDoubleClick,
}: DataTableRowProps<TData>) {
  const isHighlightedAtom = useMemo(
    () => atom((get) => get(highlightedRowIdAtom) === row.id),
    [highlightedRowIdAtom, row.id]
  )
  const isHighlighted = useAtomValue(isHighlightedAtom)

  const handleRowClick = onRowClick
    ? () => {
        if (!onRowDoubleClick) return onRowClick(row.original)
        rowClickHandler.debouncedClick(() => onRowClick(row.original))
      }
    : undefined
  const handleRowDoubleClick = onRowDoubleClick
    ? () => rowClickHandler.immediateClick(() => onRowDoubleClick(row.original))
    : undefined
  return (
    <TableRow
      data-highlighted={isHighlighted ? "true" : undefined}
      onClick={handleRowClick}
      onDoubleClick={handleRowDoubleClick}
      className={cn(
        "group/row",
        (handleRowClick || handleRowDoubleClick) && "cursor-pointer"
      )}
    >
      <Subscribe
        source={row.table.store}
        selector={(state) => ({
          columns,
          columnPinning: state.columnPinning,
          columnVisibility: state.columnVisibility,
          isResizingColumn: state.columnResizing.isResizingColumn,
        })}
      >
        {() =>
          row.getVisibleCells().map((cell) => {
            const isPinned = cell.column.getIsPinned()
            return (
              <TableCell
                key={cell.id}
                style={getCommonPinningStyles(cell.column)}
                className={cn(
                  "overflow-hidden bg-background text-ellipsis",
                  "group-hover/row:bg-muted/50",
                  "group-data-[highlighted=true]/row:bg-muted/50",
                  "empty:text-center empty:before:text-muted-foreground empty:before:content-['—']",
                  isPinned === "start" &&
                    "border-r border-border/50 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)]",
                  isPinned === "end" &&
                    "border-l border-border/50 shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.06)]"
                )}
              >
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </TableCell>
            )
          })
        }
      </Subscribe>
    </TableRow>
  )
}

type DataTableHeaderSectionProps<TData extends RowData> = {
  table: TanstackTable<AppTableFeatures, TData>
}

function DataTableHeaderSection<TData extends RowData>({
  table,
}: DataTableHeaderSectionProps<TData>) {
  return (
    <TableHeader>
      {table.getHeaderGroups().map((headerGroup) => (
        <TableRow key={headerGroup.id} className="hover:bg-transparent">
          {headerGroup.headers.map((header) => {
            const isPinned = header.column.getIsPinned()
            return (
              <TableHead
                key={header.id}
                colSpan={header.colSpan}
                style={getCommonPinningStyles(header.column)}
                className={cn(
                  "bg-background",
                  isPinned === "start" &&
                    "border-r border-border/50 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)]",
                  isPinned === "end" &&
                    "border-l border-border/50 shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.06)]"
                )}
              >
                {header.isPlaceholder ? null : (
                  <div className="flex items-center gap-1">
                    <DataTableColumnHeader header={header} />
                    {header.column.getCanPin() && (
                      <PinToggle column={header.column} />
                    )}
                    {header.column.getCanHide() && (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="size-5"
                        onClick={() => header.column.toggleVisibility(false)}
                      >
                        <EyeOffIcon className="size-3" />
                      </Button>
                    )}
                  </div>
                )}
                {header.column.getCanResize() && (
                  <ColumnResizeHandle header={header} />
                )}
              </TableHead>
            )
          })}
        </TableRow>
      ))}
    </TableHeader>
  )
}

type DataTableBodyProps<TData extends RowData> = {
  table: TanstackTable<AppTableFeatures, TData>
  columnsLength: number
  onRowClick?: (row: TData) => void
  onRowDoubleClick?: (row: TData) => void
  highlightedRowIdAtom: Atom<string | null>
  rowClickHandler: RowClickHandler
}

function DataTableBody<TData extends RowData>({
  table,
  columnsLength,
  onRowClick,
  onRowDoubleClick,
  highlightedRowIdAtom,
  rowClickHandler,
}: DataTableBodyProps<TData>) {
  const rows = table.getRowModel().rows
  if (!rows.length) {
    return (
      <TableBody>
        <TableRow>
          <TableCell
            colSpan={columnsLength}
            className="h-24 text-center text-muted-foreground"
          >
            No results.
          </TableCell>
        </TableRow>
      </TableBody>
    )
  }
  return (
    <TableBody>
      {rows.map((row) => (
        <DataTableRow
          key={row.id}
          row={row}
          columns={table.options.columns}
          highlightedRowIdAtom={highlightedRowIdAtom}
          rowClickHandler={rowClickHandler}
          onRowClick={onRowClick}
          onRowDoubleClick={onRowDoubleClick}
        />
      ))}
    </TableBody>
  )
}

const MemoDataTableBody = memo(
  DataTableBody,
  (prev, next) =>
    prev.table.options.data === next.table.options.data &&
    prev.onRowClick === next.onRowClick &&
    prev.onRowDoubleClick === next.onRowDoubleClick &&
    prev.highlightedRowIdAtom === next.highlightedRowIdAtom &&
    prev.rowClickHandler === next.rowClickHandler
) as typeof DataTableBody

type DataTableProps<TData extends RowData> = {
  columns: ColumnDef<AppTableFeatures, TData, unknown>[]
  data: TData[]
  initialColumnPinning?: ColumnPinningState
  isLoading?: boolean
  onRowClick?: (row: TData) => void
  onRowDoubleClick?: (row: TData) => void
  toolbarAfterSearch?: React.ReactNode
  searchPlaceholder?: string
  getRowId?: (row: TData, index: number) => string
  highlightedRowIdAtom?: Atom<string | null>
}

function DataTable<TData extends RowData>({
  columns,
  data,
  initialColumnPinning,
  isLoading = false,
  onRowClick,
  onRowDoubleClick,
  toolbarAfterSearch,
  searchPlaceholder,
  getRowId,
  highlightedRowIdAtom = defaultHighlightAtom,
}: DataTableProps<TData>) {
  const { table, columnSizeVars, globalFilterAtoms, isResizing } = useDataTable(
    {
      columns,
      data,
      initialColumnPinning,
      pageSize: 100,
      getRowId,
    }
  )

  const rowClickHandler = useMemo(() => createClickIntent(), [])

  const hasHeaders = columns.some((c) => c.header !== undefined)

  return (
    <div className="flex flex-col gap-3 py-6">
      <div className="flex items-center justify-between gap-2 px-6">
        <div className="flex items-center gap-2">
          <DataTableSearch
            filterAtoms={globalFilterAtoms}
            placeholder={searchPlaceholder}
          />
          {toolbarAfterSearch}
        </div>
        <DataTableViewOptions table={table} />
      </div>

      <div className="overflow-auto border-y">
        <Table style={{ tableLayout: "fixed", ...columnSizeVars }}>
          {hasHeaders && <DataTableHeaderSection table={table} />}
          {isLoading ? (
            <DataTableLoadingBody table={table} />
          ) : isResizing ? (
            <MemoDataTableBody
              table={table}
              columnsLength={columns.length}
              onRowClick={onRowClick}
              onRowDoubleClick={onRowDoubleClick}
              highlightedRowIdAtom={highlightedRowIdAtom}
              rowClickHandler={rowClickHandler}
            />
          ) : (
            <DataTableBody
              table={table}
              columnsLength={columns.length}
              onRowClick={onRowClick}
              onRowDoubleClick={onRowDoubleClick}
              highlightedRowIdAtom={highlightedRowIdAtom}
              rowClickHandler={rowClickHandler}
            />
          )}
        </Table>
      </div>
      <div className="px-6">
        <DataTablePagination table={table} />
      </div>
    </div>
  )
}

export { DataTable }
export type { DataTableProps }
