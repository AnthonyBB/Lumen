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

const MAX_SLOTS = 30   // 5 cols × 6 rows — slots PER TAB
const COLS      = 5
const SLOT_W    = 96
const SLOT_H    = 70
const SLOT_PAD  = 8

// Tabbed chest — 4 pages of MAX_SLOTS each. The chest is a single FLAT items
// array of capacity CHEST_CAPACITY on the server; tabs are a client-side paging
// of that array. The absolute (server) index of a chest slot is
//   activeTab * MAX_SLOTS + localIndex.
const CHEST_TABS     = 4
const CHEST_CAPACITY = CHEST_TABS * MAX_SLOTS   // 120

const TAB_LABELS = ['I', 'II', 'III', 'IV'] as const

// Panel layout — equal 600 px panels, 40 px gap centred at x = 640
const PANEL_Y   = 80
const PANEL_H   = GAME_HEIGHT - 120
const LEFT_X    = 20
const LEFT_W    = 600
const GAP_START = LEFT_X + LEFT_W          // 620
const RIGHT_X   = GAP_START + 40           // 660
const RIGHT_W   = GAME_WIDTH - RIGHT_X - 20 // 600

// Exit button rect (top-right of the header) — same action as pressing ESC.
const EXIT_BTN  = { x: GAME_WIDTH - 100, y: 18, w: 82, h: 34 }

// ── Scene ─────────────────────────────────────────────────────────────────────

export class ChestScene extends Phaser.Scene {
  private socket: Socket | null = null

  // Where to drop the player back in town (next to the chest); set via init().
  private returnX?: number
  private returnY?: number

  // Server-reported state — only ever replaced by chest:data / chest:updated
  private chestId:        string | null = null
  // Sparse by absolute slot (0..CHEST_CAPACITY-1): chestItems[s] is the item at
  // that tab/slot position, or null when empty.
  private chestItems:     (ClientInventoryItem | null)[] = []
  private inventoryItems: ClientInventoryItem[] = []
  private maxSlots = CHEST_CAPACITY

  // Which chest tab/page is being viewed (0..CHEST_TABS-1). Tabs are purely a
  // client-side view of the flat chestItems array; absolute index of a chest
  // slot = activeTab * MAX_SLOTS + localIndex.
  private activeTab = 0

  // Pixel rects for the 4 tab buttons, computed once in create().
  private tabRects: { x: number; y: number; w: number; h: number }[] = []

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
  // Double-click detection (click the same item twice quickly to transfer it).
  private lastClickItemId: string | null = null
  private lastClickAt = 0
  // Press position — a press with no movement is a click (shows item stats);
  // moving past the threshold turns it into a drag.
  private dragStartX = 0
  private dragStartY = 0
  private detailPanel: Phaser.GameObjects.Container | null = null

  // Hover highlight (single reused graphics object)
  private hoverGfx!: Phaser.GameObjects.Graphics

  private feedbackText!: Phaser.GameObjects.Text

  private escKey!: Phaser.Input.Keyboard.Key

  constructor() { super({ key: 'ChestScene' }) }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  init(data?: { returnX?: number; returnY?: number }) {
    this.returnX = data?.returnX
    this.returnY = data?.returnY
  }

  create() {
    this.socket = (window as typeof window & { __lumenSocket?: Socket }).__lumenSocket ?? null

    this.chestId        = null
    this.chestItems     = []
    this.inventoryItems = []
    this.activeTab      = 0
    this.dragging       = false
    this.dragItem       = null
    this.dragFrom       = null
    this.detailPanel    = null
    this.dragGfx        = null

    // Build fixed slot grids
    this.chestSlots     = this.buildSlotGrid('chest')
    this.inventorySlots = this.buildSlotGrid('inventory')

    // Tab button rects across the top of the chest (left) panel.
    this.tabRects = this.buildTabRects()

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
    if (Phaser.Input.Keyboard.JustDown(this.escKey)) this.closeScene()
  }

  /** Leave the chest and return to town (next to the chest). */
  private closeScene() {
    this.cleanupDrag()
    this.hideItemDetails()
    this.scene.start('WorldScene',
      this.returnX !== undefined ? { spawnX: this.returnX, spawnY: this.returnY } : undefined)
  }

