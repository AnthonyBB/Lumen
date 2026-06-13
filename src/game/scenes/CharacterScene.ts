// ============================================================
// CharacterScene — the ACTIVE TEAM sheet.
//
// Shows every member of the active team (teams[0]) as a selectable
// rail; the selected member's full attribute + combat breakdown fills
// the detail panels. You can also switch which member you "play as".
//
// SECURITY: this scene only RENDERS the server-pushed team sheet
// ('team:sheet', computed by handlers from server-authoritative
// PlayerManager.computeStats per member). Nothing here changes a stat
// locally; "play as" just requests 'roster:set_active'.
// ============================================================

import Phaser from 'phaser'
import type { Socket } from 'socket.io-client'
import { GAME_WIDTH, GAME_HEIGHT } from '../constants'
import type { ClientStats, ClientStatRow } from '../systems/StatsStore'

const STAT_COLORS: Record<string, number> = {
  constitution: 0xdd4444,
  intelligence: 0x4488ff,
  dexterity: 0x44ddaa,
  strength: 0xff8800,
  spirit: 0xcc44ff,
}

const STAT_DESCRIPTIONS: Record<string, string> = {
  constitution: 'Controls HP & endurance',
  intelligence: 'Boosts magic & learning',
  dexterity: 'Governs speed & accuracy',
  strength: 'Raw physical power',
  spirit: 'Willpower & healing',
}

/** Accent color per class (mirrors BattleScene CLASS_COLORS). */
const CLASS_COLORS: Record<string, number> = {
  fire_mage: 0xff4400, ice_mage: 0x44aaff, lightning_mage: 0xffee00,
  sword: 0xcc8855, spear: 0xaa9966, axe: 0xbb5533, hammer: 0x997755,
  monk: 0xffaa66, paladin: 0xffd700, assassin: 0x9955cc,
  cleric: 0x44ff88, shaman: 0x55cc77, bard: 0xff77cc,
}
const classColor = (cls: string): number => CLASS_COLORS[cls] ?? 0x8888aa
/** 'fire_mage' → 'Fire Mage'. */
const classLabel = (cls: string): string =>
  cls.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')

/** A single active-team member with its full server-computed sheet. */
interface SheetMember {
  id: string
  name: string
  class: string
  level: number
  power: number
  stats: ClientStats
}
interface TeamSheet {
  teamId: string
  teamName: string
  activeCharacterId: string
  members: SheetMember[]
}

// Left panel geometry (the member rail + selected portrait live here).
const LEFT_X = 30, LEFT_W = 370
const RAIL_TOP = 374, CARD_H = 44, CARD_GAP = 6

export class CharacterScene extends Phaser.Scene {
  private cKey!: Phaser.Input.Keyboard.Key
  private escKey!: Phaser.Input.Keyboard.Key

  private socket: Socket | null = null
  private sheet: TeamSheet | null = null
  private selectedId = ''

  // Dynamic containers (rebuilt on every sheet update / selection change)
  private leftContainer!: Phaser.GameObjects.Container
  private attrContainer!: Phaser.GameObjects.Container
  private derivedContainer!: Phaser.GameObjects.Container
  private headerTitle!: Phaser.GameObjects.Text
  private feedbackText!: Phaser.GameObjects.Text

  private xpBar = { x: 0, y: 0, w: 0, h: 12 }

  constructor() {
    super({ key: 'CharacterScene' })
  }

  create() {
    this.socket = (window as typeof window & { __lumenSocket?: Socket }).__lumenSocket ?? null

    this.drawBackground()
    this.buildHeader()
    this.buildLeftFrame()
    this.buildCenterPanelFrame()
    this.buildRightPanelFrame()
    this.buildFooter()

    this.leftContainer = this.add.container(0, 0)
    this.attrContainer = this.add.container(0, 0)
    this.derivedContainer = this.add.container(0, 0)

    this.feedbackText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 52, '', {
      fontSize: '14px', fontFamily: 'Arial, sans-serif', color: '#ff8866',
      backgroundColor: '#000000aa', padding: { x: 10, y: 5 },
    }).setOrigin(0.5, 0.5).setDepth(50).setVisible(false)

