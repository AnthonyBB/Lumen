import { useState, useCallback } from 'react'

export interface AuthUser {
  username: string
  ageGroup: 'child' | 'teen' | 'adult'
  userId: string
}

const TOKEN_KEY = 'lumen_token'

/** Decode the payload of a JWT without verifying the signature (client-side only). */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = parts[1]
    // Base64url → Base64
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(base64)) as Record<string, unknown>
  } catch {
    return null
  }
}

function getStoredUser(): AuthUser | null {
  const token = localStorage.getItem(TOKEN_KEY)
  if (!token) return null
  const payload = decodeJwtPayload(token)
  if (!payload) return null
  // Check expiry
  if (typeof payload.exp === 'number' && payload.exp * 1000 < Date.now()) {
    localStorage.removeItem(TOKEN_KEY)
    return null
  }
  return {
    userId: payload.userId as string,
    username: payload.username as string,
    ageGroup: payload.ageGroup as 'child' | 'teen' | 'adult',
  }
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(() => getStoredUser())
  const token = localStorage.getItem(TOKEN_KEY)

  const login = useCallback(async (email: string, password: string): Promise<void> => {
    const res = await fetch('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const data = (await res.json()) as {
      token?: string
      user?: { username: string; ageGroup: 'child' | 'teen' | 'adult' }
      error?: string
      unverified?: boolean
    }

    if (!res.ok || !data.token) {
      const err = new Error(data.error ?? 'Login failed') as Error & { unverified?: boolean }
      err.unverified = data.unverified
      throw err
    }

    localStorage.setItem(TOKEN_KEY, data.token)
    const decoded = getStoredUser()
    setUser(decoded)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    setUser(null)
    window.location.reload()
  }, [])

  return {
    user,
    token,
    login,
    logout,
    isAuthenticated: user !== null,
  }
}
