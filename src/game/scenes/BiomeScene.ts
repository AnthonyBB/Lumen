import Phaser from 'phaser'
import { Player } from '../objects/Player'
import { GAME_WIDTH, GAME_HEIGHT } from '../constants'

interface BiomeSceneData {
  biome: string
  difficulty: 'easy' | 'medium' | 'hard'
  location: string
  /** World position the player was standing at when they entered — used to respawn on exit. */
  returnX?: number
  returnY?: number
}

export class BiomeScene extends Phaser.Scene {
  private player!: Player
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd!: { W: Phaser.Input.Keyboard.Key; A: Phaser.Input.Keyboard.Key; S: Phaser.Input.Keyboard.Key; D: Phaser.Input.Keyboard.Key }
  private escKey!: Phaser.Input.Keyboard.Key
  private biomeData!: BiomeSceneData
  private tooltip: Phaser.GameObjects.Container | null = null

  constructor() {
    super({ key: 'BiomeScene' })
  }

  init(data: BiomeSceneData) {
    this.biomeData = data
  }

  create() {
    const { biome, difficulty, location } = this.biomeData
    const seed = biome + ':' + difficulty
    const rng = new Phaser.Math.RandomDataGenerator([seed])

    // Draw biome environment
    this.drawBiome(biome, rng)

    // Player spawns at bottom-center
    this.player = new Player(this, 640, 580)
    this.physics.world.setBounds(0, 0, GAME_WIDTH, GAME_HEIGHT)

    // Enemy markers (drawn before player so player appears on top)
    this.drawEnemies(biome, difficulty, rng)

    // HUD
    this.drawHUD(biome, location, difficulty)

    // Input
    this.cursors = this.input.keyboard!.createCursorKeys()
    this.wasd = {
      W: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      S: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      D: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    }
    this.escKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC)
  }

  private drawBiome(biome: string, rng: Phaser.Math.RandomDataGenerator) {
    switch (biome) {
      case 'Desert':              this.drawDesert(rng);            break
      case 'Pine Forest':         this.drawPineForest(rng);        break
      case 'Deciduous Forest':    this.drawDeciduousForest(rng);   break
      case 'Swamp':               this.drawSwamp(rng);             break
      case 'Snow':                this.drawSnow(rng);              break
      case 'Grassland':           this.drawGrassland(rng);         break
      case 'Tropical Rainforest': this.drawTropicalRainforest(rng);break
      case 'Ocean':               this.drawOcean(rng);             break
      default:                    this.drawFallback();             break
    }
    this.drawSafeZone()
  }

  private drawSafeZone() {
    const g = this.add.graphics().setDepth(1)
    // Lighter ground patch near bottom spawn
    g.fillStyle(0xffffff, 0.12)
    g.fillEllipse(640, 600, 260, 80)
    // Two torch lights
    for (const tx of [520, 760]) {
      // Torch post
      g.fillStyle(0x7a5a30, 1)
      g.fillRect(tx - 3, 560, 6, 28)
      // Flame
      g.fillStyle(0xff8800, 0.9)
      g.fillCircle(tx, 555, 7)
      g.fillStyle(0xffee00, 0.7)
      g.fillCircle(tx, 553, 4)
      // Glow
      g.fillStyle(0xff8800, 0.15)
      g.fillCircle(tx, 555, 20)
    }
  }

  // ── Desert ─────────────────────────────────────────────────────────────────

  private drawDesert(rng: Phaser.Math.RandomDataGenerator) {
    const g = this.add.graphics().setDepth(0)

    // Sky gradient (top half light blue, bottom half sandy)
    g.fillStyle(0x87ceeb, 1)
    g.fillRect(0, 0, GAME_WIDTH, 300)
    g.fillStyle(0xf4c87a, 1)
    g.fillRect(0, 300, GAME_WIDTH, GAME_HEIGHT - 300)

    // Sandy ground with variation
    const sandColors = [0xe8b84b, 0xe8c060, 0xd4a040]
    for (let i = 0; i < 60; i++) {
      const sx = rng.integerInRange(0, GAME_WIDTH)
      const sy = rng.integerInRange(200, GAME_HEIGHT)
      const sc = sandColors[rng.integerInRange(0, 2)]
      g.fillStyle(sc, 0.5)
      g.fillRect(sx, sy, rng.integerInRange(20, 60), rng.integerInRange(8, 20))
    }

    // Sun top-right
    g.fillStyle(0xffe040, 0.9)
    g.fillCircle(1160, 60, 48)
    g.fillStyle(0xfff080, 0.5)
    g.fillCircle(1160, 60, 60)

    // Sand dunes
    const duneCount = rng.integerInRange(2, 4)
    for (let i = 0; i < duneCount; i++) {
      const dx = rng.integerInRange(100, GAME_WIDTH - 100)
      const dy = rng.integerInRange(260, 520)
      g.fillStyle(0xd4a040, 0.6)
      g.fillEllipse(dx, dy, rng.integerInRange(180, 320), rng.integerInRange(40, 80))
    }

    // Cacti
    const cactiCount = rng.integerInRange(4, 8)
    for (let i = 0; i < cactiCount; i++) {
      const cx = rng.integerInRange(60, GAME_WIDTH - 60)
      const cy = rng.integerInRange(150, 500)
      this.drawCactus(g, cx, cy)
    }

    // Skull/bone dots
    g.fillStyle(0xf0e8d0, 1)
    for (let i = 0; i < 12; i++) {
      const bx = rng.integerInRange(40, GAME_WIDTH - 40)
      const by = rng.integerInRange(200, 600)
      g.fillRect(bx, by, rng.integerInRange(4, 8), rng.integerInRange(3, 5))
    }
  }

  private drawCactus(g: Phaser.GameObjects.Graphics, x: number, y: number) {
    // Body
    g.fillStyle(0x3a7a20, 1)
    g.fillRect(x - 4, y - 32, 8, 32)
    // Arms
    g.fillRect(x - 14, y - 20, 14, 6)
    g.fillRect(x - 14, y - 24, 4, 10)
    g.fillRect(x,      y - 18, 14, 6)
    g.fillRect(x + 10, y - 22, 4, 10)
  }

  // ── Pine Forest ────────────────────────────────────────────────────────────

  private drawPineForest(rng: Phaser.Math.RandomDataGenerator) {
    const g = this.add.graphics().setDepth(0)

    // Dark sky
    g.fillStyle(0x0a1a0d, 1)
    g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)

    // Dark forest floor
    g.fillStyle(0x1a4a20, 1)
    g.fillRect(0, 360, GAME_WIDTH, GAME_HEIGHT - 360)

    // Leaf litter
    g.fillStyle(0x0f3015, 1)
    for (let i = 0; i < 50; i++) {
      g.fillRect(
        rng.integerInRange(0, GAME_WIDTH),
        rng.integerInRange(360, GAME_HEIGHT - 80),
        rng.integerInRange(4, 12), rng.integerInRange(2, 5)
      )
    }

    // Fog patches
    for (let i = 0; i < 6; i++) {
      g.fillStyle(0xffffff, rng.realInRange(0.05, 0.18))
      g.fillEllipse(
        rng.integerInRange(0, GAME_WIDTH),
        rng.integerInRange(400, 620),
        rng.integerInRange(120, 260),
        rng.integerInRange(20, 50)
      )
    }

    // Pine trees
    const treeCount = rng.integerInRange(8, 14)
    for (let i = 0; i < treeCount; i++) {
      const tx = rng.integerInRange(40, GAME_WIDTH - 40)
      const ty = rng.integerInRange(60, 460)
      this.drawPineTree(g, tx, ty)
    }

    // Boulders
    const boulderCount = rng.integerInRange(3, 5)
    for (let i = 0; i < boulderCount; i++) {
      const bx = rng.integerInRange(60, GAME_WIDTH - 60)
      const by = rng.integerInRange(200, 550)
      const br = rng.integerInRange(14, 24)
      g.fillStyle(0x4a4a4a, 1)
      g.fillCircle(bx, by, br)
      g.fillStyle(0x6a6a6a, 1)
      g.fillCircle(bx - 4, by - 4, br / 3)
    }

    // Mushrooms
    for (let i = 0; i < 8; i++) {
      const mx = rng.integerInRange(40, GAME_WIDTH - 40)
      const my = rng.integerInRange(380, 580)
      // Stem
      g.fillStyle(0xd4a855, 1)
      g.fillRect(mx - 2, my - 6, 4, 8)
      // Cap
      g.fillStyle(0xcc4444, 1)
      g.fillCircle(mx, my - 7, 7)
      // Dots
      g.fillStyle(0xffffff, 1)
      g.fillCircle(mx - 2, my - 8, 1)
      g.fillCircle(mx + 2, my - 6, 1)
    }
  }

  private drawPineTree(g: Phaser.GameObjects.Graphics, x: number, y: number) {
    // Trunk
    g.fillStyle(0x5a3a10, 1)
    g.fillRect(x - 4, y, 8, 20)
    // Tiers (stacked triangles, getting smaller upward)
    const colors = [0x1a5c2a, 0x154a22, 0x0d3a14]
    const tiers = [[36, 28], [28, 20], [20, 12]]
    for (let t = 0; t < 3; t++) {
      const [w] = tiers[t]
      g.fillStyle(colors[t], 1)
      g.fillTriangle(x, y - 20 - t * 18, x - w / 2, y - 2 - t * 18, x + w / 2, y - 2 - t * 18)
    }
  }

  // ── Deciduous Forest ───────────────────────────────────────────────────────

  private drawDeciduousForest(rng: Phaser.Math.RandomDataGenerator) {
    const g = this.add.graphics().setDepth(0)

    // Sky
    g.fillStyle(0x4a7a4a, 1)
    g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)

    // Ground
    g.fillStyle(0x3a6a20, 1)
    g.fillRect(0, 340, GAME_WIDTH, GAME_HEIGHT - 340)

    // Dappled light patches
    for (let i = 0; i < 10; i++) {
      g.fillStyle(0x4a8a30, 0.3)
      g.fillEllipse(
        rng.integerInRange(0, GAME_WIDTH),
        rng.integerInRange(350, 640),
        rng.integerInRange(60, 160),
        rng.integerInRange(20, 60)
      )
    }

    // Fallen logs
    for (let i = 0; i < 4; i++) {
      const lx = rng.integerInRange(80, GAME_WIDTH - 80)
      const ly = rng.integerInRange(380, 580)
      g.fillStyle(0x6a3a10, 1)
      g.fillRect(lx - 40, ly - 6, 80, 12)
      g.fillStyle(0x8a5a20, 1)
      g.fillRect(lx - 40, ly - 6, 6, 12)
    }

    // Trees
    const treeCount = rng.integerInRange(6, 10)
    for (let i = 0; i < treeCount; i++) {
      const tx = rng.integerInRange(50, GAME_WIDTH - 50)
      const ty = rng.integerInRange(80, 480)
      this.drawDeciduousTree(g, tx, ty)
    }

    // Wildflowers
    const flowerColors = [0xffaacc, 0xffff44, 0xaa44ff, 0xff8844]
    for (let i = 0; i < 20; i++) {
      g.fillStyle(flowerColors[rng.integerInRange(0, 3)], 1)
      g.fillCircle(
        rng.integerInRange(20, GAME_WIDTH - 20),
        rng.integerInRange(360, 620),
        rng.integerInRange(2, 4)
      )
    }
  }

  private drawDeciduousTree(g: Phaser.GameObjects.Graphics, x: number, y: number) {
    // Trunk
    g.fillStyle(0x5a3a10, 1)
    g.fillRect(x - 5, y, 10, 26)
    // Layered foliage
    g.fillStyle(0x3a7a2a, 1)
    g.fillCircle(x, y - 10, 28)
    g.fillStyle(0x4a8c3a, 1)
    g.fillCircle(x - 8, y - 14, 20)
    g.fillStyle(0x5a9a4a, 1)
    g.fillCircle(x + 6, y - 18, 16)
  }

  // ── Swamp ──────────────────────────────────────────────────────────────────

  private drawSwamp(rng: Phaser.Math.RandomDataGenerator) {
    const g = this.add.graphics().setDepth(0)

    // Near-black sky
    g.fillStyle(0x050f05, 1)
    g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)

    // Ground
    g.fillStyle(0x1a2e10, 1)
    g.fillRect(0, 320, GAME_WIDTH, GAME_HEIGHT - 320)

    // Murky water patches
    for (let i = 0; i < 6; i++) {
      const wx = rng.integerInRange(60, GAME_WIDTH - 60)
      const wy = rng.integerInRange(280, 560)
      const wc = rng.pick([0x1a3020, 0x0d2018])
      g.fillStyle(wc, 0.9)
      g.fillEllipse(wx, wy, rng.integerInRange(80, 160), rng.integerInRange(30, 60))
      // Lily pads
      const pads = rng.integerInRange(1, 4)
      for (let p = 0; p < pads; p++) {
        g.fillStyle(0x2a4a15, 1)
        g.fillCircle(
          wx + rng.integerInRange(-40, 40),
          wy + rng.integerInRange(-10, 10),
          rng.integerInRange(5, 10)
        )
      }
    }

    // Hanging vines from top
    g.lineStyle(2, 0x2a3a1a, 1)
    for (let i = 0; i < 14; i++) {
      const vx = rng.integerInRange(0, GAME_WIDTH)
      const vl = rng.integerInRange(60, 180)
      g.lineBetween(vx, 0, vx, vl)
    }

    // Dead trees
    for (let i = 0; i < 7; i++) {
      const tx = rng.integerInRange(30, GAME_WIDTH - 30)
      const ty = rng.integerInRange(200, 520)
      g.fillStyle(0x2a2a1a, 1)
      g.fillRect(tx - 4, ty - 80, 8, 80)
      // Bare branches
      g.lineStyle(3, 0x2a2a1a, 1)
      g.lineBetween(tx, ty - 60, tx - 24, ty - 80)
      g.lineBetween(tx, ty - 45, tx + 20, ty - 62)
    }

    // Fog at ground level
    for (let i = 0; i < 8; i++) {
      g.fillStyle(0xffffff, 0.04)
      g.fillRect(
        rng.integerInRange(0, GAME_WIDTH - 200),
        rng.integerInRange(540, 660),
        rng.integerInRange(100, 300),
        24
      )
    }

    // Bubbles
    for (let i = 0; i < 12; i++) {
      g.fillStyle(0xffffff, 0.35)
      g.fillCircle(
        rng.integerInRange(40, GAME_WIDTH - 40),
        rng.integerInRange(300, 600),
        rng.integerInRange(2, 5)
      )
    }

    // Will-o-wisps (teal glowing circles with tween)
    for (let i = 0; i < 5; i++) {
      const wx = rng.integerInRange(60, GAME_WIDTH - 60)
      const wy = rng.integerInRange(200, 500)
      const wisp = this.add.graphics().setDepth(2)
      wisp.fillStyle(0x40e0d0, 0.6)
      wisp.fillCircle(wx, wy, 5)
      this.tweens.add({
        targets: wisp,
        alpha: { from: 0.2, to: 0.8 },
        duration: rng.integerInRange(800, 1600),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      })
    }
  }

  // ── Snow ───────────────────────────────────────────────────────────────────

  private drawSnow(rng: Phaser.Math.RandomDataGenerator) {
    const g = this.add.graphics().setDepth(0)

    // Dark navy sky with stars
    g.fillStyle(0x0a1030, 1)
    g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)
    g.fillStyle(0xffffff, 1)
    for (let i = 0; i < 50; i++) {
      g.fillCircle(
        rng.integerInRange(0, GAME_WIDTH),
        rng.integerInRange(0, 280),
        rng.integerInRange(1, 2)
      )
    }

    // Snow ground
    g.fillStyle(0xddeeff, 1)
    g.fillRect(0, 320, GAME_WIDTH, GAME_HEIGHT - 320)
    g.fillStyle(0xeef8ff, 1)
    g.fillRect(0, 320, GAME_WIDTH, 18)

    // Frozen lake patch
    g.fillStyle(0xaaddff, 0.5)
    g.fillRect(400, 380, 380, 120)
    // Crack lines on lake
    g.lineStyle(1, 0x88bbdd, 0.7)
    g.lineBetween(430, 420, 490, 460)
    g.lineBetween(610, 390, 650, 440)
    g.lineBetween(700, 430, 760, 480)

    // Icicles hanging from top of screen
    g.fillStyle(0xbbddff, 1)
    for (let i = 0; i < 18; i++) {
      const ix = rng.integerInRange(0, GAME_WIDTH)
      const il = rng.integerInRange(16, 50)
      g.fillTriangle(ix - 5, 0, ix + 5, 0, ix, il)
    }

    // Snow particles scattered
    g.fillStyle(0xffffff, 0.85)
    for (let i = 0; i < 40; i++) {
      g.fillCircle(
        rng.integerInRange(0, GAME_WIDTH),
        rng.integerInRange(100, 680),
        rng.integerInRange(1, 3)
      )
    }

    // Snow-covered trees
    const treeCount = rng.integerInRange(5, 8)
    for (let i = 0; i < treeCount; i++) {
      const tx = rng.integerInRange(40, GAME_WIDTH - 40)
      const ty = rng.integerInRange(100, 480)
      this.drawSnowTree(g, tx, ty)
    }

    // Footprints in snow
    g.fillStyle(0xc8ddf0, 1)
    for (let i = 0; i < 15; i++) {
      g.fillEllipse(
        rng.integerInRange(100, GAME_WIDTH - 100),
        rng.integerInRange(360, 600),
        8, 5
      )
    }
  }

  private drawSnowTree(g: Phaser.GameObjects.Graphics, x: number, y: number) {
    // Dark trunk
    g.fillStyle(0x3a2a1a, 1)
    g.fillRect(x - 4, y, 8, 22)
    // Tree triangle dark
    g.fillStyle(0x2a3a2a, 1)
    g.fillTriangle(x, y - 50, x - 22, y + 2, x + 22, y + 2)
    // Snow on top
    g.fillStyle(0xeef8ff, 1)
    g.fillTriangle(x, y - 46, x - 18, y - 10, x + 18, y - 10)
  }

  // ── Grassland ──────────────────────────────────────────────────────────────

  private drawGrassland(rng: Phaser.Math.RandomDataGenerator) {
    const g = this.add.graphics().setDepth(0)

    // Bright blue sky
    g.fillStyle(0x4a90d9, 1)
    g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)

    // Ground
    g.fillStyle(0x5aaa2a, 1)
    g.fillRect(0, 300, GAME_WIDTH, GAME_HEIGHT - 300)

    // Hill shapes
    for (let i = 0; i < 4; i++) {
      g.fillStyle(0x4a9a20, 0.3)
      g.fillEllipse(
        rng.integerInRange(0, GAME_WIDTH),
        rng.integerInRange(260, 400),
        rng.integerInRange(280, 500),
        rng.integerInRange(60, 120)
      )
    }

    // Tall grass blades
    for (let i = 0; i < 60; i++) {
      const gx = rng.integerInRange(0, GAME_WIDTH)
      const gy = rng.integerInRange(310, 640)
      const gc = rng.pick([0x4a9a20, 0x3a8a18])
      g.fillStyle(gc, 1)
      g.fillRect(gx, gy - rng.integerInRange(10, 22), 3, rng.integerInRange(10, 22))
    }

    // Wildflower patches
    const flowerColors = [0xffaacc, 0xffff66, 0xaa66ff, 0xff8844, 0xff4488]
    for (let i = 0; i < 28; i++) {
      g.fillStyle(flowerColors[rng.integerInRange(0, 4)], 1)
      g.fillCircle(
        rng.integerInRange(20, GAME_WIDTH - 20),
        rng.integerInRange(320, 640),
        rng.integerInRange(2, 4)
      )
    }

    // Oak trees
    const treeCount = rng.integerInRange(3, 5)
    for (let i = 0; i < treeCount; i++) {
      const tx = rng.integerInRange(60, GAME_WIDTH - 60)
      const ty = rng.integerInRange(100, 440)
      // Trunk
      g.fillStyle(0x5a3a10, 1)
      g.fillRect(tx - 6, ty, 12, 30)
      // Round canopy
      g.fillStyle(0x3a7a20, 1)
      g.fillCircle(tx, ty - 16, 34)
      g.fillStyle(0x4a8a28, 1)
      g.fillCircle(tx - 8, ty - 20, 22)
    }

    // Butterflies (small diamond shapes)
    for (let i = 0; i < 6; i++) {
      const bx = rng.integerInRange(80, GAME_WIDTH - 80)
      const by = rng.integerInRange(200, 500)
      const bc = flowerColors[rng.integerInRange(0, 4)]
      g.fillStyle(bc, 0.8)
      // Left wing
      g.fillTriangle(bx - 8, by, bx, by - 6, bx, by + 6)
      // Right wing
      g.fillTriangle(bx + 8, by, bx, by - 6, bx, by + 6)
    }
  }

  // ── Tropical Rainforest ────────────────────────────────────────────────────

  private drawTropicalRainforest(rng: Phaser.Math.RandomDataGenerator) {
    const g = this.add.graphics().setDepth(0)

    // Very dark background
    g.fillStyle(0x042208, 1)
    g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)

    // Dark forest ground
    g.fillStyle(0x0d3a10, 1)
    g.fillRect(0, 340, GAME_WIDTH, GAME_HEIGHT - 340)

    // Root patterns on ground
    g.lineStyle(2, 0x4a2a08, 0.7)
    for (let i = 0; i < 10; i++) {
      const rx = rng.integerInRange(60, GAME_WIDTH - 60)
      const ry = rng.integerInRange(380, 630)
      g.lineBetween(rx, ry, rx + rng.integerInRange(-40, 40), ry + rng.integerInRange(-20, 20))
    }

    // Huge overlapping canopy at top
    const canopyColors = [0x0d6e1e, 0x1a5e14, 0x0a4e12, 0x157a1a]
    for (let i = 0; i < 16; i++) {
      g.fillStyle(canopyColors[rng.integerInRange(0, 3)], 0.85)
      g.fillEllipse(
        rng.integerInRange(-60, GAME_WIDTH + 60),
        rng.integerInRange(-20, 140),
        rng.integerInRange(160, 320),
        rng.integerInRange(80, 160)
      )
    }

    // Vines (wavy vertical segments)
    g.lineStyle(2, 0x1a4a10, 0.8)
    for (let i = 0; i < 12; i++) {
      const vx = rng.integerInRange(30, GAME_WIDTH - 30)
      let vy = rng.integerInRange(80, 200)
      const segments = rng.integerInRange(6, 12)
      for (let s = 0; s < segments; s++) {
        const nx = vx + rng.integerInRange(-10, 10)
        const ny = vy + rng.integerInRange(30, 50)
        g.lineBetween(vx, vy, nx, ny)
        vy = ny
      }
    }

    // Water pool
    g.fillStyle(0x1a7a5a, 0.8)
    g.fillCircle(
      rng.integerInRange(200, 800),
      rng.integerInRange(430, 560),
      rng.integerInRange(40, 70)
    )
    // Ripple rings
    g.lineStyle(1, 0x2a9a7a, 0.4)
    const poolX = rng.integerInRange(200, 800)
    const poolY = rng.integerInRange(430, 560)
    for (let r = 1; r <= 3; r++) {
      g.strokeCircle(poolX, poolY, r * 18)
    }

    // Exotic flowers
    const flowerColors = [0xff4444, 0xff9900, 0x9933ff, 0xff44aa]
    for (let i = 0; i < 14; i++) {
      const fx = rng.integerInRange(30, GAME_WIDTH - 30)
      const fy = rng.integerInRange(360, 600)
      g.fillStyle(0x1a5e14, 1)
      g.fillRect(fx - 1, fy - 20, 2, 20)
      g.fillStyle(flowerColors[rng.integerInRange(0, 3)], 0.9)
      g.fillCircle(fx, fy - 22, rng.integerInRange(7, 12))
    }

    // Fireflies
    for (let i = 0; i < 10; i++) {
      const fx = rng.integerInRange(40, GAME_WIDTH - 40)
      const fy = rng.integerInRange(200, 600)
      const fly = this.add.graphics().setDepth(2)
      fly.fillStyle(0xffff44, 0.7)
      fly.fillCircle(fx, fy, 2)
      this.tweens.add({
        targets: fly,
        alpha: { from: 0.1, to: 0.9 },
        duration: rng.integerInRange(600, 1400),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      })
    }
  }

  // ── Ocean ──────────────────────────────────────────────────────────────────

  private drawOcean(rng: Phaser.Math.RandomDataGenerator) {
    const g = this.add.graphics().setDepth(0)

    // Deep ocean gradient
    g.fillStyle(0x0a1a4a, 1)
    g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)
    g.fillStyle(0x1a3a6a, 1)
    g.fillRect(0, 200, GAME_WIDTH, GAME_HEIGHT - 200)

    // Surface / sky strip
    g.fillStyle(0x1a6eb5, 0.7)
    g.fillRect(0, 0, GAME_WIDTH, 80)

    // Light rays from surface
    for (let i = 0; i < 8; i++) {
      const rx = rng.integerInRange(0, GAME_WIDTH)
      g.fillStyle(0x6ab8ff, 0.06)
      g.fillTriangle(rx, 0, rx - 60, GAME_HEIGHT, rx + 60, GAME_HEIGHT)
    }

    // Wave lines
    g.lineStyle(2, 0x4a7aaa, 0.5)
    for (let w = 0; w < 12; w++) {
      const wy = rng.integerInRange(80, 560)
      for (let wx = 0; wx < GAME_WIDTH; wx += 60) {
        g.lineBetween(wx, wy, wx + 30, wy - 6)
        g.lineBetween(wx + 30, wy - 6, wx + 60, wy)
      }
    }

    // Sandy seafloor at bottom
    g.fillStyle(0xd4a857, 1)
    g.fillRect(0, 630, GAME_WIDTH, 90)
    g.fillStyle(0xc89040, 1)
    g.fillRect(0, 630, GAME_WIDTH, 12)

    // Coral formations
    const coralColors = [0xff6688, 0xff9944, 0xff4466, 0xbb44ff, 0xff8844]
    for (let i = 0; i < 12; i++) {
      const cx = rng.integerInRange(40, GAME_WIDTH - 40)
      const cy = rng.integerInRange(560, 640)
      const cc = coralColors[rng.integerInRange(0, 4)]
      g.fillStyle(cc, 0.9)
      for (let b = 0; b < rng.integerInRange(2, 5); b++) {
        g.fillCircle(cx + rng.integerInRange(-16, 16), cy - rng.integerInRange(0, 20), rng.integerInRange(5, 10))
      }
    }

    // Seaweed
    g.fillStyle(0x1a5a20, 1)
    for (let i = 0; i < 14; i++) {
      const sx = rng.integerInRange(20, GAME_WIDTH - 20)
      const sy = rng.integerInRange(520, 640)
      const sh = rng.integerInRange(30, 70)
      for (let s = 0; s < sh; s += 8) {
        g.fillRect(sx + (s % 16 < 8 ? -2 : 2), sy - s, 6, 8)
      }
    }

    // Rocks
    for (let i = 0; i < 5; i++) {
      const rx = rng.integerInRange(60, GAME_WIDTH - 60)
      const ry = rng.integerInRange(400, 620)
      const rr = rng.integerInRange(18, 34)
      g.fillStyle(0x4a4a5a, 1)
      g.fillCircle(rx, ry, rr)
      // Barnacle spots
      g.fillStyle(0x6a6a7a, 1)
      for (let b = 0; b < 4; b++) {
        g.fillCircle(rx + rng.integerInRange(-rr + 4, rr - 4), ry + rng.integerInRange(-rr + 4, rr - 4), 2)
      }
    }

    // Fish (static, seeded positions)
    const fishColors = [0xff8844, 0xffcc44, 0x44aaff, 0xff4466]
    for (let i = 0; i < 8; i++) {
      const fx = rng.integerInRange(60, GAME_WIDTH - 60)
      const fy = rng.integerInRange(120, 580)
      g.fillStyle(fishColors[rng.integerInRange(0, 3)], 0.8)
      g.fillEllipse(fx, fy, 20, 10)
      // Tail
      g.fillTriangle(fx - 10, fy, fx - 18, fy - 6, fx - 18, fy + 6)
    }

    // Bubbles
    for (let i = 0; i < 20; i++) {
      g.fillStyle(0xffffff, 0.25)
      g.fillCircle(
        rng.integerInRange(20, GAME_WIDTH - 20),
        rng.integerInRange(80, 600),
        rng.integerInRange(2, 6)
      )
    }
  }

  private drawFallback() {
    const g = this.add.graphics().setDepth(0)
    g.fillStyle(0x1a1a2e, 1)
    g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)
  }

  // ── Enemy NPC markers ──────────────────────────────────────────────────────

  private drawEnemies(biome: string, difficulty: 'easy' | 'medium' | 'hard', rng: Phaser.Math.RandomDataGenerator) {
    const counts: Record<string, number> = { easy: 3, medium: 5, hard: 6 }
    const levelRanges: Record<string, [number, number]> = { easy: [2, 5], medium: [8, 14], hard: [20, 30] }
    const count = counts[difficulty]
    const [minLv, maxLv] = levelRanges[difficulty]

    for (let i = 0; i < count; i++) {
      const ex = rng.integerInRange(60, GAME_WIDTH - 60)
      const ey = rng.integerInRange(60, 420)  // upper 60% of screen
      const level = rng.integerInRange(minLv, maxLv)
      this.drawEnemyMarker(biome, difficulty, ex, ey, level)
    }
  }

  private drawEnemyMarker(
    biome: string,
    difficulty: 'easy' | 'medium' | 'hard',
    x: number,
    y: number,
    level: number
  ) {
    const g = this.add.graphics().setDepth(5)
    const size = difficulty === 'easy' ? 24 : difficulty === 'medium' ? 30 : 36
    const tint = difficulty === 'hard' ? 0.4 : 0

    // Draw enemy shape based on biome
    this.drawEnemyShape(g, biome, x, y, size, tint)

    // Name label
    const enemyNames: Record<string, string> = {
      'Desert':              'Desert Scorpion',
      'Pine Forest':         'Forest Wolf',
      'Deciduous Forest':    'Woodland Bear',
      'Swamp':               'Swamp Serpent',
      'Snow':                'Frost Yeti',
      'Grassland':           'Wild Boar',
      'Tropical Rainforest': 'Shadow Panther',
      'Ocean':               'Deep Shark',
    }
    const name = enemyNames[biome] ?? 'Unknown'

    this.add.text(x, y - size / 2 - 18, `${name} Lv.${level}`, {
      fontSize: '10px',
      fontFamily: 'Arial, sans-serif',
      color: difficulty === 'hard' ? '#ff6666' : '#dddddd',
      backgroundColor: '#00000099',
      padding: { x: 3, y: 1 },
    }).setOrigin(0.5, 0.5).setDepth(6)

    // Health bar
    const hbG = this.add.graphics().setDepth(6)
    hbG.fillStyle(0x333333, 1)
    hbG.fillRect(x - 16, y - size / 2 - 6, 32, 4)
    hbG.fillStyle(0x44cc44, 1)
    hbG.fillRect(x - 16, y - size / 2 - 6, 32, 4)

    // Interactive tooltip
    const hitZone = this.add.zone(x - size / 2, y - size / 2, size, size).setInteractive({ useHandCursor: true })
    hitZone.setDepth(7)
    hitZone.on('pointerdown', () => {
      this.showEnemyTooltip(x, y - size / 2 - 30)
    })
  }

  private drawEnemyShape(
    g: Phaser.GameObjects.Graphics,
    biome: string,
    x: number,
    y: number,
    size: number,
    redTint: number
  ) {
    const s = size / 2
    switch (biome) {
      case 'Desert': {
        // Scorpion: body oval + tail + claws
        g.fillStyle(Phaser.Display.Color.GetColor(0x8a + Math.round(redTint * 80), 0x60, 0x20), 1)
        g.fillEllipse(x, y, s * 2, s * 1.2)
        g.fillStyle(0x6a4010, 1)
        // Tail curve
        g.fillRect(x + s - 4, y - s, 5, s + 4)
        g.fillRect(x + s, y - s - 4, 8, 5)
        // Claws
        g.fillRect(x - s - 6, y - 4, 10, 4)
        g.fillRect(x - s - 6, y + 2, 6, 4)
        g.fillRect(x - s + 4, y - 4, 10, 4)
        g.fillRect(x - s + 8, y + 2, 6, 4)
        break
      }
      case 'Pine Forest': {
        // Wolf: elongated body, triangular ears
        g.fillStyle(0x5a5a6a, 1)
        g.fillEllipse(x, y, s * 2.4, s * 1.2)
        // Head
        g.fillCircle(x + s, y - 2, s * 0.7)
        // Ears
        g.fillStyle(0x4a4a5a, 1)
        g.fillTriangle(x + s - 4, y - s, x + s + 2, y - s - 10, x + s + 8, y - s)
        g.fillTriangle(x + s + 4, y - s, x + s + 10, y - s - 10, x + s + 16, y - s)
        break
      }
      case 'Deciduous Forest': {
        // Bear: large rounded body
        g.fillStyle(0x6a3a18, 1)
        g.fillCircle(x, y, s * 1.1)
        // Head
        g.fillCircle(x, y - s * 0.9, s * 0.7)
        // Ears
        g.fillCircle(x - s * 0.4, y - s * 1.5, s * 0.3)
        g.fillCircle(x + s * 0.4, y - s * 1.5, s * 0.3)
        // Eyes
        g.fillStyle(0x1a0a00, 1)
        g.fillCircle(x - 4, y - s * 0.9, 2)
        g.fillCircle(x + 4, y - s * 0.9, 2)
        break
      }
      case 'Swamp': {
        // Serpent: S-curve body
        g.fillStyle(0x2a5a20, 1)
        g.fillEllipse(x - 10, y, s * 1.4, s * 0.6)
        g.fillEllipse(x + 8, y + 6, s * 1.4, s * 0.6)
        // Head
        g.fillEllipse(x - s, y - 4, s * 0.8, s * 0.5)
        // Eyes
        g.fillStyle(0xffff00, 1)
        g.fillCircle(x - s - 2, y - 6, 2)
        break
      }
      case 'Snow': {
        // Yeti: wide white body, dark eyes
        g.fillStyle(0xeeeeff, 1)
        g.fillEllipse(x, y, s * 2.2, s * 1.8)
        // Head
        g.fillCircle(x, y - s * 0.8, s * 0.9)
        // Eyes
        g.fillStyle(0x222244, 1)
        g.fillCircle(x - 5, y - s * 0.8, 3)
        g.fillCircle(x + 5, y - s * 0.8, 3)
        break
      }
      case 'Grassland': {
        // Boar: stocky body, tusks
        g.fillStyle(0x6a4a30, 1)
        g.fillEllipse(x, y, s * 2.2, s * 1.3)
        // Snout
        g.fillEllipse(x + s, y, s * 0.7, s * 0.5)
        // Tusks
        g.fillStyle(0xf0e8d0, 1)
        g.fillTriangle(x + s + 2, y + 4, x + s + 8, y + 4, x + s + 4, y + 14)
        g.fillTriangle(x + s + 10, y + 4, x + s + 16, y + 4, x + s + 12, y + 14)
        break
      }
      case 'Tropical Rainforest': {
        // Panther: sleek dark body
        g.fillStyle(0x1a1a2a, 1)
        g.fillEllipse(x, y, s * 2.6, s * 1.0)
        // Head
        g.fillCircle(x + s * 1.0, y - 2, s * 0.7)
        // Ears
        g.fillTriangle(x + s + 2, y - s, x + s + 8, y - s - 10, x + s + 14, y - s)
        // Spots
        g.fillStyle(0x2a2a3a, 1)
        g.fillCircle(x, y, 3)
        g.fillCircle(x - 10, y + 3, 2)
        g.fillCircle(x + 8, y - 3, 2)
        break
      }
      case 'Ocean': {
        // Shark: gray triangle/fin
        g.fillStyle(0x5a6a7a, 1)
        g.fillTriangle(x - s * 1.2, y + s * 0.3, x + s * 1.2, y, x - s * 1.2, y - s * 0.3)
        // Fin
        g.fillTriangle(x - 4, y - s * 0.3, x + 4, y - s * 0.3, x, y - s * 1.1)
        // Eye
        g.fillStyle(0x000000, 1)
        g.fillCircle(x + s * 0.8, y, 2)
        break
      }
      default: {
        g.fillStyle(0x888888, 1)
        g.fillCircle(x, y, s)
        break
      }
    }

    // Red tint overlay for hard difficulty
    if (redTint > 0) {
      g.fillStyle(0xff0000, 0.25)
      g.fillCircle(x, y, s * 1.2)
    }
  }

  private showEnemyTooltip(x: number, y: number) {
    // Remove previous tooltip
    if (this.tooltip) {
      this.tooltip.destroy()
      this.tooltip = null
    }

    const container = this.add.container(x, y)
    container.setDepth(50)
    container.setScrollFactor(0)

    const bg = this.add.graphics()
    bg.fillStyle(0x000000, 0.85)
    bg.fillRoundedRect(-70, -16, 140, 28, 6)
    bg.lineStyle(1, 0xffd700, 1)
    bg.strokeRoundedRect(-70, -16, 140, 28, 6)
    container.add(bg)

    const txt = this.add.text(0, 0, '⚔ Press Space to fight', {
      fontSize: '11px',
      fontFamily: 'Arial, sans-serif',
      color: '#ffd700',
    })
    txt.setOrigin(0.5, 0.5)
    container.add(txt)

    this.tooltip = container

    // Auto-dismiss after 2 seconds
    this.time.delayedCall(2000, () => {
      if (this.tooltip === container) {
        container.destroy()
        this.tooltip = null
      }
    })
  }

  // ── HUD ────────────────────────────────────────────────────────────────────

  private drawHUD(biome: string, location: string, difficulty: 'easy' | 'medium' | 'hard') {
    const hudG = this.add.graphics()
    hudG.setScrollFactor(0)
    hudG.setDepth(100)
    hudG.fillStyle(0x000000, 0.65)
    hudG.fillRect(0, GAME_HEIGHT - 44, GAME_WIDTH, 44)
    hudG.lineStyle(1, 0xffd700, 0.6)
    hudG.lineBetween(0, GAME_HEIGHT - 44, GAME_WIDTH, GAME_HEIGHT - 44)

    const diffColors: Record<string, string> = { easy: '#44cc44', medium: '#ffcc00', hard: '#ff4444' }
    const diffColor = diffColors[difficulty]
    const diffLabel = difficulty.toUpperCase()

    // Left: biome info
    this.add.text(12, GAME_HEIGHT - 22, `${biome}  |  ${location}`, {
      fontSize: '13px',
      fontFamily: 'Georgia, serif',
      color: '#ffd700',
    }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(101)

    // Difficulty badge
    this.add.text(12 + (biome.length + location.length + 5) * 8 + 14, GAME_HEIGHT - 22, diffLabel, {
      fontSize: '11px',
      fontFamily: 'Arial, sans-serif',
      color: diffColor,
      backgroundColor: '#00000088',
      padding: { x: 5, y: 2 },
    }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(101)

    // Right: ESC hint
    this.add.text(GAME_WIDTH - 12, GAME_HEIGHT - 22, 'ESC — Return to World', {
      fontSize: '12px',
      fontFamily: 'Arial, sans-serif',
      color: '#aaaaaa',
    }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(101)
  }

  update() {
    this.player.update(this.cursors, this.wasd)

    if (Phaser.Input.Keyboard.JustDown(this.escKey)) {
      this.scene.start('WorldScene', {
        spawnX: this.biomeData.returnX,
        spawnY: this.biomeData.returnY,
      })
      this.scene.launch('UIScene')
    }
  }
}
