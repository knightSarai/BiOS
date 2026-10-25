const CLICK_INTENT_DELAY_MS = 200

export function createClickIntent() {
  let timer: ReturnType<typeof setTimeout> | undefined
  const cancel = () => clearTimeout(timer)
  const debouncedClick = (fire: () => void) => {
    cancel()
    timer = setTimeout(fire, CLICK_INTENT_DELAY_MS)
  }
  const immediateClick = (fire: () => void) => {
    cancel()
    fire()
  }
  return { debouncedClick, immediateClick, cancel }
}

export type ClickIntent = ReturnType<typeof createClickIntent>
