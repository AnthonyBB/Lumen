import { useState } from 'react'
import type { Socket } from 'socket.io-client'
import { DIFFICULTIES, DIFFICULTY_ORDER } from '../game/data/mobs'

/**
 * Idle / auto-battle panel — deploy your party to a campaign so it fights
 * automatically while you're away (docs/CHARACTERS_DESIGN.md §6/§7). Rewards are
 * computed server-side on login; this just deploys/recalls and shows status.
 */

export interface IdleStatus {
  assigned: boolean
  biome: string | null
  difficulty: string | null
  intervalMinutes: number
}

const BIOMES = [
  'Desert', 'Pine Forest', 'Deciduous Forest', 'Swamp',
  'Snow', 'Grassland', 'Tropical Rainforest', 'Ocean',
]

function fmtInterval(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ''}` : `${m}m`
}

interface Props {
  status: IdleStatus
  onClose: () => void
}

export default function IdlePanel({ status, onClose }: Props) {
  const [biome, setBiome] = useState(status.biome ?? BIOMES[0])
  const [difficulty, setDifficulty] = useState(status.difficulty ?? 'novice')

  const socket = () => (window as typeof window & { __lumenSocket?: Socket }).__lumenSocket
  const deploy = () => socket()?.emit('idle:assign', { biome, difficulty })
  const recall = () => socket()?.emit('idle:clear')

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-lumen-gold/30 bg-lumen-dark shadow-2xl shadow-purple-900/40" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <div>
            <h2 className="font-display text-xl text-lumen-gold">Idle Campaigns</h2>
            <p className="text-xs text-gray-400">Send your party to fight while you're away</p>
          </div>
          <button onClick={onClose} className="rounded-md px-2 py-1 text-gray-400 hover:bg-white/10 hover:text-white" aria-label="Close">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {status.assigned ? (
            <div className="rounded-xl border border-lumen-gold/40 bg-lumen-gold/10 p-4">
              <p className="text-sm text-gray-200">Your team is deployed to</p>
              <p className="font-display text-lg text-lumen-gold">{status.biome} · {DIFFICULTIES[status.difficulty as keyof typeof DIFFICULTIES]?.label ?? status.difficulty}</p>
              <p className="mt-1 text-xs text-gray-400">Fights a battle every {fmtInterval(status.intervalMinutes)} · rewards arrive when you log in. Study to go faster.</p>
              <button onClick={recall} className="mt-3 rounded-lg border border-red-500/50 px-4 py-1.5 text-sm text-red-300 hover:bg-red-500/15">Recall team</button>
            </div>
          ) : (
            <p className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-gray-300">
              No team deployed. Pick a campaign below — your party will fight it automatically, and you'll collect the rewards each time you return.
            </p>
          )}

          <div className="space-y-2">
            <label className="block text-xs uppercase tracking-wider text-gray-500">Campaign</label>
            <select value={biome} onChange={(e) => setBiome(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-lumen-dark/60 px-3 py-2 text-white focus:border-lumen-gold/50 focus:outline-none">
              {BIOMES.map((b) => <option key={b} value={b} className="bg-lumen-dark">{b}</option>)}
            </select>
            <label className="block text-xs uppercase tracking-wider text-gray-500">Difficulty</label>
            <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-lumen-dark/60 px-3 py-2 text-white focus:border-lumen-gold/50 focus:outline-none">
              {DIFFICULTY_ORDER.map((d) => (
                <option key={d} value={d} className="bg-lumen-dark">{DIFFICULTIES[d].icon} {DIFFICULTIES[d].label}</option>
              ))}
            </select>
          </div>

          <button onClick={deploy}
            className="w-full rounded-xl bg-lumen-gold/90 px-4 py-3 font-display font-bold text-lumen-dark hover:bg-lumen-gold">
            {status.assigned ? 'Redeploy team here' : '🚩 Deploy team'}
          </button>
          <p className="text-[11px] text-gray-500">Higher difficulty = bigger rewards, but your team must be strong enough to win. Recruit and rank up your party to push further.</p>
        </div>
      </div>
    </div>
  )
}
