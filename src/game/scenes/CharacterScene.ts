// ============================================================
// CharacterScene — the character sheet.
//
// SECURITY: this scene only RENDERS the server-pushed stats
// snapshot (StatsStore, fed by 'stats:update') and requests
// allocation via 'character:allocate'.  The five attributes,
// allocation points, and all derived combat stats are computed
// and validated server-side; nothing here changes a stat locally.
// ============================================================

import Phaser from 'phaser'
import type { Socket } from 'socket.io-client'
import { GAME_WIDTH, GAME_HEIGHT } from '../constants'
import { StatsStore, type ClientStats, type ClientStatRow } from '../systems/StatsStore'

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

export class CharacterScene extends Phaser.Scene {
  private cKey!: Phaser.Input.Keyboard.Key
  private escKey!: Phaser.Input.Keyboard.Key

  private socket: Socket | null = null
  private stats: ClientStats | null = null

  // Dynamic containers (rebuilt on every stats:update)
  private attrContainer!: Phaser.GameObjects.Container
  private derivedContainer!: Phaser.GameObjects.Container
  private pointsText!: Phaser.GameObjects.Text
  private feedbackText!: Phaser.GameObjects.Text

  constructor() {
    super({ key: 'CharacterScene' })
  }

  create() {
    this.socket = (window as typeof window & { __lumenSocket?: Socket }).__lumenSocket ?? null
    this.stats = StatsStore.get()

    this.drawBackground()
    this.buildHeader()
    this.buildLeftPanel()
    this.buildCenterPanelFrame()
    this.buildRightPanelFrame()
    this.buildFooter()

    this.attrContainer = this.add.container(0, 0)
    this.derivedContainer = this.add.container(0, 0)

    this.feedbackText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 52, '', {
      fontSize: '14px', fontFamily: 'Arial, sans-serif', color: '#ff8866',
      backgroundColor: '#000000aa', padding: { x: 10, y: 5 },
    }).setOrigin(0.5, 0.5).setDepth(50).setVisible(false)

