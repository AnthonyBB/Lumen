import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT } from '../constants'

// ── Types ─────────────────────────────────────────────────────────────────────

type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'
type IconType = 'sword' | 'shield' | 'helm' | 'ring' | 'boots' | 'necklace' | 'belt' | 'gloves' | 'earring' | 'potion' | 'book'

interface ChestItem {
  id: string
  name: string
  itemType: string
  rarity: Rarity
  stats: Record<string, number>
  quantity: number
  icon: string
}

// ── Mock data ─────────────────────────────────────────────────────────────────

const MOCK_CHEST_ITEMS: ChestItem[] = [
  { id: 'chest_item_1', name: 'Health Potion', itemType: 'consumable', rarity: 'common',   stats: { hp: 30 },           quantity: 3, icon: 'potion' },
  { id: 'chest_item_2', name: 'Scholar Tome',  itemType: 'offHand',    rarity: 'uncommon', stats: { intelligence: 4 },  quantity: 1, icon: 'book'   },
]

const MOCK_INVENTORY_ITEMS: ChestItem[] = [
  { id: 'sword_001',  name: 'Worn Sword',   itemType: 'mainHand', rarity: 'common',   stats: { attack: 5 },   quantity: 1, icon: 'sword'  },
  { id: 'shield_001', name: 'Worn Shield',  itemType: 'offHand',  rarity: 'common',   stats: { defense: 5 },  quantity: 1, icon: 'shield' },
  { id: 'ring_001',   name: 'Silver Ring',  itemType: 'ring1',    rarity: 'uncommon', stats: { spirit: 3 },   quantity: 1, icon: 'ring'   },
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

// Panel layout
const PANEL_Y     = 80
const PANEL_H     = GAME_HEIGHT - 120
const LEFT_X      = 20
const LEFT_W      = 560
const DIVIDER_X   = LEFT_X + LEFT_W + 20
const RIGHT_X     = DIVIDER_X + 40
const RIGHT_W     = GAME_WIDTH - RIGHT_X - 20

// ── Scene ─────────────────────────────────────────────────────────────────────

export class ChestScene extends Phaser.Scene {
  private chestItems: ChestItem[] = []
  private inventoryItems: ChestItem[] = []

  private selectedChestItem: ChestItem | null = null
  private selectedInventoryItem: ChestItem | null = null

  private chestPanel!:     Phaser.GameObjects.Container
  private inventoryPanel!: Phaser.GameObjects.Container

  // Drag state
  private dragGhost: Phaser.GameObjects.Graphics | null = null
  private dragItem:  ChestItem | null = null
  private dragSource: 'chest' | 'inventory' | null = null

  private escKey!: Phaser.Input.Keyboard.Key

  constructor() { super({ key: 'ChestScene' }) }

  create() {
    // Deep-copy mock data so transfers persist within the session
    this.chestItems     = MOCK_CHEST_ITEMS.map(i => ({ ...i, stats: { ...i.stats } }))
    this.inventoryItems = MOCK_INVENTORY_ITEMS.map(i => ({ ...i, stats: { ...i.stats } }))
    this.selectedChestItem     = null
    this.selectedInventoryItem = null

    this.drawBackground()
    this.drawHeader()
    this.drawFooter()
    this.drawDivider()

    this.chestPanel     = this.add.container(0, 0)
    this.inventoryPanel = this.add.container(0, 0)
    this.buildChestPanel()
    this.buildInventoryPanel()

    this.escKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC)
  }

  update() {
    if (Phaser.Input.Keyboard.JustDown(this.escKey)) {
      this.scene.start('WorldScene')
    }
  }

  // ── Background ───────────────────────────────────────────────────────────────

  private drawBackground() {
    const bg = this.add.graphics()
    bg.fillStyle(0x0a0a1e, 1)
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)
    // Faint horizontal atmosphere lines
    bg.lineStyle(1, 0x111133, 0.6)
    for (let y = 0; y < GAME_HEIGHT; y += 24) {
      bg.lineBetween(0, y, GAME_WIDTH, y)
    }
    // Star-field
    const rng = new Phaser.Math.RandomDataGenerator(['chest_bg'])
    bg.fillStyle(0xffffff, 0.3)
    for (let i = 0; i < 60; i++) {
      bg.fillRect(rng.integerInRange(0, GAME_WIDTH), rng.integerInRange(0, GAME_HEIGHT), 1, 1)
    }
  }

  // ── Header ────────────────────────────────────────────────────────────────────

  private drawHeader() {
    const hg = this.add.graphics()
    hg.fillStyle(0x12122e, 1)
    hg.fillRect(0, 0, GAME_WIDTH, 70)
    hg.lineStyle(2, 0xffd700, 0.7)
    hg.lineBetween(0, 70, GAME_WIDTH, 70)

    // Gold decorative border lines
    hg.lineStyle(1, 0xffd700, 0.45)
    hg.lineBetween(50, 35, 450, 35)
    hg.lineBetween(GAME_WIDTH - 450, 35, GAME_WIDTH - 50, 35)

    // Draw a small chest icon in the header (graphics)
    const cx = GAME_WIDTH / 2 - 120
    const cy = 35
    const cg = this.add.graphics()
    cg.fillStyle(0x92400e, 1)
    cg.fillRect(cx - 14, cy - 6, 28, 13)
    cg.fillStyle(0xa16207, 1)
    cg.fillRect(cx - 14, cy - 14, 28, 9)
    cg.fillStyle(0x374151, 1)
    cg.fillRect(cx - 14, cy - 3, 28, 3)
    cg.fillStyle(0xfbbf24, 1)
    cg.fillRect(cx - 3, cy - 4, 6, 5)
    cg.lineStyle(1, 0x451a03, 0.9)
    cg.strokeRect(cx - 14, cy - 14, 28, 22)

    this.add.text(GAME_WIDTH / 2, 35, 'Personal Chest', {
      fontSize: '26px', fontFamily: 'Georgia, serif',
      color: '#ffd700', fontStyle: 'bold',
    }).setOrigin(0.5, 0.5)
  }

  // ── Footer ────────────────────────────────────────────────────────────────────

  private drawFooter() {
    const fg = this.add.graphics()
    fg.fillStyle(0x12122e, 1)
    fg.fillRect(0, GAME_HEIGHT - 28, GAME_WIDTH, 28)
    fg.lineStyle(1, 0x3333aa, 0.8)
    fg.lineBetween(0, GAME_HEIGHT - 28, GAME_WIDTH, GAME_HEIGHT - 28)
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 14, 'Press  ESC  to close', {
      fontSize: '12px', fontFamily: 'Arial, sans-serif', color: '#555577',
    }).setOrigin(0.5, 0.5)
  }

  // ── Center divider ────────────────────────────────────────────────────────────

  private drawDivider() {
    const dg = this.add.graphics()
    dg.lineStyle(2, 0xffd700, 0.5)
    dg.lineBetween(DIVIDER_X + 18, PANEL_Y + 10, DIVIDER_X + 18, PANEL_Y + PANEL_H - 10)
  }

  // ── Panel frames ─────────────────────────────────────────────────────────────

  private drawPanelFrame(x: number, y: number, w: number, h: number) {
    const g = this.add.graphics()
    g.fillStyle(0x12122e, 1)
    g.fillRoundedRect(x, y, w, h, 10)
    g.lineStyle(1, 0x2a2a5a, 1)
    g.strokeRoundedRect(x, y, w, h, 10)
  }

  // ── Chest panel (left) ────────────────────────────────────────────────────────

  buildChestPanel() {
    this.chestPanel.destroy()
    this.chestPanel = this.add.container(0, 0)

    this.drawPanelFrame(LEFT_X, PANEL_Y, LEFT_W, PANEL_H)

    // Panel title
    this.add.text(LEFT_X + LEFT_W / 2, PANEL_Y + 16, 'Chest Storage', {
      fontSize: '15px', fontFamily: 'Georgia, serif', color: '#ffd700', fontStyle: 'bold',
    }).setOrigin(0.5, 0)

    this.add.text(LEFT_X + LEFT_W / 2, PANEL_Y + 34, `${this.chestItems.length} / ${MAX_SLOTS}`, {
      fontSize: '11px', fontFamily: 'Arial, sans-serif', color: '#666688',
    }).setOrigin(0.5, 0)

    const gridX = LEFT_X + (LEFT_W - (COLS * (SLOT_W + SLOT_PAD) - SLOT_PAD)) / 2
    const gridY = PANEL_Y + 58

    for (let i = 0; i < MAX_SLOTS; i++) {
      const col = i % COLS
      const row = Math.floor(i / COLS)
      const sx  = gridX + col * (SLOT_W + SLOT_PAD)
      const sy  = gridY + row * (SLOT_H + SLOT_PAD)
      const item = this.chestItems[i] ?? null
      this.createSlot(this.chestPanel, sx, sy, item, 'chest', i)
    }
  }

  // ── Inventory panel (right) ───────────────────────────────────────────────────

  buildInventoryPanel() {
    this.inventoryPanel.destroy()
    this.inventoryPanel = this.add.container(0, 0)

    this.drawPanelFrame(RIGHT_X, PANEL_Y, RIGHT_W, PANEL_H)

    // Panel title
    this.add.text(RIGHT_X + RIGHT_W / 2, PANEL_Y + 16, 'Your Inventory', {
      fontSize: '15px', fontFamily: 'Georgia, serif', color: '#ffd700', fontStyle: 'bold',
    }).setOrigin(0.5, 0)

    this.add.text(RIGHT_X + RIGHT_W / 2, PANEL_Y + 34, `${this.inventoryItems.length} items`, {
      fontSize: '11px', fontFamily: 'Arial, sans-serif', color: '#666688',
    }).setOrigin(0.5, 0)

    const gridX = RIGHT_X + (RIGHT_W - (COLS * (SLOT_W + SLOT_PAD) - SLOT_PAD)) / 2
    const gridY = PANEL_Y + 58

    for (let i = 0; i < MAX_SLOTS; i++) {
      const col = i % COLS
      const row = Math.floor(i / COLS)
      const sx  = gridX + col * (SLOT_W + SLOT_PAD)
      const sy  = gridY + row * (SLOT_H + SLOT_PAD)
      const item = this.inventoryItems[i] ?? null
      this.createSlot(this.inventoryPanel, sx, sy, item, 'inventory', i)
    }
  }

  // ── Slot creation ─────────────────────────────────────────────────────────────

  private createSlot(
    container: Phaser.GameObjects.Container,
    x: number,
    y: number,
    item: ChestItem | null,
    source: 'chest' | 'inventory',
    _index: number
  ) {
    const isSelected =
      (source === 'chest'     && item && this.selectedChestItem?.id     === item.id) ||
      (source === 'inventory' && item && this.selectedInventoryItem?.id === item.id)

    // Slot background
    const gfx = this.add.graphics()
    const drawSlot = (hover: boolean) => {
      gfx.clear()
      if (item) {
        const rarCol = RARITY_COLOR[item.rarity]
        gfx.fillStyle(0x1a1a3a, 1)
        gfx.fillRoundedRect(x, y, SLOT_W, SLOT_H, 8)
        // Border: gold if selected/hovered, rarity color otherwise
        gfx.lineStyle(isSelected || hover ? 2.5 : 1.5, isSelected ? 0xffd700 : hover ? 0xffd700 : rarCol, 1)
        gfx.strokeRoundedRect(x, y, SLOT_W, SLOT_H, 8)
      } else {
        gfx.fillStyle(0x1a1a3a, 1)
        gfx.fillRoundedRect(x, y, SLOT_W, SLOT_H, 8)
        gfx.lineStyle(1, hover ? 0x555577 : 0x333355, 0.9)
        gfx.strokeRoundedRect(x, y, SLOT_W, SLOT_H, 8)
      }
    }
    drawSlot(false)
    container.add(gfx)

    if (item) {
      // Item icon
      const iconGfx = this.add.graphics()
      this.drawItemIcon(iconGfx, x + SLOT_W / 2, y + 28, item.icon as IconType, RARITY_COLOR[item.rarity], 0.9)
      container.add(iconGfx)

      // Item name (truncated)
      const nameStr = item.name.length > 10 ? item.name.slice(0, 9) + '…' : item.name
      const rarHex  = RARITY_COLOR[item.rarity].toString(16).padStart(6, '0')
      container.add(this.add.text(x + SLOT_W / 2, y + SLOT_H - 22, nameStr, {
        fontSize: '9px', fontFamily: 'Arial, sans-serif', color: `#${rarHex}`, fontStyle: 'bold',
      }).setOrigin(0.5, 0.5))

      // Quantity badge if > 1
      if (item.quantity > 1) {
        container.add(this.add.text(x + SLOT_W - 5, y + 5, `x${item.quantity}`, {
          fontSize: '9px', fontFamily: 'Arial, sans-serif', color: '#ffffff',
          backgroundColor: '#00000088', padding: { x: 2, y: 1 },
        }).setOrigin(1, 0))
      }

      // Hit zone — interactive and draggable
      const hit = this.add.rectangle(x + SLOT_W / 2, y + SLOT_H / 2, SLOT_W, SLOT_H, 0, 0)
        .setInteractive({ useHandCursor: true, draggable: true })

      hit.on('pointerover', () => drawSlot(true))
      hit.on('pointerout',  () => drawSlot(false))

      hit.on('pointerdown', () => {
        if (source === 'chest') {
          this.selectedChestItem = (this.selectedChestItem?.id === item.id) ? null : item
          this.selectedInventoryItem = null
        } else {
          this.selectedInventoryItem = (this.selectedInventoryItem?.id === item.id) ? null : item
          this.selectedChestItem = null
        }
        this.buildChestPanel()
        this.buildInventoryPanel()
      })

      hit.on('dragstart', (_pointer: Phaser.Input.Pointer) => {
        this.dragItem   = item
        this.dragSource = source

        // Create ghost at current pointer position
        const ghost = this.add.graphics()
        ghost.setDepth(100)
        // Draw a semi-transparent slot background
        ghost.fillStyle(0x1a1a3a, 0.6)
        ghost.fillRoundedRect(-SLOT_W / 2, -SLOT_H / 2, SLOT_W, SLOT_H, 8)
        ghost.lineStyle(2, RARITY_COLOR[item.rarity], 0.8)
        ghost.strokeRoundedRect(-SLOT_W / 2, -SLOT_H / 2, SLOT_W, SLOT_H, 8)
        // Draw item icon centered on ghost origin
        this.drawItemIcon(ghost, 0, 4, item.icon as IconType, RARITY_COLOR[item.rarity], 0.9)
        ghost.setAlpha(0.6)
        this.dragGhost = ghost
      })

      hit.on('drag', (_pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => {
        if (this.dragGhost) {
          this.dragGhost.setPosition(dragX, dragY)
        }
      })

      hit.on('dragend', (_pointer: Phaser.Input.Pointer, dragX: number, _dragY: number) => {
        if (this.dragGhost) {
          this.dragGhost.destroy()
          this.dragGhost = null
        }

        if (!this.dragItem || !this.dragSource) return

        // Determine which panel the item was dropped on by x coordinate
        const inChestArea     = dragX >= LEFT_X && dragX <= LEFT_X + LEFT_W
        const inInventoryArea = dragX >= RIGHT_X

        const droppedOnChest     = inChestArea
        const droppedOnInventory = inInventoryArea

        if (this.dragSource === 'chest' && droppedOnInventory) {
          // Dragged from chest → inventory panel: take
          this.selectedChestItem = this.dragItem
          this.handleTake()
        } else if (this.dragSource === 'inventory' && droppedOnChest) {
          // Dragged from inventory → chest panel: store
          this.selectedInventoryItem = this.dragItem
          this.handleStore()
        } else {
          // Dropped on same panel or outside — reset visual state
          this.buildChestPanel()
          this.buildInventoryPanel()
        }

        this.dragItem   = null
        this.dragSource = null
      })

      container.add(hit)
    } else {
      // Empty slot faint label
      container.add(this.add.text(x + SLOT_W / 2, y + SLOT_H / 2, 'empty', {
        fontSize: '9px', fontFamily: 'Arial, sans-serif', color: '#222233',
      }).setOrigin(0.5, 0.5))
    }
  }

  // ── Transfer actions ──────────────────────────────────────────────────────────

  private handleTake() {
    if (!this.selectedChestItem) return
    const item = this.selectedChestItem
    this.chestItems = this.chestItems.filter(i => i.id !== item.id)
    this.inventoryItems.push(item)
    this.selectedChestItem = null
    this.buildChestPanel()
    this.buildInventoryPanel()
  }

  private handleStore() {
    if (!this.selectedInventoryItem) return
    if (this.chestItems.length >= MAX_SLOTS) return
    const item = this.selectedInventoryItem
    this.inventoryItems = this.inventoryItems.filter(i => i.id !== item.id)
    this.chestItems.push(item)
    this.selectedInventoryItem = null
    this.buildChestPanel()
    this.buildInventoryPanel()
  }

  // ── Item icon drawing ─────────────────────────────────────────────────────────

  private drawItemIcon(
    gfx: Phaser.GameObjects.Graphics,
    x: number, y: number,
    iconType: IconType,
    color: number,
    scale: number = 1
  ) {
    const s = scale
    gfx.fillStyle(color, 1)

    switch (iconType) {
      case 'sword': {
        gfx.fillTriangle(x, y - 18 * s, x - 5 * s, y, x + 5 * s, y)
        gfx.fillTriangle(x, y + 8 * s,  x - 5 * s, y, x + 5 * s, y)
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
        gfx.fillRect(x + 9 * s,  y - 4 * s, 5 * s, 12 * s)
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
        gfx.fillRect(x + 9 * s,  y - 8 * s,  6 * s, 8 * s)
        gfx.fillRect(x - 9 * s,  y - 12 * s, 4 * s, 7 * s)
        gfx.fillRect(x - 3.5 * s, y - 13 * s, 4 * s, 8 * s)
        gfx.fillRect(x + 2 * s,  y - 12 * s, 4 * s, 7 * s)
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
        // Round flask: circle top + narrow neck + wider body
        gfx.fillStyle(color, 1)
        // Body (wider)
        gfx.fillCircle(x, y + 6 * s, 11 * s)
        // Neck
        gfx.fillRect(x - 3 * s, y - 9 * s, 6 * s, 12 * s)
        // Cork
        gfx.fillStyle(0x92400e, 1)
        gfx.fillRect(x - 4 * s, y - 13 * s, 8 * s, 5 * s)
        // Shine
        gfx.fillStyle(0xffffff, 0.3)
        gfx.fillCircle(x - 4 * s, y + 2 * s, 4 * s)
        break
      }
      case 'book': {
        // Book rectangle with spine line
        gfx.fillStyle(color, 1)
        gfx.fillRect(x - 13 * s, y - 14 * s, 26 * s, 28 * s)
        // Spine
        gfx.fillStyle(0x1a3080, 1)
        gfx.fillRect(x - 13 * s, y - 14 * s, 5 * s, 28 * s)
        // Pages
        gfx.fillStyle(0xf5f0e0, 0.9)
        gfx.fillRect(x - 7 * s, y - 12 * s, 18 * s, 24 * s)
        // Text lines
        gfx.fillStyle(0x888888, 0.5)
        for (let l = 0; l < 4; l++) {
          gfx.fillRect(x - 5 * s, y - 8 * s + l * 6 * s, 14 * s, 2 * s)
        }
        break
      }
    }
  }
}
