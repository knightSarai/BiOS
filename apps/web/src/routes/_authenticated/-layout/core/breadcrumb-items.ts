import type { AnyRouteMatch } from "@tanstack/react-router"

type CrumbMatch = Pick<AnyRouteMatch, "staticData" | "pathname" | "status">

// A crumb's Title reads its route's context, which stays empty until the match
// has loaded. Client-only (ssr: false) routes are still pending while the
// server-rendered shell hydrates.
const breadcrumbItems = (matches: readonly CrumbMatch[]) =>
  matches.flatMap((match) => {
    const crumb = match.staticData.crumb
    if (!crumb) return []
    const Title = match.status === "success" ? crumb.Title : undefined
    return [{ ...crumb, Title, to: match.pathname }]
  })

export { breadcrumbItems }
