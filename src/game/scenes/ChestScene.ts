// ============================================================
// ChestScene — the personal storage chest.
//
// SECURITY: this scene only RENDERS the state the server reports
// ('chest:data' / 'chest:updated') and requests transfers via
// 'chest:transfer'.  Dropping an item is a request — nothing
// moves until the server validates ownership and capacity and
// pushes the updated chest + inventory back.
// ============================================================

import Phaser from 'phaser'
import type { Socket } from 'socket.io-client'
import { GAME_WIDTH, GAME_HEIGHT } from '../constants'
import type { ClientInventoryItem } from '../systems/InventoryStore'

// ── Types ─────────────────────────────────────────────────────────────────────

type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'

/** Shape of the server's chest:data / chest:updated payloads. */
interface ChestPayload {
  chest: {
    chestId: string
    ownerId: string
    items: ClientInventoryItem[]
    maxSlots: number
  }
  inventory: {
    items: ClientInventoryItem[]
  }
}

// Logical slot descriptor — position + which panel it belongs to
interface Slot {
  x:      number   // top-left pixel x
  y:      number   // top-left pixel y
  panel:  'chest' | 'inventory'
  index:  number   // 0-based index within its panel's item array
}

// ── Constants ─────────────────────────────────────────────────────────────────

const RARITY_COLOR: Record<Rarity, number> = {
  common:    0xaaaaaa,
  uncommon:  0x44cc44,
  rare:      0x4488ff,
  epic:      0xcc44ff,
  legendary: 0xffaa00,
}

const MAX_SLOTS = 20
const COLS      = 4
const SLOT_W    = 100
const SLOT_H    = 80
const SLOT_PAD  = 8

// Panel layout — equal 600 px panels, 40 px gap centred at x = 640
const PANEL_Y   = 80
const PANEL_H   = GAME_HEIGHT - 120
const LEFT_X    = 20
const LEFT_W    = 600
const GAP_START = LEFT_X + LEFT_W          // 620
const RIGHT_X   = GAP_START + 40           // 660
const RIGHT_W   = GAME_WIDTH - RIGHT_X - 20 // 600

// ── Scene ─────────────────────────────────────────────────────────────────────

export class ChestScene extends Phaser.Scene {
  private socket: Socket | null = null

  // Server-reported state — only ever replaced by chest:data / chest:updated
  private chestId:        string | null = null
  private chestItems:     ClientInventoryItem[] = []
  private inventoryItems: ClientInventoryItem[] = []
  private maxSlots = MAX_SLOTS

  // Pre-computed slot grid positions (set once in create, never change)
  private chestSlots:     Slot[] = []
  private inventorySlots: Slot[] = []

  // All dynamic game objects that get destroyed/rebuilt when items change
  private itemLayer: Phaser.GameObjects.GameObject[] = []

  // Drag state — managed entirely through scene pointer events (no Phaser drag system)
  private dragging   = false
  private dragItem:  ClientInventoryItem | null = null
  private dragFrom:  Slot | null = null
  private dragGfx:   Phaser.GameObjects.Container | null = null

  // Hover highlight (single reused graphics object)
  private hoverGfx!: Phaser.GameObjects.Graphics

  private feedbackText!: Phaser.GameObjects.Text

  private escKey!: Phaser.Input.Keyboard.Key

  constructor() { super({ key: 'ChestScene' }) }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  create() {
    this.socket = (window as typeof window & { __lumenSocket?: Socket }).__lumenSocket ?? null

    this.chestId        = null
    this.chestItems     = []
    this.inventoryItems = []
    this.dragging       = false
    this.dragItem       = null
    this.dragFrom       = null
    this.dragGfx        = null

    // Build fixed slot grids
    this.chestSlots     = this.buildSlotGrid('chest')
    this.inventorySlots = this.buildSlotGrid('inventory')

    // Draw the background, panels, header, footer — never rebuilt
    this.drawStaticLayer()

    // Reusable hover-highlight object (on top of everything static)
    this.hoverGfx = this.add.graphics().setDepth(20)

    this.feedbackText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 48, '', {
      fontSize: '14px', fontFamily: 'Arial, sans-serif', color: '#ff8866',
      backgroundColor: '#000000aa', padding: { x: 10, y: 5 },
    }).setOrigin(0.5, 0.5).setDepth(60).setVisible(false)

