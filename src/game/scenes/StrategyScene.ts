import Phaser from 'phaser'
import type { Socket } from 'socket.io-client'
import { GAME_WIDTH, GAME_HEIGHT } from '../constants'
import { STRATEGIES, CombatStrategy } from '../data/combatStrategies'

// Display copy of the server's Combat Shard pricing (server enforces the real price)
const STRATEGY_PRICE = 2
// Display copy of the server's loadout cap (server enforces the real cap)
const MAX_LOADOUT_SIZE = 10

interface ShopUnlocks {
  unlockedSkills: string[]
  unlockedStrategies: string[]
  skillShards: number
  combatShards: number
  /** Ordered strategy loadout saved at the Teacher (top = checked first). */
  strategyLoadout?: string[]
}

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

// ── Tiny Dungeon frames (12 cols × 11 rows of 16×16; frame = row*12+col) ────
// See src/game/data/tileFrames.ts for the verified character block layout.
const td = (col: number, row: number) => row * 12 + col
/** (0,7) purple wizard — pixel-verified (used elsewhere in the project). */
const TD_TEACHER_NPC  = td(0, 7)
/** (1,7) villager-like human — pixel-verified character row. */
const TD_MERCHANT_NPC = td(1, 7)
// Station tables are drawn with Graphics (drawCounter) — the tile pack's
// furniture frames turned out to be fence/cart pieces, not tables.

// ── Strategy categories ─────────────────────────────────────────────────────
// The merchant groups strategies by purpose rather than by preset bundle.
// Derived client-side (display only) so the data files / server stay untouched.
type StrategyCategory = 'attack' | 'defense' | 'support' | 'utility'

const STRATEGY_CATEGORY: Record<string, StrategyCategory> = {
  // Attack — offence: finishers, focus fire, bursts, AoE
  finish_them: 'attack', group_threat: 'attack', overwhelming_numbers: 'attack',
  opener_fireball: 'attack', early_poison: 'attack', late_game_burst: 'attack',
  high_hp_pressure: 'attack', focus_wounded: 'attack', high_threat_focus: 'attack',
  lightning_strike: 'attack', lucky_strike: 'attack', opportunist: 'attack',
  berserker_rage: 'attack', relentless_assault: 'attack', sustained_pressure: 'attack',
  // Defense — survival stances
  mp_conservation: 'defense', mp_critical_defend: 'defense',
  defensive_posture: 'defense', iron_will: 'defense',
  // Support — heals, rescues, cleanses, buffs
  emergency_heal: 'support', critical_heal: 'support', debuff_counter: 'support',
  support_heal: 'support', ally_critical_rescue: 'support', opening_buff: 'support',
  comfortable_heal: 'support', endurance_heal: 'support',
  // Utility — control, dispels, wildcards
  crowd_control: 'utility', debuff_strip: 'utility', wild_card: 'utility',
}

const categoryOf = (id: string): StrategyCategory => STRATEGY_CATEGORY[id] ?? 'utility'

const CATEGORY_META: { key: StrategyCategory; label: string; icon: string; desc: string }[] = [
  { key: 'attack',  label: 'Attack',  icon: '⚔️', desc: 'Offence — finishers, focus fire, bursts and AoE.' },
  { key: 'defense', label: 'Defense', icon: '🛡️', desc: 'Defensive stances and survival under pressure.' },
  { key: 'support', label: 'Support', icon: '💚', desc: 'Heals, rescues, cleanses and buffs.' },
  { key: 'utility', label: 'Utility', icon: '✨', desc: 'Crowd control, dispels and wildcards.' },
]

type HallView = 'room' | 'merchant' | 'teacher'

export class StrategyScene extends Phaser.Scene {
  private view: HallView = 'room'

  private selectedCategory: StrategyCategory = 'attack'
  private selectedStrategy: CombatStrategy | null = null

  // Server-reported shop state — only ever updated from 'shop:unlocks' /
  // 'shop:strategy_purchased' / 'strategy:loadout_saved' pushes. Purchases go
  // through shop:buy_strategy; the loadout through strategy:set_loadout.
  private socket: Socket | null = null
  private unlockedStrategies: Set<string> = new Set()
  private combatShards = 0
  /** Last loadout the SERVER confirmed (snapshot). */
  private savedLoadout: string[] = []
  /** Local editing copy shown in the teacher panel (sent on Save Order). */
  private loadout: string[] = []

  private balanceText!: Phaser.GameObjects.Text
  private feedbackText!: Phaser.GameObjects.Text
  private escLabel!: Phaser.GameObjects.Text

  // Room hub
  private roomContainer!: Phaser.GameObjects.Container

  // Merchant panels
  private leftContainer!: Phaser.GameObjects.Container
  private rightInfoContainer!: Phaser.GameObjects.Container
  private rightListContainer!: Phaser.GameObjects.Container

  // Teacher panel
  private teacherContainer!: Phaser.GameObjects.Container
  private ownedPage = 0

  // Tooltip overlay
  private tooltipContainer!: Phaser.GameObjects.Container

  /** Scene to resume when this overlay closes (the strategy-hall interior, or
   *  WorldScene when opened directly). */
  private parentScene = 'WorldScene'

  constructor() {
    super({ key: 'StrategyScene' })
  }

  init(data: { parentScene?: string }) {
    this.parentScene = data?.parentScene ?? 'WorldScene'
  }

