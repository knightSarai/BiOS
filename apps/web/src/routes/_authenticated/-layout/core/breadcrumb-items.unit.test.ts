import { FileText } from "lucide-react"
import { describe, expect, it } from "vitest"
import { breadcrumbItems } from "./breadcrumb-items"

const Title = () => null

const match = (
  pathname: string,
  status: "pending" | "success" | "error" | "notFound",
  crumb?: { label: string; Title?: typeof Title }
) => ({ pathname, status, staticData: crumb ? { crumb } : {} })

describe("breadcrumbItems", () => {
  it("keeps only matches that declare a crumb", () => {
    const items = breadcrumbItems([
      match("/", "success"),
      match("/w/documents", "success", { label: "Documents" }),
    ])
    expect(items.map((item) => [item.label, item.to])).toEqual([
      ["Documents", "/w/documents"],
    ])
  })

  it("keeps a loaded match's Title", () => {
    const [item] = breadcrumbItems([
      match("/w/documents/1", "success", { label: "Document", Title }),
    ])
    expect(item?.Title).toBe(Title)
  })

  it.each(["pending", "error", "notFound"] as const)(
    "drops the Title of a %s match and keeps its label",
    (status) => {
      const [item] = breadcrumbItems([
        match("/w/documents/1", status, { label: "Document", Title }),
      ])
      expect(item?.Title).toBeUndefined()
      expect(item?.label).toBe("Document")
    }
  )

  it("keeps the icon of a pending crumb", () => {
    const [item] = breadcrumbItems([
      {
        pathname: "/w/documents",
        status: "pending",
        staticData: { crumb: { label: "Documents", icon: FileText } },
      },
    ])
    expect(item?.icon).toBe(FileText)
  })
})
