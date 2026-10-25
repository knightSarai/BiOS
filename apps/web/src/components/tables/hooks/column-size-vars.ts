import type { ReactTable, RowData } from "@tanstack/react-table"

import type { AppTableFeatures } from "../table-features"

function getColumnSizeVars<TData extends RowData>(
  table: ReactTable<AppTableFeatures, TData>
) {
  const vars: Record<string, number> = {}
  for (const header of table.getFlatHeaders()) {
    vars[`--col-${header.column.id}-size`] = header.column.getSize()
  }
  return vars
}

export { getColumnSizeVars }
