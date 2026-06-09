/**
 * Email utility for Lumen.
 *
 * Provider priority (first configured wins):
 *  1. Resend   — set RESEND_API_KEY in .env  (recommended, free tier at resend.com)
 *  2. SMTP     — set EMAIL_HOST + EMAIL_USER + EMAIL_PASS in .env  (Gmail, Outlook, etc.)
 *  3. Console  — no config needed; verification link is printed to the server log
 *
 * In all cases the verification link is also printed to the server log so you
 * can always verify accounts manually during development.
 */

import nodemailer from 'nodemailer'
import { Resend } from 'resend'

// ---------------------------------------------------------------------------
// HTML email template
// ---------------------------------------------------------------------------

function buildVerificationHtml(username: string, verifyUrl: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0D0D1A;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0D0D1A;padding:40px 16px;">
    <tr><td align="center">
      <table width="500" cellpadding="0" cellspacing="0" style="background:#12122e;border-radius:16px;border:1px solid rgba(255,255,255,0.1);overflow:hidden;">

        <!-- Header bar -->
        <tr><td style="background:linear-gradient(135deg,#6B21A8,#7C3AED);padding:32px;text-align:center;">
          <div style="font-size:36px;margin-bottom:8px;">⚔️</div>
          <h1 style="margin:0;color:#F5C542;font-size:26px;letter-spacing:4px;font-weight:900;">LUMEN</h1>
          <p style="margin:6px 0 0;color:rgba(255,255,255,0.7);font-size:13px;letter-spacing:1px;">FANTASY EDUCATIONAL RPG</p>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:36px 40px;">
          <h2 style="margin:0 0 12px;color:#ffffff;font-size:20px;">Welcome, ${username}!</h2>
          <p style="margin:0 0 24px;color:#9ca3af;font-size:15px;line-height:1.6;">
            Your adventure in Lumen begins here. Click the button below to verify your
            email address and activate your account.
          </p>
          <table cellpadding="0" cellspacing="0" width="100%"><tr><td align="center" style="padding:8px 0 28px;">
            <a href="${verifyUrl}"
               style="display:inline-block;padding:15px 40px;background:#7C3AED;color:#ffffff;
                      text-decoration:none;border-radius:10px;font-weight:700;font-size:16px;
                      letter-spacing:0.5px;">
              Verify Email Address →
            </a>
          </td></tr></table>
          <p style="margin:0 0 8px;color:#6b7280;font-size:12px;line-height:1.6;">
            This link expires in <strong style="color:#9ca3af;">24 hours</strong>.
            If you did not create a Lumen account, you can safely ignore this email.
          </p>
          <p style="margin:0;color:#4b5563;font-size:11px;word-break:break-all;">
            Or copy this link: ${verifyUrl}
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:20px 40px;border-top:1px solid rgba(255,255,255,0.06);text-align:center;">
          <p style="margin:0;color:#4b5563;font-size:11px;">
            Lumen RPG · Educational Fantasy Game · Safe for ages 7+
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

// ---------------------------------------------------------------------------
// Provider implementations
// ---------------------------------------------------------------------------

async function sendViaResend(
  to: string,
  subject: string,
  html: string,
  verifyUrl: string,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY!
  const resend = new Resend(apiKey)

  // Use custom FROM if a verified domain is configured, otherwise use Resend's sandbox address
  const from = process.env.EMAIL_FROM_RESEND ?? 'Lumen RPG <onboarding@resend.dev>'

  const { error } = await resend.emails.send({ from, to, subject, html })
  if (error) throw new Error(`Resend error: ${error.message}`)

  console.log(`[Email] ✅ Sent via Resend to ${to}`)
  console.log(`[Email] Verify link: ${verifyUrl}`)
}

let smtpTransporter: nodemailer.Transporter | null = null

async function sendViaSmtp(
  to: string,
  subject: string,
  html: string,
  verifyUrl: string,
): Promise<void> {
  if (!smtpTransporter) {
    smtpTransporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST!,
      port: process.env.EMAIL_PORT ? parseInt(process.env.EMAIL_PORT, 10) : 587,
      secure: process.env.EMAIL_PORT === '465',
      auth: {
        user: process.env.EMAIL_USER!,
        pass: process.env.EMAIL_PASS!,
      },
    })
  }

  const from = process.env.EMAIL_FROM ?? 'noreply@lumen-game.com'
  await smtpTransporter.sendMail({ from: `"Lumen RPG" <${from}>`, to, subject, html })

  console.log(`[Email] ✅ Sent via SMTP to ${to}`)
  console.log(`[Email] Verify link: ${verifyUrl}`)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function sendVerificationEmail(
  to: string,
  token: string,
  username: string,
): Promise<void> {
  const serverBase = `http://localhost:${process.env.PORT ?? 3001}`
  const verifyUrl = `${serverBase}/api/auth/verify-email?token=${token}`
  const subject = 'Verify your Lumen account'
  const html = buildVerificationHtml(username, verifyUrl)

  // ── Provider 1: Resend ───────────────────────────────────────────────────
  if (process.env.RESEND_API_KEY) {
    await sendViaResend(to, subject, html, verifyUrl)
    return
  }

  // ── Provider 2: SMTP ────────────────────────────────────────────────────
  if (process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    await sendViaSmtp(to, subject, html, verifyUrl)
    return
  }

  // ── Provider 3: Console fallback ─────────────────────────────────────────
  console.log('\n[Email] ⚠️  No email provider configured.')
  console.log(`[Email] Verification link for ${username} <${to}>:`)
  console.log(`[Email] ${verifyUrl}\n`)
  console.log('[Email] To send real emails, add one of these to your .env:')
  console.log('[Email]   RESEND_API_KEY=re_xxxx         (free at resend.com — easiest)')
  console.log('[Email]   or EMAIL_HOST + EMAIL_USER + EMAIL_PASS for SMTP\n')
}
