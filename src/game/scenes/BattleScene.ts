/**
 * BattleScene — skill-based turn-by-turn combat overlay.
 *
 * Flow:
 *  1. BiomeScene launches this scene on top of itself then pauses.
 *  2. Player selects a skill from the bottom panel.
 *     - Heal: fires immediately with no target needed.
 *     - Damage skills: mobs become clickable; player clicks a target.
 *  3. Skill animation plays, damage / heal applied.
 *  4. Remaining mobs counter-attack the player (sequential, small delays).
 *  5. Repeat until all mobs dead (victory) or player HP ≤ 0 (defeat).
 *  6. BattleScene calls biomeScene.onBattleResult(), then stops itself and
 *     resumes BiomeScene.
 */

import Phaser from 'phaser'
import type { Socket } from 'socket.io-client'
import { GAME_WIDTH, GAME_HEIGHT } from '../constants'
import { BASIC_ATTACK } from '../data/skills'
import type { Skill } from '../data/skills'
import { SKILL_MAP } from '../data/skillTrees'
import { StatsStore } from '../systems/StatsStore'
import { InventoryStore, type ClientInventoryItem } from '../systems/InventoryStore'
import type { CombatSkill, SkillClass } from '../data/skillTrees'
import { TD_MONSTERS } from '../data/tileFrames'
import { DIFFICULTIES, type Difficulty } from '../data/mobs'
import type { BiomeScene } from './BiomeScene'

// ── Public types (used by BiomeScene) ─────────────────────────────────────

export interface MobDef {
  name: string             // archetype name ('Frost Troll', 'Sand Scorpion', ...)
  level: number
  maxHp: number
  attack: number           // base damage per hit (derived from archetype stats)
  defense: number          // reserved for player skill mitigation
  speed: number            // drives initiative + enemy act order
  /** Archetype tint applied to the sprite (0xffffff / undefined = untinted). */
  tint?: number
  /** Optional tiny_dungeon frame chosen by BiomeScene so the map marker and
   *  battle enemy show the same creature. Falls back to the difficulty pool. */
  frame?: number
}

export interface BattleSceneData {
  biome: string
  difficulty: Difficulty
  mobs: MobDef[]
  encounterIndex: number
  totalEncounters: number
  playerHp: number
  playerMaxHp: number
}

export interface BattleResult {
  victory: boolean
  playerHp: number
  xpGained: number
}

// ── Constants ──────────────────────────────────────────────────────────────

/** XP for defeating a mob scales with its level — higher biomes pay more. */
const xpForMob = (level: number) => 10 + level * 2

/** Silver dropped per defeated enemy: scales with level × difficulty tier. */
const SILVER_TIER_MULT: Record<Difficulty, number> = {
  novice: 1, easy: 1, casual: 1.25, medium: 1.5, hard: 1.75,
  veteran: 2, expert: 2.25, master: 2.5, elite: 2.75, legendary: 3,
}
const silverForMob = (level: number, difficulty: Difficulty) =>
  Math.max(1, Math.round(level * SILVER_TIER_MULT[difficulty]))

/** Fallback player initiative speed when no equipment-derived speed is set. */
const DEFAULT_PLAYER_SPEED = 25

/** Button accent color per skill class (matches shop theming). */
const CLASS_COLORS: Record<SkillClass, number> = {
  fire_mage: 0xff4400, ice_mage: 0x44aaff, lightning_mage: 0xffee00,
  sword: 0xcc8855, spear: 0xaa9966, axe: 0xbb5533, hammer: 0x997755,
  monk: 0xffaa66, paladin: 0xffd700, assassin: 0x9955cc,
  cleric: 0x44ff88, shaman: 0x55cc77, bard: 0xff77cc,
}

const MAX_SKILLS_PER_PAGE = 6

/**
 * Map a purchased skill-tree skill onto the battle engine's damage/heal model.
 * The engine currently supports direct damage and heals; richer effects
 * (DoT ticks, stuns, buffs) are flattened to their primary value for now.
 */
function toBattleSkill(cs: CombatSkill): Skill {
  const dmgEffect = cs.effects.find(e =>
    e.type === 'damage' || e.type === 'aoe' || e.type === 'execute' ||
    e.type === 'chain' || e.type === 'dot' || e.type === 'lifesteal')
  const healEffect = cs.effects.find(e => e.type === 'heal' || e.type === 'shield')
  const isHeal = !dmgEffect && !!healEffect
  const base = (dmgEffect ?? healEffect)?.value ?? 10
  return {
    id: cs.id,
    name: cs.name,
    icon: cs.icon,
    description: cs.description,
    damageMin: Math.max(1, Math.round(base * 0.85)),
    damageMax: Math.max(2, Math.round(base * 1.15)),
    isHeal,
    color: CLASS_COLORS[cs.class] ?? 0x8a6a40,
    mpCost: cs.mpCost,
  }
}

// Sprite scale per difficulty (16px source tile → on-screen px)
const MOB_SCALE: Record<string, number> = {
  novice: 4, easy: 4, casual: 4.2, medium: 4.4, hard: 4.6,
  veteran: 4.8, expert: 5, master: 5.2, elite: 5.4, legendary: 5.6,
}

// Layout zones
const HEADER_H      = 48
const ENEMY_BOTTOM  = 325
const LOG_TOP       = ENEMY_BOTTOM
const LOG_BOTTOM    = LOG_TOP + 52
const SKILL_TOP     = LOG_BOTTOM
const SKILL_BTN_H   = 92
const PLAYER_PANEL_Y = SKILL_TOP + SKILL_BTN_H + 16

// ── Types ─────────────────────────────────────────────────────────────────

type BattlePhase =
  | 'player_turn'    // waiting for skill selection
  | 'target_select'  // skill chosen, waiting for mob click
  | 'animating'      // skill firing / damage numbers showing
  | 'enemy_turn'     // mobs counter-attacking
  | 'victory'
  | 'defeat'

