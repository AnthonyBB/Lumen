import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT } from '../constants'
import { STRATEGIES, STRATEGY_PRESETS, CombatStrategy, StrategyPreset } from '../data/combatStrategies'

const COLOR_BG        = 0x0d0d1a
const COLOR_PANEL     = 0x12122a
const COLOR_PANEL_ALT = 0x1a1a3a
const COLOR_BORDER    = 0xffd700
const COLOR_BORDER_DIM = 0x554400
const COLOR_SELECTED  = 0x2a2a5a
const COLOR_HOVER     = 0x1e1e44
const COLOR_TEXT_GOLD = '#ffd700'
const COLOR_TEXT_WHITE = '#ffffff'
const COLOR_TEXT_GRAY = '#aaaacc'
const COLOR_TEXT_DIM  = '#666688'

const LEFT_PANEL_W  = 340
const LEFT_PANEL_X  = 20
const RIGHT_PANEL_X = LEFT_PANEL_X + LEFT_PANEL_W + 16
const RIGHT_PANEL_W = GAME_WIDTH - RIGHT_PANEL_X - 20
const PANEL_TOP     = 70
const PANEL_H       = GAME_HEIGHT - PANEL_TOP - 20

export class StrategyScene extends Phaser.Scene {
  private selectedPreset: StrategyPreset | null = null
  private selectedStrategy: CombatStrategy | null = null
  private activePresetId: string | null = null

  // Left panel
  private leftContainer!: Phaser.GameObjects.Container
  private presetButtons: Phaser.GameObjects.Container[] = []

  // Right panel — top half: preset info
  private rightInfoContainer!: Phaser.GameObjects.Container

  // Right panel — bottom half: strategy list
  private rightListContainer!: Phaser.GameObjects.Container
  private strategyItems: Phaser.GameObjects.Container[] = []

  // Tooltip overlay
  private tooltipContainer!: Phaser.GameObjects.Container

  constructor() {
    super({ key: 'StrategyScene' })
  }

  create() {
    // ── Load active preset from registry ──────────────────────────────────────
    this.activePresetId = this.registry.get('activeStrategyPreset') ?? null

    // ── Background ────────────────────────────────────────────────────────────
    const bg = this.add.graphics()
    bg.fillStyle(COLOR_BG, 0.97)
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)
    bg.setDepth(0)

    // Subtle stone texture pattern
    for (let row = 0; row < GAME_HEIGHT; row += 64) {
      for (let col = 0; col < GAME_WIDTH; col += 128) {
        const shade = (row + col) % 256 === 0 ? 0x111128 : 0x0e0e20
        bg.fillStyle(shade, 0.4)
        bg.fillRect(col, row, 128, 64)
      }
    }

    // ── Header ────────────────────────────────────────────────────────────────
    this.drawHeader()

    // ── Left panel ────────────────────────────────────────────────────────────
    this.leftContainer = this.add.container(0, 0).setDepth(10)
    this.drawLeftPanel()

    // ── Right panel top ───────────────────────────────────────────────────────
    this.rightInfoContainer = this.add.container(0, 0).setDepth(10)

    // ── Right panel bottom ────────────────────────────────────────────────────
    this.rightListContainer = this.add.container(0, 0).setDepth(10)

    // ── Tooltip (hidden by default) ───────────────────────────────────────────
    this.tooltipContainer = this.add.container(0, 0).setDepth(200)
    this.tooltipContainer.setVisible(false)

    // ── Keyboard ESC ─────────────────────────────────────────────────────────
    this.input.keyboard!.once('keydown-ESC', () => this.closeScene())

    // Select the first preset by default
    if (STRATEGY_PRESETS.length > 0) {
      this.selectPreset(STRATEGY_PRESETS[0])
    }