  // ── Server snapshot → render state ─────────────────────────────────────────

  private applyChestData(data: ChestPayload) {
    this.chestId        = data.chest.chestId
    this.maxSlots       = data.chest.maxSlots ?? CHEST_CAPACITY
    // Place each stored item at its absolute chestSlot (sparse). Items without a
    // slot fall into the first free position (defensive — the server migrates).
    const sparse: (ClientInventoryItem | null)[] = new Array(CHEST_CAPACITY).fill(null)
    for (const it of (data.chest.items ?? [])) {
      let s = typeof it.chestSlot === 'number' ? it.chestSlot : -1
      if (s < 0 || s >= CHEST_CAPACITY || sparse[s]) s = sparse.indexOf(null)
      if (s >= 0) sparse[s] = it
    }
    this.chestItems     = sparse
    this.inventoryItems = data.inventory.items ?? []
    this.rebuildItemLayer()
  }

  private showFeedback(message: string) {
    this.feedbackText.setText(message).setVisible(true)
    this.time.delayedCall(2600, () => this.feedbackText.setVisible(false))
  }

  // ── Slot grid ──────────────────────────────────────────────────────────────

  /** Absolute (flat-array / server) index of a chest slot on the active tab. */
  private chestAbsIndex(localIndex: number): number {
    return this.activeTab * MAX_SLOTS + localIndex
  }

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

  /**
   * Pixel rects for the 4 chest tab buttons, laid out in a centred row across
   * the top of the chest (left) panel, just under the panel title.
   */
  private buildTabRects(): { x: number; y: number; w: number; h: number }[] {
    const h       = 22
    const gap     = 8
    const totalW  = 0.7 * LEFT_W            // tab row spans ~70% of the panel
    const w       = (totalW - (CHEST_TABS - 1) * gap) / CHEST_TABS
    const originX = LEFT_X + (LEFT_W - totalW) / 2
    const y       = PANEL_Y + 34
    return Array.from({ length: CHEST_TABS }, (_, i) => ({
      x: originX + i * (w + gap),
      y,
      w,
      h,
    }))
  }

  /** Number of items currently stored on chest tab `t` (0..CHEST_TABS-1). */
  private tabItemCount(t: number): number {
    let n = 0
    for (let i = 0; i < MAX_SLOTS; i++) {
      if (this.chestItems[t * MAX_SLOTS + i]) n++
    }
    return n
  }

