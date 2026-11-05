import { atom } from "jotai"

type NewActivityRequest = {
  areaId: string | null
  goalId: string | null
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

export { createMoreAtom, newActivityAtom, openNewActivityAtom }
export type { NewActivityRequest }
