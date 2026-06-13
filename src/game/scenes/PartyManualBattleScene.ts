// ============================================================
// PartyManualBattleScene — hand-played party combat (live campaigns).
//
// You manually command ALL party members: on each ally's turn a skill is armed
// (sticky: the character's last choice, or the free Attack) and you click an
// enemy to strike — or pick another skill first. Enemies act on a simple AI.
// Party data comes from the server (party:combat_data); rewards (per-character
// XP) are granted server-side via campaign:report. Idle/"auto" mode uses the
// separate PartyBattleScene animator. See docs/CHARACTERS_DESIGN.md §5.
//
// The look mirrors the original BattleScene: a header, an enemy arena with a
// faint grid, a battle-log strip, a row of skill cards, and a "YOUR PARTY" grid
// of up to four character cards (HP/MP bars + an ⓘ gear/stats inspector).
// ============================================================

import Phaser from 'phaser'
import type { Socket } from 'socket.io-client'
import { GAME_WIDTH, GAME_HEIGHT } from '../constants'
import { BASIC_ATTACK, type Skill } from '../data/skills'
import { SKILL_MAP, skillRankMultiplier } from '../data/skillTrees'
import { rankMultiplier } from '../data/adventureRanks'
import { RankStore } from '../systems/RankStore'
import { Sfx } from '../systems/Sfx'
import { StatsStore } from '../systems/StatsStore'
import { InventoryStore, type ClientInventoryItem } from '../systems/InventoryStore'
import { DIFFICULTIES } from '../data/mobs'
import { TD_MONSTERS } from '../data/tileFrames'
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
  biome: string
  encounterIndex: number
  totalEncounters: number
}

interface CardRect { cardX: number; cardY: number; slotW: number; cardH: number; cx: number }

interface Unit {
  id: string; name: string; side: 'ally' | 'enemy'
  maxHp: number; hp: number; maxMana: number; mana: number
  attack: number; defense: number; speed: number; healing: number
  basicAttack: { min: number; max: number }
  skills: Skill[]
  alive: boolean
  level?: number          // enemy level (for the arena label)
  boss?: boolean          // campaign boss — bigger sprite + gold label + aura
  lastSkillId?: string    // sticky skill, remembered between rounds (allies)
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
  hpBar: Phaser.GameObjects.Graphics
  hpText: Phaser.GameObjects.Text
  mpBar: Phaser.GameObjects.Graphics | null
  mpText: Phaser.GameObjects.Text | null
  nameText: Phaser.GameObjects.Text     // enemy 2-line label / ally name
  cardBg: Phaser.GameObjects.Graphics | null   // ally card background (highlight)
  cardRect: CardRect | null
  bars: { barX: number; barW: number; hpY: number; mpY: number } | null
}

// Layout zones (mirrors the original BattleScene).
const MOB_SCALE: Record<string, number> = {
  novice: 4, easy: 4, casual: 4.2, medium: 4.4, hard: 4.6,
  veteran: 4.8, expert: 5, master: 5.2, elite: 5.4, legendary: 5.6,
}
const HEADER_H      = 48
const ENEMY_BOTTOM  = 325
const LOG_TOP       = ENEMY_BOTTOM
const LOG_BOTTOM    = LOG_TOP + 52
const SKILL_TOP     = LOG_BOTTOM
const SKILL_BTN_H   = 92
const PLAYER_PANEL_Y = SKILL_TOP + SKILL_BTN_H + 16

export class PartyManualBattleScene extends Phaser.Scene {
  private battleData!: PartyManualData
  private allies: Unit[] = []
  private enemies: Unit[] = []
  private order: Unit[] = []
  private turnIdx = 0
  private round = 0
  private phase: 'idle' | 'ally_input' | 'target_select' | 'animating' | 'done' = 'idle'
  private active: Unit | null = null
  private selectedSkill: Skill | null = null
  private rankMult = 1

  private logText!: Phaser.GameObjects.Text
  private enemyCountText: Phaser.GameObjects.Text | null = null
  private skillButtons: Phaser.GameObjects.Container[] = []
  private charPanel: Phaser.GameObjects.Container | null = null

  constructor() { super({ key: 'PartyManualBattleScene' }) }

  init(data: PartyManualData) {
    this.battleData = data
    this.allies = []; this.enemies = []; this.order = []
    this.turnIdx = 0; this.round = 0; this.phase = 'idle'
    this.active = null; this.selectedSkill = null
    this.skillButtons = []; this.charPanel = null; this.enemyCountText = null
    this.rankMult = rankMultiplier(RankStore.get())
  }

