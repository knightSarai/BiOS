import { atom } from "jotai"

type NewActivityRequest = {
  areaId: string | null
  goalId: string | null
  typeId: string | null
  parent: { id: string; key: string } | null
}

// The request outlives `open` so the form stays rendered while the dialog animates closed.
const newActivityAtom = atom<{
  open: boolean
  request: NewActivityRequest | null
}>({ open: false, request: null })

const openNewActivityAtom = atom(
  null,
  (_get, set, request: NewActivityRequest) =>
    set(newActivityAtom, { open: true, request })
)

const createMoreAtom = atom(false)

// The parent whose inline sub-activity form is open, if any.
const subActivityFormAtom = atom<string | null>(null)

export {
  createMoreAtom,
  newActivityAtom,
  openNewActivityAtom,
  subActivityFormAtom,
}
export type { NewActivityRequest }
