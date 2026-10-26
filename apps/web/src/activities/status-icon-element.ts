import { statusIcons, type ActivityStatus } from "./status"

const svgNamespace = "http://www.w3.org/2000/svg"

const svgElement = (tag: string, attributes: Record<string, string>) => {
  const element = document.createElementNS(svgNamespace, tag)
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value)
  }
  return element
}

const createStatusIconElement = (status: ActivityStatus) => {
  const icon = statusIcons[status]
  const svg = svgElement("svg", {
    viewBox: "0 0 14 14",
    width: "14",
    height: "14",
    "aria-hidden": "true",
  })
  svg.append(
    svgElement("circle", {
      cx: "7",
      cy: "7",
      r: "6",
      fill: "none",
      "stroke-width": "1.5",
      stroke: icon.color,
      "stroke-dasharray": icon.dash,
    }),
    svgElement("circle", {
      cx: "7",
      cy: "7",
      r: "3",
      transform: "rotate(-90 7 7)",
      fill: "none",
      "stroke-width": "6",
      stroke: icon.color,
      "stroke-dasharray": icon.pie,
    })
  )
  if (icon.check) {
    svg.append(
      svgElement("path", {
        d: "M4.4 7.1l1.7 1.7 3.5-3.6",
        fill: "none",
        stroke: "var(--color-background)",
        "stroke-width": "1.6",
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
      })
    )
  }
  if (icon.cross) {
    svg.append(
      svgElement("path", {
        d: "M5 5l4 4M9 5l-4 4",
        fill: "none",
        stroke: icon.color,
        "stroke-width": "1.4",
        "stroke-linecap": "round",
      })
    )
  }
  return svg
}

export { createStatusIconElement }
