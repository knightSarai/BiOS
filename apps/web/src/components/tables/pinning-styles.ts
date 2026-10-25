import type {
  Column,
  ColumnPinningPosition,
  RowData,
} from "@tanstack/react-table"

import type { AppTableFeatures } from "./table-features"

function getCommonPinningStyles<TData extends RowData>(
  column: Column<AppTableFeatures, TData, unknown>
): React.CSSProperties {
  const isPinned = column.getIsPinned()

  return {
    left: isPinned === "start" ? `${column.getStart("start")}px` : undefined,
    right: isPinned === "end" ? `${column.getAfter("end")}px` : undefined,
    position: isPinned ? "sticky" : "relative",
    zIndex: isPinned ? 1 : 0,
    width: `calc(var(--col-${column.id}-size) * 1px)`,
  }
}

function getPinnedBorderClasses(isPinned: ColumnPinningPosition): string {
  if (isPinned === "start") {
    return "border-r border-border/50 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)]"
  }
  if (isPinned === "end") {
    return "border-l border-border/50 shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.06)]"
  }
  return ""
}

export { getCommonPinningStyles, getPinnedBorderClasses }
