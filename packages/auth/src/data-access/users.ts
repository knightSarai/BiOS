import { eq } from "drizzle-orm"
import { db } from "#db"
import { users } from "#db/schema"

export const findUserByEmail = async (email: string) => {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1)

  return user ?? null
}

export const findUserById = async (id: string) => {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1)

  return user ?? null
}
