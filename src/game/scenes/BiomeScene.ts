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
  RL_PINE_TEAL_SM, RL_CACTUS,
  RL_TREE_GREEN_TALL, RL_TREE_ORANGE_TALL, RL_TREE_TEAL_TALL,
  RL_PINE_TEAL_TALL, RL_TREE_BERRY_TALL,
  RL_ROCKS_BROWN, RL_ROCKS_BROWN_MOSS, RL_ROCKS_GRAY, RL_ROCKS_GRAY_MOSS, RL_ROCKS_WATER,
  TD_MONSTERS,
  CPD_BLADES, CPD_SPECKS, CPD_TUFTS, CPD_MOUNDS,
  ROAD, ROAD_GRASS_TINT,
} from '../data/tileFrames'
import { MOBS_BY_BIOME, DIFFICULTIES, type Difficulty, spawnMob } from '../data/mobs'
import { StatsStore } from '../systems/StatsStore'

// ── World dimensions ────────────────────────────────────────────────────────

const WORLD_W = 3840   // 3 × GAME_WIDTH
const WORLD_H = 2160   // 3 × GAME_HEIGHT

// ── Scene data ──────────────────────────────────────────────────────────────

/** A campaign reward item as pushed by the server's `combat:loot`. */
interface RewardItem {
  name: string
  icon: string
  rarity: string
  itemType?: string   // eq_NNNN — resolves attributes via EQUIPMENT_MAP
}

interface BiomeSceneData {
  biome: string
  difficulty: Difficulty
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

// (No explicit 'battling' state is needed — BiomeScene is paused while
// BattleScene runs, so update() never ticks during combat.)
type PathState = 'idle' | 'walking' | 'encounter_pause' | 'complete'

// ── Biome constants ─────────────────────────────────────────────────────────

const WALK_SPEED = 180  // world-px per second

// Winding waypoints as fractions of world size. Kept close together with a
// gentle left/right sway (fx ≈ 0.44–0.56) so each right-angle leg stays short —
// the trail reads as a continuously winding path rather than long straight
// "corridor" legs. Still exactly 3 encounters, so the campaign is unchanged.
const WP_DEFS: { fx: number; fy: number; type: PathNode['type'] }[] = [
  { fx: 0.50, fy: 0.95, type: 'start'     },
  { fx: 0.44, fy: 0.88, type: 'walk'      },
  { fx: 0.55, fy: 0.81, type: 'walk'      },
  { fx: 0.45, fy: 0.74, type: 'encounter' },
  { fx: 0.56, fy: 0.66, type: 'walk'      },
  { fx: 0.45, fy: 0.59, type: 'walk'      },
  { fx: 0.55, fy: 0.51, type: 'encounter' },
  { fx: 0.45, fy: 0.43, type: 'walk'      },
  { fx: 0.55, fy: 0.35, type: 'walk'      },
  { fx: 0.46, fy: 0.27, type: 'walk'      },
  { fx: 0.55, fy: 0.18, type: 'encounter' },
  { fx: 0.49, fy: 0.10, type: 'walk'      },
  { fx: 0.50, fy: 0.04, type: 'end'       },
]

// ── BiomeScene ─────────────────────────────────────────────────────────────

export class BiomeScene extends Phaser.Scene {
  private biomeData!: BiomeSceneData
  private pathNodes: PathNode[] = []
  private currentNodeIdx = 0
  private pathState: PathState = 'idle'
  private playerHp = 100
  private playerMaxHp = 100
  private healthRegen = 0   // HP restored between battles (scales off Constitution)
  private encountersCleared = 0
  private totalXpGained = 0
  private maxEnemyLevel = 1   // highest enemy level faced — scales the campaign reward
  private rewardTooltip: Phaser.GameObjects.Container | null = null
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
    this.healthRegen = StatsStore.get()?.derived.find(r => r.key === 'healthRegen')?.total ?? 0

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
    const cfg = DIFFICULTIES[difficulty]
    const [minMobs, maxMobs] = cfg.count
    const [bandMin, bandMax] = cfg.band

    // Bestiary pool for this biome + difficulty mode.  Each mode maps to an
    // archetype POOL tier (beginner/easy → easy pool, medium → medium, hard/
    // expert → hard). Falls back to empty if a biome lacks that pool.
    const pool = MOBS_BY_BIOME[biome]?.[cfg.pool] ?? []
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

