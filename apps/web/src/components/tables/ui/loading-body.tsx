import type { RowData, Table as TanstackTable } from "@tanstack/react-table"

import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
import { TableBody, TableCell, TableRow } from "@/components/ui/table"
import {
  getCommonPinningStyles,
  getPinnedBorderClasses,
} from "../pinning-styles"
import type { AppTableFeatures } from "../table-features"

const LOADING_ROW_COUNT_PAGINATED = 10

function DataTableLoadingBody<TData extends RowData>({
  table,
}: {
  table: TanstackTable<AppTableFeatures, TData>
}) {
  const leafColumns = table.getVisibleLeafColumns()
  return (
    <TableBody>
      {Array.from({ length: LOADING_ROW_COUNT_PAGINATED }).map(
        (_, rowIndex) => (
          <TableRow key={rowIndex}>
            {leafColumns.map((column) => {
              const isPinned = column.getIsPinned()
              return (
                <TableCell
                  key={column.id}
                  style={getCommonPinningStyles(column)}
                  className={cn(
                    "bg-background",
                    getPinnedBorderClasses(isPinned)
                  )}
                >
                  <Skeleton className="h-4 w-full" />
                </TableCell>
              )
            })}
          </TableRow>
        )
      )}
    </TableBody>
  )
}

export { DataTableLoadingBody }
