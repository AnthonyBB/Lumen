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
  type ClientItemStats,
  type ClientPlayerInventory,
} from '../systems/InventoryStore'
import { EQUIPMENT_MAP, type EquipSlot } from '../data/equipmentGen'

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
  belt:     'Belt',      shoes:   'Shoes',    gloves: 'Gloves',
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

// Slot positions — paper doll center at ~190, 360
const DOLL_CX = 190
const DOLL_CY = 360
const SLOT_POSITIONS: Record<SlotKey, { x: number; y: number }> = {
  helm:     { x: DOLL_CX,       y: DOLL_CY - 198 },
  earring:  { x: DOLL_CX + 90,  y: DOLL_CY - 165 },
  legs:     { x: DOLL_CX - 110, y: DOLL_CY - 110 },
  chest:    { x: DOLL_CX + 110, y: DOLL_CY - 110 },
  necklace: { x: DOLL_CX,       y: DOLL_CY - 118 },
  gloves:   { x: DOLL_CX - 110, y: DOLL_CY - 40  },
  mainHand: { x: DOLL_CX - 110, y: DOLL_CY + 30  },
  offHand:  { x: DOLL_CX + 110, y: DOLL_CY + 30  },
  belt:     { x: DOLL_CX,       y: DOLL_CY + 55  },
  ring1:    { x: DOLL_CX - 110, y: DOLL_CY + 115 },
  ring2:    { x: DOLL_CX + 110, y: DOLL_CY + 115 },
  shoes:    { x: DOLL_CX,       y: DOLL_CY + 178 },
}

