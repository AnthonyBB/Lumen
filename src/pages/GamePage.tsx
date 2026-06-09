import { useEffect, useState } from 'react'
import Phaser from 'phaser'
import { io, Socket } from 'socket.io-client'
import { gameConfig } from '../game/config'

interface GamePageProps {
  token: string | null
}

export default function GamePage({ token }: GamePageProps) {
  const [playersOnline, setPlayersOnline] = useState<number | null>(null)

  useEffect(() => {
    // Connect socket with optional auth token
    const s = io('http://localhost:3001', {
      auth: token ? { token } : {},
    })

    s.on('players:online', (count: number) => {
      setPlayersOnline(count)
    })

    // Request current count on connect
    s.on('connect', () => {
      s.emit('players:get_online')
    })

    // Pass socket to global so Phaser scenes can use it
    ;(window as typeof window & { __lumenSocket?: Socket }).__lumenSocket = s

    return () => {
      s.disconnect()
    }
  }, [token])

  useEffect(() => {
    const game = new Phaser.Game({
      ...gameConfig,
      parent: 'game-container',
    })
    return () => {
      game.destroy(true)
    }
  }, [])

  return (
    <div className="flex flex-col flex-1 min-h-screen pt-16 bg-lumen-dark">
      {/* Game canvas area */}
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
            <p className="font-display text-lg text-lumen-gold">— awaiting login —</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
            <p className="text-xs text-gray-500 mb-1 font-semibold uppercase tracking-wider">Players Online</p>
            <p className="font-display text-lg text-lumen-gold">
              {playersOnline !== null ? playersOnline : '—'}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-right">
            <p className="text-xs text-gray-500 mb-1 font-semibold uppercase tracking-wider">Current Zone</p>
            <p className="font-display text-lg text-lumen-gold">— not connected —</p>
          </div>
        </div>
      </div>
    </div>
  )
}
