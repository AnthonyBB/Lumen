// ============================================================
// EquipmentScene — the paper-doll gear screen.
//
// SECURITY: this scene only RENDERS the server-pushed inventory
// snapshot (InventoryStore, fed by 'inventory:data' /
// 'inventory:updated') and requests mutations via
// 'equipment:equip' / 'equipment:unequip'.  Ownership, XP gates
// and slot assignment are all enforced server-side; nothing here
// computes an equip result locally.
// ============================================================

import Phaser from 'phaser'
import type { Socket } from 'socket.io-client'
import { GAME_WIDTH, GAME_HEIGHT } from '../constants'
import {
  InventoryStore,
  type ClientInventoryItem,
  type ClientPlayerInventory,
} from '../systems/InventoryStore'
import { StatsStore, type ClientStats, type ClientStatRow } from '../systems/StatsStore'
import type { EquipSlot } from '../data/equipmentGen'

// ── Types ─────────────────────────────────────────────────────────────────────

type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'
type SlotKey =
  | 'mainHand' | 'offHand' | 'helm' | 'earring' | 'ring1' | 'ring2'
  | 'belt' | 'shoes' | 'gloves' | 'necklace' | 'chest' | 'legs'

// ── Constants ─────────────────────────────────────────────────────────────────

const RARITY_COLOR: Record<Rarity, number> = {
  common:    0xaaaaaa,
  uncommon:  0x44cc44,
  rare:      0x4488ff,
  epic:      0xcc44ff,
  legendary: 0xffaa00,
}

const SLOT_LABELS: Record<SlotKey, string> = {
  mainHand: 'Main Hand', offHand: 'Off Hand', helm: 'Helm',
  earring:  'Earring',   ring1:   'Ring 1',   ring2: 'Ring 2',
  belt:     'Belt',      shoes:   'Boots',    gloves: 'Gloves',
  necklace: 'Necklace',  chest:   'Chest',    legs:   'Legs',
}

/**
 * Display copy of the server's EquipSlot → slot-key mapping
 * (server/socket/handlers.ts EQUIP_SLOT_TO_KEY).  Used only to show which
 * slot a bag item would go to — the server derives the real slot itself.
 */
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

/**
 * Display-only slot lookup for LEGACY ItemDatabase gear (worn_sword, etc.).
 * Mirrors the slots defined server-side in ItemDatabase.ts.  The server is
 * still authoritative — this only drives which bag items show as equippable
 * and which slot label to render.
 */
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

// Paper-doll layout: the wizard sits in the centre, slots flank it in two
// even columns (armour left, weapons/accessories right) — aligned rows that
// stay clear of the panel edges.
const DOLL_CX = 190
const DOLL_CY = 360
const COL_L = DOLL_CX - 130
const COL_R = DOLL_CX + 130
const ROW0  = 188
const ROWH  = 84
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

/** Dim placeholder glyph shown in an empty slot. */
const SLOT_PLACEHOLDER: Record<SlotKey, string> = {
  mainHand: '🗡️', offHand: '🛡️', helm: '⛑️', earring: '💎',
  ring1: '💍', ring2: '💍', belt: '🔗', shoes: '👢',
  gloves: '🧤', necklace: '📿', chest: '🦺', legs: '👖',
}

/** Empty-slot placeholders that use a real RPG icon from the 'armor_icons'
 *  spritesheet (32×32, 18 cols → frame = row*18 + col) instead of an emoji.
 *  Frames are chosen to be CLEAN single pieces — the old helm/legs/boots frames
 *  (1/21/57) landed on paired/blobby cells that read as broken/"disjointed".
 *  helm=77 (skull helm) · chest=20 · legs=31 · boots=58 · rings=186 (the pack has
 *  no literal ring, so a blue gem stands in for jewellery). */
const SLOT_ICON_FRAME: Partial<Record<SlotKey, number>> = {
  helm: 77, chest: 20, legs: 31, shoes: 58, ring1: 186, ring2: 186,
}

