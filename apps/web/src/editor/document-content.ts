import type { Node } from "prosemirror-model"
import { prosemirrorToYXmlFragment } from "y-prosemirror"
import * as Y from "yjs"
import { schema } from "./schema"

const DOCUMENT_FRAGMENT = "content"

const emptyDocument = () => {
  const doc = schema.topNodeType.createAndFill()
  if (!doc)
    throw new Error("The document schema cannot create an empty document")
  return doc
}

// Every device writes the same seed (same client id and clock), so Yjs merges
// repeated seeds into one instead of producing two titles.
const SEED_CLIENT_ID = 0

let seedUpdate: Uint8Array | undefined

const getSeedUpdate = () => {
  if (seedUpdate) return seedUpdate
  const seed = new Y.Doc()
  seed.clientID = SEED_CLIENT_ID
  prosemirrorToYXmlFragment(
    emptyDocument(),
    seed.getXmlFragment(DOCUMENT_FRAGMENT)
  )
  seedUpdate = Y.encodeStateAsUpdate(seed)
  seed.destroy()
  return seedUpdate
}

const seedDocument = (ydoc: Y.Doc) => {
  if (ydoc.getXmlFragment(DOCUMENT_FRAGMENT).length === 0) {
    Y.applyUpdate(ydoc, getSeedUpdate())
  }
}

const seedDocumentWithTitle = (ydoc: Y.Doc, title: string) => {
  seedDocument(ydoc)
  const titleElement = ydoc.getXmlFragment(DOCUMENT_FRAGMENT).get(0)
  if (!(titleElement instanceof Y.XmlElement) || titleElement.length > 0) return
  if (title) titleElement.insert(0, [new Y.XmlText(title)])
}

const titleOf = (doc: Node) => doc.firstChild?.textContent.trim() ?? ""

export {
  DOCUMENT_FRAGMENT,
  emptyDocument,
  seedDocument,
  seedDocumentWithTitle,
  titleOf,
}
