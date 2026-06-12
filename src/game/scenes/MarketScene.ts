// ============================================================
// MarketScene — the player-driven market.
//
// SECURITY: this scene only RENDERS server-pushed state (market
// listings, the InventoryStore inventory, and the silver balance
// from `currency:update`) and sends INTENTS (market:list,
// market:sell_to_system, market:buy, market:cancel).  Prices,
// balances, ownership and item transfers are ALL validated and
// computed server-side — nothing here is trusted for gameplay.
// ============================================================

import Phaser from 'phaser'
import type { Socket } from 'socket.io-client'
import { GAME_WIDTH, GAME_HEIGHT } from '../constants'
import {
  InventoryStore,
  type ClientInventoryItem,
  type ClientPlayerInventory,
} from '../systems/InventoryStore'
import { ATTRIBUTE_TYPES, type EquipSlot, type AttributeType } from '../data/equipmentGen'

// ── Types mirroring the server's MarketListing snapshot ─────────────────────

interface MarketAttribute { type: string; value: number }
interface MarketItemData {
  id: string
  itemType: string
  name: string
  description?: string
  icon: string
  rarity: string
  slot: string
  stats?: Record<string, number>
  attributes?: MarketAttribute[]
}
interface MarketListing {
  listingId: string
  itemType: string
  itemData: MarketItemData
  slot: string
  sellerUsername: string
  price: number
  createdAt: number
}

type Mode = 'buy' | 'sell'
type SellView = 'items' | 'mine'

// ── Style constants (dark panel + gold accent, matching StrategyScene) ──────

const COLOR_BG = 0x0a0a1e
const COLOR_PANEL = 0x12122a
const COLOR_PANEL_ALT = 0x1a1a3a
const COLOR_HOVER = 0x1e1e44
const COLOR_GOLD = 0xffd700
const TEXT_GOLD = '#ffd700'
const TEXT_WHITE = '#ffffff'
const TEXT_GRAY = '#aaaacc'
const TEXT_DIM = '#666688'

const RARITY_COLOR: Record<string, number> = {
  common: 0xaaaaaa,
  uncommon: 0x44cc44,
  rare: 0x4488ff,
  epic: 0xcc44ff,
  legendary: 0xffaa00,
}

// 'all' shows every slot; the rest == generated EquipSlot values.
type TabSlot = EquipSlot | 'all'
const TABS: { slot: TabSlot; label: string }[] = [
  { slot: 'all', label: 'All' },
  { slot: 'weapon', label: 'Weapon' },
  { slot: 'helmet', label: 'Helmet' },
  { slot: 'chest', label: 'Chest' },
  { slot: 'legs', label: 'Legs' },
  { slot: 'boots', label: 'Boots' },
  { slot: 'gloves', label: 'Gloves' },
  { slot: 'ring', label: 'Ring' },
  { slot: 'amulet', label: 'Amulet' },
]

