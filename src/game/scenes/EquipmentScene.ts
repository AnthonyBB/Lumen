import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT } from '../constants'

// ── Types ─────────────────────────────────────────────────────────────────────

type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'
type IconType = 'sword' | 'shield' | 'helm' | 'ring' | 'boots' | 'necklace' | 'belt' | 'gloves' | 'earring'
type SlotKey = 'mainHand' | 'offHand' | 'helm' | 'earring' | 'ring1' | 'ring2' | 'belt' | 'shoes' | 'gloves' | 'necklace'

interface ItemStats {
  attack?: number
  defense?: number
  spirit?: number
  intelligence?: number
  dexterity?: number
}

interface InventoryItem {
  id: string
  name: string
  itemType: SlotKey
  rarity: Rarity
  stats: ItemStats
  icon: IconType
}

// ── Mock data ─────────────────────────────────────────────────────────────────

const MOCK_INVENTORY: InventoryItem[] = [
  { id: 'sword_001',    name: 'Worn Sword',       itemType: 'mainHand', rarity: 'common',   stats: { attack: 5 },                   icon: 'sword'    },
  { id: 'shield_001',   name: 'Worn Shield',       itemType: 'offHand',  rarity: 'common',   stats: { defense: 5 },                  icon: 'shield'   },
  { id: 'helm_001',     name: 'Leather Cap',       itemType: 'helm',     rarity: 'common',   stats: { defense: 2 },                  icon: 'helm'     },
  { id: 'ring_001',     name: 'Silver Ring',       itemType: 'ring1',    rarity: 'uncommon', stats: { spirit: 3 },                   icon: 'ring'     },
  { id: 'boots_001',    name: 'Traveler Boots',    itemType: 'shoes',    rarity: 'common',   stats: { dexterity: 2 },                icon: 'boots'    },
  { id: 'necklace_001', name: 'Amulet of Lumen',   itemType: 'necklace', rarity: 'rare',     stats: { intelligence: 5, spirit: 2 },  icon: 'necklace' },
]

const INITIAL_EQUIPPED: Record<SlotKey, InventoryItem | null> = {
  mainHand: null, offHand: null, helm: null, earring: null,
  ring1: null,    ring2: null,   belt: null, shoes: null,
  gloves: null,   necklace: null,
}

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
  necklace: 'Necklace',
}

// Slot positions — paper doll center at ~190, 360
const DOLL_CX = 190
const DOLL_CY = 360
const SLOT_POSITIONS: Record<SlotKey, { x: number; y: number }> = {
  helm:     { x: DOLL_CX,       y: DOLL_CY - 198 },
  earring:  { x: DOLL_CX + 90,  y: DOLL_CY - 165 },
  necklace: { x: DOLL_CX,       y: DOLL_CY - 118 },
  gloves:   { x: DOLL_CX - 110, y: DOLL_CY - 40  },
  mainHand: { x: DOLL_CX - 110, y: DOLL_CY + 30  },
  offHand:  { x: DOLL_CX + 110, y: DOLL_CY + 30  },
  belt:     { x: DOLL_CX,       y: DOLL_CY + 55  },
  ring1:    { x: DOLL_CX - 110, y: DOLL_CY + 115 },
  ring2:    { x: DOLL_CX + 110, y: DOLL_CY + 115 },
  shoes:    { x: DOLL_CX,       y: DOLL_CY + 178 },
}

