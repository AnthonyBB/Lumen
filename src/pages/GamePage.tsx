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
import { Sfx } from '../game/systems/Sfx'
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
  // When the roster panel is opened from the in-world Mercenary Guild, jump it
  // straight to the recruit form.
  const [rosterRecruit, setRosterRecruit] = useState(false)
  // Which Garrison view to open the roster panel on (Barracks vs Squads).
  const [rosterView, setRosterView] = useState<'barracks' | 'squads' | 'spoils'>('barracks')
  const [muted, setMuted] = useState(Sfx.isMuted)
  const [haste, setHaste] = useState<HasteData | null>(null)
  const [studyOpen, setStudyOpen] = useState(false)
  const [idleSummary, setIdleSummary] = useState<{
    battles: number; wins: number; losses: number; silver: number
    xpByCharacter: { name: string; xp: number }[]
    items: { name: string; icon: string; rarity: string }[]
  } | null>(null)

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
    s.on('idle:summary', (d: typeof idleSummary) => { if (d && d.battles > 0) setIdleSummary(d) })

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

  // Bridge: the Garrison's Barracks Master / Squad Captain NPCs (Phaser) ask
  // React to open the roster panel — Phaser can't toggle React state directly,
  // so it dispatches a window event we listen for here. `detail.recruit` jumps
  // straight to the recruit step; `detail.view` locks the panel to that single
  // NPC's view (Barracks / Squads / War Spoils — no cross-navigation).
  useEffect(() => {
    const open = (e: Event) => {
      const detail = (e as CustomEvent<{ recruit?: boolean; view?: string }>).detail
      setRosterRecruit(!!detail?.recruit)
      if (detail?.view === 'barracks' || detail?.view === 'squads' || detail?.view === 'spoils') {
        setRosterView(detail.view)
      }
      // Opening the War Spoils Table settles owed battles (open-to-credit).
      if (detail?.view === 'spoils') emit('deployments:get')
      setRosterOpen(true)
    }
    window.addEventListener('lumen:open-roster', open)
    return () => window.removeEventListener('lumen:open-roster', open)
  }, [])

  // Bridge: tell the active Phaser scene to suspend keyboard input while an
  // input-bearing React overlay sits over the canvas. Without this the scene's
  // update() keeps reading WASD/arrows (moving the player) and E (NPC talk +
  // sound), and Phaser's key handling steals letters from the focused <input>.
  // The roster panel (recruit-name + team-rename inputs) is the reported case;
  // driving it off `rosterOpen` covers it whether opened from an NPC or the HUD.
  useEffect(() => {
    const evt = rosterOpen ? 'lumen:overlay-open' : 'lumen:overlay-close'
    window.dispatchEvent(new CustomEvent(evt))
  }, [rosterOpen])

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
          view={rosterView}
          onSetActive={(id) => emit('roster:set_active', { characterId: id })}
          onCreate={(name, cls) => emit('roster:create', { name, class: cls })}
          onCreateTeam={() => emit('team:create', {})}
          onDeleteTeam={(teamId) => emit('team:delete', { teamId })}
          onRenameTeam={(teamId, name) => emit('team:rename', { teamId, name })}
          onSetTeamMembers={(teamId, memberIds) => emit('team:set_members', { teamId, memberIds })}
          onSetActiveTeam={(teamId) => emit('team:set_active', { teamId })}
          onDeploy={(teamId, biome, difficulty) => emit('deployment:assign', { teamId, biome, difficulty })}
          onRecall={(teamId) => emit('deployment:recall', { teamId })}
          onClose={() => { setRosterOpen(false); setRosterRecruit(false) }}
          startRecruiting={rosterRecruit}
        />
      )}

      {/* Study-to-Haste panel */}
      {studyOpen && haste && (
        <StudyPanel haste={haste} onClose={() => setStudyOpen(false)} />
      )}

      {/* "While you were away" idle summary (shown on login) */}
      {idleSummary && (
        <div className="fixed inset-0 z-[58] flex items-center justify-center bg-black/70 p-4" onClick={() => setIdleSummary(null)}>
          <div className="w-full max-w-md rounded-2xl border border-lumen-gold/40 bg-lumen-dark p-6 text-center shadow-2xl shadow-purple-900/40" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-display text-2xl text-lumen-gold">While you were away…</h2>
            <p className="mt-2 text-sm text-gray-300">
              Your teams fought <span className="text-lumen-gold">{idleSummary.battles}</span> battles
              ({idleSummary.wins} won, {idleSummary.losses} lost)
            </p>
            {idleSummary.xpByCharacter.length > 0 && (
              <div className="mt-3">
                <p className="text-xs uppercase tracking-wider text-gray-500">XP earned</p>
                <div className="mt-1 space-y-0.5">
                  {idleSummary.xpByCharacter.map((c) => (
                    <p key={c.name} className="flex items-center justify-between text-sm">
                      <span className="text-gray-200">{c.name}</span>
                      <span className="font-display text-green-300">+{c.xp} XP</span>
                    </p>
                  ))}
                </div>
              </div>
            )}
            {idleSummary.silver > 0 && <p className="text-sm text-amber-200">+{idleSummary.silver} 🪙 silver</p>}
            {idleSummary.items.length > 0 && (
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {idleSummary.items.slice(0, 10).map((it, i) => (
                  <span key={i} className="rounded-lg bg-white/5 px-2 py-1 text-xs text-gray-200">{it.icon} {it.name}</span>
                ))}
              </div>
            )}
            <button onClick={() => setIdleSummary(null)} className="mt-5 rounded-lg bg-lumen-gold/90 px-6 py-2 font-display font-bold text-lumen-dark hover:bg-lumen-gold">Collect</button>
          </div>
        </div>
      )}

      {/* Game canvas */}
      <div className="flex flex-1 items-center justify-center p-4">
        <div className="relative w-full max-w-[1280px]">
          <div
            id="game-container"
            className="w-full aspect-video rounded-2xl overflow-hidden border border-white/10 shadow-2xl shadow-purple-900/30"
          />
          {/* Sound mute toggle */}
          <button
            onClick={() => {
              const m = Sfx.toggleMuted()
              setMuted(m)
              if (!m) Sfx.play('click')
            }}
            title={muted ? 'Unmute sound' : 'Mute sound'}
            aria-label={muted ? 'Unmute sound' : 'Mute sound'}
            className="absolute bottom-3 right-3 z-10 rounded-lg border border-white/15 bg-black/55 px-2.5 py-1.5 text-lg leading-none text-gray-200 backdrop-blur hover:bg-black/75"
          >
            {muted ? '🔇' : '🔊'}
          </button>
        </div>
      </div>

      {/* HUD */}
      <div className="px-4 pb-6 max-w-[1280px] mx-auto w-full">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
          <button
            onClick={() => { if (roster) { setRosterRecruit(false); setRosterView('spoils'); emit('deployments:get'); setRosterOpen(true) } }}
            disabled={!roster}
            className="rounded-xl border border-white/10 bg-white/5 p-4 text-left transition-colors hover:border-lumen-gold/40 hover:bg-white/10 disabled:cursor-default"
          >
            <p className="text-xs text-gray-500 mb-1 font-semibold uppercase tracking-wider">War Spoils</p>
            <p className="font-display text-lg text-lumen-gold truncate">
              {roster && roster.deployments.length > 0 ? `${roster.deployments.length} deployed` : 'No teams out'}
            </p>
            <p className="text-[10px] text-gray-500 mt-1">Deploy teams to fight while away.</p>
          </button>
        </div>
      </div>
    </div>
  )
}