interface ActiveMob extends MobDef {
  hp: number
  alive: boolean
  px: number   // screen position
  py: number
  monsterFrame: number   // resolved tiny_dungeon frame for this mob
  sprite: Phaser.GameObjects.Sprite | null
  shadow: Phaser.GameObjects.Ellipse | null
  nameText: Phaser.GameObjects.Text | null
  hpBarGfx: Phaser.GameObjects.Graphics | null
  hitZone: Phaser.GameObjects.Rectangle | null
}

// ── BattleScene ────────────────────────────────────────────────────────────

export class BattleScene extends Phaser.Scene {
  private battleData!: BattleSceneData
  private mobs: ActiveMob[] = []
  private phase: BattlePhase = 'player_turn'
  private selectedSkill: Skill | null = null
  private playerHp = 100
  private playerMaxHp = 100
  private playerMana = 0
  private playerMaxMana = 0
  private manaRegen = 0
  private playerSpeed = DEFAULT_PLAYER_SPEED
  private playerDefense = 0   // equipment-derived defense will feed this later
  /** The character gear/stats inspect overlay (null when closed). */
  private charPanel: Phaser.GameObjects.Container | null = null
  private xpGained = 0
  private silverGained = 0

  /** Skills shown in the bar: basic Attack + server-confirmed purchases only. */
  private battleSkills: Skill[] = [BASIC_ATTACK]
  private skillPage = 0

  // ── HUD refs ─────────────────────────────────────────────────────────────
  private playerHpGfx!: Phaser.GameObjects.Graphics
  private playerHpText!: Phaser.GameObjects.Text
  private playerMpGfx!: Phaser.GameObjects.Graphics
  private playerMpText!: Phaser.GameObjects.Text
  private playerBars = { barX: 0, barW: 0, hpY: 0, mpY: 0 }
  private logText!: Phaser.GameObjects.Text
  private skillButtons: Phaser.GameObjects.Container[] = []
  private skillBtnGfx: Phaser.GameObjects.Graphics[] = []

  constructor() { super({ key: 'BattleScene' }) }

  init(data: BattleSceneData) {
    this.battleData  = data
    this.playerHp    = data.playerHp
    this.playerMaxHp = data.playerMaxHp
    this.xpGained    = 0
    this.silverGained = 0
    this.phase       = 'player_turn'
    this.selectedSkill = null
    this.mobs        = []
    this.skillButtons = []
    this.skillBtnGfx  = []
    this.skillPage    = 0
  }

  create() {
    // Player initiative speed.  TODO: the equipment system should write its
    // derived speed stat into registry key 'speed' so battles pick it up here.
    this.playerSpeed   = (this.registry.get('speed') as number) ?? DEFAULT_PLAYER_SPEED
    this.playerDefense = (this.registry.get('defense') as number) ?? 0

    // Mana (max + regen) come from the server-pushed derived stats. Mana starts
    // full each battle for now; carrying it between fights is a follow-up.
    const derived = StatsStore.get()?.derived ?? []
    this.playerMaxMana = Math.round(derived.find(r => r.key === 'mana')?.total ?? 0)
    this.manaRegen     = derived.find(r => r.key === 'manaRegen')?.total ?? 0
    this.playerMana    = this.playerMaxMana

    this.loadOwnedSkills()
    this.buildMobs()
    this.drawBackground()
    this.placeMobs()
    this.buildLogBar()
    this.buildSkillPanel()
    this.buildPlayerPanel()
    this.rollInitiative()
  }

  // ── Initiative ────────────────────────────────────────────────────────────

  /** Compare player speed vs the fastest alive mob: faster side acts first. */
  private rollInitiative() {
    const fastestMob = Math.max(...this.mobs.filter(m => m.alive).map(m => m.speed), 0)
    const playerFirst = this.playerSpeed >= fastestMob

    this.phase = 'animating'   // block input while the banner shows
    this.showInitiativeBanner(playerFirst)

    if (playerFirst) {
      this.setLog('Choose a skill, then select a target.')
      this.time.delayedCall(1100, () => {
        if (this.phase === 'animating') this.phase = 'player_turn'
      })
    } else {
      this.setLog('The enemy moves first — brace yourself!', '#ff8888')
      this.time.delayedCall(1300, () => this.doEnemyTurn())
    }
  }

  private showInitiativeBanner(playerFirst: boolean) {
    const banner = this.add.text(
      GAME_WIDTH / 2, (HEADER_H + ENEMY_BOTTOM) / 2,
      playerFirst ? '⚡ You strike first!' : '⚠️ The enemy is faster!',
      {
        fontSize: '26px', fontFamily: 'Georgia, serif', fontStyle: 'bold',
        color: playerFirst ? '#ffe066' : '#ff7755',
        backgroundColor: '#000000bb', padding: { x: 26, y: 12 },
      },
    ).setOrigin(0.5, 0.5).setDepth(40).setAlpha(0)

    this.tweens.add({
      targets: banner, alpha: 1, duration: 200,
      onComplete: () => this.tweens.add({
        targets: banner, alpha: 0, delay: 800, duration: 300,
        onComplete: () => banner.destroy(),
      }),
    })
  }

  // ── Mob setup ─────────────────────────────────────────────────────────────

