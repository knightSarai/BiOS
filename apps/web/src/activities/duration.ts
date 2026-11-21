// A duration is typed over a MM:SS field like a time input: the cursor sits on a digit,
// typing replaces it and moves right (skipping colons), and Backspace sets the digit to
// its left back to 0. Three minutes is 0 then 3. The first group can grow: typing with the
// cursor right before its colon adds digits there, so 1, 2, 0 makes 120:00. Leaving the
// field tidies an hour or more into H:MM:SS (90:00 becomes 1:30:00), which is then typed
// over the same way. The other groups stay two digits. 00:00 means a stopwatch.

const EMPTY = "00:00"

type Edit = { value: string; caret: number }

type Digit = { at: number; group: number; index: number }

const groupsOf = (value: string) => value.split(":")

const hasHours = (groups: string[]) => groups.length > 2

const minLead = (groups: string[]) => (hasHours(groups) ? 1 : 2)

const maxLead = (groups: string[]) => (hasHours(groups) ? 2 : 4)

// Extra lead digits drop their leading zeros: 001 is 01, 012 is 12, 120 stays.
const tidyLead = (lead: string, min: number) =>
  lead.length > min ? lead.replace(/^0+/, "").padStart(min, "0") : lead

const replaceAt = (text: string, index: number, char: string) =>
  `${text.slice(0, index)}${char}${text.slice(index + 1)}`

const removeAt = (text: string, index: number) =>
  `${text.slice(0, index)}${text.slice(index + 1)}`

const digitsOf = (groups: string[]) => {
  const digits: Digit[] = []
  let at = 0
  groups.forEach((group, groupIndex) => {
    for (let index = 0; index < group.length; index++) {
      digits.push({ at: at + index, group: groupIndex, index })
    }
    at += group.length + 1
  })
  return digits
}

const groupStart = (groups: string[], group: number) =>
  groups.slice(0, group).reduce((at, text) => at + text.length + 1, 0)

// Past the last digit of a group the cursor hops over the colon to the next group.
const after = (groups: string[], group: number, index: number) => {
  const end = groupStart(groups, group) + index + 1
  return index + 1 === groups[group].length && group < groups.length - 1
    ? end + 1
    : end
}

// The lead loses or zeroes a digit; other groups always zero it.
const clearDigit = (groups: string[], digit: Digit) => {
  const next = [...groups]
  const text = groups[digit.group]
  next[digit.group] =
    digit.group === 0 && text.length > minLead(groups)
      ? tidyLead(removeAt(text, digit.index), minLead(groups))
      : replaceAt(text, digit.index, "0")
  return next
}

const typeDigit = (value: string, caret: number, digit: string): Edit => {
  const groups = groupsOf(value)
  const lead = groups[0]
  if (caret === lead.length) {
    if (lead.length >= maxLead(groups)) return { value, caret }
    const next = tidyLead(`${lead}${digit}`, minLead(groups))
    return { value: [next, ...groups.slice(1)].join(":"), caret: next.length }
  }
  // A cursor on a later colon types into the group after it.
  const target = digitsOf(groups).find((candidate) => candidate.at >= caret)
  if (!target) return { value, caret }
  const next = [...groups]
  // Seconds, and minutes after hours, can't pass 59, so a 7 in the tens means 07.
  if (target.group > 0 && target.index === 0 && Number(digit) > 5) {
    next[target.group] = `0${digit}`
    return { value: next.join(":"), caret: after(next, target.group, 1) }
  }
  next[target.group] = replaceAt(groups[target.group], target.index, digit)
  return {
    value: next.join(":"),
    caret: after(next, target.group, target.index),
  }
}

const backspace = (value: string, caret: number): Edit => {
  const groups = groupsOf(value)
  const target = digitsOf(groups).findLast((candidate) => candidate.at < caret)
  if (!target) return { value, caret: 0 }
  return { value: clearDigit(groups, target).join(":"), caret: target.at }
}

const deleteForward = (value: string, caret: number): Edit => {
  const groups = groupsOf(value)
  const target = digitsOf(groups).find((candidate) => candidate.at >= caret)
  if (!target) return { value, caret }
  return { value: clearDigit(groups, target).join(":"), caret: target.at }
}

// A typed colon moves on to the next group, so : 4 5 is 00:45.
const toNextGroup = (value: string, caret: number): Edit => {
  const groups = groupsOf(value)
  const next = groups.findIndex(
    (_, group) => group > 0 && groupStart(groups, group) > caret
  )
  return {
    value,
    caret: groupStart(groups, next === -1 ? groups.length - 1 : next),
  }
}

const valueToSeconds = (value: string) =>
  groupsOf(value).reduce((total, group) => total * 60 + Number(group), 0)

const pad = (part: number) => String(part).padStart(2, "0")

const secondsToValue = (total: number) => {
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`
}

const tidyValue = (value: string) => secondsToValue(valueToSeconds(value))

// A change that isn't typing (autofill, an extension) says nothing about which key was
// pressed: a whole time is taken as it is, anything else leaves the field as it was.
const replacedValue = (text: string, shown: string): Edit => {
  const value = /^\d+(:\d{1,2}){1,2}$/.test(text.trim())
    ? tidyValue(text.trim())
    : shown
  return { value, caret: value.length }
}

export {
  EMPTY,
  backspace,
  deleteForward,
  replacedValue,
  secondsToValue,
  tidyValue,
  toNextGroup,
  typeDigit,
  valueToSeconds,
}
export type { Edit }
