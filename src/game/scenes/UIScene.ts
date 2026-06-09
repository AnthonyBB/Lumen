import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT } from '../constants'
import { InventoryStore } from '../systems/InventoryStore'

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

    // Bottom-right: Equipment + Chest shortcut hints
    const eqBg = this.add.graphics()
    eqBg.fillStyle(0x000000, 0.5)
    eqBg.fillRoundedRect(GAME_WIDTH - 154, GAME_HEIGHT - 80, 148, 72, 8)
    eqBg.lineStyle(1, 0xffd700, 0.4)
    eqBg.strokeRoundedRect(GAME_WIDTH - 154, GAME_HEIGHT - 80, 148, 72, 8)

    this.add.text(GAME_WIDTH - 80, GAME_HEIGHT - 74, '[I]  Equipment', {
      fontSize: '11px', fontFamily: 'Arial', color: '#ffd700', fontStyle: 'bold',
    }).setOrigin(0.5, 0)

    this.add.text(GAME_WIDTH - 80, GAME_HEIGHT - 56, 'Open gear screen', {
      fontSize: '10px', fontFamily: 'Arial', color: '#888888',
    }).setOrigin(0.5, 0)

    // Divider line
    const eqDiv = this.add.graphics()
    eqDiv.lineStyle(1, 0x333355, 0.7)
    eqDiv.lineBetween(GAME_WIDTH - 148, GAME_HEIGHT - 42, GAME_WIDTH - 12, GAME_HEIGHT - 42)

    this.add.text(GAME_WIDTH - 80, GAME_HEIGHT - 40, '[E near chest]  Storage', {
      fontSize: '10px', fontFamily: 'Arial', color: '#aaddff',
    }).setOrigin(0.5, 0)

    // ── Inventory bar (bottom-left) ───────────────────────────────────────────
    const invBg = this.add.graphics()
    invBg.fillStyle(0x000000, 0.5)
    invBg.fillRoundedRect(6, GAME_HEIGHT - 60, 180, 50, 8)
    invBg.lineStyle(1, 0xffd700, 0.5)
    invBg.strokeRoundedRect(6, GAME_HEIGHT - 60, 180, 50, 8)

    this.add.text(14, GAME_HEIGHT - 54, '🔮  Shards of Knowledge', {
      fontSize: '11px', fontFamily: 'Arial', color: '#88eeff', fontStyle: 'bold',
    }).setOrigin(0, 0)

    // Shard count — prefers InventoryStore (server-authoritative) with
    // registry as fallback so ClassroomScene works before a player is connected.
    const shardCount = this.add.text(14, GAME_HEIGHT - 36, 'x 0', {
      fontSize: '18px', fontFamily: 'Georgia, serif', color: '#ffd700', fontStyle: 'bold',
    }).setOrigin(0, 0)

    const refreshShards = () => {
      const inv = InventoryStore.get()
      if (inv) {
        // Server-authoritative: sum all shard stacks in the bag
        const shardItem = inv.items.find(i => i.itemType === 'shard_of_knowledge')
        shardCount.setText(`x ${shardItem ? shardItem.quantity : 0}`)
      } else {
        // Fallback: registry value written by ClassroomScene
        const n = (this.registry.get('shards') as number) || 0
        shardCount.setText(`x ${n}`)
      }
    }

    // Listen for server inventory updates (immediate, no polling lag)
    const unsubscribe = InventoryStore.onUpdate(() => refreshShards())

    // Also poll registry every 500 ms — keeps ClassroomScene in sync before
    // the player connects to the multiplayer server.
    this.time.addEvent({
      delay: 500,
      loop: true,
      callback: refreshShards,
    })

    // Clean up the InventoryStore listener when this scene shuts down
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => unsubscribe())

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