  private buildMobs() {
    const total  = this.battleData.mobs.length
    const perRow = Math.min(5, total)
    const rows   = total <= 5 ? 1 : 2

    const ROW_Y = [
      rows === 1 ? (HEADER_H + ENEMY_BOTTOM) / 2 - 10 : HEADER_H + 90,
      HEADER_H + 200,
    ]

    const rowCounts = rows === 1
      ? [total]
      : [perRow, total - perRow]

    let idx = 0
    const positions: { x: number; y: number }[] = []
    rowCounts.forEach((count, r) => {
      const spacing = Math.min(160, (GAME_WIDTH - 100) / Math.max(count, 1))
      const startX = GAME_WIDTH / 2 - ((count - 1) * spacing) / 2
      for (let c = 0; c < count; c++) {
        positions[idx++] = { x: startX + c * spacing, y: ROW_Y[r] }
      }
    })

    // Deterministic frame per mob: BiomeScene-chosen frame if provided,
    // otherwise picked from the difficulty tier pool, seeded by mob index.
    const pool = TD_MONSTERS[DIFFICULTIES[this.battleData.difficulty].pool]
    this.mobs = this.battleData.mobs.map((def, i) => ({
      ...def,
      hp: def.maxHp,
      alive: true,
      px: positions[i]?.x ?? GAME_WIDTH / 2,
      py: positions[i]?.y ?? 160,
      monsterFrame: def.frame ?? pool[i % pool.length],
      sprite: null, shadow: null, nameText: null, hpBarGfx: null, hitZone: null,
    }))
  }

  // ── Background ────────────────────────────────────────────────────────────

  private drawBackground() {
    const bg = this.add.graphics().setDepth(0)

    // Dark battle overlay
    bg.fillStyle(0x07060f, 1)
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)

    // Enemy arena
    bg.fillStyle(0x110c18, 1)
    bg.fillRect(0, HEADER_H, GAME_WIDTH, ENEMY_BOTTOM - HEADER_H)

    // Log strip
    bg.fillStyle(0x0a0814, 1)
    bg.fillRect(0, LOG_TOP, GAME_WIDTH, LOG_BOTTOM - LOG_TOP)

    // Skill strip
    bg.fillStyle(0x0d0b1a, 1)
    bg.fillRect(0, SKILL_TOP, GAME_WIDTH, SKILL_BTN_H + 8)

    // Player panel
    bg.fillStyle(0x080710, 1)
    bg.fillRect(0, PLAYER_PANEL_Y, GAME_WIDTH, GAME_HEIGHT - PLAYER_PANEL_Y)

    // Separator lines
    bg.lineStyle(1, 0x332244, 1)
    bg.lineBetween(0, HEADER_H, GAME_WIDTH, HEADER_H)
    bg.lineBetween(0, ENEMY_BOTTOM, GAME_WIDTH, ENEMY_BOTTOM)
    bg.lineBetween(0, LOG_BOTTOM, GAME_WIDTH, LOG_BOTTOM)
    bg.lineBetween(0, PLAYER_PANEL_Y, GAME_WIDTH, PLAYER_PANEL_Y)

    // Header
    const { biome, encounterIndex, totalEncounters, difficulty } = this.battleData
    const diffColor: Record<string, string> = Object.fromEntries(
      Object.values(DIFFICULTIES).map(d => [d.key, d.color]),
    )

    this.add.text(GAME_WIDTH / 2, HEADER_H / 2, '⚔  BATTLE  ⚔', {
      fontSize: '16px', fontFamily: 'Georgia, serif', color: '#ff5544', fontStyle: 'bold',
    }).setOrigin(0.5, 0.5).setDepth(2)

    this.add.text(12, HEADER_H / 2, `${biome}  ·  Encounter ${encounterIndex + 1}/${totalEncounters}`, {
      fontSize: '12px', fontFamily: 'Arial', color: '#888888',
    }).setOrigin(0, 0.5).setDepth(2)

    this.add.text(GAME_WIDTH - 12, HEADER_H / 2, difficulty.toUpperCase(), {
      fontSize: '11px', fontFamily: 'Arial', color: diffColor[difficulty],
      backgroundColor: '#00000088', padding: { x: 5, y: 2 },
    }).setOrigin(1, 0.5).setDepth(2)

