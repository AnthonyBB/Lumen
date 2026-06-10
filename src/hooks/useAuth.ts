import { useState, useCallback, useEffect, createContext, useContext, createElement, type ReactNode } from 'react'

export type ContentMode = 'child' | 'adolescent' | null

export interface AuthUser {
  username: string
  ageGroup: 'child' | 'teen' | 'adult'
  userId: string
  /** User-chosen content mode; null = not yet selected (game will prompt). */
  contentMode: ContentMode
}

const TOKEN_KEY = 'lumen_token'

/** Auto-logout after this long with no mouse/keyboard/touch activity. */
const IDLE_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes
/** How often the session guard re-checks expiry and idle time. */
const SESSION_CHECK_INTERVAL_MS = 30 * 1000

/**
 * Clear the stored token and reload, landing the user on the login page.
 * Module-level so any caller (session guard, socket error handler) can use it
 * without coordinating React state — the reload resets everything.
 */
export function forceLogout(): void {
  localStorage.removeItem(TOKEN_KEY)
  window.location.reload()
}

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

/**
 * Session guard — call ONCE (from App). Logs the user out when:
 *  1. the server rejects the stored token (GET /api/auth/me → 401), e.g.
 *     expired or signed with a rotated secret;
 *  2. the token's exp passes while the tab is open (checked every 30s,
 *     not just on page load);
 *  3. the user is idle for IDLE_TIMEOUT_MS (no pointer/key/touch activity).
 */
export function useSessionGuard(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) return

    // 1. Validate the token against the server once on load
    fetch('http://localhost:3001/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (res.status === 401) forceLogout()
      })
      .catch(() => {
        /* server unreachable — leave the session alone */
      })

    // 2 + 3. Periodic expiry & idle checks
    let lastActivity = Date.now()
    const markActivity = () => { lastActivity = Date.now() }
    const events: (keyof WindowEventMap)[] = ['pointerdown', 'pointermove', 'keydown', 'touchstart']
    for (const ev of events) window.addEventListener(ev, markActivity, { passive: true })

    const interval = window.setInterval(() => {
      const t = localStorage.getItem(TOKEN_KEY)
      if (!t) return
      const payload = decodeJwtPayload(t)
      const expired = typeof payload?.exp === 'number' && payload.exp * 1000 < Date.now()
      const idle = Date.now() - lastActivity > IDLE_TIMEOUT_MS
      if (expired || idle) forceLogout()
    }, SESSION_CHECK_INTERVAL_MS)

    return () => {
      window.clearInterval(interval)
      for (const ev of events) window.removeEventListener(ev, markActivity)
    }
  }, [enabled])
}

/**
 * Internal: the actual auth state. Lives ONCE inside AuthProvider — components
 * must consume it via useAuth()/the context. Before the provider existed,
 * every component calling this hook got an independent state copy, so logging
 * in updated LoginPage's copy while App's router still saw "logged out" and
 * bounced the user back to the login page.
 */
function useAuthState() {
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

type AuthContextValue = ReturnType<typeof useAuthState>

const AuthContext = createContext<AuthContextValue | null>(null)

/** Mount once around the app (see main.tsx) so all components share ONE auth state. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const value = useAuthState()
  return createElement(AuthContext.Provider, { value }, children)
}

/** Shared auth state — reads the single instance provided by AuthProvider. */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}
