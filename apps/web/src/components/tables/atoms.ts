import { atom } from "jotai"
import type { SetStateAction } from "jotai"

export function atomWithDebounce<T>(
  initialValue: T,
  delayMilliseconds = 500,
  shouldDebounceOnReset = false
) {
  const prevTimeoutAtom = atom<ReturnType<typeof setTimeout> | undefined>(
    undefined
  )

  const _currentValueAtom = atom(initialValue)
  const isDebouncingAtom = atom(false)

  const debouncedValueAtom = atom(
    initialValue,
    (get, set, update: SetStateAction<T>) => {
      clearTimeout(get(prevTimeoutAtom))

      const prevValue = get(_currentValueAtom)
      const nextValue =
        typeof update === "function"
          ? (update as (prev: T) => T)(prevValue)
          : update

      set(_currentValueAtom, nextValue)
      set(isDebouncingAtom, true)

      if (!shouldDebounceOnReset && nextValue === initialValue) {
        set(debouncedValueAtom, nextValue)
        set(isDebouncingAtom, false)
        return
      }

      set(
        prevTimeoutAtom,
        setTimeout(() => {
          set(debouncedValueAtom, nextValue)
          set(isDebouncingAtom, false)
        }, delayMilliseconds)
      )
    }
  )

  return {
    currentValueAtom: atom((get) => get(_currentValueAtom)),
    isDebouncingAtom,
    debouncedValueAtom,
  }
}