    // ── Server state is the only source of truth ──────────────────────────
    const unsubscribe = StatsStore.onUpdate((s) => this.applyStats(s))
    const onError = (err: { message?: string }) => {
      if (err?.message) this.showFeedback(err.message)
    }
    this.socket?.on('error', onError)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      unsubscribe()
      this.socket?.off('error', onError)
    })

    this.renderStats()
    this.socket?.emit('stats:get')

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

  private applyStats(stats: ClientStats) {
    this.stats = stats
    this.renderStats()
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
    this.add.text(GAME_WIDTH / 2, 56, 'Character Sheet', {
      fontSize: '32px', fontFamily: 'Georgia, serif', color: '#ffd700', fontStyle: 'bold',
    }).setOrigin(0.5, 0.5)

    const div = this.add.graphics()
    div.lineStyle(1, 0xffd700, 0.3)
    div.lineBetween(40, 96, GAME_WIDTH - 40, 96)
  }

  // ─── LEFT PANEL (portrait + level + allocation summary) ──────────────────

  private buildLeftPanel() {
    const panelX = 30
    const panelY = 110
    const panelW = 370
    const panelH = GAME_HEIGHT - 150

    const panel = this.add.container(panelX, panelY)
    const panelBg = this.add.graphics()
    panelBg.fillStyle(0x12122e, 1)
    panelBg.fillRoundedRect(0, 0, panelW, panelH, 12)
    panelBg.lineStyle(1, 0xffd700, 0.35)
    panelBg.strokeRoundedRect(0, 0, panelW, panelH, 12)
    panel.add(panelBg)

    // Character portrait — the player's front-facing sprite
    this.addCharacterPortrait(panel, panelW / 2, 150)

    // Level badge (updated from stats)
    const levelY = 300
    const levelBadge = this.add.graphics()
    levelBadge.fillStyle(0x1e1e42, 1)
    levelBadge.fillRoundedRect(panelW / 2 - 70, levelY, 140, 30, 8)
    levelBadge.lineStyle(1, 0xffd700, 0.7)
    levelBadge.strokeRoundedRect(panelW / 2 - 70, levelY, 140, 30, 8)
    panel.add(levelBadge)

    const levelText = this.add.text(panelW / 2, levelY + 15, `Level  ${this.stats?.level ?? 1}`, {
      fontSize: '16px', fontFamily: 'Georgia, serif', color: '#ffd700', fontStyle: 'bold',
    }).setOrigin(0.5, 0.5)
    panel.add(levelText)

    // Unspent-points callout
    const pointsY = levelY + 56
    const pBadge = this.add.graphics()
    pBadge.fillStyle(0x1a2a1a, 1)
    pBadge.fillRoundedRect(30, pointsY, panelW - 60, 64, 10)
    pBadge.lineStyle(1, 0x44cc66, 0.6)
    pBadge.strokeRoundedRect(30, pointsY, panelW - 60, 64, 10)
    panel.add(pBadge)

    panel.add(
      this.add.text(panelW / 2, pointsY + 12, 'Unspent Points', {
        fontSize: '13px', fontFamily: 'Arial, sans-serif', color: '#88cc99',
      }).setOrigin(0.5, 0)
    )
    this.pointsText = this.add.text(panelW / 2, pointsY + 30, String(this.stats?.unspentPoints ?? 0), {
      fontSize: '24px', fontFamily: 'Georgia, serif', color: '#66ff88', fontStyle: 'bold',
    }).setOrigin(0.5, 0)
    panel.add(this.pointsText)

    panel.add(
      this.add.text(panelW / 2, panelH - 60,
        'You earn 3 points per level.\nSpend them with the  +  buttons.', {
          fontSize: '11px', fontFamily: 'Arial, sans-serif',
          color: '#556699', align: 'center',
        }).setOrigin(0.5, 0)
    )
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
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 24, 'Press  C  or  Escape  to close', {
      fontSize: '14px', fontFamily: 'Arial, sans-serif', color: '#666688',
      backgroundColor: '#00000066', padding: { x: 14, y: 5 },
    }).setOrigin(0.5, 1)
  }

  // ─── DYNAMIC STAT RENDERING ──────────────────────────────────────────────

  private renderStats() {
    this.attrContainer?.removeAll(true)
    this.derivedContainer?.removeAll(true)

    if (this.pointsText) this.pointsText.setText(String(this.stats?.unspentPoints ?? 0))

    if (!this.stats) {
      this.attrContainer.add(
        this.add.text(660, 300, 'Loading stats…', {
          fontSize: '15px', fontFamily: 'Arial, sans-serif', color: '#445566',
        }).setOrigin(0.5, 0.5)
      )
      return
    }

    this.renderAttributes(this.stats.attributes, this.stats.unspentPoints)
    this.renderDerived(this.stats.derived)
  }

  /** Five attribute rows, each with total, base+gear breakdown, and a [+] button. */
  private renderAttributes(rows: ClientStatRow[], unspent: number) {
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

      // Total value + (base / +gear) breakdown, right side, left of the [+] button.
      const valRightX = panX + panW - 70
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

      // Two-segment bar (base blue + gear green)
      this.drawAttrBar(row, panX + 76, rowY + 56, panW - 160, color)

      // [+] allocation button
      this.createAllocateButton(row.key, panX + panW - 52, rowY + 14, unspent > 0)
    })
  }

  private drawAttrBar(row: ClientStatRow, x: number, y: number, maxW: number, baseColor: number) {
    const scale = 30 // attributes rarely exceed this in early game
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

  private createAllocateButton(attrKey: string, x: number, y: number, enabled: boolean) {
    const w = 40
    const h = 40
    const btn = this.add.graphics()
    const draw = (col: number, border: number) => {
      btn.clear()
      btn.fillStyle(col, 1)
      btn.fillRoundedRect(x, y, w, h, 8)
      btn.lineStyle(2, border, enabled ? 1 : 0.4)
      btn.strokeRoundedRect(x, y, w, h, 8)
    }
    draw(enabled ? 0x1a3a1a : 0x222233, enabled ? 0x44cc66 : 0x444455)
    this.attrContainer.add(btn)

    const label = this.add.text(x + w / 2, y + h / 2, '+', {
      fontSize: '24px', fontFamily: 'Arial, sans-serif',
      color: enabled ? '#66ff88' : '#555566', fontStyle: 'bold',
    }).setOrigin(0.5, 0.5)
    this.attrContainer.add(label)

    if (!enabled) return

    const hit = this.add.rectangle(x + w / 2, y + h / 2, w, h, 0, 0)
      .setInteractive({ useHandCursor: true })
    hit.on('pointerover', () => draw(0x2a5a2a, 0x66ff88))
    hit.on('pointerout', () => draw(0x1a3a1a, 0x44cc66))
    hit.on('pointerdown', () => {
      if (!this.socket?.connected) {
        this.showFeedback('Not connected to the server.')
        return
      }
      // Request only — the server validates unspent points and pushes new stats.
      this.socket.emit('character:allocate', { attribute: attrKey })
    })
    this.attrContainer.add(hit)
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

  // ─── ICON / PORTRAIT ART ─────────────────────────────────────────────────

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

  /** The player's own front-facing character sprite (same art as the overworld
   *  avatar), added to the given panel container at local (cx, cy). */
  private addCharacterPortrait(
    container: Phaser.GameObjects.Container, cx: number, cy: number,
  ) {
    const shadow = this.add.graphics()
    shadow.fillStyle(0x000000, 0.18)
    shadow.fillEllipse(cx, cy + 70, 72, 12)
    container.add(shadow)

    if (this.textures.exists('character_idle')) {
      const hero = this.add.sprite(cx, cy, 'character_idle', 12).setScale(3)
      if (this.anims.exists('idle_down')) hero.play('idle_down')
      container.add(hero)
    }
  }
}
