// ============================================================
// EquipmentScene — the paper-doll gear screen for the ACTIVE TEAM.
//
// Shows every member of the active team as a selectable rail (same
// look as CharacterScene); the selected member's paper-doll, stats and
// the shared bag fill the panels. Equipping targets the SELECTED member.
//
// SECURITY: this scene only RENDERS the server-pushed team sheet
// ('team:sheet', computed server-side incl. per-member equipment + the
// shared bag) and requests mutations via 'equipment:equip' /
// 'equipment:unequip' (carrying the selected member id). Ownership, the
// level gate and slot assignment are all enforced server-side.
// ============================================================

import Phaser from 'phaser'
import type { Socket } from 'socket.io-client'
import { GAME_WIDTH, GAME_HEIGHT } from '../constants'
import type { ClientInventoryItem } from '../systems/InventoryStore'
import type { ClientStats, ClientStatRow } from '../systems/StatsStore'
import type { EquipSlot } from '../data/equipmentGen'

// ── Types ─────────────────────────────────────────────────────────────────────

type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'
type SlotKey =
  | 'mainHand' | 'offHand' | 'helm' | 'earring' | 'ring1' | 'ring2'
  | 'belt' | 'shoes' | 'gloves' | 'necklace' | 'chest' | 'legs'

/** An active-team member with their equipped gear + full server-computed sheet. */
interface GearMember {
  id: string
  name: string
  class: string
  level: number
  power: number
  equipment: Partial<Record<SlotKey, ClientInventoryItem>>
  stats: ClientStats
}
interface TeamGear {
  teamId: string
  teamName: string
  activeCharacterId: string
  members: GearMember[]
  bag: ClientInventoryItem[]
}

// ── Constants ─────────────────────────────────────────────────────────────────

const RARITY_COLOR: Record<Rarity, number> = {
  common:    0xaaaaaa,
  uncommon:  0x44cc44,
  rare:      0x4488ff,
  epic:      0xcc44ff,
  legendary: 0xffaa00,
}

/** Accent color per class (mirrors BattleScene / CharacterScene CLASS_COLORS). */
const CLASS_COLORS: Record<string, number> = {
  fire_mage: 0xff4400, ice_mage: 0x44aaff, lightning_mage: 0xffee00,
  sword: 0xcc8855, spear: 0xaa9966, axe: 0xbb5533, hammer: 0x997755,
  monk: 0xffaa66, paladin: 0xffd700, assassin: 0x9955cc,
  cleric: 0x44ff88, shaman: 0x55cc77, bard: 0xff77cc,
}
const classColor = (cls: string): number => CLASS_COLORS[cls] ?? 0x8888aa
const classLabel = (cls: string): string =>
  cls.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')

const SLOT_LABELS: Record<SlotKey, string> = {
  mainHand: 'Main Hand', offHand: 'Off Hand', helm: 'Helm',
  earring:  'Earring',   ring1:   'Ring 1',   ring2: 'Ring 2',
  belt:     'Belt',      shoes:   'Boots',    gloves: 'Gloves',
  necklace: 'Necklace',  chest:   'Chest',    legs:   'Legs',
}

/** Display copy of the server's EquipSlot → slot-key mapping. */
const EQUIP_SLOT_TO_KEY: Record<EquipSlot, SlotKey> = {
  weapon: 'mainHand',
  helmet: 'helm',
  chest:  'chest',
  legs:   'legs',
  boots:  'shoes',
  gloves: 'gloves',
  ring:   'ring1',
  amulet: 'necklace',
}

/** Display-only slot lookup for LEGACY ItemDatabase gear (worn_sword, etc.). */
const LEGACY_ITEM_SLOT: Record<string, SlotKey> = {
  worn_sword:      'mainHand',
  worn_shield:     'offHand',
  leather_helm:    'helm',
  apprentice_ring: 'ring1',
  silver_necklace: 'necklace',
  iron_belt:       'belt',
  scholars_gloves: 'gloves',
  winged_boots:    'shoes',
}

/** True when a bag item is equippable (crafted gear OR known legacy gear). */
function isEquippable(item: ClientInventoryItem): boolean {
  return !!item.equipSlot || !!LEGACY_ITEM_SLOT[item.itemType]
}

// ── Layout ──────────────────────────────────────────────────────────────────
// Far-left member rail (CharacterScene style), then the selected member's
// paper-doll, the shared bag, and the selected member's stats.
const RAIL_X = 0
const RAIL_W = 210
const CARD_H = 52
const CARD_GAP = 8

const DOLL_PANEL_X = 214
const DOLL_PANEL_W = 346
const MID_PANEL_X  = 566
const MID_PANEL_W  = 364
const RIGHT_PANEL_X = 934
const RIGHT_PANEL_W = 346
const PANEL_Y       = 60
const PANEL_H       = GAME_HEIGHT - 80
const SLOT_SIZE     = 68
const ITEM_ROW_H    = 64

