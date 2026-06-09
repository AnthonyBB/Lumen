import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

export default function RegisterPage() {
  const navigate = useNavigate()

  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('http://localhost:3001/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password, dateOfBirth }),
      })
      const data = (await res.json()) as { message?: string; error?: string }

      if (!res.ok) {
        setError(data.error ?? 'Registration failed. Please try again.')
        return
      }

      setSuccess(true)
    } catch {
      setError('Network error. Please check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-lumen-dark px-4">
        <div className="w-full max-w-md text-center">
          <div className="rounded-2xl border border-lumen-violet/30 bg-lumen-navy p-8 shadow-xl shadow-purple-900/20">
            <div className="text-5xl mb-4">✉️</div>
            <h2 className="font-display text-2xl font-bold text-lumen-gold mb-3">Check Your Email</h2>
            <p className="text-gray-300 mb-6">
              We sent a verification link to <span className="text-white font-semibold">{email}</span>.
              Click it to activate your account and begin your quest!
            </p>
            <button
              onClick={() => navigate('/')}
              className="px-6 py-3 rounded-xl border border-lumen-gold/60 text-lumen-gold font-semibold hover:bg-lumen-gold/10 transition-all"
            >
              Back to Login
            </button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-lumen-dark px-4 py-12">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <p className="font-display tracking-[0.4em] text-lumen-gold text-xs uppercase mb-2">
            Join the Realm
          </p>
          <h1 className="font-display text-4xl font-bold text-white">Create Account</h1>
          <p className="text-gray-400 mt-2 text-sm">Lumen is for players ages 7 and up.</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-white/10 bg-lumen-navy p-8 shadow-xl shadow-purple-900/20">
          <form onSubmit={(e) => { void handleSubmit(e) }} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-300 mb-1" htmlFor="username">
                Username <span className="text-gray-500">(3–20 characters)</span>
              </label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                required
                minLength={3}
                maxLength={20}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-lg bg-white/5 border border-white/10 focus:border-lumen-violet focus:outline-none px-4 py-2.5 text-white placeholder-gray-600 transition-colors"
                placeholder="HeroOfLumen"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-300 mb-1" htmlFor="reg-email">
                Email Address
              </label>
              <input
                id="reg-email"
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
              <label className="block text-sm text-gray-300 mb-1" htmlFor="reg-password">
                Password <span className="text-gray-500">(min 8 characters)</span>
              </label>
              <input
                id="reg-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg bg-white/5 border border-white/10 focus:border-lumen-violet focus:outline-none px-4 py-2.5 text-white placeholder-gray-600 transition-colors"
                placeholder="••••••••"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-300 mb-1" htmlFor="confirm-password">
                Confirm Password
              </label>
              <input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-lg bg-white/5 border border-white/10 focus:border-lumen-violet focus:outline-none px-4 py-2.5 text-white placeholder-gray-600 transition-colors"
                placeholder="••••••••"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-300 mb-1" htmlFor="dob">
                Date of Birth
              </label>
              <input
                id="dob"
                type="date"
                required
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                max={new Date().toISOString().split('T')[0]}
                className="w-full rounded-lg bg-white/5 border border-white/10 focus:border-lumen-violet focus:outline-none px-4 py-2.5 text-white placeholder-gray-600 transition-colors"
              />
              <p className="text-xs text-gray-500 mt-1">
                Required for age-appropriate content. You must be at least 7 years old to register.
              </p>
            </div>

            {error && (
              <div className="rounded-lg bg-red-900/30 border border-red-700/50 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-lumen-violet hover:bg-purple-600 text-white font-semibold py-3 transition-all hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              {loading ? 'Creating account…' : 'Begin Your Quest'}
            </button>
          </form>

          <p className="text-center text-gray-500 text-sm mt-6">
            Already have an account?{' '}
            <Link to="/" className="text-lumen-gold hover:text-yellow-300 transition-colors">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}
