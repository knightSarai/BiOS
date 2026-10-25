import { Subscribe } from "@tanstack/react-table"
import type { Table as TanstackTable, RowData } from "@tanstack/react-table"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import type { AppTableFeatures } from "./table-features"

export default function DataTablePagination<TData extends RowData>({
  table,
}: {
  table: TanstackTable<AppTableFeatures, TData>
}) {
  return (
    <Subscribe source={table.atoms.pagination}>
      {(pagination) => (
        <div className="flex flex-col items-center gap-2 px-1 md:grid md:grid-cols-3">
          <p className="text-xs whitespace-nowrap text-muted-foreground">
            Showing {table.getRowModel().rows.length} of{" "}
            {table.getFilteredRowModel().rows.length} rows
          </p>
          <div className="flex items-center justify-center gap-4">
            <p className="text-xs whitespace-nowrap text-muted-foreground">
              Page {pagination.pageIndex + 1} of {table.getPageCount()}
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon-xs"
                onClick={() => table.firstPage()}
                disabled={!table.getCanPreviousPage()}
              >
                <ChevronsLeftIcon />
              </Button>
              <Button
                variant="outline"
                size="icon-xs"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                <ChevronLeftIcon />
              </Button>
              <Button
                variant="outline"
                size="icon-xs"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                <ChevronRightIcon />
              </Button>
              <Button
                variant="outline"
                size="icon-xs"
                onClick={() => table.lastPage()}
                disabled={!table.getCanNextPage()}
              >
                <ChevronsRightIcon />
              </Button>
            </div>
          </div>
        </div>
      )}
    </Subscribe>
  )
}
