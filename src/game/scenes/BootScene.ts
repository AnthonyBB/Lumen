import Phaser from 'phaser'

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' })
  }

  preload() {
    // Player texture: 24x32 blue rectangle with lighter top third (head)
    const playerGfx = this.make.graphics({ x: 0, y: 0 })
    playerGfx.fillStyle(0x4488cc, 1)
    playerGfx.fillRect(0, 0, 24, 32)
    playerGfx.fillStyle(0x88bbee, 1)
    playerGfx.fillRect(2, 2, 20, 10) // head
    playerGfx.generateTexture('player', 24, 32)
    playerGfx.destroy()

    // Ground tile: 32x32 dark green with subtle grid lines
    const groundGfx = this.make.graphics({ x: 0, y: 0 })
    groundGfx.fillStyle(0x3a6e28, 1)
    groundGfx.fillRect(0, 0, 32, 32)
    groundGfx.lineStyle(1, 0x2d5a1b, 0.5)
    groundGfx.strokeRect(0, 0, 32, 32)
    groundGfx.generateTexture('ground', 32, 32)
    groundGfx.destroy()

    // Grass detail: 32x32 slightly lighter green variation
    const grassGfx = this.make.graphics({ x: 0, y: 0 })
    grassGfx.fillStyle(0x4a7e34, 1)
    grassGfx.fillRect(0, 0, 32, 32)
    grassGfx.fillStyle(0x5a9040, 0.4)
    grassGfx.fillRect(4, 4, 8, 6)
    grassGfx.fillRect(18, 12, 6, 8)
    grassGfx.generateTexture('grass_detail', 32, 32)
    grassGfx.destroy()

    // Building wall: 48x64 warm tan/beige
    const wallGfx = this.make.graphics({ x: 0, y: 0 })
    wallGfx.fillStyle(0xd4b483, 1)
    wallGfx.fillRect(0, 0, 48, 64)
    wallGfx.lineStyle(1, 0xb89060, 0.8)
    wallGfx.strokeRect(0, 0, 48, 64)
    wallGfx.generateTexture('building_wall', 48, 64)
    wallGfx.destroy()

    // Building roof: 48x16 darker brown
    const roofGfx = this.make.graphics({ x: 0, y: 0 })
    roofGfx.fillStyle(0x7a4e2d, 1)
    roofGfx.fillRect(0, 0, 48, 16)
    roofGfx.generateTexture('building_roof', 48, 16)
    roofGfx.destroy()

    // Building door: 16x20 dark brown
    const doorGfx = this.make.graphics({ x: 0, y: 0 })
    doorGfx.fillStyle(0x5c3317, 1)
    doorGfx.fillRect(0, 0, 16, 20)
    doorGfx.lineStyle(1, 0x3d2010, 1)
    doorGfx.strokeRect(0, 0, 16, 20)
    doorGfx.generateTexture('building_door', 16, 20)
    doorGfx.destroy()

    // Path tile: 32x32 sandy/dirt colored
    const pathGfx = this.make.graphics({ x: 0, y: 0 })
    pathGfx.fillStyle(0xc8a86b, 1)
    pathGfx.fillRect(0, 0, 32, 32)
    pathGfx.lineStyle(1, 0xb8975a, 0.4)
    pathGfx.strokeRect(0, 0, 32, 32)
    pathGfx.generateTexture('path', 32, 32)
    pathGfx.destroy()

    // Tree: 32x48 — brown trunk bottom, green circle top
    const treeGfx = this.make.graphics({ x: 0, y: 0 })
    // trunk
    treeGfx.fillStyle(0x7a5230, 1)
    treeGfx.fillRect(12, 28, 8, 20)
    // foliage (green circle-ish)
    treeGfx.fillStyle(0x2d8b2d, 1)
    treeGfx.fillCircle(16, 18, 16)
    treeGfx.fillStyle(0x3aab3a, 0.5)
    treeGfx.fillCircle(12, 14, 8)
    treeGfx.generateTexture('tree', 32, 48)
    treeGfx.destroy()

    // Shadow: 32x8 semi-transparent dark ellipse
    const shadowGfx = this.make.graphics({ x: 0, y: 0 })
    shadowGfx.fillStyle(0x000000, 0.3)
    shadowGfx.fillEllipse(16, 4, 28, 7)
    shadowGfx.generateTexture('shadow', 32, 8)
    shadowGfx.destroy()
  }

  create() {
    this.scene.start('WorldScene')
  }
}
