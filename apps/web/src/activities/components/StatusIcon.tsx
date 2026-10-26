import { statusIcons, type ActivityStatus } from "../status"

type StatusIconProps = {
  status: ActivityStatus
  className?: string
}

function StatusIcon({ status, className }: StatusIconProps) {
  const icon = statusIcons[status]
  return (
    <svg
      viewBox="0 0 14 14"
      aria-hidden
      className={className ?? "size-3.5 shrink-0"}
    >
      <circle
        cx="7"
        cy="7"
        r="6"
        fill="none"
        strokeWidth="1.5"
        stroke={icon.color}
        strokeDasharray={icon.dash}
      />
      <circle
        cx="7"
        cy="7"
        r="3"
        transform="rotate(-90 7 7)"
        fill="none"
        strokeWidth="6"
        stroke={icon.color}
        strokeDasharray={icon.pie}
      />
      {icon.check ? (
        <path
          d="M4.4 7.1l1.7 1.7 3.5-3.6"
          fill="none"
          stroke="var(--color-background)"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
      {icon.cross ? (
        <path
          d="M5 5l4 4M9 5l-4 4"
          fill="none"
          stroke={icon.color}
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      ) : null}
    </svg>
  )
}

export { StatusIcon }
