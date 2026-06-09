/**
 * BiomeScene — path-based traversal through a biome.
 *
 * The player's character auto-walks a predefined winding path.
 * At each of 3 encounter nodes the walk pauses, an alert fires,
 * then BattleScene is launched on top (scene.launch + scene.pause).
 * BattleScene calls biomeScene.onBattleResult() when done.
 * After all encounters are cleared, a victory screen is shown.
 */

import Phaser from 'phaser'
import type { Socket } from 'socket.io-client'
import type { Subject } from '../../engine/types'
import { GAME_WIDTH, GAME_HEIGHT } from '../constants'
import type { BattleSceneData, BattleResult, MobDef } from './BattleScene'

// ── Types ──────────────────────────────────────────────────────────────────

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
  markerText: Phaser.GameObjects.Text | null
}

type PathState = 'preview' | 'walking' | 'encounter_pause' | 'battling' | 'complete'

// ── Path & biome constants ─────────────────────────────────────────────────

// S-curve winding path from bottom to top of 1280×720
const WAYPOINTS: { x: number; y: number; type: PathNode['type'] }[] = [
  { x: 640, y: 608, type: 'start'     },  // 0 — safe zone (bottom center)
  { x: 320, y: 508, type: 'walk'      },  // 1 — bend left
  { x: 640, y: 398, type: 'encounter' },  // 2 — first encounter (center)
  { x: 960, y: 298, type: 'walk'      },  // 3 — bend right
  { x: 640, y: 198, type: 'encounter' },  // 4 — second encounter (center)
  { x: 320, y: 118, type: 'walk'      },  // 5 — bend left
  { x: 640, y:  58, type: 'encounter' },  // 6 — third encounter (near top)
  { x: 640, y:  58, type: 'end'       },  // 7 — victory position (same as 6)
]

const BIOME_SUBJECT: Record<string, Subject> = {
  'Desert':              'math',
  'Pine Forest':         'science',
  'Deciduous Forest':    'science',
  'Swamp':               'history',
  'Snow':                'math',
  'Grassland':           'language',
  'Tropical Rainforest': 'science',
  'Ocean':               'science',
}

const BIOME_PATH_COLOR: Record<string, number> = {
  'Desert':              0xc4904a,
  'Pine Forest':         0x3a2a10,
  'Deciduous Forest':    0x6a4a20,
  'Swamp':               0x2a3a18,
  'Snow':                0x8899aa,
  'Grassland':           0x8a6a30,
  'Tropical Rainforest': 0x2a3a10,
  'Ocean':               0x3a5a7a,
}

const MOB_NAMES: Record<string, string> = {
  'Desert':              'Desert Scorpion',
  'Pine Forest':         'Forest Wolf',
  'Deciduous Forest':    'Woodland Bear',
  'Swamp':               'Swamp Serpent',
  'Snow':                'Frost Yeti',
  'Grassland':           'Wild Boar',
  'Tropical Rainforest': 'Shadow Panther',
  'Ocean':               'Deep Shark',
}

const MOB_COUNTS: Record<string, [number, number]> = {
  easy:   [4, 5],
  medium: [5, 7],
  hard:   [7, 10],
}

const MOB_HP:   Record<string, number> = { easy: 30, medium: 55, hard: 90 }
const MOB_LVLS: Record<string, [number, number]> = {
  easy: [2, 5], medium: [8, 14], hard: [20, 30],
}
const WALK_SPEED = 150   // pixels per second

// ── BiomeScene ─────────────────────────────────────────────────────────────

export class BiomeScene extends Phaser.Scene {
  private biomeData!: BiomeSceneData
  private pathNodes: PathNode[] = []
  private currentNodeIdx = 0
  private pathState: PathState = 'preview'
  private playerHp = 100
  private playerMaxHp = 100
  private encountersCleared = 0
  private totalXpGained = 0
  private rng!: Phaser.Math.RandomDataGenerator

  // ── GameObjects ───────────────────────────────────────────────────────────
  private playerSprite!: Phaser.GameObjects.Sprite
  private hpGfx!: Phaser.GameObjects.Graphics
  private hpLabel!: Phaser.GameObjects.Text
  private progressText!: Phaser.GameObjects.Text
  private alertText!: Phaser.GameObjects.Text
  private escKey!: Phaser.Input.Keyboard.Key

  constructor() { super({ key: 'BiomeScene' }) }

  init(data: BiomeSceneData) {
    this.biomeData = data
    this.pathState = 'preview'
    this.currentNodeIdx = 0
    this.encountersCleared = 0
    this.totalXpGained = 0
    this.pathNodes = []
  }

  create() {
    const { biome, difficulty } = this.biomeData
    this.rng = new Phaser.Math.RandomDataGenerator([biome + ':' + difficulty])

    // Player HP from registry (or defaults scaled by difficulty)
    this.playerMaxHp = (this.registry.get('maxHp') as number) ?? 100
    this.playerHp    = Math.min(
      (this.registry.get('hp') as number) ?? this.playerMaxHp,
      this.playerMaxHp
    )

    // Draw biome environment
    this.drawBiome(biome, this.rng)

    // Build & draw the path
    this.buildPath()
    this.drawPath()

    // Safe zone at bottom
    this.drawSafeZone()

    // Player sprite at start node
    const start = this.pathNodes[0]
    this.playerSprite = this.add.sprite(start.x, start.y, 'character_idle')
      .setScale(1.5).setDepth(10)
    if (this.anims.exists('idle_down')) this.playerSprite.play('idle_down')

    // HUD
    this.createHUD()

    // Fullscreen alert text (hidden until needed)
    this.alertText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, '', {
      fontSize: '26px', fontFamily: 'Georgia, serif', color: '#ff5544', fontStyle: 'bold',
      backgroundColor: '#00000099', padding: { x: 28, y: 14 },
      align: 'center',
    }).setOrigin(0.5, 0.5).setDepth(200).setVisible(false)

