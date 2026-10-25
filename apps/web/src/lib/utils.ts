export { cn } from "cn"

export function maskValue(
  raw: string,
  {
    groups,
    separator = " ",
  }: {
    groups: readonly number[]
    separator?: string
  }
) {
  const content = raw.split(separator).join("")
  const chunks: string[] = []
  for (let rest = content, i = 0; rest.length > 0; i++) {
    const size = Math.max(
      1,
      groups[Math.min(i, groups.length - 1)] ?? rest.length
    )
    chunks.push(rest.slice(0, size))
    rest = rest.slice(size)
  }
  return {
    value: content,
    display: chunks.join(separator),
  }
}