  create() {
    this.view = 'room'
    this.selectedCategory = 'attack'
    this.selectedStrategy = null
    this.ownedPage = 0

    // ── Server shop state ─────────────────────────────────────────────────────
    this.socket = (window as typeof window & { __lumenSocket?: Socket }).__lumenSocket ?? null

    const onUnlocks = (data: ShopUnlocks) => this.applyUnlocks(data)
    const onPurchased = (data: ShopUnlocks & { strategyId: string }) => {
      this.applyUnlocks(data)
      this.showFeedback('✓ Purchase complete!', '#88ffaa')
    }
    const onLoadoutSaved = (data: { strategyLoadout: string[] }) => {
      this.savedLoadout = [...(data.strategyLoadout ?? [])]
      this.loadout = [...this.savedLoadout]
      this.showFeedback('✓ Strategy order saved!', '#88ffaa')
      if (this.view === 'teacher') this.drawTeacherPanel()
    }
    const onError = (err: { message?: string }) => {
      if (err?.message) this.showFeedback(err.message, '#ff8866')
    }
    this.socket?.on('shop:unlocks', onUnlocks)
    this.socket?.on('shop:strategy_purchased', onPurchased)
    this.socket?.on('strategy:loadout_saved', onLoadoutSaved)
    this.socket?.on('error', onError)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.socket?.off('shop:unlocks', onUnlocks)
      this.socket?.off('shop:strategy_purchased', onPurchased)
      this.socket?.off('strategy:loadout_saved', onLoadoutSaved)
      this.socket?.off('error', onError)
    })
    this.socket?.emit('shop:get_unlocks')

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

    // ── View containers ───────────────────────────────────────────────────────
    this.roomContainer      = this.add.container(0, 0).setDepth(10)
    this.leftContainer      = this.add.container(0, 0).setDepth(10)
    this.rightInfoContainer = this.add.container(0, 0).setDepth(10)
    this.rightListContainer = this.add.container(0, 0).setDepth(10)
    this.teacherContainer   = this.add.container(0, 0).setDepth(10)

    // ── Tooltip (hidden by default) ───────────────────────────────────────────
    this.tooltipContainer = this.add.container(0, 0).setDepth(200)
    this.tooltipContainer.setVisible(false)

    // ── Purchase / save feedback toast ────────────────────────────────────────
    this.feedbackText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 34, '', {
      fontSize: '14px', fontFamily: 'Arial, sans-serif', color: '#88ffaa',
      backgroundColor: '#000000aa', padding: { x: 10, y: 5 },
    }).setOrigin(0.5, 0.5).setDepth(250).setVisible(false)

    // ── Keyboard ESC: station → room → world ─────────────────────────────────
    this.input.keyboard!.on('keydown-ESC', () => this.handleEscape())

    // Start in the room hub
    this.showRoom()
  }

  // ── View switching ─────────────────────────────────────────────────────────

  private handleEscape() {
    if (this.view !== 'room') {
      this.showRoom()
    } else {
      this.closeScene()
    }
  }

  private clearAllViews() {
    this.roomContainer.removeAll(true)
    this.leftContainer.removeAll(true)
    this.rightInfoContainer.removeAll(true)
    this.rightListContainer.removeAll(true)
    this.teacherContainer.removeAll(true)
    this.tooltipContainer.removeAll(true)
    this.tooltipContainer.setVisible(false)
    this.selectedStrategy = null
  }

  private showRoom() {
    this.view = 'room'
    this.clearAllViews()
    this.escLabel.setText('ESC  Close')
    this.drawRoom()
  }

  private openMerchant() {
    this.view = 'merchant'
    this.clearAllViews()
    this.escLabel.setText('ESC  Back')
    this.drawLeftPanel()
    this.drawRightPanel()
  }

  private openTeacher() {
    this.view = 'teacher'
    this.clearAllViews()
    this.escLabel.setText('ESC  Back')
    this.ownedPage = 0
    // Fresh editing copy of the server-confirmed order
    this.loadout = this.savedLoadout.filter(id => this.unlockedStrategies.has(id))
    this.drawTeacherPanel()
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

    // Combat Shard balance (server-reported)
    this.balanceText = this.add.text(GAME_WIDTH - 170, PANEL_TOP / 2, '🔶 Combat Shards:  …', {
      fontSize: '16px', fontFamily: 'Georgia, serif', color: '#ffaa55', fontStyle: 'bold',
    }).setOrigin(1, 0.5).setDepth(6)

    // ESC close/back button
    const closeBtnX = GAME_WIDTH - 100
    const closeBtnY = PANEL_TOP / 2
    const closeBg = this.add.graphics().setDepth(6)
    closeBg.fillStyle(0x2a0a0a, 1)
    closeBg.fillRoundedRect(closeBtnX - 50, closeBtnY - 14, 100, 28, 6)
    closeBg.lineStyle(1, 0xaa3333, 1)
    closeBg.strokeRoundedRect(closeBtnX - 50, closeBtnY - 14, 100, 28, 6)

    this.escLabel = this.add.text(closeBtnX, closeBtnY, 'ESC  Close', {
      fontSize: '13px',
      fontFamily: 'Arial, sans-serif',
      color: '#cc6666',
    }).setOrigin(0.5, 0.5).setDepth(7).setInteractive({ useHandCursor: true })
    this.escLabel.on('pointerover', () => this.escLabel.setColor('#ff9999'))
    this.escLabel.on('pointerout',  () => this.escLabel.setColor('#cc6666'))
    this.escLabel.on('pointerdown', () => this.handleEscape())
  }

  // ── Room hub ───────────────────────────────────────────────────────────────
  private drawRoom() {
    const c = this.roomContainer
    const roomTop = PANEL_TOP - 4
    const wallH = 110

    const g = this.add.graphics()

    // Wall band at the top
    g.fillStyle(0x16162e, 1)
    g.fillRect(0, roomTop, GAME_WIDTH, wallH)
    // Wall trim (gold skirting where the wall meets the floor)
    g.fillStyle(0x1f1b38, 1)
    g.fillRect(0, roomTop + wallH - 12, GAME_WIDTH, 12)
    g.lineStyle(2, COLOR_BORDER_DIM, 1)
    g.lineBetween(0, roomTop + wallH, GAME_WIDTH, roomTop + wallH)
    // Wall stones
    for (let wx = 0; wx < GAME_WIDTH; wx += 72) {
      g.lineStyle(1, 0x10102a, 0.8)
      g.lineBetween(wx, roomTop, wx, roomTop + wallH - 12)
    }
    c.add(g)

    // Torch sconces on the wall (gold glow accents)
    for (const tx of [GAME_WIDTH * 0.18, GAME_WIDTH * 0.5, GAME_WIDTH * 0.82]) {
      const glow = this.add.graphics()
      glow.fillStyle(0xffd700, 0.08)
      glow.fillCircle(tx, roomTop + 48, 36)
      glow.fillStyle(0xffaa33, 0.85)
      glow.fillCircle(tx, roomTop + 48, 5)
      glow.fillStyle(0x554400, 1)
      glow.fillRect(tx - 2, roomTop + 53, 4, 14)
      c.add(glow)
      this.tweens.add({
        targets: glow, alpha: { from: 1, to: 0.7 },
        duration: 700 + Math.random() * 400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      })
    }

    // Wooden floor planks (dark, blue-tinted wood in the scene palette)
    const floor = this.add.graphics()
    const floorTop = roomTop + wallH
    let plankRow = 0
    for (let py = floorTop; py < GAME_HEIGHT; py += 36) {
      floor.fillStyle(plankRow % 2 === 0 ? 0x241a30 : 0x2a2038, 1)
      floor.fillRect(0, py, GAME_WIDTH, 36)
      floor.lineStyle(1, 0x171022, 0.9)
      floor.lineBetween(0, py, GAME_WIDTH, py)
      // Staggered plank seams
      const offset = plankRow % 2 === 0 ? 0 : 80
      for (let px = offset; px < GAME_WIDTH; px += 160) {
        floor.lineBetween(px, py, px, Math.min(py + 36, GAME_HEIGHT))
      }
      plankRow++
    }
    c.add(floor)

    // Center rug
    const rug = this.add.graphics()
    const rugW = 540, rugH = 190
    const rugX = GAME_WIDTH / 2 - rugW / 2
    const rugY = floorTop + 120
    rug.fillStyle(0x1d1535, 1)
    rug.fillRoundedRect(rugX, rugY, rugW, rugH, 10)
    rug.lineStyle(3, COLOR_BORDER_DIM, 1)
    rug.strokeRoundedRect(rugX, rugY, rugW, rugH, 10)
    rug.lineStyle(1, COLOR_BORDER, 0.35)
    rug.strokeRoundedRect(rugX + 12, rugY + 12, rugW - 24, rugH - 24, 8)
    rug.fillStyle(COLOR_BORDER, 0.15)
    rug.fillCircle(GAME_WIDTH / 2, rugY + rugH / 2, 26)
    c.add(rug)

    // Stations — merchant on the LEFT side, teacher on the RIGHT side
    const stationY = floorTop + 200
    c.add(this.createStation(
      GAME_WIDTH * 0.18, stationY,
      TD_MERCHANT_NPC, 'Merchant', 'Buy combat strategies',
      () => this.openMerchant(),
    ))
    c.add(this.createStation(
      GAME_WIDTH * 0.82, stationY,
      TD_TEACHER_NPC, 'Teacher', 'Arrange your strategy order',
      () => this.openTeacher(),
    ))

    // Bottom hint
    c.add(this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 56, 'Click a table to talk  ·  ESC to leave the hall', {
      fontSize: '13px', fontFamily: 'Arial, sans-serif', color: COLOR_TEXT_DIM,
    }).setOrigin(0.5, 0.5))
  }

  /** One station: NPC behind a table, name plate, hint, hover glow + click. */
  private createStation(
    x: number, y: number,
    npcFrame: number, name: string, hint: string,
    onOpen: () => void,
  ): Phaser.GameObjects.Container {
    const station = this.add.container(x, y)

    // Hover glow (behind everything)
    const glow = this.add.graphics()
    glow.fillStyle(COLOR_BORDER, 1)
    glow.fillRoundedRect(-130, -150, 260, 320, 18)
    glow.setAlpha(0)
    station.add(glow)

    // NPC standing behind the counter (~5× of 16px); the tabletop overlaps
    // their feet so they read as standing at the table
    const npc = this.add.sprite(0, -48, 'tiny_dungeon', npcFrame).setScale(5)
    station.add(npc)

    // Wooden counter (drawn — see note at TD frame constants)
    station.add(this.drawCounter(name === 'Merchant'))

    // Name plate
    const plateG = this.add.graphics()
    plateG.fillStyle(COLOR_PANEL, 0.95)
    plateG.fillRoundedRect(-70, 102, 140, 30, 8)
    plateG.lineStyle(1, COLOR_BORDER, 0.9)
    plateG.strokeRoundedRect(-70, 102, 140, 30, 8)
    station.add(plateG)
    station.add(this.add.text(0, 117, name, {
      fontSize: '16px', fontFamily: 'Georgia, serif',
      color: COLOR_TEXT_GOLD, fontStyle: 'bold',
    }).setOrigin(0.5, 0.5))

    // Hint line
    station.add(this.add.text(0, 146, hint, {
      fontSize: '12px', fontFamily: 'Arial, sans-serif', color: COLOR_TEXT_GRAY,
    }).setOrigin(0.5, 0.5))

    // Hit zone covering the whole station
    const hit = this.add.zone(0, 5, 260, 320).setOrigin(0.5, 0.5)
    hit.setInteractive({ useHandCursor: true })
    hit.on('pointerover', () => {
      this.tweens.add({ targets: station, scale: 1.05, duration: 140, ease: 'Sine.easeOut' })
      this.tweens.add({ targets: glow, alpha: 0.12, duration: 140 })
    })
    hit.on('pointerout', () => {
      this.tweens.add({ targets: station, scale: 1, duration: 140, ease: 'Sine.easeOut' })
      this.tweens.add({ targets: glow, alpha: 0, duration: 140 })
    })
    hit.on('pointerdown', () => onOpen())
    station.add(hit)

    return station
  }

  /**
   * A wooden counter for a station, drawn with Graphics: plank front panel,
   * highlighted tabletop with a faint gold trim, plus a small tabletop prop —
   * a coin pouch for the Merchant, an open book for the Teacher.
   */
  private drawCounter(isMerchant: boolean): Phaser.GameObjects.Graphics {
    const g = this.add.graphics()

    // Front panel (below the tabletop) with vertical plank seams
    g.fillStyle(0x4a2f1d, 1)
    g.fillRoundedRect(-110, 8, 220, 76, { tl: 0, tr: 0, bl: 10, br: 10 })
    g.lineStyle(1, 0x2e1c10, 1)
    for (let px = -88; px < 110; px += 22) g.lineBetween(px, 10, px, 80)
    // Side shading so the panel reads as 3D
    g.fillStyle(0x000000, 0.18)
    g.fillRect(-110, 8, 10, 72)
    g.fillRect(100, 8, 10, 72)

    // Tabletop (slightly wider than the panel, light edge on top)
    g.fillStyle(0x6e4a2c, 1)
    g.fillRoundedRect(-122, -12, 244, 28, 8)
    g.fillStyle(0x7d563a, 1)
    g.fillRoundedRect(-122, -12, 244, 11, { tl: 8, tr: 8, bl: 0, br: 0 })
    g.lineStyle(2, 0x3a2412, 1)
    g.strokeRoundedRect(-122, -12, 244, 28, 8)
    g.lineStyle(1, COLOR_BORDER, 0.22)
    g.strokeRoundedRect(-118, -9, 236, 22, 6)

    if (isMerchant) {
      // Coin pouch + loose coins
      g.fillStyle(0x5b3a23, 1)
      g.fillEllipse(58, -8, 22, 18)
      g.fillStyle(0x8a5c36, 1)
      g.fillEllipse(58, -13, 12, 7)
      g.fillStyle(0xffd700, 0.95)
      g.fillCircle(36, -5, 4)
      g.fillCircle(44, -2, 4)
      g.fillCircle(30, -1, 4)
    } else {
      // Open book
      g.fillStyle(0x2a1a40, 1)
      g.fillRoundedRect(-76, -12, 44, 16, 3)
      g.fillStyle(0xf0e8d8, 1)
      g.fillRect(-73, -10, 18, 11)
      g.fillRect(-53, -10, 18, 11)
      g.lineStyle(1, 0xbbb09a, 1)
      g.lineBetween(-54, -10, -54, 1)
      g.lineStyle(1, 0xcfc6b2, 0.9)
      g.lineBetween(-70, -6, -58, -6)
      g.lineBetween(-50, -6, -38, -6)
    }

    return g
  }

  // ── Merchant: left panel (preset browser) ──────────────────────────────────
  private drawLeftPanel() {
    this.leftContainer.removeAll(true)

    const g = this.add.graphics()
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
      this.add.text(LEFT_PANEL_X + LEFT_PANEL_W / 2, PANEL_TOP + 19, 'MERCHANT — STRATEGY TYPES', {
        fontSize: '13px',
        fontFamily: 'Arial, sans-serif',
        color: COLOR_TEXT_GOLD,
        fontStyle: 'bold',
        letterSpacing: 1,
      }).setOrigin(0.5, 0.5)
    )

    // Divider
    const div = this.add.graphics()
    div.lineStyle(1, COLOR_BORDER_DIM, 0.8)
    div.lineBetween(LEFT_PANEL_X + 10, PANEL_TOP + 38, LEFT_PANEL_X + LEFT_PANEL_W - 10, PANEL_TOP + 38)
    this.leftContainer.add(div)

    // Category list
    const listStartY = PANEL_TOP + 54
    const itemH = 68

    CATEGORY_META.forEach((cat, index) => {
      const count = STRATEGIES.filter(s => categoryOf(s.id) === cat.key).length
      const itemY = listStartY + index * (itemH + 8)
      const btn = this.createCategoryButton(cat, count, LEFT_PANEL_X + 12, itemY, LEFT_PANEL_W - 24, itemH)
      this.leftContainer.add(btn)
    })

    // Merchant footer hint (replaces the old MY STRATEGY section)
    this.leftContainer.add(
      this.add.text(LEFT_PANEL_X + LEFT_PANEL_W / 2, PANEL_TOP + PANEL_H - 26,
        'Visit the Teacher to arrange\nyour purchased strategies.', {
        fontSize: '11px',
        fontFamily: 'Arial, sans-serif',
        color: COLOR_TEXT_DIM,
        align: 'center',
        lineSpacing: 3,
      }).setOrigin(0.5, 0.5)
    )
  }

  private createCategoryButton(
    cat: { key: StrategyCategory; label: string; icon: string; desc: string },
    count: number,
    x: number,
    y: number,
    w: number,
    h: number
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x, y)

    const isSelected = this.selectedCategory === cat.key

    const bg = this.add.graphics()
    this.drawPresetButtonBg(bg, 0, 0, w, h, isSelected)

    const iconText = this.add.text(12, h / 2, cat.icon, {
      fontSize: '22px',
    }).setOrigin(0, 0.5)

    const nameText = this.add.text(48, h / 2 - 9, cat.label, {
      fontSize: '15px',
      fontFamily: 'Georgia, serif',
      color: isSelected ? COLOR_TEXT_GOLD : COLOR_TEXT_WHITE,
      fontStyle: isSelected ? 'bold' : 'normal',
    }).setOrigin(0, 0.5)

    const countText = this.add.text(48, h / 2 + 9, `${count} strategies`, {
      fontSize: '11px',
      fontFamily: 'Arial, sans-serif',
      color: COLOR_TEXT_DIM,
    }).setOrigin(0, 0.5)

    container.add([bg, iconText, nameText, countText])

    // Hit zone
    const hit = this.add.zone(0, 0, w, h).setOrigin(0, 0)
    hit.setInteractive({ useHandCursor: true })
    hit.on('pointerover', () => {
      if (this.selectedCategory !== cat.key) {
        bg.clear()
        this.drawPresetButtonBg(bg, 0, 0, w, h, false, true)
        nameText.setColor(COLOR_TEXT_GOLD)
      }
    })
    hit.on('pointerout', () => {
      if (this.selectedCategory !== cat.key) {
        bg.clear()
        this.drawPresetButtonBg(bg, 0, 0, w, h, false)
        nameText.setColor(COLOR_TEXT_WHITE)
      }
    })
    hit.on('pointerdown', () => {
      this.selectCategory(cat.key)
    })
    container.add(hit)

    return container
  }

  private drawPresetButtonBg(
    g: Phaser.GameObjects.Graphics,
    x: number, y: number, w: number, h: number,
    selected: boolean, hover = false
  ) {
    g.clear()
    const fillColor = selected ? COLOR_SELECTED : hover ? COLOR_HOVER : COLOR_PANEL_ALT
    g.fillStyle(fillColor, 1)
    g.fillRoundedRect(x, y, w, h, 6)
    const borderColor = selected ? COLOR_BORDER : 0x333366
    const borderAlpha = selected ? 1 : 0.7
    g.lineStyle(selected ? 2 : 1, borderColor, borderAlpha)
    g.strokeRoundedRect(x, y, w, h, 6)
  }

  // ── Merchant: right panel ──────────────────────────────────────────────────
  private drawRightPanel() {
    this.rightInfoContainer.removeAll(true)
    this.rightListContainer.removeAll(true)

    const cat = CATEGORY_META.find(c => c.key === this.selectedCategory)!
    const catStrategies = STRATEGIES
      .filter(s => categoryOf(s.id) === cat.key)
      .sort((a, b) => a.priority - b.priority)

    // ── Top area: category info ───────────────────────────────────────────────
    const infoH = 160
    const infoG = this.add.graphics()
    infoG.fillStyle(COLOR_PANEL, 1)
    infoG.fillRoundedRect(RIGHT_PANEL_X, PANEL_TOP, RIGHT_PANEL_W, infoH, 8)
    infoG.lineStyle(1, COLOR_BORDER_DIM, 1)
    infoG.strokeRoundedRect(RIGHT_PANEL_X, PANEL_TOP, RIGHT_PANEL_W, infoH, 8)
    this.rightInfoContainer.add(infoG)

    // Category name + icon
    this.rightInfoContainer.add(
      this.add.text(RIGHT_PANEL_X + 20, PANEL_TOP + 28, `${cat.icon}  ${cat.label} Strategies`, {
        fontSize: '22px',
        fontFamily: 'Georgia, serif',
        color: COLOR_TEXT_GOLD,
        fontStyle: 'bold',
      }).setOrigin(0, 0.5)
    )

    // Description
    this.rightInfoContainer.add(
      this.add.text(RIGHT_PANEL_X + 20, PANEL_TOP + 60, cat.desc, {
        fontSize: '13px',
        fontFamily: 'Arial, sans-serif',
        color: COLOR_TEXT_GRAY,
        wordWrap: { width: RIGHT_PANEL_W - 180 },
        lineSpacing: 4,
      }).setOrigin(0, 0)
    )

    // Strategy count
    this.rightInfoContainer.add(
      this.add.text(RIGHT_PANEL_X + 20, PANEL_TOP + 118, `${catStrategies.length} strategies  ·  buy the ones you like, then arrange them at the Teacher`, {
        fontSize: '11px',
        fontFamily: 'Arial, sans-serif',
        color: COLOR_TEXT_DIM,
      }).setOrigin(0, 0)
    )

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
      this.add.text(RIGHT_PANEL_X + 20, listY + 18, `${cat.label.toUpperCase()} STRATEGIES  ·  click a row for details`, {
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

    const itemH  = 44
    const startY = listY + 46

    catStrategies.forEach((strategy, index) => {
      const iy = startY + index * (itemH + 4)
      if (iy + itemH > listY + listH - 10) return // clamp to panel

      const item = this.createStrategyItem(strategy, index + 1, RIGHT_PANEL_X + 10, iy, RIGHT_PANEL_W - 20, itemH)
      this.rightListContainer.add(item)
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

    // Ownership badge (server-reported): owned ✓ or a Buy button (2 🔶)
    const owned = this.unlockedStrategies.has(strategy.id)

    container.add([bg, rankBadge, rankText, nameText, condText])

    // Row hit zone — added BEFORE the Buy button so the button (added later,
    // therefore on top) actually receives its clicks. Phaser routes input to
    // the top-most interactive object; with the zone on top the Buy button
    // could never be clicked.
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

    if (owned) {
      container.add(this.add.text(w - 12, h / 2, '✓ Owned', {
        fontSize: '11px', fontFamily: 'Arial, sans-serif', color: '#88ffaa',
        backgroundColor: '#0a2a1a', padding: { x: 6, y: 4 }, fontStyle: 'bold',
      }).setOrigin(1, 0.5))
    } else {
      const affordable = this.combatShards >= STRATEGY_PRICE
      const buyText = this.add.text(w - 12, h / 2, `Buy ${STRATEGY_PRICE} 🔶`, {
        fontSize: '11px', fontFamily: 'Arial, sans-serif',
        color: affordable ? '#ffcc77' : '#cc7766',
        backgroundColor: '#2a1f0a', padding: { x: 6, y: 4 }, fontStyle: 'bold',
      }).setOrigin(1, 0.5).setInteractive({ useHandCursor: true })
      buyText.on('pointerover', () => buyText.setColor('#ffee99'))
      buyText.on('pointerout',  () => buyText.setColor(affordable ? '#ffcc77' : '#cc7766'))
      buyText.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation()
        // Server validates ownership, pricing and balance
        if (!this.socket?.connected) {
          this.showFeedback('Not connected to the server.', '#ff8866')
          return
        }
        this.socket.emit('shop:buy_strategy', { strategyId: strategy.id })
      })
      container.add(buyText)
    }

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

  // ── Teacher panel ──────────────────────────────────────────────────────────

  /** Owned strategies, sorted by suggested priority then name. */
  private getOwnedStrategies(): CombatStrategy[] {
    return STRATEGIES
      .filter(s => this.unlockedStrategies.has(s.id))
      .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name))
  }

  private drawTeacherPanel() {
    const c = this.teacherContainer
    c.removeAll(true)

    // ── Left panel: owned strategies ──────────────────────────────────────────
    const g = this.add.graphics()
    g.fillStyle(COLOR_PANEL, 1)
    g.fillRoundedRect(LEFT_PANEL_X, PANEL_TOP, LEFT_PANEL_W, PANEL_H, 8)
    g.lineStyle(1, COLOR_BORDER_DIM, 1)
    g.strokeRoundedRect(LEFT_PANEL_X, PANEL_TOP, LEFT_PANEL_W, PANEL_H, 8)
    // Right panel: loadout order
    g.fillStyle(COLOR_PANEL, 1)
    g.fillRoundedRect(RIGHT_PANEL_X, PANEL_TOP, RIGHT_PANEL_W, PANEL_H, 8)
    g.lineStyle(1, COLOR_BORDER_DIM, 1)
    g.strokeRoundedRect(RIGHT_PANEL_X, PANEL_TOP, RIGHT_PANEL_W, PANEL_H, 8)
    c.add(g)

    // Headers
    const hdrG = this.add.graphics()
    hdrG.fillStyle(0x1a1a35, 1)
    hdrG.fillRoundedRect(LEFT_PANEL_X, PANEL_TOP, LEFT_PANEL_W, 38, { tl: 8, tr: 8, bl: 0, br: 0 })
    hdrG.fillRoundedRect(RIGHT_PANEL_X, PANEL_TOP, RIGHT_PANEL_W, 38, { tl: 8, tr: 8, bl: 0, br: 0 })
    hdrG.lineStyle(1, COLOR_BORDER_DIM, 0.8)
    hdrG.lineBetween(LEFT_PANEL_X + 10, PANEL_TOP + 38, LEFT_PANEL_X + LEFT_PANEL_W - 10, PANEL_TOP + 38)
    hdrG.lineBetween(RIGHT_PANEL_X + 10, PANEL_TOP + 38, RIGHT_PANEL_X + RIGHT_PANEL_W - 10, PANEL_TOP + 38)
    c.add(hdrG)

    c.add(this.add.text(LEFT_PANEL_X + LEFT_PANEL_W / 2, PANEL_TOP + 19, 'TEACHER — OWNED STRATEGIES', {
      fontSize: '13px', fontFamily: 'Arial, sans-serif',
      color: COLOR_TEXT_GOLD, fontStyle: 'bold', letterSpacing: 1,
    }).setOrigin(0.5, 0.5))

    c.add(this.add.text(RIGHT_PANEL_X + 20, PANEL_TOP + 19,
      `YOUR STRATEGY ORDER  (top = checked first)  ·  ${this.loadout.length}/${MAX_LOADOUT_SIZE}`, {
      fontSize: '12px', fontFamily: 'Arial, sans-serif',
      color: COLOR_TEXT_GOLD, fontStyle: 'bold', letterSpacing: 1,
    }).setOrigin(0, 0.5))

    this.drawOwnedList(c)
    this.drawLoadoutList(c)
  }

  private drawOwnedList(c: Phaser.GameObjects.Container) {
    const owned = this.getOwnedStrategies()

    if (owned.length === 0) {
      c.add(this.add.text(LEFT_PANEL_X + LEFT_PANEL_W / 2, PANEL_TOP + PANEL_H / 2,
        'You don\'t own any strategies yet.\n\nBuy strategies from the\nMerchant first!', {
        fontSize: '14px', fontFamily: 'Arial, sans-serif',
        color: COLOR_TEXT_DIM, align: 'center', lineSpacing: 4,
      }).setOrigin(0.5, 0.5))
      return
    }

    c.add(this.add.text(LEFT_PANEL_X + 14, PANEL_TOP + 50, 'Click a strategy to add it to your order  →', {
      fontSize: '11px', fontFamily: 'Arial, sans-serif', color: COLOR_TEXT_DIM,
    }))

    const itemH = 40
    const gap = 4
    const listStartY = PANEL_TOP + 70
    const footerH = 36
    const pageSize = Math.floor((PANEL_H - (listStartY - PANEL_TOP) - footerH - 8) / (itemH + gap))
    const pageCount = Math.max(1, Math.ceil(owned.length / pageSize))
    this.ownedPage = Phaser.Math.Clamp(this.ownedPage, 0, pageCount - 1)
    const pageItems = owned.slice(this.ownedPage * pageSize, (this.ownedPage + 1) * pageSize)

    pageItems.forEach((strategy, i) => {
      const y = listStartY + i * (itemH + gap)
      c.add(this.createOwnedItem(strategy, LEFT_PANEL_X + 12, y, LEFT_PANEL_W - 24, itemH))
    })

    // Pagination footer
    if (pageCount > 1) {
      const fy = PANEL_TOP + PANEL_H - footerH / 2 - 6
      const mkArrow = (label: string, dx: number, enabled: boolean, delta: number) => {
        const t = this.add.text(LEFT_PANEL_X + LEFT_PANEL_W / 2 + dx, fy, label, {
          fontSize: '15px', fontFamily: 'Arial, sans-serif',
          color: enabled ? COLOR_TEXT_GOLD : COLOR_TEXT_DIM, fontStyle: 'bold',
        }).setOrigin(0.5, 0.5)
        if (enabled) {
          t.setInteractive({ useHandCursor: true })
          t.on('pointerover', () => t.setColor('#ffee99'))
          t.on('pointerout',  () => t.setColor(COLOR_TEXT_GOLD))
          t.on('pointerdown', () => { this.ownedPage += delta; this.drawTeacherPanel() })
        }
        return t
      }
      c.add(mkArrow('◀', -70, this.ownedPage > 0, -1))
      c.add(this.add.text(LEFT_PANEL_X + LEFT_PANEL_W / 2, fy,
        `Page ${this.ownedPage + 1}/${pageCount}`, {
        fontSize: '12px', fontFamily: 'Arial, sans-serif', color: COLOR_TEXT_GRAY,
      }).setOrigin(0.5, 0.5))
      c.add(mkArrow('▶', 70, this.ownedPage < pageCount - 1, 1))
    }
  }

  private createOwnedItem(
    strategy: CombatStrategy,
    x: number, y: number, w: number, h: number,
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x, y)
    const inLoadout = this.loadout.includes(strategy.id)

    const bg = this.add.graphics()
    this.drawItemBg(bg, 0, 0, w, h, false)
    container.add(bg)

    const nameText = this.add.text(10, h / 2 - 8, strategy.name, {
      fontSize: '13px', fontFamily: 'Georgia, serif',
      color: inLoadout ? COLOR_TEXT_DIM : COLOR_TEXT_WHITE,
    }).setOrigin(0, 0.5)
    container.add(nameText)

    container.add(this.add.text(10, h / 2 + 8, this.formatCondition(strategy), {
      fontSize: '10px', fontFamily: 'Arial, sans-serif', color: COLOR_TEXT_DIM,
    }).setOrigin(0, 0.5))

    if (inLoadout) {
      container.add(this.add.text(w - 8, h / 2, '✓ In order', {
        fontSize: '10px', fontFamily: 'Arial, sans-serif', color: '#88ffaa',
        backgroundColor: '#0a2a1a', padding: { x: 4, y: 2 },
      }).setOrigin(1, 0.5))
      container.setAlpha(0.55)
    } else {
      // Action badge (reuses the merchant's formatting helpers)
      container.add(this.add.text(w - 8, h / 2, this.formatAction(strategy), {
        fontSize: '10px', fontFamily: 'Arial, sans-serif',
        color: this.actionColor(strategy.action),
        backgroundColor: '#0a0a22', padding: { x: 4, y: 2 },
      }).setOrigin(1, 0.5))
    }

    const hit = this.add.zone(0, 0, w, h).setOrigin(0, 0)
    hit.setInteractive({ useHandCursor: true })
    hit.on('pointerover', () => {
      if (!inLoadout) {
        bg.clear(); this.drawItemBg(bg, 0, 0, w, h, false, true)
        nameText.setColor(COLOR_TEXT_GOLD)
      }
    })
    hit.on('pointerout', () => {
      if (!inLoadout) {
        bg.clear(); this.drawItemBg(bg, 0, 0, w, h, false, false)
        nameText.setColor(COLOR_TEXT_WHITE)
      }
    })
    hit.on('pointerdown', () => this.addToLoadout(strategy.id))
    container.add(hit)

    return container
  }

  private drawLoadoutList(c: Phaser.GameObjects.Container) {
    const listStartY = PANEL_TOP + 48
    const itemH = 44
    const gap = 4

    if (this.loadout.length === 0) {
      const msg = this.unlockedStrategies.size === 0
        ? 'Buy strategies from the Merchant first!'
        : 'Your order is empty.\nClick an owned strategy on the left to add it.'
      c.add(this.add.text(RIGHT_PANEL_X + RIGHT_PANEL_W / 2, PANEL_TOP + PANEL_H / 2 - 30, msg, {
        fontSize: '14px', fontFamily: 'Arial, sans-serif',
        color: COLOR_TEXT_DIM, align: 'center', lineSpacing: 5,
      }).setOrigin(0.5, 0.5))
    }

    this.loadout.forEach((id, index) => {
      const strategy = STRATEGIES.find(s => s.id === id)
      if (!strategy) return
      const y = listStartY + index * (itemH + gap)
      c.add(this.createLoadoutItem(strategy, index, RIGHT_PANEL_X + 12, y, RIGHT_PANEL_W - 24, itemH))
    })

    // ── Save Order button ─────────────────────────────────────────────────────
    const btnW = 170, btnH = 38
    const btnX = RIGHT_PANEL_X + RIGHT_PANEL_W / 2
    const btnY = PANEL_TOP + PANEL_H - btnH / 2 - 14
    const dirty = this.loadout.length !== this.savedLoadout.length
      || this.loadout.some((id, i) => this.savedLoadout[i] !== id)

    const btnBg = this.add.graphics()
    const drawBtn = (hover = false) => {
      btnBg.clear()
      const fillC = dirty ? (hover ? 0x2a3a1a : 0x1a2a1a) : 0x16162e
      const borderC = dirty ? (hover ? 0x88dd44 : 0x44aa44) : 0x333366
      btnBg.fillStyle(fillC, 1)
      btnBg.fillRoundedRect(btnX - btnW / 2, btnY - btnH / 2, btnW, btnH, 8)
      btnBg.lineStyle(2, borderC, 1)
      btnBg.strokeRoundedRect(btnX - btnW / 2, btnY - btnH / 2, btnW, btnH, 8)
    }
    drawBtn()
    c.add(btnBg)

    const btnText = this.add.text(btnX, btnY, dirty ? 'Save Order' : '✓ Saved', {
      fontSize: '14px', fontFamily: 'Arial, sans-serif',
      color: dirty ? '#aaffaa' : COLOR_TEXT_DIM, fontStyle: 'bold',
    }).setOrigin(0.5, 0.5)
    c.add(btnText)

    if (dirty) {
      btnText.setInteractive({ useHandCursor: true })
      btnText.on('pointerover', () => drawBtn(true))
      btnText.on('pointerout',  () => drawBtn(false))
      btnText.on('pointerdown', () => this.saveLoadout())
    }
  }

  private createLoadoutItem(
    strategy: CombatStrategy,
    index: number,
    x: number, y: number, w: number, h: number,
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x, y)

    const bg = this.add.graphics()
    this.drawItemBg(bg, 0, 0, w, h, false)
    container.add(bg)

    // Order badge (1 = checked first)
    const badge = this.add.graphics()
    badge.fillStyle(0x1a1a40, 1)
    badge.fillCircle(18, h / 2, 14)
    badge.lineStyle(1, COLOR_BORDER, 0.8)
    badge.strokeCircle(18, h / 2, 14)
    container.add(badge)
    container.add(this.add.text(18, h / 2, String(index + 1), {
      fontSize: '13px', fontFamily: 'Arial, sans-serif',
      color: COLOR_TEXT_GOLD, fontStyle: 'bold',
    }).setOrigin(0.5, 0.5))

    container.add(this.add.text(42, h / 2 - 8, strategy.name, {
      fontSize: '14px', fontFamily: 'Georgia, serif', color: COLOR_TEXT_WHITE,
    }).setOrigin(0, 0.5))

    container.add(this.add.text(42, h / 2 + 9, this.formatCondition(strategy), {
      fontSize: '11px', fontFamily: 'Arial, sans-serif', color: COLOR_TEXT_DIM,
    }).setOrigin(0, 0.5))

    // Action badge
    container.add(this.add.text(w - 110, h / 2, this.formatAction(strategy), {
      fontSize: '11px', fontFamily: 'Arial, sans-serif',
      color: this.actionColor(strategy.action),
      backgroundColor: '#0a0a22', padding: { x: 5, y: 3 },
    }).setOrigin(1, 0.5))

    // ▲ ▼ ✕ controls
    const mkBtn = (label: string, dx: number, enabled: boolean, color: string, onClick: () => void) => {
      const t = this.add.text(w - dx, h / 2, label, {
        fontSize: '16px', fontFamily: 'Arial, sans-serif',
        color: enabled ? color : '#333355', fontStyle: 'bold',
      }).setOrigin(0.5, 0.5)
      if (enabled) {
        t.setInteractive({ useHandCursor: true })
        t.on('pointerover', () => t.setColor('#ffffff'))
        t.on('pointerout',  () => t.setColor(color))
        t.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
          event.stopPropagation()
          onClick()
        })
      }
      container.add(t)
    }
    mkBtn('▲', 84, index > 0, COLOR_TEXT_GOLD, () => this.moveInLoadout(index, -1))
    mkBtn('▼', 56, index < this.loadout.length - 1, COLOR_TEXT_GOLD, () => this.moveInLoadout(index, 1))
    mkBtn('✕', 26, true, '#cc6666', () => this.removeFromLoadout(index))

    return container
  }

  // ── Teacher loadout mutations (client-side edit; server validates on save) ──

  private addToLoadout(strategyId: string) {
    if (this.loadout.includes(strategyId)) {
      this.showFeedback('That strategy is already in your order.', '#ffcc77')
      return
    }
    if (this.loadout.length >= MAX_LOADOUT_SIZE) {
      this.showFeedback(`Your order is full (${MAX_LOADOUT_SIZE} max). Remove one first.`, '#ffcc77')
      return
    }
    this.loadout.push(strategyId)
    this.drawTeacherPanel()
  }

  private moveInLoadout(index: number, delta: number) {
    const target = index + delta
    if (target < 0 || target >= this.loadout.length) return
    const tmp = this.loadout[index]
    this.loadout[index] = this.loadout[target]
    this.loadout[target] = tmp
    this.drawTeacherPanel()
  }

  private removeFromLoadout(index: number) {
    this.loadout.splice(index, 1)
    this.drawTeacherPanel()
  }

  private saveLoadout() {
    if (!this.socket?.connected) {
      this.showFeedback('Not connected to the server.', '#ff8866')
      return
    }
    this.showFeedback('Saving your strategy order…', '#ffcc77')
    // Server validates: ≤10 ids, all known, all owned, no duplicates.
    this.socket.emit('strategy:set_loadout', { strategyIds: [...this.loadout] })
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
      if (this.view === 'merchant') this.drawRightPanel()
    })
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Apply a server-pushed unlock/balance snapshot and re-render. */
  private applyUnlocks(data: ShopUnlocks) {
    this.unlockedStrategies = new Set(data.unlockedStrategies ?? [])
    this.combatShards = data.combatShards ?? 0
    this.balanceText.setText(`🔶 Combat Shards:  ${this.combatShards}`)

    if (Array.isArray(data.strategyLoadout)) {
      this.savedLoadout = [...data.strategyLoadout]
      if (this.view !== 'teacher') {
        // Don't clobber an in-progress edit; otherwise mirror the server.
        this.loadout = [...this.savedLoadout]
      }
    }
    // Editing copy may never reference strategies the player doesn't own.
    this.loadout = this.loadout.filter(id => this.unlockedStrategies.has(id))

    if (this.view === 'merchant') {
      this.drawLeftPanel()
      this.drawRightPanel()
    } else if (this.view === 'teacher') {
      this.drawTeacherPanel()
    }
  }

  private showFeedback(message: string, color: string) {
    this.feedbackText.setText(message).setColor(color).setVisible(true)
    this.time.delayedCall(2600, () => this.feedbackText.setVisible(false))
  }

  private selectCategory(category: StrategyCategory) {
    this.selectedCategory = category
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
    this.scene.resume(this.parentScene)
  }
}
