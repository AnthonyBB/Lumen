import { useEffect, useState } from 'react'
import Phaser from 'phaser'
import { io, Socket } from 'socket.io-client'
import { gameConfig } from '../game/config'
import ContentModePrompt from '../components/ContentModePrompt'
import LevelUpCelebration from '../components/LevelUpCelebration'
import RosterPanel, { type RosterData } from '../components/RosterPanel'
import StudyPanel, { type HasteData } from '../components/StudyPanel'
import { forceLogout, type AuthUser } from '../hooks/useAuth'
import { InventoryStore } from '../game/systems/InventoryStore'
import { StatsStore } from '../game/systems/StatsStore'
import { RankStore } from '../game/systems/RankStore'
import { API_BASE } from '../config'

interface GamePageProps {
  token: string | null
  user: AuthUser | null
  setContentMode: (mode: 'child' | 'adolescent') => Promise<void>
}

interface AdventureRank { id: string; name: string; minGrade: number; maxGrade: number }

export default function GamePage({ token, user, setContentMode }: GamePageProps) {
  const [playersOnline, setPlayersOnline] = useState<number | null>(null)
  const [rankId, setRankId] = useState<string | null>(null)
  const [ranks, setRanks] = useState<AdventureRank[]>([])
  // The level to celebrate (null = no celebration showing). Keyed remount on
  // change lets back-to-back level-ups each replay the animation.
  const [celebrateLevel, setCelebrateLevel] = useState<number | null>(null)
  const [roster, setRoster] = useState<RosterData | null>(null)
  const [rosterOpen, setRosterOpen] = useState(false)
  const [haste, setHaste] = useState<HasteData | null>(null)
  const [studyOpen, setStudyOpen] = useState(false)

  const emit = (event: string, payload?: unknown) => {
    const sock = (window as typeof window & { __lumenSocket?: Socket }).__lumenSocket
    sock?.emit(event, payload)
  }

  /** Change the player's adventure rank — the grade band their questions are
   *  drawn from. Any rank is allowed (not age-gated). */
  const changeRank = (id: string) => {
    const sock = (window as typeof window & { __lumenSocket?: Socket }).__lumenSocket
    sock?.emit('adventureRank:set', { rankId: id })
  }

  // Show content-mode prompt if the user hasn't selected one yet
  const needsContentMode = user !== null && user.contentMode === null

  useEffect(() => {
    if (needsContentMode) return // don't connect socket until mode is chosen

    const s = io(API_BASE, {
      auth: token ? { token } : {},
    })

    s.on('players:online', (count: number) => {
      setPlayersOnline(count)
    })

    s.on('adventureRank:data', (d: { rankId: string; ranks: AdventureRank[] }) => {
      setRankId(d.rankId)
      setRanks(d.ranks ?? [])
    })

    // Flashy level-up celebration — fires whenever the server confirms a level
    // gain (combat XP is the only source). Works regardless of the active Phaser
    // scene since this overlay lives in React, above the canvas.
    s.on('player:xp_updated', (d: { newLevel?: number; leveledUp?: boolean }) => {
      if (d?.leveledUp && typeof d.newLevel === 'number') setCelebrateLevel(d.newLevel)
    })

    s.on('roster:data', (d: RosterData) => setRoster(d))
    s.on('haste:data', (d: HasteData) => setHaste(d))

    s.on('connect', () => {
      // (Re)join on every connect — including reconnects after a server
      // restart. Without this the server has no player record for the socket
      // and every shop/learning/inventory action fails with "You must join...".
      // The server derives identity from the JWT; the payload is informational.
      s.emit('player:join', { username: user?.username ?? '' })
      s.emit('players:get_online')
      s.emit('adventureRank:get')
      s.emit('roster:get')
      s.emit('haste:get')
      // Bind the inventory store to this (possibly new) socket so the HUD
      // shard counters receive inventory:data / inventory:updated pushes.
      InventoryStore.init(s)
      // Bind the stats store too so Character / Equipment screens receive
      // server-pushed `stats:update` snapshots (attributes + derived stats).
      StatsStore.init(s)
      // Bind the rank store so the Phaser scenes (crafting cost preview, combat
      // scaling) see the player's current adventure rank.
      RankStore.init(s)
    })

    // The server rejects sockets with invalid/expired tokens. Without this,
    // socket.io retries forever with the same bad token while the UI still
    // looks logged in (and Players Online never updates).
    s.on('connect_error', (err) => {
      if (err.message === 'Invalid token') forceLogout()
    })

    ;(window as typeof window & { __lumenSocket?: Socket }).__lumenSocket = s

    return () => {
      s.disconnect()
    }
  }, [token, needsContentMode, user?.username])

  useEffect(() => {
    if (needsContentMode) return // don't start Phaser until mode is chosen

    const game = new Phaser.Game({
      ...gameConfig,
      parent: 'game-container',
    })
    return () => {
      game.destroy(true)
      // Phaser scenes mount HTML overlay inputs (market search, tavern chat) as
      // siblings of the canvas. Destroying the game removes the canvas but not
      // those siblings, so sweep them here to avoid orphans floating over the
      // app after a StrictMode remount or HMR reload.
      for (const id of ['lumen-market-search', 'lumen-tavern-chat']) {
        document.getElementById(id)?.remove()
      }
    }
  }, [needsContentMode])

  // --- Content mode not yet chosen: show blocking prompt ---
  if (needsContentMode) {
    return (
      <ContentModePrompt
        ageGroup={user.ageGroup}
        onConfirm={setContentMode}
      />
    )
  }

  return (
    <div className="flex flex-col flex-1 min-h-screen pt-16 bg-lumen-dark">
      {/* Flashy level-up celebration (keyed so consecutive level-ups replay it) */}
      {celebrateLevel !== null && (
        <LevelUpCelebration
          key={celebrateLevel}
          level={celebrateLevel}
          onDone={() => setCelebrateLevel(null)}
        />
      )}

      {/* Roster panel (view/select/recruit characters) */}
      {rosterOpen && roster && (
        <RosterPanel
          roster={roster}
          onSetActive={(id) => emit('roster:set_active', { characterId: id })}
          onSetParty={(party) => emit('party:set', { party })}
          onCreate={(name, cls) => emit('roster:create', { name, class: cls })}
          onClose={() => setRosterOpen(false)}
        />
      )}

      {/* Study-to-Haste panel */}
      {studyOpen && haste && (
        <StudyPanel haste={haste} onClose={() => setStudyOpen(false)} />
      )}

      {/* Game canvas */}
      <div className="flex flex-1 items-center justify-center p-4">
        <div
          id="game-container"
          className="relative w-full max-w-[1280px] aspect-video rounded-2xl overflow-hidden border border-white/10 shadow-2xl shadow-purple-900/30"
        />
      </div>

      {/* HUD */}
      <div className="px-4 pb-6 max-w-[1280px] mx-auto w-full">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <button
            onClick={() => roster && setRosterOpen(true)}
            disabled={!roster}
            className="rounded-xl border border-white/10 bg-white/5 p-4 text-left transition-colors hover:border-lumen-gold/40 hover:bg-white/10 disabled:cursor-default"
          >
            <p className="text-xs text-gray-500 mb-1 font-semibold uppercase tracking-wider">
              Roster{roster ? ` · ${roster.characters.length}` : ''}
            </p>
            <p className="font-display text-lg text-lumen-gold truncate">
              {(() => {
                const active = roster?.characters.find((c) => c.id === roster.activeCharacterId)
                return active ? active.name : user?.username ?? '— awaiting login —'
              })()}
            </p>
            {roster && <p className="text-[10px] text-gray-500 mt-0.5">Tap to manage characters</p>}
          </button>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
            <p className="text-xs text-gray-500 mb-1 font-semibold uppercase tracking-wider">Players Online</p>
            <p className="font-display text-lg text-lumen-gold">
              {playersOnline !== null ? playersOnline : '—'}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
            <p className="text-xs text-gray-500 mb-1 font-semibold uppercase tracking-wider">Content Mode</p>
            <p className="font-display text-sm text-lumen-gold">
              {user?.contentMode === 'adolescent'
                ? '⚔️ Seasoned Adventurer'
                : user?.contentMode === 'child'
                ? '🌟 Young Explorer'
                : '—'}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs text-gray-500 mb-1 font-semibold uppercase tracking-wider">Adventure Rank</p>
            <select
              value={rankId ?? ''}
              onChange={(e) => changeRank(e.target.value)}
              disabled={ranks.length === 0}
              className="w-full bg-lumen-dark/60 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-lumen-gold font-display focus:outline-none focus:border-lumen-gold/50 disabled:opacity-50"
            >
              {rankId === null && <option value="">—</option>}
              {ranks.map((r) => (
                <option key={r.id} value={r.id} className="bg-lumen-dark text-white">{r.name}</option>
              ))}
            </select>
            <p className="text-[10px] text-gray-500 mt-1">Sets the grade level of your questions.</p>
          </div>
          <button
            onClick={() => haste && setStudyOpen(true)}
            disabled={!haste}
            className="rounded-xl border border-white/10 bg-white/5 p-4 text-left transition-colors hover:border-lumen-gold/40 hover:bg-white/10 disabled:cursor-default"
          >
            <p className="text-xs text-gray-500 mb-1 font-semibold uppercase tracking-wider">Study Hall</p>
            <p className="font-display text-lg text-lumen-gold">
              {haste
                ? `Battle every ${Math.floor(haste.intervalMinutes / 60) > 0 ? `${Math.floor(haste.intervalMinutes / 60)}h` : ''}${haste.intervalMinutes % 60 > 0 ? ` ${haste.intervalMinutes % 60}m` : (Math.floor(haste.intervalMinutes / 60) > 0 ? '' : '0m')}`.trim()
                : '—'}
            </p>
            <p className="text-[10px] text-gray-500 mt-1">Study to speed up idle battles.</p>
          </button>
        </div>
      </div>
    </div>
  )
}
