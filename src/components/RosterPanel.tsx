import { useState } from 'react'
import { SKILL_CLASSES } from '../game/data/skillTrees'
import { Sfx } from '../game/systems/Sfx'

/**
 * Roster panel — view your characters, switch the active one, and recruit new
 * ones (free up to the starting team of 4; more comes via recruitment later).
 * Fed by the server's `roster:data`; all mutations go through the socket and the
 * server re-pushes state. See docs/CHARACTERS_DESIGN.md §1–2.
 */

export interface RosterCharacter {
  id: string
  name: string
  class: string
  level: number
  xp: number
}

export interface RosterData {
  characters: RosterCharacter[]
  activeCharacterId: string
  party: string[]
  freeSlots: number
  recruitTokens: number
  /** Recruit-Token cost of the NEXT character (0 while free slots remain). */
  recruitCost: number
  maxRoster: number
}

const MAX_PARTY = 4

interface Props {
  roster: RosterData
  onSetActive: (characterId: string) => void
  onSetParty: (party: string[]) => void
  onCreate: (name: string, cls: string) => void
  onClose: () => void
  /** Open straight to the recruit form (e.g. from the Mercenary Guild). */
  startRecruiting?: boolean
}

/** 'fire_mage' → 'Fire Mage' */
export function classLabel(cls: string): string {
  return cls.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

export default function RosterPanel({ roster, onSetActive, onSetParty, onCreate, onClose, startRecruiting }: Props) {
  const [recruiting, setRecruiting] = useState(!!startRecruiting)
  const [name, setName] = useState('')
  const [cls, setCls] = useState<string>(SKILL_CLASSES[3]) // 'sword' — a friendly default
  const atMaxRoster = roster.characters.length >= roster.maxRoster
  const recruitCost = roster.recruitCost
  const canAfford = recruitCost === 0 || roster.recruitTokens >= recruitCost
  const canRecruit = !atMaxRoster && canAfford
  const partyFull = roster.party.length >= MAX_PARTY

  const toggleParty = (id: string) => {
    if (roster.party.includes(id)) {
      if (roster.party.length <= 1) return // a party always has at least one
      onSetParty(roster.party.filter((p) => p !== id))
    } else {
      if (partyFull) return
      onSetParty([...roster.party, id])
    }
  }

  const submit = () => {
    if (name.trim().length < 2) return
    onCreate(name.trim(), cls)
    Sfx.play('recruit')
    setName('')
    setRecruiting(false)
  }

  return (
    <div
      className="fixed inset-0 z-[55] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-lumen-gold/30 bg-lumen-dark shadow-2xl shadow-purple-900/40"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <div>
            <h2 className="font-display text-xl text-lumen-gold">Your Roster</h2>
            <p className="text-xs text-gray-400">
              Campaign party: <span className="text-lumen-gold">{roster.party.length}/{MAX_PARTY}</span> · ★ marks party members · 🎟️ <span className="text-lumen-gold">{roster.recruitTokens}</span> tokens
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 text-gray-400 hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Character list */}
        <div className="max-h-[55vh] overflow-y-auto p-4 space-y-2">
          {roster.characters.map((c) => {
            const active = c.id === roster.activeCharacterId
            const inParty = roster.party.includes(c.id)
            const lastInParty = inParty && roster.party.length <= 1
            return (
              <div
                key={c.id}
                className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
                  active
                    ? 'border-lumen-gold/70 bg-lumen-gold/10'
                    : 'border-white/10 bg-white/5'
                }`}
              >
                <div className="min-w-0">
                  <p className="font-display text-base text-white truncate">
                    {inParty && <span className="mr-1 text-lumen-gold" title="In campaign party">★</span>}
                    {c.name}
                    {active && <span className="ml-2 text-xs text-lumen-gold">● Active</span>}
                  </p>
                  <p className="text-xs text-gray-400">
                    {classLabel(c.class)} · Level {c.level}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {/* Party toggle */}
                  <button
                    onClick={() => toggleParty(c.id)}
                    disabled={(!inParty && partyFull) || lastInParty}
                    title={inParty ? 'Remove from party' : 'Add to party'}
                    className={`rounded-lg border px-2.5 py-1.5 text-sm disabled:opacity-30 disabled:cursor-not-allowed ${
                      inParty
                        ? 'border-lumen-gold/60 bg-lumen-gold/15 text-lumen-gold'
                        : 'border-white/15 text-gray-300 hover:bg-white/10'
                    }`}
                  >
                    {inParty ? '★ In party' : '☆ Party'}
                  </button>
                  {/* Active (solo screens) */}
                  {active ? (
                    <span className="text-xs font-semibold text-lumen-gold">In play</span>
                  ) : (
                    <button
                      onClick={() => onSetActive(c.id)}
                      className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-gray-200 hover:bg-white/10"
                    >
                      Play as
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Recruit */}
        <div className="border-t border-white/10 p-4">
          {!recruiting ? (
            <button
              onClick={() => setRecruiting(true)}
              disabled={!canRecruit}
              className="w-full rounded-xl border border-lumen-gold/40 px-4 py-2.5 font-display text-lumen-gold hover:bg-lumen-gold/15 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {atMaxRoster
                ? 'Roster full'
                : recruitCost === 0
                ? `＋ Recruit a character (${roster.freeSlots} free ${roster.freeSlots === 1 ? 'slot' : 'slots'})`
                : canAfford
                ? `＋ Recruit a character (🎟️ ${recruitCost})`
                : `Need 🎟️ ${recruitCost} to recruit (you have ${roster.recruitTokens}) — clear campaigns to earn more`}
            </button>
          ) : (
            <div className="space-y-3">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Character name"
                maxLength={20}
                className="w-full rounded-lg border border-white/10 bg-lumen-dark/60 px-3 py-2 text-white focus:border-lumen-gold/50 focus:outline-none"
              />
              <select
                value={cls}
                onChange={(e) => setCls(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-lumen-dark/60 px-3 py-2 text-white focus:border-lumen-gold/50 focus:outline-none"
              >
                {SKILL_CLASSES.map((k) => (
                  <option key={k} value={k} className="bg-lumen-dark">
                    {classLabel(k)}
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <button
                  onClick={submit}
                  disabled={name.trim().length < 2 || !canRecruit}
                  className="flex-1 rounded-lg bg-lumen-gold/90 px-4 py-2 font-display font-bold text-lumen-dark hover:bg-lumen-gold disabled:opacity-40"
                >
                  {recruitCost > 0 ? `Recruit (🎟️ ${recruitCost})` : 'Recruit'}
                </button>
                <button
                  onClick={() => setRecruiting(false)}
                  className="rounded-lg border border-white/10 px-4 py-2 text-gray-300 hover:bg-white/10"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
