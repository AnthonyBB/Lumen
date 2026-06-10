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
import {
  RL_WATER, RL_WATER2, RL_GRASS, RL_GRASS2, RL_GRASS_PEBBLES, RL_GRASS_LUSH,
  RL_DIRT, RL_DIRT2, RL_SNOW, RL_SNOW2, RL_SAND, RL_SAND2,
  RL_WATER_LILY, RL_WATER_ROCK, RL_SAND_ISLAND,
  RL_FLOWERS_ORANGE, RL_FLOWERS_WHITE, RL_FLOWERS_BLUE,
  RL_TREE_GREEN_SM, RL_TREE_TEAL_SM, RL_BUSH_GREEN, RL_BUSH_ORANGE, RL_BUSH_TEAL,
  RL_PINE_GREEN_SM, RL_PINE_TEAL_SM, RL_CACTUS,
  RL_TREE_GREEN_TALL, RL_TREE_ORANGE_TALL, RL_TREE_TEAL_TALL,
  RL_PINE_GREEN_TALL, RL_PINE_TEAL_TALL, RL_TREE_BERRY_TALL,
  RL_ROCKS_BROWN, RL_ROCKS_BROWN_MOSS, RL_ROCKS_GRAY, RL_ROCKS_GRAY_MOSS, RL_ROCKS_WATER,
  TT_MUSHROOMS, TD_MONSTERS,
} from '../data/tileFrames'
import { MOBS_BY_BIOME, TIER_LEVEL_BANDS, spawnMob } from '../data/mobs'

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
  markerSprite: Phaser.GameObjects.Sprite | null
}

type PathState = 'idle' | 'walking' | 'encounter_pause' | 'battling' | 'complete'

// ── Biome constants ─────────────────────────────────────────────────────────

