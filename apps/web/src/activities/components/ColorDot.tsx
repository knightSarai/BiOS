import type { ComponentProps, CSSProperties } from "react"
import { cn } from "@/lib/utils"
import { cssColor, isHexColor, type AreaColor } from "../areas"

// Custom colours are any hex, so the swatch comes in through a CSS variable rather than a fixed class.
const swatchStyle = (color: AreaColor) =>
  ({ "--swatch": cssColor(color) }) as CSSProperties

function ColorDot({
  color,
  className,
  ...props
}: Omit<ComponentProps<"span">, "color" | "style"> & {
  color: AreaColor | null
}) {
  return (
    <span
      {...props}
      style={color ? swatchStyle(color) : undefined}
      className={cn(
        "rounded-full",
        color ? "bg-(--swatch)" : "bg-muted-foreground",
        // Any hex is allowed, so a faint ring keeps near-black or near-white picks visible on either card.
        color && isHexColor(color) && "ring-1 ring-foreground/15",
        className
      )}
    />
  )
}

export { ColorDot, swatchStyle }