// Layout
const LEFT_PANEL_X = 0
const LEFT_PANEL_W = 380
const MID_PANEL_X  = 385
const MID_PANEL_W  = 520
const RIGHT_PANEL_X = 910
const RIGHT_PANEL_W = 370
const PANEL_Y       = 60
const PANEL_H       = GAME_HEIGHT - 80
const SLOT_SIZE     = 70
const ITEM_ROW_H    = 64

// ── Scene ─────────────────────────────────────────────────────────────────────

export class EquipmentScene extends Phaser.Scene {
  private socket: Socket | null = null

  // Server-reported state — only ever replaced by InventoryStore pushes
  private equipped: Partial<Record<SlotKey, ClientInventoryItem>> = {}
  private gearItems: ClientInventoryItem[] = []
  // Server-reported stats — only ever replaced by StatsStore pushes
  private stats: ClientStats | null = null

  private slotContainerMap: Map<SlotKey, Phaser.GameObjects.Container> = new Map()
  private connectorGfx: Phaser.GameObjects.Graphics | null = null
  /** Floating tooltip shown while hovering an equipped slot. */
  private slotTooltip: Phaser.GameObjects.Container | null = null
  private inventoryContainer!: Phaser.GameObjects.Container
  private statsContainer!:     Phaser.GameObjects.Container
  private feedbackText!:       Phaser.GameObjects.Text
  private selectedItem: ClientInventoryItem | null = null
  private scrollOffset = 0

  private iKey!:   Phaser.Input.Keyboard.Key
  private escKey!: Phaser.Input.Keyboard.Key

  constructor() {
    super({ key: 'EquipmentScene' })
  }

  create() {
    this.socket = (window as typeof window & { __lumenSocket?: Socket }).__lumenSocket ?? null
    this.selectedItem = null
    this.scrollOffset = 0
    this.slotContainerMap.clear()
    this.connectorGfx = null

    this.drawBackground()
    this.drawHeader()
    this.drawFooter()
    this.drawLeftPanel()
    this.drawMidPanel()
    this.drawRightPanel()

    this.feedbackText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 44, '', {
      fontSize: '14px', fontFamily: 'Arial, sans-serif', color: '#ff8866',
      backgroundColor: '#000000aa', padding: { x: 10, y: 5 },
    }).setOrigin(0.5, 0.5).setDepth(50).setVisible(false)

    // ── Server state is the only source of truth ──────────────────────────
    // The scene reacts to server-pushed snapshots through TWO channels for
    // robustness, because in dev (React StrictMode double-mount / reconnects)
    // the shared stores can end up bound to a different live socket than
    // window.__lumenSocket:
    //   1. Direct listeners on `this.socket` — the exact socket equip/unequip
    //      intents go out on, so we always hear the reply to our own action.
    //   2. The shared InventoryStore / StatsStore — covers the case where the
    //      server answers on the store's socket instead.
    // Whichever fires, applyInventory/applyStats rebuild idempotently.
    const onInventory = (data: unknown) => this.applyInventory(data as ClientPlayerInventory)
    const onStats = (data: unknown) => this.applyStats(data as ClientStats)
    const onError = (err: { message?: string }) => {
      if (err?.message) this.showFeedback(err.message)
    }
    this.socket?.on('inventory:data', onInventory)
    this.socket?.on('inventory:updated', onInventory)
    this.socket?.on('stats:update', onStats)
    this.socket?.on('error', onError)

