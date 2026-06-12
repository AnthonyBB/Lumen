import { useEffect, useMemo, useState } from 'react'

/**
 * A flashy, self-dismissing "LEVEL UP!" celebration overlay.
 *
 * Rendered by GamePage whenever the server reports `player:xp_updated` with
 * `leveledUp: true`. Purely cosmetic feedback — the actual reward (attribute
 * points) is granted server-side. Fixed to the viewport above the game canvas,
 * pointer-events disabled so it never blocks input.
 */

const CONFETTI_COLORS = ['#ffd54f', '#a78bfa', '#22d3ee', '#f472b6', '#fb923c', '#ffffff']

/** Points granted per level — mirrors the server's POINTS_PER_LEVEL. */
const POINTS_PER_LEVEL = 3

interface Props {
  level: number
  onDone: () => void
}

export default function LevelUpCelebration({ level, onDone }: Props) {
  const [leaving, setLeaving] = useState(false)

  // Stable confetti field for this mount.
  const confetti = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => ({
        left: Math.random() * 100,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        delay: Math.random() * 0.6,
        duration: 1.6 + Math.random() * 1.4,
        size: 7 + Math.random() * 8,
        rot: Math.random() * 360,
        sway: (Math.random() * 2 - 1) * 60,
      })),
    [],
  )

  useEffect(() => {
    playFanfare()
    const leaveT = setTimeout(() => setLeaving(true), 3200)
    const doneT = setTimeout(onDone, 3900)
    return () => {
      clearTimeout(leaveT)
      clearTimeout(doneT)
    }
  }, [onDone])

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center pointer-events-none overflow-hidden"
      style={{ animation: leaving ? 'lu-fade 0.7s ease-in forwards' : undefined }}
      aria-live="polite"
    >
      <style>{KEYFRAMES}</style>

      {/* Dim + radial glow backdrop */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 50% 45%, rgba(255,200,80,0.22), rgba(10,5,25,0.55) 60%, rgba(10,5,25,0.78))',
          animation: 'lu-bgpulse 1.6s ease-out',
        }}
      />

      {/* Rotating sunburst rays */}
      <div
        className="absolute"
        style={{
          width: 1200,
          height: 1200,
          background:
            'repeating-conic-gradient(from 0deg, rgba(255,213,79,0.18) 0deg 7deg, transparent 7deg 14deg)',
          animation: 'lu-rays 9s linear infinite, lu-popfade 0.8s ease-out',
          maskImage: 'radial-gradient(circle, black 0%, black 38%, transparent 62%)',
          WebkitMaskImage: 'radial-gradient(circle, black 0%, black 38%, transparent 62%)',
        }}
      />

      {/* Confetti */}
      {confetti.map((c, i) => (
        <span
          key={i}
          className="absolute top-[-6%] rounded-sm"
          style={{
            left: `${c.left}%`,
            width: c.size,
            height: c.size * 1.4,
            background: c.color,
            transform: `rotate(${c.rot}deg)`,
            // CSS var consumed by the keyframe for a gentle horizontal drift
            ['--lu-sway' as string]: `${c.sway}px`,
            animation: `lu-confetti ${c.duration}s ${c.delay}s cubic-bezier(.4,.1,.5,1) forwards`,
            boxShadow: `0 0 6px ${c.color}`,
          }}
        />
      ))}

      {/* Centre card */}
      <div
        className="relative text-center px-10"
        style={{ animation: 'lu-pop 0.7s cubic-bezier(.18,1.4,.4,1)' }}
      >
        <div
          className="font-display font-black tracking-tight leading-none"
          style={{
            fontSize: 'clamp(44px, 8vw, 96px)',
            backgroundImage: 'linear-gradient(180deg, #fff7d6 0%, #ffd54f 45%, #f0a020 100%)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
            filter: 'drop-shadow(0 3px 0 rgba(120,60,0,0.45)) drop-shadow(0 0 26px rgba(255,200,70,0.85))',
            animation: 'lu-glow 1.1s ease-in-out infinite alternate',
          }}
        >
          LEVEL&nbsp;UP!
        </div>

        <div
          className="mt-3 inline-flex items-center gap-3 rounded-full px-6 py-2"
          style={{
            background: 'rgba(20,10,40,0.72)',
            border: '2px solid rgba(255,213,79,0.7)',
            boxShadow: '0 0 24px rgba(167,139,250,0.55), inset 0 0 18px rgba(255,213,79,0.18)',
          }}
        >
          <span className="text-2xl" aria-hidden>⭐</span>
          <span
            className="font-display font-bold text-white"
            style={{ fontSize: 'clamp(18px, 2.4vw, 28px)' }}
          >
            You reached <span className="text-lumen-gold">Level {level}</span>
          </span>
          <span className="text-2xl" aria-hidden>⭐</span>
        </div>

        <p
          className="mt-4 font-semibold"
          style={{
            color: '#c4b5fd',
            textShadow: '0 1px 8px rgba(0,0,0,0.6)',
            animation: 'lu-rise 0.8s ease-out 0.25s both',
          }}
        >
          +{POINTS_PER_LEVEL} Attribute Points — spend them in your Character screen!
        </p>
      </div>
    </div>
  )
}

/** A short triumphant arpeggio via the Web Audio API (no asset needed). */
function playFanfare() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const master = ctx.createGain()
    master.gain.value = 0.16
    master.connect(ctx.destination)

    // C5, E5, G5, C6 — a bright rising major arpeggio, with a final shimmer.
    const notes = [523.25, 659.25, 783.99, 1046.5]
    notes.forEach((freq, i) => {
      const t = ctx.currentTime + i * 0.12
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(1, t + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5)
      osc.connect(gain)
      gain.connect(master)
      osc.start(t)
      osc.stop(t + 0.55)
    })
    // Close the context shortly after the sound finishes.
    setTimeout(() => ctx.close().catch(() => {}), 1200)
  } catch {
    /* audio is a nice-to-have; never let it break the celebration */
  }
}

const KEYFRAMES = `
@keyframes lu-pop {
  0%   { transform: scale(0.4); opacity: 0; }
  60%  { transform: scale(1.08); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
@keyframes lu-popfade {
  0% { opacity: 0; transform: scale(0.6); }
  100% { opacity: 1; transform: scale(1); }
}
@keyframes lu-rays { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes lu-glow {
  from { filter: drop-shadow(0 3px 0 rgba(120,60,0,0.45)) drop-shadow(0 0 18px rgba(255,200,70,0.7)); }
  to   { filter: drop-shadow(0 3px 0 rgba(120,60,0,0.45)) drop-shadow(0 0 34px rgba(255,225,120,1)); }
}
@keyframes lu-rise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
@keyframes lu-bgpulse { 0% { opacity: 0; } 30% { opacity: 1; } 100% { opacity: 1; } }
@keyframes lu-fade { to { opacity: 0; } }
@keyframes lu-confetti {
  0%   { transform: translate(0,0) rotate(0deg); opacity: 1; }
  100% { transform: translate(var(--lu-sway, 0px), 112vh) rotate(720deg); opacity: 0.9; }
}
`
