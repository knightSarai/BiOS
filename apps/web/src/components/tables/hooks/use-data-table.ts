import { useMemo } from "react"
import { useAtom } from "jotai"
import { useTable } from "@tanstack/react-table"
import type {
  ColumnDef,
  ColumnPinningState,
  OnChangeFn,
  RowData,
  RowSelectionState,
} from "@tanstack/react-table"

import { atomWithDebounce } from "../atoms.ts"
import { appTableFeatures, type AppTableFeatures } from "../table-features"
import { getColumnSizeVars } from "./column-size-vars"

type UseDataTableOptions<TData extends RowData> = {
  columns: ColumnDef<AppTableFeatures, TData, unknown>[]
  data: TData[]
  initialColumnPinning?: ColumnPinningState
  pageSize?: number
  getRowId?: (row: TData, index: number) => string
  enableRowSelection?: boolean
  rowSelection?: RowSelectionState
  onRowSelectionChange?: OnChangeFn<RowSelectionState>
}

function useDataTable<TData extends RowData>({
  columns,
  data,
  initialColumnPinning = { start: [], end: [] },
  pageSize,
  getRowId,
  enableRowSelection,
  rowSelection,
  onRowSelectionChange,
}: UseDataTableOptions<TData>) {
  const globalFilterAtoms = useMemo(() => atomWithDebounce("", 500), [])
  const [debouncedFilter, setFilter] = useAtom(
    globalFilterAtoms.debouncedValueAtom
  )

  const table = useTable({
    features: appTableFeatures,
    data,
    columns,
    getRowId,
    state: {
      globalFilter: debouncedFilter,
      ...(rowSelection !== undefined && { rowSelection }),
    },
    enableRowSelection,
    enableRowRangeSelection: false,
    onRowSelectionChange,
    onGlobalFilterChange: setFilter,
    globalFilterFn: "fuzzy",
    manualPagination: pageSize === undefined,
    enableColumnResizing: true,
    columnResizeMode: "onChange",
    defaultColumn: {
      size: 200,
      minSize: 50,
      maxSize: 500,
    },
    initialState: {
      columnPinning: initialColumnPinning,
      ...(pageSize !== undefined && {
        pagination: { pageIndex: 0, pageSize },
      }),
    },
  })

  const columnSizeVars = getColumnSizeVars(table)

  return {
    table,
    columnSizeVars,
    globalFilterAtoms,
    isResizing: Boolean(table.state.columnResizing.isResizingColumn),
  }
}

export { useDataTable }
export type { UseDataTableOptions }
