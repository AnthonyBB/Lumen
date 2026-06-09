import { useEffect, useRef } from 'react'

export default function GamePage() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Phaser will be initialized here once game scenes are built.
    // Example bootstrap (commented until scenes exist):
    //
    // import Phaser from 'phaser'
    // import { BootScene } from '../game/scenes/BootScene'
    //
    // const game = new Phaser.Game({
    //   type: Phaser.AUTO,
    //   parent: containerRef.current!,
    //   width: 1280,
    //   height: 720,
    //   scene: [BootScene],
    // })
    // return () => game.destroy(true)
  }, [])

  return (
    <div className="flex flex-col flex-1 min-h-screen pt-16 bg-lumen-dark">
      {/* Game canvas area */}
      <div className="flex flex-1 items-center justify-center p-4">
        <div
          ref={containerRef}
          className="relative w-full max-w-[1280px] aspect-video rounded-2xl overflow-hidden border border-white/10 bg-black/60 shadow-2xl shadow-purple-900/30"
        >
          {/* Placeholder shown until Phaser loads */}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 text-center px-8">
            <div className="w-24 h-24 rounded-full border-4 border-dashed border-lumen-violet/40 flex items-center justify-center animate-pulse">
              <span className="text-4xl">⚔️</span>
            </div>
            <h2 className="font-display text-3xl font-bold text-lumen-gold">
              Realm Loading Soon
            </h2>
            <p className="text-gray-400 max-w-md leading-relaxed">
              The game canvas will appear here. Phaser 3 scenes are being built — check back as
              the quest begins to take shape.
            </p>
            <div className="flex flex-wrap justify-center gap-3 mt-2">
              {['Multiplayer', 'Phaser 3', 'Socket.io', 'Question Engine'].map((tag) => (
                <span
                  key={tag}
                  className="px-3 py-1 rounded-full text-xs font-semibold bg-lumen-violet/20 text-lumen-violet border border-lumen-violet/30"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* HUD placeholder */}
      <div className="px-4 pb-6 max-w-[1280px] mx-auto w-full">
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs text-gray-500 mb-1 font-semibold uppercase tracking-wider">Player</p>
            <p className="font-display text-lg text-lumen-gold">— awaiting login —</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
            <p className="text-xs text-gray-500 mb-1 font-semibold uppercase tracking-wider">Players Online</p>
            <p className="font-display text-lg text-lumen-gold">—</p>
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
