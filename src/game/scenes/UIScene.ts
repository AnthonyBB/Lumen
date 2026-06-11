import Phaser from 'phaser'
import type { Socket } from 'socket.io-client'
import { GAME_WIDTH, GAME_HEIGHT } from '../constants'

export class UIScene extends Phaser.Scene {

  constructor() {
    super({ key: 'UIScene' })
  }

  create() {
    // Top-left: player avatar + name + level
    const avatarGfx = this.add.graphics()
    avatarGfx.fillStyle(0x4488cc, 1)
    avatarGfx.fillCircle(30, 30, 22)
    avatarGfx.lineStyle(2, 0xffd700, 1)
    avatarGfx.strokeCircle(30, 30, 22)

    // Avatar face details
    avatarGfx.fillStyle(0x88bbee, 1)
    avatarGfx.fillCircle(30, 24, 10)

    this.add.text(62, 14, 'Adventurer', {
      fontSize: '16px',
      fontFamily: 'Arial, sans-serif',
      color: '#ffffff',
      fontStyle: 'bold',
    })

    this.add.text(62, 34, 'Level 1', {
      fontSize: '13px',
      fontFamily: 'Arial, sans-serif',
      color: '#ffd700',
    })

    // [C] Character shortcut badge (below the avatar panel)
    const charBadgeBg = this.add.graphics()
    charBadgeBg.fillStyle(0x000000, 0.55)
    charBadgeBg.fillRoundedRect(6, 66, 140, 22, 5)
    charBadgeBg.lineStyle(1, 0xffd700, 0.5)
    charBadgeBg.strokeRoundedRect(6, 66, 140, 22, 5)

    this.add.text(76, 77, '[C] Character', {
      fontSize: '12px',
      fontFamily: 'Arial, sans-serif',
      color: '#ffd700',
    }).setOrigin(0.5, 0.5)

    // [I] Equipment shortcut badge (directly below the Character badge)
    const eqBadgeBg = this.add.graphics()
    eqBadgeBg.fillStyle(0x000000, 0.55)
    eqBadgeBg.fillRoundedRect(6, 92, 140, 22, 5)
    eqBadgeBg.lineStyle(1, 0xffd700, 0.5)
    eqBadgeBg.strokeRoundedRect(6, 92, 140, 22, 5)

    this.add.text(76, 103, '[I] Equipment', {
      fontSize: '12px',
      fontFamily: 'Arial, sans-serif',
      color: '#ffd700',
    }).setOrigin(0.5, 0.5)

    // Panel background behind avatar area
    const panelBg = this.add.graphics()
    panelBg.fillStyle(0x000000, 0.5)
    panelBg.fillRoundedRect(6, 6, 180, 54, 8)
    panelBg.setDepth(-1)

    // Top-right: HP bar
    const hpBarX = GAME_WIDTH - 210
    const hpBarY = 14

    const hpBg = this.add.graphics()
    hpBg.fillStyle(0x000000, 0.5)
    hpBg.fillRoundedRect(hpBarX - 10, hpBarY - 8, 210, 46, 8)

    this.add.text(hpBarX + 5, hpBarY, 'HP', {
      fontSize: '13px',
      fontFamily: 'Arial, sans-serif',
      color: '#ffffff',
      fontStyle: 'bold',
    })

    // HP bar background
    const hpBarBg = this.add.graphics()
    hpBarBg.fillStyle(0x555555, 1)
    hpBarBg.fillRoundedRect(hpBarX + 28, hpBarY + 2, 160, 18, 5)

    // HP bar fill
    const hpBarFill = this.add.graphics()
    hpBarFill.fillStyle(0xdd2222, 1)
    hpBarFill.fillRoundedRect(hpBarX + 30, hpBarY + 4, 154, 14, 4)

    // HP text
    this.add.text(hpBarX + 110, hpBarY + 3, '100 / 100', {
      fontSize: '11px',
      fontFamily: 'Arial, sans-serif',
      color: '#ffffff',
    }).setOrigin(0.5, 0)

    // Bottom-center: movement hint + equipment shortcut
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 22, 'Arrow keys or WASD to move', {
      fontSize: '13px',
      fontFamily: 'Arial, sans-serif',
      color: '#aaaaaa',
      backgroundColor: '#00000066',
      padding: { x: 10, y: 4 },
    }).setOrigin(0.5, 1)

