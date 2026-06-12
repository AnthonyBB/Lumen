// ============================================================
// PartyBattleScene — animates a server-resolved party battle.
//
// Autonomous party combat (docs/CHARACTERS_DESIGN.md §5): the SERVER resolves the
// fight (campaign:resolve) and sends an event log; this scene is a pure ANIMATOR
// that plays it back — it makes NO combat decisions. BiomeScene launches it with
// the events + rewards and is called back via onBattleResult when done.
// ============================================================

import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT } from '../constants'
import type { BiomeScene } from './BiomeScene'
import type { BattleResult } from './BattleScene'

interface UnitSnapshot { id: string; name: string; side: 'ally' | 'enemy'; hp: number; maxHp: number }

// Mirror of the server resolver's BattleEvent union.
type BattleEvent =
  | { t: 'start'; allies: UnitSnapshot[]; enemies: UnitSnapshot[] }
  | { t: 'round'; n: number }
  | { t: 'turn'; unitId: string }
  | { t: 'skip'; unitId: string; reason: 'stun' | 'sleep' }
  | { t: 'action'; unitId: string; skillId: string; name: string; targetIds: string[] }
  | { t: 'damage'; sourceId: string; targetId: string; amount: number; hp: number }
  | { t: 'heal'; sourceId: string; targetId: string; amount: number; hp: number }
  | { t: 'status'; targetId: string; status: string; rounds: number }
  | { t: 'defend'; unitId: string }
  | { t: 'death'; unitId: string }
  | { t: 'end'; victory: boolean }

interface Reward { xpPerCharacter: number; silver: number; items: { name: string; icon: string; rarity: string }[] }

interface InitData {
  events: BattleEvent[]
  victory: boolean
  rewards: Reward
}

interface UnitView {
  side: 'ally' | 'enemy'
  name: string
  maxHp: number
  hp: number
  x: number
  y: number
  container: Phaser.GameObjects.Container
  hpBar: Phaser.GameObjects.Graphics
  hpText: Phaser.GameObjects.Text
  glyph: Phaser.GameObjects.Text
  alive: boolean
}

const BASE_DELAY = 320 // ms between events at 1×

export class PartyBattleScene extends Phaser.Scene {
  private battleEvents: BattleEvent[] = []
  private rewards: Reward = { xpPerCharacter: 0, silver: 0, items: [] }
  private units = new Map<string, UnitView>()
  private idx = 0
  private speed = 1
  private skipping = false
  private logText!: Phaser.GameObjects.Text
  private roundText!: Phaser.GameObjects.Text
  private finished = false

  constructor() { super({ key: 'PartyBattleScene' }) }

  init(data: InitData) {
    this.battleEvents = data?.events ?? []
    this.rewards = data?.rewards ?? { xpPerCharacter: 0, silver: 0, items: [] }
    this.units = new Map()
    this.idx = 0
    this.speed = 1
    this.skipping = false
    this.finished = false
  }

  create() {
    // Backdrop
    this.add.graphics().fillStyle(0x0c0a18, 1).fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)
    this.add.graphics().fillStyle(0x000000, 0.35).fillRect(0, GAME_HEIGHT / 2 - 1, GAME_WIDTH, 2)

    this.roundText = this.add.text(GAME_WIDTH / 2, 40, '', {
      fontSize: '20px', fontFamily: 'Georgia, serif', color: '#ffd54f', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(10)

    this.logText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 28, '', {
      fontSize: '15px', fontFamily: 'Arial', color: '#dfe6ff', backgroundColor: '#00000088',
      padding: { x: 12, y: 6 }, align: 'center',
    }).setOrigin(0.5).setDepth(10)

    this.buildSpeedControls()

    // Build the roster from the first event.
    const start = this.battleEvents[0]
    if (start?.t === 'start') {
      this.layoutSide(start.enemies, 150)
      this.layoutSide(start.allies, GAME_HEIGHT - 230)
      this.idx = 1
    }

    this.time.delayedCall(500, () => this.playNext())
  }

  // ── Layout ──────────────────────────────────────────────────────────────────

  private layoutSide(snaps: UnitSnapshot[], y: number) {
    const n = snaps.length
    const slotW = Math.min(220, (GAME_WIDTH - 80) / Math.max(1, n))
    const totalW = n * slotW
    let x = (GAME_WIDTH - totalW) / 2 + slotW / 2
    for (const s of snaps) {
      this.makeUnit(s, x, y)
      x += slotW
    }
  }

