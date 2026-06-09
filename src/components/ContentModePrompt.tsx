import { useState } from 'react'

interface ContentModePromptProps {
  /** Called once the user has made their selection and the server has confirmed it. */
  onConfirm: (mode: 'child' | 'adolescent') => Promise<void>
  /** ageGroup from JWT — used to decide whether to offer the Adolescent+ option. */
  ageGroup: 'child' | 'teen' | 'adult'
}

export default function ContentModePrompt({ onConfirm, ageGroup }: ContentModePromptProps) {
  const [selected, setSelected] = useState<'child' | 'adolescent' | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Accounts with ageGroup 'child' (registered under 13) can only choose child mode.
  const canChooseAdolescent = ageGroup !== 'child'

  async function handleConfirm() {
    if (!selected) return
    setLoading(true)
    setError(null)
    try {
      await onConfirm(selected)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-lumen-dark/95 backdrop-blur-sm">
      {/* Decorative glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-lumen-purple/20 blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-lg mx-4">
        {/* Panel */}
        <div className="rounded-2xl border border-white/10 bg-[#12122e]/95 shadow-2xl shadow-purple-900/40 p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-lumen-purple/20 border border-lumen-purple/40 mb-4">
              <svg className="w-8 h-8 text-lumen-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
            </div>
            <h1 className="font-display text-2xl font-bold text-lumen-gold tracking-widest mb-2">
              Welcome, Adventurer!
            </h1>
            <p className="text-gray-400 text-sm leading-relaxed">
              Before you enter the realm of Lumen, tell us who you are.
              This helps us show you the right questions and challenges.
            </p>
          </div>

          {/* Choices */}
          <div className="grid grid-cols-1 gap-4 mb-6">
            {/* Child mode */}
            <button
              onClick={() => setSelected('child')}
              className={`relative rounded-xl border p-5 text-left transition-all ${
                selected === 'child'
                  ? 'border-lumen-gold bg-lumen-gold/10 shadow-lg shadow-lumen-gold/20'
                  : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/8'
              }`}
            >
              <div className="flex items-start gap-4">
                <span className="text-3xl mt-0.5">🌟</span>
                <div>
                  <p className="font-semibold text-white mb-1">Young Explorer</p>
                  <p className="text-sm text-gray-400">
                    Ages 7–12 · Safe, age-appropriate questions covering math, science,
                    history and language. Easy and medium challenges only.
                  </p>
                </div>
              </div>
              {selected === 'child' && (
                <span className="absolute top-3 right-3 text-lumen-gold text-lg">✓</span>
              )}
            </button>

            {/* Adolescent mode */}
            <button
              onClick={() => canChooseAdolescent && setSelected('adolescent')}
              disabled={!canChooseAdolescent}
              className={`relative rounded-xl border p-5 text-left transition-all ${
                !canChooseAdolescent
                  ? 'border-white/5 bg-white/2 opacity-40 cursor-not-allowed'
                  : selected === 'adolescent'
                  ? 'border-lumen-violet bg-lumen-violet/10 shadow-lg shadow-purple-900/30'
                  : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/8'
              }`}
            >
              <div className="flex items-start gap-4">
                <span className="text-3xl mt-0.5">⚔️</span>
                <div>
                  <p className="font-semibold text-white mb-1">
                    Seasoned Adventurer
                    {!canChooseAdolescent && (
                      <span className="ml-2 text-xs text-gray-500 font-normal">(requires age 13+)</span>
                    )}
                  </p>
                  <p className="text-sm text-gray-400">
                    Ages 13+ · Full question library including more complex topics,
                    hard difficulty, and expanded challenge content.
                  </p>
                </div>
              </div>
              {selected === 'adolescent' && (
                <span className="absolute top-3 right-3 text-lumen-violet text-lg">✓</span>
              )}
            </button>
          </div>

          {/* Error */}
          {error && (
            <p className="text-red-400 text-sm text-center mb-4">{error}</p>
          )}

          {/* Confirm button */}
          <button
            onClick={handleConfirm}
            disabled={!selected || loading}
            className="w-full py-3 rounded-xl bg-lumen-violet hover:bg-purple-600 disabled:opacity-40 disabled:cursor-not-allowed font-semibold text-white transition-colors text-sm tracking-wide"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Entering the realm…
              </span>
            ) : (
              'Enter Lumen →'
            )}
          </button>

          <p className="text-center text-xs text-gray-600 mt-4">
            You can change this anytime in Settings.
          </p>
        </div>
      </div>
    </div>
  )
}