    // ── Server listeners (server state is the only source of truth) ──────────
    const onChestData = (data: ChestPayload) => this.applyChestData(data)
    const onError = (err: { message?: string }) => {
      if (err?.message) this.showFeedback(err.message)
    }
    this.socket?.on('chest:data', onChestData)
    this.socket?.on('chest:updated', onChestData)
    this.socket?.on('error', onError)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.socket?.off('chest:data', onChestData)
      this.socket?.off('chest:updated', onChestData)
      this.socket?.off('error', onError)
    })

    // Ask the server for the personal chest.  The chestId in this request is
    // a placeholder — the server resolves the player's own chest and returns
    // its real id, which we use for transfers.
    this.socket?.emit('chest:open', { chestId: 'personal' })

    // First draw (empty until chest:data arrives)
    this.rebuildItemLayer()

    // Scene-level pointer events — the only input system we use
    this.input.on('pointerdown', this.onDown, this)
    this.input.on('pointermove', this.onMove, this)
    this.input.on('pointerup',   this.onUp,   this)

    this.escKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC)
  }

  update() {
    if (Phaser.Input.Keyboard.JustDown(this.escKey)) {
      this.cleanupDrag()
      this.scene.start('WorldScene')
    }
  }

  // ── Server snapshot → render state ─────────────────────────────────────────

  private applyChestData(data: ChestPayload) {
    this.chestId        = data.chest.chestId
    this.chestItems     = data.chest.items ?? []
    this.inventoryItems = data.inventory.items ?? []
    this.maxSlots       = data.chest.maxSlots ?? MAX_SLOTS
    this.rebuildItemLayer()
  }

  private showFeedback(message: string) {
    this.feedbackText.setText(message).setVisible(true)
    this.time.delayedCall(2600, () => this.feedbackText.setVisible(false))
  }

  // ── Slot grid ──────────────────────────────────────────────────────────────

  private buildSlotGrid(panel: 'chest' | 'inventory'): Slot[] {
    const panelX  = panel === 'chest' ? LEFT_X  : RIGHT_X
    const panelW  = panel === 'chest' ? LEFT_W  : RIGHT_W
    const gridW   = COLS * SLOT_W + (COLS - 1) * SLOT_PAD
    const originX = panelX + (panelW - gridW) / 2
    const originY = PANEL_Y + 58

    return Array.from({ length: MAX_SLOTS }, (_, i) => ({
      x:     originX + (i % COLS) * (SLOT_W + SLOT_PAD),
      y:     originY + Math.floor(i / COLS) * (SLOT_H + SLOT_PAD),
      panel,
      index: i,
    }))
  }

  // ── Static layer (drawn once) ──────────────────────────────────────────────

  private drawStaticLayer() {
    // Dark starfield background
    const bg = this.add.graphics()
    bg.fillStyle(0x0a0a1e, 1)
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)
    bg.lineStyle(1, 0x111133, 0.6)
    for (let y = 0; y < GAME_HEIGHT; y += 24) bg.lineBetween(0, y, GAME_WIDTH, y)
    const rng = new Phaser.Math.RandomDataGenerator(['chest_bg'])
    bg.fillStyle(0xffffff, 0.3)
    for (let i = 0; i < 60; i++) bg.fillRect(rng.integerInRange(0, GAME_WIDTH), rng.integerInRange(0, GAME_HEIGHT), 1, 1)

    // Header bar
    const hg = this.add.graphics()
    hg.fillStyle(0x12122e, 1)
    hg.fillRect(0, 0, GAME_WIDTH, 70)
    hg.lineStyle(2, 0xffd700, 0.7)
    hg.lineBetween(0, 70, GAME_WIDTH, 70)
    hg.lineStyle(1, 0xffd700, 0.45)
    hg.lineBetween(50, 35, 450, 35)
    hg.lineBetween(GAME_WIDTH - 450, 35, GAME_WIDTH - 50, 35)
    // Small chest icon
    const icx = GAME_WIDTH / 2 - 120, icy = 35
    const icg = this.add.graphics()
    icg.fillStyle(0x92400e, 1); icg.fillRect(icx - 14, icy - 6, 28, 13)
    icg.fillStyle(0xa16207, 1); icg.fillRect(icx - 14, icy - 14, 28, 9)
    icg.fillStyle(0x374151, 1); icg.fillRect(icx - 14, icy - 3, 28, 3)
    icg.fillStyle(0xfbbf24, 1); icg.fillRect(icx - 3, icy - 4, 6, 5)
    icg.lineStyle(1, 0x451a03, 0.9); icg.strokeRect(icx - 14, icy - 14, 28, 22)
    this.add.text(GAME_WIDTH / 2, 35, 'Personal Chest', {
      fontSize: '26px', fontFamily: 'Georgia, serif', color: '#ffd700', fontStyle: 'bold',
    }).setOrigin(0.5, 0.5)

    // Footer
    const fg = this.add.graphics()
    fg.fillStyle(0x12122e, 1)
    fg.fillRect(0, GAME_HEIGHT - 28, GAME_WIDTH, 28)
    fg.lineStyle(1, 0x3333aa, 0.8)
    fg.lineBetween(0, GAME_HEIGHT - 28, GAME_WIDTH, GAME_HEIGHT - 28)
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 14, 'Drag items between panels  ·  Press  ESC  to close', {
      fontSize: '12px', fontFamily: 'Arial, sans-serif', color: '#555577',
    }).setOrigin(0.5, 0.5)

    // Panel frames (solid dark fill + border — drawn below item layer at depth 0)
    this.panelFrame(LEFT_X,  PANEL_Y, LEFT_W,  PANEL_H)
    this.panelFrame(RIGHT_X, PANEL_Y, RIGHT_W, PANEL_H)

    // Empty slot backgrounds (static; depth 1 so item visuals sit above them)
    for (const s of [...this.chestSlots, ...this.inventorySlots]) {
      const g = this.add.graphics().setDepth(1)
      g.fillStyle(0x111128, 1)
      g.fillRoundedRect(s.x, s.y, SLOT_W, SLOT_H, 8)
      g.lineStyle(1, 0x2a2a50, 1)
      g.strokeRoundedRect(s.x, s.y, SLOT_W, SLOT_H, 8)
    }

    // Vertical divider (centred in the 40 px gap)
    const dg = this.add.graphics()
    dg.lineStyle(2, 0xffd700, 0.5)
    const divX = (GAP_START + RIGHT_X) / 2   // = 640
    dg.lineBetween(divX, PANEL_Y + 10, divX, PANEL_Y + PANEL_H - 10)
  }

  private panelFrame(x: number, y: number, w: number, h: number) {
    const g = this.add.graphics().setDepth(0)
    g.fillStyle(0x12122e, 1)
    g.fillRoundedRect(x, y, w, h, 10)
    g.lineStyle(1, 0x2a2a5a, 1)
    g.strokeRoundedRect(x, y, w, h, 10)
  }

  // ── Dynamic item layer ─────────────────────────────────────────────────────
  // Destroyed and redrawn on every server push.

  private rebuildItemLayer() {
    this.itemLayer.forEach(o => o.destroy())
    this.itemLayer = []

    const loaded = this.chestId !== null

    // Panel titles + counts (depth 2, above slot backgrounds)
    this.push(this.add.text(LEFT_X + LEFT_W / 2, PANEL_Y + 16, 'Chest Storage', {
      fontSize: '15px', fontFamily: 'Georgia, serif', color: '#ffd700', fontStyle: 'bold',
    }).setOrigin(0.5, 0).setDepth(2))

    this.push(this.add.text(LEFT_X + LEFT_W / 2, PANEL_Y + 34,
      loaded ? `${this.chestItems.length} / ${this.maxSlots}` : 'Loading…', {
      fontSize: '11px', fontFamily: 'Arial, sans-serif', color: '#666688',
    }).setOrigin(0.5, 0).setDepth(2))

    this.push(this.add.text(RIGHT_X + RIGHT_W / 2, PANEL_Y + 16, 'Your Inventory', {
      fontSize: '15px', fontFamily: 'Georgia, serif', color: '#ffd700', fontStyle: 'bold',
    }).setOrigin(0.5, 0).setDepth(2))

    this.push(this.add.text(RIGHT_X + RIGHT_W / 2, PANEL_Y + 34,
      loaded ? `${this.inventoryItems.length} items` : 'Loading…', {
      fontSize: '11px', fontFamily: 'Arial, sans-serif', color: '#666688',
    }).setOrigin(0.5, 0).setDepth(2))

    // Item visuals (depth 2) — skip the slot currently being dragged so the
    // source slot appears empty while the ghost follows the cursor.
    for (const slot of this.chestSlots) {
      const item = this.chestItems[slot.index] ?? null
      const isBeingDragged = this.dragging && this.dragFrom === slot
      if (item && !isBeingDragged) this.drawItemInSlot(slot, item)
    }
    for (const slot of this.inventorySlots) {
      const item = this.inventoryItems[slot.index] ?? null
      const isBeingDragged = this.dragging && this.dragFrom === slot
      if (item && !isBeingDragged) this.drawItemInSlot(slot, item)
    }
  }

  private push<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.itemLayer.push(obj)
    return obj
  }

  private drawItemInSlot(slot: Slot, item: ClientInventoryItem) {
    const { x, y } = slot
    const col = RARITY_COLOR[item.rarity] ?? RARITY_COLOR.common

    // Coloured slot highlight + rarity border
    const g = this.push(this.add.graphics().setDepth(2))
    g.fillStyle(0x1a1a3a, 1)
    g.fillRoundedRect(x, y, SLOT_W, SLOT_H, 8)
    g.lineStyle(1.5, col, 1)
    g.strokeRoundedRect(x, y, SLOT_W, SLOT_H, 8)

    // Icon (server-provided emoji)
    this.push(this.add.text(x + SLOT_W / 2, y + 26, item.icon, {
      fontSize: '24px',
    }).setOrigin(0.5, 0.5).setDepth(3))

    // Name
    const nameStr = item.name.length > 10 ? item.name.slice(0, 9) + '…' : item.name
    const hex = col.toString(16).padStart(6, '0')
    this.push(this.add.text(x + SLOT_W / 2, y + SLOT_H - 20, nameStr, {
      fontSize: '9px', fontFamily: 'Arial, sans-serif', color: `#${hex}`, fontStyle: 'bold',
    }).setOrigin(0.5, 0.5).setDepth(3))

    // Quantity badge
    if (item.quantity > 1) {
      this.push(this.add.text(x + SLOT_W - 4, y + 4, `x${item.quantity}`, {
        fontSize: '9px', fontFamily: 'Arial, sans-serif', color: '#ffffff',
        backgroundColor: '#00000099', padding: { x: 2, y: 1 },
      }).setOrigin(1, 0).setDepth(3))
    }
  }

  // ── Pointer helpers ────────────────────────────────────────────────────────

  /** Returns the slot and item under pointer coordinates, or null. */
  private hitTest(px: number, py: number): { slot: Slot; item: ClientInventoryItem | null } | null {
    for (const slot of [...this.chestSlots, ...this.inventorySlots]) {
      if (px >= slot.x && px < slot.x + SLOT_W && py >= slot.y && py < slot.y + SLOT_H) {
        const item = slot.panel === 'chest'
          ? (this.chestItems[slot.index] ?? null)
          : (this.inventoryItems[slot.index] ?? null)
        return { slot, item }
      }
    }
    return null
  }

  private highlightSlot(slot: Slot | null, color = 0xffd700) {
    this.hoverGfx.clear()
    if (!slot) return
    this.hoverGfx.lineStyle(2.5, color, 1)
    this.hoverGfx.strokeRoundedRect(slot.x, slot.y, SLOT_W, SLOT_H, 8)
  }

  // ── Drag event handlers ────────────────────────────────────────────────────

  private onDown(ptr: Phaser.Input.Pointer) {
    const hit = this.hitTest(ptr.x, ptr.y)
    if (!hit?.item) return    // clicked an empty slot — nothing to drag

    this.dragging  = true
    this.dragFrom  = hit.slot
    this.dragItem  = hit.item

    // Ghost — drawn centred on the cursor, depth 50 (above everything)
    const col = RARITY_COLOR[hit.item.rarity] ?? RARITY_COLOR.common
    const hex = col.toString(16).padStart(6, '0')
    const ghost = this.add.container(ptr.x, ptr.y).setDepth(50)
    const gfx = this.add.graphics()
    gfx.fillStyle(0x0d0d28, 0.92)
    gfx.fillRoundedRect(-SLOT_W / 2, -SLOT_H / 2, SLOT_W, SLOT_H, 8)
    gfx.lineStyle(2, col, 1)
    gfx.strokeRoundedRect(-SLOT_W / 2, -SLOT_H / 2, SLOT_W, SLOT_H, 8)
    ghost.add(gfx)
    ghost.add(this.add.text(0, -8, hit.item.icon, { fontSize: '24px' }).setOrigin(0.5, 0.5))
    const nameStr = hit.item.name.length > 10 ? hit.item.name.slice(0, 9) + '…' : hit.item.name
    ghost.add(this.add.text(0, SLOT_H / 2 - 10, nameStr, {
      fontSize: '9px', fontFamily: 'Arial, sans-serif', color: `#${hex}`, fontStyle: 'bold',
    }).setOrigin(0.5, 0.5))
    this.dragGfx = ghost

    // Immediately redraw the item layer without the source slot so it visually
    // disappears from its origin the moment dragging begins.
    this.rebuildItemLayer()
  }

  private onMove(ptr: Phaser.Input.Pointer) {
    if (!this.dragging) {
      // Hover highlight when not dragging
      const hit = this.hitTest(ptr.x, ptr.y)
      this.highlightSlot(hit?.item ? hit.slot : null)
      return
    }

    // Move ghost
    this.dragGfx?.setPosition(ptr.x, ptr.y)

    // Highlight valid drop target
    const hit = this.hitTest(ptr.x, ptr.y)
    if (hit && hit.slot !== this.dragFrom) {
      const samePanel = hit.slot.panel === this.dragFrom?.panel
      this.highlightSlot(hit.slot, samePanel ? 0x555577 : 0x44ff88)
    } else {
      this.highlightSlot(null)
    }
  }

  private onUp(ptr: Phaser.Input.Pointer) {
    if (!this.dragging) return

    const dragFrom = this.dragFrom
    const dragItem = this.dragItem

    // Always clean up ghost first
    this.cleanupDrag()
    this.dragFrom = null
    this.dragItem = null

    // Redraw from the current server state — the dragged item snaps back to
    // its source slot until (and unless) the server confirms the transfer.
    this.rebuildItemLayer()

    if (!dragFrom || !dragItem) return

    const hit = this.hitTest(ptr.x, ptr.y)

    if (hit && hit.slot.panel !== dragFrom.panel) {
      // Cross-panel transfer — a request only.  The server validates chest
      // ownership, item ownership and capacity, then pushes 'chest:updated'.
      if (!this.chestId || !this.socket?.connected) {
        this.showFeedback('Not connected to the server.')
        return
      }
      this.socket.emit('chest:transfer', {
        chestId:   this.chestId,
        itemId:    dragItem.id,
        direction: dragFrom.panel === 'chest' ? 'from_chest' : 'to_chest',
      })
    }
  }

  // ── Drag cleanup ───────────────────────────────────────────────────────────

  private cleanupDrag() {
    this.dragGfx?.destroy(); this.dragGfx = null
    this.hoverGfx.clear()
    this.dragging = false
  }
}
