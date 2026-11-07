import { useQuery } from "@tanstack/react-query"
import { useParams, useRouteContext } from "@tanstack/react-router"
import { ColorDot } from "@/activities/components/ColorDot"
import { areasQuery } from "@/local-db/activity-queries"
import { PageCrumb } from "@layout/core/PageCrumb"

const ROUTE_ID = "/_authenticated/$workspace/_app/areas/$areaId"

function AreaCrumb() {
  const { areaId } = useParams({ from: ROUTE_ID })
  const { workspace } = useRouteContext({ from: ROUTE_ID })
  const { data: areas } = useQuery(areasQuery(workspace))
  const area = areas?.find((candidate) => candidate.id === areaId)
  if (!area) return <PageCrumb>Area</PageCrumb>

  return (
    <PageCrumb
      icon={<ColorDot color={area.color} className="mx-1 size-2 shrink-0" />}
    >
      <span dir="auto" className="truncate">
        {area.name}
      </span>
    </PageCrumb>
  )
}

export { AreaCrumb }