  /**
   * Draw the 4 chest tab buttons (part of the dynamic item layer so the active
   * highlight + per-tab counts re-render whenever the chest state or the active
   * tab changes). Click handling lives in onDown().
   */
  private drawTabs() {
    this.tabRects.forEach((r, i) => {
      const active = i === this.activeTab
      const g = this.push(this.add.graphics().setDepth(2))
      g.fillStyle(active ? 0x1f1f4a : 0x12122e, 1)
      g.fillRoundedRect(r.x, r.y, r.w, r.h, 5)
      g.lineStyle(active ? 2 : 1, active ? 0xffd700 : 0x2a2a5a, 1)
      g.strokeRoundedRect(r.x, r.y, r.w, r.h, 5)

      const count = this.tabItemCount(i)
      const label = `${TAB_LABELS[i]}${count ? ` · ${count}` : ''}`
      this.push(this.add.text(r.x + r.w / 2, r.y + r.h / 2, label, {
        fontSize: '12px', fontFamily: 'Georgia, serif',
        color: active ? '#ffd700' : '#8888aa',
        fontStyle: active ? 'bold' : 'normal',
      }).setOrigin(0.5, 0.5).setDepth(3))
    })
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

    // Exit button (top-right) — click to leave the chest (same as ESC).
    const eb = EXIT_BTN
    const ebg = this.add.graphics()
    ebg.fillStyle(0x2a1830, 1)
    ebg.fillRoundedRect(eb.x, eb.y, eb.w, eb.h, 6)
    ebg.lineStyle(1, 0xffd700, 0.85)
    ebg.strokeRoundedRect(eb.x, eb.y, eb.w, eb.h, 6)
    this.add.text(eb.x + eb.w / 2, eb.y + eb.h / 2, '✕ Exit', {
      fontSize: '14px', fontFamily: 'Arial, sans-serif', color: '#ffd700', fontStyle: 'bold',
    }).setOrigin(0.5, 0.5)

    // Footer
    const fg = this.add.graphics()
    fg.fillStyle(0x12122e, 1)
    fg.fillRect(0, GAME_HEIGHT - 28, GAME_WIDTH, 28)
    fg.lineStyle(1, 0x3333aa, 0.8)
    fg.lineBetween(0, GAME_HEIGHT - 28, GAME_WIDTH, GAME_HEIGHT - 28)
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 14, 'Drag items between panels  ·  Click tabs I–IV to page the chest  ·  Press  ESC  to close', {
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

    // Tab buttons across the top of the chest panel. The active tab is
    // highlighted (gold border + filled). A small per-tab item count sits
    // under each label. Whole-chest usage (used / capacity) is shown below.
    if (loaded) this.drawTabs()

    this.push(this.add.text(LEFT_X + LEFT_W / 2, PANEL_Y + 58 + 6 * (SLOT_H + SLOT_PAD) + 2,
      loaded ? `${this.chestItems.filter(Boolean).length} / ${this.maxSlots} stored` : 'Loading…', {
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
      const item = this.chestItems[this.chestAbsIndex(slot.index)] ?? null
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
          ? (this.chestItems[this.chestAbsIndex(slot.index)] ?? null)
          : (this.inventoryItems[slot.index] ?? null)
        return { slot, item }
      }
    }
    return null
  }

  /** Returns the index of the chest tab under the pointer, or null. */
  private hitTestTab(px: number, py: number): number | null {
    for (let i = 0; i < this.tabRects.length; i++) {
      const r = this.tabRects[i]
      if (px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h) return i
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
    // Exit button takes priority over everything.
    const eb = EXIT_BTN
    if (ptr.x >= eb.x && ptr.x < eb.x + eb.w && ptr.y >= eb.y && ptr.y < eb.y + eb.h) {
      this.closeScene()
      return
    }

    // Tab clicks take priority over slot drags. Switching tabs just re-pages the
    // client-side view of the flat chest array — no server round-trip needed.
    const tabIdx = this.hitTestTab(ptr.x, ptr.y)
    if (tabIdx !== null) {
      if (tabIdx !== this.activeTab) {
        this.activeTab = tabIdx
        this.highlightSlot(null)
        this.hideItemDetails()
        this.rebuildItemLayer()
      }
      return
    }

    const hit = this.hitTest(ptr.x, ptr.y)
    if (!hit?.item) { this.lastClickItemId = null; this.hideItemDetails(); return }  // empty slot

    // Double-click the same item → send it to the other panel (no drag needed).
    const now = this.time.now
    if (this.lastClickItemId === hit.item.id && now - this.lastClickAt < 350) {
      this.lastClickItemId = null
      this.lastClickAt = 0
      this.quickTransfer(hit.slot, hit.item)
      return
    }
    this.lastClickItemId = hit.item.id
    this.lastClickAt = now

    // Arm a press: record the item + press position. The ghost only appears and
    // the item only lifts once the pointer moves past the threshold (onMove →
    // beginDrag). A press released with no movement is a click (onUp → stats).
    this.dragFrom   = hit.slot
    this.dragItem   = hit.item
    this.dragStartX = ptr.x
    this.dragStartY = ptr.y
  }

  /** Promote an armed press into a real drag once the pointer has moved. */
  private beginDrag(ptr: Phaser.Input.Pointer) {
    const item = this.dragItem
    if (!item) return
    this.dragging = true
    this.hideItemDetails()

    // Ghost — drawn centred on the cursor, depth 50 (above everything)
    const col = RARITY_COLOR[item.rarity] ?? RARITY_COLOR.common
    const hex = col.toString(16).padStart(6, '0')
    const ghost = this.add.container(ptr.x, ptr.y).setDepth(50)
    const gfx = this.add.graphics()
    gfx.fillStyle(0x0d0d28, 0.92)
    gfx.fillRoundedRect(-SLOT_W / 2, -SLOT_H / 2, SLOT_W, SLOT_H, 8)
    gfx.lineStyle(2, col, 1)
    gfx.strokeRoundedRect(-SLOT_W / 2, -SLOT_H / 2, SLOT_W, SLOT_H, 8)
    ghost.add(gfx)
    ghost.add(this.add.text(0, -8, item.icon, { fontSize: '24px' }).setOrigin(0.5, 0.5))
    const nameStr = item.name.length > 10 ? item.name.slice(0, 9) + '…' : item.name
    ghost.add(this.add.text(0, SLOT_H / 2 - 10, nameStr, {
      fontSize: '9px', fontFamily: 'Arial, sans-serif', color: `#${hex}`, fontStyle: 'bold',
    }).setOrigin(0.5, 0.5))
    this.dragGfx = ghost

    // Redraw without the source slot so the item visually lifts off its origin.
    this.rebuildItemLayer()
  }

  private onMove(ptr: Phaser.Input.Pointer) {
    if (!this.dragging) {
      // An armed press that moves past the threshold becomes a real drag.
      if (this.dragItem &&
          Phaser.Math.Distance.Between(this.dragStartX, this.dragStartY, ptr.x, ptr.y) > 6) {
        this.beginDrag(ptr)
        return
      }
      // Hover highlight only when idle (not armed/dragging).
      if (!this.dragItem) {
        const hit = this.hitTest(ptr.x, ptr.y)
        this.highlightSlot(hit?.item ? hit.slot : null)
      }
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
    const from = this.dragFrom
    const item = this.dragItem
    const wasDragging = this.dragging

    // Tear down the drag/armed state.
    if (wasDragging) {
      this.cleanupDrag()
      // Redraw from the current server state — the dragged item snaps back to
      // its source slot until (and unless) the server confirms the transfer.
      this.rebuildItemLayer()
    }
    this.dragFrom = null
    this.dragItem = null
    this.dragging = false

    if (!from || !item) return

    // Released without ever moving → a click: show the item's full stats.
    if (!wasDragging) {
      this.showItemDetails(item, ptr.x, ptr.y)
      return
    }

    const hit = this.hitTest(ptr.x, ptr.y)

    if (hit && hit.slot.panel !== from.panel) {
      // Cross-panel transfer — a request only.  The server validates chest
      // ownership, item ownership and capacity, then pushes 'chest:updated'.
      if (!this.chestId || !this.socket?.connected) {
        this.showFeedback('Not connected to the server.')
        return
      }
      if (from.panel === 'inventory') {
        // Into the chest: place at the dropped slot (or the first free slot on
        // that same tab if it's occupied / that tab is full).
        const toSlot = this.pickChestSlot(this.chestAbsIndex(hit.slot.index))
        if (toSlot === null) { this.showFeedback('The chest is full.'); return }
        this.socket.emit('chest:transfer', {
          chestId:   this.chestId,
          itemId:    item.id,
          direction: 'to_chest',
          toSlot,
        })
      } else {
        // Out of the chest into the bag (packed — no target slot needed).
        this.socket.emit('chest:transfer', {
          chestId:   this.chestId,
          itemId:    item.id,
          direction: 'from_chest',
        })
      }
    }
  }

  /** Choose the chest slot for a drop: the requested slot if empty, else the
   *  first free slot on the same tab, else the first free slot anywhere, else
   *  null when the chest is full. */
  private pickChestSlot(desired: number): number | null {
    if (!this.chestItems[desired]) return desired
    const tab = Math.floor(desired / MAX_SLOTS)
    for (let i = tab * MAX_SLOTS; i < (tab + 1) * MAX_SLOTS; i++) {
      if (!this.chestItems[i]) return i
    }
    for (let i = 0; i < CHEST_CAPACITY; i++) {
      if (!this.chestItems[i]) return i
    }
    return null
  }

  /** Double-click transfer: chest item → bag, or bag item → the first free chest
   *  slot on the current tab. Same server-validated path as a cross-panel drag. */
  private quickTransfer(slot: Slot, item: ClientInventoryItem) {
    this.hideItemDetails()
    if (!this.chestId || !this.socket?.connected) {
      this.showFeedback('Not connected to the server.')
      return
    }
    if (slot.panel === 'chest') {
      this.socket.emit('chest:transfer', {
        chestId: this.chestId, itemId: item.id, direction: 'from_chest',
      })
    } else {
      const toSlot = this.pickChestSlot(this.activeTab * MAX_SLOTS)
      if (toSlot === null) { this.showFeedback('The chest is full.'); return }
      this.socket.emit('chest:transfer', {
        chestId: this.chestId, itemId: item.id, direction: 'to_chest', toSlot,
      })
    }
  }

  // ── Item detail panel (single click) ───────────────────────────────────────

  private hideItemDetails() {
    this.detailPanel?.destroy()
    this.detailPanel = null
  }

  private attrLabel(type: string): string {
    return type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  }

  /** Floating panel near (x, y) showing the item's full stats. */
  private showItemDetails(item: ClientInventoryItem, x: number, y: number) {
    this.hideItemDetails()

    const rarCol = RARITY_COLOR[item.rarity] ?? RARITY_COLOR.common
    const rarHex = rarCol.toString(16).padStart(6, '0')
    const rarName = item.rarity.charAt(0).toUpperCase() + item.rarity.slice(1)
    const slot = item.equipSlot ?? ''

    const lines: string[] = []
    if (item.baseDamage) lines.push(`Damage: ${item.baseDamage.min}–${item.baseDamage.max}`)
    if (typeof item.baseDefense === 'number') lines.push(`Defense: ${item.baseDefense}`)
    for (const a of item.attributes ?? []) lines.push(`+${a.value} ${this.attrLabel(a.type)}`)
    let bonuses: string
    if (lines.length) {
      bonuses = lines.join('\n')
    } else {
      const raw = Object.entries(item.stats ?? {})
        .filter((e): e is [string, number] => typeof e[1] === 'number' && e[1] !== 0)
      bonuses = raw.length ? raw.map(([k, v]) => `+${v} ${this.attrLabel(k)}`).join('\n') : 'No bonuses'
    }

    const padX = 12, padY = 10, gap = 4
    const name = this.add.text(0, 0, `${item.icon}  ${item.name}`, {
      fontSize: '14px', fontFamily: 'Georgia, serif', color: '#ffffff', fontStyle: 'bold',
      wordWrap: { width: 280 },
    }).setOrigin(0, 0)
    const sub = this.add.text(0, 0, `${rarName}${slot ? '  ·  ' + slot : ''}`, {
      fontSize: '11px', fontFamily: 'Arial, sans-serif', color: `#${rarHex}`,
    }).setOrigin(0, 0)
    const stats = this.add.text(0, 0, bonuses, {
      fontSize: '12px', fontFamily: 'Arial, sans-serif', color: '#9bd0ff', lineSpacing: 3,
    }).setOrigin(0, 0)

    const w = Math.min(Math.max(name.width, sub.width, stats.width) + padX * 2, 320)
    const h = name.height + sub.height + stats.height + gap * 2 + padY * 2
    // Anchor near the cursor, clamped on-screen.
    let px = x + 14
    let py = y + 14
    if (px + w > GAME_WIDTH - 8) px = x - w - 14
    if (py + h > GAME_HEIGHT - 8) py = GAME_HEIGHT - 8 - h
    px = Math.max(8, px)
    py = Math.max(8, py)

    name.setPosition(px + padX, py + padY)
    sub.setPosition(px + padX, py + padY + name.height + gap)
    stats.setPosition(px + padX, py + padY + name.height + sub.height + gap * 2)

    const bg = this.add.graphics()
    bg.fillStyle(0x0a0a1e, 0.98).fillRoundedRect(px, py, w, h, 8)
    bg.lineStyle(1.5, rarCol, 0.9).strokeRoundedRect(px, py, w, h, 8)

    this.detailPanel = this.add.container(0, 0).setDepth(60).add([bg, name, sub, stats])
  }

  // ── Drag cleanup ───────────────────────────────────────────────────────────

  private cleanupDrag() {
    this.dragGfx?.destroy(); this.dragGfx = null
    this.hoverGfx.clear()
    this.dragging = false
  }
}
