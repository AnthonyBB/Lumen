import Phaser from 'phaser'

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' })
  }

  preload() {
    // ── PLAYER spritesheets (160x192, 4 cols x 4 rows = 40x48 per frame) ───────
    // Row 0 = down, Row 1 = left, Row 2 = right, Row 3 = up
    this.load.spritesheet('character_walk', '/assets/sprites/character_walk.png', {
      frameWidth: 40,
      frameHeight: 48,
    })
    this.load.spritesheet('character_idle', '/assets/sprites/character_idle.png', {
      frameWidth: 40,
      frameHeight: 48,
    })

    // ── GROUND TILES ────────────────────────────────────────────────────────────
    this.load.image('ground', '/assets/tiles/tileset_ground.png')
    this.load.image('path',   '/assets/tiles/tileset_road.png')

    // ── BUILDINGS ───────────────────────────────────────────────────────────────
    // building_learning = purple house (magical / scholarly)
    // building_combat   = large stone house
    // building_market   = wider commercial house
    this.load.image('building_learning', '/assets/buildings/house_purple.png')
    this.load.image('building_combat',   '/assets/buildings/house_3.png')
    this.load.image('building_market',   '/assets/buildings/house_2.png')

    // ── WORLD PROPS ─────────────────────────────────────────────────────────────
    this.load.image('well',     '/assets/buildings/well.png')
    this.load.image('lamppost', '/assets/props/lamppost.png')
    this.load.image('bench',    '/assets/props/bench.png')
    this.load.image('barrel',   '/assets/props/barrel.png')
    this.load.image('sign',     '/assets/props/sign.png')
    this.load.image('rock',     '/assets/props/rock.png')

    // ── CHEST (keep existing SVG) ────────────────────────────────────────────────
    this.load.image('chest', '/assets/sprites/chest.svg')

    // ── TREE (keep existing SVG — no tree in tileset pack) ──────────────────────
    this.load.image('tree', '/assets/sprites/tree.svg')

    // ── SHADOW (programmatic — 40x8 ellipse) ────────────────────────────────────
    const shadowGfx = this.make.graphics({ x: 0, y: 0 })
    shadowGfx.fillStyle(0x000000, 0.25)
    shadowGfx.fillEllipse(20, 4, 36, 8)
    shadowGfx.generateTexture('shadow', 40, 8)
    shadowGfx.destroy()

    // ── STONE TILE for ClassroomScene indoor floor (32x32) ──────────────────────
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
