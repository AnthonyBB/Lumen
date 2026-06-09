import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT } from '../constants'

const MOCK_STATS = {
  constitution: 10,
  intelligence: 12,
  dexterity: 8,
  strength: 9,
  spirit: 11,
}

const MOCK_PLAYER = {
  name: 'Adventurer',
  class: 'Wizard',
  level: 1,
  xp: 0,
  xpToNext: 100,
}

const STAT_COLORS = {
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
  spirit: 'Willpower & luck',
}

export class CharacterScene extends Phaser.Scene {
  private cKey!: Phaser.Input.Keyboard.Key
  private escKey!: Phaser.Input.Keyboard.Key

  // Containers for animation
  private leftPanel!: Phaser.GameObjects.Container
  private centerPanel!: Phaser.GameObjects.Container
  private rightPanel!: Phaser.GameObjects.Container
  private headerContainer!: Phaser.GameObjects.Container
  private footerText!: Phaser.GameObjects.Text

  // Portrait glow graphics for idle pulse
  private portraitGlow!: Phaser.GameObjects.Graphics

  // Stat bar fill graphics keyed by stat name
  private statBarFills: Map<string, Phaser.GameObjects.Graphics> = new Map()

  constructor() {
    super({ key: 'CharacterScene' })
  }

  create() {
    this.statBarFills.clear()

    // Full-screen dark background
    const bg = this.add.graphics()
    bg.fillStyle(0x000000, 0.85)
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)

    // Main panel background
    const mainBg = this.add.graphics()
    mainBg.fillStyle(0x0a0a1e, 1)
    mainBg.fillRoundedRect(20, 20, GAME_WIDTH - 40, GAME_HEIGHT - 40, 16)
    mainBg.lineStyle(2, 0xffd700, 1)
    mainBg.strokeRoundedRect(20, 20, GAME_WIDTH - 40, GAME_HEIGHT - 40, 16)

    // Decorative inner border
    mainBg.lineStyle(1, 0xffd700, 0.25)
    mainBg.strokeRoundedRect(26, 26, GAME_WIDTH - 52, GAME_HEIGHT - 52, 13)

    // Build panels (initially off-screen for slide-in animation)
    this.buildHeader()
    this.buildLeftPanel()
    this.buildCenterPanel()
    this.buildRightPanel()
    this.buildFooter()

