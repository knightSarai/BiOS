import {
  Heading1,
  Heading2,
  Heading3,
  List,
  ListChecks,
  ListCollapse,
  ListOrdered,
  Minus,
  SquareCode,
  TextQuote,
  Type,
  type LucideIcon,
} from "lucide-react"
import type { BlockKind } from "../block-catalog"

const blockIcons: Record<BlockKind, LucideIcon> = {
  paragraph: Type,
  heading1: Heading1,
  heading2: Heading2,
  heading3: Heading3,
  bullet_list: List,
  ordered_list: ListOrdered,
  task_list: ListChecks,
  blockquote: TextQuote,
  code_block: SquareCode,
  collapsible: ListCollapse,
  horizontal_rule: Minus,
}

export { blockIcons }
