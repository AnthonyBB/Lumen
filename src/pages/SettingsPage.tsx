import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import Nav from '../components/Nav'

export default function SettingsPage() {
  const { user, setContentMode, logout } = useAuth()
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  if (!user) return null

  const canChooseAdolescent = user.ageGroup !== 'child'

  async function handleContentModeChange(mode: 'child' | 'adolescent') {
    if (mode === user!.contentMode) return
    setSaving(true)
    setSaveError(null)
    setSaveSuccess(false)
    try {
      await setContentMode(mode)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const contentModeLabel =
    user.contentMode === 'adolescent'
      ? 'Seasoned Adventurer (13+)'
      : user.contentMode === 'child'
      ? 'Young Explorer (7-12)'
      : 'Not yet selected'

  return (
    <div className="min-h-screen bg-lumen-dark text-white">
      <Nav />

      {/* Page glow */}
      <div className="fixed top-0 left-0 right-0 h-64 bg-gradient-to-b from-lumen-purple/10 to-transparent pointer-events-none" />

      <main className="relative max-w-2xl mx-auto px-4 pt-28 pb-16">
        <h1 className="font-display text-3xl font-bold text-lumen-gold tracking-widest mb-2">
          Settings
        </h1>
        <p className="text-gray-500 text-sm mb-10">
          Manage your Lumen account preferences.
        </p>

        {/* Account info */}
        <section className="rounded-2xl border border-white/10 bg-white/5 p-6 mb-6">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-4">
            Account
          </h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500 text-xs mb-1">Username</p>
              <p className="text-white font-semibold">{user.username}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs mb-1">Age Group</p>
              <p className="text-white font-semibold capitalize">{user.ageGroup}</p>
            </div>
          </div>
        </section>

        {/* Content Mode */}
        <section className="rounded-2xl border border-white/10 bg-white/5 p-6 mb-6">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-1">
                Content Mode
              </h2>
              <p className="text-gray-400 text-sm">
                Controls the difficulty and topics of questions shown to you.
                {!canChooseAdolescent && (
                  <span className="ml-1 text-yellow-500">
                    Adolescent+ requires an account registered at age 13+.
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="mt-4 mb-1 text-xs text-gray-500">
            Current: <span className="text-lumen-gold">{contentModeLabel}</span>
          </div>

          <div className="grid grid-cols-1 gap-3 mt-4">
            {/* Child mode button */}
            <button
              onClick={() => handleContentModeChange('child')}
              disabled={saving}
              className={`relative rounded-xl border p-4 text-left transition-all ${
                user.contentMode === 'child'
                  ? 'border-lumen-gold bg-lumen-gold/10 cursor-default'
                  : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/8'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">🌟</span>
                <div>
                  <p className="font-semibold text-white text-sm">Young Explorer</p>
                  <p className="text-xs text-gray-400">Ages 7–12 · Safe content, easy & medium difficulty</p>
                </div>
                {user.contentMode === 'child' && (
                  <span className="ml-auto text-lumen-gold text-sm font-bold">Active</span>
                )}
              </div>
            </button>

            {/* Adolescent mode button */}
            <button
              onClick={() => canChooseAdolescent && handleContentModeChange('adolescent')}
              disabled={!canChooseAdolescent || saving}
              className={`relative rounded-xl border p-4 text-left transition-all ${
                !canChooseAdolescent
                  ? 'border-white/5 bg-white/2 opacity-40 cursor-not-allowed'
                  : user.contentMode === 'adolescent'
                  ? 'border-lumen-violet bg-lumen-violet/10 cursor-default'
                  : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/8'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">⚔️</span>
                <div>
                  <p className="font-semibold text-white text-sm">
                    Seasoned Adventurer
                    {!canChooseAdolescent && (
                      <span className="ml-2 text-xs text-gray-500 font-normal">(age 13+ required)</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-400">Ages 13+ · Full question library, all difficulty levels</p>
                </div>
                {user.contentMode === 'adolescent' && (
                  <span className="ml-auto text-lumen-violet text-sm font-bold">Active</span>
                )}
              </div>
            </button>
          </div>

          {/* Status messages */}
          {saving && (
            <p className="text-sm text-gray-400 mt-3 flex items-center gap-2">
              <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Saving…
            </p>
          )}
          {saveSuccess && (
            <p className="text-sm text-green-400 mt-3">✓ Content mode updated successfully.</p>
          )}
          {saveError && (
            <p className="text-sm text-red-400 mt-3">{saveError}</p>
          )}
        </section>

        {/* Sign out */}
        <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-4">
            Session
          </h2>
          <button
            onClick={logout}
            className="px-5 py-2.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 text-sm font-semibold transition-colors"
          >
            Sign Out
          </button>
        </section>
      </main>
    </div>
  )
}