    // Seed this.stats first so the first inventory paint shows real stats, then
    // subscribe (onUpdate fires immediately with any cached snapshot).
    this.stats = StatsStore.get()
    const unsubStats = StatsStore.onUpdate((s) => this.applyStats(s))
    const unsubInv = InventoryStore.onUpdate((inv) => this.applyInventory(inv))

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.socket?.off('inventory:data', onInventory)
      this.socket?.off('inventory:updated', onInventory)
      this.socket?.off('stats:update', onStats)
      this.socket?.off('error', onError)
      unsubInv()
      unsubStats()
    })

    // Draw a base/loading state if no inventory snapshot exists yet, then ask
    // the server for fresh copies (the subscriptions above apply every reply).
    if (!InventoryStore.get()) this.rebuildDynamic()
    this.socket?.emit('inventory:get')
    this.socket?.emit('stats:get')

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

  /** Ask the server (on the socket we just emitted an intent on) for a fresh
   *  inventory + stats snapshot. The reply returns on this same socket, where
   *  the direct listeners apply it — a guaranteed refresh after equip/unequip. */
  private requestServerState() {
    this.socket?.emit('inventory:get')
    this.socket?.emit('stats:get')
  }

  // ── Server snapshot → render state ──────────────────────────────────────────

  private applyInventory(inv: ClientPlayerInventory) {
    this.equipped = (inv.equipment ?? {}) as Partial<Record<SlotKey, ClientInventoryItem>>
    // Both generated gear (equipmentGen) AND legacy ItemDatabase gear are equippable.
    this.gearItems = (inv.items ?? []).filter(i => isEquippable(i))
    if (this.selectedItem && !this.gearItems.some(i => i.id === this.selectedItem!.id)) {
      this.selectedItem = null
    }
    this.rebuildDynamic()
  }

  private applyStats(stats: ClientStats) {
    this.stats = stats
    this.buildStatsPanel()
  }

  private rebuildDynamic() {
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

  /** Short human-readable bonus summary for a bag item (crafted or legacy). */
  private itemBonusSummary(item: ClientInventoryItem): string {
    const base: string[] = []
    if (item.baseDamage) base.push(`${item.baseDamage.min}–${item.baseDamage.max} dmg`)
    if (typeof item.baseDefense === 'number') base.push(`${item.baseDefense} def`)
    if (base.length || (item.attributes && item.attributes.length)) {
      const affixes = (item.attributes ?? []).map(a => `+${a.value} ${this.attrLabel(a.type)}`)
      return [...base, ...affixes].join('  ')
    }
    // Legacy items carry raw {attack,defense,hp,xp} stats.
    return Object.entries(item.stats)
      .filter((e): e is [string, number] => typeof e[1] === 'number' && e[1] !== 0)
      .map(([k, v]) => `+${v} ${k.charAt(0).toUpperCase() + k.slice(1)}`)
      .join('  ')
  }

  /** Display icon for an item (its own rolled icon). */
  private displayIcon(item: ClientInventoryItem): string {
    return item.icon
  }

  /** Pretty label for a generated-item attribute type. */
  private attrLabel(type: string): string {
    return type
      .split('_')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
  }

  // ── Background ───────────────────────────────────────────────────────────────

  private drawBackground() {
    const bg = this.add.graphics()
    bg.fillStyle(0x0a0a1e, 1)
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)
    // Star field
    const rng = new Phaser.Math.RandomDataGenerator(['equip'])
    bg.fillStyle(0xffffff, 0.45)
    for (let i = 0; i < 80; i++) {
      bg.fillRect(rng.integerInRange(0, GAME_WIDTH), rng.integerInRange(0, GAME_HEIGHT), 1, 1)
    }
  }

  // ── Header ────────────────────────────────────────────────────────────────────

  private drawHeader() {
    const hg = this.add.graphics()
    hg.fillStyle(0x12122e, 1)
    hg.fillRect(0, 0, GAME_WIDTH, 58)
    hg.lineStyle(1, 0x3333aa, 0.8)
    hg.lineBetween(0, 58, GAME_WIDTH, 58)
    // Gold divider lines
    hg.lineStyle(1, 0xffd700, 0.5)
    hg.lineBetween(40, 29, 430, 29)
    hg.lineBetween(850, 29, GAME_WIDTH - 40, 29)
    // Diamond accents
    for (const dx of [430, 850]) {
      hg.fillStyle(0xffd700, 0.9)
      hg.fillTriangle(dx, 22, dx - 7, 29, dx, 36)
      hg.fillTriangle(dx, 22, dx + 7, 29, dx, 36)
    }
    this.add.text(GAME_WIDTH / 2, 29, 'E Q U I P M E N T', {
      fontSize: '22px', fontFamily: 'Georgia, serif',
      color: '#ffd700', fontStyle: 'bold',
    }).setOrigin(0.5, 0.5)
  }

  // ── Footer ────────────────────────────────────────────────────────────────────

  private drawFooter() {
    const fg = this.add.graphics()
    fg.fillStyle(0x12122e, 1)
    fg.fillRect(0, GAME_HEIGHT - 26, GAME_WIDTH, 26)
    fg.lineStyle(1, 0x3333aa, 0.8)
    fg.lineBetween(0, GAME_HEIGHT - 26, GAME_WIDTH, GAME_HEIGHT - 26)
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 13, 'Press  I  or  Escape  to close', {
      fontSize: '12px', fontFamily: 'Arial, sans-serif', color: '#555577',
    }).setOrigin(0.5, 0.5)
  }

  // ── Panel frames ─────────────────────────────────────────────────────────────

  private drawLeftPanel() {
    const g = this.add.graphics()
    g.fillStyle(0x12122e, 1)
    g.fillRoundedRect(LEFT_PANEL_X + 4, PANEL_Y, LEFT_PANEL_W - 8, PANEL_H, 10)
    g.lineStyle(1, 0x2a2a5a, 1)
    g.strokeRoundedRect(LEFT_PANEL_X + 4, PANEL_Y, LEFT_PANEL_W - 8, PANEL_H, 10)
    this.add.text(LEFT_PANEL_X + LEFT_PANEL_W / 2, PANEL_Y + 14, 'Character', {
      fontSize: '12px', fontFamily: 'Arial, sans-serif', color: '#7777aa',
    }).setOrigin(0.5, 0)
    this.drawCharacterDoll()
  }

  private drawMidPanel() {
    const g = this.add.graphics()
    g.fillStyle(0x12122e, 1)
    g.fillRoundedRect(MID_PANEL_X, PANEL_Y, MID_PANEL_W, PANEL_H, 10)
    g.lineStyle(1, 0x2a2a5a, 1)
    g.strokeRoundedRect(MID_PANEL_X, PANEL_Y, MID_PANEL_W, PANEL_H, 10)
    this.add.text(MID_PANEL_X + MID_PANEL_W / 2, PANEL_Y + 14, 'Equippable Gear', {
      fontSize: '12px', fontFamily: 'Arial, sans-serif', color: '#7777aa',
    }).setOrigin(0.5, 0)
    const dg = this.add.graphics()
    dg.lineStyle(1, 0x2a2a5a, 1)
    dg.lineBetween(MID_PANEL_X + 12, PANEL_Y + 34, MID_PANEL_X + MID_PANEL_W - 12, PANEL_Y + 34)
  }

  private drawRightPanel() {
    const g = this.add.graphics()
    g.fillStyle(0x12122e, 1)
    g.fillRoundedRect(RIGHT_PANEL_X + 4, PANEL_Y, RIGHT_PANEL_W - 8, PANEL_H, 10)
    g.lineStyle(1, 0x2a2a5a, 1)
    g.strokeRoundedRect(RIGHT_PANEL_X + 4, PANEL_Y, RIGHT_PANEL_W - 8, PANEL_H, 10)
    this.add.text(RIGHT_PANEL_X + RIGHT_PANEL_W / 2, PANEL_Y + 14, 'Stats', {
      fontSize: '12px', fontFamily: 'Arial, sans-serif', color: '#7777aa',
    }).setOrigin(0.5, 0)
    const dg = this.add.graphics()
    dg.lineStyle(1, 0x2a2a5a, 1)
    dg.lineBetween(RIGHT_PANEL_X + 12, PANEL_Y + 34, RIGHT_PANEL_X + RIGHT_PANEL_W - 12, PANEL_Y + 34)
  }

  // ── Character paper doll ───────────────────────────────────────────────────────

  /** The player's own front-facing character sprite (same art as the overworld
   *  avatar), centred in the Character panel. Falls back to a drawn figure if
   *  the sprite sheet somehow isn't loaded. */
  private drawCharacterDoll() {
    const cx = DOLL_CX
    const cy = DOLL_CY

    // Soft shadow under the feet.
    const shadow = this.add.graphics()
    shadow.fillStyle(0x000000, 0.18)
    shadow.fillEllipse(cx, cy + 112, 92, 16)

    if (this.textures.exists('character_idle')) {
      const hero = this.add.sprite(cx, cy, 'character_idle', 12).setScale(5)
      if (this.anims.exists('idle_down')) hero.play('idle_down')
      return
    }

    // ── Fallback: the old drawn wizard figure ───────────────────────────────
    const g  = this.add.graphics()

    // Shadow at feet
    g.fillStyle(0x000000, 0.18)
    g.fillEllipse(cx, cy + 188, 76, 14)

    // Shoes / feet
    g.fillStyle(0x553322, 1)
    g.fillEllipse(cx - 14, cy + 184, 26, 11)
    g.fillEllipse(cx + 14, cy + 184, 26, 11)

    // Robe body
    g.fillStyle(0x4b0082, 1)
    g.fillRect(cx - 24, cy - 8, 48, 150)
    // Robe flare
    g.fillStyle(0x3a006f, 1)
    g.fillTriangle(cx - 24, cy + 142, cx - 44, cy + 192, cx - 4, cy + 142)
    g.fillTriangle(cx + 24, cy + 142, cx + 44, cy + 192, cx + 4, cy + 142)
    // Highlight stripe
    g.fillStyle(0x7b2fc4, 0.3)
    g.fillRect(cx - 5, cy - 8, 9, 148)

    // Belt
    g.fillStyle(0xffd700, 1)
    g.fillRect(cx - 24, cy + 52, 48, 7)
    g.fillStyle(0xffee88, 1)
    g.fillRect(cx - 6, cy + 51, 12, 9)
    g.lineStyle(1, 0x886600, 1)
    g.strokeRect(cx - 6, cy + 51, 12, 9)

    // Arms
    g.fillStyle(0x4b0082, 1)
    g.fillRect(cx - 40, cy - 8, 16, 88)
    g.fillRect(cx + 24, cy - 8, 16, 88)
    // Hands
    g.fillStyle(0xffe0b2, 1)
    g.fillCircle(cx - 32, cy + 86, 9)
    g.fillCircle(cx + 32, cy + 86, 9)

    // Neck
    g.fillStyle(0xffe0b2, 1)
    g.fillRect(cx - 8, cy - 20, 16, 14)

    // Head
    g.fillCircle(cx, cy - 42, 23)
    // Beard
    g.fillStyle(0xc8a86b, 0.55)
    g.fillRect(cx - 10, cy - 22, 20, 7)
    // Eyes
    g.fillStyle(0x1a1a2e, 1)
    g.fillCircle(cx - 7, cy - 45, 3)
    g.fillCircle(cx + 7, cy - 45, 3)
    g.fillStyle(0xffffff, 1)
    g.fillCircle(cx - 6, cy - 46, 1)
    g.fillCircle(cx + 8, cy - 46, 1)

    // Hat brim
    g.fillStyle(0x1a0050, 1)
    g.fillEllipse(cx, cy - 63, 52, 13)
    // Hat cone
    g.fillStyle(0x2d0080, 1)
    g.fillTriangle(cx, cy - 108, cx - 20, cy - 63, cx + 20, cy - 63)
    // Hat star
    g.fillStyle(0xffd700, 1)
    g.fillTriangle(cx, cy - 105, cx - 4, cy - 97, cx + 4, cy - 97)
    g.fillTriangle(cx, cy - 91,  cx - 4, cy - 97, cx + 4, cy - 97)

    // Staff
    g.fillStyle(0x8b6914, 1)
    g.fillRect(cx + 48, cy - 90, 5, 178)
    g.fillStyle(0x00ccff, 0.9)
    g.fillCircle(cx + 50, cy - 93, 8)
    g.fillStyle(0xffffff, 0.4)
    g.fillCircle(cx + 48, cy - 96, 3)
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

    // Slot background gfx
    const gfx = this.add.graphics()
    this.drawSlotGfx(gfx, item, false)
    container.add(gfx)

    // Item icon: the server item's emoji when equipped; otherwise a dim
    // placeholder — a real RPG icon sprite for the slots in SLOT_ICON_FRAME
    // (helm/chest/legs/boots), else an emoji.
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

    // Label
    const labelStr = item ? this.truncate(item.name, 9) : SLOT_LABELS[slotKey]
    const rarHex   = item ? RARITY_COLOR[item.rarity].toString(16).padStart(6, '0') : '555577'
    const label    = this.add.text(0, half - 11, labelStr, {
      fontSize: '9px', fontFamily: 'Arial, sans-serif', color: `#${rarHex}`,
    }).setOrigin(0.5, 0.5)
    container.add(label)

    // Hit zone
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
      // Request only — the server validates and pushes the updated inventory
      this.hideSlotTooltip()
      if (!this.equipped[slotKey]) return
      if (!this.socket?.connected) {
        this.showFeedback('Not connected to the server.')
        return
      }
      this.socket.emit('equipment:unequip', { slot: slotKey })
      this.requestServerState()   // pull fresh state back on THIS socket
    })
    container.add(hit)

    this.slotContainerMap.set(slotKey, container)
  }

  /** Floating popup with an equipped item's name, rarity, slot and bonuses. */
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

    // Position above the slot, clamped on-screen; flip below if it would clip the top.
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
      // Rarity inner rim
      gfx.lineStyle(1, rarCol, 0.35)
      gfx.strokeRoundedRect(-half + 3, -half + 3, SLOT_SIZE - 6, SLOT_SIZE - 6, r - 2)
    } else {
      const borderCol = hovered ? 0x6666aa : 0x444466
      gfx.fillStyle(0x1a1a3a, 1)
      gfx.fillRoundedRect(-half, -half, SLOT_SIZE, SLOT_SIZE, r)
      gfx.lineStyle(hovered ? 2 : 1.5, borderCol, 0.9)
      gfx.strokeRoundedRect(-half, -half, SLOT_SIZE, SLOT_SIZE, r)
      // Dashed inner
      gfx.lineStyle(1, borderCol, 0.25)
      gfx.strokeRoundedRect(-half + 4, -half + 4, SLOT_SIZE - 8, SLOT_SIZE - 8, r - 2)
    }
  }

  private drawConnectorLines() {
    const lineGfx = this.add.graphics()
    lineGfx.lineStyle(1, 0x252550, 0.8)
    lineGfx.setDepth(-1)
    this.connectorGfx = lineGfx

    // A tidy horizontal tick from each slot's inner edge to the doll silhouette.
    const half = SLOT_SIZE / 2
    for (const slotKey of Object.keys(SLOT_POSITIONS) as SlotKey[]) {
      const slot = SLOT_POSITIONS[slotKey]
      const onLeft = slot.x < DOLL_CX
      const innerX = slot.x + (onLeft ? half : -half)
      const dollX  = DOLL_CX + (onLeft ? -46 : 46)
      lineGfx.lineBetween(innerX, slot.y, dollX, slot.y)
    }
  }

  // ── Inventory list ────────────────────────────────────────────────────────────

  private buildInventoryList() {
    if (this.inventoryContainer) this.inventoryContainer.destroy()
    this.inventoryContainer = this.add.container(0, 0)

    if (this.gearItems.length === 0) {
      this.inventoryContainer.add(
        this.add.text(
          MID_PANEL_X + MID_PANEL_W / 2,
          PANEL_Y + PANEL_H / 2,
          InventoryStore.get() ? 'No equippable gear in your bag' : 'Loading…',
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

    // Row bg
    const rowBg = this.add.graphics()
    const drawRowBg = (hovered: boolean) => {
      rowBg.clear()
      rowBg.fillStyle(hovered ? 0x1a1a3e : 0x0d0d26, hovered ? 0.95 : 0.9)
      rowBg.fillRoundedRect(rowX, rowY, rowW, ITEM_ROW_H, 6)
      rowBg.lineStyle(1, hovered ? 0x4444aa : 0x1e1e44, 1)
      rowBg.strokeRoundedRect(rowX, rowY, rowW, ITEM_ROW_H, 6)
      // Rarity stripe
      rowBg.fillStyle(rarCol, 0.8)
      rowBg.fillRect(rowX, rowY + 4, 3, ITEM_ROW_H - 8)
    }
    drawRowBg(false)
    this.inventoryContainer.add(rowBg)

    // Icon box
    const iconBg = this.add.graphics()
    iconBg.fillStyle(0x1a1a3a, 1)
    iconBg.fillRoundedRect(rowX + 8, rowY + 6, 52, 52, 5)
    iconBg.lineStyle(1, rarCol, 0.55)
    iconBg.strokeRoundedRect(rowX + 8, rowY + 6, 52, 52, 5)
    this.inventoryContainer.add(iconBg)

    this.inventoryContainer.add(
      this.add.text(rowX + 34, rowY + 32, this.displayIcon(item), { fontSize: '26px' }).setOrigin(0.5, 0.5)
    )

    // Text info
    const slotKey    = this.slotForItem(item)
    const rarName    = item.rarity.charAt(0).toUpperCase() + item.rarity.slice(1)
    const rarHex     = rarCol.toString(16).padStart(6, '0')
    const slotLabel  = slotKey ? SLOT_LABELS[slotKey] : item.itemType
    const xpNote     = (item.xpRequired ?? 0) > 0 ? `  ·  needs ${item.xpRequired} XP` : ''
    const nameText   = this.add.text(rowX + 70, rowY + 9,  item.name, {
      fontSize: '14px', fontFamily: 'Georgia, serif', color: '#dde0ff', fontStyle: 'bold',
    })
    const typeText   = this.add.text(rowX + 70, rowY + 27, `${rarName}  ·  ${slotLabel}${xpNote}`, {
      fontSize: '11px', fontFamily: 'Arial, sans-serif', color: `#${rarHex}`,
    })
    const statsText  = this.add.text(rowX + 70, rowY + 43, this.itemBonusSummary(item), {
      fontSize: '11px', fontFamily: 'Arial, sans-serif', color: '#7799bb',
    })
    this.inventoryContainer.add([nameText, typeText, statsText])

    // Equip button
    const btnX = rowX + rowW - 80
    const btnY = rowY + 12
    const btnW = 72
    const btnH = 40
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
      fontSize: '13px', fontFamily: 'Arial, sans-serif', color: '#ffd700', fontStyle: 'bold',
    }).setOrigin(0.5, 0.5)
    this.inventoryContainer.add(btnLabel)

    // Row hover hit (excludes equip button zone)
    const rowHit = this.add.rectangle(
      rowX + (rowW - btnW - 8) / 2,
      rowY + ITEM_ROW_H / 2,
      rowW - btnW - 12,
      ITEM_ROW_H,
      0, 0
    ).setInteractive({ useHandCursor: false })
    rowHit.on('pointerover', () => {
      drawRowBg(true)
      this.selectedItem = item
      this.buildStatsPanel()
    })
    rowHit.on('pointerout', () => {
      drawRowBg(false)
      if (this.selectedItem?.id === item.id) {
        this.selectedItem = null
        this.buildStatsPanel()
      }
    })
    this.inventoryContainer.add(rowHit)

    // Equip hit zone — emits a request; the server validates ownership, the
    // XP gate and the destination slot, then pushes the updated inventory.
    const equipHit = this.add.rectangle(btnX + btnW / 2, btnY + btnH / 2, btnW, btnH, 0, 0)
      .setInteractive({ useHandCursor: true })
    equipHit.on('pointerover', () => drawBtn(0x3a3a6a))
    equipHit.on('pointerout',  () => drawBtn(0x2a2a4a))
    equipHit.on('pointerdown', () => {
      if (!this.socket?.connected) {
        this.showFeedback('Not connected to the server.')
        return
      }
      this.socket.emit('equipment:equip', { itemId: item.id })
      this.requestServerState()   // pull fresh state back on THIS socket
    })
    this.inventoryContainer.add(equipHit)
  }

  // ── Stats panel ───────────────────────────────────────────────────────────────
  // Renders the SERVER-pushed stat breakdown (StatsStore).  Each row shows the
  // base value plus a colored +gear bonus and a two-segment bar (base + bonus).
  // Nothing here is computed for gameplay — it only visualizes server state.

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

    // Unspent allocation reminder (allocate at the Character screen).
    if (stats.unspentPoints > 0) {
      this.statsContainer.add(
        this.add.text(panX + panW / 2, yOff,
          `${stats.unspentPoints} unspent point${stats.unspentPoints === 1 ? '' : 's'} — press C`, {
            fontSize: '11px', fontFamily: 'Arial, sans-serif', color: '#ffcc44',
          }).setOrigin(0.5, 0)
      )
      yOff += 18
    }

    yOff = this.renderStatSection('Attributes', stats.attributes, panX, panW, yOff)
    yOff += 6
    yOff = this.renderStatSection('Combat Stats', stats.derived, panX, panW, yOff)
  }

  /** Render a titled group of stat rows; returns the new y offset. */
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

    // Bar scale: largest total in this section maps to full bar width.
    const maxTotal = Math.max(1, ...rows.map(r => r.total))
    const barMaxW  = panW - 8

    for (const row of rows) {
      this.renderStatRow(row, panX, panW, barMaxW, maxTotal, yOff)
      yOff += 34
    }
    return yOff
  }

  /** One stat row: label, base value (+gear in green), two-segment bar. */
  private renderStatRow(
    row: ClientStatRow,
    panX: number,
    panW: number,
    barMaxW: number,
    maxTotal: number,
    yOff: number,
  ) {
    const pct = (v: number) => (v < 0 ? '' : '') + (row.isPercent ? `${v}%` : `${v}`)

    // Label (left)
    this.statsContainer.add(
      this.add.text(panX + 2, yOff, row.label, {
        fontSize: '12px', fontFamily: 'Arial, sans-serif', color: '#bbbbdd',
      }).setOrigin(0, 0)
    )

    // Value (right): base, then +gear in green when there is a gear bonus.
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

    // Two-segment bar: base segment (blue) + bonus segment (green/red).
    const barY    = yOff + 18
    const barH    = 6
    const baseFrac = Math.max(0, Math.min(1, row.base / maxTotal))
    const totFrac  = Math.max(0, Math.min(1, row.total / maxTotal))
    const baseW    = baseFrac * barMaxW
    const totW     = totFrac * barMaxW

    const bar = this.add.graphics()
    // Track
    bar.fillStyle(0x1e1e40, 1)
    bar.fillRoundedRect(panX + 2, barY, barMaxW, barH, 3)
    // Bonus segment first (full extent), so the base draws on top of its start.
    if (row.gear > 0 && totW > baseW) {
      bar.fillStyle(0x33cc66, 1)
      bar.fillRoundedRect(panX + 2, barY, Math.max(totW, 2), barH, 3)
    } else if (row.gear < 0 && baseW > totW) {
      // Negative gear: show the lost portion in red behind the (shorter) base.
      bar.fillStyle(0xcc4444, 1)
      bar.fillRoundedRect(panX + 2, barY, Math.max(baseW, 2), barH, 3)
    }
    // Base segment (blue) on top.
    bar.fillStyle(0x3366cc, 1)
    bar.fillRoundedRect(panX + 2, barY, Math.max(Math.min(baseW, totW), 2), barH, 3)
    this.statsContainer.add(bar)
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  private truncate(str: string, maxChars: number): string {
    return str.length > maxChars ? str.slice(0, maxChars - 1) + '…' : str
  }
}