/** Dim placeholder glyph shown in an empty slot. */
const SLOT_PLACEHOLDER: Record<SlotKey, string> = {
  mainHand: '🗡️', offHand: '🛡️', helm: '🪖', earring: '💎',
  ring1: '💍', ring2: '💍', belt: '🔗', shoes: '👟',
  gloves: '🧤', necklace: '📿', chest: '🦺', legs: '👖',
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

  private slotContainerMap: Map<SlotKey, Phaser.GameObjects.Container> = new Map()
  private connectorGfx: Phaser.GameObjects.Graphics | null = null
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
    const unsubscribe = InventoryStore.onUpdate((inv) => this.applyInventory(inv))
    const onError = (err: { message?: string }) => {
      if (err?.message) this.showFeedback(err.message)
    }
    this.socket?.on('error', onError)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      unsubscribe()
      this.socket?.off('error', onError)
    })

    // Render whatever snapshot we already have (onUpdate fires immediately
    // when one exists); also ask the server for a fresh copy.
    if (!InventoryStore.get()) this.rebuildDynamic()
    this.socket?.emit('inventory:get')

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

  private applyInventory(inv: ClientPlayerInventory) {
    this.equipped = (inv.equipment ?? {}) as Partial<Record<SlotKey, ClientInventoryItem>>
    // Only generated gear (catalogued in equipmentGen) is equippable
    this.gearItems = (inv.items ?? []).filter(i => EQUIPMENT_MAP[i.itemType])
    if (this.selectedItem && !this.gearItems.some(i => i.id === this.selectedItem!.id)) {
      this.selectedItem = null
    }
    this.rebuildDynamic()
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
    const catalog = EQUIPMENT_MAP[item.itemType]
    return catalog ? EQUIP_SLOT_TO_KEY[catalog.slot] : null
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
    this.drawWizardDoll()
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

  // ── Wizard paper doll ─────────────────────────────────────────────────────────

  private drawWizardDoll() {
    const cx = DOLL_CX
    const cy = DOLL_CY
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

    // Item icon (emoji from the server item, dim placeholder when empty)
    const icon = this.add.text(0, -8, item ? item.icon : SLOT_PLACEHOLDER[slotKey], {
      fontSize: '26px',
    }).setOrigin(0.5, 0.5).setAlpha(item ? 1 : 0.25)
    container.add(icon)

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
    })
    hit.on('pointerout', () => {
      this.drawSlotGfx(gfx, this.equipped[slotKey] ?? null, false)
    })
    hit.on('pointerdown', () => {
      // Request only — the server validates and pushes the updated inventory
      if (!this.equipped[slotKey]) return
      if (!this.socket?.connected) {
        this.showFeedback('Not connected to the server.')
        return
      }
      this.socket.emit('equipment:unequip', { slot: slotKey })
    })
    container.add(hit)

    this.slotContainerMap.set(slotKey, container)
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

    // Body attachment points (where the line "leaves" the doll silhouette)
    const bodyPoints: Record<SlotKey, { x: number; y: number }> = {
      helm:     { x: DOLL_CX,      y: DOLL_CY - 110 },
      earring:  { x: DOLL_CX + 22, y: DOLL_CY - 65  },
      necklace: { x: DOLL_CX,      y: DOLL_CY - 65  },
      legs:     { x: DOLL_CX - 22, y: DOLL_CY - 30  },
      chest:    { x: DOLL_CX + 22, y: DOLL_CY - 30  },
      gloves:   { x: DOLL_CX - 32, y: DOLL_CY + 10  },
      mainHand: { x: DOLL_CX - 32, y: DOLL_CY + 50  },
      offHand:  { x: DOLL_CX + 32, y: DOLL_CY + 50  },
      belt:     { x: DOLL_CX,      y: DOLL_CY + 55  },
      ring1:    { x: DOLL_CX - 32, y: DOLL_CY + 86  },
      ring2:    { x: DOLL_CX + 32, y: DOLL_CY + 86  },
      shoes:    { x: DOLL_CX,      y: DOLL_CY + 155 },
    }

    for (const slotKey of Object.keys(SLOT_POSITIONS) as SlotKey[]) {
      const slot = SLOT_POSITIONS[slotKey]
      const body = bodyPoints[slotKey]
      lineGfx.lineBetween(body.x, body.y, slot.x, slot.y)
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
      this.add.text(rowX + 34, rowY + 32, item.icon, { fontSize: '26px' }).setOrigin(0.5, 0.5)
    )

    // Text info
    const catalog    = EQUIPMENT_MAP[item.itemType]
    const slotKey    = this.slotForItem(item)
    const rarName    = item.rarity.charAt(0).toUpperCase() + item.rarity.slice(1)
    const rarHex     = rarCol.toString(16).padStart(6, '0')
    const slotLabel  = slotKey ? SLOT_LABELS[slotKey] : item.itemType
    const xpNote     = catalog && catalog.xpRequired > 0 ? `  ·  needs ${catalog.xpRequired} XP` : ''
    const nameText   = this.add.text(rowX + 70, rowY + 9,  item.name, {
      fontSize: '14px', fontFamily: 'Georgia, serif', color: '#dde0ff', fontStyle: 'bold',
    })
    const typeText   = this.add.text(rowX + 70, rowY + 27, `${rarName}  ·  ${slotLabel}${xpNote}`, {
      fontSize: '11px', fontFamily: 'Arial, sans-serif', color: `#${rarHex}`,
    })
    const statsText  = this.add.text(rowX + 70, rowY + 43, this.formatStats(item.stats), {
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
    })
    this.inventoryContainer.add(equipHit)
  }

  // ── Stats panel ───────────────────────────────────────────────────────────────
  // Display-only math over the server-reported snapshot — never sent back.

  private buildStatsPanel() {
    if (this.statsContainer) this.statsContainer.destroy()
    this.statsContainer = this.add.container(0, 0)

    const panX  = RIGHT_PANEL_X + 10
    const panW  = RIGHT_PANEL_W - 20
    const totalStats = this.computeTotalStats()
    const selected   = this.selectedItem
    let yOff         = PANEL_Y + 44

    if (selected) {
      // ── Comparison mode ────────────────────────────────────────────────────
      const rarHex = RARITY_COLOR[selected.rarity].toString(16).padStart(6, '0')
      this.statsContainer.add(
        this.add.text(panX + panW / 2, yOff, selected.name, {
          fontSize: '14px', fontFamily: 'Georgia, serif',
          color: `#${rarHex}`, fontStyle: 'bold',
        }).setOrigin(0.5, 0)
      )
      yOff += 24

      const slotKey = this.slotForItem(selected)
      const rarName = selected.rarity.charAt(0).toUpperCase() + selected.rarity.slice(1)
      this.statsContainer.add(
        this.add.text(panX + panW / 2, yOff, `${rarName}  ·  ${slotKey ? SLOT_LABELS[slotKey] : selected.itemType}`, {
          fontSize: '11px', fontFamily: 'Arial, sans-serif', color: `#${rarHex}`,
        }).setOrigin(0.5, 0)
      )
      yOff += 20

      const dv1 = this.add.graphics()
      dv1.lineStyle(1, 0x2a2a5a, 1)
      dv1.lineBetween(panX, yOff, panX + panW, yOff)
      this.statsContainer.add(dv1)
      yOff += 12

      this.statsContainer.add(
        this.add.text(panX + panW / 2, yOff, 'Stat Comparison', {
          fontSize: '11px', fontFamily: 'Arial, sans-serif', color: '#555577',
        }).setOrigin(0.5, 0)
      )
      yOff += 20

      const slotCurrent = slotKey ? this.equipped[slotKey] ?? null : null
      let shownAny = false

      for (const sk of this.statKeys(selected.stats, slotCurrent?.stats ?? {})) {
        const newVal  = selected.stats[sk]     ?? 0
        const curVal  = slotCurrent?.stats[sk] ?? 0
        const total   = totalStats[sk]         ?? 0
        if (newVal === 0 && curVal === 0) continue
        shownAny = true

        const after     = total - curVal + newVal
        const delta     = after - total
        const deltaStr  = delta > 0 ? `+${delta}` : `${delta}`
        const deltaCol  = delta > 0 ? '#44ff88' : delta < 0 ? '#ff6655' : '#888888'
        const statLabel = sk.charAt(0).toUpperCase() + sk.slice(1)

        this.statsContainer.add(
          this.add.text(panX + 4, yOff, `${statLabel}`, {
            fontSize: '13px', fontFamily: 'Arial, sans-serif', color: '#9999bb',
          })
        )
        this.statsContainer.add(
          this.add.text(panX + panW - 4, yOff, `${total} → ${after}  (${deltaStr})`, {
            fontSize: '12px', fontFamily: 'Arial, sans-serif',
            color: deltaCol, fontStyle: 'bold',
          }).setOrigin(1, 0)
        )
        yOff += 24
      }

      if (!shownAny) {
        this.statsContainer.add(
          this.add.text(panX + panW / 2, yOff, 'No comparable stats', {
            fontSize: '12px', fontFamily: 'Arial, sans-serif', color: '#444455',
          }).setOrigin(0.5, 0)
        )
      }

    } else {
      // ── Summary mode ───────────────────────────────────────────────────────
      this.statsContainer.add(
        this.add.text(panX + panW / 2, yOff, 'Equipped Stats', {
          fontSize: '14px', fontFamily: 'Georgia, serif', color: '#aaaacc', fontStyle: 'bold',
        }).setOrigin(0.5, 0)
      )
      yOff += 28

      const dv1 = this.add.graphics()
      dv1.lineStyle(1, 0x2a2a5a, 1)
      dv1.lineBetween(panX, yOff, panX + panW, yOff)
      this.statsContainer.add(dv1)
      yOff += 14

      let anyStats = false

      for (const sk of this.statKeys(totalStats, {})) {
        const val = totalStats[sk] ?? 0
        if (val === 0) continue
        anyStats = true
        const statLabel = sk.charAt(0).toUpperCase() + sk.slice(1)

        // Bar
        const barMaxW = panW - 60
        const barW    = Math.min((val / 20) * barMaxW, barMaxW)
        const barGfx  = this.add.graphics()
        barGfx.fillStyle(0x1e1e40, 1)
        barGfx.fillRoundedRect(panX + 4, yOff + 16, barMaxW, 7, 3)
        barGfx.fillStyle(0x3366cc, 1)
        barGfx.fillRoundedRect(panX + 4, yOff + 16, Math.max(barW, 2), 7, 3)
        this.statsContainer.add(barGfx)

        this.statsContainer.add(
          this.add.text(panX + 4, yOff, statLabel, {
            fontSize: '13px', fontFamily: 'Arial, sans-serif', color: '#9999bb',
          })
        )
        this.statsContainer.add(
          this.add.text(panX + panW - 4, yOff, `${val}`, {
            fontSize: '13px', fontFamily: 'Arial, sans-serif',
            color: '#e0e0ff', fontStyle: 'bold',
          }).setOrigin(1, 0)
        )
        yOff += 32
      }

      if (!anyStats) {
        this.statsContainer.add(
          this.add.text(panX + panW / 2, yOff + 10, 'No items equipped', {
            fontSize: '13px', fontFamily: 'Arial, sans-serif', color: '#333355',
          }).setOrigin(0.5, 0)
        )
        yOff += 40
      }

      yOff += 8
      const dv2 = this.add.graphics()
      dv2.lineStyle(1, 0x2a2a5a, 1)
      dv2.lineBetween(panX, yOff, panX + panW, yOff)
      this.statsContainer.add(dv2)
      yOff += 14

      // Slot fill count
      const slots  = Object.keys(SLOT_POSITIONS) as SlotKey[]
      const filled = slots.filter(s => this.equipped[s]).length
      this.statsContainer.add(
        this.add.text(panX + panW / 2, yOff, `Slots:  ${filled} / ${slots.length}  equipped`, {
          fontSize: '12px', fontFamily: 'Arial, sans-serif', color: '#556677',
        }).setOrigin(0.5, 0)
      )
      yOff += 30

      this.statsContainer.add(
        this.add.text(panX + panW / 2, yOff,
          'Hover an item\nto compare stats', {
            fontSize: '11px', fontFamily: 'Arial, sans-serif',
            color: '#33334a', align: 'center',
          }
        ).setOrigin(0.5, 0)
      )
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  private statKeys(
    a: ClientItemStats,
    b: ClientItemStats,
  ): (keyof ClientItemStats)[] {
    return [...new Set([...Object.keys(a), ...Object.keys(b)])] as (keyof ClientItemStats)[]
  }

  private computeTotalStats(): Record<string, number> {
    const totals: Record<string, number> = {}
    for (const item of Object.values(this.equipped)) {
      if (!item) continue
      for (const [k, v] of Object.entries(item.stats)) {
        if (typeof v === 'number') totals[k] = (totals[k] ?? 0) + v
      }
    }
    return totals
  }

  private formatStats(stats: ClientItemStats | Record<string, number>): string {
    return Object.entries(stats)
      .filter((e): e is [string, number] => typeof e[1] === 'number' && e[1] !== 0)
      .map(([k, v]) => `+${v} ${k.charAt(0).toUpperCase() + k.slice(1)}`)
      .join('  ')
  }

  private truncate(str: string, maxChars: number): string {
    return str.length > maxChars ? str.slice(0, maxChars - 1) + '…' : str
  }
}