    // Subtle arena grid
    const grid = this.add.graphics().setDepth(1).setAlpha(0.06)
    grid.lineStyle(1, 0x6644aa, 1)
    for (let x = 0; x < GAME_WIDTH; x += 64) {
      grid.lineBetween(x, HEADER_H, x, ENEMY_BOTTOM)
    }
    for (let y = HEADER_H; y < ENEMY_BOTTOM; y += 48) {
      grid.lineBetween(0, y, GAME_WIDTH, y)
    }
  }

  // ── Mob drawing ───────────────────────────────────────────────────────────

  private placeMobs() {
    this.mobs.forEach((mob, i) => this.renderMob(mob, i))
    this.refreshMobCount()
  }

  private renderMob(mob: ActiveMob, idx: number) {
    if (mob.sprite) this.tweens.killTweensOf(mob.sprite)
    mob.sprite?.destroy()
    mob.shadow?.destroy()
    mob.nameText?.destroy()
    mob.hpBarGfx?.destroy()
    mob.hitZone?.destroy()
    mob.sprite = null; mob.shadow = null; mob.nameText = null
    mob.hpBarGfx = null; mob.hitZone = null

    const { px, py, alive } = mob
    const scale = MOB_SCALE[this.battleData.difficulty] ?? 4

    // Shadow
    mob.shadow = this.add.ellipse(px + 3, py + 28, 52, 12, 0x000000, alive ? 0.4 : 0.15)
      .setDepth(4)

    // Monster sprite (Kenney Tiny Dungeon, archetype frame + tint)
    const baseTint = mob.tint ?? 0xffffff
    const sprite = this.add.sprite(px, py - 4, 'tiny_dungeon', mob.monsterFrame)
      .setScale(scale)
      .setDepth(5)
    mob.sprite = sprite
    if (!alive) {
      // Death state: darkened, faded
      sprite.setTint(0x444444).setAlpha(0.4)
    } else if (baseTint !== 0xffffff) {
      sprite.setTint(baseTint)
    }

    // HP bar
    const hpGfx = this.add.graphics().setDepth(5)
    mob.hpBarGfx = hpGfx
    if (alive) {
      const bw = 60, bh = 7, bx = px - bw / 2, by = py + 36
      hpGfx.fillStyle(0x222222, 1)
      hpGfx.fillRoundedRect(bx, by, bw, bh, 2)
      const pct = Math.max(0, mob.hp / mob.maxHp)
      const col = pct > 0.5 ? 0x44cc44 : pct > 0.25 ? 0xffcc00 : 0xff4444
      hpGfx.fillStyle(col, 1)
      hpGfx.fillRoundedRect(bx, by, Math.round(bw * pct), bh, 2)
      hpGfx.lineStyle(1, 0x000000, 0.5)
      hpGfx.strokeRoundedRect(bx, by, bw, bh, 2)
    }

    // Label
    const nameText = this.add.text(
      px, py + 46,
      alive ? `${mob.name}\nLv.${mob.level}  HP:${mob.hp}/${mob.maxHp}` : `${mob.name}\n💀 Defeated`,
      {
        fontSize: '10px', fontFamily: 'Arial',
        color: alive ? '#cccccc' : '#555555',
        align: 'center', lineSpacing: 2,
      }
    ).setOrigin(0.5, 0).setDepth(6)
    mob.nameText = nameText

    // Invisible hit zone when alive and in target_select phase
    if (alive) {
      const hit = this.add.rectangle(px, py, 60, 80, 0, 0)
        .setDepth(7)
        .setInteractive({ useHandCursor: true })
        .setName(`mob_${idx}`)
      hit.on('pointerover', () => {
        if (this.phase === 'target_select' && mob.alive) {
          sprite.setTint(0xff8866)
        }
      })
      hit.on('pointerout', () => {
        if (mob.alive) sprite.setTint(baseTint)   // restore archetype tint
      })
      hit.on('pointerdown', () => {
        if (this.phase === 'target_select' && mob.alive) this.fireSkillOnMob(idx)
      })
      mob.hitZone = hit
    }
  }

  private refreshMobCount() {
    // Clear old count label if present
    this.children.list
      .filter(c => c.getData && c.getData('isMobCount'))
      .forEach(c => c.destroy())

    const alive = this.mobs.filter(m => m.alive).length
    const t = this.add.text(GAME_WIDTH - 10, ENEMY_BOTTOM - 6, `${alive} remaining`, {
      fontSize: '10px', fontFamily: 'Arial', color: '#666666',
    }).setOrigin(1, 1).setDepth(6)
    t.setData('isMobCount', true)
  }

  // ── Log bar ───────────────────────────────────────────────────────────────

  private buildLogBar() {
    this.logText = this.add.text(GAME_WIDTH / 2, LOG_TOP + (LOG_BOTTOM - LOG_TOP) / 2, '', {
      fontSize: '15px', fontFamily: 'Georgia, serif', color: '#ccbbff',
      align: 'center', wordWrap: { width: GAME_WIDTH - 40 },
    }).setOrigin(0.5, 0.5).setDepth(5)
  }

  private setLog(msg: string, color = '#ccbbff') {
    this.logText.setText(msg).setColor(color)
  }

  // ── Owned skills ──────────────────────────────────────────────────────────

  /**
   * SECURITY: the bar only ever shows the basic Attack plus skills the SERVER
   * reports as purchased ('shop:unlocks'). A registry cache renders instantly
   * on battle start; the fresh server response replaces it moments later.
   */
  private loadOwnedSkills() {
    const cached = (this.registry.get('unlockedSkillIds') as string[]) ?? []
    this.applyOwnedSkills(cached)

    const socket = (window as typeof window & { __lumenSocket?: Socket }).__lumenSocket
    if (!socket) return

    const onUnlocks = (data: { unlockedSkills?: string[] }) => {
      const ids = data.unlockedSkills ?? []
      this.registry.set('unlockedSkillIds', ids)
      this.applyOwnedSkills(ids)
      // Rebuild now unless the player is mid-target-selection; resetSkillButtons
      // runs every turn anyway, so the update lands next turn at the latest.
      if (this.phase !== 'target_select') this.resetSkillButtons()
    }
    socket.on('shop:unlocks', onUnlocks)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      socket.off('shop:unlocks', onUnlocks)
    })
    socket.emit('shop:get_unlocks')
  }

  private applyOwnedSkills(ids: string[]) {
    const owned = ids
      .map(id => SKILL_MAP[id])
      .filter((s): s is CombatSkill => !!s)
      .sort((a, b) => a.tier - b.tier)
    this.battleSkills = [BASIC_ATTACK, ...owned.map(toBattleSkill)]
  }

  // ── Skill panel ───────────────────────────────────────────────────────────

  private buildSkillPanel() {
    const totalPages = Math.max(1, Math.ceil(this.battleSkills.length / MAX_SKILLS_PER_PAGE))
    this.skillPage = Phaser.Math.Clamp(this.skillPage, 0, totalPages - 1)
    const pageSkills = this.battleSkills.slice(
      this.skillPage * MAX_SKILLS_PER_PAGE,
      (this.skillPage + 1) * MAX_SKILLS_PER_PAGE,
    )

    const arrowSpace = totalPages > 1 ? 36 : 0
    const usableW = GAME_WIDTH - 40 - arrowSpace * 2
    const n      = pageSkills.length
    const btnW   = Math.min(220, usableW / n - 8)
    const gap    = n > 1 ? (usableW - n * btnW) / (n - 1) : 0
    const startX = 20 + arrowSpace + btnW / 2
    const btnY   = SKILL_TOP + SKILL_BTN_H / 2 + 4

    pageSkills.forEach((skill, i) => {
      const cx = startX + i * (btnW + gap)
      const c = this.makeSkillButton(skill, cx, btnY, btnW, SKILL_BTN_H - 4)
      this.skillButtons.push(c)
    })

    if (totalPages > 1) {
      this.makePageArrow(20, btnY, '◀', -1, this.skillPage > 0)
      this.makePageArrow(GAME_WIDTH - 20, btnY, '▶', +1, this.skillPage < totalPages - 1)

      const ind = this.add.container(GAME_WIDTH / 2, SKILL_TOP + 8).setDepth(6)
      ind.add(this.add.text(0, 0, `Page ${this.skillPage + 1}/${totalPages}`, {
        fontSize: '9px', fontFamily: 'Arial', color: '#666688',
      }).setOrigin(0.5, 0.5))
      this.skillButtons.push(ind)
    }
  }

  private makePageArrow(x: number, y: number, glyph: string, dir: number, enabled: boolean) {
    const c = this.add.container(x, y).setDepth(6)
    c.add(this.add.text(0, 0, glyph, {
      fontSize: '22px', fontFamily: 'Arial',
      color: enabled ? '#ffd700' : '#444455',
    }).setOrigin(0.5, 0.5))

    if (enabled) {
      const hit = this.add.rectangle(0, 0, 34, SKILL_BTN_H - 8, 0, 0)
        .setInteractive({ useHandCursor: true })
      hit.on('pointerdown', () => {
        if (this.phase !== 'player_turn' && this.phase !== 'target_select') return
        this.skillPage += dir
        this.selectedSkill = null
        this.resetSkillButtons()
        if (this.phase === 'target_select') {
          this.highlightAliveMobs(false)
          this.phase = 'player_turn'
        }
      })
      c.add(hit)
    }
    this.skillButtons.push(c)
  }

  private makeSkillButton(
    skill: Skill, cx: number, cy: number,
    bw: number, bh: number,
  ): Phaser.GameObjects.Container {
    const btn = this.add.container(cx, cy).setDepth(6)

    const fillIdle   = 0x1a1530
    const fillHover  = 0x2a2548
    const fillActive = 0x3a3060

    const g = this.add.graphics()
    this.skillBtnGfx.push(g)
    const draw = (fill: number, accent: number) => {
      g.clear()
      g.fillStyle(fill, 1)
      g.fillRoundedRect(-bw / 2, -bh / 2, bw, bh, 8)
      g.lineStyle(2, accent, 0.8)
      g.strokeRoundedRect(-bw / 2, -bh / 2, bw, bh, 8)
      // Bottom accent line
      g.lineStyle(3, accent, 0.5)
      g.lineBetween(-bw / 2 + 10, bh / 2, bw / 2 - 10, bh / 2)
    }
    draw(fillIdle, skill.color)

    const icon = this.add.text(0, -12, skill.icon, { fontSize: '20px' }).setOrigin(0.5, 0.5)
    const name = this.add.text(0, 8, skill.name, {
      fontSize: '11px', fontFamily: 'Arial', color: '#dddddd', fontStyle: 'bold',
    }).setOrigin(0.5, 0.5)
    const mp = skill.mpCost > 0 ? `  ·  ${skill.mpCost} MP` : ''
    const desc = this.add.text(0, 22, `${skill.damageMin}–${skill.damageMax} ${skill.isHeal ? 'HP' : 'dmg'}${mp}`, {
      fontSize: '9px', fontFamily: 'Arial',
      color: Phaser.Display.Color.IntegerToColor(skill.color).lighten(20).rgba,
    }).setOrigin(0.5, 0.5)

    const hit = this.add.rectangle(0, 0, bw, bh, 0, 0).setInteractive({ useHandCursor: true })
    hit.on('pointerover', () => {
      if (this.phase === 'player_turn' || this.phase === 'target_select') draw(fillHover, skill.color)
    })
    hit.on('pointerout', () => {
      const isSelected = this.selectedSkill?.id === skill.id
      draw(isSelected ? fillActive : fillIdle, skill.color)
    })
    hit.on('pointerdown', () => {
      if (this.phase !== 'player_turn' && this.phase !== 'target_select') return
      this.onSkillSelected(skill, draw, fillActive)
    })

    btn.add([g, icon, name, desc, hit])
    return btn
  }

  private onSkillSelected(
    skill: Skill,
    draw: (fill: number, accent: number) => void,
    fillActive: number,
  ) {
    // Mana gate — spells cost MP (the basic Attack is free).
    if (skill.mpCost > this.playerMana) {
      this.setLog(`Not enough mana for ${skill.name} (need ${skill.mpCost} MP).`, '#ff8888')
      return
    }

    // Reset all button backgrounds to idle (re-build is handled via resetSkillButtons on next turn)
    this.skillBtnGfx.forEach(bg => bg.clear())
    // Highlight selected button
    draw(fillActive, skill.color)

    this.selectedSkill = skill

    if (skill.isHeal) {
      // Heal fires immediately
      this.phase = 'animating'
      this.castHeal(skill)
    } else {
      this.phase = 'target_select'
      this.setLog(`${skill.icon}  ${skill.name} selected — click an enemy to attack!`, '#ffdd88')
      this.highlightAliveMobs(true)
    }
  }

  private highlightAliveMobs(on: boolean) {
    this.mobs.forEach(mob => {
      if (!mob.alive || !mob.sprite) return
      if (on) {
        this.tweens.add({
          targets: mob.sprite,
          alpha: { from: 0.7, to: 1 },
          duration: 500, yoyo: true, repeat: -1,
          ease: 'Sine.easeInOut',
        })
      } else {
        this.tweens.killTweensOf(mob.sprite)
        mob.sprite.setAlpha(1)
      }
    })
  }

  // ── Combat actions ────────────────────────────────────────────────────────

  private fireSkillOnMob(mobIdx: number) {
    if (this.phase !== 'target_select' || !this.selectedSkill) return
    this.phase = 'animating'

    this.highlightAliveMobs(false)

    const skill  = this.selectedSkill
    const mob    = this.mobs[mobIdx]
    const dmg    = Phaser.Math.Between(skill.damageMin, skill.damageMax)

    // Spend mana; KEEP the skill selected so the next turn resumes targeting
    // with it (sticky) — no need to re-pick the skill every attack.
    this.spendMana(skill.mpCost)

    // Flash mob
    this.cameras.main.shake(180, 0.006)
    this.cameras.main.flash(120, ...Phaser.Display.Color.IntegerToColor(skill.color).gl.slice(0, 3) as [number, number, number])

    mob.hp = Math.max(0, mob.hp - dmg)

    // Floating damage number
    this.spawnDmgLabel(mob.px, mob.py - 20, `-${dmg}`, skill.color)

    if (mob.hp <= 0) {
      mob.alive = false
      const xp = xpForMob(mob.level)
      this.xpGained += xp
      this.silverGained += silverForMob(mob.level, this.battleData.difficulty)
      this.setLog(`${skill.icon}  ${skill.name} hit ${mob.name} for ${dmg}!  Enemy defeated! (+${xp} XP)`, '#44ff88')
    } else {
      this.setLog(`${skill.icon}  ${skill.name} hit ${mob.name} for ${dmg} damage!`, '#44ffcc')
    }

    // Redraw mob
    this.renderMob(mob, mobIdx)
    this.refreshMobCount()

    // After brief pause → check victory or enemy turn
    this.time.delayedCall(900, () => {
      const anyAlive = this.mobs.some(m => m.alive)
      if (!anyAlive) {
        this.doVictory()
      } else {
        this.doEnemyTurn()
      }
    })
  }

  private castHeal(skill: Skill) {
    const amount = Phaser.Math.Between(skill.damageMin, skill.damageMax)
    this.spendMana(skill.mpCost)
    this.playerHp = Math.min(this.playerMaxHp, this.playerHp + amount)
    this.refreshPlayerPanel()
    this.cameras.main.flash(300, 0, 1, 0.3)

    this.setLog(`${skill.icon}  ${skill.name} restored ${amount} HP!`, '#44ff88')
    this.selectedSkill = null
    this.resetSkillButtons()

    this.time.delayedCall(900, () => this.doEnemyTurn())
  }

  private doEnemyTurn() {
    this.phase = 'enemy_turn'
    // Mobs act in descending speed order — the quickest strike first.
    const alive = this.mobs.filter(m => m.alive).sort((a, b) => b.speed - a.speed)
    if (alive.length === 0) { this.doVictory(); return }

    let delay = 0

    alive.forEach(mob => {
      this.time.delayedCall(delay, () => {
        // Damage = mob's stat-derived attack ± 15%, reduced by player defense.
        const raw = Phaser.Math.Between(
          Math.floor(mob.attack * 0.85),
          Math.ceil(mob.attack * 1.15),
        )
        const dmg = Math.max(1, raw - this.playerDefense)
        this.playerHp = Math.max(0, this.playerHp - dmg)
        this.refreshPlayerPanel()
        this.cameras.main.shake(80, 0.003)
        this.setLog(`${mob.name} attacks for ${dmg} damage!`, '#ff8888')

        if (this.playerHp <= 0) {
          this.time.delayedCall(700, () => this.doDefeat())
        }
      })
      delay += 600
    })

    // After all mobs attacked: regen mana, then back to player turn.
    this.time.delayedCall(delay + 400, () => {
      if (this.phase !== 'enemy_turn') return   // already ended
      if (this.playerHp <= 0) return            // defeat already triggered
      if (this.manaRegen > 0 && this.playerMana < this.playerMaxMana) {
        this.playerMana = Math.min(this.playerMaxMana, this.playerMana + this.manaRegen)
        this.refreshPlayerPanel()
      }
      this.resumePlayerTurn()
    })
  }

  /** Start the player's turn. If a damage skill is still selected and still
   *  affordable, resume targeting with it (sticky) so the player can just click
   *  an enemy; otherwise prompt for a skill. */
  private resumePlayerTurn() {
    const s = this.selectedSkill
    if (s && !s.isHeal && s.mpCost <= this.playerMana && this.mobs.some(m => m.alive)) {
      this.phase = 'target_select'
      this.setLog(`${s.icon}  ${s.name} ready — click an enemy!`, '#ffdd88')
      this.highlightAliveMobs(true)
    } else {
      this.selectedSkill = null
      this.phase = 'player_turn'
      this.resetSkillButtons()
      this.setLog('Your turn — choose a skill!')
    }
  }

  /** Deduct mana (clamped ≥ 0) and refresh the bar. */
  private spendMana(cost: number) {
    if (cost <= 0) return
    this.playerMana = Math.max(0, this.playerMana - cost)
    this.refreshPlayerPanel()
  }

  // ── Button state helpers ──────────────────────────────────────────────────

  private resetSkillButtons() {
    // Redraw all skill buttons to idle state
    // (full reset by destroying + rebuilding panel)
    this.skillButtons.forEach(b => b.destroy())
    this.skillBtnGfx = []
    this.skillButtons = []
    this.buildSkillPanel()
  }

  // ── Player panel ──────────────────────────────────────────────────────────

  private buildPlayerPanel() {
    const top = PLAYER_PANEL_Y
    this.add.graphics().setDepth(4)
      .lineStyle(1, 0x2a2a44, 1).lineBetween(0, top, GAME_WIDTH, top)
    this.add.text(16, top + 6, 'YOUR PARTY', {
      fontSize: '10px', fontFamily: 'Arial', color: '#666666', fontStyle: 'bold', letterSpacing: 2,
    }).setOrigin(0, 0).setDepth(5)

    // Four party slots across the bottom (only slot 0 — you — is filled today).
    const gap = 16
    const slotW = (GAME_WIDTH - gap * 5) / 4
    const cardY = top + 22
    const cardH = GAME_HEIGHT - cardY - 10

    for (let i = 0; i < 4; i++) {
      const cardX = gap + i * (slotW + gap)
      const cx = cardX + slotW / 2
      const filled = i === 0

      const bg = this.add.graphics().setDepth(4)
      bg.fillStyle(filled ? 0x161636 : 0x0e0e1c, filled ? 0.95 : 0.5)
      bg.fillRoundedRect(cardX, cardY, slotW, cardH, 10)
      bg.lineStyle(1, filled ? 0x4a4a7a : 0x222238, 1)
      bg.strokeRoundedRect(cardX, cardY, slotW, cardH, 10)

      if (!filled) {
        this.add.text(cx, cardY + cardH / 2, 'Empty', {
          fontSize: '13px', fontFamily: 'Arial', color: '#33334d', fontStyle: 'italic',
        }).setOrigin(0.5, 0.5).setDepth(5)
        continue
      }

      // Character sprite + name.
      const hero = this.add.sprite(cx, cardY + 44, 'character_idle', 12).setScale(1.8).setDepth(5)
      if (this.anims.exists('idle_down')) hero.play('idle_down')
      this.add.text(cx, cardY + 92, 'You', {
        fontSize: '13px', fontFamily: 'Georgia, serif', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0.5, 0.5).setDepth(5)

      // Click the card to inspect this character's gear + stats.
      this.add.text(cardX + slotW - 8, cardY + 6, 'ⓘ', {
        fontSize: '13px', fontFamily: 'Arial', color: '#7fa8ff',
      }).setOrigin(1, 0).setDepth(6)
      const cardZone = this.add.zone(cardX, cardY, slotW, cardH).setOrigin(0)
        .setDepth(7).setInteractive({ useHandCursor: true })
      cardZone.on('pointerover', () => {
        bg.clear()
        bg.fillStyle(0x1e1e44, 0.95).fillRoundedRect(cardX, cardY, slotW, cardH, 10)
        bg.lineStyle(2, 0x7fa8ff, 1).strokeRoundedRect(cardX, cardY, slotW, cardH, 10)
      })
      cardZone.on('pointerout', () => {
        bg.clear()
        bg.fillStyle(0x161636, 0.95).fillRoundedRect(cardX, cardY, slotW, cardH, 10)
        bg.lineStyle(1, 0x4a4a7a, 1).strokeRoundedRect(cardX, cardY, slotW, cardH, 10)
      })
      cardZone.on('pointerdown', () => this.showCharacterPanel())

      // HP + MP bar geometry for this slot.
      const barX = cardX + 14
      const barW = slotW - 28
      const hpY = cardY + 110
      const mpY = cardY + 134
      this.playerBars = { barX, barW, hpY, mpY }

      this.playerHpGfx  = this.add.graphics().setDepth(5)
      this.playerHpText = this.add.text(cx, hpY + 8, '', {
        fontSize: '10px', fontFamily: 'Arial', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0.5, 0.5).setDepth(6)
      this.playerMpGfx  = this.add.graphics().setDepth(5)
      this.playerMpText = this.add.text(cx, mpY + 7, '', {
        fontSize: '10px', fontFamily: 'Arial', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0.5, 0.5).setDepth(6)
    }

    this.refreshPlayerPanel()
  }

  private refreshPlayerPanel() {
    const { barX, barW, hpY, mpY } = this.playerBars

    // HP bar.
    this.playerHpGfx.clear()
    const hpPct = Math.max(0, Math.min(1, this.playerHp / this.playerMaxHp))
    this.playerHpGfx.fillStyle(0x222233, 1).fillRoundedRect(barX, hpY, barW, 16, 4)
    const hpCol = hpPct > 0.5 ? 0x44cc44 : hpPct > 0.25 ? 0xffcc00 : 0xff4444
    this.playerHpGfx.fillStyle(hpCol, 1).fillRoundedRect(barX, hpY, Math.round(barW * hpPct), 16, 4)
    this.playerHpText.setText(`${this.playerHp} / ${this.playerMaxHp}  HP`)

    // MP bar.
    this.playerMpGfx.clear()
    const mpPct = this.playerMaxMana > 0 ? Math.max(0, Math.min(1, this.playerMana / this.playerMaxMana)) : 0
    this.playerMpGfx.fillStyle(0x222233, 1).fillRoundedRect(barX, mpY, barW, 14, 4)
    this.playerMpGfx.fillStyle(0x3a78d8, 1).fillRoundedRect(barX, mpY, Math.round(barW * mpPct), 14, 4)
    this.playerMpText.setText(`${Math.floor(this.playerMana)} / ${this.playerMaxMana}  MP`)
  }

  // ── Character inspect (gear + stats) ────────────────────────────────────────

  /** Modal overlay showing the clicked party member's equipped gear and stats.
   *  Data comes from the server-pushed StatsStore + InventoryStore snapshots. */
  private showCharacterPanel() {
    if (this.charPanel) { this.charPanel.destroy(); this.charPanel = null; return } // toggle

    const stats = StatsStore.get()
    const eq = (InventoryStore.get()?.equipment ?? {}) as Record<string, ClientInventoryItem | undefined>
    const level = stats?.level ?? 1

    const RARITY: Record<string, string> = {
      common: '#cfd8dc', uncommon: '#66bb6a', rare: '#42a5f5', epic: '#ab47bc', legendary: '#ffb300',
    }
    const SLOTS: [string, string][] = [
      ['mainHand', 'Weapon'], ['offHand', 'Off-hand'], ['helm', 'Helm'], ['chest', 'Chest'],
      ['legs', 'Legs'], ['gloves', 'Gloves'], ['shoes', 'Boots'], ['belt', 'Belt'],
      ['necklace', 'Necklace'], ['ring1', 'Ring'], ['ring2', 'Ring'], ['earring', 'Earring'],
    ]

    const pw = 600, ph = 470
    const px = (GAME_WIDTH - pw) / 2, py = (GAME_HEIGHT - ph) / 2
    const c = this.add.container(0, 0).setDepth(50)
    this.charPanel = c
    const close = () => { c.destroy(); this.charPanel = null }

    // Dim backdrop — click anywhere outside the panel to close.
    const backdrop = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.6)
      .setOrigin(0).setInteractive()
    backdrop.on('pointerdown', close)
    c.add(backdrop)

    const g = this.add.graphics()
    g.fillStyle(0x12122a, 1).fillRoundedRect(px, py, pw, ph, 12)
    g.lineStyle(2, 0x4a4a7a, 1).strokeRoundedRect(px, py, pw, ph, 12)
    c.add(g)
    // Swallow clicks on the panel body so they don't fall through to the backdrop.
    c.add(this.add.zone(px, py, pw, ph).setOrigin(0).setInteractive())

    c.add(this.add.text(px + pw / 2, py + 22, `Your Hero  ·  Level ${level}`, {
      fontSize: '20px', fontFamily: 'Georgia, serif', color: '#ffd54f', fontStyle: 'bold',
    }).setOrigin(0.5))

    const closeBtn = this.add.text(px + pw - 16, py + 18, '✕', {
      fontSize: '18px', color: '#ff8888', fontStyle: 'bold',
    }).setOrigin(1, 0.5).setInteractive({ useHandCursor: true })
    closeBtn.on('pointerover', () => closeBtn.setColor('#ffbbbb'))
    closeBtn.on('pointerout', () => closeBtn.setColor('#ff8888'))
    closeBtn.on('pointerdown', close)
    c.add(closeBtn)

    // Left column — equipped gear.
    const colLX = px + 28
    let ly = py + 62
    c.add(this.add.text(colLX, ly, 'EQUIPPED GEAR', {
      fontSize: '12px', fontFamily: 'Arial', color: '#8888aa', fontStyle: 'bold',
    }))
    ly += 26
    for (const [key, label] of SLOTS) {
      const item = eq[key]
      c.add(this.add.text(colLX, ly, label, { fontSize: '12px', color: '#9a9ac0' }))
      c.add(item
        ? this.add.text(colLX + 92, ly, `${item.icon ?? ''} ${item.name}`, {
            fontSize: '12px', color: RARITY[item.rarity] ?? '#ffffff', fontStyle: 'bold',
          }).setWordWrapWidth(180)
        : this.add.text(colLX + 92, ly, '— empty —', { fontSize: '12px', color: '#55556e', fontStyle: 'italic' }))
      ly += 26
    }

    // Right column — attributes + derived stats.
    const colRX = px + pw / 2 + 18
    let ry = py + 62
    c.add(this.add.text(colRX, ry, 'STATS', {
      fontSize: '12px', fontFamily: 'Arial', color: '#8888aa', fontStyle: 'bold',
    }))
    ry += 26
    const rows = [...(stats?.attributes ?? []), ...(stats?.derived ?? [])]
    if (rows.length === 0) {
      c.add(this.add.text(colRX, ry, 'Stats not loaded yet.', { fontSize: '12px', color: '#9a9ac0' }))
    }
    for (const r of rows) {
      c.add(this.add.text(colRX, ry, r.label, { fontSize: '12px', color: '#9a9ac0' }))
      c.add(this.add.text(px + pw - 28, ry, r.isPercent ? `${r.total}%` : `${r.total}`, {
        fontSize: '12px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(1, 0))
      ry += 21
    }
  }

  // ── Floating damage labels ─────────────────────────────────────────────────

  private spawnDmgLabel(x: number, y: number, text: string, color: number) {
    const hex = Phaser.Display.Color.IntegerToColor(color).rgba
    const lbl = this.add.text(x, y, text, {
      fontSize: '22px', fontFamily: 'Georgia, serif',
      color: hex, fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5, 0.5).setDepth(20)
    this.tweens.add({
      targets: lbl,
      y: y - 60, alpha: 0,
      duration: 900, ease: 'Sine.easeOut',
      onComplete: () => lbl.destroy(),
    })
  }

  // ── End states ────────────────────────────────────────────────────────────

  private doVictory() {
    this.phase = 'victory'

    // Report the victory — the server awards XP/silver AND rolls item drops
    // (server-authoritative) from this encounter's level + difficulty, adding
    // any loot straight to the bag.
    const socket = (window as typeof window & { __lumenSocket?: Socket }).__lumenSocket
    const repLevel = Math.max(1, ...this.battleData.mobs.map(m => m.level))
    socket?.emit('player:award_xp', {
      xp: Math.min(this.xpGained, 500),
      silver: Math.min(this.silverGained, 5000),
      difficulty: this.battleData.difficulty,
      level: repLevel,
    })
    const onLoot = (data: { campaignComplete?: boolean; items?: { name: string; icon: string; rarity: string }[] }) => {
      // The campaign reward belongs to BiomeScene's victory screen — ignore it
      // here so this listener never consumes it out from under that screen.
      if (data?.campaignComplete) return
      socket?.off('combat:loot', onLoot)
      const items = data?.items ?? []
      if (!items.length || !this.scene.isActive()) return
      const txt = items.map(it => `${it.icon} ${it.name}`).join(', ')
      this.setLog(`💎  Loot: ${txt}!  (+${this.xpGained} XP)`, '#9be7ff')
    }
    socket?.on('combat:loot', onLoot)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => socket?.off('combat:loot', onLoot))

    this.cameras.main.flash(600, 1, 0.84, 0)
    this.setLog(`⚔  All enemies defeated!  +${this.xpGained} XP  ·  +${this.silverGained} silver!`, '#ffd700')

    this.time.delayedCall(1400, () => {
      this.endBattle({ victory: true, playerHp: this.playerHp, xpGained: this.xpGained })
    })
  }

  private doDefeat() {
    this.phase = 'defeat'
    this.cameras.main.flash(600, 0.8, 0, 0)
    this.setLog('💀  You have been defeated...', '#ff4444')
    this.time.delayedCall(1600, () => {
      this.endBattle({ victory: false, playerHp: 0, xpGained: this.xpGained })
    })
  }

  private endBattle(result: BattleResult) {
    const biomeScene = this.scene.get('BiomeScene') as BiomeScene
    biomeScene.onBattleResult(result)
    this.scene.stop()
    this.scene.resume('BiomeScene')
  }
}
