import { cn } from "@/lib/utils"

const RADIUS = 5.5
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

function ProgressRing({
  done,
  total,
  className,
}: {
  done: number
  total: number
  className?: string
}) {
  const filled = total === 0 ? 0 : (done / total) * CIRCUMFERENCE
  return (
    <svg
      viewBox="0 0 14 14"
      aria-hidden
      className={cn("size-3.5 shrink-0 -rotate-90", className)}
    >
      <circle
        cx="7"
        cy="7"
        r={RADIUS}
        fill="none"
        strokeWidth="1.5"
        className="stroke-border"
      />
      <circle
        cx="7"
        cy="7"
        r={RADIUS}
        fill="none"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeDasharray={`${filled} ${CIRCUMFERENCE}`}
        className="stroke-accent-text"
      />
    </svg>
  )
}

function SubActivityProgress({
  done,
  total,
  className,
}: {
  done: number
  total: number
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums",
        className
      )}
    >
      <ProgressRing done={done} total={total} />
      <span aria-hidden>
        {done}/{total}
      </span>
      <span className="sr-only">
        {done} of {total} sub-activities done
      </span>
    </span>
  )
}

export { SubActivityProgress }
