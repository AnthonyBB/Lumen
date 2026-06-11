import { useEffect, useState } from 'react'
import Phaser from 'phaser'
import { io, Socket } from 'socket.io-client'
import { gameConfig } from '../game/config'
import ContentModePrompt from '../components/ContentModePrompt'
import { forceLogout, type AuthUser } from '../hooks/useAuth'
import { InventoryStore } from '../game/systems/InventoryStore'
import { StatsStore } from '../game/systems/StatsStore'
import { API_BASE } from '../config'

interface GamePageProps {
  token: string | null
  user: AuthUser | null
  setContentMode: (mode: 'child' | 'adolescent') => Promise<void>
}

export default function GamePage({ token, user, setContentMode }: GamePageProps) {
  const [playersOnline, setPlayersOnline] = useState<number | null>(null)

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

    s.on('connect', () => {
      // (Re)join on every connect — including reconnects after a server
      // restart. Without this the server has no player record for the socket
      // and every shop/learning/inventory action fails with "You must join...".
      // The server derives identity from the JWT; the payload is informational.
      s.emit('player:join', { username: user?.username ?? '' })
      s.emit('players:get_online')
      // Bind the inventory store to this (possibly new) socket so the HUD
      // shard counters receive inventory:data / inventory:updated pushes.
      InventoryStore.init(s)
      // Bind the stats store too so Character / Equipment screens receive
      // server-pushed `stats:update` snapshots (attributes + derived stats).
      StatsStore.init(s)
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
      {/* Game canvas */}
      <div className="flex flex-1 items-center justify-center p-4">
        <div
          id="game-container"
          className="relative w-full max-w-[1280px] aspect-video rounded-2xl overflow-hidden border border-white/10 shadow-2xl shadow-purple-900/30"
        />
      </div>

      {/* HUD */}
      <div className="px-4 pb-6 max-w-[1280px] mx-auto w-full">
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs text-gray-500 mb-1 font-semibold uppercase tracking-wider">Player</p>
            <p className="font-display text-lg text-lumen-gold">
              {user?.username ?? '— awaiting login —'}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
            <p className="text-xs text-gray-500 mb-1 font-semibold uppercase tracking-wider">Players Online</p>
            <p className="font-display text-lg text-lumen-gold">
              {playersOnline !== null ? playersOnline : '—'}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-right">
            <p className="text-xs text-gray-500 mb-1 font-semibold uppercase tracking-wider">Content Mode</p>
            <p className="font-display text-sm text-lumen-gold">
              {user?.contentMode === 'adolescent'
                ? '⚔️ Seasoned Adventurer'
                : user?.contentMode === 'child'
                ? '🌟 Young Explorer'
                : '—'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