    // Register keys
    this.cKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.C)
    this.escKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC)

    // Animate panels in
    this.animatePanelsIn()
  }

  // ─── HEADER ────────────────────────────────────────────────────────────────

  private buildHeader() {
    this.headerContainer = this.add.container(GAME_WIDTH / 2, 0)

    const title = this.add.text(0, 56, 'Character Sheet', {
      fontSize: '32px',
      fontFamily: 'Georgia, serif',
      color: '#ffd700',
      fontStyle: 'bold',
    }).setOrigin(0.5, 0.5)
    this.headerContainer.add(title)

    // Decorative rune dividers
    const divGfx = this.add.graphics()

    // Left divider line
    divGfx.lineStyle(2, 0xffd700, 0.7)
    divGfx.lineBetween(-560, 56, -200, 56)
    // Right divider line
    divGfx.lineBetween(200, 56, 560, 56)

    // Left rune diamonds
    this.drawRuneDivider(divGfx, -190, 56, true)
    // Right rune diamonds
    this.drawRuneDivider(divGfx, 190, 56, false)

    // Corner ornaments
    this.drawCornerOrnament(divGfx, -550, 56)
    this.drawCornerOrnament(divGfx, 550, 56)

    this.headerContainer.add(divGfx)

    // Bottom divider below title
    const bottomDiv = this.add.graphics()
    bottomDiv.lineStyle(1, 0xffd700, 0.3)
    bottomDiv.lineBetween(-580, 84, 580, 84)
    this.headerContainer.add(bottomDiv)
  }

  private drawRuneDivider(g: Phaser.GameObjects.Graphics, x: number, y: number, leftSide: boolean) {
    const dir = leftSide ? -1 : 1
    // Diamond shape
    g.fillStyle(0xffd700, 0.9)
    g.fillTriangle(x, y - 6, x + dir * 8, y, x, y + 6)
    g.fillTriangle(x, y - 6, x - dir * 8, y, x, y + 6)
    // Small flanking diamonds
    g.fillStyle(0xffd700, 0.55)
    g.fillTriangle(x + dir * 16, y - 3, x + dir * 22, y, x + dir * 16, y + 3)
    g.fillTriangle(x + dir * 26, y - 2, x + dir * 31, y, x + dir * 26, y + 2)
  }

  private drawCornerOrnament(g: Phaser.GameObjects.Graphics, x: number, y: number) {
    g.fillStyle(0xffd700, 0.8)
    g.fillCircle(x, y, 4)
    g.fillStyle(0xffd700, 0.4)
    g.fillCircle(x, y, 7)
  }

  // ─── LEFT PANEL (Portrait) ─────────────────────────────────────────────────

  private buildLeftPanel() {
    const panelX = 30
    const panelY = 100
    const panelW = 370
    const panelH = GAME_HEIGHT - 130

    this.leftPanel = this.add.container(panelX, panelY)

    // Panel background
    const panelBg = this.add.graphics()
    panelBg.fillStyle(0x12122e, 1)
    panelBg.fillRoundedRect(0, 0, panelW, panelH, 12)
    panelBg.lineStyle(1, 0xffd700, 0.35)
    panelBg.strokeRoundedRect(0, 0, panelW, panelH, 12)
    this.leftPanel.add(panelBg)

    // Portrait frame background
    const portraitX = panelW / 2
    const portraitY = 100
    const portraitFrameW = 160
    const portraitFrameH = 200

    // Glow effect (will pulse)
    this.portraitGlow = this.add.graphics()
    this.drawPortraitGlow(this.portraitGlow, portraitX, portraitY, portraitFrameW, portraitFrameH)
    this.leftPanel.add(this.portraitGlow)

    // Portrait frame
    const frame = this.add.graphics()
    frame.fillStyle(0x1e1e42, 1)
    frame.fillRoundedRect(portraitX - portraitFrameW / 2 - 4, portraitY - portraitFrameH / 2 - 4, portraitFrameW + 8, portraitFrameH + 8, 8)
    frame.lineStyle(2, 0xffd700, 1)
    frame.strokeRoundedRect(portraitX - portraitFrameW / 2 - 4, portraitY - portraitFrameH / 2 - 4, portraitFrameW + 8, portraitFrameH + 8, 8)
    // Inner border
    frame.lineStyle(1, 0xffd700, 0.3)
    frame.strokeRoundedRect(portraitX - portraitFrameW / 2 - 1, portraitY - portraitFrameH / 2 - 1, portraitFrameW + 2, portraitFrameH + 2, 6)
    // Corner diamonds on portrait frame
    const corners: [number, number][] = [
      [portraitX - portraitFrameW / 2 - 4, portraitY - portraitFrameH / 2 - 4],
      [portraitX + portraitFrameW / 2 + 4, portraitY - portraitFrameH / 2 - 4],
      [portraitX - portraitFrameW / 2 - 4, portraitY + portraitFrameH / 2 + 4],
      [portraitX + portraitFrameW / 2 + 4, portraitY + portraitFrameH / 2 + 4],
    ]
    for (const [cx, cy] of corners) {
      frame.fillStyle(0xffd700, 1)
      frame.fillTriangle(cx, cy - 5, cx - 5, cy, cx, cy + 5)
      frame.fillTriangle(cx, cy - 5, cx + 5, cy, cx, cy + 5)
    }
    this.leftPanel.add(frame)

    // Draw large wizard portrait
    const wizard = this.add.graphics()
    this.drawWizardPortrait(wizard, portraitX, portraitY)
    this.leftPanel.add(wizard)

    // Character name
    const nameText = this.add.text(panelW / 2, portraitY + portraitFrameH / 2 + 20, MOCK_PLAYER.name, {
      fontSize: '22px',
      fontFamily: 'Georgia, serif',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5, 0)
    this.leftPanel.add(nameText)

    // Class
    const classText = this.add.text(panelW / 2, portraitY + portraitFrameH / 2 + 48, MOCK_PLAYER.class, {
      fontSize: '15px',
      fontFamily: 'Georgia, serif',
      color: '#ffd700',
      fontStyle: 'italic',
    }).setOrigin(0.5, 0)
    this.leftPanel.add(classText)

    // Divider under name
    const nameDivGfx = this.add.graphics()
    nameDivGfx.lineStyle(1, 0xffd700, 0.3)
    nameDivGfx.lineBetween(20, portraitY + portraitFrameH / 2 + 76, panelW - 20, portraitY + portraitFrameH / 2 + 76)
    this.leftPanel.add(nameDivGfx)

    // Level badge
    const levelY = portraitY + portraitFrameH / 2 + 92
    const levelBadge = this.add.graphics()
    levelBadge.fillStyle(0x1e1e42, 1)
    levelBadge.fillRoundedRect(panelW / 2 - 60, levelY, 120, 28, 8)
    levelBadge.lineStyle(1, 0xffd700, 0.7)
    levelBadge.strokeRoundedRect(panelW / 2 - 60, levelY, 120, 28, 8)
    this.leftPanel.add(levelBadge)

    const levelText = this.add.text(panelW / 2, levelY + 14, `Level  ${MOCK_PLAYER.level}`, {
      fontSize: '15px',
      fontFamily: 'Georgia, serif',
      color: '#ffd700',
      fontStyle: 'bold',
    }).setOrigin(0.5, 0.5)
    this.leftPanel.add(levelText)

    // XP bar section
    const xpY = levelY + 44
    const xpLabel = this.add.text(20, xpY, 'Experience', {
      fontSize: '12px',
      fontFamily: 'Arial, sans-serif',
      color: '#aaaaaa',
    }).setOrigin(0, 0)
    this.leftPanel.add(xpLabel)

    const xpValueText = this.add.text(panelW - 20, xpY, `${MOCK_PLAYER.xp} / ${MOCK_PLAYER.xpToNext} XP`, {
      fontSize: '12px',
      fontFamily: 'Arial, sans-serif',
      color: '#aaaaaa',
    }).setOrigin(1, 0)
    this.leftPanel.add(xpValueText)

    const xpBarY = xpY + 20
    const xpBarW = panelW - 40
    const xpBg = this.add.graphics()
    xpBg.fillStyle(0x333355, 1)
    xpBg.fillRoundedRect(20, xpBarY, xpBarW, 14, 5)
    this.leftPanel.add(xpBg)

    const xpPct = MOCK_PLAYER.xp / MOCK_PLAYER.xpToNext
    if (xpPct > 0) {
      const xpFill = this.add.graphics()
      xpFill.fillStyle(0xffaa00, 1)
      xpFill.fillRoundedRect(20, xpBarY, Math.max(8, xpBarW * xpPct), 14, 5)
      this.leftPanel.add(xpFill)
    }

    // Class emblem section
    const emblemY = xpBarY + 36
    const emblemGfx = this.add.graphics()
    this.drawClassEmblem(emblemGfx, panelW / 2, emblemY + 48)
    this.leftPanel.add(emblemGfx)

    const emblemLabel = this.add.text(panelW / 2, emblemY + 110, 'Order of the Azure Flame', {
      fontSize: '11px',
      fontFamily: 'Georgia, serif',
      color: '#7788cc',
      fontStyle: 'italic',
    }).setOrigin(0.5, 0)
    this.leftPanel.add(emblemLabel)
  }

  private drawPortraitGlow(g: Phaser.GameObjects.Graphics, cx: number, cy: number, fw: number, fh: number) {
    g.clear()
    for (let r = 24; r >= 4; r -= 4) {
      const alpha = (1 - r / 28) * 0.18
      g.fillStyle(0x6633cc, alpha)
      g.fillRoundedRect(cx - fw / 2 - 4 - r, cy - fh / 2 - 4 - r, fw + 8 + r * 2, fh + 8 + r * 2, 10 + r)
    }
  }

  private drawWizardPortrait(g: Phaser.GameObjects.Graphics, cx: number, cy: number) {
    // Scale-up wizard art from BootScene (~32x48 → larger portrait)
    const scale = 3.2
    const ox = cx - 16 * scale
    const oy = cy - 24 * scale

    const s = (x: number, y: number): [number, number] => [ox + x * scale, oy + y * scale]

    // Robe body
    g.fillStyle(0x4b0082, 1)
    const [rb1x, rb1y] = s(7, 22)
    g.fillRect(rb1x, rb1y, 18 * scale, 22 * scale)

    // Robe bottom flare
    g.fillStyle(0x3a006f, 1)
    g.fillTriangle(...s(7, 44), ...s(0, 48), ...s(14, 44))
    g.fillTriangle(...s(25, 44), ...s(32, 48), ...s(18, 44))

    // Robe highlight stripe
    g.fillStyle(0x7b2fc4, 0.5)
    const [rhs1x, rhs1y] = s(14, 22)
    g.fillRect(rhs1x, rhs1y, 4 * scale, 20 * scale)

    // Belt
    g.fillStyle(0xffd700, 1)
    const [bx, by] = s(7, 34)
    g.fillRect(bx, by, 18 * scale, 3 * scale)

    // Head
    g.fillStyle(0xffe0b2, 1)
    g.fillCircle(...s(16, 16), 9 * scale)

    // Eyes
    g.fillStyle(0x1a1a2e, 1)
    g.fillCircle(...s(13, 15), 2 * scale)
    g.fillCircle(...s(20, 15), 2 * scale)

    // Eye gleam
    g.fillStyle(0xffffff, 1)
    g.fillCircle(...s(14, 14), 0.9 * scale)
    g.fillCircle(...s(21, 14), 0.9 * scale)

    // Beard / face details
    g.fillStyle(0xc8a86b, 0.7)
    const [bdx, bdy] = s(11, 20)
    g.fillRect(bdx, bdy, 10 * scale, 4 * scale)

    // Wizard hat brim
    g.fillStyle(0x1a0050, 1)
    g.fillEllipse(...s(16, 9), 24 * scale, 7 * scale)

    // Hat cone
    g.fillStyle(0x2d0080, 1)
    g.fillTriangle(...s(16, 0), ...s(7, 10), ...s(25, 10))

    // Hat star
    g.fillStyle(0xffd700, 1)
    g.fillTriangle(...s(16, 1), ...s(14, 4), ...s(18, 4))
    g.fillTriangle(...s(16, 7), ...s(14, 4), ...s(18, 4))

    // Staff
    g.fillStyle(0x8b6914, 1)
    const [sfx, sfy] = s(27, 10)
    g.fillRect(sfx, sfy, 3 * scale, 36 * scale)

    // Staff orb
    g.fillStyle(0x00ccff, 0.9)
    g.fillCircle(...s(28, 9), 5 * scale)
    g.fillStyle(0xffffff, 0.5)
    g.fillCircle(...s(27, 7), 2 * scale)
  }

  private drawClassEmblem(g: Phaser.GameObjects.Graphics, cx: number, cy: number) {
    // Outer ring
    g.lineStyle(2, 0xffd700, 0.6)
    g.strokeCircle(cx, cy, 40)
    g.lineStyle(1, 0xffd700, 0.25)
    g.strokeCircle(cx, cy, 46)

    // Inner fill
    g.fillStyle(0x1e1e42, 1)
    g.fillCircle(cx, cy, 38)

    // Magic star (5-pointed)
    g.fillStyle(0x6633cc, 0.7)
    this.drawStar(g, cx, cy, 5, 28, 13)

    // Center orb
    g.fillStyle(0x00ccff, 0.9)
    g.fillCircle(cx, cy, 8)
    g.fillStyle(0xffffff, 0.5)
    g.fillCircle(cx - 2, cy - 2, 3)
  }

  private drawStar(g: Phaser.GameObjects.Graphics, cx: number, cy: number, points: number, outerR: number, innerR: number) {
    const step = Math.PI / points
    const verts: number[] = []
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? outerR : innerR
      const angle = i * step - Math.PI / 2
      verts.push(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r)
    }
    for (let i = 0; i < points * 2; i++) {
      const ni = (i + 1) % (points * 2)
      g.fillTriangle(cx, cy, verts[i * 2], verts[i * 2 + 1], verts[ni * 2], verts[ni * 2 + 1])
    }
  }

  // ─── CENTER PANEL (Stats) ──────────────────────────────────────────────────

  private buildCenterPanel() {
    const panelX = 410
    const panelY = 100
    const panelW = 500
    const panelH = GAME_HEIGHT - 130

    this.centerPanel = this.add.container(panelX, panelY)

    const panelBg = this.add.graphics()
    panelBg.fillStyle(0x12122e, 1)
    panelBg.fillRoundedRect(0, 0, panelW, panelH, 12)
    panelBg.lineStyle(1, 0xffd700, 0.35)
    panelBg.strokeRoundedRect(0, 0, panelW, panelH, 12)
    this.centerPanel.add(panelBg)

    const secHeader = this.add.text(panelW / 2, 22, 'Core Attributes', {
      fontSize: '18px',
      fontFamily: 'Georgia, serif',
      color: '#ffd700',
      fontStyle: 'bold',
    }).setOrigin(0.5, 0)
    this.centerPanel.add(secHeader)

    const headerDiv = this.add.graphics()
    headerDiv.lineStyle(1, 0xffd700, 0.3)
    headerDiv.lineBetween(20, 50, panelW - 20, 50)
    this.centerPanel.add(headerDiv)

    const statNames: (keyof typeof MOCK_STATS)[] = [
      'constitution', 'intelligence', 'dexterity', 'strength', 'spirit',
    ]

    const rowStartY = 65
    const rowHeight = 100

    statNames.forEach((stat, i) => {
      const rowY = rowStartY + i * rowHeight
      this.buildStatRow(this.centerPanel, stat, MOCK_STATS[stat], rowY, panelW)

      if (i < statNames.length - 1) {
        const sep = this.add.graphics()
        sep.lineStyle(1, 0x2a2a50, 1)
        sep.lineBetween(20, rowY + rowHeight - 6, panelW - 20, rowY + rowHeight - 6)
        this.centerPanel.add(sep)
      }
    })
  }

  private buildStatRow(
    container: Phaser.GameObjects.Container,
    stat: keyof typeof MOCK_STATS,
    value: number,
    rowY: number,
    panelW: number,
  ) {
    const color = STAT_COLORS[stat]
    const label = stat.charAt(0).toUpperCase() + stat.slice(1)
    const desc = STAT_DESCRIPTIONS[stat]

    // Row background
    const rowBg = this.add.graphics()
    rowBg.fillStyle(0x1e1e42, 0.4)
    rowBg.fillRoundedRect(10, rowY + 2, panelW - 20, 86, 8)
    container.add(rowBg)

    // Stat icon
    const iconGfx = this.add.graphics()
    this.drawStatIcon(iconGfx, stat, 34, rowY + 45, color)
    container.add(iconGfx)

    // Stat name
    const nameText = this.add.text(72, rowY + 14, label, {
      fontSize: '17px',
      fontFamily: 'Georgia, serif',
      color: '#ffd700',
      fontStyle: 'bold',
    }).setOrigin(0, 0)
    container.add(nameText)

    // Description
    const descText = this.add.text(72, rowY + 36, desc, {
      fontSize: '11px',
      fontFamily: 'Arial, sans-serif',
      color: '#888888',
    }).setOrigin(0, 0)
    container.add(descText)

    // Value (large number, right-aligned)
    const valueText = this.add.text(panelW - 20, rowY + 14, String(value), {
      fontSize: '28px',
      fontFamily: 'Georgia, serif',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(1, 0)
    container.add(valueText)

    // Stat bar background
    const barX = 72
    const barY = rowY + 56
    const barW = panelW - 90
    const barH = 14

    const barBg = this.add.graphics()
    barBg.fillStyle(0x2a2a50, 1)
    barBg.fillRoundedRect(barX, barY, barW, barH, 5)
    container.add(barBg)

    // Stat bar fill (starts empty, animated in later)
    const barFill = this.add.graphics()
    container.add(barFill)

    // Store reference + params for animation
    type BarGfx = Phaser.GameObjects.Graphics & { _barParams?: { x: number; y: number; maxW: number; h: number; color: number; value: number } }
    ;(barFill as BarGfx)._barParams = { x: barX, y: barY, maxW: barW, h: barH, color, value }
    this.statBarFills.set(stat, barFill)

    // Bar shine overlay (drawn after fill so it appears on top)
    const barShine = this.add.graphics()
    barShine.fillStyle(0xffffff, 0.12)
    barShine.fillRoundedRect(barX, barY, barW, barH / 2, { tl: 5, tr: 5, bl: 0, br: 0 })
    container.add(barShine)

    // Percentage label
    const pctText = this.add.text(barX + barW + 6, barY + 2, `${value}/100`, {
      fontSize: '10px',
      fontFamily: 'Arial, sans-serif',
      color: '#666666',
    }).setOrigin(0, 0)
    container.add(pctText)
  }

  private drawStatIcon(g: Phaser.GameObjects.Graphics, stat: keyof typeof MOCK_STATS, cx: number, cy: number, color: number) {
    // Icon background circle
    g.fillStyle(color, 0.2)
    g.fillCircle(cx, cy, 20)
    g.lineStyle(1.5, color, 0.8)
    g.strokeCircle(cx, cy, 20)

    g.fillStyle(color, 1)

    switch (stat) {
      case 'constitution': {
        // Shield
        g.fillTriangle(cx, cy - 12, cx - 10, cy - 6, cx - 10, cy + 6)
        g.fillTriangle(cx, cy - 12, cx + 10, cy - 6, cx + 10, cy + 6)
        g.fillTriangle(cx - 10, cy + 6, cx + 10, cy + 6, cx, cy + 14)
        // Cross
        g.fillStyle(0xffffff, 0.7)
        g.fillRect(cx - 1.5, cy - 6, 3, 12)
        g.fillRect(cx - 6, cy - 1.5, 12, 3)
        break
      }
      case 'intelligence': {
        // 8-pointed star
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
        g.fillStyle(0xffffff, 0.8)
        g.fillCircle(cx, cy, 3)
        break
      }
      case 'dexterity': {
        // Lightning bolt
        g.fillTriangle(cx + 3, cy - 13, cx - 5, cy + 1, cx + 3, cy + 1)
        g.fillTriangle(cx - 3, cy - 1, cx + 5, cy - 1, cx - 3, cy + 13)
        g.fillRect(cx - 5, cy - 2, 10, 4)
        break
      }
      case 'strength': {
        // Fist silhouette
        g.fillRoundedRect(cx - 9, cy - 12, 18, 8, 3)
        g.fillRoundedRect(cx - 9, cy - 5, 16, 12, 2)
        g.fillRoundedRect(cx + 6, cy - 8, 6, 8, 3)
        g.fillStyle(0xffffff, 0.4)
        g.fillRoundedRect(cx - 7, cy - 10, 10, 4, 2)
        break
      }
      case 'spirit': {
        // Flame
        g.fillTriangle(cx, cy - 14, cx - 8, cy + 4, cx + 8, cy + 4)
        g.fillStyle(0xff88ff, 0.8)
        g.fillTriangle(cx, cy - 6, cx - 5, cy + 8, cx + 5, cy + 8)
        g.fillStyle(0xffffff, 0.6)
        g.fillTriangle(cx, cy - 2, cx - 3, cy + 7, cx + 3, cy + 7)
        break
      }
    }
  }

  // ─── RIGHT PANEL (Derived Stats) ──────────────────────────────────────────

  private buildRightPanel() {
    const panelX = 920
    const panelY = 100
    const panelW = 330
    const panelH = GAME_HEIGHT - 130

    this.rightPanel = this.add.container(panelX, panelY)

    const panelBg = this.add.graphics()
    panelBg.fillStyle(0x12122e, 1)
    panelBg.fillRoundedRect(0, 0, panelW, panelH, 12)
    panelBg.lineStyle(1, 0xffd700, 0.35)
    panelBg.strokeRoundedRect(0, 0, panelW, panelH, 12)
    this.rightPanel.add(panelBg)

    const secHeader = this.add.text(panelW / 2, 22, 'Combat Stats', {
      fontSize: '18px',
      fontFamily: 'Georgia, serif',
      color: '#ffd700',
      fontStyle: 'bold',
    }).setOrigin(0.5, 0)
    this.rightPanel.add(secHeader)

    const headerDiv = this.add.graphics()
    headerDiv.lineStyle(1, 0xffd700, 0.3)
    headerDiv.lineBetween(20, 50, panelW - 20, 50)
    this.rightPanel.add(headerDiv)

    const { constitution, intelligence, dexterity, strength, spirit } = MOCK_STATS
    const derivedStats = [
      { label: 'Max HP',       value: constitution * 10,                      icon: 'hp',  color: 0xdd4444 },
      { label: 'Attack Power', value: strength + Math.floor(dexterity / 2),   icon: 'atk', color: 0xff8800 },
      { label: 'Magic Power',  value: Math.floor(intelligence * 1.5),         icon: 'mag', color: 0x4488ff },
      { label: 'Defense',      value: Math.floor(constitution / 2),           icon: 'def', color: 0x44ddaa },
      { label: 'Speed',        value: Math.floor(dexterity * 0.8),            icon: 'spd', color: 0x44ddaa },
      { label: 'Luck',         value: Math.floor(spirit * 0.6),               icon: 'lck', color: 0xcc44ff },
    ]

    const rowStart = 65
    const rowH = 78

    derivedStats.forEach((s, i) => {
      const ry = rowStart + i * rowH
      this.buildDerivedStatRow(this.rightPanel, s.label, s.value, s.icon, s.color, ry, panelW)

      if (i < derivedStats.length - 1) {
        const sep = this.add.graphics()
        sep.lineStyle(1, 0x2a2a50, 1)
        sep.lineBetween(20, ry + rowH - 6, panelW - 20, ry + rowH - 6)
        this.rightPanel.add(sep)
      }
    })

    // Equipment hint at bottom
    const eqY = rowStart + derivedStats.length * rowH + 6
    const eqDiv = this.add.graphics()
    eqDiv.lineStyle(1, 0xffd700, 0.2)
    eqDiv.lineBetween(20, eqY, panelW - 20, eqY)
    this.rightPanel.add(eqDiv)

    const eqHint = this.add.text(panelW / 2, eqY + 12, 'Equipment slots coming soon', {
      fontSize: '11px',
      fontFamily: 'Arial, sans-serif',
      color: '#555577',
      fontStyle: 'italic',
    }).setOrigin(0.5, 0)
    this.rightPanel.add(eqHint)
  }

  private buildDerivedStatRow(
    container: Phaser.GameObjects.Container,
    label: string,
    value: number,
    iconKey: string,
    color: number,
    rowY: number,
    panelW: number,
  ) {
    const rowBg = this.add.graphics()
    rowBg.fillStyle(0x1e1e42, 0.3)
    rowBg.fillRoundedRect(10, rowY + 2, panelW - 20, 64, 8)
    container.add(rowBg)

    const iconGfx = this.add.graphics()
    this.drawDerivedIcon(iconGfx, iconKey, 34, rowY + 34, color)
    container.add(iconGfx)

    const labelText = this.add.text(62, rowY + 12, label, {
      fontSize: '14px',
      fontFamily: 'Georgia, serif',
      color: '#aaaaaa',
    }).setOrigin(0, 0)
    container.add(labelText)

    const valueText = this.add.text(panelW - 18, rowY + 8, String(value), {
      fontSize: '26px',
      fontFamily: 'Georgia, serif',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(1, 0)
    container.add(valueText)

    // Color underline beneath the value
    const underlineW = String(value).length * 14 + 8
    const underline = this.add.graphics()
    underline.fillStyle(color, 0.7)
    underline.fillRect(panelW - 18 - underlineW, rowY + 42, underlineW, 3)
    container.add(underline)
  }

  private drawDerivedIcon(g: Phaser.GameObjects.Graphics, iconKey: string, cx: number, cy: number, color: number) {
    g.fillStyle(color, 0.15)
    g.fillCircle(cx, cy, 14)
    g.lineStyle(1, color, 0.6)
    g.strokeCircle(cx, cy, 14)
    g.fillStyle(color, 1)

    switch (iconKey) {
      case 'hp': {
        // Heart
        g.fillTriangle(cx, cy + 8, cx - 8, cy - 2, cx + 8, cy - 2)
        g.fillCircle(cx - 4, cy - 3, 5)
        g.fillCircle(cx + 4, cy - 3, 5)
        break
      }
      case 'atk': {
        // Sword silhouette
        g.fillRect(cx - 1.5, cy - 9, 3, 18)
        g.fillRect(cx - 7, cy - 2, 14, 4)
        break
      }
      case 'mag': {
        // Wand with glowing tip
        g.fillRect(cx + 2, cy - 8, 2.5, 16)
        g.fillStyle(0xffffff, 0.9)
        g.fillCircle(cx + 3, cy - 9, 4)
        break
      }
      case 'def': {
        // Small shield
        g.fillTriangle(cx, cy - 9, cx - 7, cy - 3, cx - 7, cy + 4)
        g.fillTriangle(cx, cy - 9, cx + 7, cy - 3, cx + 7, cy + 4)
        g.fillTriangle(cx - 7, cy + 4, cx + 7, cy + 4, cx, cy + 10)
        break
      }
      case 'spd': {
        // Arrow right
        g.fillTriangle(cx + 8, cy, cx, cy - 7, cx, cy + 7)
        g.fillRect(cx - 8, cy - 2.5, 10, 5)
        break
      }
      case 'lck': {
        // Four-leaf clover
        g.fillCircle(cx, cy - 5, 5)
        g.fillCircle(cx, cy + 5, 5)
        g.fillCircle(cx - 5, cy, 5)
        g.fillCircle(cx + 5, cy, 5)
        g.fillCircle(cx, cy, 4)
        break
      }
    }
  }

  // ─── FOOTER ────────────────────────────────────────────────────────────────

  private buildFooter() {
    this.footerText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 24, 'Press  C  or  Escape  to close', {
      fontSize: '14px',
      fontFamily: 'Arial, sans-serif',
      color: '#666688',
      backgroundColor: '#00000066',
      padding: { x: 14, y: 5 },
    }).setOrigin(0.5, 1)
  }

  // ─── ANIMATIONS ────────────────────────────────────────────────────────────

  private animatePanelsIn() {
    // Header fades in
    this.headerContainer.setAlpha(0)
    this.tweens.add({
      targets: this.headerContainer,
      alpha: 1,
      duration: 400,
      ease: 'Power2',
    })

    // Footer fades in
    this.footerText.setAlpha(0)
    this.tweens.add({
      targets: this.footerText,
      alpha: 1,
      duration: 400,
      delay: 200,
      ease: 'Power2',
    })

    // Left panel slides in from left
    const leftTargetX = this.leftPanel.x
    this.leftPanel.setX(leftTargetX - 80)
    this.leftPanel.setAlpha(0)
    this.tweens.add({
      targets: this.leftPanel,
      x: leftTargetX,
      alpha: 1,
      duration: 450,
      delay: 80,
      ease: 'Power3',
    })

    // Center panel slides up from below
    const centerTargetY = this.centerPanel.y
    this.centerPanel.setY(centerTargetY + 60)
    this.centerPanel.setAlpha(0)
    this.tweens.add({
      targets: this.centerPanel,
      y: centerTargetY,
      alpha: 1,
      duration: 450,
      delay: 140,
      ease: 'Power3',
    })

    // Right panel slides in from right
    const rightTargetX = this.rightPanel.x
    this.rightPanel.setX(rightTargetX + 80)
    this.rightPanel.setAlpha(0)
    this.tweens.add({
      targets: this.rightPanel,
      x: rightTargetX,
      alpha: 1,
      duration: 450,
      delay: 200,
      ease: 'Power3',
      onComplete: () => {
        this.animateStatBars()
        this.startPortraitGlow()
      },
    })
  }

  private animateStatBars() {
    const statNames: (keyof typeof MOCK_STATS)[] = [
      'constitution', 'intelligence', 'dexterity', 'strength', 'spirit',
    ]

    type BarGfx = Phaser.GameObjects.Graphics & { _barParams?: { x: number; y: number; maxW: number; h: number; color: number; value: number } }

    statNames.forEach((stat, i) => {
      const fillGfx = this.statBarFills.get(stat)
      if (!fillGfx) return
      const params = (fillGfx as BarGfx)._barParams
      if (!params) return

      const targetWidth = (params.value / 100) * params.maxW
      const proxy = { width: 0 }
      this.tweens.add({
        targets: proxy,
        width: targetWidth,
        duration: 600,
        delay: 100 + i * 80,
        ease: 'Power2',
        onUpdate: () => {
          fillGfx.clear()
          fillGfx.fillStyle(params.color, 1)
          fillGfx.fillRoundedRect(params.x, params.y, Math.max(0, proxy.width), params.h, 5)
        },
      })
    })
  }

  private startPortraitGlow() {
    this.tweens.add({
      targets: this.portraitGlow,
      alpha: { from: 0.4, to: 1 },
      duration: 1800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })
  }

  // ─── UPDATE / CLOSE ────────────────────────────────────────────────────────

  update() {
    if (Phaser.Input.Keyboard.JustDown(this.cKey) || Phaser.Input.Keyboard.JustDown(this.escKey)) {
      this.closeScene()
    }
  }

  private closeScene() {
    // Prevent double-close
    this.cKey.enabled = false
    this.escKey.enabled = false

    this.tweens.add({
      targets: [this.leftPanel, this.centerPanel, this.rightPanel, this.headerContainer, this.footerText],
      alpha: 0,
      duration: 250,
      ease: 'Power2',
      onComplete: () => {
        this.scene.stop('CharacterScene')
        this.scene.resume('WorldScene')
      },
    })
  }
}
