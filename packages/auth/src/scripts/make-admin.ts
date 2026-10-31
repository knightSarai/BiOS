import { auth } from "#auth"
import { findUserByEmail } from "#data-access/users"
import { promoteToAdmin } from "#db"
import { createUserSchema } from "../validation"

const promptHidden = (question: string) =>
  new Promise<string>((resolve) => {
    const { stdin, stdout } = process
    let value = ""

    const stop = () => {
      stdin.off("data", onData)
      stdin.setRawMode(false)
      stdin.pause()
      stdout.write("\n")
    }

    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === "\u0003") {
          stop()
          process.exit(130)
        }
        if (char === "\r" || char === "\n") {
          stop()
          resolve(value)
          return
        }
        value =
          char === "\u007f" || char === "\b" ? value.slice(0, -1) : value + char
      }
    }

    stdout.write(question)
    stdin.setEncoding("utf8")
    stdin.setRawMode(true)
    stdin.resume()
    stdin.on("data", onData)
  })

const [email, name] = process.argv.slice(2)

if (!email) {
  console.error("Usage: pnpm --filter @knight-os/auth make-admin <email> [name]")
  process.exit(1)
}

const user = await findUserByEmail(email)

if (user) {
  await promoteToAdmin(user.id)
  console.log(`${email} is now an app admin`)
  process.exit(0)
}

if (!name) {
  console.error(
    `No user with email ${email}. Pass a name to create them as an admin.`
  )
  process.exit(1)
}

if (!process.stdin.isTTY) {
  console.error("Run this in an interactive terminal to enter the password.")
  process.exit(1)
}

const password = await promptHidden("Password: ")
const confirmation = await promptHidden("Confirm password: ")

if (password !== confirmation) {
  console.error("Passwords do not match")
  process.exit(1)
}

const parsed = createUserSchema.safeParse({
  name,
  email,
  password,
  role: "admin",
})

if (!parsed.success) {
  console.error(parsed.error.issues.map((issue) => issue.message).join("\n"))
  process.exit(1)
}

// No headers means better-auth trusts the call as server-side and skips the admin session check.
await auth.api.createUser({ body: parsed.data })
console.log(`Created ${email} as an app admin`)