// Paper-doll: the hero sits in the centre of the doll panel, slots flank it in
// two columns. All derived from DOLL_CX so the doll moves as one.
const DOLL_CX = DOLL_PANEL_X + DOLL_PANEL_W / 2
const DOLL_CY = 372
const COL_L = DOLL_CX - 128
const COL_R = DOLL_CX + 128
const ROW0  = 196
const ROWH  = 80
const row = (i: number) => ROW0 + i * ROWH
const SLOT_POSITIONS: Record<SlotKey, { x: number; y: number }> = {
  helm:     { x: COL_L, y: row(0) },
  chest:    { x: COL_L, y: row(1) },
  gloves:   { x: COL_L, y: row(2) },
  belt:     { x: COL_L, y: row(3) },
  legs:     { x: COL_L, y: row(4) },
  shoes:    { x: COL_L, y: row(5) },
  mainHand: { x: COL_R, y: row(0) },
  offHand:  { x: COL_R, y: row(1) },
  necklace: { x: COL_R, y: row(2) },
  earring:  { x: COL_R, y: row(3) },
  ring1:    { x: COL_R, y: row(4) },
  ring2:    { x: COL_R, y: row(5) },
}

const SLOT_PLACEHOLDER: Record<SlotKey, string> = {
  mainHand: '🗡️', offHand: '🛡️', helm: '⛑️', earring: '💎',
  ring1: '💍', ring2: '💍', belt: '🔗', shoes: '👢',
  gloves: '🧤', necklace: '📿', chest: '🦺', legs: '👖',
}

const SLOT_ICON_FRAME: Partial<Record<SlotKey, number>> = {
  helm: 77, chest: 20,
}

// ── Scene ─────────────────────────────────────────────────────────────────────

export class EquipmentScene extends Phaser.Scene {
  private socket: Socket | null = null

  // Server-reported team sheet — only ever replaced by 'team:sheet' pushes.
  private sheet: TeamGear | null = null
  private selectedId = ''

  // Derived view state for the SELECTED member (recomputed each render).
  private equipped: Partial<Record<SlotKey, ClientInventoryItem>> = {}
  private gearItems: ClientInventoryItem[] = []
  private stats: ClientStats | null = null

  private railContainer!: Phaser.GameObjects.Container
  private slotContainerMap: Map<SlotKey, Phaser.GameObjects.Container> = new Map()
  private connectorGfx: Phaser.GameObjects.Graphics | null = null
  private slotTooltip: Phaser.GameObjects.Container | null = null
  private inventoryContainer!: Phaser.GameObjects.Container
  private statsContainer!:     Phaser.GameObjects.Container
  private dollTitle!:          Phaser.GameObjects.Text
  private dollSubtitle!:       Phaser.GameObjects.Text
  private feedbackText!:       Phaser.GameObjects.Text
  private scrollOffset = 0

  private iKey!:   Phaser.Input.Keyboard.Key
  private escKey!: Phaser.Input.Keyboard.Key

  constructor() {
    super({ key: 'EquipmentScene' })
  }

  create() {
    this.socket = (window as typeof window & { __lumenSocket?: Socket }).__lumenSocket ?? null
    this.scrollOffset = 0
    this.slotContainerMap.clear()
    this.connectorGfx = null

    this.drawBackground()
    this.drawHeader()
    this.drawFooter()
    this.drawRailPanel()
    this.drawDollPanel()
    this.drawMidPanel()
    this.drawRightPanel()

    this.railContainer = this.add.container(0, 0)

    this.feedbackText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 44, '', {
      fontSize: '14px', fontFamily: 'Arial, sans-serif', color: '#ff8866',
      backgroundColor: '#000000aa', padding: { x: 10, y: 5 },
    }).setOrigin(0.5, 0.5).setDepth(50).setVisible(false)

