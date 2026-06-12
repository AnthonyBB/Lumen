// ============================================================
// PartyManualBattleScene — hand-played party combat (live campaigns).
//
// You manually command ALL party members: on each ally's turn you pick its skill
// and target. Enemies act on a simple AI. The party's combat data comes from the
// server (party:combat_data); rewards (per-character XP) are granted server-side
// via campaign:report. Idle / "auto" mode uses the separate PartyBattleScene
// animator. See docs/CHARACTERS_DESIGN.md §5.
//
// Layout (top → bottom): header · enemy arena · turn/log strip · skill bar ·
// a fixed 4-slot ally grid at the bottom (left-filled). The active unit is shown
// with a soft glow (not a hard border), and each character remembers its last
// chosen skill so it stays pre-selected on its next turn.
// ============================================================

import Phaser from 'phaser'
import type { Socket } from 'socket.io-client'
import { GAME_WIDTH, GAME_HEIGHT } from '../constants'
import { BASIC_ATTACK, type Skill } from '../data/skills'
import { SKILL_MAP, skillRankMultiplier } from '../data/skillTrees'
import { rankMultiplier } from '../data/adventureRanks'
import { RankStore } from '../systems/RankStore'
import { toBattleSkill } from './BattleScene'
import type { BiomeScene } from './BiomeScene'
import type { BattleResult, MobDef } from './BattleScene'

/** A party member's combat data (server party:combat_data). */
export interface ClientCombatant {
  id: string; name: string; class: string; level: number
  maxHp: number; attack: number; defense: number; speed: number
  maxMana: number; healing: number
  basicAttack: { min: number; max: number }
  skillRanks: Record<string, number>
  strategyLoadout: string[]
}

export interface PartyManualData {
  allies: ClientCombatant[]
  mobs: MobDef[]
  difficulty: string
  level: number
  campaignComplete: boolean
}

interface Unit {
  id: string; name: string; side: 'ally' | 'enemy'
  maxHp: number; hp: number; maxMana: number; mana: number
  attack: number; defense: number; speed: number; healing: number
  basicAttack: { min: number; max: number }
  skills: Skill[]
  alive: boolean
  lastSkillId?: string   // remembered selection between rounds (allies)
  // status
  dots: { perTurn: number; rounds: number }[]
  hots: { perTurn: number; rounds: number }[]
  defenseDown: number; defenseDownRounds: number
  slow: number; slowRounds: number
  stunRounds: number; asleepRounds: number
  shield: number
  buffAtk: number; buffDef: number; buffSpd: number; buffRounds: number
  defending: boolean
  // view
  x: number; y: number
  container: Phaser.GameObjects.Container
  sprite: Phaser.GameObjects.Sprite
  baseTint: number
  glow: Phaser.GameObjects.Graphics   // soft active/target highlight (behind sprite)
  hpBar: Phaser.GameObjects.Graphics
  hpText: Phaser.GameObjects.Text
  mpBar: Phaser.GameObjects.Graphics | null
}

// ── Framed arena zones (top → bottom) ───────────────────────────────────────
const HEADER_H     = 48
const ENEMY_BOTTOM = 292
const LOG_BOTTOM   = 340   // turn hint + log strip:  ENEMY_BOTTOM → LOG_BOTTOM
const SKILL_BOTTOM = 476   // skill bar zone:          LOG_BOTTOM   → SKILL_BOTTOM
const ENEMY_ROW_Y  = HEADER_H + (ENEMY_BOTTOM - HEADER_H) / 2
const SKILL_Y      = LOG_BOTTOM + (SKILL_BOTTOM - LOG_BOTTOM) / 2
const ALLY_ROW_Y   = 588

// Fixed 4-slot ally grid at the bottom (a single character sits in the left slot).
const ALLY_SLOTS    = 4
const ALLY_SLOT_W   = 150
const ALLY_SLOT_GAP = 20
const ALLY_BLOCK_W  = ALLY_SLOTS * ALLY_SLOT_W + (ALLY_SLOTS - 1) * ALLY_SLOT_GAP
const ALLY_GRID_LEFT = (GAME_WIDTH - ALLY_BLOCK_W) / 2
const ALLY_SLOT_CY  = (SKILL_BOTTOM + GAME_HEIGHT) / 2

