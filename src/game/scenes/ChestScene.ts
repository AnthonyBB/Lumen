import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT } from '../constants'

// ── Types ─────────────────────────────────────────────────────────────────────

type Rarity   = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'
type IconType = 'sword' | 'shield' | 'helm' | 'ring' | 'boots' | 'necklace' | 'belt' | 'gloves' | 'earring' | 'potion' | 'book'

interface ChestItem {
  id:       string
  name:     string
  itemType: string
  rarity:   Rarity
  stats:    Record<string, number>
  quantity: number
  icon:     string
}

// Logical slot descriptor — position + which panel it belongs to
interface Slot {
  x:      number   // top-left pixel x
  y:      number   // top-left pixel y
  panel:  'chest' | 'inventory'
  index:  number   // 0-based index within its panel's item array
}

// ── Mock data ─────────────────────────────────────────────────────────────────

const MOCK_CHEST_ITEMS: ChestItem[] = [
  { id: 'chest_item_1', name: 'Health Potion', itemType: 'consumable', rarity: 'common',   stats: { hp: 30 },          quantity: 3, icon: 'potion' },
  { id: 'chest_item_2', name: 'Scholar Tome',  itemType: 'offHand',    rarity: 'uncommon', stats: { intelligence: 4 }, quantity: 1, icon: 'book'   },
]