const SLOT_ICON: Record<SlotKey, IconType> = {
  mainHand: 'sword',   offHand: 'shield', helm: 'helm',
  earring:  'earring', ring1:   'ring',   ring2: 'ring',
  belt:     'belt',    shoes:   'boots',  gloves: 'gloves',
  necklace: 'necklace',
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
  private equipped: Record<SlotKey, InventoryItem | null> = { ...INITIAL_EQUIPPED }
  private inventory: InventoryItem[] = []

  private slotContainerMap: Map<SlotKey, Phaser.GameObjects.Container> = new Map()
  private slotGfxMap:       Map<SlotKey, Phaser.GameObjects.Graphics>   = new Map()
  private inventoryContainer!: Phaser.GameObjects.Container
  private statsContainer!:     Phaser.GameObjects.Container
  private selectedItem: InventoryItem | null = null

  private iKey!:   Phaser.Input.Keyboard.Key
  private escKey!: Phaser.Input.Keyboard.Key

  constructor() {
    super({ key: 'EquipmentScene' })
  }

  create() {
    // Reset state on each launch
    this.equipped = {
      mainHand: null, offHand: null, helm: null, earring: null,
      ring1: null,    ring2: null,   belt: null, shoes: null,
      gloves: null,   necklace: null,
    }
    this.inventory    = MOCK_INVENTORY.map(i => ({ ...i, stats: { ...i.stats } }))
    this.selectedItem = null
    this.slotContainerMap.clear()
    this.slotGfxMap.clear()

    this.drawBackground()
    this.drawHeader()
    this.drawFooter()
    this.drawLeftPanel()
    this.drawMidPanel()
    this.drawRightPanel()
    this.buildSlots()
    this.buildInventoryList()
    this.buildStatsPanel()

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
    this.add.text(MID_PANEL_X + MID_PANEL_W / 2, PANEL_Y + 14, 'Inventory', {
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

  // ── Draw item icon ────────────────────────────────────────────────────────────

  private drawItemIcon(
    gfx: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    iconType: IconType,
    color: number,
    scale: number = 1
  ) {
    const s = scale
    gfx.fillStyle(color, 1)

    switch (iconType) {
      case 'sword': {
        // Blade diamond
        gfx.fillTriangle(x, y - 18 * s, x - 5 * s, y, x + 5 * s, y)
        gfx.fillTriangle(x, y + 8 * s,  x - 5 * s, y, x + 5 * s, y)
        // Crossguard
        gfx.fillStyle(0xccaa44, 1)
        gfx.fillRect(x - 10 * s, y - 2 * s, 20 * s, 4 * s)
        // Handle
        gfx.fillStyle(0x886622, 1)
        gfx.fillRect(x - 2.5 * s, y + 2 * s, 5 * s, 10 * s)
        // Pommel
        gfx.fillStyle(color, 1)
        gfx.fillCircle(x, y + 13 * s, 3.5 * s)
        break
      }
      case 'shield': {
        gfx.fillStyle(color, 1)
        gfx.fillRect(x - 11 * s, y - 14 * s, 22 * s, 20 * s)
        gfx.fillTriangle(x - 11 * s, y + 6 * s, x + 11 * s, y + 6 * s, x, y + 18 * s)
        // Boss
        gfx.fillStyle(0xccaa44, 1)
        gfx.fillCircle(x, y - 2 * s, 5 * s)
        gfx.lineStyle(1.5 * s, 0xccaa44, 0.7)
        gfx.strokeRect(x - 11 * s, y - 14 * s, 22 * s, 20 * s)
        break
      }
      case 'helm': {
        // Dome: filled circle with lower half masked by a rect (simulate upper semicircle)
        gfx.fillStyle(color, 1)
        gfx.fillCircle(x, y - 4 * s, 14 * s)
        // Cover lower half
        gfx.fillStyle(0x1a1a3a, 1)
        gfx.fillRect(x - 15 * s, y - 4 * s, 30 * s, 15 * s)
        // Side guards
        gfx.fillStyle(color, 1)
        gfx.fillRect(x - 14 * s, y - 4 * s, 5 * s, 12 * s)
        gfx.fillRect(x + 9 * s,  y - 4 * s, 5 * s, 12 * s)
        // Visor slit
        gfx.fillStyle(0x000000, 0.45)
        gfx.fillRect(x - 9 * s, y + 1 * s, 18 * s, 4 * s)
        // Nose guard
        gfx.fillStyle(0xaaaaaa, 0.5)
        gfx.fillRect(x - 1.5 * s, y - 4 * s, 3 * s, 7 * s)
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
        // Shaft
        gfx.fillRect(x - 7 * s, y - 15 * s, 13 * s, 18 * s)
        // Foot
        gfx.fillRect(x - 7 * s, y + 3 * s, 17 * s, 8 * s)
        // Toe rounded tip
        gfx.fillCircle(x + 9 * s, y + 7 * s, 4 * s)
        // Highlight
        gfx.fillStyle(0xffffff, 0.12)
        gfx.fillRect(x - 6 * s, y - 13 * s, 4 * s, 13 * s)
        break
      }
      case 'necklace': {
        // Chain — use a thin circle partially covered to suggest an arc
        gfx.lineStyle(2 * s, color, 0.85)
        gfx.strokeCircle(x, y - 4 * s, 12 * s)
        // Cover bottom of circle so only top arc shows
        gfx.fillStyle(0x1a1a3a, 1)
        gfx.fillRect(x - 14 * s, y - 4 * s, 28 * s, 16 * s)
        // Pendant drop
        gfx.fillStyle(color, 1)
        gfx.fillTriangle(x, y + 4 * s, x - 5 * s, y - 2 * s, x + 5 * s, y - 2 * s)
        // Gem on pendant
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
        gfx.lineStyle(1 * s, 0x886600, 0.8)
        gfx.lineBetween(x, y - 6 * s, x, y + 6 * s)
        break
      }
      case 'gloves': {
        gfx.fillStyle(color, 1)
        gfx.fillRect(x - 9 * s, y - 6 * s, 18 * s, 14 * s)
        // Thumb
        gfx.fillRect(x + 9 * s,  y - 8 * s,  6 * s, 8 * s)
        // Fingers
        gfx.fillRect(x - 9 * s,  y - 12 * s, 4 * s, 7 * s)
        gfx.fillRect(x - 3.5 * s, y - 13 * s, 4 * s, 8 * s)
        gfx.fillRect(x + 2 * s,  y - 12 * s, 4 * s, 7 * s)
        // Cuff
        gfx.fillStyle(0x888888, 0.35)
        gfx.fillRect(x - 9 * s, y + 8 * s, 18 * s, 5 * s)
        break
      }
      case 'earring': {
        // Stud
        gfx.fillStyle(color, 1)
        gfx.fillCircle(x, y - 8 * s, 5 * s)
        gfx.fillStyle(0xffffff, 0.65)
        gfx.fillCircle(x - 1 * s, y - 9 * s, 2 * s)
        // Drop
        gfx.fillStyle(color, 0.9)
        gfx.fillCircle(x, y + 4 * s, 4 * s)
        gfx.lineStyle(1.5 * s, color, 0.8)
        gfx.lineBetween(x, y - 3 * s, x, y)
        break
      }
    }
  }

  // ── Equipment Slots ───────────────────────────────────────────────────────────

  private buildSlots() {
    this.slotContainerMap.forEach(c => c.destroy())
    this.slotContainerMap.clear()
    this.slotGfxMap.clear()

    this.drawConnectorLines()

    for (const slotKey of Object.keys(SLOT_POSITIONS) as SlotKey[]) {
      const pos = SLOT_POSITIONS[slotKey]
      this.createSlot(slotKey, pos.x, pos.y)
    }
  }

  private createSlot(slotKey: SlotKey, cx: number, cy: number) {
    const container = this.add.container(cx, cy)
    const half      = SLOT_SIZE / 2
    const item      = this.equipped[slotKey]

    // Slot background gfx
    const gfx = this.add.graphics()
    this.drawSlotGfx(gfx, slotKey, item, false)
    container.add(gfx)

    // Item icon
    const iconGfx = this.add.graphics()
    if (item) {
      this.drawItemIcon(iconGfx, 0, -8, item.icon, RARITY_COLOR[item.rarity], 0.8)
    } else {
      this.drawItemIcon(iconGfx, 0, -10, SLOT_ICON[slotKey], 0x333355, 0.55)
    }
    container.add(iconGfx)

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
      this.drawSlotGfx(gfx, slotKey, this.equipped[slotKey], true)
    })
    hit.on('pointerout', () => {
      this.drawSlotGfx(gfx, slotKey, this.equipped[slotKey], false)
    })
    hit.on('pointerdown', () => {
      if (this.equipped[slotKey]) {
        this.unequipItem(slotKey)
      }
    })
    container.add(hit)

    this.slotGfxMap.set(slotKey, gfx)
    this.slotContainerMap.set(slotKey, container)
  }

  private drawSlotGfx(
    gfx: Phaser.GameObjects.Graphics,
    _slotKey: SlotKey,
    item: InventoryItem | null,
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

    // Body attachment points (where the line "leaves" the doll silhouette)
    const bodyPoints: Record<SlotKey, { x: number; y: number }> = {
      helm:     { x: DOLL_CX,      y: DOLL_CY - 110 },
      earring:  { x: DOLL_CX + 22, y: DOLL_CY - 65  },
      necklace: { x: DOLL_CX,      y: DOLL_CY - 65  },
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

  private refreshSlot(slotKey: SlotKey) {
    const old = this.slotContainerMap.get(slotKey)
    if (old) old.destroy()
    const pos = SLOT_POSITIONS[slotKey]
    this.createSlot(slotKey, pos.x, pos.y)
  }

  private flashSlot(slotKey: SlotKey) {
    const container = this.slotContainerMap.get(slotKey)
    if (!container) return
    this.tweens.add({
      targets: container,
      scaleX: 1.12,
      scaleY: 1.12,
      duration: 120,
      yoyo: true,
      ease: 'Quad.easeOut',
      onComplete: () => { container.setScale(1) },
    })
  }

  // ── Inventory list ────────────────────────────────────────────────────────────

  private buildInventoryList() {
    if (this.inventoryContainer) this.inventoryContainer.destroy()
    this.inventoryContainer = this.add.container(0, 0)

    if (this.inventory.length === 0) {
      this.inventoryContainer.add(
        this.add.text(
          MID_PANEL_X + MID_PANEL_W / 2,
          PANEL_Y + PANEL_H / 2,
          'Inventory is empty',
          { fontSize: '14px', fontFamily: 'Arial, sans-serif', color: '#333355' }
        ).setOrigin(0.5, 0.5)
      )
      return
    }

    let yOff = 0
    for (const item of this.inventory) {
      this.createInventoryRow(item, yOff)
      yOff += ITEM_ROW_H + 5
    }
  }

  private createInventoryRow(item: InventoryItem, yOff: number) {
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

    const iconGfx = this.add.graphics()
    this.drawItemIcon(iconGfx, rowX + 34, rowY + 32, item.icon, rarCol, 0.85)
    this.inventoryContainer.add(iconGfx)

    // Text info
    const rarName    = item.rarity.charAt(0).toUpperCase() + item.rarity.slice(1)
    const rarHex     = rarCol.toString(16).padStart(6, '0')
    const nameText   = this.add.text(rowX + 70, rowY + 9,  item.name, {
      fontSize: '14px', fontFamily: 'Georgia, serif', color: '#dde0ff', fontStyle: 'bold',
    })
    const typeText   = this.add.text(rowX + 70, rowY + 27, `${rarName}  ·  ${SLOT_LABELS[item.itemType]}`, {
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

    // Equip hit zone
    const equipHit = this.add.rectangle(btnX + btnW / 2, btnY + btnH / 2, btnW, btnH, 0, 0)
      .setInteractive({ useHandCursor: true })
    equipHit.on('pointerover', () => drawBtn(0x3a3a6a))
    equipHit.on('pointerout',  () => drawBtn(0x2a2a4a))
    equipHit.on('pointerdown', () => {
      drawBtn(0x5555aa)
      this.time.delayedCall(100, () => {
        drawBtn(0x2a2a4a)
        this.equipItem(item)
      })
    })
    this.inventoryContainer.add(equipHit)
  }

  // ── Equip / Unequip ──────────────────────────────────────────────────────────

  private equipItem(item: InventoryItem) {
    const slot    = item.itemType
    const current = this.equipped[slot]
    if (current) this.inventory.push(current)
    this.inventory    = this.inventory.filter(i => i.id !== item.id)
    this.equipped[slot] = item
    if (this.selectedItem?.id === item.id) this.selectedItem = null

    this.refreshSlot(slot)
    this.flashSlot(slot)
    this.buildInventoryList()
    this.buildStatsPanel()
  }

  private unequipItem(slot: SlotKey) {
    const item = this.equipped[slot]
    if (!item) return
    this.inventory.push(item)
    this.equipped[slot] = null
    this.refreshSlot(slot)
    this.buildInventoryList()
    this.buildStatsPanel()
  }

  // ── Stats panel ───────────────────────────────────────────────────────────────

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

      const rarName = selected.rarity.charAt(0).toUpperCase() + selected.rarity.slice(1)
      this.statsContainer.add(
        this.add.text(panX + panW / 2, yOff, `${rarName}  ·  ${SLOT_LABELS[selected.itemType]}`, {
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

      const slotCurrent = this.equipped[selected.itemType]
      const statKeys: (keyof ItemStats)[] = ['attack', 'defense', 'spirit', 'intelligence', 'dexterity']
      let shownAny = false

      for (const sk of statKeys) {
        const newVal  = selected.stats[sk]   ?? 0
        const curVal  = slotCurrent?.stats[sk] ?? 0
        const total   = totalStats[sk]        ?? 0
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

      const statKeys: (keyof ItemStats)[] = ['attack', 'defense', 'spirit', 'intelligence', 'dexterity']
      let anyStats = false

      for (const sk of statKeys) {
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
      const slots  = Object.keys(this.equipped) as SlotKey[]
      const filled = slots.filter(s => this.equipped[s] !== null).length
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

  private computeTotalStats(): ItemStats {
    const totals: ItemStats = {}
    for (const item of Object.values(this.equipped)) {
      if (!item) continue
      for (const [k, v] of Object.entries(item.stats) as [keyof ItemStats, number][]) {
        totals[k] = (totals[k] ?? 0) + v
      }
    }
    return totals
  }

  private formatStats(stats: ItemStats): string {
    return Object.entries(stats)
      .map(([k, v]) => `+${v} ${k.charAt(0).toUpperCase() + k.slice(1)}`)
      .join('  ')
  }

  private truncate(str: string, maxChars: number): string {
    return str.length > maxChars ? str.slice(0, maxChars - 1) + '…' : str
  }
}