const allySlotX = (i: number): number =>
  ALLY_GRID_LEFT + ALLY_SLOT_W / 2 + i * (ALLY_SLOT_W + ALLY_SLOT_GAP)

export class PartyManualBattleScene extends Phaser.Scene {
  private battleData!: PartyManualData
  private allies: Unit[] = []
  private enemies: Unit[] = []
  private order: Unit[] = []
  private turnIdx = 0
  private round = 0
  private phase: 'idle' | 'ally_input' | 'target_select' | 'animating' | 'done' = 'idle'
  private active: Unit | null = null
  private pendingSkill: Skill | null = null
  private selectedSkillId: string | null = null
  private rankMult = 1

  private logText!: Phaser.GameObjects.Text
  private roundText!: Phaser.GameObjects.Text
  private hintText!: Phaser.GameObjects.Text
  private skillButtons: Phaser.GameObjects.Container[] = []
  private targetHits: Phaser.GameObjects.Rectangle[] = []
  private targetUnits: Unit[] = []

  constructor() { super({ key: 'PartyManualBattleScene' }) }

  init(data: PartyManualData) {
    this.battleData = data
    this.allies = []; this.enemies = []; this.order = []
    this.turnIdx = 0; this.round = 0; this.phase = 'idle'
    this.active = null; this.pendingSkill = null; this.selectedSkillId = null
    this.skillButtons = []; this.targetHits = []; this.targetUnits = []
    this.rankMult = rankMultiplier(RankStore.get())
  }

