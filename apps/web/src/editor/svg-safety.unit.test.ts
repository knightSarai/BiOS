import { describe, expect, it } from "vitest"
import { isSafeCss } from "./svg-safety"

describe("isSafeCss", () => {
  it.each([
    "fill:#fde68a !important;stroke:#d97706",
    "#mermaid-1 .node rect{fill:#f1eef0;stroke:#cfc9cc}",
    "url(#mermaid-1_flowchart-v2-pointEnd)",
    "marker-end: url( '#arrowhead' )",
    'font-family:"Inter Variable", Inter, sans-serif',
  ])("keeps %j", (css) => {
    expect(isSafeCss(css)).toBe(true)
  })

  it.each([
    "background:url(https://tracker.example/p.png)",
    "background:url( 'https://tracker.example/p.png' )",
    "fill:url(#ok) url(//tracker.example/p)",
    '@import "https://tracker.example/x.css";',
    "@font-face{src:url(data:font/woff2;base64,AAAA)}",
    'background:image-set("https://tracker.example/p.png" 1x)',
    "background:\\75 rl(https://tracker.example/p.png)",
  ])("rejects %j", (css) => {
    expect(isSafeCss(css)).toBe(false)
  })
})