/** Friendly label for an attribute type, e.g. fire_damage → "Fire Damage". */
function attrTypeLabel(type: string): string {
  return type.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

const RARITY_VALUE: Record<string, number> = {
  common: 10, uncommon: 25, rare: 60, epic: 140, legendary: 320,
}

const PANEL_X = 20
const PANEL_W = GAME_WIDTH - 40
const LIST_TOP = 210
const LIST_BOTTOM = GAME_HEIGHT - 40
const ROW_H = 76

export class MarketScene extends Phaser.Scene {
  private socket: Socket | null = null

  // Server-pushed state — never mutated locally for gameplay.
  private listings: MarketListing[] = []
  private myListings: MarketListing[] = []
  private inventory: ClientPlayerInventory | null = null
  private silver = 0

  // UI state
  private mode: Mode = 'buy'
  private sellView: SellView = 'items'
  private activeSlot: TabSlot = 'all'
  private attrFilter: AttributeType | null = null
  private attrMenu: Phaser.GameObjects.Container | null = null
  private search = ''
  private scrollOffset = 0

  // Containers / widgets
  private listContainer!: Phaser.GameObjects.Container
  private chromeContainer!: Phaser.GameObjects.Container
  private feedbackText!: Phaser.GameObjects.Text
  private searchText!: Phaser.GameObjects.Text
  private silverText!: Phaser.GameObjects.Text
  private silverCoin!: Phaser.GameObjects.Image

  private searchDebounce = 0
  private modalOpen = false

  constructor() {
    super({ key: 'MarketScene' })
  }

  create() {
    this.socket = (window as typeof window & { __lumenSocket?: Socket }).__lumenSocket ?? null
    this.mode = 'buy'
    this.sellView = 'items'
    this.activeSlot = 'all'
    this.attrFilter = null
    this.attrMenu = null
    this.search = ''
    this.scrollOffset = 0
    this.modalOpen = false

    this.drawBackground()
    this.ensureCoinTexture()
    this.drawHeader()
    this.chromeContainer = this.add.container(0, 0)
    this.listContainer = this.add.container(0, 0)

    this.feedbackText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 18, '', {
      fontSize: '14px', fontFamily: 'Arial, sans-serif', color: '#ff8866',
      backgroundColor: '#000000aa', padding: { x: 10, y: 4 },
    }).setOrigin(0.5, 1).setDepth(60).setVisible(false)

    // Search is captured via Phaser keyboard (no HTML overlay → nothing to
    // misalign under FIT scaling or orphan across scene/game restarts). Clear
    // any stray input left by the old DOM-overlay implementation.
    document.getElementById(MarketScene.SEARCH_INPUT_ID)?.remove()
    this.input.keyboard!.on('keydown', this.onSearchKey, this)

    // ── Server state subscriptions ─────────────────────────────────────────
    const unsubInv = InventoryStore.onUpdate((inv) => {
      this.inventory = inv
      if (this.mode === 'sell') this.rebuildList()
    })

    const onListings = (data: { listings?: MarketListing[] }) => {
      const incoming = Array.isArray(data?.listings) ? data.listings : []
      // The server answers BOTH market:get_listings and market:my_listings with
      // `market:listings`. Route by whether they're all ours.
      if (this.mode === 'sell' && this.sellView === 'mine') {
        this.myListings = incoming
      } else {
        this.listings = incoming
      }
      this.rebuildList()
    }
    const onListed = () => { this.flash('Listed for sale.'); this.refresh() }
    const onSold = (d: { silver?: number }) => { this.flash(`Sold for ${d?.silver ?? 0} silver.`); this.refresh() }
    const onBought = () => { this.flash('Purchased!'); this.refresh() }
    const onCancelled = () => { this.flash('Listing cancelled.'); this.refresh() }
    const onCurrency = (d: { silver?: number }) => {
      if (typeof d?.silver === 'number') { this.silver = d.silver; this.updateSilverText() }
    }
    const onError = (err: { message?: string }) => { if (err?.message) this.flash(err.message) }

    this.socket?.on('market:listings', onListings)
    this.socket?.on('market:listed', onListed)
    this.socket?.on('market:sold', onSold)
    this.socket?.on('market:bought', onBought)
    this.socket?.on('market:cancelled', onCancelled)
    this.socket?.on('currency:update', onCurrency)
    this.socket?.on('error', onError)

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      unsubInv()
      this.socket?.off('market:listings', onListings)
      this.socket?.off('market:listed', onListed)
      this.socket?.off('market:sold', onSold)
      this.socket?.off('market:bought', onBought)
      this.socket?.off('market:cancelled', onCancelled)
      this.socket?.off('currency:update', onCurrency)
      this.socket?.off('error', onError)
      this.input.keyboard?.off('keydown', this.onSearchKey, this)
    })

    // Seed from whatever we already have, then ask the server for fresh data.
    this.inventory = InventoryStore.get()
    this.socket?.emit('inventory:get')
    this.socket?.emit('currency:get')
    this.requestListings()

    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      if (this.modalOpen) return
      if (this.attrMenu) { this.closeAttrMenu(); return }
      this.scrollOffset = Math.max(0, this.scrollOffset + Math.sign(dy))
      this.rebuildList()
    })

    this.input.keyboard!.on('keydown-ESC', () => {
      if (this.modalOpen) return
      if (this.attrMenu) { this.closeAttrMenu(); return }
      this.closeScene()
    })

    this.drawChrome()
  }

  private closeScene() {
    this.scene.stop('MarketScene')
    this.scene.resume('WorldScene')
  }

  // ── Server requests ─────────────────────────────────────────────────────

  private requestListings() {
    if (this.mode === 'sell' && this.sellView === 'mine') {
      this.socket?.emit('market:my_listings')
    } else {
      this.socket?.emit('market:get_listings', {
        // 'all' → omit slot so the server returns every slot.
        slot: this.activeSlot === 'all' ? undefined : this.activeSlot,
        search: this.search,
        attribute: this.attrFilter ?? undefined,
      })
    }
  }

  /** Re-pull whatever the current view shows (after any mutation). */
  private refresh() {
    this.socket?.emit('inventory:get')
    this.requestListings()
  }

  private flash(msg: string) {
    this.feedbackText.setText(msg).setVisible(true)
    this.time.delayedCall(2600, () => this.feedbackText.setVisible(false))
  }

  // ── Coin icon (drawn, so it always renders — the 🪙 emoji is missing on some
  //    system fonts and shows an empty box). ─────────────────────────────────
  private ensureCoinTexture() {
    if (this.textures.exists('mkt_coin')) return
    const g = this.add.graphics()
    g.fillStyle(0x8a6508, 1); g.fillCircle(8, 8, 7.5)   // dark gold rim
    g.fillStyle(0xffd64d, 1); g.fillCircle(8, 8, 6)     // gold body
    g.lineStyle(1, 0xc9971a, 1); g.strokeCircle(8, 8, 4)// inner ring
    g.fillStyle(0xfff0a8, 1); g.fillCircle(6, 6, 1.8)   // shine
    g.generateTexture('mkt_coin', 16, 16)
    g.destroy()
  }

  /** Add a gold coin + amount to `parent`, left-anchored at (x, y centre). */
  private coinAmount(
    parent: Phaser.GameObjects.Container, x: number, y: number,
    amount: number, color: string, fontSize: string, coin = 16,
  ) {
    parent.add(this.add.image(x + coin / 2, y, 'mkt_coin').setDisplaySize(coin, coin))
    parent.add(this.add.text(x + coin + 4, y, `${amount}`, {
      fontSize, fontFamily: 'Georgia, serif', color, fontStyle: 'bold',
    }).setOrigin(0, 0.5))
  }

  /** Add a gold coin + amount to `parent`, centred horizontally on `cx` at y. */
  private coinAmountCentered(
    parent: Phaser.GameObjects.Container, cx: number, y: number,
    amount: number, color: string, fontSize: string, coin = 16,
  ) {
    const txt = this.add.text(0, 0, `${amount}`, {
      fontSize, fontFamily: 'Georgia, serif', color, fontStyle: 'bold',
    }).setOrigin(0, 0.5)
    const sx = cx - (coin + 4 + txt.width) / 2
    txt.setPosition(sx + coin + 4, y)
    parent.add(this.add.image(sx + coin / 2, y, 'mkt_coin').setDisplaySize(coin, coin))
    parent.add(txt)
  }

  // ── Background + header ───────────────────────────────────────────────────

  private drawBackground() {
    const bg = this.add.graphics()
    bg.fillStyle(COLOR_BG, 1)
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)
    const rng = new Phaser.Math.RandomDataGenerator(['market'])
    bg.fillStyle(0xffffff, 0.4)
    for (let i = 0; i < 70; i++) {
      bg.fillRect(rng.integerInRange(0, GAME_WIDTH), rng.integerInRange(0, GAME_HEIGHT), 1, 1)
    }
  }

  private drawHeader() {
    const hg = this.add.graphics()
    hg.fillStyle(COLOR_PANEL, 1)
    hg.fillRect(0, 0, GAME_WIDTH, 56)
    hg.lineStyle(1, 0x3333aa, 0.8)
    hg.lineBetween(0, 56, GAME_WIDTH, 56)
    this.add.text(GAME_WIDTH / 2, 28, 'M A R K E T', {
      fontSize: '22px', fontFamily: 'Georgia, serif', color: TEXT_GOLD, fontStyle: 'bold',
    }).setOrigin(0.5, 0.5)

    this.silverText = this.add.text(GAME_WIDTH - 24, 28, '', {
      fontSize: '16px', fontFamily: 'Georgia, serif', color: '#e8e8e8', fontStyle: 'bold',
    }).setOrigin(1, 0.5)
    this.silverCoin = this.add.image(0, 28, 'mkt_coin').setDisplaySize(16, 16).setOrigin(1, 0.5)
    this.updateSilverText()

    // ESC close button
    this.add.text(24, 28, 'ESC  Close', {
      fontSize: '13px', fontFamily: 'Arial, sans-serif', color: TEXT_GRAY,
    }).setOrigin(0, 0.5)
  }

  private updateSilverText() {
    if (!this.silverText) return
    this.silverText.setText(`${this.silver}`)
    // Park the coin just left of the right-aligned amount.
    if (this.silverCoin) this.silverCoin.setX(GAME_WIDTH - 24 - this.silverText.width - 6)
  }

  // ── Chrome: mode toggle + tabs + search ─────────────────────────────────

  private drawChrome() {
    this.closeAttrMenu()
    this.chromeContainer.removeAll(true)

    // Mode toggle (BUY / SELL)
    const modeY = 78
    this.makeToggle('BUY', PANEL_X, modeY, this.mode === 'buy', () => {
      if (this.mode === 'buy') return
      this.mode = 'buy'; this.scrollOffset = 0
      this.drawChrome(); this.requestListings(); this.rebuildList()
    })
    this.makeToggle('SELL', PANEL_X + 130, modeY, this.mode === 'sell', () => {
      if (this.mode === 'sell') return
      this.mode = 'sell'; this.sellView = 'items'; this.scrollOffset = 0
      this.drawChrome(); this.refresh(); this.rebuildList()
    })

    // In SELL mode, a sub-toggle for the "My Listings" view.
    if (this.mode === 'sell') {
      this.makeToggle('Sell Items', PANEL_X + 320, modeY, this.sellView === 'items', () => {
        if (this.sellView === 'items') return
        this.sellView = 'items'; this.scrollOffset = 0
        this.drawChrome(); this.rebuildList()
      }, 120)
      this.makeToggle('My Listings', PANEL_X + 450, modeY, this.sellView === 'mine', () => {
        if (this.sellView === 'mine') return
        this.sellView = 'mine'; this.scrollOffset = 0
        this.drawChrome(); this.socket?.emit('market:my_listings')
      }, 120)
    }

    // Item-type tabs (All + 8 slots)
    const tabY = 120
    const gap = 6
    const tabW = (PANEL_W - (TABS.length - 1) * gap) / TABS.length
    TABS.forEach((tab, i) => {
      const x = PANEL_X + i * (tabW + gap)
      this.makeTab(tab.label, x, tabY, tabW, this.activeSlot === tab.slot, () => {
        if (this.activeSlot === tab.slot) return
        this.activeSlot = tab.slot; this.scrollOffset = 0
        this.drawChrome()
        if (!(this.mode === 'sell' && this.sellView === 'mine')) this.requestListings()
        this.rebuildList()
      })
    })

    // Search box — typed via Phaser keyboard (see onSearchKey)
    const searchY = 166
    const sg = this.add.graphics()
    sg.fillStyle(COLOR_PANEL_ALT, 1)
    sg.fillRoundedRect(PANEL_X, searchY, 420, 30, 6)
    sg.lineStyle(1, 0x3a3a6a, 1)
    sg.strokeRoundedRect(PANEL_X, searchY, 420, 30, 6)
    this.chromeContainer.add(sg)
    this.chromeContainer.add(this.add.text(PANEL_X + 430, searchY + 15,
      'Search by name, or e.g. "constitution > +5"', {
        fontSize: '11px', fontFamily: 'Arial, sans-serif', color: TEXT_DIM,
      }).setOrigin(0, 0.5))

    // Live typed text (or the placeholder when empty).
    this.searchText = this.add.text(PANEL_X + 10, searchY + 15, this.search || 'Search…', {
      fontSize: '13px', fontFamily: 'Arial, sans-serif',
      color: this.search ? TEXT_WHITE : TEXT_DIM,
    }).setOrigin(0, 0.5)
    this.chromeContainer.add(this.searchText)

    // Attribute filter dropdown (right-aligned on the search row).
    const attrW = 240
    const attrX = PANEL_X + PANEL_W - attrW
    this.makeAttrFilter(attrX, searchY, attrW)
  }

  /** The "Attribute: …" dropdown button; opens a popup menu of attribute types. */
  private makeAttrFilter(x: number, y: number, w: number) {
    const h = 30
    const active = this.attrFilter !== null
    const label = `Attribute: ${active ? attrTypeLabel(this.attrFilter!) : 'Any'}  ▾`

    const g = this.add.graphics()
    g.fillStyle(active ? COLOR_GOLD : COLOR_PANEL_ALT, active ? 0.9 : 1)
    g.fillRoundedRect(x, y, w, h, 6)
    g.lineStyle(1, COLOR_GOLD, active ? 1 : 0.5)
    g.strokeRoundedRect(x, y, w, h, 6)
    this.chromeContainer.add(g)
    this.chromeContainer.add(this.add.text(x + w / 2, y + h / 2, label, {
      fontSize: '13px', fontFamily: 'Arial, sans-serif',
      color: active ? '#1a1a2e' : TEXT_GRAY, fontStyle: 'bold',
    }).setOrigin(0.5, 0.5))

    // Quick clear "✕" when a filter is active.
    if (active) {
      const cx = x + w - 16
      this.chromeContainer.add(this.add.text(cx, y + h / 2, '✕', {
        fontSize: '13px', fontFamily: 'Arial, sans-serif', color: '#1a1a2e', fontStyle: 'bold',
      }).setOrigin(0.5, 0.5))
      const clearHit = this.add.rectangle(cx, y + h / 2, 24, h, 0, 0)
        .setInteractive({ useHandCursor: true })
      clearHit.on('pointerdown', () => this.setAttrFilter(null))
      this.chromeContainer.add(clearHit)
      // The main hit covers everything left of the clear button.
      const mainHit = this.add.rectangle(x + (w - 28) / 2, y + h / 2, w - 28, h, 0, 0)
        .setInteractive({ useHandCursor: true })
      mainHit.on('pointerdown', () => this.toggleAttrMenu(x, y + h + 4, w))
      this.chromeContainer.add(mainHit)
    } else {
      const hit = this.add.rectangle(x + w / 2, y + h / 2, w, h, 0, 0)
        .setInteractive({ useHandCursor: true })
      hit.on('pointerdown', () => this.toggleAttrMenu(x, y + h + 4, w))
      this.chromeContainer.add(hit)
    }
  }

  private setAttrFilter(attr: AttributeType | null) {
    this.closeAttrMenu()
    if (this.attrFilter === attr) return
    this.attrFilter = attr
    this.scrollOffset = 0
    this.drawChrome()
    if (!(this.mode === 'sell' && this.sellView === 'mine')) this.requestListings()
    this.rebuildList()
  }

  private toggleAttrMenu(x: number, y: number, anchorW: number) {
    if (this.attrMenu) { this.closeAttrMenu(); return }
    this.openAttrMenu(x, y, anchorW)
  }

  private closeAttrMenu() {
    this.attrMenu?.destroy()
    this.attrMenu = null
  }

  /** Popup grid of "Any" + all attribute types, anchored under the dropdown. */
  private openAttrMenu(anchorX: number, anchorY: number, anchorW: number) {
    const overlay = this.add.container(0, 0).setDepth(90)

    // Click-away shade closes the menu.
    const shade = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.01)
      .setOrigin(0, 0).setInteractive()
    shade.on('pointerdown', () => this.closeAttrMenu())
    overlay.add(shade)

    const options: { label: string; value: AttributeType | null }[] = [
      { label: 'Any', value: null },
      ...ATTRIBUTE_TYPES.map((t) => ({ label: attrTypeLabel(t), value: t as AttributeType })),
    ]
    // Two columns to stay compact.
    const cols = 2
    const rows = Math.ceil(options.length / cols)
    const cellW = 210
    const cellH = 26
    const pad = 8
    const menuW = cols * cellW + pad * 2
    // Right-align the menu with the dropdown so it never runs off-screen.
    const menuX = Math.min(anchorX + anchorW - menuW, GAME_WIDTH - menuW - 8)
    const menuH = rows * cellH + pad * 2
    const menuY = anchorY

    const bg = this.add.graphics()
    bg.fillStyle(COLOR_PANEL, 1)
    bg.fillRoundedRect(menuX, menuY, menuW, menuH, 8)
    bg.lineStyle(1, COLOR_GOLD, 0.8)
    bg.strokeRoundedRect(menuX, menuY, menuW, menuH, 8)
    overlay.add(bg)

    options.forEach((opt, i) => {
      const c = i % cols
      const r = Math.floor(i / cols)
      const ox = menuX + pad + c * cellW
      const oy = menuY + pad + r * cellH
      const selected = this.attrFilter === opt.value
      const cell = this.add.graphics()
      cell.fillStyle(selected ? COLOR_GOLD : COLOR_PANEL_ALT, selected ? 0.9 : 0.0)
      if (selected) cell.fillRoundedRect(ox, oy, cellW - 4, cellH - 2, 4)
      overlay.add(cell)
      overlay.add(this.add.text(ox + 8, oy + (cellH - 2) / 2, opt.label, {
        fontSize: '12px', fontFamily: 'Arial, sans-serif',
        color: selected ? '#1a1a2e' : TEXT_WHITE,
      }).setOrigin(0, 0.5))
      const hit = this.add.rectangle(ox + (cellW - 4) / 2, oy + (cellH - 2) / 2, cellW - 4, cellH - 2, 0, 0)
        .setInteractive({ useHandCursor: true })
      hit.on('pointerover', () => { if (!selected) { cell.clear(); cell.fillStyle(COLOR_HOVER, 1); cell.fillRoundedRect(ox, oy, cellW - 4, cellH - 2, 4) } })
      hit.on('pointerout', () => { if (!selected) cell.clear() })
      hit.on('pointerdown', () => this.setAttrFilter(opt.value))
      overlay.add(hit)
    })

    this.attrMenu = overlay
  }

  private makeToggle(
    label: string, x: number, y: number, active: boolean, onClick: () => void, w = 120,
  ) {
    const h = 30
    const g = this.add.graphics()
    g.fillStyle(active ? COLOR_GOLD : COLOR_PANEL_ALT, active ? 0.9 : 1)
    g.fillRoundedRect(x, y, w, h, 6)
    g.lineStyle(1, COLOR_GOLD, active ? 1 : 0.4)
    g.strokeRoundedRect(x, y, w, h, 6)
    this.chromeContainer.add(g)
    const t = this.add.text(x + w / 2, y + h / 2, label, {
      fontSize: '14px', fontFamily: 'Arial, sans-serif',
      color: active ? '#1a1a2e' : TEXT_GRAY, fontStyle: 'bold',
    }).setOrigin(0.5, 0.5)
    this.chromeContainer.add(t)
    const hit = this.add.rectangle(x + w / 2, y + h / 2, w, h, 0, 0)
      .setInteractive({ useHandCursor: true })
    hit.on('pointerdown', onClick)
    this.chromeContainer.add(hit)
  }

  private makeTab(
    label: string, x: number, y: number, w: number, active: boolean, onClick: () => void,
  ) {
    const h = 32
    const g = this.add.graphics()
    g.fillStyle(active ? COLOR_PANEL_ALT : COLOR_PANEL, 1)
    g.fillRoundedRect(x, y, w, h, 5)
    g.lineStyle(active ? 2 : 1, active ? COLOR_GOLD : 0x2a2a5a, active ? 1 : 0.8)
    g.strokeRoundedRect(x, y, w, h, 5)
    this.chromeContainer.add(g)
    const t = this.add.text(x + w / 2, y + h / 2, label, {
      fontSize: '12px', fontFamily: 'Arial, sans-serif',
      color: active ? TEXT_GOLD : TEXT_GRAY, fontStyle: active ? 'bold' : 'normal',
    }).setOrigin(0.5, 0.5)
    this.chromeContainer.add(t)
    const hit = this.add.rectangle(x + w / 2, y + h / 2, w, h, 0, 0)
      .setInteractive({ useHandCursor: true })
    hit.on('pointerdown', onClick)
    this.chromeContainer.add(hit)
  }

  // ── Search input (Phaser keyboard, no DOM overlay) ───────────────────────

  // Legacy DOM-overlay id — kept only so create() can sweep any stray element
  // left behind by a previous build of this scene.
  private static readonly SEARCH_INPUT_ID = 'lumen-market-search'

  /** Edit the search string from raw keyboard input while the market is open. */
  private onSearchKey(event: KeyboardEvent) {
    if (this.modalOpen || this.attrMenu) return
    const key = event.key
    if (key === 'Backspace') {
      if (!this.search) return
      this.search = this.search.slice(0, -1)
    } else if (key.length === 1 && this.search.length < 40) {
      this.search += key                       // printable char (letters, digits, space, > + …)
    } else {
      return                                   // ignore Enter/Tab/arrows/modifiers
    }
    this.searchText.setText(this.search || 'Search…')
      .setColor(this.search ? TEXT_WHITE : TEXT_DIM)
    window.clearTimeout(this.searchDebounce)
    this.searchDebounce = window.setTimeout(() => {
      if (!(this.mode === 'sell' && this.sellView === 'mine')) this.requestListings()
      else this.rebuildList()
    }, 250)
  }

  // ── List rendering ────────────────────────────────────────────────────────

  private rebuildList() {
    this.listContainer.removeAll(true)

    const rows = this.currentRows()
    const listH = LIST_BOTTOM - LIST_TOP
    const visibleCount = Math.max(1, Math.floor(listH / (ROW_H + 8)))
    const maxOffset = Math.max(0, rows.length - visibleCount)
    this.scrollOffset = Math.min(this.scrollOffset, maxOffset)

    if (rows.length === 0) {
      this.listContainer.add(this.add.text(GAME_WIDTH / 2, LIST_TOP + listH / 2,
        this.emptyMessage(), {
          fontSize: '15px', fontFamily: 'Arial, sans-serif', color: TEXT_DIM,
        }).setOrigin(0.5, 0.5))
      return
    }

    const visible = rows.slice(this.scrollOffset, this.scrollOffset + visibleCount)
    let y = LIST_TOP
    for (const row of visible) {
      row(y)
      y += ROW_H + 8
    }

    if (maxOffset > 0) {
      this.listContainer.add(this.add.text(GAME_WIDTH / 2, LIST_BOTTOM + 14,
        `▲▼  ${this.scrollOffset + 1}–${this.scrollOffset + visible.length} of ${rows.length}`, {
          fontSize: '11px', fontFamily: 'Arial, sans-serif', color: TEXT_DIM,
        }).setOrigin(0.5, 0.5))
    }
  }

  private emptyMessage(): string {
    if (this.mode === 'buy') return 'No listings match this tab/search.'
    if (this.sellView === 'mine') return 'You have no active listings.'
    return 'No sellable gear of this type in your bag.'
  }

  /** Build an array of row-drawing functions for the current view. */
  private currentRows(): ((y: number) => void)[] {
    if (this.mode === 'buy') {
      return this.listings.map((l) => (y: number) => this.drawBuyRow(l, y))
    }
    if (this.sellView === 'mine') {
      // Buy listings are filtered server-side; My Listings is a local list, so
      // apply the attribute filter here for consistency.
      return this.myListings
        .filter((l) => this.listingHasAttr(l))
        .map((l) => (y: number) => this.drawMyListingRow(l, y))
    }
    // Sell items: own bag, filtered to the active tab slot + attribute filter.
    const items = (this.inventory?.items ?? [])
      .filter((it) => this.sellableInSlot(it) && this.bagItemHasAttr(it))
    return items.map((it) => (y: number) => this.drawSellRow(it, y))
  }

  /** True when a bag item is sellable AND matches the active tab ('all' = any slot). */
  private sellableInSlot(item: ClientInventoryItem): boolean {
    const slot = this.slotOf(item)
    if (!slot) return false
    return this.activeSlot === 'all' || slot === this.activeSlot
  }

  /** Attribute-filter test for a market listing (no filter ⇒ always true). */
  private listingHasAttr(l: MarketListing): boolean {
    if (!this.attrFilter) return true
    return (l.itemData.attributes ?? []).some((a) => a.type === this.attrFilter)
  }

  /** Attribute-filter test for a bag item (no filter ⇒ always true). */
  private bagItemHasAttr(item: ClientInventoryItem): boolean {
    if (!this.attrFilter) return true
    return !!item.attributes && item.attributes.some((a) => a.type === this.attrFilter)
  }

  /** The market slot for a bag item (crafted gear carries its own slot). */
  private slotOf(item: ClientInventoryItem): EquipSlot | null {
    if (item.equipSlot) return item.equipSlot as EquipSlot
    // Legacy heuristic mirrors the server's buildItemSnapshot fallback.
    const s = item.stats ?? {}
    if (typeof s.attack === 'number' && s.attack > 0) return 'weapon'
    if (typeof s.defense === 'number' && s.defense > 0) return 'chest'
    return 'amulet'
  }

  // ── Price helpers (DISPLAY ONLY — server recomputes authoritatively) ─────

  private displayBasePrice(item: ClientInventoryItem): number {
    if (item.attributes && item.attributes.length) {
      const rv = RARITY_VALUE[item.rarity] ?? RARITY_VALUE.common
      const attrSum = item.attributes.reduce((a, x) => a + Math.abs(x.value), 0)
      return rv + attrSum * 3 + Math.floor((item.xpRequired ?? 0) / 20)
    }
    const statSum = Object.values(item.stats ?? {}).reduce(
      (a, v) => a + (typeof v === 'number' ? v : 0), 0)
    return 10 + statSum * 5
  }

  private bonusSummary(data: { itemType: string; attributes?: MarketAttribute[]; stats?: Record<string, number | undefined> }): string {
    if (data.attributes && data.attributes.length) {
      return data.attributes.map((a) => `+${a.value} ${this.attrLabel(a.type)}`).join('  ')
    }
    return Object.entries(data.stats ?? {})
      .filter((e): e is [string, number] => typeof e[1] === 'number' && e[1] !== 0)
      .map(([k, v]) => `+${v} ${k.charAt(0).toUpperCase() + k.slice(1)}`)
      .join('  ')
  }

  private attrLabel(type: string): string {
    return type.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  }

  /** Item icon — each item carries its own rolled icon now. */
  private iconFor(_itemType: string, fallback: string): string {
    return fallback
  }

  // ── Row drawers ───────────────────────────────────────────────────────────

  /** Shared row frame + item visual; returns the x where buttons can start. */
  private drawRowFrame(
    icon: string, rarity: string, name: string, sub: string, bonus: string, y: number,
  ) {
    const x = PANEL_X
    const w = PANEL_W
    const rarCol = RARITY_COLOR[rarity] ?? RARITY_COLOR.common

    const g = this.add.graphics()
    g.fillStyle(COLOR_PANEL, 0.95)
    g.fillRoundedRect(x, y, w, ROW_H, 8)
    g.lineStyle(1, 0x1e1e44, 1)
    g.strokeRoundedRect(x, y, w, ROW_H, 8)
    g.fillStyle(rarCol, 0.85)
    g.fillRect(x, y + 5, 4, ROW_H - 10)
    this.listContainer.add(g)

    // Icon framed in rarity color
    const iconBg = this.add.graphics()
    iconBg.fillStyle(COLOR_PANEL_ALT, 1)
    iconBg.fillRoundedRect(x + 14, y + 12, 52, 52, 6)
    iconBg.lineStyle(2, rarCol, 0.8)
    iconBg.strokeRoundedRect(x + 14, y + 12, 52, 52, 6)
    this.listContainer.add(iconBg)
    this.listContainer.add(this.add.text(x + 40, y + 38, icon, { fontSize: '28px' }).setOrigin(0.5, 0.5))

    const rarHex = (RARITY_COLOR[rarity] ?? RARITY_COLOR.common).toString(16).padStart(6, '0')
    this.listContainer.add(this.add.text(x + 82, y + 12, name, {
      fontSize: '15px', fontFamily: 'Georgia, serif', color: '#dde0ff', fontStyle: 'bold',
    }))
    this.listContainer.add(this.add.text(x + 82, y + 33, sub, {
      fontSize: '11px', fontFamily: 'Arial, sans-serif', color: `#${rarHex}`,
    }))
    this.listContainer.add(this.add.text(x + 82, y + 50, bonus, {
      fontSize: '11px', fontFamily: 'Arial, sans-serif', color: '#7799bb',
    }))
  }

  private drawButton(
    label: string, x: number, y: number, w: number, color: string, onClick: () => void,
    coinAmount?: number,
  ) {
    const h = 34
    const g = this.add.graphics()
    const draw = (hover: boolean) => {
      g.clear()
      g.fillStyle(hover ? COLOR_HOVER : COLOR_PANEL_ALT, 1)
      g.fillRoundedRect(x, y, w, h, 6)
      g.lineStyle(1, COLOR_GOLD, hover ? 1 : 0.6)
      g.strokeRoundedRect(x, y, w, h, 6)
    }
    draw(false)
    this.listContainer.add(g)
    if (coinAmount !== undefined) {
      // Action word on top, gold coin + amount centred below.
      this.listContainer.add(this.add.text(x + w / 2, y + 9, label, {
        fontSize: '12px', fontFamily: 'Arial, sans-serif', color, fontStyle: 'bold',
      }).setOrigin(0.5, 0.5))
      this.coinAmountCentered(this.listContainer, x + w / 2, y + 24, coinAmount, color, '12px', 12)
    } else {
      this.listContainer.add(this.add.text(x + w / 2, y + h / 2, label, {
        fontSize: '12px', fontFamily: 'Arial, sans-serif', color, fontStyle: 'bold', align: 'center',
      }).setOrigin(0.5, 0.5))
    }
    const hit = this.add.rectangle(x + w / 2, y + h / 2, w, h, 0, 0)
      .setInteractive({ useHandCursor: true })
    hit.on('pointerover', () => draw(true))
    hit.on('pointerout', () => draw(false))
    hit.on('pointerdown', onClick)
    this.listContainer.add(hit)
  }

  private drawBuyRow(l: MarketListing, y: number) {
    const rarName = l.itemData.rarity.charAt(0).toUpperCase() + l.itemData.rarity.slice(1)
    this.drawRowFrame(
      this.iconFor(l.itemType, l.itemData.icon), l.itemData.rarity, l.itemData.name,
      `${rarName}  ·  seller: ${l.sellerUsername}`,
      this.bonusSummary(l.itemData), y,
    )
    const w = PANEL_W
    // Price
    this.coinAmount(this.listContainer, PANEL_X + w - 250, y + ROW_H / 2, l.price, TEXT_GOLD, '16px')
    const affordable = this.silver >= l.price
    this.drawButton(
      affordable ? 'Buy' : 'Too costly', PANEL_X + w - 120, y + (ROW_H - 34) / 2, 108,
      affordable ? TEXT_GOLD : '#ff8866',
      () => {
        if (!affordable) { this.flash('Not enough silver.'); return }
        this.openConfirm(l.itemData, 'buy', l.price, () => {
          this.socket?.emit('market:buy', { listingId: l.listingId })
        })
      },
    )
  }

  private drawSellRow(item: ClientInventoryItem, y: number) {
    const base = this.displayBasePrice(item)
    const rarName = item.rarity.charAt(0).toUpperCase() + item.rarity.slice(1)
    const dataForModal: MarketItemData = {
      id: item.id, itemType: item.itemType, name: item.name, icon: item.icon,
      rarity: item.rarity, slot: this.slotOf(item) ?? '',
      stats: { ...(item.stats as Record<string, number | undefined>) } as Record<string, number>,
      attributes: item.attributes,
    }
    this.drawRowFrame(
      this.iconFor(item.itemType, item.icon), item.rarity, item.name, rarName, this.bonusSummary(dataForModal), y,
    )
    const w = PANEL_W
    // Sell to system (base)
    this.drawButton(
      'Sell', PANEL_X + w - 250, y + (ROW_H - 34) / 2, 110, TEXT_WHITE,
      () => this.openConfirm(dataForModal, 'sell', base, () => {
        this.socket?.emit('market:sell_to_system', { itemInstanceId: item.id })
      }),
      base,
    )
    // List for players (2× base)
    this.drawButton(
      'List', PANEL_X + w - 130, y + (ROW_H - 34) / 2, 118, TEXT_GOLD,
      () => this.openConfirm(dataForModal, 'list', base * 2, () => {
        this.socket?.emit('market:list', { itemInstanceId: item.id })
      }),
      base * 2,
    )
  }

  private drawMyListingRow(l: MarketListing, y: number) {
    const rarName = l.itemData.rarity.charAt(0).toUpperCase() + l.itemData.rarity.slice(1)
    this.drawRowFrame(
      this.iconFor(l.itemType, l.itemData.icon), l.itemData.rarity, l.itemData.name,
      `${rarName}  ·  listed`, this.bonusSummary(l.itemData), y,
    )
    const w = PANEL_W
    this.coinAmount(this.listContainer, PANEL_X + w - 240, y + ROW_H / 2, l.price, TEXT_GOLD, '16px')
    this.drawButton('Cancel', PANEL_X + w - 120, y + (ROW_H - 34) / 2, 108, '#ff8866',
      () => this.openConfirm(l.itemData, 'cancel', l.price, () => {
        this.socket?.emit('market:cancel', { listingId: l.listingId })
      }),
    )
  }

  // ── Confirmation modal ──────────────────────────────────────────────────

  private openConfirm(
    data: MarketItemData,
    action: 'buy' | 'sell' | 'list' | 'cancel',
    silver: number,
    onConfirm: () => void,
  ) {
    if (this.modalOpen) return
    this.modalOpen = true

    const overlay = this.add.container(0, 0).setDepth(100)
    const shade = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.6)
      .setOrigin(0, 0).setInteractive()
    overlay.add(shade)

    const mw = 480, mh = 280
    const mx = (GAME_WIDTH - mw) / 2, my = (GAME_HEIGHT - mh) / 2
    const g = this.add.graphics()
    g.fillStyle(COLOR_PANEL, 1)
    g.fillRoundedRect(mx, my, mw, mh, 12)
    g.lineStyle(2, COLOR_GOLD, 1)
    g.strokeRoundedRect(mx, my, mw, mh, 12)
    overlay.add(g)

    const titleMap = {
      buy: 'Confirm Purchase', sell: 'Confirm Sale',
      list: 'Confirm Listing', cancel: 'Confirm Cancel',
    }
    overlay.add(this.add.text(GAME_WIDTH / 2, my + 26, titleMap[action], {
      fontSize: '18px', fontFamily: 'Georgia, serif', color: TEXT_GOLD, fontStyle: 'bold',
    }).setOrigin(0.5, 0.5))

    // Item visual
    const rarCol = RARITY_COLOR[data.rarity] ?? RARITY_COLOR.common
    const ib = this.add.graphics()
    ib.fillStyle(COLOR_PANEL_ALT, 1)
    ib.fillRoundedRect(mx + 30, my + 56, 60, 60, 8)
    ib.lineStyle(2, rarCol, 0.9)
    ib.strokeRoundedRect(mx + 30, my + 56, 60, 60, 8)
    overlay.add(ib)
    overlay.add(this.add.text(mx + 60, my + 86, this.iconFor(data.itemType, data.icon), { fontSize: '32px' }).setOrigin(0.5, 0.5))
    overlay.add(this.add.text(mx + 104, my + 62, data.name, {
      fontSize: '15px', fontFamily: 'Georgia, serif', color: '#dde0ff', fontStyle: 'bold',
      wordWrap: { width: mw - 130 },
    }))
    overlay.add(this.add.text(mx + 104, my + 92, this.bonusSummary(data), {
      fontSize: '11px', fontFamily: 'Arial, sans-serif', color: '#7799bb',
      wordWrap: { width: mw - 130 },
    }))

    const verbMap = {
      buy: 'Buy this item for', sell: 'Sell this item to the system for',
      list: 'List this item for players at', cancel: 'Cancel this listing (item returns to you). Price was',
    }
    overlay.add(this.add.text(GAME_WIDTH / 2, my + 150, verbMap[action], {
      fontSize: '13px', fontFamily: 'Arial, sans-serif', color: TEXT_GRAY, align: 'center',
      wordWrap: { width: mw - 60 },
    }).setOrigin(0.5, 0.5))
    this.coinAmountCentered(overlay, GAME_WIDTH / 2, my + 182, silver, TEXT_GOLD, '24px', 22)

    const close = () => { overlay.destroy(); this.modalOpen = false }

    // Confirm / Cancel buttons (drawn on the overlay container directly)
    const btnY = my + mh - 52
    this.modalButton(overlay, 'Confirm', mx + 60, btnY, 160, true, () => {
      onConfirm(); close()
    })
    this.modalButton(overlay, 'Cancel', mx + mw - 220, btnY, 160, false, close)
  }

  private modalButton(
    parent: Phaser.GameObjects.Container, label: string,
    x: number, y: number, w: number, primary: boolean, onClick: () => void,
  ) {
    const h = 38
    const g = this.add.graphics()
    const draw = (hover: boolean) => {
      g.clear()
      g.fillStyle(primary ? (hover ? 0xffe24d : COLOR_GOLD) : (hover ? COLOR_HOVER : COLOR_PANEL_ALT), 1)
      g.fillRoundedRect(x, y, w, h, 8)
      g.lineStyle(1, COLOR_GOLD, primary ? 1 : 0.6)
      g.strokeRoundedRect(x, y, w, h, 8)
    }
    draw(false)
    parent.add(g)
    parent.add(this.add.text(x + w / 2, y + h / 2, label, {
      fontSize: '15px', fontFamily: 'Arial, sans-serif',
      color: primary ? '#1a1a2e' : TEXT_GRAY, fontStyle: 'bold',
    }).setOrigin(0.5, 0.5))
    const hit = this.add.rectangle(x + w / 2, y + h / 2, w, h, 0, 0)
      .setInteractive({ useHandCursor: true })
    hit.on('pointerover', () => draw(true))
    hit.on('pointerout', () => draw(false))
    hit.on('pointerdown', onClick)
    parent.add(hit)
  }
}
