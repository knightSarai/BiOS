type Email = {
  to: string
  subject: string
  text: string
}

export const sendEmail = async (email: Email) => {
  console.info(
    `[email] to=${email.to} subject="${email.subject}"\n${email.text}`
  )
}

export const passwordResetEmail = (input: { to: string; url: string }) => ({
  to: input.to,
  subject: "Reset your Knight OS password",
  text: `Reset your password: ${input.url}`,
})