  private makeUnit(s: UnitSnapshot, x: number, y: number) {
    const c = this.add.container(x, y).setDepth(5)
    const ally = s.side === 'ally'
    const w = 168, h = 88
    const panel = this.add.graphics()
    panel.fillStyle(ally ? 0x182142 : 0x3a1620, 0.9).fillRoundedRect(-w / 2, -h / 2, w, h, 10)
    panel.lineStyle(2, ally ? 0x5a78d0 : 0xc05858, 0.9).strokeRoundedRect(-w / 2, -h / 2, w, h, 10)
    c.add(panel)

    const glyph = this.add.text(-w / 2 + 22, -h / 2 + 22, ally ? '🛡️' : '👹', { fontSize: '26px' }).setOrigin(0.5)
    c.add(glyph)
    c.add(this.add.text(-w / 2 + 44, -h / 2 + 14, this.trunc(s.name, 12), {
      fontSize: '13px', fontFamily: 'Georgia, serif', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0, 0.5))

    const hpBar = this.add.graphics()
    c.add(hpBar)
    const hpText = this.add.text(0, h / 2 - 14, '', {
      fontSize: '11px', fontFamily: 'Arial', color: '#cdd6f4',
    }).setOrigin(0.5)
    c.add(hpText)

    const view: UnitView = { side: s.side, name: s.name, maxHp: s.maxHp, hp: s.hp, x, y, container: c, hpBar, hpText, glyph, alive: true }
    this.units.set(s.id, view)
    this.drawHp(view)
  }

  private drawHp(u: UnitView) {
    const w = 144
    u.hpBar.clear()
    u.hpBar.fillStyle(0x000000, 0.6).fillRoundedRect(-w / 2, 8, w, 12, 3)
    const pct = Math.max(0, u.hp / u.maxHp)
    const col = pct > 0.5 ? 0x44cc66 : pct > 0.25 ? 0xffcc44 : 0xff4d4d
    if (pct > 0) u.hpBar.fillStyle(col, 1).fillRoundedRect(-w / 2, 8, Math.round(w * pct), 12, 3)
    u.hpText.setText(`${u.hp} / ${u.maxHp}`)
  }

  // ── Event playback ────────────────────────────────────────────────────────

  private playNext() {
    if (this.finished) return
    // In skip mode, drain everything synchronously up to the end.
    if (this.skipping) {
      while (this.idx < this.battleEvents.length) {
        const e = this.battleEvents[this.idx++]
        this.applyEvent(e, true)
        if (e.t === 'end') return
      }
      return
    }
    if (this.idx >= this.battleEvents.length) return
    const e = this.battleEvents[this.idx++]
    this.applyEvent(e, false)
    if (e.t === 'end') return
    this.time.delayedCall(BASE_DELAY / this.speed, () => this.playNext())
  }

  private applyEvent(e: BattleEvent, silent: boolean) {
    switch (e.t) {
      case 'round':
        if (!silent) { this.roundText.setText(`Round ${e.n}`); this.flash(this.roundText) }
        break
      case 'turn': {
        const u = this.units.get(e.unitId)
        if (u && !silent) this.pulse(u)
        break
      }
      case 'skip': {
        const u = this.units.get(e.unitId)
        if (u && !silent) this.setLog(`${u.name} is ${e.reason === 'stun' ? 'stunned' : 'asleep'}!`)
        break
      }
      case 'action': {
        const u = this.units.get(e.unitId)
        const tgt = e.targetIds.map(id => this.units.get(id)?.name).filter(Boolean).join(', ')
        if (u && !silent) this.setLog(`${u.name} uses ${e.name}${tgt ? ` on ${tgt}` : ''}`)
        break
      }
      case 'damage': {
        const u = this.units.get(e.targetId)
        if (!u) break
        u.hp = e.hp
        this.drawHp(u)
        if (!silent) this.floatText(u, `-${e.amount}`, '#ff6464')
        break
      }
      case 'heal': {
        const u = this.units.get(e.targetId)
        if (!u) break
        u.hp = e.hp
        this.drawHp(u)
        if (!silent) this.floatText(u, `+${e.amount}`, '#66ff99')
        break
      }
      case 'defend': {
        const u = this.units.get(e.unitId)
        if (u && !silent) this.setLog(`${u.name} defends`)
        break
      }
      case 'death': {
        const u = this.units.get(e.unitId)
        if (!u) break
        u.alive = false
        u.container.setAlpha(silent ? 0.3 : 1)
        if (!silent) this.tweens.add({ targets: u.container, alpha: 0.3, duration: 300 })
        u.glyph.setText('💀')
        break
      }
      case 'end':
        this.showEnd(e.victory)
        break
    }
  }

  // ── Effects ─────────────────────────────────────────────────────────────────

  private setLog(text: string) { this.logText.setText(text) }

  private floatText(u: UnitView, text: string, color: string) {
    const t = this.add.text(u.x, u.y - 30, text, {
      fontSize: '22px', fontFamily: 'Georgia, serif', color, fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(20)
    this.tweens.add({ targets: t, y: u.y - 70, alpha: 0, duration: 700, ease: 'Sine.out', onComplete: () => t.destroy() })
  }

  private pulse(u: UnitView) {
    this.tweens.add({ targets: u.container, scaleX: 1.08, scaleY: 1.08, duration: 120, yoyo: true })
  }

  private flash(t: Phaser.GameObjects.Text) {
    t.setAlpha(0)
    this.tweens.add({ targets: t, alpha: 1, duration: 200, yoyo: true, hold: 400 })
  }

  // ── Controls + end screen ────────────────────────────────────────────────────

  private buildSpeedControls() {
    const mk = (x: number, label: string, on: () => void) => {
      const t = this.add.text(x, 40, label, {
        fontSize: '14px', fontFamily: 'Arial', color: '#ffd54f', backgroundColor: '#00000088',
        padding: { x: 10, y: 5 }, fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(15).setInteractive({ useHandCursor: true })
      t.on('pointerdown', on)
      return t
    }
    const b1 = mk(GAME_WIDTH - 220, '1×', () => { this.speed = 1; b1.setColor('#ffd54f'); b2.setColor('#888') })
    const b2 = mk(GAME_WIDTH - 170, '2×', () => { this.speed = 2; b2.setColor('#ffd54f'); b1.setColor('#888') })
    b2.setColor('#888')
    mk(GAME_WIDTH - 90, '⏭ Skip', () => { if (!this.finished) { this.skipping = true; this.playNext() } })
  }

  private showEnd(victory: boolean) {
    if (this.finished) return
    this.finished = true
    const cx = GAME_WIDTH / 2, cy = GAME_HEIGHT / 2
    const W = 520, H = 300
    this.add.graphics().setDepth(30)
      .fillStyle(0x000000, 0.9).fillRoundedRect(cx - W / 2, cy - H / 2, W, H, 16)
      .lineStyle(2, victory ? 0xffd700 : 0xff5555, 1).strokeRoundedRect(cx - W / 2, cy - H / 2, W, H, 16)

    this.add.text(cx, cy - H / 2 + 38, victory ? '⚔  Victory!' : '💀  Defeated…', {
      fontSize: '30px', fontFamily: 'Georgia, serif', color: victory ? '#ffd700' : '#ff6666', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(31)

    if (victory) {
      this.add.text(cx, cy - 60, `+${this.rewards.xpPerCharacter} XP to each fighter`, {
        fontSize: '17px', fontFamily: 'Georgia, serif', color: '#66ff99', fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(31)
      if (this.rewards.silver > 0) {
        this.add.text(cx, cy - 32, `+${this.rewards.silver} 🪙 silver`, {
          fontSize: '15px', fontFamily: 'Arial', color: '#ffe08a',
        }).setOrigin(0.5).setDepth(31)
      }
      const items = this.rewards.items.slice(0, 6)
      items.forEach((it, i) => {
        const x = cx - (items.length - 1) * 70 / 2 + i * 70
        this.add.text(x, cy + 16, `${it.icon}`, { fontSize: '24px' }).setOrigin(0.5).setDepth(31)
        this.add.text(x, cy + 40, this.trunc(it.name, 10), { fontSize: '10px', color: '#cdd6f4' }).setOrigin(0.5).setDepth(31)
      })
    } else {
      this.add.text(cx, cy - 30, 'Your party was driven back.', {
        fontSize: '15px', fontFamily: 'Arial', color: '#cccccc',
      }).setOrigin(0.5).setDepth(31)
    }

    const btn = this.add.text(cx, cy + H / 2 - 34, 'Continue', {
      fontSize: '18px', fontFamily: 'Georgia, serif', color: '#ffffff', fontStyle: 'bold',
      backgroundColor: '#2a1060', padding: { x: 24, y: 10 },
    }).setOrigin(0.5).setDepth(31).setInteractive({ useHandCursor: true })
    btn.on('pointerover', () => btn.setColor('#ffd700'))
    btn.on('pointerout', () => btn.setColor('#ffffff'))
    btn.on('pointerdown', () => this.finish(victory))
  }

  private finish(victory: boolean) {
    const result: BattleResult = { victory, playerHp: 0, xpGained: this.rewards.xpPerCharacter }
    const biome = this.scene.get('BiomeScene') as BiomeScene
    this.scene.stop()
    this.scene.resume('BiomeScene')
    biome.onBattleResult(result)
  }

  private trunc(s: string, n: number) { return s.length > n ? s.slice(0, n - 1) + '…' : s }
}
