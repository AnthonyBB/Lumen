import Phaser from 'phaser'

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' })
  }

  preload() {
    // ── PLAYER spritesheet (192×48, 6 frames of 32×48) ────────────────────
    this.load.spritesheet('player', '/assets/sprites/wizard_sheet.svg', {
      frameWidth: 32,
      frameHeight: 48,
    })

    // ── TILE images ──────────────────────────────────────────────────────
    this.load.image('ground', '/assets/tiles/grass.svg')
    this.load.image('path',   '/assets/tiles/cobblestone.svg')

    // ── SPRITE images ─────────────────────────────────────────────────────
    this.load.image('tree',              '/assets/sprites/tree.svg')
    this.load.image('building_learning', '/assets/sprites/building_learning.svg')
    this.load.image('building_combat',   '/assets/sprites/building_combat.svg')
    this.load.image('building_market',   '/assets/sprites/building_market.svg')

    // ── SHADOW (still programmatic — 40×8) ───────────────────────────────
    const shadowGfx = this.make.graphics({ x: 0, y: 0 })
    shadowGfx.fillStyle(0x000000, 0.25)
    shadowGfx.fillEllipse(20, 4, 36, 8)
    shadowGfx.generateTexture('shadow', 40, 8)
    shadowGfx.destroy()

    // ── GRASS DETAIL OVERLAY (still programmatic — 32×16) ─────────────────
    const gdg = this.make.graphics({ x: 0, y: 0 })
    gdg.fillStyle(0x4a9c38, 0.5)
    gdg.fillRect(2, 4, 3, 8)
    gdg.fillRect(7, 2, 3, 10)
    gdg.fillRect(14, 6, 3, 7)
    gdg.fillRect(20, 1, 3, 9)
    gdg.fillRect(26, 5, 3, 8)
    gdg.fillStyle(0x66c44a, 0.3)
    gdg.fillRect(4, 2, 2, 6)
    gdg.fillRect(22, 3, 2, 7)
    gdg.generateTexture('grass_detail', 32, 16)
    gdg.destroy()

    // ── STONE TILE for ClassroomScene indoor floor (32×32) ─────────────────
    const sg = this.make.graphics({ x: 0, y: 0 })
    sg.fillStyle(0x888090, 1)
    sg.fillRect(0, 0, 32, 32)
    sg.fillStyle(0x706878, 0.7)
    sg.fillRect(0, 0, 15, 15)
    sg.fillRect(17, 17, 15, 15)
    sg.fillStyle(0x9a92a4, 0.5)
    sg.fillRect(17, 0, 15, 15)
    sg.fillRect(0, 17, 15, 15)
    sg.lineStyle(1, 0x5a5262, 0.8)
    sg.lineBetween(16, 0, 16, 32)
    sg.lineBetween(0, 16, 32, 16)
    sg.generateTexture('stone', 32, 32)
    sg.destroy()
  }

  create() {
    this.scene.start('WorldScene')
  }
}