  create() {
    this.drawBackground()
    this.buildEnemies()
    this.buildPartyPanel()
    this.buildLogBar()
    this.refreshEnemyCount()
    for (const u of [...this.allies, ...this.enemies]) this.drawBars(u)
    this.time.delayedCall(500, () => this.startRound())
  }

  // ── Background / header ─────────────────────────────────────────────────────

  private drawBackground() {
    const bg = this.add.graphics().setDepth(0)
    bg.fillStyle(0x07060f, 1).fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)
    bg.fillStyle(0x110c18, 1).fillRect(0, HEADER_H, GAME_WIDTH, ENEMY_BOTTOM - HEADER_H)  // enemy arena
    bg.fillStyle(0x0a0814, 1).fillRect(0, LOG_TOP, GAME_WIDTH, LOG_BOTTOM - LOG_TOP)       // log strip
    bg.fillStyle(0x0d0b1a, 1).fillRect(0, SKILL_TOP, GAME_WIDTH, SKILL_BTN_H + 8)          // skill strip
    bg.fillStyle(0x080710, 1).fillRect(0, PLAYER_PANEL_Y, GAME_WIDTH, GAME_HEIGHT - PLAYER_PANEL_Y) // party panel

    bg.lineStyle(1, 0x332244, 1)
    bg.lineBetween(0, HEADER_H, GAME_WIDTH, HEADER_H)
    bg.lineBetween(0, ENEMY_BOTTOM, GAME_WIDTH, ENEMY_BOTTOM)
    bg.lineBetween(0, LOG_BOTTOM, GAME_WIDTH, LOG_BOTTOM)
    bg.lineBetween(0, PLAYER_PANEL_Y, GAME_WIDTH, PLAYER_PANEL_Y)

    const { biome, encounterIndex, totalEncounters, difficulty } = this.battleData
    const diffColor: Record<string, string> = Object.fromEntries(
      Object.values(DIFFICULTIES).map(d => [d.key, d.color]),
    )

