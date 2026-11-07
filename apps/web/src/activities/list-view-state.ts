import { atom } from "jotai"
import { atomWithStorage } from "jotai/utils"
import {
  LIST_DATES,
  LIST_STATUSES,
  type DateGroup,
  type ListDate,
  type ListStatuses,
} from "./list-view"

// Storage can be missing or throw (private windows, blocked site data), and an old
// value may no longer be a choice; either way the default view shows.
const choiceStorage = <Choice extends string>(choices: readonly Choice[]) => ({
  getItem: (key: string, initialValue: Choice) => {
    try {
      const stored = globalThis.localStorage?.getItem(key)
      return choices.find((choice) => choice === stored) ?? initialValue
    } catch {
      return initialValue
    }
  },
  setItem: (key: string, value: Choice) => {
    try {
      globalThis.localStorage?.setItem(key, value)
    } catch {
      return
    }
  },
  removeItem: (key: string) => {
    try {
      globalThis.localStorage?.removeItem(key)
    } catch {
      return
    }
  },
})

const listDateAtom = atomWithStorage<ListDate>(
  "bios:activities-date",
  "due",
  choiceStorage(LIST_DATES),
  { getOnInit: true }
)

const listStatusesAtom = atomWithStorage<ListStatuses>(
  "bios:activities-statuses",
  "open",
  choiceStorage(LIST_STATUSES),
  { getOnInit: true }
)

const collapsedGroupsAtom = atom<DateGroup[]>([])

export { collapsedGroupsAtom, listDateAtom, listStatusesAtom }