const MOCK_INVENTORY_ITEMS: ChestItem[] = [
  { id: 'sword_001',  name: 'Worn Sword',  itemType: 'mainHand', rarity: 'common',   stats: { attack: 5 },  quantity: 1, icon: 'sword'  },
  { id: 'shield_001', name: 'Worn Shield', itemType: 'offHand',  rarity: 'common',   stats: { defense: 5 }, quantity: 1, icon: 'shield' },
  { id: 'ring_001',   name: 'Silver Ring', itemType: 'ring1',    rarity: 'uncommon', stats: { spirit: 3 },  quantity: 1, icon: 'ring'   },
]

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
  private chestItems:     ChestItem[] = []
  private inventoryItems: ChestItem[] = []

  // Pre-computed slot grid positions (set once in create, never change)
  private chestSlots:     Slot[] = []
  private inventorySlots: Slot[] = []

  // All dynamic game objects that get destroyed/rebuilt when items change
  private itemLayer: Phaser.GameObjects.GameObject[] = []

  // Drag state — managed entirely through scene pointer events (no Phaser drag system)
  private dragging   = false
  private dragItem:  ChestItem | null = null
  private dragFrom:  Slot | null = null
  private dragGfx:   Phaser.GameObjects.Graphics | null = null
  private dragLabel: Phaser.GameObjects.Text | null = null

  // Hover highlight (single reused graphics object)
  private hoverGfx!: Phaser.GameObjects.Graphics

  private escKey!: Phaser.Input.Keyboard.Key

  constructor() { super({ key: 'ChestScene' }) }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  create() {
    // Deep-copy mock data
    this.chestItems     = MOCK_CHEST_ITEMS.map(i => ({ ...i, stats: { ...i.stats } }))
    this.inventoryItems = MOCK_INVENTORY_ITEMS.map(i => ({ ...i, stats: { ...i.stats } }))

    // Build fixed slot grids
    this.chestSlots     = this.buildSlotGrid('chest')
    this.inventorySlots = this.buildSlotGrid('inventory')

    // Draw the background, panels, header, footer — never rebuilt
    this.drawStaticLayer()

    // Reusable hover-highlight object (on top of everything static)
    this.hoverGfx = this.add.graphics().setDepth(20)

    // First draw of item visuals
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
  // Destroyed and redrawn on every inventory change.

  private rebuildItemLayer() {
    this.itemLayer.forEach(o => o.destroy())
    this.itemLayer = []

    // Panel titles + counts (depth 2, above slot backgrounds)
    this.push(this.add.text(LEFT_X + LEFT_W / 2, PANEL_Y + 16, 'Chest Storage', {
      fontSize: '15px', fontFamily: 'Georgia, serif', color: '#ffd700', fontStyle: 'bold',
    }).setOrigin(0.5, 0).setDepth(2))

    this.push(this.add.text(LEFT_X + LEFT_W / 2, PANEL_Y + 34, `${this.chestItems.length} / ${MAX_SLOTS}`, {
      fontSize: '11px', fontFamily: 'Arial, sans-serif', color: '#666688',
    }).setOrigin(0.5, 0).setDepth(2))

    this.push(this.add.text(RIGHT_X + RIGHT_W / 2, PANEL_Y + 16, 'Your Inventory', {
      fontSize: '15px', fontFamily: 'Georgia, serif', color: '#ffd700', fontStyle: 'bold',
    }).setOrigin(0.5, 0).setDepth(2))

    this.push(this.add.text(RIGHT_X + RIGHT_W / 2, PANEL_Y + 34, `${this.inventoryItems.length} items`, {
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

  private drawItemInSlot(slot: Slot, item: ChestItem) {
    const { x, y } = slot
    const col = RARITY_COLOR[item.rarity]

    // Coloured slot highlight + rarity border
    const g = this.push(this.add.graphics().setDepth(2))
    g.fillStyle(0x1a1a3a, 1)
    g.fillRoundedRect(x, y, SLOT_W, SLOT_H, 8)
    g.lineStyle(1.5, col, 1)
    g.strokeRoundedRect(x, y, SLOT_W, SLOT_H, 8)

    // Icon
    const ig = this.push(this.add.graphics().setDepth(3))
    this.drawItemIcon(ig, x + SLOT_W / 2, y + 26, item.icon as IconType, col, 0.85)

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
  private hitTest(px: number, py: number): { slot: Slot; item: ChestItem | null } | null {
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

    // Ghost graphics — drawn centred on the cursor, depth 50 (above everything)
    const col = RARITY_COLOR[hit.item.rarity]
    const gfx = this.add.graphics().setDepth(50)
    gfx.fillStyle(0x0d0d28, 0.92)
    gfx.fillRoundedRect(-SLOT_W / 2, -SLOT_H / 2, SLOT_W, SLOT_H, 8)
    gfx.lineStyle(2, col, 1)
    gfx.strokeRoundedRect(-SLOT_W / 2, -SLOT_H / 2, SLOT_W, SLOT_H, 8)
    this.drawItemIcon(gfx, 0, -4, hit.item.icon as IconType, col, 0.85)
    gfx.setPosition(ptr.x, ptr.y)
    this.dragGfx = gfx

    // Ghost label
    const nameStr = hit.item.name.length > 10 ? hit.item.name.slice(0, 9) + '…' : hit.item.name
    const hex = col.toString(16).padStart(6, '0')
    this.dragLabel = this.add.text(ptr.x, ptr.y + SLOT_H / 2 - 10, nameStr, {
      fontSize: '9px', fontFamily: 'Arial, sans-serif', color: `#${hex}`, fontStyle: 'bold',
    }).setOrigin(0.5, 0.5).setDepth(51)

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
    if (this.dragLabel) this.dragLabel.setPosition(ptr.x, ptr.y + SLOT_H / 2 - 10)

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

    // Always clean up ghost first
    this.cleanupDrag()

    if (!this.dragFrom || !this.dragItem) return

    const hit = this.hitTest(ptr.x, ptr.y)

    if (hit && hit.slot.panel !== this.dragFrom.panel) {
      // Cross-panel transfer
      const item = this.dragItem
      if (this.dragFrom.panel === 'chest') {
        // Chest → Inventory
        this.chestItems     = this.chestItems.filter(i => i.id !== item.id)
        this.inventoryItems = [...this.inventoryItems, item]
      } else {
        // Inventory → Chest
        if (this.chestItems.length < MAX_SLOTS) {
          this.inventoryItems = this.inventoryItems.filter(i => i.id !== item.id)
          this.chestItems     = [...this.chestItems, item]
        }
      }
    }

    this.dragFrom = null
    this.dragItem = null
    this.rebuildItemLayer()
  }

  // ── Drag cleanup ───────────────────────────────────────────────────────────

  private cleanupDrag() {
    this.dragGfx?.destroy();   this.dragGfx   = null
    this.dragLabel?.destroy(); this.dragLabel = null
    this.hoverGfx.clear()
    this.dragging = false
  }

  // ── Item icon drawing ──────────────────────────────────────────────────────

  private drawItemIcon(
    gfx:      Phaser.GameObjects.Graphics,
    x:        number,
    y:        number,
    iconType: IconType,
    color:    number,
    scale:    number = 1,
  ) {
    const s = scale
    gfx.fillStyle(color, 1)

    switch (iconType) {
      case 'sword': {
        gfx.fillTriangle(x, y - 18 * s, x - 5 * s, y, x + 5 * s, y)
        gfx.fillTriangle(x, y + 8 * s, x - 5 * s, y, x + 5 * s, y)
        gfx.fillStyle(0xccaa44, 1)
        gfx.fillRect(x - 10 * s, y - 2 * s, 20 * s, 4 * s)
        gfx.fillStyle(0x886622, 1)
        gfx.fillRect(x - 2.5 * s, y + 2 * s, 5 * s, 10 * s)
        gfx.fillStyle(color, 1)
        gfx.fillCircle(x, y + 13 * s, 3.5 * s)
        break
      }
      case 'shield': {
        gfx.fillStyle(color, 1)
        gfx.fillRect(x - 11 * s, y - 14 * s, 22 * s, 20 * s)
        gfx.fillTriangle(x - 11 * s, y + 6 * s, x + 11 * s, y + 6 * s, x, y + 18 * s)
        gfx.fillStyle(0xccaa44, 1)
        gfx.fillCircle(x, y - 2 * s, 5 * s)
        gfx.lineStyle(1.5 * s, 0xccaa44, 0.7)
        gfx.strokeRect(x - 11 * s, y - 14 * s, 22 * s, 20 * s)
        break
      }
      case 'helm': {
        gfx.fillStyle(color, 1)
        gfx.fillCircle(x, y - 4 * s, 14 * s)
        gfx.fillStyle(0x1a1a3a, 1)
        gfx.fillRect(x - 15 * s, y - 4 * s, 30 * s, 15 * s)
        gfx.fillStyle(color, 1)
        gfx.fillRect(x - 14 * s, y - 4 * s, 5 * s, 12 * s)
        gfx.fillRect(x + 9 * s, y - 4 * s, 5 * s, 12 * s)
        gfx.fillStyle(0x000000, 0.45)
        gfx.fillRect(x - 9 * s, y + 1 * s, 18 * s, 4 * s)
        break
      }
      case 'ring': {
        gfx.lineStyle(3 * s, color, 1)
        gfx.strokeCircle(x, y + 3 * s, 10 * s)
        gfx.fillStyle(0xffffff, 0.85)
        gfx.fillCircle(x, y - 6 * s, 3.5 * s)
        gfx.fillStyle(color, 0.7)
        gfx.fillCircle(x, y - 6 * s, 2 * s)
        break
      }
      case 'boots': {
        gfx.fillStyle(color, 1)
        gfx.fillRect(x - 7 * s, y - 15 * s, 13 * s, 18 * s)
        gfx.fillRect(x - 7 * s, y + 3 * s, 17 * s, 8 * s)
        gfx.fillCircle(x + 9 * s, y + 7 * s, 4 * s)
        break
      }
      case 'necklace': {
        gfx.lineStyle(2 * s, color, 0.85)
        gfx.strokeCircle(x, y - 4 * s, 12 * s)
        gfx.fillStyle(0x1a1a3a, 1)
        gfx.fillRect(x - 14 * s, y - 4 * s, 28 * s, 16 * s)
        gfx.fillStyle(color, 1)
        gfx.fillTriangle(x, y + 4 * s, x - 5 * s, y - 2 * s, x + 5 * s, y - 2 * s)
        gfx.fillStyle(0xffffff, 0.75)
        gfx.fillCircle(x, y + 1 * s, 3 * s)
        break
      }
      case 'belt': {
        gfx.fillStyle(color, 1)
        gfx.fillRect(x - 18 * s, y - 5 * s, 36 * s, 10 * s)
        gfx.fillStyle(0xffd700, 1)
        gfx.fillRect(x - 5 * s, y - 6 * s, 10 * s, 12 * s)
        gfx.lineStyle(1.5 * s, 0x886600, 1)
        gfx.strokeRect(x - 5 * s, y - 6 * s, 10 * s, 12 * s)
        break
      }
      case 'gloves': {
        gfx.fillStyle(color, 1)
        gfx.fillRect(x - 9 * s, y - 6 * s, 18 * s, 14 * s)
        gfx.fillRect(x + 9 * s, y - 8 * s, 6 * s, 8 * s)
        gfx.fillRect(x - 9 * s, y - 12 * s, 4 * s, 7 * s)
        gfx.fillRect(x - 3.5 * s, y - 13 * s, 4 * s, 8 * s)
        gfx.fillRect(x + 2 * s, y - 12 * s, 4 * s, 7 * s)
        break
      }
      case 'earring': {
        gfx.fillStyle(color, 1)
        gfx.fillCircle(x, y - 8 * s, 5 * s)
        gfx.fillStyle(0xffffff, 0.65)
        gfx.fillCircle(x - 1 * s, y - 9 * s, 2 * s)
        gfx.fillStyle(color, 0.9)
        gfx.fillCircle(x, y + 4 * s, 4 * s)
        gfx.lineStyle(1.5 * s, color, 0.8)
        gfx.lineBetween(x, y - 3 * s, x, y)
        break
      }
      case 'potion': {
        gfx.fillStyle(color, 1)
        gfx.fillCircle(x, y + 6 * s, 11 * s)
        gfx.fillRect(x - 3 * s, y - 9 * s, 6 * s, 12 * s)
        gfx.fillStyle(0x92400e, 1)
        gfx.fillRect(x - 4 * s, y - 13 * s, 8 * s, 5 * s)
        gfx.fillStyle(0xffffff, 0.3)
        gfx.fillCircle(x - 4 * s, y + 2 * s, 4 * s)
        break
      }
      case 'book': {
        gfx.fillStyle(color, 1)
        gfx.fillRect(x - 13 * s, y - 14 * s, 26 * s, 28 * s)
        gfx.fillStyle(0x1a3080, 1)
        gfx.fillRect(x - 13 * s, y - 14 * s, 5 * s, 28 * s)
        gfx.fillStyle(0xf5f0e0, 0.9)
        gfx.fillRect(x - 7 * s, y - 12 * s, 18 * s, 24 * s)
        gfx.fillStyle(0x888888, 0.5)
        for (let l = 0; l < 4; l++) gfx.fillRect(x - 5 * s, y - 8 * s + l * 6 * s, 14 * s, 2 * s)
        break
      }
    }
  }
}