    // Show right panel initial state
    this.drawRightPanel()
  }

  // ── Header ─────────────────────────────────────────────────────────────────
  private drawHeader() {
    const g = this.add.graphics().setDepth(5)
    g.fillStyle(COLOR_PANEL, 1)
    g.fillRect(0, 0, GAME_WIDTH, PANEL_TOP - 4)
    g.lineStyle(2, COLOR_BORDER, 1)
    g.lineBetween(0, PANEL_TOP - 4, GAME_WIDTH, PANEL_TOP - 4)

    this.add.text(24, PANEL_TOP / 2, '⚔  COMBAT STRATEGY HALL', {
      fontSize: '22px',
      fontFamily: 'Georgia, serif',
      color: COLOR_TEXT_GOLD,
      fontStyle: 'bold',
    }).setOrigin(0, 0.5).setDepth(6)

    // ESC close button
    const closeBtnX = GAME_WIDTH - 100
    const closeBtnY = PANEL_TOP / 2
    const closeBg = this.add.graphics().setDepth(6)
    closeBg.fillStyle(0x2a0a0a, 1)
    closeBg.fillRoundedRect(closeBtnX - 50, closeBtnY - 14, 100, 28, 6)
    closeBg.lineStyle(1, 0xaa3333, 1)
    closeBg.strokeRoundedRect(closeBtnX - 50, closeBtnY - 14, 100, 28, 6)

    const closeText = this.add.text(closeBtnX, closeBtnY, 'ESC  Close', {
      fontSize: '13px',
      fontFamily: 'Arial, sans-serif',
      color: '#cc6666',
    }).setOrigin(0.5, 0.5).setDepth(7).setInteractive({ useHandCursor: true })
    closeText.on('pointerover', () => closeText.setColor('#ff9999'))
    closeText.on('pointerout',  () => closeText.setColor('#cc6666'))
    closeText.on('pointerdown', () => this.closeScene())
  }

  // ── Left panel ─────────────────────────────────────────────────────────────
  private drawLeftPanel() {
    this.leftContainer.removeAll(true)
    this.presetButtons = []

    const g = this.add.graphics().setDepth(5)
    // Panel background
    g.fillStyle(COLOR_PANEL, 1)
    g.fillRoundedRect(LEFT_PANEL_X, PANEL_TOP, LEFT_PANEL_W, PANEL_H, 8)
    g.lineStyle(1, COLOR_BORDER_DIM, 1)
    g.strokeRoundedRect(LEFT_PANEL_X, PANEL_TOP, LEFT_PANEL_W, PANEL_H, 8)
    this.leftContainer.add(g)

    // Section header
    const hdrG = this.add.graphics()
    hdrG.fillStyle(0x1a1a35, 1)
    hdrG.fillRoundedRect(LEFT_PANEL_X, PANEL_TOP, LEFT_PANEL_W, 38, { tl: 8, tr: 8, bl: 0, br: 0 })
    this.leftContainer.add(hdrG)

    this.leftContainer.add(
      this.add.text(LEFT_PANEL_X + LEFT_PANEL_W / 2, PANEL_TOP + 19, 'STRATEGY PRESETS', {
        fontSize: '13px',
        fontFamily: 'Arial, sans-serif',
        color: COLOR_TEXT_GOLD,
        fontStyle: 'bold',
        letterSpacing: 2,
      }).setOrigin(0.5, 0.5)
    )

    // Divider
    const div = this.add.graphics()
    div.lineStyle(1, COLOR_BORDER_DIM, 0.8)
    div.lineBetween(LEFT_PANEL_X + 10, PANEL_TOP + 38, LEFT_PANEL_X + LEFT_PANEL_W - 10, PANEL_TOP + 38)
    this.leftContainer.add(div)

    // Preset list
    const listStartY = PANEL_TOP + 54
    const itemH = 68

    STRATEGY_PRESETS.forEach((preset, index) => {
      const itemY = listStartY + index * (itemH + 8)
      const btn = this.createPresetButton(preset, LEFT_PANEL_X + 12, itemY, LEFT_PANEL_W - 24, itemH)
      this.leftContainer.add(btn)
      this.presetButtons.push(btn)
    })

    // ── MY STRATEGY section ───────────────────────────────────────────────────
    const mySectionY = listStartY + STRATEGY_PRESETS.length * (itemH + 8) + 20
    const divLine = this.add.graphics()
    divLine.lineStyle(1, COLOR_BORDER_DIM, 0.6)
    divLine.lineBetween(LEFT_PANEL_X + 10, mySectionY, LEFT_PANEL_X + LEFT_PANEL_W - 10, mySectionY)
    this.leftContainer.add(divLine)

    this.leftContainer.add(
      this.add.text(LEFT_PANEL_X + 14, mySectionY + 14, 'MY STRATEGY', {
        fontSize: '11px',
        fontFamily: 'Arial, sans-serif',
        color: COLOR_TEXT_GOLD,
        fontStyle: 'bold',
        letterSpacing: 2,
      })
    )

    const activePreset = this.activePresetId
      ? STRATEGY_PRESETS.find(p => p.id === this.activePresetId)
      : null

    this.leftContainer.add(
      this.add.text(LEFT_PANEL_X + 14, mySectionY + 34, activePreset
        ? `${activePreset.icon} ${activePreset.name}`
        : 'None equipped', {
        fontSize: '13px',
        fontFamily: 'Arial, sans-serif',
        color: activePreset ? '#88ffaa' : COLOR_TEXT_DIM,
      })
    )
  }

  private createPresetButton(
    preset: StrategyPreset,
    x: number,
    y: number,
    w: number,
    h: number
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x, y)

    const isSelected = this.selectedPreset?.id === preset.id
    const isActive   = this.activePresetId === preset.id

    const bg = this.add.graphics()
    this.drawPresetButtonBg(bg, 0, 0, w, h, isSelected, isActive)

    const iconText = this.add.text(12, h / 2, preset.icon, {
      fontSize: '22px',
    }).setOrigin(0, 0.5)

    const nameText = this.add.text(48, h / 2 - 9, preset.name, {
      fontSize: '15px',
      fontFamily: 'Georgia, serif',
      color: isSelected ? COLOR_TEXT_GOLD : COLOR_TEXT_WHITE,
      fontStyle: isSelected ? 'bold' : 'normal',
    }).setOrigin(0, 0.5)

    const countText = this.add.text(48, h / 2 + 9, `${preset.strategies.length} rules`, {
      fontSize: '11px',
      fontFamily: 'Arial, sans-serif',
      color: COLOR_TEXT_DIM,
    }).setOrigin(0, 0.5)

    container.add([bg, iconText, nameText, countText])

    if (isActive) {
      const activeBadge = this.add.text(w - 8, h / 2, 'EQUIPPED', {
        fontSize: '9px',
        fontFamily: 'Arial, sans-serif',
        color: '#88ffaa',
        backgroundColor: '#0a2a1a',
        padding: { x: 4, y: 2 },
      }).setOrigin(1, 0.5)
      container.add(activeBadge)
    }

    // Hit zone
    const hit = this.add.zone(0, 0, w, h).setOrigin(0, 0)
    hit.setInteractive({ useHandCursor: true })
    hit.on('pointerover', () => {
      if (this.selectedPreset?.id !== preset.id) {
        bg.clear()
        this.drawPresetButtonBg(bg, 0, 0, w, h, false, isActive, true)
        nameText.setColor(COLOR_TEXT_GOLD)
      }
    })
    hit.on('pointerout', () => {
      if (this.selectedPreset?.id !== preset.id) {
        bg.clear()
        this.drawPresetButtonBg(bg, 0, 0, w, h, false, isActive)
        nameText.setColor(COLOR_TEXT_WHITE)
      }
    })
    hit.on('pointerdown', () => {
      this.selectPreset(preset)
    })
    container.add(hit)

    return container
  }

  private drawPresetButtonBg(
    g: Phaser.GameObjects.Graphics,
    x: number, y: number, w: number, h: number,
    selected: boolean, active: boolean, hover = false
  ) {
    g.clear()
    const fillColor = selected ? COLOR_SELECTED : hover ? COLOR_HOVER : COLOR_PANEL_ALT
    g.fillStyle(fillColor, 1)
    g.fillRoundedRect(x, y, w, h, 6)
    const borderColor = selected ? COLOR_BORDER : active ? 0x44aa66 : 0x333366
    const borderAlpha = selected ? 1 : 0.7
    g.lineStyle(selected ? 2 : 1, borderColor, borderAlpha)
    g.strokeRoundedRect(x, y, w, h, 6)
  }

  // ── Right panel ────────────────────────────────────────────────────────────
  private drawRightPanel() {
    this.rightInfoContainer.removeAll(true)
    this.rightListContainer.removeAll(true)
    this.strategyItems = []

    if (!this.selectedPreset) return

    const preset = this.selectedPreset

    // ── Top area: preset info + equip button ──────────────────────────────────
    const infoH = 160
    const infoG = this.add.graphics()
    infoG.fillStyle(COLOR_PANEL, 1)
    infoG.fillRoundedRect(RIGHT_PANEL_X, PANEL_TOP, RIGHT_PANEL_W, infoH, 8)
    infoG.lineStyle(1, COLOR_BORDER_DIM, 1)
    infoG.strokeRoundedRect(RIGHT_PANEL_X, PANEL_TOP, RIGHT_PANEL_W, infoH, 8)
    this.rightInfoContainer.add(infoG)

    // Preset name + icon
    this.rightInfoContainer.add(
      this.add.text(RIGHT_PANEL_X + 20, PANEL_TOP + 28, `${preset.icon}  ${preset.name}`, {
        fontSize: '22px',
        fontFamily: 'Georgia, serif',
        color: COLOR_TEXT_GOLD,
        fontStyle: 'bold',
      }).setOrigin(0, 0.5)
    )

    // Description
    this.rightInfoContainer.add(
      this.add.text(RIGHT_PANEL_X + 20, PANEL_TOP + 60, preset.description, {
        fontSize: '13px',
        fontFamily: 'Arial, sans-serif',
        color: COLOR_TEXT_GRAY,
        wordWrap: { width: RIGHT_PANEL_W - 180 },
        lineSpacing: 4,
      }).setOrigin(0, 0)
    )

    // Strategy count
    this.rightInfoContainer.add(
      this.add.text(RIGHT_PANEL_X + 20, PANEL_TOP + 118, `Contains ${preset.strategies.length} rules  ·  Click a rule for details`, {
        fontSize: '11px',
        fontFamily: 'Arial, sans-serif',
        color: COLOR_TEXT_DIM,
      }).setOrigin(0, 0)
    )

    // ── Equip button ──────────────────────────────────────────────────────────
    const equipX = RIGHT_PANEL_X + RIGHT_PANEL_W - 140
    const equipY = PANEL_TOP + infoH / 2
    const isEquipped = this.activePresetId === preset.id
    const equipBg = this.add.graphics()
    this.rightInfoContainer.add(equipBg)

    const drawEquipBtn = (hover = false) => {
      equipBg.clear()
      const fillC = isEquipped ? 0x0a3a1a : (hover ? 0x2a3a1a : 0x1a2a1a)
      const borderC = isEquipped ? 0x44ff88 : (hover ? 0x88dd44 : 0x44aa44)
      equipBg.fillStyle(fillC, 1)
      equipBg.fillRoundedRect(equipX - 60, equipY - 18, 120, 36, 8)
      equipBg.lineStyle(2, borderC, 1)
      equipBg.strokeRoundedRect(equipX - 60, equipY - 18, 120, 36, 8)
    }
    drawEquipBtn()

    const equipLabel = isEquipped ? '✓ Equipped' : 'Equip Preset'
    const equipText = this.add.text(equipX, equipY, equipLabel, {
      fontSize: '14px',
      fontFamily: 'Arial, sans-serif',
      color: isEquipped ? '#88ffaa' : '#aaffaa',
      fontStyle: 'bold',
    }).setOrigin(0.5, 0.5).setInteractive({ useHandCursor: true })
    this.rightInfoContainer.add(equipText)

    equipText.on('pointerover', () => drawEquipBtn(true))
    equipText.on('pointerout',  () => drawEquipBtn(false))
    equipText.on('pointerdown', () => {
      if (!isEquipped) {
        this.registry.set('activeStrategyPreset', preset.id)
        this.activePresetId = preset.id
        this.drawLeftPanel()
        this.drawRightPanel()
      }
    })

    // ── Bottom area: strategy list ─────────────────────────────────────────────
    const listY = PANEL_TOP + infoH + 12
    const listH = PANEL_H - infoH - 12
    const listG = this.add.graphics()
    listG.fillStyle(COLOR_PANEL, 1)
    listG.fillRoundedRect(RIGHT_PANEL_X, listY, RIGHT_PANEL_W, listH, 8)
    listG.lineStyle(1, COLOR_BORDER_DIM, 1)
    listG.strokeRoundedRect(RIGHT_PANEL_X, listY, RIGHT_PANEL_W, listH, 8)
    this.rightListContainer.add(listG)

    // Section header
    const listHdrG = this.add.graphics()
    listHdrG.fillStyle(0x1a1a35, 1)
    listHdrG.fillRoundedRect(RIGHT_PANEL_X, listY, RIGHT_PANEL_W, 36, { tl: 8, tr: 8, bl: 0, br: 0 })
    this.rightListContainer.add(listHdrG)

    this.rightListContainer.add(
      this.add.text(RIGHT_PANEL_X + 20, listY + 18, 'ACTIVE RULES  (priority order — lowest number = checked first)', {
        fontSize: '11px',
        fontFamily: 'Arial, sans-serif',
        color: COLOR_TEXT_GOLD,
        letterSpacing: 1,
      }).setOrigin(0, 0.5)
    )

    const divLine = this.add.graphics()
    divLine.lineStyle(1, COLOR_BORDER_DIM, 0.6)
    divLine.lineBetween(RIGHT_PANEL_X + 10, listY + 36, RIGHT_PANEL_X + RIGHT_PANEL_W - 10, listY + 36)
    this.rightListContainer.add(divLine)

    // Sort strategies by priority
    const presetStrategies = preset.strategies
      .map(id => STRATEGIES.find(s => s.id === id))
      .filter((s): s is NonNullable<typeof s> => s !== undefined)
      .sort((a, b) => a.priority - b.priority)

    const itemH  = 44
    const startY = listY + 46

    presetStrategies.forEach((strategy, index) => {
      const iy = startY + index * (itemH + 4)
      if (iy + itemH > listY + listH - 10) return // clamp to panel

      const item = this.createStrategyItem(strategy, index + 1, RIGHT_PANEL_X + 10, iy, RIGHT_PANEL_W - 20, itemH)
      this.rightListContainer.add(item)
      this.strategyItems.push(item)
    })
  }

  private createStrategyItem(
    strategy: CombatStrategy,
    rank: number,
    x: number,
    y: number,
    w: number,
    h: number
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x, y)

    const isSelected = this.selectedStrategy?.id === strategy.id

    const bg = this.add.graphics()
    this.drawItemBg(bg, 0, 0, w, h, isSelected)

    // Rank badge
    const rankBadge = this.add.graphics()
    rankBadge.fillStyle(0x1a1a40, 1)
    rankBadge.fillCircle(18, h / 2, 14)
    rankBadge.lineStyle(1, isSelected ? COLOR_BORDER : 0x444466, 1)
    rankBadge.strokeCircle(18, h / 2, 14)

    const rankText = this.add.text(18, h / 2, String(rank), {
      fontSize: '13px',
      fontFamily: 'Arial, sans-serif',
      color: isSelected ? COLOR_TEXT_GOLD : COLOR_TEXT_GRAY,
      fontStyle: 'bold',
    }).setOrigin(0.5, 0.5)

    // Strategy name
    const nameText = this.add.text(42, h / 2 - 8, strategy.name, {
      fontSize: '14px',
      fontFamily: 'Georgia, serif',
      color: isSelected ? COLOR_TEXT_GOLD : COLOR_TEXT_WHITE,
    }).setOrigin(0, 0.5)

    // Condition summary
    const condSummary = this.formatCondition(strategy)
    const condText = this.add.text(42, h / 2 + 9, condSummary, {
      fontSize: '11px',
      fontFamily: 'Arial, sans-serif',
      color: COLOR_TEXT_DIM,
    }).setOrigin(0, 0.5)

    // Action badge
    const actionLabel = this.formatAction(strategy)
    const actionText = this.add.text(w - 12, h / 2, actionLabel, {
      fontSize: '11px',
      fontFamily: 'Arial, sans-serif',
      color: this.actionColor(strategy.action),
      backgroundColor: '#0a0a22',
      padding: { x: 5, y: 3 },
    }).setOrigin(1, 0.5)

    container.add([bg, rankBadge, rankText, nameText, condText, actionText])

    // Hit zone
    const hit = this.add.zone(0, 0, w, h).setOrigin(0, 0)
    hit.setInteractive({ useHandCursor: true })
    hit.on('pointerover', () => {
      if (this.selectedStrategy?.id !== strategy.id) {
        bg.clear()
        this.drawItemBg(bg, 0, 0, w, h, false, true)
        nameText.setColor(COLOR_TEXT_GOLD)
      }
    })
    hit.on('pointerout', () => {
      if (this.selectedStrategy?.id !== strategy.id) {
        bg.clear()
        this.drawItemBg(bg, 0, 0, w, h, false, false)
        nameText.setColor(COLOR_TEXT_WHITE)
      }
    })
    hit.on('pointerdown', () => {
      this.selectedStrategy = strategy
      this.showTooltip(strategy)
      this.drawRightPanel()
    })
    container.add(hit)

    return container
  }

  private drawItemBg(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, selected: boolean, hover = false) {
    g.clear()
    const fill = selected ? COLOR_SELECTED : hover ? COLOR_HOVER : COLOR_PANEL_ALT
    g.fillStyle(fill, 1)
    g.fillRoundedRect(x, y, w, h, 5)
    g.lineStyle(1, selected ? COLOR_BORDER : 0x333366, selected ? 1 : 0.5)
    g.strokeRoundedRect(x, y, w, h, 5)
  }

  // ── Tooltip ────────────────────────────────────────────────────────────────
  private showTooltip(strategy: CombatStrategy) {
    this.tooltipContainer.removeAll(true)
    this.tooltipContainer.setVisible(true)

    const TW = 420
    const TH = 210
    const TX = GAME_WIDTH / 2 - TW / 2
    const TY = GAME_HEIGHT / 2 - TH / 2

    const g = this.add.graphics()
    g.fillStyle(0x080814, 0.98)
    g.fillRoundedRect(TX, TY, TW, TH, 12)
    g.lineStyle(2, COLOR_BORDER, 1)
    g.strokeRoundedRect(TX, TY, TW, TH, 12)
    this.tooltipContainer.add(g)

    const cx = TX + TW / 2

    // Title
    this.tooltipContainer.add(
      this.add.text(cx, TY + 28, strategy.name, {
        fontSize: '20px',
        fontFamily: 'Georgia, serif',
        color: COLOR_TEXT_GOLD,
        fontStyle: 'bold',
      }).setOrigin(0.5, 0.5)
    )

    // Divider
    const div = this.add.graphics()
    div.lineStyle(1, COLOR_BORDER_DIM, 1)
    div.lineBetween(TX + 20, TY + 46, TX + TW - 20, TY + 46)
    this.tooltipContainer.add(div)

    // Details
    const rows = [
      ['Condition', this.formatCondition(strategy)],
      ['Action',    this.formatAction(strategy)],
      ['Priority',  String(strategy.priority)],
      ['Target',    strategy.targetMode.replace('_', ' ')],
    ]
    if (strategy.skillId) {
      rows.push(['Skill ID', strategy.skillId])
    }

    rows.forEach(([label, value], i) => {
      const ry = TY + 62 + i * 24
      this.tooltipContainer.add(
        this.add.text(TX + 24, ry, label + ':', {
          fontSize: '13px',
          fontFamily: 'Arial, sans-serif',
          color: COLOR_TEXT_DIM,
        }).setOrigin(0, 0)
      )
      this.tooltipContainer.add(
        this.add.text(TX + 130, ry, value, {
          fontSize: '13px',
          fontFamily: 'Arial, sans-serif',
          color: COLOR_TEXT_WHITE,
        }).setOrigin(0, 0)
      )
    })

    // Description
    this.tooltipContainer.add(
      this.add.text(cx, TY + TH - 38, strategy.description, {
        fontSize: '11px',
        fontFamily: 'Arial, sans-serif',
        color: COLOR_TEXT_GRAY,
        wordWrap: { width: TW - 40 },
        align: 'center',
        lineSpacing: 3,
      }).setOrigin(0.5, 0)
    )

    // Close hint
    this.tooltipContainer.add(
      this.add.text(cx, TY + TH - 10, 'Click anywhere to dismiss', {
        fontSize: '10px',
        fontFamily: 'Arial, sans-serif',
        color: COLOR_TEXT_DIM,
      }).setOrigin(0.5, 1)
    )

    // Click anywhere to close
    this.input.once('pointerdown', () => {
      this.tooltipContainer.setVisible(false)
      this.selectedStrategy = null
      this.drawRightPanel()
    })
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  private selectPreset(preset: StrategyPreset) {
    this.selectedPreset = preset
    this.selectedStrategy = null
    this.tooltipContainer.setVisible(false)
    this.drawLeftPanel()
    this.drawRightPanel()
  }

  private formatCondition(strategy: CombatStrategy): string {
    const v = strategy.condition.value
    switch (strategy.condition.type) {
      case 'self_hp_below':       return `Self HP < ${v}%`
      case 'self_hp_above':       return `Self HP > ${v}%`
      case 'self_mp_below':       return `Self MP < ${v}%`
      case 'enemy_hp_below':      return `Enemy HP < ${v}%`
      case 'enemy_hp_above':      return `Enemy HP > ${v}%`
      case 'enemy_count_above':   return `Enemy count > ${v}`
      case 'turn_number_lte':     return `Turn ≤ ${v}`
      case 'turn_number_gte':     return `Turn ≥ ${v}`
      case 'ally_hp_below':       return `Any ally HP < ${v}%`
      case 'enemy_has_buff':      return 'Enemy has an active buff'
      case 'self_has_debuff':     return 'Self has a debuff'
      case 'random_chance':       return `${v}% random chance`
      default:                    return 'Unknown condition'
    }
  }

  private formatAction(strategy: CombatStrategy): string {
    switch (strategy.action) {
      case 'use_skill':           return strategy.skillId ? `Skill: ${strategy.skillId}` : 'Use skill'
      case 'use_best_heal':       return 'Best heal'
      case 'use_strongest_attack':return 'Strongest attack'
      case 'use_aoe':             return 'AoE attack'
      case 'defend':              return 'Defend'
      default:                    return strategy.action
    }
  }

  private actionColor(action: string): string {
    switch (action) {
      case 'use_skill':           return '#bb88ff'
      case 'use_best_heal':       return '#88ffaa'
      case 'use_strongest_attack':return '#ff8844'
      case 'use_aoe':             return '#ffaa44'
      case 'defend':              return '#88ccff'
      default:                    return COLOR_TEXT_GRAY
    }
  }

  private closeScene() {
    this.scene.stop('StrategyScene')
    this.scene.resume('WorldScene')
  }
}
