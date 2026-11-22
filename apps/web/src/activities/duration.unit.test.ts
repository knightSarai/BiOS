import { describe, expect, it } from "vitest"
import {
  EMPTY,
  backspace,
  deleteForward,
  inputEdit,
  replacedValue,
  secondsToValue,
  tidyValue,
  toNextGroup,
  typeDigit,
  valueToSeconds,
  type Edit,
} from "./duration"

// "<" is Backspace, ">" is Delete, ":" jumps to the seconds; anything else is a digit.
const press = (keys: string, start: Edit = { value: EMPTY, caret: 0 }) =>
  [...keys].reduce((edit, key) => {
    if (key === "<") return backspace(edit.value, edit.caret)
    if (key === ">") return deleteForward(edit.value, edit.caret)
    if (key === ":") return toNextGroup(edit.value, edit.caret)
    return typeDigit(edit.value, edit.caret, key)
  }, start)

describe("typing over MM:SS", () => {
  it("overwrites from the left, so three minutes is 0 then 3", () => {
    const edit = press("03")
    expect(edit.value).toBe("03:00")
    expect(valueToSeconds(edit.value)).toBe(180)
    expect(edit.caret).toBe(3)
  })

  it("skips the colon and fills the seconds", () => {
    expect(press("0330").value).toBe("03:30")
    expect(press("0330").caret).toBe(5)
  })

  it("reads a large tens-of-seconds digit as single seconds", () => {
    expect(press("017").value).toBe("01:07")
  })

  it("jumps to the seconds on a colon", () => {
    expect(press(":45").value).toBe("00:45")
  })

  it("sets the digit to the left back to 0 on Backspace", () => {
    expect(press("0330<").value).toBe("03:30")
    expect(press("0330<<").value).toBe("03:00")
    expect(press("0330<<<").value).toBe("00:00")
  })

  it("zeroes the digit under the cursor on Delete", () => {
    expect(press(">", { value: "03:30", caret: 1 }).value).toBe("00:30")
  })

  it("ignores typing past the end and Backspace at the start", () => {
    expect(press("03305").value).toBe("03:30")
    expect(press("<").value).toBe(EMPTY)
  })
})

describe("growing the minutes", () => {
  it("adds digits when typing right before the colon", () => {
    const edit = press("120", { value: EMPTY, caret: 2 })
    expect(edit.value).toBe("120:00")
    expect(valueToSeconds(edit.value)).toBe(7200)
    expect(edit.caret).toBe(3)
  })

  it("stops at four minute digits", () => {
    expect(press("12345", { value: EMPTY, caret: 2 }).value).toBe("1234:00")
  })

  it("removes an extra minute digit on Backspace instead of zeroing it", () => {
    expect(press("<", { value: "120:00", caret: 3 }).value).toBe("12:00")
  })

  it("keeps the minutes two digits when it can", () => {
    expect(press("<", { value: "12:00", caret: 2 }).value).toBe("10:00")
  })
})

describe("secondsToValue", () => {
  it("round-trips a saved duration back into the field", () => {
    expect(secondsToValue(180)).toBe("03:00")
    expect(secondsToValue(90)).toBe("01:30")
    expect(secondsToValue(7200)).toBe("2:00:00")
    expect(valueToSeconds(secondsToValue(0))).toBe(0)
  })
})

describe("hours", () => {
  it("tidies an hour or more into H:MM:SS when leaving the field", () => {
    expect(tidyValue("90:00")).toBe("1:30:00")
    expect(tidyValue("120:00")).toBe("2:00:00")
    expect(tidyValue("45:00")).toBe("45:00")
    expect(tidyValue("0:30:00")).toBe("30:00")
  })

  it("reads H:MM:SS as seconds", () => {
    expect(valueToSeconds("1:30:00")).toBe(5400)
  })

  it("types over the hours, then the minutes", () => {
    const edit = press("245", { value: "1:30:00", caret: 0 })
    expect(edit.value).toBe("2:45:00")
    expect(edit.caret).toBe(5)
  })

  it("caps the minutes after hours at 59", () => {
    expect(press("7", { value: "1:30:00", caret: 2 }).value).toBe("1:07:00")
  })

  it("grows the hours when typing right before their colon", () => {
    expect(press("2", { value: "1:30:00", caret: 1 }).value).toBe("12:30:00")
  })

  it("moves to the next group on a colon", () => {
    expect(press(":", { value: "1:30:00", caret: 0 }).caret).toBe(2)
    expect(press("::", { value: "1:30:00", caret: 0 }).caret).toBe(5)
  })

  it("zeroes hours on Backspace and keeps the shape", () => {
    expect(press("<", { value: "1:30:00", caret: 1 }).value).toBe("0:30:00")
  })
})

describe("a change that isn't typing", () => {
  it("takes a whole time an autofill put in", () => {
    expect(replacedValue("5:00", "00:00")).toEqual({ value: "05:00", caret: 5 })
    expect(replacedValue("90:00", "00:00").value).toBe("1:30:00")
  })

  it("keeps the field as it was for anything else", () => {
    expect(replacedValue("five minutes", "02:30")).toEqual({
      value: "02:30",
      caret: 5,
    })
  })
})

describe("a phone keyboard that skips key events", () => {
  const typed = (
    value: string,
    caret: number,
    data: string | null,
    type = "insertText"
  ) => ({ value, caret, type, data })

  it("types a digit where it landed", () => {
    expect(inputEdit(typed("025:00", 1, "2"), "25:00")).toEqual(
      typeDigit("25:00", 0, "2")
    )
  })

  it("starts over when a digit replaces the whole field", () => {
    expect(inputEdit(typed("2", 1, "2"), "1:30:00")).toEqual(
      typeDigit(EMPTY, 0, "2")
    )
  })

  it("takes a pasted time whole", () => {
    expect(
      inputEdit(typed("25:30", 5, null, "insertFromPaste"), "1:30:00").value
    ).toBe("25:30")
  })

  it("takes a whole time a keyboard puts in at once", () => {
    expect(inputEdit(typed("25:30", 5, "25:30"), "1:30:00").value).toBe("25:30")
  })

  it("keeps the field for a paste that isn't a time", () => {
    expect(
      inputEdit(typed("soon", 4, null, "insertFromPaste"), "10:00").value
    ).toBe("10:00")
  })

  it("clears to 00:00 when the whole field is cut or deleted", () => {
    expect(inputEdit(typed("", 0, null, "deleteByCut"), "1:30:00")).toEqual({
      value: EMPTY,
      caret: 0,
    })
  })

  it("zeroes the digit left of the cursor on delete", () => {
    expect(
      inputEdit(typed("1000", 2, null, "deleteContentBackward"), "10:00")
    ).toEqual(backspace("10:00", 3))
  })
})
