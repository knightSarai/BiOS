import { atom } from "jotai"
import { atomWithStorage } from "jotai/utils"
import { now, parseUtc } from "@knight-os/server/core"
import {
  LIST_DATES,
  LIST_STATUSES,
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

// "<date>:<group>" keys, so collapsing Today under Due date leaves Created's Today open.
const collapsedGroupsAtom = atom<string[]>([])

// Ticks once a minute, so the date groups move on at midnight while the list is open.
const minuteClockAtom = atom(parseUtc(now()))

minuteClockAtom.onMount = (set) => {
  set(parseUtc(now()))
  const interval = setInterval(() => set(parseUtc(now())), 60_000)
  return () => clearInterval(interval)
}

export { collapsedGroupsAtom, listDateAtom, listStatusesAtom, minuteClockAtom }
