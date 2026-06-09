import { useState, useCallback } from 'react'

export type ContentMode = 'child' | 'adolescent' | null

export interface AuthUser {
  username: string
  ageGroup: 'child' | 'teen' | 'adult'
  userId: string
  /** User-chosen content mode; null = not yet selected (game will prompt). */
  contentMode: ContentMode
}

const TOKEN_KEY = 'lumen_token'

/** Decode the payload of a JWT without verifying the signature (client-side only). */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = parts[1]
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
  if (typeof payload.exp === 'number' && payload.exp * 1000 < Date.now()) {
    localStorage.removeItem(TOKEN_KEY)
    return null
  }
  return {
    userId: payload.userId as string,
    username: payload.username as string,
    ageGroup: payload.ageGroup as 'child' | 'teen' | 'adult',
    contentMode: (payload.contentMode as ContentMode) ?? null,
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
      user?: { username: string; ageGroup: 'child' | 'teen' | 'adult'; contentMode: ContentMode }
      error?: string
      unverified?: boolean
    }

    if (!res.ok || !data.token) {
      const err = new Error(data.error ?? 'Login failed') as Error & { unverified?: boolean }
      err.unverified = data.unverified
      throw err
    }

    localStorage.setItem(TOKEN_KEY, data.token)
    setUser(getStoredUser())
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    setUser(null)
    window.location.reload()
  }, [])

  /**
   * Update the user's content mode via the server, receive a fresh JWT,
   * and update local auth state — all in one call.
   */
  const setContentMode = useCallback(
    async (mode: 'child' | 'adolescent'): Promise<void> => {
      const storedToken = localStorage.getItem(TOKEN_KEY)
      if (!storedToken) throw new Error('Not authenticated')

      const res = await fetch('http://localhost:3001/api/auth/content-mode', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${storedToken}`,
        },
        body: JSON.stringify({ contentMode: mode }),
      })

      const data = (await res.json()) as { token?: string; error?: string }
      if (!res.ok || !data.token) {
        throw new Error(data.error ?? 'Failed to update content mode')
      }

      localStorage.setItem(TOKEN_KEY, data.token)
      setUser(getStoredUser())
    },
    [],
  )

  return {
    user,
    token,
    login,
    logout,
    setContentMode,
    isAuthenticated: user !== null,
  }
}