    // ── Server state is the only source of truth ──────────────────────────
    const onSheet = (data: TeamSheet) => this.applySheet(data)
    const onError = (err: { message?: string }) => {
      if (err?.message) this.showFeedback(err.message)
    }
    this.socket?.on('team:sheet', onSheet)
    this.socket?.on('error', onError)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.socket?.off('team:sheet', onSheet)
      this.socket?.off('error', onError)
    })

    this.renderAll()
    this.socket?.emit('team:get_sheet')

    this.cKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.C)
    this.escKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC)
  }

  update() {
    if (Phaser.Input.Keyboard.JustDown(this.cKey) || Phaser.Input.Keyboard.JustDown(this.escKey)) {
      this.closeScene()
    }
  }

  private closeScene() {
    this.scene.stop('CharacterScene')
    this.scene.resume('WorldScene')
  }

  private applySheet(sheet: TeamSheet) {
    this.sheet = sheet
    // Keep the current selection if it still exists, else default to the active
    // member (or the first member).
    const ids = new Set(sheet.members.map((m) => m.id))
    if (!ids.has(this.selectedId)) {
      this.selectedId = ids.has(sheet.activeCharacterId)
        ? sheet.activeCharacterId
        : (sheet.members[0]?.id ?? '')
    }
    this.renderAll()
  }

  private selected(): SheetMember | undefined {
    return this.sheet?.members.find((m) => m.id === this.selectedId)
  }

  private select(id: string) {
    if (this.selectedId === id) return
    this.selectedId = id
    this.renderAll()
  }

  /** Ask the server to make `id` the character the player controls. */
  private playAs(id: string) {
    if (!this.socket || this.sheet?.activeCharacterId === id) return
    this.socket.emit('roster:set_active', { characterId: id })
    // Refresh the sheet so the active marker + portrait update.
    this.socket.emit('team:get_sheet')
  }

  private showFeedback(message: string) {
    this.feedbackText.setText(message).setVisible(true)
    this.time.delayedCall(2600, () => this.feedbackText.setVisible(false))
  }

  // ─── BACKGROUND / FRAMES ─────────────────────────────────────────────────

  private drawBackground() {
    const bg = this.add.graphics()
    bg.fillStyle(0x000000, 0.85)
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)

    const mainBg = this.add.graphics()
    mainBg.fillStyle(0x0a0a1e, 1)
    mainBg.fillRoundedRect(20, 20, GAME_WIDTH - 40, GAME_HEIGHT - 40, 16)
    mainBg.lineStyle(2, 0xffd700, 1)
    mainBg.strokeRoundedRect(20, 20, GAME_WIDTH - 40, GAME_HEIGHT - 40, 16)
    mainBg.lineStyle(1, 0xffd700, 0.25)
    mainBg.strokeRoundedRect(26, 26, GAME_WIDTH - 52, GAME_HEIGHT - 52, 13)
  }

  private buildHeader() {
    this.headerTitle = this.add.text(GAME_WIDTH / 2, 56, 'Active Team', {
      fontSize: '32px', fontFamily: 'Georgia, serif', color: '#ffd700', fontStyle: 'bold',
    }).setOrigin(0.5, 0.5)

    const div = this.add.graphics()
    div.lineStyle(1, 0xffd700, 0.3)
    div.lineBetween(40, 96, GAME_WIDTH - 40, 96)
  }

  /** Static frame for the left panel (member rail + selected portrait). */
  private buildLeftFrame() {
    const panelH = GAME_HEIGHT - 150
    const panelBg = this.add.graphics()
    panelBg.fillStyle(0x12122e, 1)
    panelBg.fillRoundedRect(LEFT_X, 110, LEFT_W, panelH, 12)
    panelBg.lineStyle(1, 0xffd700, 0.35)
    panelBg.strokeRoundedRect(LEFT_X, 110, LEFT_W, panelH, 12)
  }

  private buildCenterPanelFrame() {
    const panel = this.add.container(410, 110)
    const panelW = 500
    const panelH = GAME_HEIGHT - 150
    const panelBg = this.add.graphics()
    panelBg.fillStyle(0x12122e, 1)
    panelBg.fillRoundedRect(0, 0, panelW, panelH, 12)
    panelBg.lineStyle(1, 0xffd700, 0.35)
    panelBg.strokeRoundedRect(0, 0, panelW, panelH, 12)
    panel.add(panelBg)

    panel.add(
      this.add.text(panelW / 2, 18, 'Core Attributes', {
        fontSize: '18px', fontFamily: 'Georgia, serif', color: '#ffd700', fontStyle: 'bold',
      }).setOrigin(0.5, 0)
    )
    const div = this.add.graphics()
    div.lineStyle(1, 0xffd700, 0.3)
    div.lineBetween(430, 156, 890, 156)
  }

  private buildRightPanelFrame() {
    const panel = this.add.container(920, 110)
    const panelW = 330
    const panelH = GAME_HEIGHT - 150
    const panelBg = this.add.graphics()
    panelBg.fillStyle(0x12122e, 1)
    panelBg.fillRoundedRect(0, 0, panelW, panelH, 12)
    panelBg.lineStyle(1, 0xffd700, 0.35)
    panelBg.strokeRoundedRect(0, 0, panelW, panelH, 12)
    panel.add(panelBg)

    panel.add(
      this.add.text(panelW / 2, 18, 'Combat Stats', {
        fontSize: '18px', fontFamily: 'Georgia, serif', color: '#ffd700', fontStyle: 'bold',
      }).setOrigin(0.5, 0)
    )
    const div = this.add.graphics()
    div.lineStyle(1, 0xffd700, 0.3)
    div.lineBetween(940, 156, 1230, 156)
  }

  private buildFooter() {
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 24, 'Click a member to inspect  ·  Press  C  or  Escape  to close', {
      fontSize: '14px', fontFamily: 'Arial, sans-serif', color: '#666688',
      backgroundColor: '#00000066', padding: { x: 14, y: 5 },
    }).setOrigin(0.5, 1)
  }

  // ─── RENDER ──────────────────────────────────────────────────────────────

  private renderAll() {
    this.attrContainer?.removeAll(true)
    this.derivedContainer?.removeAll(true)
    this.leftContainer?.removeAll(true)

    if (this.sheet) {
      this.headerTitle.setText(`Active Team — ${this.sheet.teamName}`)
    }

    const sel = this.selected()
    if (!sel) {
      this.leftContainer.add(
        this.add.text(LEFT_X + LEFT_W / 2, 300, this.sheet ? 'No members in this team.' : 'Loading team…', {
          fontSize: '14px', fontFamily: 'Arial, sans-serif', color: '#556699', align: 'center',
        }).setOrigin(0.5, 0.5)
      )
      return
    }

    this.renderLeft(sel)
    this.renderAttributes(sel.stats.attributes)
    this.renderDerived(sel.stats.derived)
  }

  /** Left panel: selected member's portrait + level/XP + the team rail. */
  private renderLeft(sel: SheetMember) {
    const cx = LEFT_X + LEFT_W / 2

    // Selected portrait (class-ringed hero sprite).
    this.drawPortrait(cx, 168, 46, sel.class)
    this.leftContainer.add(
      this.add.text(cx, 224, sel.name, {
        fontSize: '20px', fontFamily: 'Georgia, serif', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0.5, 0)
    )
    this.leftContainer.add(
      this.add.text(cx, 248, classLabel(sel.class), {
        fontSize: '12px', fontFamily: 'Arial, sans-serif', color: '#aab0d6',
      }).setOrigin(0.5, 0)
    )

    // Level badge.
    const levelY = 270
    const lb = this.add.graphics()
    lb.fillStyle(0x1e1e42, 1)
    lb.fillRoundedRect(cx - 70, levelY, 140, 26, 8)
    lb.lineStyle(1, 0xffd700, 0.7)
    lb.strokeRoundedRect(cx - 70, levelY, 140, 26, 8)
    this.leftContainer.add(lb)
    this.leftContainer.add(
      this.add.text(cx, levelY + 13, `Level  ${sel.stats.level}`, {
        fontSize: '15px', fontFamily: 'Georgia, serif', color: '#ffd700', fontStyle: 'bold',
      }).setOrigin(0.5, 0.5)
    )

    // XP bar.
    const xpY = levelY + 34
    const xpW = LEFT_W - 80
    this.xpBar = { x: LEFT_X + 40, y: xpY, w: xpW, h: 12 }
    this.drawXpBar(sel.stats)

    // Active / Play-as control.
    const isActive = this.sheet?.activeCharacterId === sel.id
    const ctlY = xpY + 24
    if (isActive) {
      this.leftContainer.add(
        this.add.text(cx, ctlY, '★ Currently playing as this hero', {
          fontSize: '11px', fontFamily: 'Arial, sans-serif', color: '#66ff88',
        }).setOrigin(0.5, 0)
      )
    } else {
      const bw = 200, bx = cx - bw / 2
      const btn = this.add.graphics()
      btn.fillStyle(0x223322, 1)
      btn.fillRoundedRect(bx, ctlY, bw, 24, 6)
      btn.lineStyle(1, 0x44cc66, 0.8)
      btn.strokeRoundedRect(bx, ctlY, bw, 24, 6)
      this.leftContainer.add(btn)
      this.leftContainer.add(
        this.add.text(cx, ctlY + 12, '▶  Play as this hero', {
          fontSize: '12px', fontFamily: 'Arial, sans-serif', color: '#aaffbb', fontStyle: 'bold',
        }).setOrigin(0.5, 0.5)
      )
      const hit = this.add.rectangle(bx, ctlY, bw, 24, 0x000000, 0).setOrigin(0, 0).setInteractive({ useHandCursor: true })
      hit.on('pointerup', () => this.playAs(sel.id))
      this.leftContainer.add(hit)
    }

    // Team rail divider + label.
    const div = this.add.graphics()
    div.lineStyle(1, 0xffd700, 0.2)
    div.lineBetween(LEFT_X + 20, RAIL_TOP - 14, LEFT_X + LEFT_W - 20, RAIL_TOP - 14)
    this.leftContainer.add(div)
    this.leftContainer.add(
      this.add.text(LEFT_X + 24, RAIL_TOP - 30, 'TEAM', {
        fontSize: '11px', fontFamily: 'Arial, sans-serif', color: '#8888bb', fontStyle: 'bold',
      }).setOrigin(0, 0)
    )

    // Member cards.
    const members = this.sheet?.members ?? []
    members.forEach((m, i) => this.drawMemberCard(m, RAIL_TOP + i * (CARD_H + CARD_GAP)))
  }

  private drawXpBar(stats: ClientStats) {
    const { x, y, w, h } = this.xpBar
    const bg = this.add.graphics()
    bg.fillStyle(0x05050f, 1)
    bg.fillRoundedRect(x, y, w, h, 6)
    bg.lineStyle(1, 0xffd700, 0.4)
    bg.strokeRoundedRect(x, y, w, h, 6)
    this.leftContainer.add(bg)

    const span = stats.xpForNextLevel
    const into = stats.xpIntoLevel
    const maxed = span <= 0
    const frac = maxed ? 1 : Phaser.Math.Clamp(into / span, 0, 1)
    if (frac > 0) {
      const fill = this.add.graphics()
      fill.fillStyle(maxed ? 0xffd700 : 0x55bbff, 1)
      fill.fillRoundedRect(x + 1, y + 1, Math.max(2, (w - 2) * frac), h - 2, 5)
      this.leftContainer.add(fill)
    }
    this.leftContainer.add(
      this.add.text(x + w / 2, y + h / 2, maxed ? 'MAX LEVEL' : `${into} / ${span} XP`, {
        fontSize: '10px', fontFamily: 'Arial, sans-serif', color: '#e8e8ff', fontStyle: 'bold',
      }).setOrigin(0.5, 0.5)
    )
  }

  /** A selectable member card in the team rail. */
  private drawMemberCard(m: SheetMember, y: number) {
    const x = LEFT_X + 14
    const w = LEFT_W - 28
    const selected = m.id === this.selectedId
    const isActive = this.sheet?.activeCharacterId === m.id
    const accent = classColor(m.class)

    const card = this.add.graphics()
    card.fillStyle(selected ? 0x24244e : 0x161632, selected ? 1 : 0.55)
    card.fillRoundedRect(x, y, w, CARD_H, 8)
    card.lineStyle(selected ? 2 : 1, selected ? 0xffd700 : 0x33335a, selected ? 0.9 : 0.6)
    card.strokeRoundedRect(x, y, w, CARD_H, 8)
    // Class accent stripe.
    card.fillStyle(accent, 1)
    card.fillRoundedRect(x, y, 4, CARD_H, 2)
    this.leftContainer.add(card)

    // Class medallion.
    this.drawMedallion(x + 28, y + CARD_H / 2, 15, m.class)

    // Name + meta.
    this.leftContainer.add(
      this.add.text(x + 50, y + 7, m.name, {
        fontSize: '14px', fontFamily: 'Georgia, serif',
        color: selected ? '#ffffff' : '#ccccdd', fontStyle: 'bold',
      }).setOrigin(0, 0)
    )
    this.leftContainer.add(
      this.add.text(x + 50, y + 26, `Lv ${m.level} · ${classLabel(m.class)}`, {
        fontSize: '10px', fontFamily: 'Arial, sans-serif', color: '#8a90bb',
      }).setOrigin(0, 0)
    )

    // Power (right) + active marker.
    this.leftContainer.add(
      this.add.text(x + w - 12, y + 8, `${m.power}`, {
        fontSize: '16px', fontFamily: 'Georgia, serif', color: '#ffd700', fontStyle: 'bold',
      }).setOrigin(1, 0)
    )
    this.leftContainer.add(
      this.add.text(x + w - 12, y + 28, isActive ? '★ playing' : 'PWR', {
        fontSize: '9px', fontFamily: 'Arial, sans-serif', color: isActive ? '#66ff88' : '#7777aa',
      }).setOrigin(1, 0)
    )

    const hit = this.add.rectangle(x, y, w, CARD_H, 0x000000, 0).setOrigin(0, 0).setInteractive({ useHandCursor: true })
    hit.on('pointerup', () => this.select(m.id))
    this.leftContainer.add(hit)
  }

  /** Class-colored medallion (placeholder portrait until per-class sprites land). */
  private drawMedallion(cx: number, cy: number, r: number, cls: string) {
    const color = classColor(cls)
    const g = this.add.graphics()
    g.fillStyle(color, 0.22); g.fillCircle(cx, cy, r)
    g.lineStyle(2, color, 0.9); g.strokeCircle(cx, cy, r)
    this.leftContainer.add(g)
    this.leftContainer.add(
      this.add.text(cx, cy, classLabel(cls).charAt(0), {
        fontSize: `${Math.round(r * 1.1)}px`, fontFamily: 'Georgia, serif', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0.5, 0.5)
    )
  }

  /** Large selected portrait: animated hero sprite inside a class-colored ring. */
  private drawPortrait(cx: number, cy: number, r: number, cls: string) {
    const color = classColor(cls)
    const shadow = this.add.graphics()
    shadow.fillStyle(0x000000, 0.18)
    shadow.fillEllipse(cx, cy + r + 6, r * 1.5, 10)
    this.leftContainer.add(shadow)

    const ring = this.add.graphics()
    ring.fillStyle(color, 0.16); ring.fillCircle(cx, cy, r + 4)
    ring.lineStyle(3, color, 0.9); ring.strokeCircle(cx, cy, r + 4)
    this.leftContainer.add(ring)

    if (this.textures.exists('character_idle')) {
      const hero = this.add.sprite(cx, cy + 4, 'character_idle', 12).setScale(2.2)
      if (this.anims.exists('idle_down')) hero.play('idle_down')
      this.leftContainer.add(hero)
    } else {
      this.leftContainer.add(
        this.add.text(cx, cy, classLabel(cls).charAt(0), {
          fontSize: `${r}px`, fontFamily: 'Georgia, serif', color: '#ffffff', fontStyle: 'bold',
        }).setOrigin(0.5, 0.5)
      )
    }
  }

  // ─── DYNAMIC STAT RENDERING (selected member) ────────────────────────────

  /** Five attribute rows, each with total and a base/+gear breakdown. */
  private renderAttributes(rows: ClientStatRow[]) {
    const panX = 410
    const panW = 500
    const rowStartY = 110 + 60
    const rowH = (GAME_HEIGHT - 150 - 80) / Math.max(1, rows.length)

    rows.forEach((row, i) => {
      const rowY = rowStartY + i * rowH
      const color = STAT_COLORS[row.key] ?? 0x8888aa
      const label = row.label
      const desc = STAT_DESCRIPTIONS[row.key] ?? ''

      // Row background
      const rowBg = this.add.graphics()
      rowBg.fillStyle(0x1e1e42, 0.4)
      rowBg.fillRoundedRect(panX + 14, rowY, panW - 28, rowH - 10, 8)
      this.attrContainer.add(rowBg)

      // Icon
      const iconGfx = this.add.graphics()
      this.drawStatIcon(iconGfx, row.key, panX + 44, rowY + 34, color)
      this.attrContainer.add(iconGfx)

      // Name + description
      this.attrContainer.add(
        this.add.text(panX + 76, rowY + 12, label, {
          fontSize: '17px', fontFamily: 'Georgia, serif', color: '#ffd700', fontStyle: 'bold',
        }).setOrigin(0, 0)
      )
      this.attrContainer.add(
        this.add.text(panX + 76, rowY + 34, desc, {
          fontSize: '11px', fontFamily: 'Arial, sans-serif', color: '#888888',
        }).setOrigin(0, 0)
      )

      // Total value + (base / +gear) breakdown, right side.
      const valRightX = panX + panW - 30
      this.attrContainer.add(
        this.add.text(valRightX, rowY + 8, String(row.total), {
          fontSize: '28px', fontFamily: 'Georgia, serif', color: '#ffffff', fontStyle: 'bold',
        }).setOrigin(1, 0)
      )
      const breakdown = row.gear > 0
        ? `${row.base} base  +${row.gear}`
        : `${row.base} base`
      this.attrContainer.add(
        this.add.text(valRightX, rowY + 40, breakdown, {
          fontSize: '11px', fontFamily: 'Arial, sans-serif',
          color: row.gear > 0 ? '#44ff88' : '#7777aa',
        }).setOrigin(1, 0)
      )

      // Two-segment bar (base + gear)
      this.drawAttrBar(row, panX + 76, rowY + 56, panW - 160, color)
    })
  }

  private drawAttrBar(row: ClientStatRow, x: number, y: number, maxW: number, baseColor: number) {
    const scale = 40 // attributes rarely exceed this in early game
    const baseFrac = Math.min(1, row.base / scale)
    const totFrac = Math.min(1, row.total / scale)
    const baseW = baseFrac * maxW
    const totW = totFrac * maxW

    const bar = this.add.graphics()
    bar.fillStyle(0x2a2a50, 1)
    bar.fillRoundedRect(x, y, maxW, 10, 4)
    if (row.gear > 0 && totW > baseW) {
      bar.fillStyle(0x33cc66, 1)
      bar.fillRoundedRect(x, y, Math.max(totW, 2), 10, 4)
    }
    bar.fillStyle(baseColor, 1)
    bar.fillRoundedRect(x, y, Math.max(Math.min(baseW, totW), 2), 10, 4)
    this.attrContainer.add(bar)
  }

  /** Derived combat stats, each showing total and a base/+gear breakdown. */
  private renderDerived(rows: ClientStatRow[]) {
    const panX = 920
    const panW = 330
    const rowStart = 110 + 56
    const rowH = (GAME_HEIGHT - 150 - 70) / Math.max(1, rows.length)

    rows.forEach((row, i) => {
      const rowY = rowStart + i * rowH
      const fmt = (v: number) => (row.isPercent ? `${v}%` : `${v}`)

      const rowBg = this.add.graphics()
      rowBg.fillStyle(0x1e1e42, 0.3)
      rowBg.fillRoundedRect(panX + 14, rowY, panW - 28, rowH - 8, 8)
      this.derivedContainer.add(rowBg)

      this.derivedContainer.add(
        this.add.text(panX + 26, rowY + 10, row.label, {
          fontSize: '14px', fontFamily: 'Georgia, serif', color: '#aaaacc',
        }).setOrigin(0, 0)
      )

      const valX = panX + panW - 26
      const totalText = this.add.text(valX, rowY + 6, fmt(row.total), {
        fontSize: '24px', fontFamily: 'Georgia, serif', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(1, 0)
      this.derivedContainer.add(totalText)

      const breakdown = row.gear > 0
        ? `${fmt(row.base)}  +${fmt(row.gear)}`
        : `${fmt(row.base)} base`
      this.derivedContainer.add(
        this.add.text(valX, rowY + 36, breakdown, {
          fontSize: '11px', fontFamily: 'Arial, sans-serif',
          color: row.gear > 0 ? '#44ff88' : '#7777aa',
        }).setOrigin(1, 0)
      )
    })
  }

  // ─── ICON ART ────────────────────────────────────────────────────────────

  private drawStatIcon(g: Phaser.GameObjects.Graphics, stat: string, cx: number, cy: number, color: number) {
    g.fillStyle(color, 0.2)
    g.fillCircle(cx, cy, 20)
    g.lineStyle(1.5, color, 0.8)
    g.strokeCircle(cx, cy, 20)
    g.fillStyle(color, 1)

    switch (stat) {
      case 'constitution':
        g.fillTriangle(cx, cy - 12, cx - 10, cy - 6, cx - 10, cy + 6)
        g.fillTriangle(cx, cy - 12, cx + 10, cy - 6, cx + 10, cy + 6)
        g.fillTriangle(cx - 10, cy + 6, cx + 10, cy + 6, cx, cy + 14)
        break
      case 'intelligence':
        for (let i = 0; i < 8; i++) {
          const angle = (i / 8) * Math.PI * 2 - Math.PI / 2
          const inner = i % 2 === 0 ? 12 : 5
          const x2 = cx + Math.cos(angle) * inner
          const y2 = cy + Math.sin(angle) * inner
          const x1 = cx + Math.cos(angle - Math.PI / 8) * 4
          const y1 = cy + Math.sin(angle - Math.PI / 8) * 4
          const x3 = cx + Math.cos(angle + Math.PI / 8) * 4
          const y3 = cy + Math.sin(angle + Math.PI / 8) * 4
          g.fillTriangle(x1, y1, x2, y2, x3, y3)
        }
        break
      case 'dexterity':
        g.fillTriangle(cx + 3, cy - 13, cx - 5, cy + 1, cx + 3, cy + 1)
        g.fillTriangle(cx - 3, cy - 1, cx + 5, cy - 1, cx - 3, cy + 13)
        g.fillRect(cx - 5, cy - 2, 10, 4)
        break
      case 'strength':
        g.fillRoundedRect(cx - 9, cy - 12, 18, 8, 3)
        g.fillRoundedRect(cx - 9, cy - 5, 16, 12, 2)
        g.fillRoundedRect(cx + 6, cy - 8, 6, 8, 3)
        break
      case 'spirit':
        g.fillTriangle(cx, cy - 14, cx - 8, cy + 4, cx + 8, cy + 4)
        g.fillStyle(0xff88ff, 0.8)
        g.fillTriangle(cx, cy - 6, cx - 5, cy + 8, cx + 5, cy + 8)
        break
    }
  }
}