    // ESC key
    this.escKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC)

    // Auto-start the path walk after 1.5 s (gives player time to see the scene)
    this.time.delayedCall(1500, () => {
      this.pathState = 'walking'
      this.advanceToNextNode()
    })
  }

  // ── Path construction ──────────────────────────────────────────────────────

  private buildPath() {
    const { difficulty, biome } = this.biomeData
    const [minMobs, maxMobs] = MOB_COUNTS[difficulty]
    const [minLv, maxLv]    = MOB_LVLS[difficulty]
    const mobHp             = MOB_HP[difficulty]
    const mobName           = MOB_NAMES[biome] ?? 'Enemy'

    this.pathNodes = WAYPOINTS.map(wp => {
      const node: PathNode = {
        ...wp,
        cleared: false,
        markerGfx: null,
        markerText: null,
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

  // ── Path visual ────────────────────────────────────────────────────────────

  private drawPath() {
    const pathColor = BIOME_PATH_COLOR[this.biomeData.biome] ?? 0x8a6a40
    const pathGfx   = this.add.graphics().setDepth(2)

    // Draw trail segments
    for (let i = 0; i < WAYPOINTS.length - 1; i++) {
      const a = WAYPOINTS[i]
      const b = WAYPOINTS[i + 1]
      if (a.x === b.x && a.y === b.y) continue  // skip the end-duplicate

      // Drop shadow
      pathGfx.lineStyle(14, 0x000000, 0.25)
      pathGfx.lineBetween(a.x + 3, a.y + 3, b.x + 3, b.y + 3)
      // Base
      pathGfx.lineStyle(10, pathColor, 0.8)
      pathGfx.lineBetween(a.x, a.y, b.x, b.y)
      // Centre highlight
      pathGfx.lineStyle(3, 0xffffff, 0.1)
      pathGfx.lineBetween(a.x, a.y, b.x, b.y)
    }

    // Draw encounter & end markers
    this.pathNodes.forEach((node, i) => {
      if (node.type === 'encounter') this.drawEncounterMarker(i)
      if (node.type === 'end')       this.drawEndMarker(node)
    })
  }

  private drawEncounterMarker(nodeIdx: number) {
    const node = this.pathNodes[nodeIdx]
    node.markerGfx?.destroy()
    node.markerText?.destroy()

    const g = this.add.graphics().setDepth(6)
    node.markerGfx = g

    if (node.cleared) {
      g.fillStyle(0x44aa44, 0.35)
      g.fillCircle(node.x, node.y, 26)
      g.lineStyle(2, 0x44ff44, 0.8)
      g.strokeCircle(node.x, node.y, 26)
      node.markerText = this.add.text(node.x, node.y, '✓', {
        fontSize: '22px', color: '#44ff44', fontStyle: 'bold',
      }).setOrigin(0.5, 0.5).setDepth(7)
    } else {
      g.fillStyle(0xaa2222, 0.3)
      g.fillCircle(node.x, node.y, 30)
      g.lineStyle(2, 0xff4444, 0.75)
      g.strokeCircle(node.x, node.y, 30)
      g.fillStyle(0xff4444, 0.65)
      g.fillCircle(node.x, node.y, 10)

      const count = node.mobs?.length ?? 0
      node.markerText = this.add.text(node.x, node.y + 40, `${count} enemies`, {
        fontSize: '10px', fontFamily: 'Arial', color: '#ff8888',
        backgroundColor: '#00000099', padding: { x: 4, y: 2 },
      }).setOrigin(0.5, 0.5).setDepth(7)

      this.tweens.add({
        targets: g,
        alpha: { from: 1, to: 0.5 },
        duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      })
    }
  }

  private drawEndMarker(node: PathNode) {
    const g = this.add.graphics().setDepth(6)
    g.fillStyle(0xffd700, 0.25)
    g.fillCircle(node.x, node.y, 28)
    g.lineStyle(3, 0xffd700, 0.85)
    g.strokeCircle(node.x, node.y, 28)
    this.add.text(node.x, node.y, '🏆', { fontSize: '18px' })
      .setOrigin(0.5, 0.5).setDepth(7)
    this.add.text(node.x, node.y + 38, 'EXIT', {
      fontSize: '10px', fontFamily: 'Arial', color: '#ffd700',
      backgroundColor: '#00000099', padding: { x: 4, y: 2 },
    }).setOrigin(0.5, 0.5).setDepth(7)
    this.tweens.add({
      targets: g, alpha: { from: 0.8, to: 0.35 },
      duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    })
  }

  // ── Path traversal ─────────────────────────────────────────────────────────

  private advanceToNextNode() {
    if (this.currentNodeIdx >= this.pathNodes.length - 1) {
      this.pathState = 'complete'
      this.showVictoryScreen()
      return
    }

    const from = this.pathNodes[this.currentNodeIdx]
    const to   = this.pathNodes[this.currentNodeIdx + 1]

    if (from.x === to.x && from.y === to.y) {
      // End-duplicate waypoint — just trigger completion
      this.currentNodeIdx++
      this.onReachedNode()
      return
    }

    // Set walk animation based on direction
    const dx = to.x - from.x
    const dy = to.y - from.y
    let dir = 'up'
    if (Math.abs(dy) >= Math.abs(dx)) dir = dy > 0 ? 'down' : 'up'
    else                               dir = dx > 0 ? 'right' : 'left'
    if (this.anims.exists(`walk_${dir}`)) this.playerSprite.play(`walk_${dir}`)

    const dist = Phaser.Math.Distance.Between(from.x, from.y, to.x, to.y)
    const dur  = (dist / WALK_SPEED) * 1000

    this.tweens.add({
      targets: this.playerSprite,
      x: to.x,
      y: to.y,
      duration: dur,
      ease: 'Linear',
      onComplete: () => {
        this.currentNodeIdx++
        this.onReachedNode()
      },
    })
  }

  private onReachedNode() {
    const node = this.pathNodes[this.currentNodeIdx]

    // Switch to idle, facing the direction we were walking
    const walkKey = this.playerSprite.anims.currentAnim?.key ?? 'walk_up'
    const dir = walkKey.replace('walk_', '')
    if (this.anims.exists(`idle_${dir}`)) this.playerSprite.play(`idle_${dir}`)

    if (node.type === 'encounter' && !node.cleared) {
      this.pathState = 'encounter_pause'
      this.triggerEncounterAlert(node)
    } else if (node.type === 'end') {
      this.pathState = 'complete'
      this.showVictoryScreen()
    } else {
      // Walk or start node — pause briefly then continue
      this.time.delayedCall(350, () => {
        this.pathState = 'walking'
        this.advanceToNextNode()
      })
    }
  }

  private triggerEncounterAlert(node: PathNode) {
    const count = node.mobs?.length ?? 0
    this.alertText
      .setText(`⚔  ${count} Enemies Encountered!\nPrepare for battle!`)
      .setVisible(true)

    this.cameras.main.shake(500, 0.008)
    this.cameras.main.flash(350, 255, 50, 50)

    // Auto-launch battle after 2 s
    this.time.delayedCall(2000, () => {
      this.alertText.setVisible(false)
      this.launchBattle(node)
    })
  }

  private launchBattle(node: PathNode) {
    const encIdx = this.pathNodes
      .filter(n => n.type === 'encounter')
      .findIndex(n => n === node)

    const totalEnc = this.pathNodes.filter(n => n.type === 'encounter').length

    const data: BattleSceneData = {
      biome:            this.biomeData.biome,
      difficulty:       this.biomeData.difficulty,
      subject:          BIOME_SUBJECT[this.biomeData.biome] ?? 'math',
      mobs:             node.mobs ?? [],
      encounterIndex:   encIdx,
      totalEncounters:  totalEnc,
      playerHp:         this.playerHp,
      playerMaxHp:      this.playerMaxHp,
    }

    this.scene.launch('BattleScene', data)
    this.scene.pause()
  }

  /** Called by BattleScene after it finishes. */
  public onBattleResult(result: BattleResult) {
    if (!result.victory) {
      this.showDefeatOverlay()
      return
    }

    this.playerHp = result.playerHp
    this.totalXpGained += result.xpGained
    this.encountersCleared++

    // Mark node cleared and redraw its marker
    const node = this.pathNodes[this.currentNodeIdx]
    node.cleared = true
    this.drawEncounterMarker(this.currentNodeIdx)

    this.updateHUD()
    this.cameras.main.flash(400, 255, 215, 0)

    // Continue down the path
    this.pathState = 'walking'
    this.time.delayedCall(600, () => this.advanceToNextNode())
  }

  // ── HUD ────────────────────────────────────────────────────────────────────

  private createHUD() {
    const { biome, location, difficulty } = this.biomeData

    // Bottom bar
    const hudBg = this.add.graphics().setScrollFactor(0).setDepth(100)
    hudBg.fillStyle(0x000000, 0.65)
    hudBg.fillRect(0, GAME_HEIGHT - 44, GAME_WIDTH, 44)
    hudBg.lineStyle(1, 0xffd700, 0.6)
    hudBg.lineBetween(0, GAME_HEIGHT - 44, GAME_WIDTH, GAME_HEIGHT - 44)

    const diffColors: Record<string, string> = {
      easy: '#44cc44', medium: '#ffcc00', hard: '#ff4444',
    }

    this.add.text(12, GAME_HEIGHT - 22, `${biome}  |  ${location}`, {
      fontSize: '13px', fontFamily: 'Georgia, serif', color: '#ffd700',
    }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(101)

    this.add.text(
      12 + (biome.length + location.length + 5) * 8 + 14,
      GAME_HEIGHT - 22,
      difficulty.toUpperCase(),
      {
        fontSize: '11px', fontFamily: 'Arial', color: diffColors[difficulty],
        backgroundColor: '#00000088', padding: { x: 5, y: 2 },
      }
    ).setOrigin(0, 0.5).setScrollFactor(0).setDepth(101)

    this.add.text(GAME_WIDTH - 12, GAME_HEIGHT - 22, 'ESC — Return to World', {
      fontSize: '12px', fontFamily: 'Arial', color: '#aaaaaa',
    }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(101)

    // Player HP bar (top-left)
    this.add.graphics().setScrollFactor(0).setDepth(100)
      .fillStyle(0x000000, 0.6)
      .fillRoundedRect(8, 8, 220, 30, 6)

    this.hpGfx = this.add.graphics().setScrollFactor(0).setDepth(101)
    this.hpLabel = this.add.text(12, 23, '', {
      fontSize: '11px', fontFamily: 'Arial', color: '#ffffff',
    }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(102)

    // Encounter progress (top-right)
    this.progressText = this.add.text(GAME_WIDTH - 12, 23, '', {
      fontSize: '11px', fontFamily: 'Arial', color: '#ffd700',
    }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(102)

    this.updateHUD()
  }

  private updateHUD() {
    // HP bar
    this.hpGfx.clear()
    const pct   = Math.max(0, this.playerHp / this.playerMaxHp)
    const barW  = 200
    this.hpGfx.fillStyle(0x333333, 1)
    this.hpGfx.fillRoundedRect(10, 14, barW, 16, 4)
    const color = pct > 0.5 ? 0x44cc44 : pct > 0.25 ? 0xffcc00 : 0xff4444
    this.hpGfx.fillStyle(color, 1)
    this.hpGfx.fillRoundedRect(10, 14, Math.round(barW * pct), 16, 4)
    this.hpLabel.setText(`HP  ${this.playerHp} / ${this.playerMaxHp}`)

    // Progress
    const total = this.pathNodes.filter(n => n.type === 'encounter').length
    this.progressText.setText(`Encounters: ${this.encountersCleared} / ${total}`)
  }

  // ── End screens ────────────────────────────────────────────────────────────

  private showVictoryScreen() {
    // Award any remaining XP to server
    if (this.totalXpGained > 0) {
      const socket = (window as typeof window & { __lumenSocket?: Socket }).__lumenSocket
      socket?.emit('player:award_xp', { xp: Math.min(this.totalXpGained, 500), awardShard: false })
    }

    this.cameras.main.flash(700, 255, 215, 0)

    const W = 560, H = 280, cx = GAME_WIDTH / 2, cy = GAME_HEIGHT / 2
    const bg = this.add.graphics().setDepth(190)
    bg.fillStyle(0x000000, 0.88)
    bg.fillRoundedRect(cx - W / 2, cy - H / 2, W, H, 16)
    bg.lineStyle(2, 0xffd700, 1)
    bg.strokeRoundedRect(cx - W / 2, cy - H / 2, W, H, 16)

    this.add.text(cx, cy - H / 2 + 40, '🏆  Biome Cleared!', {
      fontSize: '30px', fontFamily: 'Georgia, serif', color: '#ffd700', fontStyle: 'bold',
    }).setOrigin(0.5, 0.5).setDepth(200)

    const enc = this.encountersCleared
    this.add.text(cx, cy - 20, `${enc} encounter${enc !== 1 ? 's' : ''} conquered`, {
      fontSize: '16px', fontFamily: 'Arial', color: '#aaaaaa',
    }).setOrigin(0.5, 0.5).setDepth(200)

    this.add.text(cx, cy + 20, `+${this.totalXpGained} XP earned`, {
      fontSize: '22px', fontFamily: 'Georgia, serif', color: '#44ffaa', fontStyle: 'bold',
    }).setOrigin(0.5, 0.5).setDepth(200)

    const btn = this.add.text(cx, cy + H / 2 - 34, 'Return to World', {
      fontSize: '18px', fontFamily: 'Georgia, serif', color: '#ffffff', fontStyle: 'bold',
      backgroundColor: '#2a1060', padding: { x: 24, y: 12 },
    }).setOrigin(0.5, 0.5).setDepth(200).setInteractive({ useHandCursor: true })

    btn.on('pointerover', () => btn.setColor('#ffd700'))
    btn.on('pointerout',  () => btn.setColor('#ffffff'))
    btn.on('pointerdown', () => this.returnToWorld())
  }

  private showDefeatOverlay() {
    const W = 480, H = 220, cx = GAME_WIDTH / 2, cy = GAME_HEIGHT / 2
    const bg = this.add.graphics().setDepth(190)
    bg.fillStyle(0x000000, 0.9)
    bg.fillRoundedRect(cx - W / 2, cy - H / 2, W, H, 16)
    bg.lineStyle(2, 0xff4444, 1)
    bg.strokeRoundedRect(cx - W / 2, cy - H / 2, W, H, 16)

    this.add.text(cx, cy - H / 2 + 38, '💀  Defeated!', {
      fontSize: '30px', fontFamily: 'Georgia, serif', color: '#ff5544', fontStyle: 'bold',
    }).setOrigin(0.5, 0.5).setDepth(200)

    this.add.text(cx, cy + 8, 'You have been driven back to town.', {
      fontSize: '15px', fontFamily: 'Arial', color: '#aaaaaa',
    }).setOrigin(0.5, 0.5).setDepth(200)

    this.time.delayedCall(2200, () => this.returnToWorld())
  }

  private returnToWorld() {
    this.scene.start('WorldScene', {
      spawnX: this.biomeData.returnX,
      spawnY: this.biomeData.returnY,
    })
    this.scene.launch('UIScene')
  }

  // ── Update ─────────────────────────────────────────────────────────────────

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
  // ── Biome drawing methods (unchanged) ────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════

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

  private drawSafeZone() {
    const g = this.add.graphics().setDepth(1)
    g.fillStyle(0xffffff, 0.12)
    g.fillEllipse(640, 620, 260, 80)
    for (const tx of [520, 760]) {
      g.fillStyle(0x7a5a30, 1)
      g.fillRect(tx - 3, 578, 6, 28)
      g.fillStyle(0xff8800, 0.9)
      g.fillCircle(tx, 573, 7)
      g.fillStyle(0xffee00, 0.7)
      g.fillCircle(tx, 571, 4)
      g.fillStyle(0xff8800, 0.15)
      g.fillCircle(tx, 573, 20)
    }
  }

  // ── Desert ──────────────────────────────────────────────────────────────

  private drawDesert(rng: Phaser.Math.RandomDataGenerator) {
    const g = this.add.graphics().setDepth(0)
    g.fillStyle(0x87ceeb, 1)
    g.fillRect(0, 0, GAME_WIDTH, 300)
    g.fillStyle(0xf4c87a, 1)
    g.fillRect(0, 300, GAME_WIDTH, GAME_HEIGHT - 300)
    const sandColors = [0xe8b84b, 0xe8c060, 0xd4a040]
    for (let i = 0; i < 60; i++) {
      g.fillStyle(sandColors[rng.integerInRange(0, 2)], 0.5)
      g.fillRect(rng.integerInRange(0, GAME_WIDTH), rng.integerInRange(200, GAME_HEIGHT),
        rng.integerInRange(20, 60), rng.integerInRange(8, 20))
    }
    g.fillStyle(0xffe040, 0.9)
    g.fillCircle(1160, 60, 48)
    g.fillStyle(0xfff080, 0.5)
    g.fillCircle(1160, 60, 60)
    for (let i = 0; i < rng.integerInRange(2, 4); i++) {
      g.fillStyle(0xd4a040, 0.6)
      g.fillEllipse(rng.integerInRange(100, GAME_WIDTH - 100),
        rng.integerInRange(260, 520),
        rng.integerInRange(180, 320), rng.integerInRange(40, 80))
    }
    for (let i = 0; i < rng.integerInRange(4, 8); i++) {
      this.drawCactus(g, rng.integerInRange(60, GAME_WIDTH - 60), rng.integerInRange(150, 500))
    }
    g.fillStyle(0xf0e8d0, 1)
    for (let i = 0; i < 12; i++) {
      g.fillRect(rng.integerInRange(40, GAME_WIDTH - 40), rng.integerInRange(200, 600),
        rng.integerInRange(4, 8), rng.integerInRange(3, 5))
    }
  }

  private drawCactus(g: Phaser.GameObjects.Graphics, x: number, y: number) {
    g.fillStyle(0x3a7a20, 1)
    g.fillRect(x - 4, y - 32, 8, 32)
    g.fillRect(x - 14, y - 20, 14, 6)
    g.fillRect(x - 14, y - 24, 4, 10)
    g.fillRect(x, y - 18, 14, 6)
    g.fillRect(x + 10, y - 22, 4, 10)
  }

  // ── Pine Forest ─────────────────────────────────────────────────────────

  private drawPineForest(rng: Phaser.Math.RandomDataGenerator) {
    const g = this.add.graphics().setDepth(0)
    g.fillStyle(0x0a1a0d, 1)
    g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)
    g.fillStyle(0x1a4a20, 1)
    g.fillRect(0, 360, GAME_WIDTH, GAME_HEIGHT - 360)
    g.fillStyle(0x0f3015, 1)
    for (let i = 0; i < 50; i++) {
      g.fillRect(rng.integerInRange(0, GAME_WIDTH), rng.integerInRange(360, GAME_HEIGHT - 80),
        rng.integerInRange(4, 12), rng.integerInRange(2, 5))
    }
    for (let i = 0; i < 6; i++) {
      g.fillStyle(0xffffff, rng.realInRange(0.05, 0.18))
      g.fillEllipse(rng.integerInRange(0, GAME_WIDTH), rng.integerInRange(400, 620),
        rng.integerInRange(120, 260), rng.integerInRange(20, 50))
    }
    for (let i = 0; i < rng.integerInRange(8, 14); i++) {
      this.drawPineTree(g, rng.integerInRange(40, GAME_WIDTH - 40), rng.integerInRange(60, 460))
    }
    for (let i = 0; i < rng.integerInRange(3, 5); i++) {
      const bx = rng.integerInRange(60, GAME_WIDTH - 60)
      const by = rng.integerInRange(200, 550)
      const br = rng.integerInRange(14, 24)
      g.fillStyle(0x4a4a4a, 1)
      g.fillCircle(bx, by, br)
      g.fillStyle(0x6a6a6a, 1)
      g.fillCircle(bx - 4, by - 4, br / 3)
    }
    for (let i = 0; i < 8; i++) {
      const mx = rng.integerInRange(40, GAME_WIDTH - 40)
      const my = rng.integerInRange(380, 580)
      g.fillStyle(0xd4a855, 1)
      g.fillRect(mx - 2, my - 6, 4, 8)
      g.fillStyle(0xcc4444, 1)
      g.fillCircle(mx, my - 7, 7)
      g.fillStyle(0xffffff, 1)
      g.fillCircle(mx - 2, my - 8, 1)
      g.fillCircle(mx + 2, my - 6, 1)
    }
  }

  private drawPineTree(g: Phaser.GameObjects.Graphics, x: number, y: number) {
    g.fillStyle(0x5a3a10, 1)
    g.fillRect(x - 4, y, 8, 20)
    const colors = [0x1a5c2a, 0x154a22, 0x0d3a14]
    const tiers = [[36, 28], [28, 20], [20, 12]]
    for (let t = 0; t < 3; t++) {
      const [w] = tiers[t]
      g.fillStyle(colors[t], 1)
      g.fillTriangle(x, y - 20 - t * 18, x - w / 2, y - 2 - t * 18, x + w / 2, y - 2 - t * 18)
    }
  }

  // ── Deciduous Forest ────────────────────────────────────────────────────

  private drawDeciduousForest(rng: Phaser.Math.RandomDataGenerator) {
    const g = this.add.graphics().setDepth(0)
    g.fillStyle(0x4a7a4a, 1)
    g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)
    g.fillStyle(0x3a6a20, 1)
    g.fillRect(0, 340, GAME_WIDTH, GAME_HEIGHT - 340)
    for (let i = 0; i < 10; i++) {
      g.fillStyle(0x4a8a30, 0.3)
      g.fillEllipse(rng.integerInRange(0, GAME_WIDTH), rng.integerInRange(350, 640),
        rng.integerInRange(60, 160), rng.integerInRange(20, 60))
    }
    for (let i = 0; i < 4; i++) {
      const lx = rng.integerInRange(80, GAME_WIDTH - 80)
      const ly = rng.integerInRange(380, 580)
      g.fillStyle(0x6a3a10, 1)
      g.fillRect(lx - 40, ly - 6, 80, 12)
      g.fillStyle(0x8a5a20, 1)
      g.fillRect(lx - 40, ly - 6, 6, 12)
    }
    for (let i = 0; i < rng.integerInRange(6, 10); i++) {
      this.drawDeciduousTree(g, rng.integerInRange(50, GAME_WIDTH - 50), rng.integerInRange(80, 480))
    }
    const fc = [0xffaacc, 0xffff44, 0xaa44ff, 0xff8844]
    for (let i = 0; i < 20; i++) {
      g.fillStyle(fc[rng.integerInRange(0, 3)], 1)
      g.fillCircle(rng.integerInRange(20, GAME_WIDTH - 20), rng.integerInRange(360, 620),
        rng.integerInRange(2, 4))
    }
  }

  private drawDeciduousTree(g: Phaser.GameObjects.Graphics, x: number, y: number) {
    g.fillStyle(0x5a3a10, 1)
    g.fillRect(x - 5, y, 10, 26)
    g.fillStyle(0x3a7a2a, 1)
    g.fillCircle(x, y - 10, 28)
    g.fillStyle(0x4a8c3a, 1)
    g.fillCircle(x - 8, y - 14, 20)
    g.fillStyle(0x5a9a4a, 1)
    g.fillCircle(x + 6, y - 18, 16)
  }

  // ── Swamp ───────────────────────────────────────────────────────────────

  private drawSwamp(rng: Phaser.Math.RandomDataGenerator) {
    const g = this.add.graphics().setDepth(0)
    g.fillStyle(0x050f05, 1)
    g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)
    g.fillStyle(0x1a2e10, 1)
    g.fillRect(0, 320, GAME_WIDTH, GAME_HEIGHT - 320)
    for (let i = 0; i < 6; i++) {
      const wx = rng.integerInRange(60, GAME_WIDTH - 60)
      const wy = rng.integerInRange(280, 560)
      g.fillStyle(rng.pick([0x1a3020, 0x0d2018]), 0.9)
      g.fillEllipse(wx, wy, rng.integerInRange(80, 160), rng.integerInRange(30, 60))
      for (let p = 0; p < rng.integerInRange(1, 4); p++) {
        g.fillStyle(0x2a4a15, 1)
        g.fillCircle(wx + rng.integerInRange(-40, 40), wy + rng.integerInRange(-10, 10),
          rng.integerInRange(5, 10))
      }
    }
    g.lineStyle(2, 0x2a3a1a, 1)
    for (let i = 0; i < 14; i++) {
      g.lineBetween(rng.integerInRange(0, GAME_WIDTH), 0,
        rng.integerInRange(0, GAME_WIDTH), rng.integerInRange(60, 180))
    }
    for (let i = 0; i < 7; i++) {
      const tx = rng.integerInRange(30, GAME_WIDTH - 30)
      const ty = rng.integerInRange(200, 520)
      g.fillStyle(0x2a2a1a, 1)
      g.fillRect(tx - 4, ty - 80, 8, 80)
      g.lineStyle(3, 0x2a2a1a, 1)
      g.lineBetween(tx, ty - 60, tx - 24, ty - 80)
      g.lineBetween(tx, ty - 45, tx + 20, ty - 62)
    }
    for (let i = 0; i < 8; i++) {
      g.fillStyle(0xffffff, 0.04)
      g.fillRect(rng.integerInRange(0, GAME_WIDTH - 200), rng.integerInRange(540, 660),
        rng.integerInRange(100, 300), 24)
    }
    for (let i = 0; i < 12; i++) {
      g.fillStyle(0xffffff, 0.35)
      g.fillCircle(rng.integerInRange(40, GAME_WIDTH - 40), rng.integerInRange(300, 600),
        rng.integerInRange(2, 5))
    }
    for (let i = 0; i < 5; i++) {
      const wx = rng.integerInRange(60, GAME_WIDTH - 60)
      const wy = rng.integerInRange(200, 500)
      const wisp = this.add.graphics().setDepth(2)
      wisp.fillStyle(0x40e0d0, 0.6)
      wisp.fillCircle(wx, wy, 5)
      this.tweens.add({
        targets: wisp, alpha: { from: 0.2, to: 0.8 },
        duration: rng.integerInRange(800, 1600), yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      })
    }
  }

  // ── Snow ────────────────────────────────────────────────────────────────

  private drawSnow(rng: Phaser.Math.RandomDataGenerator) {
    const g = this.add.graphics().setDepth(0)
    g.fillStyle(0x0a1030, 1)
    g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)
    g.fillStyle(0xffffff, 1)
    for (let i = 0; i < 50; i++) {
      g.fillCircle(rng.integerInRange(0, GAME_WIDTH), rng.integerInRange(0, 280),
        rng.integerInRange(1, 2))
    }
    g.fillStyle(0xddeeff, 1)
    g.fillRect(0, 320, GAME_WIDTH, GAME_HEIGHT - 320)
    g.fillStyle(0xeef8ff, 1)
    g.fillRect(0, 320, GAME_WIDTH, 18)
    g.fillStyle(0xaaddff, 0.5)
    g.fillRect(400, 380, 380, 120)
    g.lineStyle(1, 0x88bbdd, 0.7)
    g.lineBetween(430, 420, 490, 460)
    g.lineBetween(610, 390, 650, 440)
    g.lineBetween(700, 430, 760, 480)
    g.fillStyle(0xbbddff, 1)
    for (let i = 0; i < 18; i++) {
      const ix = rng.integerInRange(0, GAME_WIDTH)
      const il = rng.integerInRange(16, 50)
      g.fillTriangle(ix - 5, 0, ix + 5, 0, ix, il)
    }
    g.fillStyle(0xffffff, 0.85)
    for (let i = 0; i < 40; i++) {
      g.fillCircle(rng.integerInRange(0, GAME_WIDTH), rng.integerInRange(100, 680),
        rng.integerInRange(1, 3))
    }
    for (let i = 0; i < rng.integerInRange(5, 8); i++) {
      this.drawSnowTree(g, rng.integerInRange(40, GAME_WIDTH - 40), rng.integerInRange(100, 480))
    }
    g.fillStyle(0xc8ddf0, 1)
    for (let i = 0; i < 15; i++) {
      g.fillEllipse(rng.integerInRange(100, GAME_WIDTH - 100), rng.integerInRange(360, 600), 8, 5)
    }
  }

  private drawSnowTree(g: Phaser.GameObjects.Graphics, x: number, y: number) {
    g.fillStyle(0x3a2a1a, 1)
    g.fillRect(x - 4, y, 8, 22)
    g.fillStyle(0x2a3a2a, 1)
    g.fillTriangle(x, y - 50, x - 22, y + 2, x + 22, y + 2)
    g.fillStyle(0xeef8ff, 1)
    g.fillTriangle(x, y - 46, x - 18, y - 10, x + 18, y - 10)
  }

  // ── Grassland ───────────────────────────────────────────────────────────

  private drawGrassland(rng: Phaser.Math.RandomDataGenerator) {
    const g = this.add.graphics().setDepth(0)
    g.fillStyle(0x4a90d9, 1)
    g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)
    g.fillStyle(0x5aaa2a, 1)
    g.fillRect(0, 300, GAME_WIDTH, GAME_HEIGHT - 300)
    for (let i = 0; i < 4; i++) {
      g.fillStyle(0x4a9a20, 0.3)
      g.fillEllipse(rng.integerInRange(0, GAME_WIDTH), rng.integerInRange(260, 400),
        rng.integerInRange(280, 500), rng.integerInRange(60, 120))
    }
    for (let i = 0; i < 60; i++) {
      const gc = rng.pick([0x4a9a20, 0x3a8a18])
      g.fillStyle(gc, 1)
      const gx = rng.integerInRange(0, GAME_WIDTH)
      const gy = rng.integerInRange(310, 640)
      g.fillRect(gx, gy - rng.integerInRange(10, 22), 3, rng.integerInRange(10, 22))
    }
    const fc = [0xffaacc, 0xffff66, 0xaa66ff, 0xff8844, 0xff4488]
    for (let i = 0; i < 28; i++) {
      g.fillStyle(fc[rng.integerInRange(0, 4)], 1)
      g.fillCircle(rng.integerInRange(20, GAME_WIDTH - 20), rng.integerInRange(320, 640),
        rng.integerInRange(2, 4))
    }
    for (let i = 0; i < rng.integerInRange(3, 5); i++) {
      const tx = rng.integerInRange(60, GAME_WIDTH - 60)
      const ty = rng.integerInRange(100, 440)
      g.fillStyle(0x5a3a10, 1)
      g.fillRect(tx - 6, ty, 12, 30)
      g.fillStyle(0x3a7a20, 1)
      g.fillCircle(tx, ty - 16, 34)
      g.fillStyle(0x4a8a28, 1)
      g.fillCircle(tx - 8, ty - 20, 22)
    }
    for (let i = 0; i < 6; i++) {
      const bx = rng.integerInRange(80, GAME_WIDTH - 80)
      const by = rng.integerInRange(200, 500)
      const bc = fc[rng.integerInRange(0, 4)]
      g.fillStyle(bc, 0.8)
      g.fillTriangle(bx - 8, by, bx, by - 6, bx, by + 6)
      g.fillTriangle(bx + 8, by, bx, by - 6, bx, by + 6)
    }
  }

  // ── Tropical Rainforest ─────────────────────────────────────────────────

  private drawTropicalRainforest(rng: Phaser.Math.RandomDataGenerator) {
    const g = this.add.graphics().setDepth(0)
    g.fillStyle(0x042208, 1)
    g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)
    g.fillStyle(0x0d3a10, 1)
    g.fillRect(0, 340, GAME_WIDTH, GAME_HEIGHT - 340)
    g.lineStyle(2, 0x4a2a08, 0.7)
    for (let i = 0; i < 10; i++) {
      const rx = rng.integerInRange(60, GAME_WIDTH - 60)
      const ry = rng.integerInRange(380, 630)
      g.lineBetween(rx, ry, rx + rng.integerInRange(-40, 40), ry + rng.integerInRange(-20, 20))
    }
    const cc = [0x0d6e1e, 0x1a5e14, 0x0a4e12, 0x157a1a]
    for (let i = 0; i < 16; i++) {
      g.fillStyle(cc[rng.integerInRange(0, 3)], 0.85)
      g.fillEllipse(rng.integerInRange(-60, GAME_WIDTH + 60), rng.integerInRange(-20, 140),
        rng.integerInRange(160, 320), rng.integerInRange(80, 160))
    }
    g.lineStyle(2, 0x1a4a10, 0.8)
    for (let i = 0; i < 12; i++) {
      const vx = rng.integerInRange(30, GAME_WIDTH - 30)
      let vy = rng.integerInRange(80, 200)
      for (let s = 0; s < rng.integerInRange(6, 12); s++) {
        const nx = vx + rng.integerInRange(-10, 10)
        const ny = vy + rng.integerInRange(30, 50)
        g.lineBetween(vx, vy, nx, ny)
        vy = ny
      }
    }
    g.fillStyle(0x1a7a5a, 0.8)
    g.fillCircle(rng.integerInRange(200, 800), rng.integerInRange(430, 560),
      rng.integerInRange(40, 70))
    g.lineStyle(1, 0x2a9a7a, 0.4)
    const px = rng.integerInRange(200, 800), py = rng.integerInRange(430, 560)
    for (let r = 1; r <= 3; r++) g.strokeCircle(px, py, r * 18)
    const flc = [0xff4444, 0xff9900, 0x9933ff, 0xff44aa]
    for (let i = 0; i < 14; i++) {
      const fx = rng.integerInRange(30, GAME_WIDTH - 30)
      const fy = rng.integerInRange(360, 600)
      g.fillStyle(0x1a5e14, 1)
      g.fillRect(fx - 1, fy - 20, 2, 20)
      g.fillStyle(flc[rng.integerInRange(0, 3)], 0.9)
      g.fillCircle(fx, fy - 22, rng.integerInRange(7, 12))
    }
    for (let i = 0; i < 10; i++) {
      const ffx = rng.integerInRange(40, GAME_WIDTH - 40)
      const ffy = rng.integerInRange(200, 600)
      const fly = this.add.graphics().setDepth(2)
      fly.fillStyle(0xffff44, 0.7)
      fly.fillCircle(ffx, ffy, 2)
      this.tweens.add({
        targets: fly, alpha: { from: 0.1, to: 0.9 },
        duration: rng.integerInRange(600, 1400), yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      })
    }
  }

  // ── Ocean ───────────────────────────────────────────────────────────────

  private drawOcean(rng: Phaser.Math.RandomDataGenerator) {
    const g = this.add.graphics().setDepth(0)
    g.fillStyle(0x0a1a4a, 1)
    g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)
    g.fillStyle(0x1a3a6a, 1)
    g.fillRect(0, 200, GAME_WIDTH, GAME_HEIGHT - 200)
    g.fillStyle(0x1a6eb5, 0.7)
    g.fillRect(0, 0, GAME_WIDTH, 80)
    for (let i = 0; i < 8; i++) {
      const rx = rng.integerInRange(0, GAME_WIDTH)
      g.fillStyle(0x6ab8ff, 0.06)
      g.fillTriangle(rx, 0, rx - 60, GAME_HEIGHT, rx + 60, GAME_HEIGHT)
    }
    g.lineStyle(2, 0x4a7aaa, 0.5)
    for (let w = 0; w < 12; w++) {
      const wy = rng.integerInRange(80, 560)
      for (let wx = 0; wx < GAME_WIDTH; wx += 60) {
        g.lineBetween(wx, wy, wx + 30, wy - 6)
        g.lineBetween(wx + 30, wy - 6, wx + 60, wy)
      }
    }
    g.fillStyle(0xd4a857, 1)
    g.fillRect(0, 630, GAME_WIDTH, 90)
    g.fillStyle(0xc89040, 1)
    g.fillRect(0, 630, GAME_WIDTH, 12)
    const coralC = [0xff6688, 0xff9944, 0xff4466, 0xbb44ff, 0xff8844]
    for (let i = 0; i < 12; i++) {
      const cx = rng.integerInRange(40, GAME_WIDTH - 40)
      const cy = rng.integerInRange(560, 640)
      g.fillStyle(coralC[rng.integerInRange(0, 4)], 0.9)
      for (let b = 0; b < rng.integerInRange(2, 5); b++) {
        g.fillCircle(cx + rng.integerInRange(-16, 16), cy - rng.integerInRange(0, 20),
          rng.integerInRange(5, 10))
      }
    }
    g.fillStyle(0x1a5a20, 1)
    for (let i = 0; i < 14; i++) {
      const sx = rng.integerInRange(20, GAME_WIDTH - 20)
      const sy = rng.integerInRange(520, 640)
      const sh = rng.integerInRange(30, 70)
      for (let s = 0; s < sh; s += 8) {
        g.fillRect(sx + (s % 16 < 8 ? -2 : 2), sy - s, 6, 8)
      }
    }
    for (let i = 0; i < 5; i++) {
      const rx = rng.integerInRange(60, GAME_WIDTH - 60)
      const ry = rng.integerInRange(400, 620)
      const rr = rng.integerInRange(18, 34)
      g.fillStyle(0x4a4a5a, 1)
      g.fillCircle(rx, ry, rr)
      g.fillStyle(0x6a6a7a, 1)
      for (let b = 0; b < 4; b++) {
        g.fillCircle(rx + rng.integerInRange(-rr + 4, rr - 4),
          ry + rng.integerInRange(-rr + 4, rr - 4), 2)
      }
    }
    const fc2 = [0xff8844, 0xffcc44, 0x44aaff, 0xff4466]
    for (let i = 0; i < 8; i++) {
      const fx = rng.integerInRange(60, GAME_WIDTH - 60)
      const fy = rng.integerInRange(120, 580)
      g.fillStyle(fc2[rng.integerInRange(0, 3)], 0.8)
      g.fillEllipse(fx, fy, 20, 10)
      g.fillTriangle(fx - 10, fy, fx - 18, fy - 6, fx - 18, fy + 6)
    }
    for (let i = 0; i < 20; i++) {
      g.fillStyle(0xffffff, 0.25)
      g.fillCircle(rng.integerInRange(20, GAME_WIDTH - 20), rng.integerInRange(80, 600),
        rng.integerInRange(2, 6))
    }
  }

  private drawFallback() {
    const g = this.add.graphics().setDepth(0)
    g.fillStyle(0x1a1a2e, 1)
    g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)
  }
}