    // ── Currency bar (bottom-left) ────────────────────────────────────────────
    const invBg = this.add.graphics()
    invBg.fillStyle(0x000000, 0.5)
    invBg.fillRoundedRect(6, GAME_HEIGHT - 56, 372, 46, 8)
    invBg.lineStyle(1, 0xffd700, 0.5)
    invBg.strokeRoundedRect(6, GAME_HEIGHT - 56, 372, 46, 8)

    this.add.text(14, GAME_HEIGHT - 52, 'Currency', {
      fontSize: '11px', fontFamily: 'Arial', color: '#88eeff', fontStyle: 'bold',
    }).setOrigin(0, 0)

    // Shard / silver counters — server-authoritative tracked currency (NOT
    // inventory items). Updated only by the server's `currency:update` push.
    // All three on one row: Silver first, then Skill and Combat shards.
    // Silver is shown with a drawn round coin (the 🪙 glyph is missing in the
    // game font and rendered as an empty box).
    const coin = this.add.graphics()
    const coinX = 21, coinY = GAME_HEIGHT - 25
    coin.fillStyle(0x9a9aa6, 1); coin.fillCircle(coinX, coinY, 7)          // rim
    coin.fillStyle(0xd9d9e2, 1); coin.fillCircle(coinX, coinY, 5.5)        // face
    coin.fillStyle(0xf2f2f7, 1); coin.fillCircle(coinX - 1.5, coinY - 1.5, 2) // highlight
    const silverCount = this.add.text(33, GAME_HEIGHT - 32, 'Silver 0', {
      fontSize: '13px', fontFamily: 'Georgia, serif', color: '#e8e8e8', fontStyle: 'bold',
    }).setOrigin(0, 0)
    const skillShardCount = this.add.text(140, GAME_HEIGHT - 32, '🔷 Skill x0', {
      fontSize: '13px', fontFamily: 'Georgia, serif', color: '#66bbff', fontStyle: 'bold',
    }).setOrigin(0, 0)
    const combatShardCount = this.add.text(252, GAME_HEIGHT - 32, '🔶 Combat x0', {
      fontSize: '13px', fontFamily: 'Georgia, serif', color: '#ffaa55', fontStyle: 'bold',
    }).setOrigin(0, 0)

    const socket = (window as typeof window & { __lumenSocket?: Socket }).__lumenSocket
    const onCurrency = (data: { skillShards?: number; combatShards?: number; silver?: number }) => {
      skillShardCount.setText(`🔷 Skill x${data?.skillShards ?? 0}`)
      combatShardCount.setText(`🔶 Combat x${data?.combatShards ?? 0}`)
      silverCount.setText(`Silver ${data?.silver ?? 0}`)
    }
    socket?.on('currency:update', onCurrency)
    socket?.emit('currency:get')   // request the initial balances

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      socket?.off('currency:update', onCurrency)
    })

    // Vignette overlay at screen edges
    const vignette = this.add.graphics()
    vignette.setDepth(200)
    // Top gradient
    for (let i = 0; i < 80; i++) {
      const alpha = (1 - i / 80) * 0.5
      vignette.fillStyle(0x000000, alpha)
      vignette.fillRect(0, i, GAME_WIDTH, 1)
    }
    // Bottom gradient
    for (let i = 0; i < 80; i++) {
      const alpha = (1 - i / 80) * 0.5
      vignette.fillStyle(0x000000, alpha)
      vignette.fillRect(0, GAME_HEIGHT - 1 - i, GAME_WIDTH, 1)
    }
    // Left gradient
    for (let i = 0; i < 60; i++) {
      const alpha = (1 - i / 60) * 0.4
      vignette.fillStyle(0x000000, alpha)
      vignette.fillRect(i, 0, 1, GAME_HEIGHT)
    }
    // Right gradient
    for (let i = 0; i < 60; i++) {
      const alpha = (1 - i / 60) * 0.4
      vignette.fillStyle(0x000000, alpha)
      vignette.fillRect(GAME_WIDTH - 1 - i, 0, 1, GAME_HEIGHT)
    }
  }
}
