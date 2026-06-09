import nodemailer from 'nodemailer'

let transporter: nodemailer.Transporter | null = null
let etherealUser = ''
let etherealPass = ''

async function getTransporter(): Promise<nodemailer.Transporter | null> {
  if (transporter) return transporter

  const host = process.env.EMAIL_HOST
  const port = process.env.EMAIL_PORT ? parseInt(process.env.EMAIL_PORT, 10) : 587
  const user = process.env.EMAIL_USER
  const pass = process.env.EMAIL_PASS

  if (host && user && pass) {
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    })
    return transporter
  }

  // Dev fallback: auto-create Ethereal account
  try {
    const testAccount = await nodemailer.createTestAccount()
    etherealUser = testAccount.user
    etherealPass = testAccount.pass
    transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: { user: etherealUser, pass: etherealPass },
    })
    console.log('[Email] Using Ethereal test account:', etherealUser)
    return transporter
  } catch {
    return null
  }
}

export async function sendVerificationEmail(
  to: string,
  token: string,
  username: string,
): Promise<void> {
  const baseUrl = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173'
  const verifyUrl = `http://localhost:${process.env.PORT ?? 3001}/api/auth/verify-email?token=${token}`

  const xport = await getTransporter()

  if (!xport) {
    // No email transport — log to console for dev use
    console.log(`\n[Email] ⚠️  No SMTP configured. Verification link for ${username}:`)
    console.log(`[Email] ${verifyUrl}\n`)
    return
  }

  const from = process.env.EMAIL_FROM ?? 'noreply@lumen-game.com'

  const info = await xport.sendMail({
    from: `"Lumen RPG" <${from}>`,
    to,
    subject: 'Verify your Lumen account',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#0D0D1A;color:#fff;padding:32px;border-radius:12px;">
        <h1 style="color:#F5C542;font-size:28px;margin-bottom:8px;">⚔️ Welcome to Lumen, ${username}!</h1>
        <p style="color:#ccc;">Your adventure awaits. Click below to verify your email address and activate your account.</p>
        <a href="${verifyUrl}" style="display:inline-block;margin:24px 0;padding:14px 28px;background:#7C3AED;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;font-size:16px;">
          Verify Email Address
        </a>
        <p style="color:#888;font-size:12px;">This link expires in 24 hours. If you did not create a Lumen account, you can safely ignore this email.</p>
        <p style="color:#888;font-size:12px;">Or copy this URL: ${verifyUrl}</p>
      </div>
    `,
  })

  // If using Ethereal, log the preview URL
  if (etherealUser) {
    console.log('[Email] Preview URL:', nodemailer.getTestMessageUrl(info))
  }
}
