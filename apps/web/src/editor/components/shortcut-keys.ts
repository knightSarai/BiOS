const isApplePlatform = () =>
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.userAgent)

const modifierLabels = {
  apple: { Mod: "⌘", Shift: "⇧", Alt: "⌥", Ctrl: "⌃" },
  other: { Mod: "Ctrl", Shift: "Shift", Alt: "Alt", Ctrl: "Ctrl" },
} as const

const shortcutKeys = (keys: string, apple = isApplePlatform()) => {
  const labels = apple ? modifierLabels.apple : modifierLabels.other
  const parts: string[] = []
  let rest = keys
  for (
    let match = /^(Mod|Shift|Alt|Ctrl)-/.exec(rest);
    match;
    match = /^(Mod|Shift|Alt|Ctrl)-/.exec(rest)
  ) {
    const modifier = match[1] as keyof typeof labels
    parts.push(labels[modifier])
    rest = rest.slice(match[0].length)
  }
  parts.push(rest.length === 1 ? rest.toUpperCase() : rest)
  return parts
}

export { shortcutKeys }
