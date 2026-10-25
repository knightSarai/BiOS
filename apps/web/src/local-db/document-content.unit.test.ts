import "fake-indexeddb/auto"
import { afterEach, describe, expect, it } from "vitest"
import { DexieYProvider } from "y-dexie"
import {
  prosemirrorToYXmlFragment,
  yXmlFragmentToProseMirrorRootNode,
} from "y-prosemirror"
import {
  DOCUMENT_FRAGMENT,
  seedDocument,
  titleOf,
} from "@/editor/document-content"
import { doc, p, title, ul, li } from "@/editor/editor-test-utils"
import { schema } from "@/editor/schema"
import { createLocalDb, type LocalDb } from "./db"
import { DocumentsRepository } from "./documents"

const openDbs: LocalDb[] = []

afterEach(async () => {
  await Promise.all(openDbs.splice(0).map((db) => db.delete()))
})

const openContent = async (repo: DocumentsRepository, id: string) => {
  const row = await repo.byId(id)
  if (!row) throw new Error("Document row missing")
  const provider = DexieYProvider.load(row.content)
  await provider.whenLoaded
  return row.content
}

describe("document content in IndexedDB", () => {
  it("keeps edits across closing and reopening a document", async () => {
    const db = createLocalDb(`content-test-${crypto.randomUUID()}`)
    openDbs.push(db)
    const repo = new DocumentsRepository(db, { workspaceId: "ws-1" })
    const id = await repo.create()

    const first = await openContent(repo, id)
    seedDocument(first)
    const edited = doc(
      title("Boxing plan"),
      p("Three rounds"),
      ul(li("Find a gym"))
    )
    prosemirrorToYXmlFragment(edited, first.getXmlFragment(DOCUMENT_FRAGMENT))
    await new Promise((resolve) => setTimeout(resolve, 50))
    DexieYProvider.release(first)
    await new Promise((resolve) => setTimeout(resolve, 50))

    const second = await openContent(repo, id)
    const reopened = yXmlFragmentToProseMirrorRootNode(
      second.getXmlFragment(DOCUMENT_FRAGMENT),
      schema
    )
    expect(second).not.toBe(first)
    expect(() => reopened.check()).not.toThrow()
    expect(titleOf(reopened)).toBe("Boxing plan")
    expect(reopened.textContent).toBe("Boxing planThree roundsFind a gym")
    DexieYProvider.release(second)
  })
})
