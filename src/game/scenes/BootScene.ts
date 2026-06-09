import Phaser from 'phaser'

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' })
  }

  preload() {
    // ── WIZARD PLAYER (32x48) ──────────────────────────────────────────────
    const pg = this.make.graphics({ x: 0, y: 0 })

    // Robe body — deep purple
    pg.fillStyle(0x4b0082, 1)
    pg.fillRect(7, 22, 18, 22)
    // Robe bottom flare
    pg.fillStyle(0x3a006f, 1)
    pg.fillTriangle(7, 44, 0, 48, 14, 44)
    pg.fillTriangle(25, 44, 32, 48, 18, 44)
    // Robe highlight stripe
    pg.fillStyle(0x7b2fc4, 0.5)
    pg.fillRect(14, 22, 4, 20)

    // Belt
    pg.fillStyle(0xffd700, 1)
    pg.fillRect(7, 34, 18, 3)

    // Skin — head
    pg.fillStyle(0xffe0b2, 1)
    pg.fillCircle(16, 16, 9)

    // Eyes
    pg.fillStyle(0x1a1a2e, 1)
    pg.fillCircle(13, 15, 2)
    pg.fillCircle(20, 15, 2)
    // Eye gleam
    pg.fillStyle(0xffffff, 1)
    pg.fillCircle(14, 14, 1)
    pg.fillCircle(21, 14, 1)

    // Beard / face details
    pg.fillStyle(0xc8a86b, 0.7)
    pg.fillRect(11, 20, 10, 4)

    // Wizard hat — brim
    pg.fillStyle(0x1a0050, 1)
    pg.fillEllipse(16, 9, 24, 7)
    // Hat cone
    pg.fillStyle(0x2d0080, 1)
    pg.fillTriangle(16, 0, 7, 10, 25, 10)
    // Hat star
    pg.fillStyle(0xffd700, 1)
    pg.fillStar(16, 4, 3, 4, 2)

    // Staff (right side)
    pg.fillStyle(0x8b6914, 1)
    pg.fillRect(27, 10, 3, 36)
    // Staff orb
    pg.fillStyle(0x00ccff, 0.9)
    pg.fillCircle(28, 9, 5)
    pg.fillStyle(0xffffff, 0.5)
    pg.fillCircle(27, 7, 2)

    pg.generateTexture('player', 32, 48)
    pg.destroy()

    // ── TEXTURED GRASS (64x64) ────────────────────────────────────────────
    const gg = this.make.graphics({ x: 0, y: 0 })
    // Base
    gg.fillStyle(0x3a7d2c, 1)
    gg.fillRect(0, 0, 64, 64)
    // Dark patches
    gg.fillStyle(0x2d6420, 0.6)
    gg.fillRect(0, 0, 32, 32)
    gg.fillRect(32, 32, 32, 32)
    // Lighter highlights
    gg.fillStyle(0x52a03e, 0.4)
    gg.fillRect(8, 8, 16, 12)
    gg.fillRect(40, 20, 12, 10)
    gg.fillRect(16, 44, 18, 10)
    gg.fillRect(46, 42, 10, 14)
    // Tiny grass blades
    gg.fillStyle(0x5ab840, 0.8)
    gg.fillRect(4, 14, 2, 6)
    gg.fillRect(24, 6, 2, 8)
    gg.fillRect(36, 50, 2, 7)
    gg.fillRect(54, 30, 2, 6)
    gg.fillRect(12, 36, 2, 7)
    gg.fillRect(48, 10, 2, 6)
    gg.generateTexture('ground', 64, 64)
    gg.destroy()

    // ── DIRT PATH TILE (32x32) ────────────────────────────────────────────
    const dg = this.make.graphics({ x: 0, y: 0 })
    dg.fillStyle(0xb8966e, 1)
    dg.fillRect(0, 0, 32, 32)
    dg.fillStyle(0xa07d55, 0.5)
    dg.fillRect(0, 0, 16, 16)
    dg.fillRect(16, 16, 16, 16)
    dg.fillStyle(0xc9a87c, 0.4)
    dg.fillRect(4, 6, 8, 4)
    dg.fillRect(18, 18, 6, 5)
    dg.lineStyle(1, 0x9a7050, 0.3)
    dg.strokeRect(0, 0, 32, 32)
    dg.generateTexture('path', 32, 32)
    dg.destroy()

    // ── STONE TILE for paths between buildings (32x32) ────────────────────
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

    // ── FANTASY TREE (40x56) ─────────────────────────────────────────────
    const tg = this.make.graphics({ x: 0, y: 0 })
    // Trunk
    tg.fillStyle(0x6b4423, 1)
    tg.fillRect(15, 34, 10, 22)
    tg.fillStyle(0x8a5c30, 0.5)
    tg.fillRect(17, 36, 4, 18)
    // Root flares
    tg.fillStyle(0x5a3818, 1)
    tg.fillTriangle(15, 56, 6, 56, 15, 44)
    tg.fillTriangle(25, 56, 34, 56, 25, 44)
    // Dark foliage base
    tg.fillStyle(0x1a5c1a, 1)
    tg.fillCircle(20, 26, 17)
    // Mid green
    tg.fillStyle(0x2d8b2d, 1)
    tg.fillCircle(20, 22, 14)
    // Highlight cluster
    tg.fillStyle(0x3aab3a, 0.7)
    tg.fillCircle(15, 18, 8)
    tg.fillCircle(26, 20, 7)
    // Top highlight
    tg.fillStyle(0x5cc85c, 0.4)
    tg.fillCircle(19, 14, 5)
    // Magic sparkle hint
    tg.fillStyle(0xaaffaa, 0.6)
    tg.fillCircle(14, 14, 2)
    tg.generateTexture('tree', 40, 56)
    tg.destroy()

    // ── SHADOW ────────────────────────────────────────────────────────────
    const shg = this.make.graphics({ x: 0, y: 0 })
    shg.fillStyle(0x000000, 0.25)
    shg.fillEllipse(20, 4, 36, 8)
    shg.generateTexture('shadow', 40, 8)
    shg.destroy()

    // ── GRASS DETAIL OVERLAY ──────────────────────────────────────────────
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
  }

  create() {
    this.scene.start('WorldScene')
  }
}