const MOB_COUNTS: Record<string, [number, number]> = {
  easy: [4, 5], medium: [5, 7], hard: [7, 10],
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

    // Build the path first so prop scatter can avoid waypoints
    this.buildPath()

    // Draw biome environment at world scale
    this.drawBiome(biome, this.rng)

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
    const [bandMin, bandMax] = TIER_LEVEL_BANDS[difficulty]

    // Bestiary pool for this biome + difficulty.  Falls back to ANY archetype
    // of this tier if a biome has no themed entries (shouldn't happen — every
    // biome ships with 5+).
    const pool = MOBS_BY_BIOME[biome]?.[difficulty] ?? []
    const totalEncounters = WP_DEFS.filter(wp => wp.type === 'encounter').length
    let encounterNo = 0

    this.pathNodes = WP_DEFS.map(wp => {
      const node: PathNode = {
        x: Math.round(wp.fx * WORLD_W),
        y: Math.round(wp.fy * WORLD_H),
        type: wp.type,
        cleared: false,
        markerGfx: null, markerLabel: null, markerSprite: null,
      }
      if (wp.type === 'encounter') {
        const encIdx = encounterNo++
        // One archetype per encounter, picked by the scene's seeded rng so a
        // given biome+difficulty path is deterministic.  The same archetype
        // drives the map marker (frame + tint) and the battle mobs.
        const arch = pool.length > 0 ? this.rng.pick(pool) : null

        // Level band rises with encounter index: encounter 0 spawns from the
        // bottom slice of the difficulty band, the last encounter from the top.
        const span    = bandMax - bandMin
        const sliceLo = bandMin + Math.floor(span * (encIdx / totalEncounters))
        const sliceHi = bandMin + Math.floor(span * ((encIdx + 1) / totalEncounters))

        const count = this.rng.integerInRange(minMobs, maxMobs)
        node.mobs = Array.from({ length: count }, () => {
          const level = this.rng.integerInRange(sliceLo, sliceHi)
          if (arch) {
            const inst = spawnMob(arch.id, level)
            return {
              name: inst.name, level: inst.level, maxHp: inst.maxHp,
              attack: inst.attack, defense: inst.defense, speed: inst.speed,
              frame: inst.frame, tint: inst.tint,
            }
          }
          // Legacy fallback (no bestiary entry): generic enemy stats.
          return {
            name: 'Enemy', level, maxHp: 20 + level * 6,
            attack: 4 + Math.round(level * 1.2), defense: level,
            speed: 10 + Math.round(level * 0.5),
            frame: TD_MONSTERS[difficulty][encIdx % TD_MONSTERS[difficulty].length],
          }
        })
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
      this.add.image(px, py, 'roguelike', i % 3 === 0 ? RL_DIRT2 : RL_DIRT)
        .setScale(4).setDepth(2)
    }
  }

  private renderEncounterMarker(nodeIdx: number) {
    const node = this.pathNodes[nodeIdx]
    node.markerGfx?.destroy()
    node.markerLabel?.destroy()
    if (node.markerSprite) {
      this.tweens.killTweensOf(node.markerSprite)
      node.markerSprite.destroy()
      node.markerSprite = null
    }

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

      // Tiny Dungeon monster sprite matching the encounter's creatures,
      // tinted per archetype, with a subtle idle bob.
      const frame = node.mobs?.[0]?.frame ?? TD_MONSTERS[this.biomeData.difficulty][0]
      const tint  = node.mobs?.[0]?.tint ?? 0xffffff
      node.markerSprite = this.add.sprite(node.x, node.y, 'tiny_dungeon', frame)
        .setScale(3).setDepth(7)
      if (tint !== 0xffffff) node.markerSprite.setTint(tint)
      this.tweens.add({
        targets: node.markerSprite,
        y: { from: node.y - 3, to: node.y + 3 },
        duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      })

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
      socket?.emit('player:award_xp', { xp: Math.min(this.totalXpGained, 500) })
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

  /** Tile the whole biome floor with weighted roguelike terrain frames (4× scale). */
  private drawBiomeGround(biomeType: string): Phaser.GameObjects.RenderTexture {
    type Entry = { frame: number; w: number }
    const GRASS_MIX: Entry[] = [
      { frame: RL_GRASS, w: 0.56 }, { frame: RL_GRASS2, w: 0.36 },
      { frame: RL_GRASS_PEBBLES, w: 0.08 },
    ]
    const SPECS: Record<string, { tiles: Entry[]; tint?: number }> = {
      'Grassland':           { tiles: GRASS_MIX },
      'Pine Forest':         { tiles: GRASS_MIX },
      'Deciduous Forest':    { tiles: GRASS_MIX },
      'Tropical Rainforest': { tiles: [{ frame: RL_GRASS_LUSH, w: 1 }] },
      'Desert':              { tiles: [{ frame: RL_SAND, w: 0.65 }, { frame: RL_SAND2, w: 0.35 }] },
      'Snow':                { tiles: [{ frame: RL_SNOW, w: 0.65 }, { frame: RL_SNOW2, w: 0.35 }] },
      'Swamp':               { tiles: [{ frame: RL_DIRT, w: 0.45 }, { frame: RL_DIRT2, w: 0.3 }, { frame: RL_GRASS, w: 0.25 }], tint: 0x9ab87c },
      'Ocean':               { tiles: [{ frame: RL_WATER, w: 0.6 }, { frame: RL_WATER2, w: 0.4 }] },
    }
    const spec = SPECS[biomeType] ?? SPECS['Grassland']

    const rt = this.add.renderTexture(0, 0, WORLD_W, WORLD_H).setOrigin(0).setDepth(0)
    const tileSize = 64  // 16 px tile at ×4 scale
    const cfg = { scaleX: 4, scaleY: 4, tint: spec.tint ?? 0xffffff }
    for (let ty = 0; ty < WORLD_H; ty += tileSize) {
      for (let tx = 0; tx < WORLD_W; tx += tileSize) {
        let r = this.rng.frac()
        let frame = spec.tiles[spec.tiles.length - 1].frame
        for (const e of spec.tiles) {
          if (r < e.w) { frame = e.frame; break }
          r -= e.w
        }
        rt.stamp('roguelike', frame, tx + tileSize / 2, ty + tileSize / 2, cfg)
      }
    }
    return rt
  }

  /** Stamp a 2×2 tile motif (flowers, lily, sand islet…) onto the ground texture. */
  private stampPatch(
    rt: Phaser.GameObjects.RenderTexture,
    set: [number, number, number, number],
    fx: number, fy: number,
  ) {
    const t = 64
    const cfg = { scaleX: 4, scaleY: 4 }
    rt.stamp('roguelike', set[0], fx + t / 2,     fy + t / 2,     cfg)
    rt.stamp('roguelike', set[1], fx + t * 1.5,   fy + t / 2,     cfg)
    rt.stamp('roguelike', set[2], fx + t / 2,     fy + t * 1.5,   cfg)
    rt.stamp('roguelike', set[3], fx + t * 1.5,   fy + t * 1.5,   cfg)
  }

  /** Stamp `count` random 2×2 motifs picked from `sets` onto the ground texture. */
  private stampPatches(
    rt: Phaser.GameObjects.RenderTexture,
    sets: [number, number, number, number][],
    count: number,
    rng: Phaser.Math.RandomDataGenerator,
  ) {
    const t = 64
    for (let i = 0; i < count; i++) {
      const fx = rng.integerInRange(0, WORLD_W / t - 2) * t
      const fy = rng.integerInRange(0, WORLD_H / t - 2) * t
      this.stampPatch(rt, rng.pick(sets), fx, fy)
    }
  }

  /** Scatter trees and rocks from the roguelike sheet, avoiding waypoints.
   *  A tree entry is either a single frame or a [top, trunk] tall-tree pair. */
  private scatterProps(
    count: number,
    minX: number, maxX: number,
    minY: number, maxY: number,
    rng: Phaser.Math.RandomDataGenerator,
    treeRatio: number,
    trees: (number | [number, number])[],
    rocks: number[],
    tint?: number,
  ) {
    for (let i = 0; i < count; i++) {
      const x = minX + rng.frac() * (maxX - minX)
      const y = minY + rng.frac() * (maxY - minY)

      const tooClose = this.pathNodes.some(wp =>
        Math.abs(wp.x - x) < 120 && Math.abs(wp.y - y) < 120,
      )
      if (tooClose) continue

      if (rng.frac() < treeRatio && trees.length > 0) {
        const tree = rng.pick(trees)
        const scale = 3.5 + rng.frac()
        if (Array.isArray(tree)) {
          const [top, trunk] = tree
          const trunkImg = this.add.image(x, y, 'roguelike', trunk).setScale(scale).setDepth(10)
          const topImg = this.add.image(x, y - 16 * scale, 'roguelike', top).setScale(scale).setDepth(10)
          if (tint !== undefined) { trunkImg.setTint(tint); topImg.setTint(tint) }
        } else {
          const img = this.add.image(x, y, 'roguelike', tree).setScale(scale).setDepth(10)
          if (tint !== undefined) img.setTint(tint)
        }
      } else if (rocks.length > 0) {
        const img = this.add.image(x, y, 'roguelike', rng.pick(rocks))
          .setScale(2.5 + rng.frac() * 1.5)
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
    // Cacti, dry bushes and brown rocks scattered across the dunes
    this.scatterProps(55, 0, WORLD_W, 0, WORLD_H, rng, 0.65,
      [RL_CACTUS, RL_CACTUS, RL_BUSH_ORANGE], RL_ROCKS_BROWN)
  }

  private drawPineForest(rng: Phaser.Math.RandomDataGenerator) {
    this.drawBiomeGround('Pine Forest')
    // Dense pines (mostly tall green, some teal and small) + mossy rocks
    this.scatterProps(90, 0, WORLD_W, 0, WORLD_H, rng, 0.8,
      [RL_PINE_GREEN_TALL, RL_PINE_GREEN_TALL, RL_PINE_TEAL_TALL, RL_PINE_GREEN_SM],
      RL_ROCKS_GRAY_MOSS)
    // Red mushrooms on the forest floor (Tiny Town)
    for (let i = 0; i < 25; i++) {
      const x = rng.integerInRange(40, WORLD_W - 40)
      const y = rng.integerInRange(40, WORLD_H - 40)
      if (this.pathNodes.some(wp => Math.abs(wp.x - x) < 120 && Math.abs(wp.y - y) < 120)) continue
      this.add.image(x, y, 'tiny_town', TT_MUSHROOMS).setScale(3).setDepth(9)
    }
  }

  private drawDeciduousForest(rng: Phaser.Math.RandomDataGenerator) {
    const rt = this.drawBiomeGround('Deciduous Forest')
    // Flower patches on the forest floor
    this.stampPatches(rt, [RL_FLOWERS_WHITE, RL_FLOWERS_ORANGE], 14, rng)
    // Leafy broadleaf trees (green / autumn orange / teal) + bushes + mossy rocks
    this.scatterProps(80, 0, WORLD_W, 0, WORLD_H, rng, 0.75,
      [RL_TREE_GREEN_TALL, RL_TREE_GREEN_TALL, RL_TREE_ORANGE_TALL, RL_TREE_TEAL_TALL,
       RL_TREE_GREEN_SM, RL_BUSH_GREEN],
      RL_ROCKS_BROWN_MOSS)
  }

  private drawSwamp(rng: Phaser.Math.RandomDataGenerator) {
    this.drawBiomeGround('Swamp')
    // Gentle murk overlay to keep the boggy mood (toned down from the old version)
    const g = this.add.graphics().setDepth(1)
    g.fillStyle(0x0a2012, 0.22).fillRect(0, 0, WORLD_W, WORLD_H)
    // Gnarled teal trees and bushes + mossy rocks
    this.scatterProps(55, 0, WORLD_W, 0, WORLD_H, rng, 0.6,
      [RL_TREE_TEAL_TALL, RL_TREE_TEAL_SM, RL_BUSH_TEAL],
      RL_ROCKS_GRAY_MOSS)
    // Glowing will-o-wisps (kept from the old scene)
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
    this.drawBiomeGround('Snow')
    // Frost-tinted pines + gray rocks
    this.scatterProps(60, 0, WORLD_W, 0, WORLD_H, rng, 0.65,
      [RL_PINE_TEAL_TALL, RL_PINE_TEAL_TALL, RL_PINE_TEAL_SM],
      RL_ROCKS_GRAY, 0xddeeff)
    // Light dusting of snow speckles
    const g = this.add.graphics().setDepth(1)
    for (let i = 0; i < 120; i++) {
      g.fillStyle(0xffffff, 0.6).fillCircle(
        rng.integerInRange(0, WORLD_W), rng.integerInRange(0, WORLD_H), rng.integerInRange(2, 4))
    }
  }

  private drawGrassland(rng: Phaser.Math.RandomDataGenerator) {
    const rt = this.drawBiomeGround('Grassland')
    // Lots of wildflower patches across the open plains
    this.stampPatches(rt, [RL_FLOWERS_ORANGE, RL_FLOWERS_WHITE, RL_FLOWERS_BLUE], 30, rng)
    // Sparse trees, bushes and rocks
    this.scatterProps(45, 0, WORLD_W, 0, WORLD_H, rng, 0.55,
      [RL_TREE_GREEN_SM, RL_TREE_GREEN_TALL, RL_BUSH_GREEN, RL_BUSH_GREEN],
      RL_ROCKS_GRAY)
  }

  private drawTropicalRainforest(rng: Phaser.Math.RandomDataGenerator) {
    const rt = this.drawBiomeGround('Tropical Rainforest')
    // Bright flower patches under the canopy
    this.stampPatches(rt, [RL_FLOWERS_ORANGE, RL_FLOWERS_BLUE], 16, rng)
    // Very dense lush canopy: berry trees, broadleafs and bushes + mossy rocks
    this.scatterProps(95, 0, WORLD_W, 0, WORLD_H, rng, 0.8,
      [RL_TREE_BERRY_TALL, RL_TREE_GREEN_TALL, RL_TREE_GREEN_SM, RL_BUSH_GREEN, RL_BUSH_TEAL],
      RL_ROCKS_BROWN_MOSS)
    // Fireflies (kept from the old scene)
    for (let i = 0; i < 35; i++) {
      const ffx = rng.integerInRange(40, WORLD_W - 40); const ffy = rng.integerInRange(WORLD_H * 0.25, WORLD_H * 0.85)
      const fly = this.add.graphics().setDepth(2)
      fly.fillStyle(0xffff44, 0.8).fillCircle(ffx, ffy, 3)
      this.tweens.add({ targets: fly, alpha: { from: 0.1, to: 0.9 },
        duration: rng.integerInRange(500, 1300), yoyo: true, repeat: -1 })
    }
  }

  private drawOcean(rng: Phaser.Math.RandomDataGenerator) {
    const rt = this.drawBiomeGround('Ocean')
    // Sandy shoal patches, lily islets and rocky islets stamped into the water
    this.stampPatches(rt, [RL_SAND_ISLAND], 14, rng)
    this.stampPatches(rt, [RL_WATER_LILY], 12, rng)
    this.stampPatches(rt, [RL_WATER_ROCK], 8, rng)
    // Larger rocks breaking the surface
    for (let i = 0; i < 22; i++) {
      const x = rng.integerInRange(40, WORLD_W - 40)
      const y = rng.integerInRange(40, WORLD_H - 40)
      if (this.pathNodes.some(wp => Math.abs(wp.x - x) < 120 && Math.abs(wp.y - y) < 120)) continue
      this.add.image(x, y, 'roguelike', rng.pick(RL_ROCKS_WATER))
        .setScale(3 + rng.frac()).setDepth(9)
    }
  }

  private drawFallback() {
    this.drawBiomeGround('Grassland')
  }
}
