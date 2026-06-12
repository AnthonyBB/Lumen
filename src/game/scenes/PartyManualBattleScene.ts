// ============================================================
// PartyManualBattleScene — hand-played party combat (live campaigns).
//
// You manually command ALL party members: on each ally's turn you pick its skill
// and target. Enemies act on a simple AI. The party's combat data comes from the
// server (party:combat_data); rewards (per-character XP) are granted server-side
// via campaign:report. Idle / "auto" mode uses the separate PartyBattleScene
// animator. See docs/CHARACTERS_DESIGN.md §5.
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
  hpBar: Phaser.GameObjects.Graphics
  hpText: Phaser.GameObjects.Text
  mpBar: Phaser.GameObjects.Graphics | null
  ring: Phaser.GameObjects.Graphics
}

const SKILL_BAR_Y = GAME_HEIGHT - 70

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
  private rankMult = 1

  private logText!: Phaser.GameObjects.Text
  private roundText!: Phaser.GameObjects.Text
  private skillButtons: Phaser.GameObjects.Container[] = []
  private hintText!: Phaser.GameObjects.Text

  constructor() { super({ key: 'PartyManualBattleScene' }) }

  init(data: PartyManualData) {
    this.battleData = data
    this.allies = []; this.enemies = []; this.order = []
    this.turnIdx = 0; this.round = 0; this.phase = 'idle'
    this.active = null; this.pendingSkill = null
    this.skillButtons = []
    this.rankMult = rankMultiplier(RankStore.get())
  }

  create() {
    this.add.graphics().fillStyle(0x0c0a18, 1).fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)
    this.add.graphics().fillStyle(0x000000, 0.3).fillRect(0, GAME_HEIGHT / 2 - 60, GAME_WIDTH, 2)

    this.roundText = this.add.text(GAME_WIDTH / 2, 30, '', {
      fontSize: '20px', fontFamily: 'Georgia, serif', color: '#ffd54f', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(20)
    this.hintText = this.add.text(GAME_WIDTH / 2, SKILL_BAR_Y - 40, '', {
      fontSize: '14px', fontFamily: 'Arial', color: '#9be7ff',
    }).setOrigin(0.5).setDepth(20)
    this.logText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 14, '', {
      fontSize: '13px', fontFamily: 'Arial', color: '#cdd6f4',
    }).setOrigin(0.5).setDepth(20)

    // Build units.
    this.allies = this.battleData.allies.map((c, i) => this.makeAlly(c, i, this.battleData.allies.length))
    this.enemies = this.battleData.mobs.map((m, i) => this.makeEnemy(m, i, this.battleData.mobs.length))

    this.time.delayedCall(500, () => this.startRound())
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

  private baseUnit(side: 'ally' | 'enemy', x: number, y: number): Omit<Unit, 'id' | 'name' | 'maxHp' | 'hp' | 'maxMana' | 'mana' | 'attack' | 'defense' | 'speed' | 'healing' | 'basicAttack' | 'skills' | 'container' | 'hpBar' | 'hpText' | 'mpBar' | 'ring'> {
    return {
      side, alive: true, dots: [], hots: [], defenseDown: 0, defenseDownRounds: 0,
      slow: 0, slowRounds: 0, stunRounds: 0, asleepRounds: 0, shield: 0,
      buffAtk: 0, buffDef: 0, buffSpd: 0, buffRounds: 0, defending: false, x, y,
    }
  }

  private makeAlly(c: ClientCombatant, i: number, n: number): Unit {
    const x = this.slotX(i, n); const y = GAME_HEIGHT - 200
    const { container, hpBar, hpText, mpBar, ring } = this.drawUnitPanel(c.name, 'ally', x, y, true)
    return {
      ...this.baseUnit('ally', x, y),
      id: c.id, name: c.name, maxHp: c.maxHp, hp: c.maxHp, maxMana: c.maxMana, mana: c.maxMana,
      attack: c.attack, defense: c.defense, speed: c.speed, healing: c.healing,
      basicAttack: c.basicAttack, skills: this.buildSkills(c),
      container, hpBar, hpText, mpBar, ring,
    }
  }

  private makeEnemy(m: MobDef, i: number, n: number): Unit {
    const x = this.slotX(i, n); const y = 170
    const { container, hpBar, hpText, ring } = this.drawUnitPanel(m.name, 'enemy', x, y, false)
    return {
      ...this.baseUnit('enemy', x, y),
      id: `e${i}`, name: m.name, maxHp: m.maxHp, hp: m.maxHp, maxMana: 0, mana: 0,
      attack: m.attack, defense: m.defense, speed: m.speed, healing: 0,
      basicAttack: { min: m.attack, max: Math.round(m.attack * 1.25) },
      skills: [], container, hpBar, hpText, mpBar: null, ring,
    }
  }

  private slotX(i: number, n: number): number {
    const slotW = Math.min(230, (GAME_WIDTH - 80) / Math.max(1, n))
    return (GAME_WIDTH - n * slotW) / 2 + slotW / 2 + i * slotW
  }

  private drawUnitPanel(name: string, side: 'ally' | 'enemy', x: number, y: number, withMp: boolean) {
    const c = this.add.container(x, y).setDepth(5)
    const ally = side === 'ally'
    const w = 176, h = 92
    const ring = this.add.graphics()
    c.add(ring)
    const panel = this.add.graphics()
    panel.fillStyle(ally ? 0x182142 : 0x3a1620, 0.92).fillRoundedRect(-w / 2, -h / 2, w, h, 10)
    panel.lineStyle(2, ally ? 0x5a78d0 : 0xc05858, 0.9).strokeRoundedRect(-w / 2, -h / 2, w, h, 10)
    c.add(panel)
    c.add(this.add.text(-w / 2 + 14, -h / 2 + 12, ally ? '🛡️' : '👹', { fontSize: '24px' }).setOrigin(0, 0.5))
    c.add(this.add.text(-w / 2 + 42, -h / 2 + 12, name.length > 12 ? name.slice(0, 11) + '…' : name, {
      fontSize: '13px', fontFamily: 'Georgia, serif', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0, 0.5))
    const hpBar = this.add.graphics(); c.add(hpBar)
    const hpText = this.add.text(0, h / 2 - 22, '', { fontSize: '11px', color: '#cdd6f4' }).setOrigin(0.5); c.add(hpText)
    let mpBar: Phaser.GameObjects.Graphics | null = null
    if (withMp) { mpBar = this.add.graphics(); c.add(mpBar) }
    return { container: c, hpBar, hpText, mpBar, ring }
  }

  private drawBars(u: Unit) {
    const w = 150
    u.hpBar.clear()
    u.hpBar.fillStyle(0x000000, 0.6).fillRoundedRect(-w / 2, 4, w, 11, 3)
    const hp = Math.max(0, u.hp / u.maxHp)
    u.hpBar.fillStyle(hp > 0.5 ? 0x44cc66 : hp > 0.25 ? 0xffcc44 : 0xff4d4d, 1)
      .fillRoundedRect(-w / 2, 4, Math.round(w * hp), 11, 3)
    if (u.shield > 0) u.hpBar.fillStyle(0x88ccff, 0.9).fillRect(-w / 2, 2, Math.min(w, u.shield), 2)
    u.hpText.setText(`${u.hp} / ${u.maxHp}`)
    if (u.mpBar && u.maxMana > 0) {
      u.mpBar.clear()
      u.mpBar.fillStyle(0x000000, 0.5).fillRoundedRect(-w / 2, 18, w, 5, 2)
      u.mpBar.fillStyle(0x5a8cff, 1).fillRoundedRect(-w / 2, 18, Math.round(w * (u.mana / u.maxMana)), 5, 2)
    }
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

  private highlightActive(u: Unit) {
    for (const x of [...this.allies, ...this.enemies]) x.ring.clear()
    u.ring.lineStyle(3, 0xffd54f, 0.9).strokeRoundedRect(-92, -50, 184, 100, 12)
  }

  // ── Enemy AI ───────────────────────────────────────────────────────────────
  private enemyAct(u: Unit) {
    const targets = this.living('ally')
    if (targets.length === 0) return
    const tgt = targets.reduce((a, b) => (b.hp < a.hp ? b : a))
    this.setLog(`${u.name} attacks ${tgt.name}`)
    this.basicHit(u, tgt)
  }

  // ── Manual ally input ──────────────────────────────────────────────────────
  private showSkillBar(u: Unit) {
    this.clearSkillBar()
    const usable = u.skills.filter(s => s.mpCost <= u.mana)
    const n = u.skills.length
    const bw = Math.min(150, (GAME_WIDTH - 60) / n - 8)
    const startX = (GAME_WIDTH - (n * (bw + 8) - 8)) / 2 + bw / 2
    u.skills.forEach((s, i) => {
      const x = startX + i * (bw + 8)
      const enabled = usable.includes(s)
      this.skillButtons.push(this.makeSkillButton(s, x, SKILL_BAR_Y, bw, enabled))
    })
  }

  private makeSkillButton(s: Skill, x: number, y: number, w: number, enabled: boolean) {
    const c = this.add.container(x, y).setDepth(15)
    const g = this.add.graphics()
    g.fillStyle(enabled ? 0x1a2340 : 0x201826, 1).fillRoundedRect(-w / 2, -26, w, 52, 8)
    g.lineStyle(2, enabled ? s.color : 0x554455, 0.9).strokeRoundedRect(-w / 2, -26, w, 52, 8)
    c.add(g)
    c.add(this.add.text(0, -12, `${s.icon} ${s.name}`, { fontSize: '12px', color: enabled ? '#fff' : '#776', fontStyle: 'bold' }).setOrigin(0.5))
    const label = s.powerLabel || (s.isHeal ? `Heal ${s.damageMin}` : `${s.damageMin}–${s.damageMax}`)
    c.add(this.add.text(0, 8, `${label}${s.mpCost ? `  ·  ${s.mpCost} MP` : ''}`, { fontSize: '10px', color: enabled ? '#bcd' : '#665' }).setOrigin(0.5))
    if (enabled) {
      const hit = this.add.rectangle(0, 0, w, 52, 0, 0).setInteractive({ useHandCursor: true })
      hit.on('pointerdown', () => this.chooseSkill(s))
      c.add(hit)
    }
    return c
  }

  private clearSkillBar() { this.skillButtons.forEach(b => b.destroy()); this.skillButtons = [] }

  private chooseSkill(s: Skill) {
    if (this.phase !== 'ally_input' || !this.active) return
    const u = this.active
    if (s.targeting === 'self') { this.castSkill(u, s, [u]); return }
    if (s.targeting === 'aoe') { this.castSkill(u, s, this.foesOf(u)); return }
    // single — pick a target (enemy for damage, ally for heal).
    this.pendingSkill = s
    this.phase = 'target_select'
    const targets = s.isHeal ? this.friendsOf(u) : this.foesOf(u)
    this.hintText.setText(`Choose a target for ${s.name}`)
    for (const t of targets) {
      t.ring.lineStyle(3, s.isHeal ? 0x66ff99 : 0xff6666, 0.9).strokeRoundedRect(-92, -50, 184, 100, 12)
      const hit = this.add.rectangle(t.x, t.y, 184, 100, 0, 0).setInteractive({ useHandCursor: true }).setDepth(16)
      hit.on('pointerdown', () => {
        if (this.phase !== 'target_select') return
        this.children.list.filter(o => o instanceof Phaser.GameObjects.Rectangle && (o as Phaser.GameObjects.Rectangle).depth === 16).forEach(o => o.destroy())
        this.castSkill(u, this.pendingSkill!, [t])
      })
    }
  }

  // ── Skill resolution ───────────────────────────────────────────────────────
  private castSkill(caster: Unit, skill: Skill, targets: Unit[]) {
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
    if (tgt.hp <= 0 && tgt.alive) { tgt.alive = false; tgt.container.setAlpha(0.35); tgt.ring.clear() }
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
