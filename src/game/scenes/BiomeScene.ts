/**
 * BiomeScene — large scrollable biome world.
 *
 * The world is 3× the game viewport (3840 × 2160).  The player's sprite
 * auto-walks a winding S-curve path from the bottom of the world to the
 * top, stopping at 3 encounter nodes.  The camera follows the player with
 * smooth lerp.  All HUD elements use setScrollFactor(0).
 *
 * When an encounter node is reached, BattleScene is launched on top
 * (scene.launch + scene.pause).  BiomeScene.onBattleResult() is called back
 * by BattleScene when combat ends.
 */

import Phaser from 'phaser'
import type { Socket } from 'socket.io-client'
import { GAME_WIDTH, GAME_HEIGHT } from '../constants'
import type { BattleSceneData, BattleResult, MobDef } from './BattleScene'

// ── World dimensions ────────────────────────────────────────────────────────

const WORLD_W = 3840   // 3 × GAME_WIDTH
const WORLD_H = 2160   // 3 × GAME_HEIGHT

// ── Scene data ──────────────────────────────────────────────────────────────

interface BiomeSceneData {
  biome: string
  difficulty: 'easy' | 'medium' | 'hard'
  location: string
  returnX?: number
  returnY?: number
}

interface PathNode {
  x: number
  y: number
  type: 'start' | 'walk' | 'encounter' | 'end'
  mobs?: MobDef[]
  cleared: boolean
  markerGfx: Phaser.GameObjects.Graphics | null
  markerLabel: Phaser.GameObjects.Text | null
}

type PathState = 'idle' | 'walking' | 'encounter_pause' | 'battling' | 'complete'

// ── Biome constants ─────────────────────────────────────────────────────────

const MOB_NAMES: Record<string, string> = {
  'Desert': 'Desert Scorpion', 'Pine Forest': 'Forest Wolf',
  'Deciduous Forest': 'Woodland Bear', 'Swamp': 'Swamp Serpent',
  'Snow': 'Frost Yeti', 'Grassland': 'Wild Boar',
  'Tropical Rainforest': 'Shadow Panther', 'Ocean': 'Deep Shark',
}

const MOB_COUNTS: Record<string, [number, number]> = {
  easy: [4, 5], medium: [5, 7], hard: [7, 10],
}
const MOB_HP:   Record<string, number> = { easy: 60, medium: 100, hard: 150 }
const MOB_LVLS: Record<string, [number, number]> = {
  easy: [2, 5], medium: [8, 14], hard: [20, 30],
}

const WALK_SPEED = 180  // world-px per second

// S-curve waypoints as fractions of world size
const WP_DEFS: { fx: number; fy: number; type: PathNode['type'] }[] = [
  { fx: 0.50, fy: 0.94, type: 'start'     },
  { fx: 0.28, fy: 0.74, type: 'walk'      },
  { fx: 0.55, fy: 0.55, type: 'encounter' },
  { fx: 0.78, fy: 0.38, type: 'walk'      },
  { fx: 0.45, fy: 0.22, type: 'encounter' },
  { fx: 0.22, fy: 0.10, type: 'walk'      },
  { fx: 0.55, fy: 0.04, type: 'encounter' },
  { fx: 0.55, fy: 0.04, type: 'end'       },
]

// ── BiomeScene ─────────────────────────────────────────────────────────────

export class BiomeScene extends Phaser.Scene {
  private biomeData!: BiomeSceneData
  private pathNodes: PathNode[] = []
  private currentNodeIdx = 0
  private pathState: PathState = 'idle'
  private playerHp = 100
  private playerMaxHp = 100
  private encountersCleared = 0
  private totalXpGained = 0
  private rng!: Phaser.Math.RandomDataGenerator

  private playerSprite!: Phaser.GameObjects.Sprite
  private hpGfx!: Phaser.GameObjects.Graphics
  private hpLabel!: Phaser.GameObjects.Text
  private progressText!: Phaser.GameObjects.Text
  private alertText!: Phaser.GameObjects.Text
  private escKey!: Phaser.Input.Keyboard.Key

  constructor() { super({ key: 'BiomeScene' }) }

  init(data: BiomeSceneData) {
    this.biomeData         = data
    this.pathState         = 'idle'
    this.currentNodeIdx    = 0
    this.encountersCleared = 0
    this.totalXpGained     = 0
    this.pathNodes         = []
  }

  create() {
    const { biome, difficulty } = this.biomeData
    this.rng = new Phaser.Math.RandomDataGenerator([biome + ':' + difficulty])

    this.playerMaxHp = (this.registry.get('maxHp') as number) ?? 100
    this.playerHp    = Math.min(
      (this.registry.get('hp') as number) ?? this.playerMaxHp,
      this.playerMaxHp,
    )

    // World bounds & camera
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H)

    // Draw biome environment at world scale
    this.drawBiome(biome, this.rng)

    // Build and draw path
    this.buildPath()
    this.drawPath()
    this.drawSafeZone()

    // Player sprite at start node
    const start = this.pathNodes[0]
    this.playerSprite = this.add.sprite(start.x, start.y, 'character_idle')
      .setScale(2).setDepth(15)
    if (this.anims.exists('idle_down')) this.playerSprite.play('idle_down')

    // Camera follows player smoothly
    this.cameras.main.startFollow(this.playerSprite, true, 0.08, 0.08)

    // HUD (all scroll-factor 0)
    this.createHUD()

