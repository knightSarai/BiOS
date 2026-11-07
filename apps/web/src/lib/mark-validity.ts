// :user-invalid shows the message visually; these attributes tell screen readers only once it shows.
const markValidity = (input: HTMLInputElement, errorId: string) => {
  if (input.checkValidity()) {
    input.removeAttribute("aria-invalid")
    input.removeAttribute("aria-describedby")
    return
  }
  input.setAttribute("aria-invalid", "true")
  input.setAttribute("aria-describedby", errorId)
}

// While a field is marked, keep the mark in step as the user fixes it.
const refreshValidity = (input: HTMLInputElement, errorId: string) => {
  if (input.hasAttribute("aria-invalid")) markValidity(input, errorId)
}

export { markValidity, refreshValidity }
