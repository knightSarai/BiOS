import type { FilterFn, RowData, TableFeatures } from "@tanstack/react-table"
import { rankItem } from "@tanstack/match-sorter-utils"

const fuzzyFilter: FilterFn<TableFeatures, RowData> = (
  row,
  columnId,
  value,
  addMeta
) => {
  const itemRank = rankItem(row.getValue(columnId), value as string)
  addMeta?.({ itemRank })
  return itemRank.passed
}

export { fuzzyFilter }
