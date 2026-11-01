import DOMPurify from "dompurify"

const LOCAL_URL = /url\(\s*(["']?)#[^)"']*\1\s*\)/gi
// Escapes are banned outright because CSS lets them spell `url(` in disguise.
const FETCHING_CSS = /url\(|@import|image-set\(|\\/i

// Mermaid only points at its own markers (`url(#arrow)`); anything else in a
// cached preview could make the viewer's browser fetch from another host.
const isSafeCss = (css: string) =>
  !FETCHING_CSS.test(css.replace(LOCAL_URL, ""))

let purifier: ReturnType<typeof DOMPurify> | undefined

const createPurifier = () => {
  const instance = DOMPurify(window)
  instance.addHook("uponSanitizeElement", (node, event) => {
    if (event.tagName === "style" && !isSafeCss(node.textContent ?? "")) {
      node.textContent = ""
    }
  })
  instance.addHook("afterSanitizeAttributes", (element) => {
    for (const { name, value } of [...element.attributes]) {
      const isLink = name === "href" || name === "xlink:href"
      if ((isLink && !value.startsWith("#")) || !isSafeCss(value)) {
        element.removeAttribute(name)
      }
    }
  })
  return instance
}

// Previews can arrive from other devices, so they are treated as untrusted:
// no scripts, external links, images or fetching CSS. Callers put the result in
// its own shadow root so its <style> can't reach the page.
const sanitizeSvg = (svg: string) => {
  purifier ??= createPurifier()
  return purifier.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ["image", "foreignObject"],
    RETURN_DOM_FRAGMENT: true,
  })
}

export { isSafeCss, sanitizeSvg }
