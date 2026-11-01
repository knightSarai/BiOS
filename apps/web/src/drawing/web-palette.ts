import type { DrawingColor, Palette } from "@knight-os/drawing"

const colorVar = (token: DrawingColor) =>
  token === "foreground"
    ? "var(--foreground)"
    : token === "muted"
      ? "var(--muted-foreground)"
      : `var(--${token})`

// CSS variables, so drawings follow the light or dark theme without re-rendering.
const webPalette: Palette = {
  color: colorVar,
  fill: (token) =>
    `color-mix(in oklch, ${colorVar(token)} 24%, var(--background))`,
  canvas: "var(--background)",
  ink: "var(--foreground)",
  muted: "var(--muted-foreground)",
}

export { colorVar, webPalette }
