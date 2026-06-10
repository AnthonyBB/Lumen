import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { API_BASE } from '../config'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [unverified, setUnverified] = useState(false)
  const [loading, setLoading] = useState(false)
  const [resendStatus, setResendStatus] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setUnverified(false)
    setLoading(true)
    try {
      await login(email, password)
      navigate('/game')
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message)
        if ((err as Error & { unverified?: boolean }).unverified) {
          setUnverified(true)
        }
      } else {
        setError('Login failed. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleResendVerification() {
    setResendStatus(null)
    try {
      const res = await fetch(`${API_BASE}/api/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = (await res.json()) as { message?: string }
      setResendStatus(data.message ?? 'Verification email sent.')
    } catch {
      setResendStatus('Failed to resend. Please try again.')
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-lumen-dark px-4">
      <div className="w-full max-w-md">
        {/* Logo / header */}
        <div className="text-center mb-8">
          <p className="font-display tracking-[0.4em] text-lumen-gold text-xs uppercase mb-2">
            The Multiplayer Educational RPG
          </p>
          <h1 className="font-display text-5xl font-bold text-white">LUMEN</h1>
          <p className="text-gray-400 mt-2 text-sm">Enter your credentials to begin your quest.</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-white/10 bg-lumen-navy p-8 shadow-xl shadow-purple-900/20">
          <h2 className="font-display text-xl font-semibold text-lumen-gold mb-6">
            Sign In
          </h2>

          <form onSubmit={(e) => { void handleSubmit(e) }} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-300 mb-1" htmlFor="email">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg bg-white/5 border border-white/10 focus:border-lumen-violet focus:outline-none px-4 py-2.5 text-white placeholder-gray-600 transition-colors"
                placeholder="hero@realm.com"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-300 mb-1" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg bg-white/5 border border-white/10 focus:border-lumen-violet focus:outline-none px-4 py-2.5 text-white placeholder-gray-600 transition-colors"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="rounded-lg bg-red-900/30 border border-red-700/50 px-4 py-3 text-sm text-red-300">
                {error}
                {unverified && (
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={() => { void handleResendVerification() }}
                      className="underline text-lumen-gold hover:text-yellow-300 transition-colors"
                    >
                      Resend verification email
                    </button>
                  </div>
                )}
              </div>
            )}

            {resendStatus && (
              <div className="rounded-lg bg-green-900/30 border border-green-700/50 px-4 py-3 text-sm text-green-300">
                {resendStatus}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl border border-lumen-gold/60 bg-transparent hover:bg-lumen-gold/10 text-lumen-gold font-semibold py-3 transition-all hover:border-lumen-gold disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              {loading ? 'Signing in…' : 'Enter the Realm'}
            </button>
          </form>

          <p className="text-center text-gray-500 text-sm mt-6">
            New adventurer?{' '}
            <Link to="/register" className="text-lumen-violet hover:text-purple-400 transition-colors">
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}