    this.add.text(GAME_WIDTH / 2, HEADER_H / 2, '⚔  BATTLE  ⚔', {
      fontSize: '16px', fontFamily: 'Georgia, serif', color: '#ff5544', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(2)
    this.add.text(12, HEADER_H / 2, `${biome}  ·  Encounter ${encounterIndex + 1}/${totalEncounters}`, {
      fontSize: '12px', fontFamily: 'Arial', color: '#888888',
    }).setOrigin(0, 0.5).setDepth(2)
    this.add.text(GAME_WIDTH - 12, HEADER_H / 2, difficulty.toUpperCase(), {
      fontSize: '11px', fontFamily: 'Arial', color: diffColor[difficulty] ?? '#aaaaaa',
      backgroundColor: '#00000088', padding: { x: 5, y: 2 },
    }).setOrigin(1, 0.5).setDepth(2)

    // Faint arena grid behind the enemies.
    const grid = this.add.graphics().setDepth(1).setAlpha(0.06)
    grid.lineStyle(1, 0x6644aa, 1)
    for (let x = 0; x < GAME_WIDTH; x += 64) grid.lineBetween(x, HEADER_H, x, ENEMY_BOTTOM)
    for (let y = HEADER_H; y < ENEMY_BOTTOM; y += 48) grid.lineBetween(0, y, GAME_WIDTH, y)
  }

  // ── Skills ──────────────────────────────────────────────────────────────────

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

  // ── Unit construction ───────────────────────────────────────────────────────

  private baseUnit(side: 'ally' | 'enemy', x: number, y: number) {
    return {
      side, alive: true, dots: [] as { perTurn: number; rounds: number }[],
      hots: [] as { perTurn: number; rounds: number }[],
      defenseDown: 0, defenseDownRounds: 0, slow: 0, slowRounds: 0, stunRounds: 0, asleepRounds: 0,
      shield: 0, buffAtk: 0, buffDef: 0, buffSpd: 0, buffRounds: 0, defending: false, x, y,
    }
  }

  private buildEnemies() {
    const mobs = this.battleData.mobs
    const n = mobs.length
    const spacing = Math.min(160, (GAME_WIDTH - 100) / Math.max(n, 1))
    const startX = GAME_WIDTH / 2 - ((n - 1) * spacing) / 2
    const py = (HEADER_H + ENEMY_BOTTOM) / 2 - 10
    const pool = TD_MONSTERS[DIFFICULTIES[this.battleData.difficulty as keyof typeof DIFFICULTIES]?.pool] ?? []
    const scale = MOB_SCALE[this.battleData.difficulty] ?? 4

    this.enemies = mobs.map((m, i) => {
      // Scale HP + attack by the adventure-rank multiplier to match the server's
      // buildEnemyCombatant (otherwise raw mob stats are far too weak and the
      // player's rank-scaled defense floors every enemy hit at 1 damage).
      const hpv = Math.max(1, Math.round(m.maxHp * this.rankMult))
      const atkv = Math.max(1, Math.round(m.attack * this.rankMult))
      const boss = !!m.boss
      const sScale = boss ? scale * 1.7 : scale
      const x = startX + i * spacing
      const c = this.add.container(x, py).setDepth(5)
      const baseTint = m.tint ?? 0xffffff

      // Boss aura: a pulsing coloured halo behind the (bigger) sprite.
      if (boss) {
        const aura = this.add.graphics()
        aura.fillStyle(baseTint === 0xffffff ? 0xffd54f : baseTint, 0.16).fillCircle(0, -8, 58)
        aura.fillStyle(0xffe9a0, 0.12).fillCircle(0, -8, 40)
        c.add(aura)
        this.tweens.add({ targets: aura, alpha: { from: 0.55, to: 1 }, scale: { from: 0.92, to: 1.08 },
          duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })
      }

      c.add(this.add.ellipse(3, boss ? 44 : 28, boss ? 84 : 52, boss ? 18 : 12, 0x000000, 0.4))
      const frame = m.frame ?? pool[i % Math.max(1, pool.length)] ?? 0
      const sprite = this.add.sprite(0, boss ? -10 : -4, 'tiny_dungeon', frame).setScale(sScale)
      if (baseTint !== 0xffffff) sprite.setTint(baseTint)
      c.add(sprite)
      // Crown marks the boss.
      if (boss) c.add(this.add.text(0, -56, '👑', { fontSize: '20px' }).setOrigin(0.5))

      const hpBar = this.add.graphics(); c.add(hpBar)
      const nameText = this.add.text(0, boss ? 58 : 46, '', {
        fontSize: boss ? '11px' : '10px', fontFamily: 'Arial', color: '#cccccc',
        align: 'center', lineSpacing: 2, fontStyle: boss ? 'bold' : 'normal',
      }).setOrigin(0.5, 0); c.add(nameText)

      // Click-to-target hit zone (active only while a damage skill is armed).
      const hit = this.add.rectangle(0, boss ? -8 : 0, boss ? 100 : 60, boss ? 120 : 80, 0, 0)
        .setInteractive({ useHandCursor: true })
      c.add(hit)

      const u: Unit = {
        ...this.baseUnit('enemy', x, py),
        id: `e${i}`, name: m.name, level: m.level, boss,
        maxHp: hpv, hp: hpv, maxMana: 0, mana: 0,
        attack: atkv, defense: m.defense, speed: m.speed, healing: 0,
        basicAttack: { min: atkv, max: Math.round(atkv * 1.25) },
        skills: [], container: c, sprite, baseTint,
        hpBar, hpText: nameText, mpBar: null, mpText: null, nameText,
        cardBg: null, cardRect: null, bars: null,
      }
      hit.on('pointerover', () => { if (this.canTargetEnemies() && u.alive) sprite.setTint(0xff8866) })
      hit.on('pointerout', () => { if (u.alive) sprite.setTint(baseTint) })
      hit.on('pointerdown', () => { if (this.canTargetEnemies() && u.alive) this.fireOnEnemy(u) })
      return u
    })
  }

  private buildPartyPanel() {
    const top = PLAYER_PANEL_Y
    this.add.text(16, top + 6, 'YOUR PARTY', {
      fontSize: '10px', fontFamily: 'Arial', color: '#666666', fontStyle: 'bold',
    }).setOrigin(0, 0).setDepth(5)

    const gap = 16
    const slotW = (GAME_WIDTH - gap * 5) / 4
    const cardY = top + 22
    const cardH = GAME_HEIGHT - cardY - 10

    this.allies = []
    for (let i = 0; i < 4; i++) {
      const cardX = gap + i * (slotW + gap)
      const cx = cardX + slotW / 2
      const c = this.battleData.allies[i]
      if (!c) {
        const bg = this.add.graphics().setDepth(4)
        bg.fillStyle(0x0e0e1c, 0.5).fillRoundedRect(cardX, cardY, slotW, cardH, 10)
        bg.lineStyle(1, 0x222238, 1).strokeRoundedRect(cardX, cardY, slotW, cardH, 10)
        this.add.text(cx, cardY + cardH / 2, 'Empty', {
          fontSize: '13px', fontFamily: 'Arial', color: '#33334d', fontStyle: 'italic',
        }).setOrigin(0.5).setDepth(5)
        continue
      }
      this.allies.push(this.makeAlly(c, { cardX, cardY, slotW, cardH, cx }))
    }
  }

  private makeAlly(c: ClientCombatant, rect: CardRect): Unit {
    const { cardX, cardY, slotW, cardH, cx } = rect
    const container = this.add.container(0, 0).setDepth(4)

    const cardBg = this.add.graphics(); container.add(cardBg)

    const hero = this.add.sprite(cx, cardY + 44, 'character_idle', 12).setScale(1.8)
    if (this.anims.exists('idle_down')) hero.play('idle_down')
    container.add(hero)
    container.add(this.add.text(cx, cardY + 92, c.name.length > 14 ? c.name.slice(0, 13) + '…' : c.name, {
      fontSize: '13px', fontFamily: 'Georgia, serif', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5))
    container.add(this.add.text(cardX + slotW - 8, cardY + 6, 'ⓘ', {
      fontSize: '13px', fontFamily: 'Arial', color: '#7fa8ff',
    }).setOrigin(1, 0))

    const barX = cardX + 14, barW = slotW - 28
    const hpY = cardY + 110, mpY = cardY + 134
    const hpBar = this.add.graphics(); container.add(hpBar)
    const hpText = this.add.text(cx, hpY + 8, '', {
      fontSize: '10px', fontFamily: 'Arial', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5); container.add(hpText)
    const mpBar = this.add.graphics(); container.add(mpBar)
    const mpText = this.add.text(cx, mpY + 7, '', {
      fontSize: '10px', fontFamily: 'Arial', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5); container.add(mpText)

    const u: Unit = {
      ...this.baseUnit('ally', cx, cardY + 44),
      id: c.id, name: c.name, maxHp: c.maxHp, hp: c.maxHp, maxMana: c.maxMana, mana: c.maxMana,
      attack: c.attack, defense: c.defense, speed: c.speed, healing: c.healing,
      basicAttack: c.basicAttack, skills: this.buildSkills(c),
      container, sprite: hero, baseTint: 0xffffff,
      hpBar, hpText, mpBar, mpText, nameText: hpText,
      cardBg, cardRect: rect, bars: { barX, barW, hpY, mpY },
    }
    this.paintCard(u, false)

    // Click the card: heal it if a heal skill is armed, otherwise inspect gear.
    const zone = this.add.zone(cardX, cardY, slotW, cardH).setOrigin(0).setDepth(7)
      .setInteractive({ useHandCursor: true })
    zone.on('pointerover', () => { if (u.alive) this.paintCard(u, true) })
    zone.on('pointerout', () => this.paintCard(u, this.active === u))
    zone.on('pointerdown', () => {
      if (this.phase === 'target_select' && this.selectedSkill?.isHeal && u.alive) this.fireOnAlly(u)
      else this.showCharacterPanel()
    })
    return u
  }

  private paintCard(u: Unit, highlighted: boolean) {
    if (!u.cardBg || !u.cardRect) return
    const { cardX, cardY, slotW, cardH } = u.cardRect
    const active = highlighted || this.active === u
    u.cardBg.clear()
    u.cardBg.fillStyle(active ? 0x1e1e44 : 0x161636, u.alive ? 0.95 : 0.55)
      .fillRoundedRect(cardX, cardY, slotW, cardH, 10)
    u.cardBg.lineStyle(active ? 2 : 1, active ? 0xffd54f : 0x4a4a7a, 1)
      .strokeRoundedRect(cardX, cardY, slotW, cardH, 10)
  }

  // ── Bars / labels ─────────────────────────────────────────────────────────

  private drawBars(u: Unit) {
    if (u.side === 'enemy') {
      u.hpBar.clear()
      if (u.alive) {
        const bw = u.boss ? 96 : 60, bh = u.boss ? 9 : 7, bx = -bw / 2, by = u.boss ? 50 : 36
        u.hpBar.fillStyle(0x222222, 1).fillRoundedRect(bx, by, bw, bh, 2)
        const pct = Math.max(0, u.hp / u.maxHp)
        const col = pct > 0.5 ? 0x44cc44 : pct > 0.25 ? 0xffcc00 : 0xff4444
        u.hpBar.fillStyle(col, 1).fillRoundedRect(bx, by, Math.round(bw * pct), bh, 2)
        u.hpBar.lineStyle(1, u.boss ? 0xffd54f : 0x000000, u.boss ? 0.9 : 0.5).strokeRoundedRect(bx, by, bw, bh, 2)
      }
      u.nameText.setColor(!u.alive ? '#555555' : u.boss ? '#ffd54f' : '#cccccc')
        .setText(u.alive ? `${u.name}\nLv.${u.level}  HP:${u.hp}/${u.maxHp}` : `${u.name}\n💀 Defeated`)
      return
    }
    // Ally card bars.
    if (!u.bars) return
    const { barX, barW, hpY, mpY } = u.bars
    u.hpBar.clear()
    const hpPct = Math.max(0, u.hp / u.maxHp)
    u.hpBar.fillStyle(0x222233, 1).fillRoundedRect(barX, hpY, barW, 16, 4)
    const hpCol = hpPct > 0.5 ? 0x44cc44 : hpPct > 0.25 ? 0xffcc00 : 0xff4444
    u.hpBar.fillStyle(hpCol, 1).fillRoundedRect(barX, hpY, Math.round(barW * hpPct), 16, 4)
    if (u.shield > 0) u.hpBar.fillStyle(0x88ccff, 0.9).fillRect(barX, hpY - 3, Math.min(barW, u.shield), 3)
    u.hpText.setText(`${u.hp} / ${u.maxHp}  HP`)
    if (u.mpBar && u.mpText) {
      u.mpBar.clear()
      const mpPct = u.maxMana > 0 ? Math.max(0, u.mana / u.maxMana) : 0
      u.mpBar.fillStyle(0x222233, 1).fillRoundedRect(barX, mpY, barW, 14, 4)
      u.mpBar.fillStyle(0x3a78d8, 1).fillRoundedRect(barX, mpY, Math.round(barW * mpPct), 14, 4)
      u.mpText.setText(`${Math.floor(u.mana)} / ${u.maxMana}  MP`)
    }
  }

  private refreshEnemyCount() {
    this.enemyCountText?.destroy()
    const alive = this.enemies.filter(e => e.alive).length
    this.enemyCountText = this.add.text(GAME_WIDTH - 10, ENEMY_BOTTOM - 6, `${alive} remaining`, {
      fontSize: '10px', fontFamily: 'Arial', color: '#666666',
    }).setOrigin(1, 1).setDepth(6)
  }

  // ── Log ─────────────────────────────────────────────────────────────────────

  private buildLogBar() {
    this.logText = this.add.text(GAME_WIDTH / 2, LOG_TOP + (LOG_BOTTOM - LOG_TOP) / 2, '', {
      fontSize: '15px', fontFamily: 'Georgia, serif', color: '#ccbbff',
      align: 'center', wordWrap: { width: GAME_WIDTH - 40 },
    }).setOrigin(0.5).setDepth(5)
  }

  private setLog(msg: string, color = '#ccbbff') { this.logText.setText(msg).setColor(color) }

  // ── Helpers ───────────────────────────────────────────────────────────────
  private living(side: 'ally' | 'enemy') { return (side === 'ally' ? this.allies : this.enemies).filter(u => u.alive) }
  private foesOf(u: Unit) { return this.living(u.side === 'ally' ? 'enemy' : 'ally') }
  private friendsOf(u: Unit) { return this.living(u.side) }
  private effSpeed(u: Unit) { return Math.max(1, Math.round(u.speed * (1 + u.buffSpd / 100) - u.slow)) }
  private effDef(u: Unit) { return Math.max(0, u.defense * (1 + u.buffDef / 100) - u.defenseDown) }
  private canTargetEnemies() { return this.phase === 'target_select' && !!this.selectedSkill && !this.selectedSkill.isHeal }

  // ── Round / turn loop ──────────────────────────────────────────────────────

  private startRound() {
    this.round++
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
    if (u.side === 'ally') this.drawBars(u)
    if (u.stunRounds > 0) { this.setLog(`${u.name} is stunned!`, '#ffee66'); this.advance(); return }
    if (u.asleepRounds > 0) { this.setLog(`${u.name} is asleep…`, '#99ccff'); this.advance(); return }

    if (u.side === 'enemy') {
      this.phase = 'animating'
      this.time.delayedCall(450, () => { this.enemyAct(u); this.advance() })
    } else {
      this.beginAllyTurn(u)
    }
  }

  private advance() { this.turnIdx++; this.time.delayedCall(220, () => this.nextTurn()) }

  // ── Enemy AI ───────────────────────────────────────────────────────────────
  private enemyAct(u: Unit) {
    const targets = this.living('ally')
    if (targets.length === 0) return
    const tgt = targets.reduce((a, b) => (b.hp < a.hp ? b : a))
    const dealt = this.basicHit(u, tgt)
    this.setLog(`${u.name} hits ${tgt.name} for ${dealt}!`, '#ff7766')
  }

  // ── Ally turn ────────────────────────────────────────────────────────────────

  private beginAllyTurn(u: Unit) {
    this.active = u
    this.highlightActiveCard(u)
    this.buildSkillBar(u)
    // Sticky arm: resume the character's last damage skill if affordable, else Attack.
    const remembered = u.lastSkillId ? u.skills.find(s => s.id === u.lastSkillId) : null
    const sticky = remembered && !remembered.isHeal && remembered.targeting === 'single' && remembered.mpCost <= u.mana
      ? remembered
      : (u.skills.find(s => s.id === 'attack') ?? u.skills[0])
    if (sticky) this.armSkill(sticky)
    else { this.phase = 'ally_input'; this.setLog(`${u.name}'s turn — choose a skill!`) }
  }

  private highlightActiveCard(active: Unit) {
    for (const a of this.allies) this.paintCard(a, a === active)
  }

  /** Arm a skill: self/team/aoe fire immediately; single skills wait for a click. */
  private armSkill(skill: Skill) {
    const u = this.active!
    if (skill.mpCost > u.mana) { this.setLog(`Not enough mana for ${skill.name} (need ${skill.mpCost} MP).`, '#ff8888'); return }
    this.selectedSkill = skill
    u.lastSkillId = skill.id
    this.buildSkillBar(u)
    Sfx.play('select')

    if (skill.targeting === 'self') { this.castSkill(u, skill, [u]); return }
    if (skill.targeting === 'aoe') { this.castSkill(u, skill, this.foesOf(u)); return }
    this.phase = 'target_select'
    if (skill.isHeal) this.setLog(`${skill.icon}  ${skill.name} ready — click a party member to heal.`, '#88ffcc')
    else this.setLog(`${skill.icon}  ${skill.name} ready — click an enemy, or pick another skill.`, '#ffdd88')
  }

  private fireOnEnemy(enemy: Unit) {
    if (!this.active || !this.selectedSkill) return
    this.castSkill(this.active, this.selectedSkill, [enemy])
  }

  private fireOnAlly(ally: Unit) {
    if (!this.active || !this.selectedSkill) return
    this.castSkill(this.active, this.selectedSkill, [ally])
  }

  // ── Skill bar ────────────────────────────────────────────────────────────────

  private buildSkillBar(u: Unit) {
    this.clearSkillBar()
    const n = u.skills.length
    const usableW = GAME_WIDTH - 40
    const btnW = Math.min(220, usableW / n - 8)
    const gap = n > 1 ? (usableW - n * btnW) / (n - 1) : 0
    const startX = 20 + btnW / 2
    const btnY = SKILL_TOP + SKILL_BTN_H / 2 + 4
    u.skills.forEach((s, i) => {
      const cx = startX + i * (btnW + gap)
      this.skillButtons.push(this.makeSkillButton(s, cx, btnY, btnW, SKILL_BTN_H - 4, u))
    })
  }

  private makeSkillButton(skill: Skill, cx: number, cy: number, bw: number, bh: number, owner: Unit) {
    const btn = this.add.container(cx, cy).setDepth(6)
    const enabled = skill.mpCost <= owner.mana
    const g = this.add.graphics()
    const draw = (fill: number) => {
      g.clear()
      g.fillStyle(fill, 1).fillRoundedRect(-bw / 2, -bh / 2, bw, bh, 8)
      g.lineStyle(2, enabled ? skill.color : 0x554455, 0.8).strokeRoundedRect(-bw / 2, -bh / 2, bw, bh, 8)
      g.lineStyle(3, enabled ? skill.color : 0x554455, 0.5).lineBetween(-bw / 2 + 10, bh / 2, bw / 2 - 10, bh / 2)
    }
    const idle = enabled ? 0x1a1530 : 0x18141e
    const selected = this.selectedSkill?.id === skill.id
    draw(selected ? 0x3a3060 : idle)
    btn.add(g)

    btn.add(this.add.text(0, -12, skill.icon, { fontSize: '20px' }).setOrigin(0.5))
    btn.add(this.add.text(0, 8, skill.name, {
      fontSize: '11px', fontFamily: 'Arial', color: enabled ? '#dddddd' : '#776', fontStyle: 'bold',
    }).setOrigin(0.5))
    const mp = skill.mpCost > 0 ? `  ·  ${skill.mpCost} MP` : ''
    btn.add(this.add.text(0, 22, `${skill.damageMin}–${skill.damageMax} ${skill.isHeal ? 'HP' : 'dmg'}${mp}`, {
      fontSize: '9px', fontFamily: 'Arial',
      color: enabled ? Phaser.Display.Color.IntegerToColor(skill.color).lighten(20).rgba : '#665',
    }).setOrigin(0.5))

    const hit = this.add.rectangle(0, 0, bw, bh, 0, 0).setInteractive({ useHandCursor: enabled })
    if (enabled) {
      hit.on('pointerover', () => { if (this.isAllyInputPhase()) draw(0x2a2548) })
      hit.on('pointerout', () => draw(this.selectedSkill?.id === skill.id ? 0x3a3060 : idle))
      hit.on('pointerdown', () => { if (this.isAllyInputPhase()) this.armSkill(skill) })
    }
    btn.add(hit)
    return btn
  }

  private isAllyInputPhase() { return this.phase === 'ally_input' || this.phase === 'target_select' }
  private clearSkillBar() { this.skillButtons.forEach(b => b.destroy()); this.skillButtons = [] }

  // ── Skill resolution ───────────────────────────────────────────────────────
  private castSkill(caster: Unit, skill: Skill, targets: Unit[]) {
    this.clearSkillBar()
    this.phase = 'animating'
    caster.mana = Math.max(0, caster.mana - skill.mpCost)
    this.drawBars(caster)
    this.setLog(`${caster.name} uses ${skill.name}.`)

    if (!skill.isHeal) Sfx.play('swing')
    if (skill.id === 'attack') { if (targets[0]) this.basicHit(caster, targets[0]) }
    else this.applyEffects(caster, skill, targets)

    this.active = null
    this.selectedSkill = null
    this.highlightActiveCard(null as unknown as Unit)
    this.advance()
  }

  private basicHit(src: Unit, tgt: Unit): number {
    const raw = Math.round(Phaser.Math.Between(src.basicAttack.min, src.basicAttack.max) * (1 + src.buffAtk / 100))
    return this.damageUnit(src, tgt, raw, '#ff6464')
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

  private damageUnit(src: Unit, tgt: Unit, raw: number, color: string): number {
    if (!tgt.alive) return 0
    let dmg = Math.max(1, Math.round(raw - this.effDef(tgt) * 0.5))
    if (tgt.defending) dmg = Math.max(1, Math.round(dmg * 0.5))
    if (tgt.shield > 0) { const a = Math.min(tgt.shield, dmg); tgt.shield -= a; dmg -= a }
    if (tgt.asleepRounds > 0) tgt.asleepRounds = 0
    tgt.hp = Math.max(0, tgt.hp - dmg)
    this.drawBars(tgt)
    this.float(tgt, `-${dmg}`, color)
    // Hit reaction: red flash + recoil; a camera shake when one of YOUR party is hit.
    const playerHit = src.side === 'enemy' && tgt.side === 'ally'
    this.hitFx(tgt, playerHit)
    Sfx.play(playerHit ? 'hitPlayer' : 'hitEnemy')
    if (tgt.hp <= 0 && tgt.alive) this.killUnit(tgt)
    return dmg
  }

  /** Brief hit reaction so a strike reads clearly: tint the target red, recoil
   *  the sprite, and (for an ally taking an enemy hit) shake the camera. */
  private hitFx(u: Unit, playerHit: boolean) {
    const spr = u.sprite
    spr.setTint(0xff5555)
    this.time.delayedCall(120, () => {
      if (!u.alive) { spr.setTint(0x444444); return }
      if (u.side === 'enemy') spr.setTint(u.baseTint); else spr.clearTint()
    })
    const x0 = spr.x
    this.tweens.add({
      targets: spr, x: x0 + (u.side === 'ally' ? -6 : 6),
      duration: 45, yoyo: true, repeat: 2, onComplete: () => spr.setX(x0),
    })
    if (playerHit) this.cameras.main.shake(160, 0.006)
  }

  private healUnit(src: Unit, tgt: Unit, raw: number) {
    if (!tgt.alive) return
    const amt = Math.max(1, Math.round(raw + src.healing * 0.5))
    tgt.hp = Math.min(tgt.maxHp, tgt.hp + amt)
    this.drawBars(tgt)
    this.float(tgt, `+${amt}`, '#66ff99')
    Sfx.play('heal')
  }

  private killUnit(u: Unit) {
    u.alive = false
    if (u.side === 'enemy') {
      u.sprite.setTint(0x444444).setAlpha(0.4)
      this.drawBars(u)
      this.refreshEnemyCount()
    } else {
      u.container.setAlpha(0.45)
      this.paintCard(u, false)
    }
  }

  private float(u: Unit, text: string, color: string) {
    const t = this.add.text(u.x, u.y - 28, text, {
      fontSize: '22px', fontFamily: 'Georgia, serif', color, fontStyle: 'bold', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(30)
    this.tweens.add({ targets: t, y: u.y - 70, alpha: 0, duration: 800, ease: 'Sine.easeOut', onComplete: () => t.destroy() })
  }

  // ── Character inspect (gear + stats) ─────────────────────────────────────────
  /** Modal showing the account-active character's equipped gear + derived stats
   *  (StatsStore / InventoryStore snapshots). Toggle by clicking again. */
  private showCharacterPanel() {
    if (this.charPanel) { this.charPanel.destroy(); this.charPanel = null; return }
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

    const backdrop = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.6).setOrigin(0).setInteractive()
    backdrop.on('pointerdown', close)
    c.add(backdrop)

    const g = this.add.graphics()
    g.fillStyle(0x12122a, 1).fillRoundedRect(px, py, pw, ph, 12)
    g.lineStyle(2, 0x4a4a7a, 1).strokeRoundedRect(px, py, pw, ph, 12)
    c.add(g)
    c.add(this.add.zone(px, py, pw, ph).setOrigin(0).setInteractive())

    c.add(this.add.text(px + pw / 2, py + 22, `Your Hero  ·  Level ${level}`, {
      fontSize: '20px', fontFamily: 'Georgia, serif', color: '#ffd54f', fontStyle: 'bold',
    }).setOrigin(0.5))
    const closeBtn = this.add.text(px + pw - 16, py + 18, '✕', {
      fontSize: '18px', color: '#ff8888', fontStyle: 'bold',
    }).setOrigin(1, 0.5).setInteractive({ useHandCursor: true })
    closeBtn.on('pointerdown', close)
    c.add(closeBtn)

    const colLX = px + 28
    let ly = py + 62
    c.add(this.add.text(colLX, ly, 'EQUIPPED GEAR', { fontSize: '12px', fontFamily: 'Arial', color: '#8888aa', fontStyle: 'bold' }))
    ly += 26
    for (const [key, label] of SLOTS) {
      const item = eq[key]
      c.add(this.add.text(colLX, ly, label, { fontSize: '12px', color: '#9a9ac0' }))
      c.add(item
        ? this.add.text(colLX + 92, ly, `${item.icon ?? ''} ${item.name}`, { fontSize: '12px', color: RARITY[item.rarity] ?? '#ffffff', fontStyle: 'bold' }).setWordWrapWidth(180)
        : this.add.text(colLX + 92, ly, '— empty —', { fontSize: '12px', color: '#55556e', fontStyle: 'italic' }))
      ly += 26
    }

    const colRX = px + pw / 2 + 18
    let ry = py + 62
    c.add(this.add.text(colRX, ry, 'STATS', { fontSize: '12px', fontFamily: 'Arial', color: '#8888aa', fontStyle: 'bold' }))
    ry += 26
    const rows = [...(stats?.attributes ?? []), ...(stats?.derived ?? [])]
    if (rows.length === 0) c.add(this.add.text(colRX, ry, 'Stats not loaded yet.', { fontSize: '12px', color: '#9a9ac0' }))
    for (const r of rows) {
      c.add(this.add.text(colRX, ry, r.label, { fontSize: '12px', color: '#9a9ac0' }))
      c.add(this.add.text(px + pw - 28, ry, r.isPercent ? `${r.total}%` : `${r.total}`, { fontSize: '12px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(1, 0))
      ry += 21
    }
  }

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
    Sfx.play(victory ? 'victory' : 'defeat')
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
      const result: BattleResult = { victory, playerHp: -1, xpGained: 0 }
      const biome = this.scene.get('BiomeScene') as BiomeScene
      this.scene.stop()
      this.scene.resume('BiomeScene')
      biome.onBattleResult(result)
    })
  }
}
