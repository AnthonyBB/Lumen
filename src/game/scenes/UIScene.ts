import Phaser from 'phaser'
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

    // Bottom-center: movement hint
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 22, 'Arrow keys or WASD to move', {
      fontSize: '13px',
      fontFamily: 'Arial, sans-serif',
      color: '#aaaaaa',
      backgroundColor: '#00000066',
      padding: { x: 10, y: 4 },
    }).setOrigin(0.5, 1)

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
