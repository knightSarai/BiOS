import { findUserByEmail } from "#data-access/users"
import { promoteToAdmin } from "#db"

const email = process.argv[2]

if (!email) {
  console.error("Usage: pnpm --filter @knight-os/auth make-admin <email>")
  process.exit(1)
}

const user = await findUserByEmail(email)
if (!user) {
  console.error(`No user with email ${email}. Sign up first.`)
  process.exit(1)
}

await promoteToAdmin(user.id)
console.log(`${email} is now an app admin`)
