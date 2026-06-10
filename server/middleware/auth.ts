import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

export interface JwtPayload {
  userId: string
  username: string
  ageGroup: 'child' | 'teen' | 'adult'
  /** User-chosen content mode; null means not yet selected. */
  contentMode: 'child' | 'adolescent' | null
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload
    }
  }
}

function getSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET env var must be set and at least 32 characters long')
  }
  return secret
}

/** Verify a JWT string and return the decoded payload. Throws on invalid/expired. */
export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, getSecret()) as JwtPayload
}

/** Session lifetime. Override with JWT_EXPIRES_IN (e.g. '30m', '2h', '7d'). */
const JWT_EXPIRES_IN = (process.env.JWT_EXPIRES_IN ?? '2h') as jwt.SignOptions['expiresIn']

/** Sign a new JWT. */
export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, getSecret(), { expiresIn: JWT_EXPIRES_IN })
}

/**
 * Express middleware: reads Authorization: Bearer <token>
 * Verifies the JWT and attaches decoded payload to req.user.
 * Returns 401 if missing or invalid.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header.' })
    return
  }

  const token = authHeader.slice(7)
  try {
    req.user = verifyToken(token)
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired token.' })
  }
}
