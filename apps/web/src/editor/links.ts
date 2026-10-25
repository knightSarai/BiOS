const SAFE_SCHEME = /^(https?|mailto|tel):/i
const ANY_SCHEME = /^[a-z][a-z0-9+.-]*:/i

const isSafeHref = (href: string) =>
  SAFE_SCHEME.test(href) || !ANY_SCHEME.test(href)

const normalizeHref = (raw: string) => {
  const value = raw.trim()
  if (!value) return ""
  if (value.startsWith("/") || value.startsWith("#")) return value
  if (ANY_SCHEME.test(value)) return isSafeHref(value) ? value : ""
  return `https://${value}`
}

export { isSafeHref, normalizeHref }
