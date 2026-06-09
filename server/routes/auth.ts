import { Router, type Request, type Response } from 'express'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import rateLimit from 'express-rate-limit'
import { User } from '../db/models/User.js'
import { isDbConnected } from '../db/connection.js'
import { signToken } from '../middleware/auth.js'
import { sendVerificationEmail } from '../utils/email.js'

const router = Router()

// ---------------------------------------------------------------------------
// Rate limiting — 10 attempts per 15 minutes on auth endpoints
// ---------------------------------------------------------------------------

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again in 15 minutes.' },
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function dbRequired(res: Response): boolean {
  if (!isDbConnected()) {
    res.status(503).json({ error: 'Database unavailable. Please try again later.' })
    return true
  }
  return false
}

function computeAge(dob: Date): number {
  const now = new Date()
  let age = now.getFullYear() - dob.getFullYear()
  const monthDiff = now.getMonth() - dob.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
    age--
  }
  return age
}

// ---------------------------------------------------------------------------
// POST /api/auth/register
// ---------------------------------------------------------------------------

router.post('/register', authLimiter, async (req: Request, res: Response) => {
  if (dbRequired(res)) return

  const { username, email, password, dateOfBirth } = req.body

  // Validate required fields
  if (
    typeof username !== 'string' ||
    typeof email !== 'string' ||
    typeof password !== 'string' ||
    typeof dateOfBirth !== 'string'
  ) {
    res.status(400).json({ error: 'All fields are required: username, email, password, dateOfBirth.' })
    return
  }

  if (username.length < 3 || username.length > 20) {
    res.status(400).json({ error: 'Username must be between 3 and 20 characters.' })
    return
  }

  if (!EMAIL_RE.test(email)) {
    res.status(400).json({ error: 'Invalid email address.' })
    return
  }

  if (password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters.' })
    return
  }

  const dob = new Date(dateOfBirth)
  if (isNaN(dob.getTime())) {
    res.status(400).json({ error: 'Invalid date of birth.' })
    return
  }

  const age = computeAge(dob)
  if (age < 7) {
    res.status(400).json({ error: 'Lumen is for players ages 7 and up.' })
    return
  }

  // Check uniqueness
  const existing = await User.findOne({ $or: [{ email: email.toLowerCase() }, { username }] })
  if (existing) {
    if (existing.email === email.toLowerCase()) {
      res.status(409).json({ error: 'An account with that email already exists.' })
    } else {
      res.status(409).json({ error: 'That username is already taken.' })
    }
    return
  }

  const passwordHash = await bcrypt.hash(password, 12)
  const emailVerifyToken = crypto.randomBytes(32).toString('hex')
  const emailVerifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

  const user = new User({
    username,
    email: email.toLowerCase(),
    passwordHash,
    emailVerified: false,
    emailVerifyToken,
    emailVerifyExpires,
    dateOfBirth: dob,
  })

  await user.save()

  // Send verification email (non-blocking — don't fail registration if email fails)
  try {
    await sendVerificationEmail(user.email, emailVerifyToken, username)
  } catch (err) {
    console.error('[Auth] Failed to send verification email:', err)
  }

  res.status(201).json({ message: 'Check your email to verify your account.' })
})

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------

router.post('/login', authLimiter, async (req: Request, res: Response) => {
  if (dbRequired(res)) return

  const { email, password } = req.body

  if (typeof email !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: 'Email and password are required.' })
    return
  }

  const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash')
  if (!user) {
    res.status(401).json({ error: 'Invalid email or password.' })
    return
  }

  const passwordMatch = await bcrypt.compare(password, user.passwordHash)
  if (!passwordMatch) {
    res.status(401).json({ error: 'Invalid email or password.' })
    return
  }

  if (!user.emailVerified) {
    res.status(403).json({
      error: 'Please verify your email before logging in.',
      unverified: true,
    })
    return
  }

  user.lastLogin = new Date()
  await user.save()

  const token = signToken({
    userId: user._id.toString(),
    username: user.username,
    ageGroup: user.ageGroup,
  })

  res.json({
    token,
    user: {
      username: user.username,
      ageGroup: user.ageGroup,
    },
  })
})

// ---------------------------------------------------------------------------
// GET /api/auth/verify-email?token=xxx
// ---------------------------------------------------------------------------

router.get('/verify-email', async (req: Request, res: Response) => {
  if (dbRequired(res)) return

  const { token } = req.query
  if (typeof token !== 'string') {
    res.status(400).json({ error: 'Missing verification token.' })
    return
  }

  const user = await User.findOne({
    emailVerifyToken: token,
    emailVerifyExpires: { $gt: new Date() },
  })

  if (!user) {
    res.status(400).json({ error: 'Invalid or expired verification token.' })
    return
  }

  user.emailVerified = true
  user.emailVerifyToken = null
  user.emailVerifyExpires = null
  await user.save()

  const clientOrigin = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173'
  res.redirect(`${clientOrigin}/?verified=true`)
})

// ---------------------------------------------------------------------------
// POST /api/auth/resend-verification
// ---------------------------------------------------------------------------

router.post('/resend-verification', authLimiter, async (req: Request, res: Response) => {
  if (dbRequired(res)) return

  const { email } = req.body
  if (typeof email !== 'string') {
    res.status(400).json({ error: 'Email is required.' })
    return
  }

  // Always return the same message to prevent email enumeration
  const genericResponse = { message: 'If that account exists and is unverified, a new email has been sent.' }

  const user = await User.findOne({ email: email.toLowerCase() })
  if (!user || user.emailVerified) {
    res.json(genericResponse)
    return
  }

  const emailVerifyToken = crypto.randomBytes(32).toString('hex')
  user.emailVerifyToken = emailVerifyToken
  user.emailVerifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000)
  await user.save()

  try {
    await sendVerificationEmail(user.email, emailVerifyToken, user.username)
  } catch (err) {
    console.error('[Auth] Failed to resend verification email:', err)
  }

  res.json(genericResponse)
})

export default router
