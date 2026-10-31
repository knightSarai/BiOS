import { toast } from "sonner"

const copyToClipboard = async (value: string, what: string) => {
  try {
    await navigator.clipboard.writeText(value)
    toast.success(`${what} copied`)
  } catch {
    toast.error(`Couldn't copy the ${what.toLowerCase()}.`)
  }
}

const crumbMenuItemClassName = "min-h-8 max-md:min-h-11"

export { copyToClipboard, crumbMenuItemClassName }