    // Encounter alert (fixed to screen)
    this.alertText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, '', {
      fontSize: '26px', fontFamily: 'Georgia, serif', color: '#ff5544', fontStyle: 'bold',
      backgroundColor: '#00000099', padding: { x: 28, y: 14 }, align: 'center',
    }).setOrigin(0.5, 0.5).setDepth(200).setScrollFactor(0).setVisible(false)

    this.escKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC)

    // Begin auto-walk after a short preview
    this.time.delayedCall(1200, () => {
      this.pathState = 'walking'
      this.advanceToNextNode()
    })
  }

  // ── Path ────────────────────────────────────────────────────────────────────

  private buildPath() {
    const { difficulty, biome } = this.biomeData
    const [minMobs, maxMobs] = MOB_COUNTS[difficulty]
    const [minLv,   maxLv]  = MOB_LVLS[difficulty]
    const mobHp  = MOB_HP[difficulty]
    const mobName = MOB_NAMES[biome] ?? 'Enemy'

    this.pathNodes = WP_DEFS.map(wp => {
      const node: PathNode = {
        x: Math.round(wp.fx * WORLD_W),
        y: Math.round(wp.fy * WORLD_H),
        type: wp.type,
        cleared: false,
        markerGfx: null, markerLabel: null,
      }
      if (wp.type === 'encounter') {
        const count = Phaser.Math.Between(minMobs, maxMobs)
        const level = Phaser.Math.Between(minLv, maxLv)
        node.mobs = Array.from({ length: count }, (_, j) => ({
          name: mobName,
          level: level + Math.floor(j / 2),
          maxHp: mobHp,
        }))
      }
      return node
    })
  }

  private drawPath() {
    for (let i = 0; i < this.pathNodes.length - 1; i++) {
      const a = this.pathNodes[i]
      const b = this.pathNodes[i + 1]
      if (a.x === b.x && a.y === b.y) continue
      this.drawPathBetweenWaypoints(a.x, a.y, b.x, b.y)
    }

    this.pathNodes.forEach((node, i) => {
      if (node.type === 'encounter') this.renderEncounterMarker(i)
      if (node.type === 'end')       this.renderEndMarker(node)
    })
  }

  private drawPathBetweenWaypoints(x1: number, y1: number, x2: number, y2: number) {
    const dist = Phaser.Math.Distance.Between(x1, y1, x2, y2)
    const steps = Math.floor(dist / 48)
    for (let i = 0; i <= steps; i++) {
      const t = steps === 0 ? 0 : i / steps
      const px = Phaser.Math.Linear(x1, x2, t)
      const py = Phaser.Math.Linear(y1, y2, t)
      this.add.image(px, py, 'road_tiles', 0).setScale(2).setDepth(2)
    }
  }

  private renderEncounterMarker(nodeIdx: number) {
    const node = this.pathNodes[nodeIdx]
    node.markerGfx?.destroy()
    node.markerLabel?.destroy()

    const g = this.add.graphics().setDepth(6)
    node.markerGfx = g

    if (node.cleared) {
      g.fillStyle(0x44aa44, 0.4).fillCircle(node.x, node.y, 38)
      g.lineStyle(3, 0x44ff44, 0.9).strokeCircle(node.x, node.y, 38)
      node.markerLabel = this.add.text(node.x, node.y, '✓', {
        fontSize: '28px', color: '#44ff44', fontStyle: 'bold',
      }).setOrigin(0.5, 0.5).setDepth(7)
    } else {
      const count = node.mobs?.length ?? 0
      g.fillStyle(0xaa2222, 0.35).fillCircle(node.x, node.y, 48)
      g.lineStyle(4, 0xff4444, 0.85).strokeCircle(node.x, node.y, 48)
      g.fillStyle(0xff5544, 0.75).fillCircle(node.x, node.y, 16)
      node.markerLabel = this.add.text(node.x, node.y + 62, `⚔  ${count} Enemies`, {
        fontSize: '16px', fontFamily: 'Arial', color: '#ff8888',
        backgroundColor: '#00000099', padding: { x: 7, y: 4 },
      }).setOrigin(0.5, 0.5).setDepth(7)
      this.tweens.add({
        targets: g, alpha: { from: 1, to: 0.45 },
        duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      })
    }
  }

  private renderEndMarker(node: PathNode) {
    const g = this.add.graphics().setDepth(6)
    g.fillStyle(0xffd700, 0.25).fillCircle(node.x, node.y, 44)
    g.lineStyle(4, 0xffd700, 0.9).strokeCircle(node.x, node.y, 44)
    this.add.text(node.x, node.y, '🏆', { fontSize: '28px' })
      .setOrigin(0.5, 0.5).setDepth(7)
    this.add.text(node.x, node.y + 60, 'EXIT', {
      fontSize: '14px', fontFamily: 'Arial', color: '#ffd700',
      backgroundColor: '#00000099', padding: { x: 6, y: 3 },
    }).setOrigin(0.5, 0.5).setDepth(7)
    this.tweens.add({
      targets: g, alpha: { from: 0.8, to: 0.3 },
      duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    })
  }

  private drawSafeZone() {
    const { x, y } = this.pathNodes[0]
    const g = this.add.graphics().setDepth(2)
    g.fillStyle(0xffffff, 0.1).fillEllipse(x, y + 50, 380, 110)
    for (const tx of [x - 180, x + 180]) {
      g.fillStyle(0x7a5a30, 1).fillRect(tx - 5, y + 12, 10, 42)
      g.fillStyle(0xff8800, 0.9).fillCircle(tx, y + 8, 12)
      g.fillStyle(0xffee00, 0.7).fillCircle(tx, y + 4, 7)
      g.fillStyle(0xff8800, 0.15).fillCircle(tx, y + 8, 34)
    }
    this.add.text(x, y + 90, '▲  START  ▲', {
      fontSize: '16px', fontFamily: 'Arial', color: '#ffd700',
      backgroundColor: '#00000077', padding: { x: 10, y: 5 },
    }).setOrigin(0.5, 0.5).setDepth(7)
  }

  // ── Path traversal ───────────────────────────────────────────────────────────

  private advanceToNextNode() {
    if (this.currentNodeIdx >= this.pathNodes.length - 1) {
      this.pathState = 'complete'; this.showVictoryScreen(); return
    }
    const from = this.pathNodes[this.currentNodeIdx]
    const to   = this.pathNodes[this.currentNodeIdx + 1]

    if (from.x === to.x && from.y === to.y) {
      this.currentNodeIdx++; this.onReachedNode(); return
    }

    const dx = to.x - from.x, dy = to.y - from.y
    let dir = 'up'
    if (Math.abs(dy) >= Math.abs(dx)) dir = dy > 0 ? 'down' : 'up'
    else                               dir = dx > 0 ? 'right' : 'left'
    if (this.anims.exists(`walk_${dir}`)) this.playerSprite.play(`walk_${dir}`)

    const dist = Phaser.Math.Distance.Between(from.x, from.y, to.x, to.y)
    this.tweens.add({
      targets: this.playerSprite, x: to.x, y: to.y,
      duration: (dist / WALK_SPEED) * 1000, ease: 'Linear',
      onComplete: () => { this.currentNodeIdx++; this.onReachedNode() },
    })
  }

  private onReachedNode() {
    const node = this.pathNodes[this.currentNodeIdx]
    const dir = (this.playerSprite.anims.currentAnim?.key ?? 'walk_up').replace('walk_', '')
    if (this.anims.exists(`idle_${dir}`)) this.playerSprite.play(`idle_${dir}`)

    if (node.type === 'encounter' && !node.cleared) {
      this.pathState = 'encounter_pause'
      this.triggerEncounterAlert(node)
    } else if (node.type === 'end') {
      this.pathState = 'complete'; this.showVictoryScreen()
    } else {
      this.time.delayedCall(300, () => { this.pathState = 'walking'; this.advanceToNextNode() })
    }
  }

  private triggerEncounterAlert(node: PathNode) {
    const count = node.mobs?.length ?? 0
    this.alertText
      .setText(`⚔  ${count} Enemies Encountered!\nPrepare for battle!`)
      .setVisible(true)
    this.cameras.main.shake(500, 0.008)
    this.cameras.main.flash(350, 255, 50, 50)
    this.time.delayedCall(2000, () => {
      this.alertText.setVisible(false)
      this.launchBattle(node)
    })
  }

  private launchBattle(node: PathNode) {
    const encNodes = this.pathNodes.filter(n => n.type === 'encounter')
    const encIdx   = encNodes.findIndex(n => n === node)

    const data: BattleSceneData = {
      biome:           this.biomeData.biome,
      difficulty:      this.biomeData.difficulty,
      mobs:            node.mobs ?? [],
      encounterIndex:  encIdx,
      totalEncounters: encNodes.length,
      playerHp:        this.playerHp,
      playerMaxHp:     this.playerMaxHp,
    }
    this.scene.launch('BattleScene', data)
    this.scene.pause()
  }

  public onBattleResult(result: BattleResult) {
    if (!result.victory) { this.showDefeatOverlay(); return }

    this.playerHp       = result.playerHp
    this.totalXpGained += result.xpGained
    this.encountersCleared++

    const node = this.pathNodes[this.currentNodeIdx]
    node.cleared = true
    this.renderEncounterMarker(this.currentNodeIdx)
    this.updateHUD()
    this.cameras.main.flash(400, 255, 215, 0)

    this.pathState = 'walking'
    this.time.delayedCall(600, () => this.advanceToNextNode())
  }

  // ── HUD ─────────────────────────────────────────────────────────────────────

  private createHUD() {
    const { biome, location, difficulty } = this.biomeData
    const diffColors: Record<string, string> = {
      easy: '#44cc44', medium: '#ffcc00', hard: '#ff4444',
    }

    const hudBg = this.add.graphics().setScrollFactor(0).setDepth(100)
    hudBg.fillStyle(0x000000, 0.72).fillRect(0, GAME_HEIGHT - 44, GAME_WIDTH, 44)
    hudBg.lineStyle(1, 0xffd700, 0.5).lineBetween(0, GAME_HEIGHT - 44, GAME_WIDTH, GAME_HEIGHT - 44)

    this.add.text(12, GAME_HEIGHT - 22, `${biome}  |  ${location}`, {
      fontSize: '13px', fontFamily: 'Georgia, serif', color: '#ffd700',
    }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(101)

    this.add.text(GAME_WIDTH - 12, GAME_HEIGHT - 22, 'ESC — Return to World', {
      fontSize: '12px', fontFamily: 'Arial', color: '#aaaaaa',
    }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(101)

    this.add.text(
      12 + (biome.length + location.length + 5) * 7.8 + 14, GAME_HEIGHT - 22,
      difficulty.toUpperCase(),
      { fontSize: '11px', fontFamily: 'Arial', color: diffColors[difficulty],
        backgroundColor: '#00000088', padding: { x: 5, y: 2 } }
    ).setOrigin(0, 0.5).setScrollFactor(0).setDepth(101)

    const hpBg = this.add.graphics().setScrollFactor(0).setDepth(100)
    hpBg.fillStyle(0x000000, 0.65).fillRoundedRect(8, 8, 250, 36, 6)

    this.hpGfx   = this.add.graphics().setScrollFactor(0).setDepth(101)
    this.hpLabel = this.add.text(14, 26, '', {
      fontSize: '11px', fontFamily: 'Arial', color: '#ffffff',
    }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(102)

    this.progressText = this.add.text(GAME_WIDTH - 12, 26, '', {
      fontSize: '11px', fontFamily: 'Arial', color: '#ffd700',
    }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(102)

    this.updateHUD()
  }

  private updateHUD() {
    this.hpGfx.clear()
    const pct  = Math.max(0, this.playerHp / this.playerMaxHp)
    const barW = 228
    this.hpGfx.fillStyle(0x333333, 1).fillRoundedRect(14, 17, barW, 14, 3)
    const col = pct > 0.5 ? 0x44cc44 : pct > 0.25 ? 0xffcc00 : 0xff4444
    this.hpGfx.fillStyle(col, 1).fillRoundedRect(14, 17, Math.round(barW * pct), 14, 3)
    this.hpLabel.setText(`HP  ${this.playerHp} / ${this.playerMaxHp}`)
    const total = this.pathNodes.filter(n => n.type === 'encounter').length
    this.progressText.setText(`Encounters: ${this.encountersCleared} / ${total}`)
  }

  // ── End screens ─────────────────────────────────────────────────────────────

  private showVictoryScreen() {
    if (this.totalXpGained > 0) {
      const socket = (window as typeof window & { __lumenSocket?: Socket }).__lumenSocket
      socket?.emit('player:award_xp', { xp: Math.min(this.totalXpGained, 500), awardShard: false })
    }
    this.cameras.main.flash(700, 255, 215, 0)

    const W = 560, H = 280, cx = GAME_WIDTH / 2, cy = GAME_HEIGHT / 2
    const bg = this.add.graphics().setDepth(190).setScrollFactor(0)
    bg.fillStyle(0x000000, 0.9).fillRoundedRect(cx - W / 2, cy - H / 2, W, H, 16)
    bg.lineStyle(2, 0xffd700, 1).strokeRoundedRect(cx - W / 2, cy - H / 2, W, H, 16)

    this.add.text(cx, cy - H / 2 + 42, '🏆  Biome Cleared!', {
      fontSize: '30px', fontFamily: 'Georgia, serif', color: '#ffd700', fontStyle: 'bold',
    }).setOrigin(0.5, 0.5).setDepth(200).setScrollFactor(0)

    const enc = this.encountersCleared
    this.add.text(cx, cy - 12, `${enc} encounter${enc !== 1 ? 's' : ''} conquered`, {
      fontSize: '16px', fontFamily: 'Arial', color: '#aaaaaa',
    }).setOrigin(0.5, 0.5).setDepth(200).setScrollFactor(0)

    this.add.text(cx, cy + 28, `+${this.totalXpGained} XP earned`, {
      fontSize: '22px', fontFamily: 'Georgia, serif', color: '#44ffaa', fontStyle: 'bold',
    }).setOrigin(0.5, 0.5).setDepth(200).setScrollFactor(0)

    const btn = this.add.text(cx, cy + H / 2 - 32, 'Return to World', {
      fontSize: '18px', fontFamily: 'Georgia, serif', color: '#ffffff', fontStyle: 'bold',
      backgroundColor: '#2a1060', padding: { x: 24, y: 12 },
    }).setOrigin(0.5, 0.5).setDepth(200).setScrollFactor(0)
      .setInteractive({ useHandCursor: true })
    btn.on('pointerover', () => btn.setColor('#ffd700'))
    btn.on('pointerout',  () => btn.setColor('#ffffff'))
    btn.on('pointerdown', () => this.returnToWorld())
  }

  private showDefeatOverlay() {
    const W = 460, H = 210, cx = GAME_WIDTH / 2, cy = GAME_HEIGHT / 2
    const bg = this.add.graphics().setDepth(190).setScrollFactor(0)
    bg.fillStyle(0x000000, 0.92).fillRoundedRect(cx - W / 2, cy - H / 2, W, H, 16)
    bg.lineStyle(2, 0xff4444, 1).strokeRoundedRect(cx - W / 2, cy - H / 2, W, H, 16)
    this.add.text(cx, cy - H / 2 + 40, '💀  Defeated!', {
      fontSize: '30px', fontFamily: 'Georgia, serif', color: '#ff5544', fontStyle: 'bold',
    }).setOrigin(0.5, 0.5).setDepth(200).setScrollFactor(0)
    this.add.text(cx, cy + 12, 'You have been driven back to town.', {
      fontSize: '15px', fontFamily: 'Arial', color: '#aaaaaa',
    }).setOrigin(0.5, 0.5).setDepth(200).setScrollFactor(0)
    this.time.delayedCall(2200, () => this.returnToWorld())
  }

  private returnToWorld() {
    this.scene.start('WorldScene', { spawnX: this.biomeData.returnX, spawnY: this.biomeData.returnY })
    this.scene.launch('UIScene')
  }

  update() {
    if (
      this.pathState !== 'battling' &&
      this.pathState !== 'complete' &&
      Phaser.Input.Keyboard.JustDown(this.escKey)
    ) {
      this.returnToWorld()
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Biome drawing — all at world scale (WORLD_W × WORLD_H)
  // ══════════════════════════════════════════════════════════════════════════

  private drawBiomeGround(biomeType: string) {
    const frameMap: Record<string, number> = {
      'Desert':               6,
      'Snow':                 0,
      'Grassland':            0,
      'Pine Forest':          1,
      'Deciduous Forest':     2,
      'Swamp':                3,
      'Tropical Rainforest':  4,
      'Ocean':                5,
    }
    const isRoad = biomeType === 'Desert'
    const sheet  = isRoad ? 'road_tiles' : 'ground_tiles'
    const frame  = frameMap[biomeType] ?? 0

    // Check whether the texture has enough frames; fall back to frame 0
    const tex = this.textures.get(sheet)
    const safeFrame = tex && tex.frameTotal > frame ? frame : 0

    const rt = this.add.renderTexture(0, 0, WORLD_W, WORLD_H).setDepth(0)
    const tileSize = 64  // 32 * 2 scale
    for (let ty = 0; ty < WORLD_H; ty += tileSize) {
      for (let tx = 0; tx < WORLD_W; tx += tileSize) {
        rt.stamp(sheet, safeFrame, tx + tileSize / 2, ty + tileSize / 2)
      }
    }
  }

  /** Scatter trees and rocks avoiding close proximity to waypoints. */
  private scatterProps(
    count: number,
    minX: number, maxX: number,
    minY: number, maxY: number,
    rng: Phaser.Math.RandomDataGenerator,
    treeRatio = 0.6,
    tint?: number,
  ) {
    for (let i = 0; i < count; i++) {
      const x = minX + rng.frac() * (maxX - minX)
      const y = minY + rng.frac() * (maxY - minY)

      const tooClose = this.pathNodes.some(wp =>
        Math.abs(wp.x - x) < 120 && Math.abs(wp.y - y) < 120,
      )
      if (tooClose) continue

      if (rng.frac() < treeRatio) {
        const img = this.add.image(x, y, 'tree')
          .setScale(1.5 + rng.frac())
          .setDepth(10)
        if (tint !== undefined) img.setTint(tint)
      } else {
        const img = this.add.image(x, y, 'rock')
          .setScale(2 + rng.frac())
          .setDepth(9)
        if (tint !== undefined) img.setTint(tint)
      }
    }
  }

  private drawBiome(biome: string, rng: Phaser.Math.RandomDataGenerator) {
    switch (biome) {
      case 'Desert':              this.drawDesert(rng);             break
      case 'Pine Forest':         this.drawPineForest(rng);         break
      case 'Deciduous Forest':    this.drawDeciduousForest(rng);    break
      case 'Swamp':               this.drawSwamp(rng);              break
      case 'Snow':                this.drawSnow(rng);               break
      case 'Grassland':           this.drawGrassland(rng);          break
      case 'Tropical Rainforest': this.drawTropicalRainforest(rng); break
      case 'Ocean':               this.drawOcean(rng);              break
      default:                    this.drawFallback();              break
    }
  }

  private drawDesert(rng: Phaser.Math.RandomDataGenerator) {
    this.drawBiomeGround('Desert')
    const g = this.add.graphics().setDepth(1)
    g.fillStyle(0x87ceeb, 1).fillRect(0, 0, WORLD_W, WORLD_H * 0.45)
    const sc = [0xe8b84b, 0xe8c060, 0xd4a040, 0xf0d080]
    for (let i = 0; i < 200; i++) {
      g.fillStyle(sc[rng.integerInRange(0, 3)], 0.3)
      g.fillRect(rng.integerInRange(0, WORLD_W), rng.integerInRange(WORLD_H * 0.3, WORLD_H),
        rng.integerInRange(60, 180), rng.integerInRange(20, 60))
    }
    g.fillStyle(0xffe040, 0.9).fillCircle(WORLD_W * 0.88, WORLD_H * 0.08, 90)
    g.fillStyle(0xfff080, 0.5).fillCircle(WORLD_W * 0.88, WORLD_H * 0.08, 120)
    for (let i = 0; i < 12; i++) {
      g.fillStyle(0xd4a040, 0.4)
      g.fillEllipse(rng.integerInRange(100, WORLD_W - 100), rng.integerInRange(WORLD_H * 0.35, WORLD_H * 0.8),
        rng.integerInRange(400, 900), rng.integerInRange(80, 200))
    }
    for (let i = 0; i < 40; i++) {
      this.drawCactus(g, rng.integerInRange(60, WORLD_W - 60), rng.integerInRange(WORLD_H * 0.2, WORLD_H * 0.85),
        rng.integerInRange(60, 120))
    }
    // Rock scatter — no trees in desert
    this.scatterProps(25, 0, WORLD_W, WORLD_H * 0.3, WORLD_H, rng, 0.0)
  }

  private drawCactus(g: Phaser.GameObjects.Graphics, x: number, y: number, h: number) {
    g.fillStyle(0x3a7a20, 1)
    g.fillRect(x - h * 0.08, y - h, h * 0.16, h)
    g.fillRect(x - h * 0.3, y - h * 0.6, h * 0.22, h * 0.1)
    g.fillRect(x - h * 0.3, y - h * 0.75, h * 0.08, h * 0.2)
    g.fillRect(x + h * 0.08, y - h * 0.5, h * 0.22, h * 0.1)
    g.fillRect(x + h * 0.22, y - h * 0.65, h * 0.08, h * 0.2)
  }

  private drawPineForest(rng: Phaser.Math.RandomDataGenerator) {
    this.drawBiomeGround('Pine Forest')
    const g = this.add.graphics().setDepth(1)
    g.fillStyle(0x0a1a0d, 0.6).fillRect(0, 0, WORLD_W, WORLD_H * 0.5)
    for (let i = 0; i < 18; i++) {
      g.fillStyle(0xffffff, rng.realInRange(0.03, 0.12))
      g.fillEllipse(rng.integerInRange(0, WORLD_W), rng.integerInRange(WORLD_H * 0.5, WORLD_H * 0.85),
        rng.integerInRange(300, 700), rng.integerInRange(50, 130))
    }
    for (let i = 0; i < 80; i++) {
      this.drawPineTree(g, rng.integerInRange(40, WORLD_W - 40), rng.integerInRange(80, WORLD_H * 0.9),
        rng.integerInRange(80, 180))
    }
    for (let i = 0; i < 40; i++) {
      const mx = rng.integerInRange(40, WORLD_W - 40)
      const my = rng.integerInRange(WORLD_H * 0.5, WORLD_H - 60)
      g.fillStyle(0xd4a855, 1).fillRect(mx - 4, my - 12, 8, 16)
      g.fillStyle(0xcc4444, 1).fillCircle(mx, my - 14, 14)
      g.fillStyle(0xffffff, 1).fillCircle(mx - 4, my - 16, 2).fillCircle(mx + 4, my - 13, 2)
    }
    // Dense tree + rock scatter for pine forest
    this.scatterProps(60, 0, WORLD_W, 0, WORLD_H, rng, 0.75)
  }

  private drawPineTree(g: Phaser.GameObjects.Graphics, x: number, y: number, h: number) {
    g.fillStyle(0x5a3a10, 1).fillRect(x - h * 0.05, y, h * 0.1, h * 0.25)
    const colors = [0x1a5c2a, 0x154a22, 0x0d3a14]
    for (let t = 0; t < 3; t++) {
      const w = [0.5, 0.38, 0.28][t]
      g.fillStyle(colors[t], 1)
      g.fillTriangle(x, y - h * (0.28 + t * 0.24), x - h * w / 2, y - h * t * 0.24 + h * 0.02, x + h * w / 2, y - h * t * 0.24 + h * 0.02)
    }
  }

  private drawDeciduousForest(rng: Phaser.Math.RandomDataGenerator) {
    const g = this.add.graphics().setDepth(0)
    g.fillStyle(0x4a7a4a, 1).fillRect(0, 0, WORLD_W, WORLD_H)
    g.fillStyle(0x3a6a20, 1).fillRect(0, WORLD_H * 0.45, WORLD_W, WORLD_H * 0.55)
    for (let i = 0; i < 18; i++) {
      g.fillStyle(0x4a8a30, 0.25)
      g.fillEllipse(rng.integerInRange(0, WORLD_W), rng.integerInRange(WORLD_H * 0.4, WORLD_H * 0.7),
        rng.integerInRange(180, 500), rng.integerInRange(60, 160))
    }
    for (let i = 0; i < 20; i++) {
      const lx = rng.integerInRange(80, WORLD_W - 80)
      const ly = rng.integerInRange(WORLD_H * 0.5, WORLD_H - 100)
      g.fillStyle(0x6a3a10, 1).fillRect(lx - 80, ly - 12, 160, 24)
    }
    for (let i = 0; i < 60; i++) {
      this.drawDeciduousTree(g, rng.integerInRange(50, WORLD_W - 50), rng.integerInRange(80, WORLD_H * 0.85),
        rng.integerInRange(60, 160))
    }
    const flc = [0xffaacc, 0xffff44, 0xaa44ff, 0xff8844]
    for (let i = 0; i < 100; i++) {
      g.fillStyle(flc[rng.integerInRange(0, 3)], 1)
      g.fillCircle(rng.integerInRange(20, WORLD_W - 20), rng.integerInRange(WORLD_H * 0.45, WORLD_H - 60),
        rng.integerInRange(4, 8))
    }
  }

  private drawDeciduousTree(g: Phaser.GameObjects.Graphics, x: number, y: number, h: number) {
    g.fillStyle(0x5a3a10, 1).fillRect(x - h * 0.07, y, h * 0.14, h * 0.35)
    g.fillStyle(0x3a7a2a, 1).fillCircle(x, y - h * 0.12, h * 0.38)
    g.fillStyle(0x4a8c3a, 1).fillCircle(x - h * 0.1, y - h * 0.18, h * 0.28)
    g.fillStyle(0x5a9a4a, 1).fillCircle(x + h * 0.08, y - h * 0.24, h * 0.22)
  }

  private drawSwamp(rng: Phaser.Math.RandomDataGenerator) {
    const g = this.add.graphics().setDepth(0)
    g.fillStyle(0x050f05, 1).fillRect(0, 0, WORLD_W, WORLD_H)
    g.fillStyle(0x1a2e10, 1).fillRect(0, WORLD_H * 0.44, WORLD_W, WORLD_H * 0.56)
    for (let i = 0; i < 22; i++) {
      g.fillStyle(rng.pick([0x1a3020, 0x0d2018]), 0.9)
      g.fillEllipse(rng.integerInRange(60, WORLD_W - 60), rng.integerInRange(WORLD_H * 0.38, WORLD_H * 0.82),
        rng.integerInRange(200, 500), rng.integerInRange(60, 150))
    }
    for (let i = 0; i < 40; i++) {
      const tx = rng.integerInRange(30, WORLD_W - 30)
      const ty = rng.integerInRange(WORLD_H * 0.3, WORLD_H * 0.75)
      const th = rng.integerInRange(80, 200)
      g.fillStyle(0x2a2a1a, 1).fillRect(tx - 8, ty - th, 16, th)
      g.lineStyle(4, 0x2a2a1a, 1).lineBetween(tx, ty - th * 0.6, tx - th * 0.25, ty - th * 0.8)
    }
    g.lineStyle(2, 0x2a4a10, 0.8)
    for (let i = 0; i < 30; i++) {
      g.lineBetween(rng.integerInRange(0, WORLD_W), 0, rng.integerInRange(0, WORLD_W), rng.integerInRange(80, 260))
    }
    for (let i = 0; i < 20; i++) {
      const wx = rng.integerInRange(60, WORLD_W - 60)
      const wy = rng.integerInRange(WORLD_H * 0.3, WORLD_H * 0.75)
      const wisp = this.add.graphics().setDepth(2)
      wisp.fillStyle(0x40e0d0, 0.7).fillCircle(wx, wy, 8)
      this.tweens.add({ targets: wisp, alpha: { from: 0.1, to: 0.9 },
        duration: rng.integerInRange(700, 1600), yoyo: true, repeat: -1 })
    }
  }

  private drawSnow(rng: Phaser.Math.RandomDataGenerator) {
    const g = this.add.graphics().setDepth(0)
    g.fillStyle(0x0a1030, 1).fillRect(0, 0, WORLD_W, WORLD_H)
    for (let i = 0; i < 200; i++) {
      g.fillStyle(0xffffff, 1).fillCircle(rng.integerInRange(0, WORLD_W), rng.integerInRange(0, WORLD_H * 0.4), rng.integerInRange(1, 3))
    }
    g.fillStyle(0xddeeff, 1).fillRect(0, WORLD_H * 0.44, WORLD_W, WORLD_H * 0.56)
    g.fillStyle(0xeef8ff, 1).fillRect(0, WORLD_H * 0.44, WORLD_W, 28)
    g.fillStyle(0xaaddff, 0.55).fillRect(WORLD_W * 0.3, WORLD_H * 0.5, WORLD_W * 0.4, WORLD_H * 0.15)
    g.fillStyle(0xbbddff, 1)
    for (let i = 0; i < 60; i++) {
      const ix = rng.integerInRange(0, WORLD_W); const il = rng.integerInRange(30, 100)
      g.fillTriangle(ix - 8, 0, ix + 8, 0, ix, il)
    }
    for (let i = 0; i < 55; i++) {
      this.drawSnowTree(g, rng.integerInRange(40, WORLD_W - 40), rng.integerInRange(WORLD_H * 0.2, WORLD_H * 0.9),
        rng.integerInRange(60, 150))
    }
    for (let i = 0; i < 150; i++) {
      g.fillStyle(0xffffff, 0.8).fillCircle(rng.integerInRange(0, WORLD_W), rng.integerInRange(WORLD_H * 0.2, WORLD_H), rng.integerInRange(2, 5))
    }
  }

  private drawSnowTree(g: Phaser.GameObjects.Graphics, x: number, y: number, h: number) {
    g.fillStyle(0x3a2a1a, 1).fillRect(x - h * 0.06, y, h * 0.12, h * 0.3)
    g.fillStyle(0x2a3a2a, 1).fillTriangle(x, y - h * 0.7, x - h * 0.32, y + h * 0.02, x + h * 0.32, y + h * 0.02)
    g.fillStyle(0xeef8ff, 1).fillTriangle(x, y - h * 0.65, x - h * 0.26, y - h * 0.14, x + h * 0.26, y - h * 0.14)
  }

  private drawGrassland(rng: Phaser.Math.RandomDataGenerator) {
    const g = this.add.graphics().setDepth(0)
    g.fillStyle(0x4a90d9, 1).fillRect(0, 0, WORLD_W, WORLD_H)
    for (let i = 0; i < 12; i++) {
      g.fillStyle(0xffffff, rng.realInRange(0.6, 0.9))
      const cx = rng.integerInRange(0, WORLD_W); const cy = rng.integerInRange(40, WORLD_H * 0.25)
      g.fillEllipse(cx, cy, rng.integerInRange(120, 300), 60)
    }
    g.fillStyle(0x5aaa2a, 1).fillRect(0, WORLD_H * 0.42, WORLD_W, WORLD_H * 0.58)
    for (let i = 0; i < 10; i++) {
      g.fillStyle(0x4a9a20, 0.3)
      g.fillEllipse(rng.integerInRange(0, WORLD_W), rng.integerInRange(WORLD_H * 0.3, WORLD_H * 0.55),
        rng.integerInRange(600, 1400), rng.integerInRange(120, 280))
    }
    for (let i = 0; i < 250; i++) {
      g.fillStyle(rng.pick([0x4a9a20, 0x3a8a18, 0x5aaa28]), 1)
      const gx = rng.integerInRange(0, WORLD_W); const gy = rng.integerInRange(WORLD_H * 0.44, WORLD_H - 40)
      g.fillRect(gx, gy - rng.integerInRange(20, 50), 5, rng.integerInRange(20, 50))
    }
    const fc = [0xffaacc, 0xffff66, 0xaa66ff, 0xff8844, 0xff4488]
    for (let i = 0; i < 120; i++) {
      g.fillStyle(fc[rng.integerInRange(0, 4)], 1)
      g.fillCircle(rng.integerInRange(20, WORLD_W - 20), rng.integerInRange(WORLD_H * 0.45, WORLD_H - 50), rng.integerInRange(4, 9))
    }
    for (let i = 0; i < 25; i++) {
      const tx = rng.integerInRange(60, WORLD_W - 60); const ty = rng.integerInRange(WORLD_H * 0.2, WORLD_H * 0.7)
      const th = rng.integerInRange(60, 120)
      g.fillStyle(0x5a3a10, 1).fillRect(tx - th * 0.08, ty, th * 0.16, th * 0.4)
      g.fillStyle(0x3a7a20, 1).fillCircle(tx, ty - th * 0.18, th * 0.46)
    }
  }

  private drawTropicalRainforest(rng: Phaser.Math.RandomDataGenerator) {
    const g = this.add.graphics().setDepth(0)
    g.fillStyle(0x042208, 1).fillRect(0, 0, WORLD_W, WORLD_H)
    g.fillStyle(0x0d3a10, 1).fillRect(0, WORLD_H * 0.46, WORLD_W, WORLD_H * 0.54)
    const cc = [0x0d6e1e, 0x1a5e14, 0x0a4e12, 0x157a1a]
    for (let i = 0; i < 50; i++) {
      g.fillStyle(cc[rng.integerInRange(0, 3)], 0.85)
      g.fillEllipse(rng.integerInRange(-100, WORLD_W + 100), rng.integerInRange(-40, WORLD_H * 0.25),
        rng.integerInRange(350, 750), rng.integerInRange(160, 380))
    }
    g.lineStyle(3, 0x1a4a10, 0.85)
    for (let i = 0; i < 40; i++) {
      const vx = rng.integerInRange(30, WORLD_W - 30); let vy = rng.integerInRange(80, 240)
      for (let s = 0; s < rng.integerInRange(8, 16); s++) {
        const nx = vx + rng.integerInRange(-18, 18); const ny = vy + rng.integerInRange(50, 90)
        g.lineBetween(vx, vy, nx, ny); vy = ny
      }
    }
    const flc = [0xff4444, 0xff9900, 0x9933ff, 0xff44aa, 0xff6600]
    for (let i = 0; i < 80; i++) {
      const fx = rng.integerInRange(30, WORLD_W - 30); const fy = rng.integerInRange(WORLD_H * 0.45, WORLD_H - 60)
      g.fillStyle(0x1a5e14, 1).fillRect(fx - 2, fy - 34, 4, 34)
      g.fillStyle(flc[rng.integerInRange(0, 4)], 0.9).fillCircle(fx, fy - 36, rng.integerInRange(10, 20))
    }
    for (let i = 0; i < 35; i++) {
      const ffx = rng.integerInRange(40, WORLD_W - 40); const ffy = rng.integerInRange(WORLD_H * 0.25, WORLD_H * 0.85)
      const fly = this.add.graphics().setDepth(2)
      fly.fillStyle(0xffff44, 0.8).fillCircle(ffx, ffy, 3)
      this.tweens.add({ targets: fly, alpha: { from: 0.1, to: 0.9 },
        duration: rng.integerInRange(500, 1300), yoyo: true, repeat: -1 })
    }
  }

  private drawOcean(rng: Phaser.Math.RandomDataGenerator) {
    const g = this.add.graphics().setDepth(0)
    g.fillStyle(0x0a1a4a, 1).fillRect(0, 0, WORLD_W, WORLD_H)
    g.fillStyle(0x1a3a6a, 1).fillRect(0, WORLD_H * 0.28, WORLD_W, WORLD_H * 0.72)
    for (let i = 0; i < 14; i++) {
      const rx = rng.integerInRange(0, WORLD_W)
      g.fillStyle(0x6ab8ff, 0.05).fillTriangle(rx, 0, rx - 90, WORLD_H, rx + 90, WORLD_H)
    }
    g.lineStyle(3, 0x4a7aaa, 0.5)
    for (let w = 0; w < 30; w++) {
      const wy = rng.integerInRange(WORLD_H * 0.1, WORLD_H * 0.78)
      for (let wx = 0; wx < WORLD_W; wx += 90) {
        g.lineBetween(wx, wy, wx + 45, wy - 10).lineBetween(wx + 45, wy - 10, wx + 90, wy)
      }
    }
    g.fillStyle(0xd4a857, 1).fillRect(0, WORLD_H * 0.87, WORLD_W, WORLD_H * 0.13)
    const coralC = [0xff6688, 0xff9944, 0xff4466, 0xbb44ff, 0xff8844]
    for (let i = 0; i < 50; i++) {
      const cx2 = rng.integerInRange(40, WORLD_W - 40); const cy2 = rng.integerInRange(WORLD_H * 0.78, WORLD_H * 0.93)
      g.fillStyle(coralC[rng.integerInRange(0, 4)], 0.9)
      for (let b = 0; b < rng.integerInRange(3, 8); b++) {
        g.fillCircle(cx2 + rng.integerInRange(-28, 28), cy2 - rng.integerInRange(0, 36), rng.integerInRange(8, 18))
      }
    }
    g.fillStyle(0x1a5a20, 1)
    for (let i = 0; i < 60; i++) {
      const sx = rng.integerInRange(20, WORLD_W - 20); const sy = rng.integerInRange(WORLD_H * 0.75, WORLD_H * 0.9)
      const sh = rng.integerInRange(60, 140)
      for (let s = 0; s < sh; s += 16) g.fillRect(sx + (s % 32 < 16 ? -3 : 3), sy - s, 10, 16)
    }
    for (let i = 0; i < 25; i++) {
      g.fillStyle(0x4a4a5a, 1).fillCircle(rng.integerInRange(60, WORLD_W - 60),
        rng.integerInRange(WORLD_H * 0.55, WORLD_H * 0.9), rng.integerInRange(22, 55))
    }
    const fc2 = [0xff8844, 0xffcc44, 0x44aaff, 0xff4466]
    for (let i = 0; i < 30; i++) {
      const ffx2 = rng.integerInRange(60, WORLD_W - 60); const ffy2 = rng.integerInRange(WORLD_H * 0.15, WORLD_H * 0.78)
      g.fillStyle(fc2[rng.integerInRange(0, 3)], 0.8)
      g.fillEllipse(ffx2, ffy2, 28, 14)
      g.fillTriangle(ffx2 - 14, ffy2, ffx2 - 24, ffy2 - 8, ffx2 - 24, ffy2 + 8)
    }
  }

  private drawFallback() {
    const g = this.add.graphics().setDepth(0)
    g.fillStyle(0x1a1a2e, 1).fillRect(0, 0, WORLD_W, WORLD_H)
  }
}