    // ── Server state is the only source of truth ──────────────────────────
    const onSheet = (data: unknown) => this.applySheet(data as TeamGear)
    const onError = (err: { message?: string }) => {
      if (err?.message) this.showFeedback(err.message)
    }
    this.socket?.on('team:sheet', onSheet)
    this.socket?.on('error', onError)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.socket?.off('team:sheet', onSheet)
      this.socket?.off('error', onError)
    })

    this.renderAll()            // loading state
    this.socket?.emit('team:get_sheet')

    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      this.scrollOffset = Math.max(0, this.scrollOffset + Math.sign(dy))
      this.buildInventoryList()
    })

    this.iKey   = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.I)
    this.escKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC)
  }

  update() {
    if (
      Phaser.Input.Keyboard.JustDown(this.iKey) ||
      Phaser.Input.Keyboard.JustDown(this.escKey)
    ) {
      this.closeScene()
    }
  }

  private closeScene() {
    this.scene.stop()
    this.scene.resume('WorldScene')
    if (!this.scene.isActive('UIScene')) {
      this.scene.launch('UIScene')
    }
  }

  // ── Server snapshot → render state ──────────────────────────────────────────

  private applySheet(sheet: TeamGear) {
    this.sheet = sheet
    const ids = new Set(sheet.members.map((m) => m.id))
    if (!ids.has(this.selectedId)) {
      this.selectedId = ids.has(sheet.activeCharacterId)
        ? sheet.activeCharacterId
        : (sheet.members[0]?.id ?? '')
    }
    this.renderAll()
  }

  private selected(): GearMember | undefined {
    return this.sheet?.members.find((m) => m.id === this.selectedId)
  }

  private select(id: string) {
    if (this.selectedId === id) return
    this.selectedId = id
    this.scrollOffset = 0
    this.renderAll()
  }

  private renderAll() {
    this.buildRail()

    const sel = this.selected()
    this.equipped = sel?.equipment ?? {}
    this.gearItems = (this.sheet?.bag ?? []).filter(isEquippable)
    this.stats = sel?.stats ?? null

    if (this.dollTitle) {
      this.dollTitle.setText(sel ? sel.name : (this.sheet ? '—' : 'Loading…'))
      this.dollSubtitle.setText(sel ? `Lv ${sel.level} · ${classLabel(sel.class)}` : '')
      const accent = sel ? classColor(sel.class) : 0x7777aa
      this.dollSubtitle.setColor(`#${accent.toString(16).padStart(6, '0')}`)
    }

    this.buildSlots()
    this.buildInventoryList()
    this.buildStatsPanel()
  }

  private showFeedback(message: string) {
    this.feedbackText.setText(message).setVisible(true)
    this.time.delayedCall(2600, () => this.feedbackText.setVisible(false))
  }

  /** Display-only: which slot a bag item would land in (server decides the real one). */
  private slotForItem(item: ClientInventoryItem): SlotKey | null {
    if (item.equipSlot) return EQUIP_SLOT_TO_KEY[item.equipSlot as EquipSlot]
    return LEGACY_ITEM_SLOT[item.itemType] ?? null
  }

  private itemBonusSummary(item: ClientInventoryItem): string {
    const base: string[] = []
    if (item.baseDamage) base.push(`${item.baseDamage.min}–${item.baseDamage.max} dmg`)
    if (typeof item.baseDefense === 'number') base.push(`${item.baseDefense} def`)
    if (base.length || (item.attributes && item.attributes.length)) {
      const affixes = (item.attributes ?? []).map(a => `+${a.value} ${this.attrLabel(a.type)}`)
      return [...base, ...affixes].join('  ')
    }
    return Object.entries(item.stats)
      .filter((e): e is [string, number] => typeof e[1] === 'number' && e[1] !== 0)
      .map(([k, v]) => `+${v} ${k.charAt(0).toUpperCase() + k.slice(1)}`)
      .join('  ')
  }

  private displayIcon(item: ClientInventoryItem): string {
    return item.icon
  }

  private attrLabel(type: string): string {
    return type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  }

  // ── Background / header / footer ────────────────────────────────────────────

  private drawBackground() {
    const bg = this.add.graphics()
    bg.fillStyle(0x0a0a1e, 1)
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)
    const rng = new Phaser.Math.RandomDataGenerator(['equip'])
    bg.fillStyle(0xffffff, 0.45)
    for (let i = 0; i < 80; i++) {
      bg.fillRect(rng.integerInRange(0, GAME_WIDTH), rng.integerInRange(0, GAME_HEIGHT), 1, 1)
    }
  }

  private drawHeader() {
    const hg = this.add.graphics()
    hg.fillStyle(0x12122e, 1)
    hg.fillRect(0, 0, GAME_WIDTH, 58)
    hg.lineStyle(1, 0x3333aa, 0.8)
    hg.lineBetween(0, 58, GAME_WIDTH, 58)
    hg.lineStyle(1, 0xffd700, 0.5)
    hg.lineBetween(40, 29, 470, 29)
    hg.lineBetween(810, 29, GAME_WIDTH - 40, 29)
    for (const dx of [470, 810]) {
      hg.fillStyle(0xffd700, 0.9)
      hg.fillTriangle(dx, 22, dx - 7, 29, dx, 36)
      hg.fillTriangle(dx, 22, dx + 7, 29, dx, 36)
    }
    this.add.text(GAME_WIDTH / 2, 29, 'T E A M   E Q U I P M E N T', {
      fontSize: '22px', fontFamily: 'Georgia, serif',
      color: '#ffd700', fontStyle: 'bold',
    }).setOrigin(0.5, 0.5)
  }

  private drawFooter() {
    const fg = this.add.graphics()
    fg.fillStyle(0x12122e, 1)
    fg.fillRect(0, GAME_HEIGHT - 26, GAME_WIDTH, 26)
    fg.lineStyle(1, 0x3333aa, 0.8)
    fg.lineBetween(0, GAME_HEIGHT - 26, GAME_WIDTH, GAME_HEIGHT - 26)
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 13,
      'Click a member to equip them  ·  Press  I  or  Escape  to close', {
      fontSize: '12px', fontFamily: 'Arial, sans-serif', color: '#555577',
    }).setOrigin(0.5, 0.5)
  }

  // ── Panel frames ─────────────────────────────────────────────────────────────

  private panelFrame(x: number, w: number, title: string) {
    const g = this.add.graphics()
    g.fillStyle(0x12122e, 1)
    g.fillRoundedRect(x + 4, PANEL_Y, w - 8, PANEL_H, 10)
    g.lineStyle(1, 0x2a2a5a, 1)
    g.strokeRoundedRect(x + 4, PANEL_Y, w - 8, PANEL_H, 10)
    this.add.text(x + w / 2, PANEL_Y + 14, title, {
      fontSize: '12px', fontFamily: 'Arial, sans-serif', color: '#7777aa',
    }).setOrigin(0.5, 0)
  }

  private drawRailPanel() {
    this.panelFrame(RAIL_X, RAIL_W, 'Active Team')
  }

  private drawDollPanel() {
    const g = this.add.graphics()
    g.fillStyle(0x12122e, 1)
    g.fillRoundedRect(DOLL_PANEL_X + 4, PANEL_Y, DOLL_PANEL_W - 8, PANEL_H, 10)
    g.lineStyle(1, 0x2a2a5a, 1)
    g.strokeRoundedRect(DOLL_PANEL_X + 4, PANEL_Y, DOLL_PANEL_W - 8, PANEL_H, 10)
    // Selected member name + meta (updated each render).
    this.dollTitle = this.add.text(DOLL_CX, PANEL_Y + 12, 'Loading…', {
      fontSize: '17px', fontFamily: 'Georgia, serif', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5, 0)
    this.dollSubtitle = this.add.text(DOLL_CX, PANEL_Y + 34, '', {
      fontSize: '11px', fontFamily: 'Arial, sans-serif', color: '#7777aa',
    }).setOrigin(0.5, 0)
    this.drawCharacterDoll()
  }

  private drawMidPanel() {
    this.panelFrame(MID_PANEL_X, MID_PANEL_W, 'Equippable Gear (shared bag)')
    const dg = this.add.graphics()
    dg.lineStyle(1, 0x2a2a5a, 1)
    dg.lineBetween(MID_PANEL_X + 12, PANEL_Y + 34, MID_PANEL_X + MID_PANEL_W - 12, PANEL_Y + 34)
  }

  private drawRightPanel() {
    this.panelFrame(RIGHT_PANEL_X, RIGHT_PANEL_W, 'Stats')
    const dg = this.add.graphics()
    dg.lineStyle(1, 0x2a2a5a, 1)
    dg.lineBetween(RIGHT_PANEL_X + 12, PANEL_Y + 34, RIGHT_PANEL_X + RIGHT_PANEL_W - 12, PANEL_Y + 34)
  }

  // ── Member rail (mirrors CharacterScene) ────────────────────────────────────

  private buildRail() {
    if (this.railContainer) this.railContainer.removeAll(true)

    const members = this.sheet?.members ?? []
    if (members.length === 0) {
      this.railContainer.add(
        this.add.text(RAIL_X + RAIL_W / 2, PANEL_Y + 60, this.sheet ? 'No members.' : 'Loading…', {
          fontSize: '12px', fontFamily: 'Arial, sans-serif', color: '#556699',
        }).setOrigin(0.5, 0.5)
      )
      return
    }
    const top = PANEL_Y + 44
    members.forEach((m, i) => this.drawMemberCard(m, top + i * (CARD_H + CARD_GAP)))
  }

  private drawMemberCard(m: GearMember, y: number) {
    const x = RAIL_X + 10
    const w = RAIL_W - 20
    const selected = m.id === this.selectedId
    const isActive = this.sheet?.activeCharacterId === m.id
    const accent = classColor(m.class)

    const card = this.add.graphics()
    card.fillStyle(selected ? 0x24244e : 0x161632, selected ? 1 : 0.55)
    card.fillRoundedRect(x, y, w, CARD_H, 8)
    card.lineStyle(selected ? 2 : 1, selected ? 0xffd700 : 0x33335a, selected ? 0.9 : 0.6)
    card.strokeRoundedRect(x, y, w, CARD_H, 8)
    card.fillStyle(accent, 1)
    card.fillRoundedRect(x, y, 4, CARD_H, 2)
    this.railContainer.add(card)

    this.drawMedallion(this.railContainer, x + 26, y + CARD_H / 2, 14, m.class)

    this.railContainer.add(
      this.add.text(x + 46, y + 7, this.truncate(m.name, 12), {
        fontSize: '13px', fontFamily: 'Georgia, serif',
        color: selected ? '#ffffff' : '#ccccdd', fontStyle: 'bold',
      }).setOrigin(0, 0)
    )
    this.railContainer.add(
      this.add.text(x + 46, y + 25, `Lv ${m.level} · ${classLabel(m.class)}`, {
        fontSize: '9px', fontFamily: 'Arial, sans-serif', color: '#8a90bb',
      }).setOrigin(0, 0)
    )
    this.railContainer.add(
      this.add.text(x + w - 8, y + 6, `${m.power}`, {
        fontSize: '14px', fontFamily: 'Georgia, serif', color: '#ffd700', fontStyle: 'bold',
      }).setOrigin(1, 0)
    )
    if (isActive) {
      this.railContainer.add(
        this.add.text(x + w - 8, y + 26, '★', {
          fontSize: '11px', fontFamily: 'Arial, sans-serif', color: '#66ff88',
        }).setOrigin(1, 0)
      )
    }

    const hit = this.add.rectangle(x, y, w, CARD_H, 0x000000, 0).setOrigin(0, 0).setInteractive({ useHandCursor: true })
    hit.on('pointerup', () => this.select(m.id))
    this.railContainer.add(hit)
  }

  private drawMedallion(container: Phaser.GameObjects.Container, cx: number, cy: number, r: number, cls: string) {
    const color = classColor(cls)
    const g = this.add.graphics()
    g.fillStyle(color, 0.22); g.fillCircle(cx, cy, r)
    g.lineStyle(2, color, 0.9); g.strokeCircle(cx, cy, r)
    container.add(g)
    container.add(
      this.add.text(cx, cy, classLabel(cls).charAt(0), {
        fontSize: `${Math.round(r * 1.1)}px`, fontFamily: 'Georgia, serif', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0.5, 0.5)
    )
  }

  // ── Character paper doll ───────────────────────────────────────────────────────

  private drawCharacterDoll() {
    const cx = DOLL_CX
    const cy = DOLL_CY

    const shadow = this.add.graphics()
    shadow.fillStyle(0x000000, 0.18)
    shadow.fillEllipse(cx, cy + 112, 92, 16)

    if (this.textures.exists('character_idle')) {
      const hero = this.add.sprite(cx, cy, 'character_idle', 12).setScale(4.5)
      if (this.anims.exists('idle_down')) hero.play('idle_down')
      return
    }

    // ── Fallback: drawn wizard figure ───────────────────────────────────────
    const g  = this.add.graphics()
    g.fillStyle(0x000000, 0.18)
    g.fillEllipse(cx, cy + 188, 76, 14)
    g.fillStyle(0x553322, 1)
    g.fillEllipse(cx - 14, cy + 184, 26, 11)
    g.fillEllipse(cx + 14, cy + 184, 26, 11)
    g.fillStyle(0x4b0082, 1)
    g.fillRect(cx - 24, cy - 8, 48, 150)
    g.fillStyle(0x3a006f, 1)
    g.fillTriangle(cx - 24, cy + 142, cx - 44, cy + 192, cx - 4, cy + 142)
    g.fillTriangle(cx + 24, cy + 142, cx + 44, cy + 192, cx + 4, cy + 142)
    g.fillStyle(0x7b2fc4, 0.3)
    g.fillRect(cx - 5, cy - 8, 9, 148)
    g.fillStyle(0xffd700, 1)
    g.fillRect(cx - 24, cy + 52, 48, 7)
    g.fillStyle(0xffee88, 1)
    g.fillRect(cx - 6, cy + 51, 12, 9)
    g.lineStyle(1, 0x886600, 1)
    g.strokeRect(cx - 6, cy + 51, 12, 9)
    g.fillStyle(0x4b0082, 1)
    g.fillRect(cx - 40, cy - 8, 16, 88)
    g.fillRect(cx + 24, cy - 8, 16, 88)
    g.fillStyle(0xffe0b2, 1)
    g.fillCircle(cx - 32, cy + 86, 9)
    g.fillCircle(cx + 32, cy + 86, 9)
    g.fillStyle(0xffe0b2, 1)
    g.fillRect(cx - 8, cy - 20, 16, 14)
    g.fillCircle(cx, cy - 42, 23)
    g.fillStyle(0xc8a86b, 0.55)
    g.fillRect(cx - 10, cy - 22, 20, 7)
    g.fillStyle(0x1a1a2e, 1)
    g.fillCircle(cx - 7, cy - 45, 3)
    g.fillCircle(cx + 7, cy - 45, 3)
    g.fillStyle(0xffffff, 1)
    g.fillCircle(cx - 6, cy - 46, 1)
    g.fillCircle(cx + 8, cy - 46, 1)
    g.fillStyle(0x1a0050, 1)
    g.fillEllipse(cx, cy - 63, 52, 13)
    g.fillStyle(0x2d0080, 1)
    g.fillTriangle(cx, cy - 108, cx - 20, cy - 63, cx + 20, cy - 63)
    g.fillStyle(0xffd700, 1)
    g.fillTriangle(cx, cy - 105, cx - 4, cy - 97, cx + 4, cy - 97)
    g.fillTriangle(cx, cy - 91,  cx - 4, cy - 97, cx + 4, cy - 97)
  }

  // ── Equipment Slots ───────────────────────────────────────────────────────────

  private buildSlots() {
    this.hideSlotTooltip()
    this.slotContainerMap.forEach(c => c.destroy())
    this.slotContainerMap.clear()

    if (!this.connectorGfx) this.drawConnectorLines()

    for (const slotKey of Object.keys(SLOT_POSITIONS) as SlotKey[]) {
      const pos = SLOT_POSITIONS[slotKey]
      this.createSlot(slotKey, pos.x, pos.y)
    }
  }

  private createSlot(slotKey: SlotKey, cx: number, cy: number) {
    const container = this.add.container(cx, cy)
    const half      = SLOT_SIZE / 2
    const item      = this.equipped[slotKey] ?? null

    const gfx = this.add.graphics()
    this.drawSlotGfx(gfx, item, false)
    container.add(gfx)

    const frame = SLOT_ICON_FRAME[slotKey]
    if (!item && frame !== undefined) {
      container.add(
        this.add.image(0, -6, 'armor_icons', frame).setScale(1.5).setAlpha(0.55).setOrigin(0.5, 0.5)
      )
    } else {
      const icon = this.add.text(0, -8, item ? this.displayIcon(item) : SLOT_PLACEHOLDER[slotKey], {
        fontSize: '26px',
      }).setOrigin(0.5, 0.5).setAlpha(item ? 1 : 0.25)
      container.add(icon)
    }

    const labelStr = item ? this.truncate(item.name, 9) : SLOT_LABELS[slotKey]
    const rarHex   = item ? RARITY_COLOR[item.rarity].toString(16).padStart(6, '0') : '555577'
    const label    = this.add.text(0, half - 11, labelStr, {
      fontSize: '9px', fontFamily: 'Arial, sans-serif', color: `#${rarHex}`,
    }).setOrigin(0.5, 0.5)
    container.add(label)

    const hit = this.add.rectangle(0, 0, SLOT_SIZE, SLOT_SIZE, 0, 0)
      .setInteractive({ useHandCursor: true })

    hit.on('pointerover', () => {
      this.drawSlotGfx(gfx, this.equipped[slotKey] ?? null, true)
      const it = this.equipped[slotKey]
      if (it) this.showSlotTooltip(it, slotKey, cx, cy)
    })
    hit.on('pointerout', () => {
      this.drawSlotGfx(gfx, this.equipped[slotKey] ?? null, false)
      this.hideSlotTooltip()
    })
    hit.on('pointerdown', () => {
      this.hideSlotTooltip()
      if (!this.equipped[slotKey]) return
      if (!this.socket?.connected) {
        this.showFeedback('Not connected to the server.')
        return
      }
      this.socket.emit('equipment:unequip', { slot: slotKey, characterId: this.selectedId })
    })
    container.add(hit)

    this.slotContainerMap.set(slotKey, container)
  }

  private showSlotTooltip(item: ClientInventoryItem, slotKey: SlotKey, cx: number, cy: number) {
    this.hideSlotTooltip()

    const rarHex = RARITY_COLOR[item.rarity].toString(16).padStart(6, '0')
    const rarName = item.rarity.charAt(0).toUpperCase() + item.rarity.slice(1)
    const stats: string[] = []
    if (item.baseDamage) stats.push(`Damage: ${item.baseDamage.min}–${item.baseDamage.max}`)
    if (typeof item.baseDefense === 'number') stats.push(`Defense: ${item.baseDefense}`)
    for (const a of item.attributes ?? []) stats.push(`+${a.value} ${this.attrLabel(a.type)}`)
    if (!stats.length) stats.push('No bonuses')

    const rows: { text: string; color: string; size: number; bold?: boolean }[] = [
      { text: `${item.icon}  ${item.name}`, color: '#ffffff', size: 14, bold: true },
      { text: `${rarName}  ·  ${SLOT_LABELS[slotKey]}`, color: `#${rarHex}`, size: 11 },
      ...stats.map(b => ({ text: b, color: '#9be7ff', size: 12 })),
    ]

    const padX = 12, padY = 10, gap = 4
    const texts = rows.map(r => this.add.text(0, 0, r.text, {
      fontSize: `${r.size}px`, fontFamily: 'Arial, sans-serif',
      color: r.color, fontStyle: r.bold ? 'bold' : 'normal',
    }))
    const w = Math.max(...texts.map(t => t.width)) + padX * 2
    const h = texts.reduce((s, t) => s + t.height, 0) + gap * (texts.length - 1) + padY * 2

    let tx = Phaser.Math.Clamp(cx - w / 2, 8, GAME_WIDTH - w - 8)
    let ty = cy - SLOT_SIZE / 2 - h - 10
    if (ty < 8) ty = cy + SLOT_SIZE / 2 + 10

    const c = this.add.container(0, 0).setDepth(300)
    const bg = this.add.graphics()
    bg.fillStyle(0x0c0c1c, 0.97).fillRoundedRect(tx, ty, w, h, 8)
    bg.lineStyle(1, 0x4a4a7a, 1).strokeRoundedRect(tx, ty, w, h, 8)
    c.add(bg)
    let yy = ty + padY
    texts.forEach(t => { t.setPosition(tx + padX, yy); c.add(t); yy += t.height + gap })

    this.slotTooltip = c
  }

  private hideSlotTooltip() {
    this.slotTooltip?.destroy()
    this.slotTooltip = null
  }

  private drawSlotGfx(
    gfx: Phaser.GameObjects.Graphics,
    item: ClientInventoryItem | null,
    hovered: boolean
  ) {
    gfx.clear()
    const half = SLOT_SIZE / 2
    const r    = 8

    if (item) {
      const rarCol = RARITY_COLOR[item.rarity]
      gfx.fillStyle(0x1a1a3a, 1)
      gfx.fillRoundedRect(-half, -half, SLOT_SIZE, SLOT_SIZE, r)
      gfx.lineStyle(hovered ? 3 : 2, hovered ? 0xffffff : 0xffd700, 1)
      gfx.strokeRoundedRect(-half, -half, SLOT_SIZE, SLOT_SIZE, r)
      gfx.lineStyle(1, rarCol, 0.35)
      gfx.strokeRoundedRect(-half + 3, -half + 3, SLOT_SIZE - 6, SLOT_SIZE - 6, r - 2)
    } else {
      const borderCol = hovered ? 0x6666aa : 0x444466
      gfx.fillStyle(0x1a1a3a, 1)
      gfx.fillRoundedRect(-half, -half, SLOT_SIZE, SLOT_SIZE, r)
      gfx.lineStyle(hovered ? 2 : 1.5, borderCol, 0.9)
      gfx.strokeRoundedRect(-half, -half, SLOT_SIZE, SLOT_SIZE, r)
      gfx.lineStyle(1, borderCol, 0.25)
      gfx.strokeRoundedRect(-half + 4, -half + 4, SLOT_SIZE - 8, SLOT_SIZE - 8, r - 2)
    }
  }

  private drawConnectorLines() {
    const lineGfx = this.add.graphics()
    lineGfx.lineStyle(1, 0x252550, 0.8)
    lineGfx.setDepth(-1)
    this.connectorGfx = lineGfx

    const half = SLOT_SIZE / 2
    for (const slotKey of Object.keys(SLOT_POSITIONS) as SlotKey[]) {
      const slot = SLOT_POSITIONS[slotKey]
      const onLeft = slot.x < DOLL_CX
      const innerX = slot.x + (onLeft ? half : -half)
      const dollX  = DOLL_CX + (onLeft ? -42 : 42)
      lineGfx.lineBetween(innerX, slot.y, dollX, slot.y)
    }
  }

  // ── Inventory list (shared bag) ────────────────────────────────────────────────

  private buildInventoryList() {
    if (this.inventoryContainer) this.inventoryContainer.destroy()
    this.inventoryContainer = this.add.container(0, 0)

    if (this.gearItems.length === 0) {
      this.inventoryContainer.add(
        this.add.text(
          MID_PANEL_X + MID_PANEL_W / 2,
          PANEL_Y + PANEL_H / 2,
          this.sheet ? 'No equippable gear in your bag' : 'Loading…',
          { fontSize: '14px', fontFamily: 'Arial, sans-serif', color: '#333355' }
        ).setOrigin(0.5, 0.5)
      )
      return
    }

    const listH        = PANEL_H - 50
    const visibleCount = Math.floor(listH / (ITEM_ROW_H + 5))
    const maxOffset    = Math.max(0, this.gearItems.length - visibleCount)
    this.scrollOffset  = Math.min(this.scrollOffset, maxOffset)

    const visible = this.gearItems.slice(this.scrollOffset, this.scrollOffset + visibleCount)
    let yOff = 0
    for (const item of visible) {
      this.createInventoryRow(item, yOff)
      yOff += ITEM_ROW_H + 5
    }

    if (maxOffset > 0) {
      this.inventoryContainer.add(
        this.add.text(MID_PANEL_X + MID_PANEL_W / 2, PANEL_Y + PANEL_H - 8,
          `▲▼  ${this.scrollOffset + 1}–${this.scrollOffset + visible.length} of ${this.gearItems.length}`, {
          fontSize: '10px', fontFamily: 'Arial, sans-serif', color: '#555577',
        }).setOrigin(0.5, 1)
      )
    }
  }

  private createInventoryRow(item: ClientInventoryItem, yOff: number) {
    const rowX = MID_PANEL_X + 8
    const rowY = PANEL_Y + 40 + yOff
    const rowW = MID_PANEL_W - 16
    const rarCol = RARITY_COLOR[item.rarity]

    const rowBg = this.add.graphics()
    const drawRowBg = (hovered: boolean) => {
      rowBg.clear()
      rowBg.fillStyle(hovered ? 0x1a1a3e : 0x0d0d26, hovered ? 0.95 : 0.9)
      rowBg.fillRoundedRect(rowX, rowY, rowW, ITEM_ROW_H, 6)
      rowBg.lineStyle(1, hovered ? 0x4444aa : 0x1e1e44, 1)
      rowBg.strokeRoundedRect(rowX, rowY, rowW, ITEM_ROW_H, 6)
      rowBg.fillStyle(rarCol, 0.8)
      rowBg.fillRect(rowX, rowY + 4, 3, ITEM_ROW_H - 8)
    }
    drawRowBg(false)
    this.inventoryContainer.add(rowBg)

    const iconBg = this.add.graphics()
    iconBg.fillStyle(0x1a1a3a, 1)
    iconBg.fillRoundedRect(rowX + 8, rowY + 6, 48, 48, 5)
    iconBg.lineStyle(1, rarCol, 0.55)
    iconBg.strokeRoundedRect(rowX + 8, rowY + 6, 48, 48, 5)
    this.inventoryContainer.add(iconBg)

    this.inventoryContainer.add(
      this.add.text(rowX + 32, rowY + 30, this.displayIcon(item), { fontSize: '24px' }).setOrigin(0.5, 0.5)
    )

    const slotKey    = this.slotForItem(item)
    const rarName    = item.rarity.charAt(0).toUpperCase() + item.rarity.slice(1)
    const rarHex     = rarCol.toString(16).padStart(6, '0')
    const slotLabel  = slotKey ? SLOT_LABELS[slotKey] : item.itemType
    const xpNote     =
      (item.requiredLevel ?? 0) > 0 ? `  ·  Lv ${item.requiredLevel}`
      : (item.xpRequired ?? 0) > 0 ? `  ·  ${item.xpRequired} XP`
      : ''
    const textX = rowX + 64
    const nameText   = this.add.text(textX, rowY + 8,  this.truncate(item.name, 22), {
      fontSize: '13px', fontFamily: 'Georgia, serif', color: '#dde0ff', fontStyle: 'bold',
    })
    const typeText   = this.add.text(textX, rowY + 26, `${rarName}  ·  ${slotLabel}${xpNote}`, {
      fontSize: '10px', fontFamily: 'Arial, sans-serif', color: `#${rarHex}`,
    })
    const statsText  = this.add.text(textX, rowY + 42, this.truncate(this.itemBonusSummary(item), 30), {
      fontSize: '10px', fontFamily: 'Arial, sans-serif', color: '#7799bb',
    })
    this.inventoryContainer.add([nameText, typeText, statsText])

    // Equip button
    const btnW = 64
    const btnH = 38
    const btnX = rowX + rowW - btnW - 8
    const btnY = rowY + 13
    const btnGfx = this.add.graphics()
    this.inventoryContainer.add(btnGfx)

    const drawBtn = (col: number) => {
      btnGfx.clear()
      btnGfx.fillStyle(col, 1)
      btnGfx.fillRoundedRect(btnX, btnY, btnW, btnH, 6)
      btnGfx.lineStyle(1, 0xffd700, 0.7)
      btnGfx.strokeRoundedRect(btnX, btnY, btnW, btnH, 6)
    }
    drawBtn(0x2a2a4a)

    const btnLabel = this.add.text(btnX + btnW / 2, btnY + btnH / 2, 'Equip', {
      fontSize: '12px', fontFamily: 'Arial, sans-serif', color: '#ffd700', fontStyle: 'bold',
    }).setOrigin(0.5, 0.5)
    this.inventoryContainer.add(btnLabel)

    const rowHit = this.add.rectangle(
      rowX + (rowW - btnW - 8) / 2,
      rowY + ITEM_ROW_H / 2,
      rowW - btnW - 12,
      ITEM_ROW_H,
      0, 0
    ).setInteractive({ useHandCursor: false })
    rowHit.on('pointerover', () => drawRowBg(true))
    rowHit.on('pointerout', () => drawRowBg(false))
    this.inventoryContainer.add(rowHit)

    const equipHit = this.add.rectangle(btnX + btnW / 2, btnY + btnH / 2, btnW, btnH, 0, 0)
      .setInteractive({ useHandCursor: true })
    equipHit.on('pointerover', () => drawBtn(0x3a3a6a))
    equipHit.on('pointerout',  () => drawBtn(0x2a2a4a))
    equipHit.on('pointerdown', () => {
      if (!this.socket?.connected) {
        this.showFeedback('Not connected to the server.')
        return
      }
      if (!this.selectedId) {
        this.showFeedback('Select a team member first.')
        return
      }
      this.socket.emit('equipment:equip', { itemId: item.id, characterId: this.selectedId })
    })
    this.inventoryContainer.add(equipHit)
  }

  // ── Stats panel (selected member) ───────────────────────────────────────────────

  private buildStatsPanel() {
    if (this.statsContainer) this.statsContainer.destroy()
    this.statsContainer = this.add.container(0, 0)

    const panX = RIGHT_PANEL_X + 10
    const panW = RIGHT_PANEL_W - 20
    let yOff   = PANEL_Y + 42

    const stats = this.stats
    if (!stats) {
      this.statsContainer.add(
        this.add.text(panX + panW / 2, yOff + 20, 'Loading stats…', {
          fontSize: '13px', fontFamily: 'Arial, sans-serif', color: '#444466',
        }).setOrigin(0.5, 0)
      )
      return
    }

    yOff = this.renderStatSection('Attributes', stats.attributes, panX, panW, yOff)
    yOff += 6
    yOff = this.renderStatSection('Combat Stats', stats.derived, panX, panW, yOff)
  }

  private renderStatSection(
    title: string,
    rows: ClientStatRow[],
    panX: number,
    panW: number,
    startY: number,
  ): number {
    let yOff = startY

    this.statsContainer.add(
      this.add.text(panX + 2, yOff, title, {
        fontSize: '12px', fontFamily: 'Georgia, serif', color: '#ffd700', fontStyle: 'bold',
      }).setOrigin(0, 0)
    )
    yOff += 16
    const dv = this.add.graphics()
    dv.lineStyle(1, 0x2a2a5a, 1)
    dv.lineBetween(panX, yOff, panX + panW, yOff)
    this.statsContainer.add(dv)
    yOff += 8

    const maxTotal = Math.max(1, ...rows.map(r => r.total))
    const barMaxW  = panW - 8

    for (const row of rows) {
      this.renderStatRow(row, panX, panW, barMaxW, maxTotal, yOff)
      yOff += 34
    }
    return yOff
  }

  private renderStatRow(
    row: ClientStatRow,
    panX: number,
    panW: number,
    barMaxW: number,
    maxTotal: number,
    yOff: number,
  ) {
    const pct = (v: number) => (row.isPercent ? `${v}%` : `${v}`)

    this.statsContainer.add(
      this.add.text(panX + 2, yOff, row.label, {
        fontSize: '12px', fontFamily: 'Arial, sans-serif', color: '#bbbbdd',
      }).setOrigin(0, 0)
    )

    const valX = panX + panW - 2
    const totalText = this.add.text(valX, yOff, pct(row.total), {
      fontSize: '13px', fontFamily: 'Arial, sans-serif', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(1, 0)
    this.statsContainer.add(totalText)

    if (row.gear !== 0) {
      const gearStr = `${row.gear > 0 ? '+' : ''}${pct(row.gear)}`
      const gearText = this.add.text(valX - totalText.width - 6, yOff, `(${gearStr})`, {
        fontSize: '11px', fontFamily: 'Arial, sans-serif',
        color: row.gear > 0 ? '#44ff88' : '#ff6655',
      }).setOrigin(1, 0)
      this.statsContainer.add(gearText)
    }

    const barY    = yOff + 18
    const barH    = 6
    const baseFrac = Math.max(0, Math.min(1, row.base / maxTotal))
    const totFrac  = Math.max(0, Math.min(1, row.total / maxTotal))
    const baseW    = baseFrac * barMaxW
    const totW     = totFrac * barMaxW

    const bar = this.add.graphics()
    bar.fillStyle(0x1e1e40, 1)
    bar.fillRoundedRect(panX + 2, barY, barMaxW, barH, 3)
    if (row.gear > 0 && totW > baseW) {
      bar.fillStyle(0x33cc66, 1)
      bar.fillRoundedRect(panX + 2, barY, Math.max(totW, 2), barH, 3)
    } else if (row.gear < 0 && baseW > totW) {
      bar.fillStyle(0xcc4444, 1)
      bar.fillRoundedRect(panX + 2, barY, Math.max(baseW, 2), barH, 3)
    }
    bar.fillStyle(0x3366cc, 1)
    bar.fillRoundedRect(panX + 2, barY, Math.max(Math.min(baseW, totW), 2), barH, 3)
    this.statsContainer.add(bar)
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  private truncate(str: string, maxChars: number): string {
    return str.length > maxChars ? str.slice(0, maxChars - 1) + '…' : str
  }
}