        // Ramp the mob COUNT smoothly from the band minimum (first encounter)
        // up to the maximum (last) so every mode opens gently and builds up.
        const t = totalEncounters <= 1 ? 1 : encIdx / (totalEncounters - 1)
        const count = Math.max(1, Math.round(Phaser.Math.Linear(minMobs, maxMobs, t)))
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
            frame: TD_MONSTERS[cfg.pool][encIdx % TD_MONSTERS[cfg.pool].length],
          }
        })
      }
      return node
    })

    // Bend each diagonal leg into a right angle by inserting a corner node, so
    // the path reads as straight axis-aligned segments (which the road pack
    // autotiles cleanly) while staying winding.  The auto-walker follows the
    // corners, so movement still tracks the drawn road.  The corner is always
    // placed VERTICAL-first: because the campaign climbs upward toward the
    // enemies, walking the vertical leg first always heads TOWARD the next
    // encounter, then a short horizontal leg aligns onto the node — instead of
    // randomly wandering sideways (sometimes away from the mobs) first.
    this.pathNodes = this.insertPathCorners(this.pathNodes)
  }

  /** Insert an axis-aligned corner between any two diagonally-offset nodes,
   *  always vertical-first so the walker advances toward the next node first. */
  private insertPathCorners(nodes: PathNode[]): PathNode[] {
    const out: PathNode[] = []
    for (let i = 0; i < nodes.length; i++) {
      out.push(nodes[i])
      const a = nodes[i]
      const b = nodes[i + 1]
      if (!b) break
      if (a.x === b.x || a.y === b.y) continue   // already straight — no corner
      // Corner shares a.x then b.y → walk the vertical (toward-the-enemy) leg
      // first, then the horizontal alignment leg.
      out.push({
        x: a.x,
        y: b.y,
        type: 'walk', cleared: false,
        markerGfx: null, markerLabel: null, markerSprite: null,
      })
    }
    return out
  }

  // Path grid: 48px cells (16px tile × 3); a 3-cell-wide road is ~144px across,
  // comfortably wider than the 2× player sprite.
  private static readonly PATH_CELL = 48
  private static readonly PATH_HALF = 1

  private drawPath() {
    const mask = this.buildPathMask()
    if (this.textures.exists('road_body')) {
      const rt = this.add.renderTexture(0, 0, WORLD_W, WORLD_H).setOrigin(0).setDepth(2)
      this.renderRoads(rt, mask)
    } else {
      // Fallback: stamp plain dirt tiles along the mask if the road pack is absent.
      const CELL = BiomeScene.PATH_CELL
      mask.forEach((row, r) => row.forEach((on, c) => {
        if (on) this.add.image(c * CELL + CELL / 2, r * CELL + CELL / 2, 'roguelike',
          (c + r) % 3 === 0 ? RL_DIRT2 : RL_DIRT).setScale(4).setDepth(2)
      }))
    }

    this.pathNodes.forEach((node, i) => {
      if (node.type === 'encounter') this.renderEncounterMarker(i)
      if (node.type === 'end')       this.renderEndMarker(node)
    })
  }

  /** Rasterize the (now axis-aligned) path segments into a boolean cell grid. */
  private buildPathMask(): boolean[][] {
    const CELL = BiomeScene.PATH_CELL
    const HALF = BiomeScene.PATH_HALF
    const cols = Math.floor(WORLD_W / CELL)
    const rows = Math.floor(WORLD_H / CELL)
    const mask: boolean[][] = Array.from({ length: rows }, () => new Array<boolean>(cols).fill(false))
    const mark = (c: number, r: number) => {
      if (r >= 0 && r < rows && c >= 0 && c < cols) mask[r][c] = true
    }
    const stroke = (x1: number, y1: number, x2: number, y2: number) => {
      const c1 = Math.round(x1 / CELL), r1 = Math.round(y1 / CELL)
      const c2 = Math.round(x2 / CELL), r2 = Math.round(y2 / CELL)
      if (r1 === r2) {
        for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++)
          for (let d = -HALF; d <= HALF; d++) mark(c, r1 + d)
      } else {
        for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++)
          for (let d = -HALF; d <= HALF; d++) mark(c1 + d, r)
      }
    }
    for (let i = 0; i < this.pathNodes.length - 1; i++) {
      const a = this.pathNodes[i], b = this.pathNodes[i + 1]
      if (a.x === b.x && a.y === b.y) continue
      stroke(a.x, a.y, b.x, b.y)
    }
    return mask
  }

  /** Autotile the path mask with the CraftPix road pack — opaque cobble body
   *  plus a grass-overhang fringe, frame picked by which sides border grass.
   *  Mirrors WorldScene's road renderer so the campaign matches the overworld. */
  private renderRoads(rt: Phaser.GameObjects.RenderTexture, mask: boolean[][]) {
    const CELL = BiomeScene.PATH_CELL
    const rows = mask.length
    const cols = mask[0].length
    const scale = { scaleX: CELL / 16, scaleY: CELL / 16 }
    const isP = (c: number, r: number) =>
      r >= 0 && r < rows && c >= 0 && c < cols && mask[r][c]

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!mask[r][c]) continue
        const n = !isP(c, r - 1), s = !isP(c, r + 1)
        const w = !isP(c - 1, r), e = !isP(c + 1, r)
        let frame: number
        if (n && w) frame = ROAD.NW
        else if (n && e) frame = ROAD.NE
        else if (s && w) frame = ROAD.SW
        else if (s && e) frame = ROAD.SE
        else if (n) frame = ROAD.N
        else if (s) frame = ROAD.S
        else if (w) frame = ROAD.W
        else if (e) frame = ROAD.E
        else frame = ROAD.C[(c + r) % ROAD.C.length]
        const px = c * CELL + CELL / 2
        const py = r * CELL + CELL / 2
        rt.stamp('road_body', frame, px, py, scale)
        rt.stamp('road_fringe', frame, px, py, { ...scale, tint: ROAD_GRASS_TINT })
      }
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
      const frame = node.mobs?.[0]?.frame ?? TD_MONSTERS[DIFFICULTIES[this.biomeData.difficulty].pool][0]
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
    for (const m of node.mobs ?? []) this.maxEnemyLevel = Math.max(this.maxEnemyLevel, m.level)

    this.scene.launch('BattleScene', data)
    this.scene.pause()
  }

  public onBattleResult(result: BattleResult) {
    if (!result.victory) { this.showDefeatOverlay(); return }

    this.playerHp       = result.playerHp
    // Health regen between battles — recover some HP before the next encounter.
    if (this.healthRegen > 0) {
      this.playerHp = Math.min(this.playerMaxHp, this.playerHp + Math.round(this.healthRegen))
    }
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
    const diffColors: Record<string, string> = Object.fromEntries(
      Object.values(DIFFICULTIES).map(d => [d.key, d.color]),
    )

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
    // Whole biome cleared — report the campaign completion so the server grants
    // a sizeable, difficulty/level-scaled reward of items (added to the bag).
    const socket = (window as typeof window & { __lumenSocket?: Socket }).__lumenSocket
    socket?.emit('player:award_xp', {
      xp: Math.min(this.totalXpGained, 500),
      difficulty: this.biomeData.difficulty,
      level: this.maxEnemyLevel,
      campaignComplete: true,
    })
    const W = 560, H = 364, cx = GAME_WIDTH / 2, cy = GAME_HEIGHT / 2
    const bg = this.add.graphics().setDepth(190).setScrollFactor(0)
    bg.fillStyle(0x000000, 0.9).fillRoundedRect(cx - W / 2, cy - H / 2, W, H, 16)
    bg.lineStyle(2, 0xffd700, 1).strokeRoundedRect(cx - W / 2, cy - H / 2, W, H, 16)

    this.add.text(cx, cy - H / 2 + 40, '🏆  Biome Cleared!', {
      fontSize: '30px', fontFamily: 'Georgia, serif', color: '#ffd700', fontStyle: 'bold',
    }).setOrigin(0.5, 0.5).setDepth(200).setScrollFactor(0)

    const enc = this.encountersCleared
    this.add.text(cx, cy - 96, `${enc} encounter${enc !== 1 ? 's' : ''} conquered`, {
      fontSize: '16px', fontFamily: 'Arial', color: '#aaaaaa',
    }).setOrigin(0.5, 0.5).setDepth(200).setScrollFactor(0)

    this.add.text(cx, cy - 60, `+${this.totalXpGained} XP earned`, {
      fontSize: '22px', fontFamily: 'Georgia, serif', color: '#44ffaa', fontStyle: 'bold',
    }).setOrigin(0.5, 0.5).setDepth(200).setScrollFactor(0)

    // Reward area — filled when the CAMPAIGN combat:loot arrives. The server
    // tags per-encounter loot (campaignComplete=false) and campaign loot
    // (campaignComplete=true) on the same event, so we ignore the per-encounter
    // ones — otherwise an (often empty) per-encounter emit would be consumed
    // here and the real campaign reward would be dropped.
    const onLoot = (data: { campaignComplete?: boolean; items?: RewardItem[] }) => {
      if (!data?.campaignComplete) return
      socket?.off('combat:loot', onLoot)
      const items = data?.items ?? []
      if (!items.length || !this.scene.isActive()) return
      this.add.text(cx, cy - 24, '💎  Reward  —  hover an item to inspect its stats', {
        fontSize: '13px', fontFamily: 'Georgia, serif', color: '#9be7ff',
      }).setOrigin(0.5, 0.5).setDepth(200).setScrollFactor(0)
      this.renderRewardChips(items, cx, cy + 14)
    }
    socket?.on('combat:loot', onLoot)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => socket?.off('combat:loot', onLoot))

    this.cameras.main.flash(700, 255, 215, 0)

    const btn = this.add.text(cx, cy + H / 2 - 30, 'Return to World', {
      fontSize: '18px', fontFamily: 'Georgia, serif', color: '#ffffff', fontStyle: 'bold',
      backgroundColor: '#2a1060', padding: { x: 24, y: 12 },
    }).setOrigin(0.5, 0.5).setDepth(200).setScrollFactor(0)
      .setInteractive({ useHandCursor: true })
    btn.on('pointerover', () => btn.setColor('#ffd700'))
    btn.on('pointerout',  () => btn.setColor('#ffffff'))
    btn.on('pointerdown', () => this.returnToWorld())
  }

  private static readonly REWARD_COLORS: Record<string, string> = {
    common: '#aaaaaa', uncommon: '#44cc44', rare: '#4488ff', epic: '#cc44ff', legendary: '#ffaa00',
  }

  /** Lay out the reward items as a centred, wrapping row of hoverable chips. */
  private renderRewardChips(items: RewardItem[], cx: number, startY: number) {
    const gap = 10
    const made = items.map(it => {
      const txt = this.add.text(0, 0, `${it.icon} ${this.truncate(it.name, 20)}`, {
        fontSize: '12px', fontFamily: 'Arial, sans-serif',
        color: BiomeScene.REWARD_COLORS[it.rarity] ?? '#dddddd',
        backgroundColor: '#16163a', padding: { x: 8, y: 5 },
      }).setOrigin(0, 0.5).setDepth(201).setScrollFactor(0)
      return { it, txt, w: txt.width }
    })

    // Wrap chips into rows no wider than the modal.
    const maxRowW = 520
    const rows: (typeof made)[] = [[]]
    let rowW = 0
    for (const m of made) {
      if (rowW + m.w + gap > maxRowW && rows[rows.length - 1].length) { rows.push([]); rowW = 0 }
      rows[rows.length - 1].push(m); rowW += m.w + gap
    }

    let y = startY
    for (const row of rows) {
      const totalW = row.reduce((s, m) => s + m.w, 0) + gap * (row.length - 1)
      let x = cx - totalW / 2
      for (const m of row) {
        m.txt.setPosition(x, y)
        const hit = this.add.rectangle(x + m.w / 2, y, m.w, 28, 0, 0)
          .setDepth(202).setScrollFactor(0).setInteractive({ useHandCursor: true })
        hit.on('pointerover', () => this.showRewardTooltip(m.it, x + m.w / 2, y - 20))
        hit.on('pointerout',  () => this.hideRewardTooltip())
        x += m.w + gap
      }
      y += 34
    }
  }

  /** Floating tooltip with an item's rarity, slot and attribute bonuses. */
  private showRewardTooltip(it: RewardItem, x: number, y: number) {
    this.hideRewardTooltip()
    // Campaign rewards are crafting materials / shards now — they carry no gear
    // attributes, so the tooltip just shows the name + rarity tier.
    const rar = it.rarity.charAt(0).toUpperCase() + it.rarity.slice(1)
    const sub = rar
    const attrs = ''

    const c = this.add.container(0, 0).setDepth(210).setScrollFactor(0)
    const name = this.add.text(0, 0, it.name, {
      fontSize: '13px', fontFamily: 'Georgia, serif', color: '#ffffff', fontStyle: 'bold',
      align: 'center', wordWrap: { width: 300 },
    }).setOrigin(0.5, 0)
    const subT = this.add.text(0, 0, sub, {
      fontSize: '11px', fontFamily: 'Arial, sans-serif',
      color: BiomeScene.REWARD_COLORS[it.rarity] ?? '#bbbbbb', align: 'center',
    }).setOrigin(0.5, 0)
    const attrT = this.add.text(0, 0, attrs, {
      fontSize: '12px', fontFamily: 'Arial, sans-serif', color: '#9bd0ff', align: 'center',
    }).setOrigin(0.5, 0)

    const padX = 14, padY = 10, lineGap = 4
    const w = Math.max(name.width, subT.width, attrT.width) + padX * 2
    const h = name.height + subT.height + attrT.height + lineGap * 2 + padY * 2
    // Clamp horizontally so the box stays on screen; sit it above the chip.
    const bx = Phaser.Math.Clamp(x, w / 2 + 8, GAME_WIDTH - w / 2 - 8)
    const top = y - h
    name.setPosition(bx, top + padY)
    subT.setPosition(bx, top + padY + name.height + lineGap)
    attrT.setPosition(bx, top + padY + name.height + subT.height + lineGap * 2)

    const g = this.add.graphics()
    g.fillStyle(0x0a0a1e, 0.97).fillRoundedRect(bx - w / 2, top, w, h, 8)
    g.lineStyle(1, 0xffd700, 0.9).strokeRoundedRect(bx - w / 2, top, w, h, 8)
    c.add([g, name, subT, attrT])
    this.rewardTooltip = c
  }

  private hideRewardTooltip() {
    this.rewardTooltip?.destroy()
    this.rewardTooltip = null
  }

  private truncate(s: string, max: number): string {
    return s.length > max ? s.slice(0, max - 1) + '…' : s
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
    if (this.pathState !== 'complete' && Phaser.Input.Keyboard.JustDown(this.escKey)) {
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

  /** True when (x, y) is within the keep-clear box around any path waypoint —
   *  props and decorations must not crowd the route or the encounter markers. */
  private isNearWaypoint(x: number, y: number): boolean {
    return this.pathNodes.some(wp =>
      Math.abs(wp.x - x) < 120 && Math.abs(wp.y - y) < 120,
    )
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

      if (this.isNearWaypoint(x, y)) continue

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

  /** Place a forest prop with per-instance scale/depth, skipping the path corridor.
   *  `anchorBottom` draws the sprite standing on (x,y) so trees overlap naturally. */
  private placeForestProp(
    key: string, x: number, y: number, scale: number, depth: number,
    anchorBottom = true,
  ): boolean {
    if (this.isNearWaypoint(x, y)) return false
    const img = this.add.image(x, y, key).setScale(scale).setDepth(depth)
    if (anchorBottom) img.setOrigin(0.5, 0.92)
    return true
  }

  /** A small rounded pond: water blob + soft shoreline ring, lily-pad decals,
   *  and a fringe of reeds/grass around the rim. Drawn under everything (depth ≤ 7). */
  private drawForestPond(
    cx: number, cy: number, rw: number, rh: number,
    rng: Phaser.Math.RandomDataGenerator,
  ) {
    const g = this.add.graphics().setDepth(4)
    // dirt/grass shore ring
    g.fillStyle(0x6a5a3a, 1).fillEllipse(cx, cy, rw * 2 + 34, rh * 2 + 30)
    g.fillStyle(0x4f7a36, 1).fillEllipse(cx, cy, rw * 2 + 18, rh * 2 + 16)
    // water body with a lighter inner highlight
    g.fillStyle(0x2f6f9e, 1).fillEllipse(cx, cy, rw * 2, rh * 2)
    g.fillStyle(0x4a8fc0, 1).fillEllipse(cx - rw * 0.18, cy - rh * 0.2, rw * 1.3, rh * 1.1)
    g.fillStyle(0x66a6d4, 0.5).fillEllipse(cx - rw * 0.3, cy - rh * 0.35, rw * 0.6, rh * 0.45)

    // lily pads floating on the surface (decal sheet, 36 frames)
    const padCount = rng.integerInRange(3, 6)
    for (let i = 0; i < padCount; i++) {
      const a = rng.frac() * Math.PI * 2
      const r = rng.frac() * 0.7
      const px = cx + Math.cos(a) * rw * r
      const py = cy + Math.sin(a) * rh * r
      this.add.image(px, py, 'cpf_lilis', rng.integerInRange(0, 35))
        .setScale(1.6 + rng.frac() * 0.8).setDepth(5)
    }

    // reed + grass fringe hugging the rim
    const fringe = rng.integerInRange(14, 20)
    for (let i = 0; i < fringe; i++) {
      const a = rng.frac() * Math.PI * 2
      const px = cx + Math.cos(a) * (rw + rng.integerInRange(2, 22))
      const py = cy + Math.sin(a) * (rh + rng.integerInRange(2, 18))
      const key = rng.pick(['cpf_reeds1', 'cpf_reeds2', 'cpf_reeds3'])
      this.add.image(px, py, key).setOrigin(0.5, 0.95)
        .setScale(1.6 + rng.frac() * 0.7).setDepth(6)
    }
  }

  private drawPineForest(rng: Phaser.Math.RandomDataGenerator) {
    const rt = this.drawBiomeGround('Pine Forest')

    // ── Dense ground texture: grass blades, specks, tufts and dirt mounds ──────
    const detail: { frames: number[]; count: number; scale: number }[] = [
      { frames: CPD_BLADES, count: 900, scale: 4 },
      { frames: CPD_SPECKS, count: 500, scale: 4 },
      { frames: CPD_TUFTS,  count: 260, scale: 4 },
      { frames: CPD_MOUNDS, count: 90,  scale: 4 },
    ]
    for (const d of detail) {
      for (let i = 0; i < d.count; i++) {
        const x = rng.integerInRange(0, WORLD_W)
        const y = rng.integerInRange(0, WORLD_H)
        rt.stamp('cp_details', rng.pick(d.frames), x, y, { scaleX: d.scale, scaleY: d.scale })
      }
    }

    // ── Ponds (fixed spots, well clear of the winding path) ────────────────────
    const ponds: [number, number, number, number][] = [
      [560, 1620, 150, 95],
      [3150, 760, 170, 110],
      [2050, 1780, 120, 78],
    ]
    for (const [px, py, pw, ph] of ponds) {
      if (this.isNearWaypoint(px, py)) continue
      this.drawForestPond(px, py, pw, ph, rng)
    }

    // ── Ground-hugging detail props (low depth, layered under trees) ───────────
    const stones = ['cpf_stone1', 'cpf_stone2', 'cpf_stone3', 'cpf_stone4']
    const bushes = ['cpf_bush1', 'cpf_bush2', 'cpf_bush4', 'cpf_bush7', 'cpf_bush10']
    const stumps = ['cpf_stump1', 'cpf_stump3', 'cpf_stump5']
    const redMush = ['cpf_redmush1', 'cpf_redmush2', 'cpf_redmush3']

    // boulders
    for (let i = 0; i < 34; i++) {
      const x = rng.integerInRange(60, WORLD_W - 60)
      const y = rng.integerInRange(60, WORLD_H - 60)
      this.placeForestProp(rng.pick(stones), x, y, 1.5 + rng.frac() * 1.0, 8)
    }
    // bushes
    for (let i = 0; i < 90; i++) {
      const x = rng.integerInRange(40, WORLD_W - 40)
      const y = rng.integerInRange(40, WORLD_H - 40)
      this.placeForestProp(rng.pick(bushes), x, y, 1.5 + rng.frac() * 0.9, 9)
    }
    // stumps / fallen logs / snags
    for (let i = 0; i < 26; i++) {
      const x = rng.integerInRange(60, WORLD_W - 60)
      const y = rng.integerInRange(60, WORLD_H - 60)
      this.placeForestProp(rng.pick(stumps), x, y, 1.5 + rng.frac() * 0.7, 9)
    }
    // red mushroom clumps (2-4 caps together)
    for (let c = 0; c < 26; c++) {
      const bx = rng.integerInRange(60, WORLD_W - 60)
      const by = rng.integerInRange(60, WORLD_H - 60)
      const n = rng.integerInRange(2, 4)
      for (let k = 0; k < n; k++) {
        this.placeForestProp(
          rng.pick(redMush),
          bx + rng.integerInRange(-26, 26), by + rng.integerInRange(-18, 18),
          1.6 + rng.frac() * 0.7, 9,
        )
      }
    }
    // scattered brown mushrooms
    for (let i = 0; i < 22; i++) {
      const x = rng.integerInRange(60, WORLD_W - 60)
      const y = rng.integerInRange(60, WORLD_H - 60)
      this.placeForestProp('cpf_brownmush', x, y, 1.5 + rng.frac() * 0.6, 9)
    }
    // grass tufts (small ground decals as standalone sprites for extra lushness)
    for (let i = 0; i < 70; i++) {
      const x = rng.integerInRange(40, WORLD_W - 40)
      const y = rng.integerInRange(40, WORLD_H - 40)
      this.placeForestProp(rng.pick(bushes), x, y, 0.9 + rng.frac() * 0.5, 8)
    }

    // ── Stone pillar statue + ruined pillars feature (fixed, off the path) ─────
    const statueSpots: [number, number, string, number][] = [
      [3100, 1500, 'cpf_ruin', 2.0],
      [820, 540, 'cpf_pillar', 2.2],
    ]
    for (const [sx, sy, skey, sc] of statueSpots) {
      this.placeForestProp(skey, sx, sy, sc, 11)
    }

    // ── Trees in clusters: big round/pine canopy + small inner trees ───────────
    const bigTrees = ['cpf_tree1', 'cpf_tree2', 'cpf_tree3', 'cpf_tree5',
                      'cpf_tree6', 'cpf_tree7', 'cpf_tree11', 'cpf_tree13']
    const smallTrees = ['cpf_treesm4', 'cpf_treesm10', 'cpf_treesm12', 'cpf_treesm14']

    const CLUSTERS = 30
    for (let c = 0; c < CLUSTERS; c++) {
      const cx = rng.integerInRange(80, WORLD_W - 80)
      const cy = rng.integerInRange(80, WORLD_H - 80)
      const n = rng.integerInRange(4, 8)
      for (let k = 0; k < n; k++) {
        const x = cx + rng.integerInRange(-130, 130)
        const y = cy + rng.integerInRange(-100, 100)
        // depth keyed to y so lower (front) trees overlap higher ones; capped < 15
        const depth = 12 + Math.min(2, Math.floor((y / WORLD_H) * 3))
        if (rng.frac() < 0.28) {
          this.placeForestProp(rng.pick(smallTrees), x, y, 1.3 + rng.frac() * 0.5, Math.min(13, depth))
        } else {
          this.placeForestProp(rng.pick(bigTrees), x, y, 1.25 + rng.frac() * 0.55, Math.min(14, depth))
        }
      }
    }
    // a sprinkle of lone trees to fill gaps between clusters
    for (let i = 0; i < 45; i++) {
      const x = rng.integerInRange(80, WORLD_W - 80)
      const y = rng.integerInRange(80, WORLD_H - 80)
      const depth = Math.min(14, 12 + Math.floor((y / WORLD_H) * 2))
      this.placeForestProp(rng.pick(bigTrees), x, y, 1.2 + rng.frac() * 0.6, depth)
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
      if (this.isNearWaypoint(x, y)) continue
      this.add.image(x, y, 'roguelike', rng.pick(RL_ROCKS_WATER))
        .setScale(3 + rng.frac()).setDepth(9)
    }
  }

  private drawFallback() {
    this.drawBiomeGround('Grassland')
  }
}
