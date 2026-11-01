const svgNamespace = "http://www.w3.org/2000/svg"

const createIconGlyphElement = (
  paths: readonly string[],
  className: string
) => {
  const svg = document.createElementNS(svgNamespace, "svg")
  svg.setAttribute("viewBox", "0 0 256 256")
  svg.setAttribute("fill", "currentColor")
  svg.setAttribute("aria-hidden", "true")
  svg.setAttribute("class", className)
  for (const d of paths) {
    const path = document.createElementNS(svgNamespace, "path")
    path.setAttribute("d", d)
    svg.append(path)
  }
  return svg
}

export { createIconGlyphElement }
