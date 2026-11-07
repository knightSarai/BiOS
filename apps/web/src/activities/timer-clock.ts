import { atom } from "jotai"
import { now, parseUtc } from "@knight-os/server/core"

const TICK_MS = 250

// Ticks only while a running timer is on screen.
const clockAtom = atom(parseUtc(now()))

clockAtom.onMount = (set) => {
  set(parseUtc(now()))
  const interval = setInterval(() => set(parseUtc(now())), TICK_MS)
  return () => clearInterval(interval)
}

export { clockAtom }
