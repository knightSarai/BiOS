const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"

const digitAt = (key: string, index: number) =>
  index < key.length ? DIGITS.indexOf(key[index]) : 0

// Keys never end in "0", so there is always room for a key between two others.
const midpoint = (low: string, high: string | null): string => {
  if (high !== null) {
    let shared = 0
    while (shared < high.length && (low[shared] ?? "0") === high[shared]) {
      shared++
    }
    if (shared > 0) {
      return (
        high.slice(0, shared) + midpoint(low.slice(shared), high.slice(shared))
      )
    }
  }
  const lowDigit = digitAt(low, 0)
  const highDigit = high === null ? DIGITS.length : digitAt(high, 0)
  if (highDigit - lowDigit > 1) {
    return DIGITS[Math.round((lowDigit + highDigit) / 2)]
  }
  if (high !== null && high.length > 1) return high.slice(0, 1)
  return DIGITS[lowDigit] + midpoint(low.slice(1), null)
}

const keyBetween = (before: string | null, after: string | null) => {
  if (before !== null && after !== null && before >= after) {
    throw new Error(`Sort key ${before} is not before ${after}.`)
  }
  return midpoint(before ?? "", after)
}

const keysAfter = (last: string | null, count: number) => {
  const keys: string[] = []
  let previous = last
  for (let index = 0; index < count; index++) {
    previous = keyBetween(previous, null)
    keys.push(previous)
  }
  return keys
}

export { keyBetween, keysAfter }