  create() {
    this.drawArena()

    this.roundText = this.add.text(GAME_WIDTH - 12, HEADER_H / 2, '', {
      fontSize: '14px', fontFamily: 'Georgia, serif', color: '#ffd54f', fontStyle: 'bold',
    }).setOrigin(1, 0.5).setDepth(20)
    this.hintText = this.add.text(GAME_WIDTH / 2, ENEMY_BOTTOM + (LOG_BOTTOM - ENEMY_BOTTOM) / 2 - 8, '', {
      fontSize: '14px', fontFamily: 'Arial', color: '#9be7ff', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(20)
    this.logText = this.add.text(GAME_WIDTH / 2, ENEMY_BOTTOM + (LOG_BOTTOM - ENEMY_BOTTOM) / 2 + 10, '', {
      fontSize: '12px', fontFamily: 'Arial', color: '#cdd6f4',
    }).setOrigin(0.5).setDepth(20)

    // Build units.
    this.allies = this.battleData.allies.map((c, i) => this.makeAlly(c, i))
    this.enemies = this.battleData.mobs.map((m, i) => this.makeEnemy(m, i, this.battleData.mobs.length))
    // Render HP/MP bars immediately so panels aren't blank before the first hit.
    for (const u of [...this.allies, ...this.enemies]) this.drawBars(u)

    this.time.delayedCall(500, () => this.startRound())
  }

  /** Framed arena background: zone fills, separators, a faint enemy-zone grid, a
   *  header bar and the four ally slot frames at the bottom. */
  private drawArena() {
    const bg = this.add.graphics().setDepth(0)
    bg.fillStyle(0x07060f, 1).fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)
    bg.fillStyle(0x110c18, 1).fillRect(0, HEADER_H, GAME_WIDTH, ENEMY_BOTTOM - HEADER_H)   // enemy arena
    bg.fillStyle(0x0a0814, 1).fillRect(0, ENEMY_BOTTOM, GAME_WIDTH, LOG_BOTTOM - ENEMY_BOTTOM) // log strip
    bg.fillStyle(0x0d0b1a, 1).fillRect(0, LOG_BOTTOM, GAME_WIDTH, SKILL_BOTTOM - LOG_BOTTOM)    // skill bar
    bg.fillStyle(0x0d0a16, 1).fillRect(0, SKILL_BOTTOM, GAME_WIDTH, GAME_HEIGHT - SKILL_BOTTOM) // ally grid

    bg.lineStyle(1, 0x332244, 1)
    for (const y of [HEADER_H, ENEMY_BOTTOM, LOG_BOTTOM, SKILL_BOTTOM]) bg.lineBetween(0, y, GAME_WIDTH, y)

    // Faint arena grid behind the enemies.
    const grid = this.add.graphics().setDepth(1).setAlpha(0.06)
    grid.lineStyle(1, 0x6644aa, 1)
    for (let x = 0; x < GAME_WIDTH; x += 64) grid.lineBetween(x, HEADER_H, x, ENEMY_BOTTOM)
    for (let y = HEADER_H; y < ENEMY_BOTTOM; y += 48) grid.lineBetween(0, y, GAME_WIDTH, y)

    // Ally slot frames — a row of four, so an under-full party reads as a grid.
    const slots = this.add.graphics().setDepth(1)
    const sh = GAME_HEIGHT - SKILL_BOTTOM - 28
    for (let i = 0; i < ALLY_SLOTS; i++) {
      const x = allySlotX(i)
      slots.fillStyle(0x12101f, 0.55).fillRoundedRect(x - ALLY_SLOT_W / 2, ALLY_SLOT_CY - sh / 2, ALLY_SLOT_W, sh, 12)
      slots.lineStyle(1, 0x2a2740, 0.9).strokeRoundedRect(x - ALLY_SLOT_W / 2, ALLY_SLOT_CY - sh / 2, ALLY_SLOT_W, sh, 12)
    }

    // Header bar.
    this.add.text(GAME_WIDTH / 2, HEADER_H / 2, '⚔  BATTLE  ⚔', {
      fontSize: '16px', fontFamily: 'Georgia, serif', color: '#ff5544', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(2)
    this.add.text(12, HEADER_H / 2, `${this.battleData.difficulty.toUpperCase()}  ·  Lv ${this.battleData.level}`, {
      fontSize: '12px', fontFamily: 'Arial', color: '#888888',
    }).setOrigin(0, 0.5).setDepth(2)
  }

  // ── Unit construction ─────────────────────────────────────────────────────

  private buildSkills(c: ClientCombatant): Skill[] {
    const basic: Skill = { ...BASIC_ATTACK, damageMin: c.basicAttack.min, damageMax: c.basicAttack.max }
    const owned = Object.entries(c.skillRanks)
      .filter(([, r]) => r >= 1)
      .map(([id, rank]) => {
        const cs = SKILL_MAP[id]
        return cs ? toBattleSkill(cs, this.rankMult * skillRankMultiplier(rank)) : null
      })
      .filter((s): s is Skill => !!s)
    return [basic, ...owned]
  }

  private baseUnit(side: 'ally' | 'enemy', x: number, y: number): Omit<Unit, 'id' | 'name' | 'maxHp' | 'hp' | 'maxMana' | 'mana' | 'attack' | 'defense' | 'speed' | 'healing' | 'basicAttack' | 'skills' | 'container' | 'sprite' | 'baseTint' | 'glow' | 'hpBar' | 'hpText' | 'mpBar'> {
    return {
      side, alive: true, dots: [], hots: [], defenseDown: 0, defenseDownRounds: 0,
      slow: 0, slowRounds: 0, stunRounds: 0, asleepRounds: 0, shield: 0,
      buffAtk: 0, buffDef: 0, buffSpd: 0, buffRounds: 0, defending: false, x, y,
    }
  }

  private makeAlly(c: ClientCombatant, i: number): Unit {
    const x = allySlotX(i); const y = ALLY_ROW_Y
    const view = this.drawUnitView(c.name, 'ally', x, y, { withMp: true })
    return {
      ...this.baseUnit('ally', x, y),
      id: c.id, name: c.name, maxHp: c.maxHp, hp: c.maxHp, maxMana: c.maxMana, mana: c.maxMana,
      attack: c.attack, defense: c.defense, speed: c.speed, healing: c.healing,
      basicAttack: c.basicAttack, skills: this.buildSkills(c), ...view,
    }
  }

  private makeEnemy(m: MobDef, i: number, n: number): Unit {
    const x = this.enemySlotX(i, n); const y = ENEMY_ROW_Y
    const view = this.drawUnitView(m.name, 'enemy', x, y, {
      frame: m.frame ?? 0, tint: m.tint ?? 0xffffff, level: m.level,
    })
    return {
      ...this.baseUnit('enemy', x, y),
      id: `e${i}`, name: m.name, maxHp: m.maxHp, hp: m.maxHp, maxMana: 0, mana: 0,
      attack: m.attack, defense: m.defense, speed: m.speed, healing: 0,
      basicAttack: { min: m.attack, max: Math.round(m.attack * 1.25) },
      skills: [], ...view,
    }
  }

  private enemySlotX(i: number, n: number): number {
    const slotW = Math.min(230, (GAME_WIDTH - 80) / Math.max(1, n))
    return (GAME_WIDTH - n * slotW) / 2 + slotW / 2 + i * slotW
  }

  /** Build a unit's on-screen view: a soft glow (behind), a real sprite
   *  (Tiny-Dungeon mob / hero) with a ground shadow, a name label, an HP bar
   *  (+ MP bar for allies). The glow — not a hard border — marks active/target. */
  private drawUnitView(
    name: string, side: 'ally' | 'enemy', x: number, y: number,
    opts: { withMp?: boolean; frame?: number; tint?: number; level?: number },
  ) {
    const ally = side === 'ally'
    const c = this.add.container(x, y).setDepth(5)

    // Soft highlight glow (hidden until active / targetable) — drawn behind sprite.
    const glow = this.add.graphics(); c.add(glow)

    // Ground shadow.
    c.add(this.add.ellipse(0, 30, 54, 14, 0x000000, 0.4))

    // Sprite — hero (character_idle) or monster (tiny_dungeon, archetype frame+tint).
    const baseTint = opts.tint ?? 0xffffff
    const sprite = ally
      ? this.add.sprite(0, -6, 'character_idle', 12).setScale(2.4)
      : this.add.sprite(0, -6, 'tiny_dungeon', opts.frame ?? 0).setScale(3.2)
    if (!ally && baseTint !== 0xffffff) sprite.setTint(baseTint)
    c.add(sprite)

    // Name label above the sprite (enemies append their level, kept short to fit).
    const label = opts.level != null ? `${this.truncate(name, 13)} Lv.${opts.level}` : this.truncate(name, 16)
    c.add(this.add.text(0, -52, label, {
      fontSize: '12px', fontFamily: 'Georgia, serif', color: ally ? '#cfe0ff' : '#ffd0d0',
      fontStyle: 'bold', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5))

    // HP bar (+ HP text) below the sprite; MP bar for allies.
    const hpBar = this.add.graphics(); c.add(hpBar)
    const hpText = this.add.text(0, 54, '', {
      fontSize: '11px', fontFamily: 'Arial', color: '#cdd6f4',
    }).setOrigin(0.5); c.add(hpText)
    let mpBar: Phaser.GameObjects.Graphics | null = null
    if (opts.withMp) { mpBar = this.add.graphics(); c.add(mpBar) }

    return { container: c, sprite, baseTint, glow, hpBar, hpText, mpBar }
  }

  private truncate(s: string, max: number): string {
    return s.length > max ? s.slice(0, max - 1) + '…' : s
  }

  private static readonly BAR_W = 96

  private drawBars(u: Unit) {
    const w = PartyManualBattleScene.BAR_W
    u.hpBar.clear()
    u.hpBar.fillStyle(0x222222, 1).fillRoundedRect(-w / 2, 40, w, 9, 2)
    const hp = Math.max(0, u.hp / u.maxHp)
    u.hpBar.fillStyle(hp > 0.5 ? 0x44cc66 : hp > 0.25 ? 0xffcc44 : 0xff4d4d, 1)
      .fillRoundedRect(-w / 2, 40, Math.round(w * hp), 9, 2)
    u.hpBar.lineStyle(1, 0x000000, 0.5).strokeRoundedRect(-w / 2, 40, w, 9, 2)
    if (u.shield > 0) u.hpBar.fillStyle(0x88ccff, 0.9).fillRect(-w / 2, 37, Math.min(w, u.shield), 3)
    u.hpText.setText(`${u.hp} / ${u.maxHp}`)
    if (u.mpBar && u.maxMana > 0) {
      u.mpBar.clear()
      u.mpBar.fillStyle(0x000000, 0.5).fillRoundedRect(-w / 2, 64, w, 5, 2)
      u.mpBar.fillStyle(0x5a8cff, 1).fillRoundedRect(-w / 2, 64, Math.round(w * (u.mana / u.maxMana)), 5, 2)
    }
  }

  // ── Highlight glow (replaces the hard selection border) ─────────────────────

  private setGlow(u: Unit, color: number, pulse: boolean) {
    this.tweens.killTweensOf(u.glow)
    u.glow.clear().setAlpha(1)
    u.glow.fillStyle(color, 0.14).fillEllipse(0, 2, 128, 138)
    u.glow.fillStyle(color, 0.22).fillEllipse(0, 0, 86, 98)
    if (pulse) {
      this.tweens.add({
        targets: u.glow, alpha: { from: 0.5, to: 1 },
        duration: 650, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      })
    }
  }

  private clearGlow(u: Unit) {
    this.tweens.killTweensOf(u.glow)
    u.glow.clear().setAlpha(1)
  }

  private highlightActive(u: Unit) {
    for (const x of [...this.allies, ...this.enemies]) this.clearGlow(x)
    this.setGlow(u, 0xffd54f, true)
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  private living(side: 'ally' | 'enemy') { return (side === 'ally' ? this.allies : this.enemies).filter(u => u.alive) }
  private foesOf(u: Unit) { return this.living(u.side === 'ally' ? 'enemy' : 'ally') }
  private friendsOf(u: Unit) { return this.living(u.side) }
  private effSpeed(u: Unit) { return Math.max(1, Math.round(u.speed * (1 + u.buffSpd / 100) - u.slow)) }
  private effDef(u: Unit) { return Math.max(0, u.defense * (1 + u.buffDef / 100) - u.defenseDown) }

  // ── Round / turn loop ──────────────────────────────────────────────────────

  private startRound() {
    this.round++
    this.roundText.setText(`Round ${this.round}`)
    // Start-of-round ticks + clear "defending".
    for (const u of [...this.allies, ...this.enemies]) {
      if (!u.alive) continue
      u.defending = false
      for (const d of u.dots) { if (d.rounds > 0) { this.damageUnit(u, u, d.perTurn, '#ff8844'); d.rounds-- } }
      for (const h of u.hots) { if (h.rounds > 0 && u.alive) { this.healUnit(u, u, h.perTurn); h.rounds-- } }
      u.dots = u.dots.filter(d => d.rounds > 0); u.hots = u.hots.filter(h => h.rounds > 0)
    }
    this.order = [...this.allies, ...this.enemies].filter(u => u.alive).sort((a, b) => this.effSpeed(b) - this.effSpeed(a))
    this.turnIdx = 0
    this.nextTurn()
  }

  private nextTurn() {
    if (this.checkEnd()) return
    if (this.turnIdx >= this.order.length) {
      // end-of-round status decay
      for (const u of [...this.allies, ...this.enemies]) {
        if (u.defenseDownRounds > 0 && --u.defenseDownRounds === 0) u.defenseDown = 0
        if (u.slowRounds > 0 && --u.slowRounds === 0) u.slow = 0
        if (u.stunRounds > 0) u.stunRounds--
        if (u.asleepRounds > 0 && u.asleepRounds < 99) u.asleepRounds--
        if (u.buffRounds > 0 && --u.buffRounds === 0) { u.buffAtk = 0; u.buffDef = 0; u.buffSpd = 0 }
      }
      this.startRound(); return
    }
    const u = this.order[this.turnIdx]
    if (!u.alive) { this.turnIdx++; this.nextTurn(); return }
    if (u.maxMana > 0) u.mana = Math.min(u.maxMana, u.mana + 2)
    if (u.stunRounds > 0) { this.setLog(`${u.name} is stunned!`); this.advance(); return }
    if (u.asleepRounds > 0) { this.setLog(`${u.name} is asleep…`); this.advance(); return }

    this.highlightActive(u)
    if (u.side === 'enemy') {
      this.phase = 'animating'
      this.time.delayedCall(450, () => { this.enemyAct(u); this.advance() })
    } else {
      this.phase = 'ally_input'
      this.active = u
      this.showSkillBar(u)
      this.hintText.setText(`${u.name}'s turn — choose an action`)
    }
  }

  private advance() { this.turnIdx++; this.time.delayedCall(220, () => this.nextTurn()) }

  // ── Enemy AI ───────────────────────────────────────────────────────────────
  private enemyAct(u: Unit) {
    const targets = this.living('ally')
    if (targets.length === 0) return
    const tgt = targets.reduce((a, b) => (b.hp < a.hp ? b : a))
    this.setLog(`${u.name} attacks ${tgt.name}`)
    this.basicHit(u, tgt)
  }

  // ── Manual ally input ──────────────────────────────────────────────────────

  /** Square skill buttons, centred in the skill bar zone (above the ally grid).
   *  The character's remembered skill (or its first usable one) starts selected. */
  private showSkillBar(u: Unit) {
    const remembered = u.lastSkillId && u.skills.some(s => s.id === u.lastSkillId) ? u.lastSkillId : null
    this.selectedSkillId = remembered ?? u.skills[0]?.id ?? null
    this.renderSkillBar(u)
  }

  private renderSkillBar(u: Unit) {
    this.clearSkillBar()
    const n = u.skills.length
    const gap = 14
    const size = Math.min(112, Math.floor((GAME_WIDTH - 60) / n) - gap)  // square side
    const total = n * size + (n - 1) * gap
    const startX = (GAME_WIDTH - total) / 2 + size / 2
    u.skills.forEach((s, i) => {
      const x = startX + i * (size + gap)
      const enabled = s.mpCost <= u.mana
      const selected = this.selectedSkillId === s.id
      this.skillButtons.push(this.makeSkillButton(s, x, SKILL_Y, size, enabled, selected))
    })
  }

  private makeSkillButton(s: Skill, x: number, y: number, size: number, enabled: boolean, selected: boolean) {
    const c = this.add.container(x, y).setDepth(15)
    const g = this.add.graphics(); c.add(g)
    this.paintSkillButton(g, s, size, enabled, selected)

    c.add(this.add.text(0, -size / 2 + 12, `${s.icon} ${s.name}`, {
      fontSize: '11px', fontFamily: 'Arial', color: enabled ? '#ffffff' : '#776', fontStyle: 'bold',
      align: 'center', wordWrap: { width: size - 12 },
    }).setOrigin(0.5, 0))

    const label = s.powerLabel || (s.isHeal ? `Heal ${s.damageMin}` : `${s.damageMin}–${s.damageMax}`)
    c.add(this.add.text(0, -4, label, {
      fontSize: '9px', fontFamily: 'Arial', color: enabled ? '#bcd6ff' : '#665',
      align: 'center', wordWrap: { width: size - 12 }, lineSpacing: 1,
    }).setOrigin(0.5, 0))

    if (s.mpCost > 0) {
      c.add(this.add.text(0, size / 2 - 18, `${s.mpCost} MP`, {
        fontSize: '10px', fontFamily: 'Arial', color: enabled ? '#8ab6ff' : '#556', fontStyle: 'bold',
      }).setOrigin(0.5, 0))
    }

    const hit = this.add.rectangle(0, 0, size, size, 0, 0).setInteractive({ useHandCursor: enabled })
    if (enabled) {
      hit.on('pointerover', () => this.paintSkillButton(g, s, size, true, true))
      hit.on('pointerout', () => this.paintSkillButton(g, s, size, true, this.selectedSkillId === s.id))
      hit.on('pointerdown', () => this.onSkillClick(s))
    }
    c.add(hit)
    return c
  }

  private paintSkillButton(g: Phaser.GameObjects.Graphics, s: Skill, size: number, enabled: boolean, selected: boolean) {
    const w = size, h = size
    g.clear()
    const fill = !enabled ? 0x18141e : selected ? 0x223158 : 0x141a30
    g.fillStyle(fill, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 10)
    const border = !enabled ? 0x443a4a : selected ? 0xffd54f : s.color
    g.lineStyle(selected ? 3 : 2, border, selected ? 1 : 0.85).strokeRoundedRect(-w / 2, -h / 2, w, h, 10)
    if (selected && enabled) g.lineStyle(1, 0xffe9a0, 0.5).strokeRoundedRect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6, 8)
  }

  private clearSkillBar() { this.skillButtons.forEach(b => b.destroy()); this.skillButtons = [] }

  /** Clear the target-pick highlights + hit zones (keeps the active glow). */
  private clearTargetSelection() {
    this.targetHits.forEach(h => h.destroy()); this.targetHits = []
    for (const t of this.targetUnits) if (t !== this.active) this.clearGlow(t)
    this.targetUnits = []
  }

  private onSkillClick(s: Skill) {
    if (this.phase !== 'ally_input' && this.phase !== 'target_select') return
    if (!this.active || s.mpCost > this.active.mana) return
    // Visible response: this skill becomes the selection (and is remembered).
    this.selectedSkillId = s.id
    this.active.lastSkillId = s.id
    this.clearTargetSelection()
    this.renderSkillBar(this.active)
    this.chooseSkill(s)
  }

  private chooseSkill(s: Skill) {
    const u = this.active!
    if (s.targeting === 'self') { this.castSkill(u, s, [u]); return }
    if (s.targeting === 'aoe') { this.castSkill(u, s, this.foesOf(u)); return }
    // single — pick a target (enemy for damage, ally for heal).
    this.pendingSkill = s
    this.phase = 'target_select'
    const targets = s.isHeal ? this.friendsOf(u) : this.foesOf(u)
    this.targetUnits = targets
    this.hintText.setText(`Choose a target for ${s.name}`)
    for (const t of targets) {
      this.setGlow(t, s.isHeal ? 0x66ff99 : 0xff6666, true)
      const hit = this.add.rectangle(t.x, t.y, 100, 120, 0, 0)
        .setInteractive({ useHandCursor: true }).setDepth(16)
      hit.on('pointerdown', () => {
        if (this.phase !== 'target_select') return
        this.castSkill(u, this.pendingSkill!, [t])
      })
      this.targetHits.push(hit)
    }
  }

  // ── Skill resolution ───────────────────────────────────────────────────────
  private castSkill(caster: Unit, skill: Skill, targets: Unit[]) {
    this.clearTargetSelection()
    this.clearSkillBar()
    this.hintText.setText('')
    this.phase = 'animating'
    caster.mana = Math.max(0, caster.mana - skill.mpCost)
    this.setLog(`${caster.name} uses ${skill.name}`)

    if (skill.id === 'attack') {
      if (targets[0]) this.basicHit(caster, targets[0])
    } else {
      this.applyEffects(caster, skill, targets)
    }
    this.active = null
    this.pendingSkill = null
    this.advance()
  }

  private basicHit(src: Unit, tgt: Unit) {
    const raw = Math.round(Phaser.Math.Between(src.basicAttack.min, src.basicAttack.max) * (1 + src.buffAtk / 100))
    this.damageUnit(src, tgt, raw, '#ff6464')
  }

  /** Port of the server resolver's effect engine (party-aware). */
  private applyEffects(src: Unit, skill: Skill, targets: Unit[]) {
    for (const e of skill.effects) {
      switch (e.type) {
        case 'damage':
        case 'aoe': {
          let total = 0
          for (const t of targets) {
            let v = Math.round(Phaser.Math.Between(Math.round(e.value * 0.85), Math.round(e.value * 1.15)) * (1 + src.buffAtk / 100))
            const exe = skill.effects.find(x => x.type === 'execute')
            if (exe && t.hp / t.maxHp <= 0.3) v = Math.round(v * (1 + exe.value / 100))
            total += this.damageUnit(src, t, v, '#ff6464')
          }
          const ls = skill.effects.find(x => x.type === 'lifesteal')
          if (ls && total > 0) this.healUnit(src, src, Math.round(total * ls.value / 100))
          break
        }
        case 'heal': for (const t of targets) this.healUnit(src, t, e.value); break
        case 'hot': src.hots.push({ perTurn: e.value, rounds: e.duration ?? 3 }); break
        case 'shield': src.shield += e.value; this.drawBars(src); break
        case 'team_buff': {
          const r = e.duration ?? 3
          for (const a of this.friendsOf(src)) {
            if (e.stat === 'defense') a.buffDef += e.value
            else if (e.stat === 'speed') a.buffSpd += e.value
            else a.buffAtk += e.value
            a.buffRounds = Math.max(a.buffRounds, r)
          }
          break
        }
        case 'dot': case 'bleed': case 'poison':
          for (const t of targets) t.dots.push({ perTurn: e.value, rounds: e.duration ?? 3 }); break
        case 'pierce':
          for (const t of targets) { t.defenseDown = Math.max(t.defenseDown, e.value); t.defenseDownRounds = Math.max(t.defenseDownRounds, e.duration ?? 2) }; break
        case 'slow':
          for (const t of targets) { t.slow = Math.max(t.slow, e.value); t.slowRounds = Math.max(t.slowRounds, e.duration ?? 2) }; break
        case 'stun':
          for (const t of targets) if (Math.random() < (e.chance ?? 0.9)) { t.stunRounds = Math.max(t.stunRounds, e.duration ?? 1); this.float(t, 'STUN', '#ffee66') }; break
        case 'sleep':
          for (const t of targets) if (Math.random() < (e.chance ?? 0.7)) { t.asleepRounds = Math.max(t.asleepRounds, e.duration ?? 99); this.float(t, 'SLEEP', '#99ccff') }; break
      }
    }
  }

  private damageUnit(_src: Unit, tgt: Unit, raw: number, color: string): number {
    if (!tgt.alive) return 0
    let dmg = Math.max(1, Math.round(raw - this.effDef(tgt) * 0.5))
    if (tgt.defending) dmg = Math.max(1, Math.round(dmg * 0.5))
    if (tgt.shield > 0) { const a = Math.min(tgt.shield, dmg); tgt.shield -= a; dmg -= a }
    if (tgt.asleepRounds > 0) tgt.asleepRounds = 0
    tgt.hp = Math.max(0, tgt.hp - dmg)
    this.drawBars(tgt)
    this.float(tgt, `-${dmg}`, color)
    if (tgt.hp <= 0 && tgt.alive) {
      tgt.alive = false; tgt.container.setAlpha(0.4); this.clearGlow(tgt)
      tgt.sprite.setTint(0x444444)
    }
    return dmg
  }

  private healUnit(src: Unit, tgt: Unit, raw: number) {
    if (!tgt.alive) return
    const amt = Math.max(1, Math.round(raw + src.healing * 0.5))
    tgt.hp = Math.min(tgt.maxHp, tgt.hp + amt)
    this.drawBars(tgt)
    this.float(tgt, `+${amt}`, '#66ff99')
  }

  private float(u: Unit, text: string, color: string) {
    const t = this.add.text(u.x, u.y - 28, text, { fontSize: '20px', fontFamily: 'Georgia, serif', color, fontStyle: 'bold', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5).setDepth(30)
    this.tweens.add({ targets: t, y: u.y - 62, alpha: 0, duration: 650, onComplete: () => t.destroy() })
  }

  private setLog(s: string) { this.logText.setText(s) }

  // ── End ────────────────────────────────────────────────────────────────────
  private checkEnd(): boolean {
    if (this.living('ally').length === 0) { this.end(false); return true }
    if (this.living('enemy').length === 0) { this.end(true); return true }
    return false
  }

  private end(victory: boolean) {
    if (this.phase === 'done') return
    this.phase = 'done'
    this.clearSkillBar()
    this.clearTargetSelection()
    const socket = (window as typeof window & { __lumenSocket?: Socket }).__lumenSocket
    socket?.emit('campaign:report', {
      difficulty: this.battleData.difficulty, level: this.battleData.level,
      campaignComplete: this.battleData.campaignComplete, victory,
      mobCount: this.battleData.mobs.length,
    })

    const cx = GAME_WIDTH / 2, cy = GAME_HEIGHT / 2
    this.add.graphics().setDepth(40).fillStyle(0x000000, 0.85).fillRoundedRect(cx - 200, cy - 90, 400, 180, 14)
      .lineStyle(2, victory ? 0xffd700 : 0xff5555, 1).strokeRoundedRect(cx - 200, cy - 90, 400, 180, 14)
    this.add.text(cx, cy - 50, victory ? '⚔  Victory!' : '💀  Defeated…', {
      fontSize: '28px', fontFamily: 'Georgia, serif', color: victory ? '#ffd700' : '#ff6666', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(41)
    const btn = this.add.text(cx, cy + 40, 'Continue', {
      fontSize: '18px', fontFamily: 'Georgia, serif', color: '#fff', fontStyle: 'bold',
      backgroundColor: '#2a1060', padding: { x: 24, y: 10 },
    }).setOrigin(0.5).setDepth(41).setInteractive({ useHandCursor: true })
    btn.on('pointerdown', () => {
      // playerHp:-1 ⇒ "party combat" — the BiomeScene's single HP bar is vestigial
      // here (each ally has its own HP, reset per encounter), so leave it unchanged.
      const result: BattleResult = { victory, playerHp: -1, xpGained: 0 }
      const biome = this.scene.get('BiomeScene') as BiomeScene
      this.scene.stop()
      this.scene.resume('BiomeScene')
      biome.onBattleResult(result)
    })
  }
}
