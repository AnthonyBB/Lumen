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
import { EQUIPMENT_MAP, type EquipSlot } from '../data/equipmentGen'

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

// The 8 market tabs == generated EquipSlot values.
const TABS: { slot: EquipSlot; label: string }[] = [
  { slot: 'weapon', label: 'Weapon' },
  { slot: 'helmet', label: 'Helmet' },
  { slot: 'chest', label: 'Chest' },
  { slot: 'legs', label: 'Legs' },
  { slot: 'boots', label: 'Boots' },
  { slot: 'gloves', label: 'Gloves' },
  { slot: 'ring', label: 'Ring' },
  { slot: 'amulet', label: 'Amulet' },
]

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
  private activeSlot: EquipSlot = 'weapon'
  private search = ''
  private scrollOffset = 0

  // Containers / widgets
  private listContainer!: Phaser.GameObjects.Container
  private chromeContainer!: Phaser.GameObjects.Container
  private feedbackText!: Phaser.GameObjects.Text
  private searchText!: Phaser.GameObjects.Text
  private silverText!: Phaser.GameObjects.Text

  private htmlInput: HTMLInputElement | null = null
  private modalOpen = false

  constructor() {
    super({ key: 'MarketScene' })
  }

  create() {
    this.socket = (window as typeof window & { __lumenSocket?: Socket }).__lumenSocket ?? null
    this.mode = 'buy'
    this.sellView = 'items'
    this.activeSlot = 'weapon'
    this.search = ''
    this.scrollOffset = 0
    this.modalOpen = false

    this.drawBackground()
    this.drawHeader()
    this.chromeContainer = this.add.container(0, 0)
    this.listContainer = this.add.container(0, 0)

    this.feedbackText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 18, '', {
      fontSize: '14px', fontFamily: 'Arial, sans-serif', color: '#ff8866',
      backgroundColor: '#000000aa', padding: { x: 10, y: 4 },
    }).setOrigin(0.5, 1).setDepth(60).setVisible(false)

    this.buildSearchInput()

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
    const onSold = (d: { silver?: number }) => { this.flash(`Sold for ${d?.silver ?? 0} 🪙.`); this.refresh() }
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
      this.destroySearchInput()
    })

    // Seed from whatever we already have, then ask the server for fresh data.
    this.inventory = InventoryStore.get()
    this.socket?.emit('inventory:get')
    this.socket?.emit('currency:get')
    this.requestListings()

    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      if (this.modalOpen) return
      this.scrollOffset = Math.max(0, this.scrollOffset + Math.sign(dy))
      this.rebuildList()
    })

    this.input.keyboard!.on('keydown-ESC', () => {
      if (this.modalOpen) return
      this.closeScene()
    })

    this.drawChrome()
  }

  private closeScene() {
    this.destroySearchInput()
    this.scene.stop('MarketScene')
    this.scene.resume('WorldScene')
  }

  // ── Server requests ─────────────────────────────────────────────────────

  private requestListings() {
    if (this.mode === 'sell' && this.sellView === 'mine') {
      this.socket?.emit('market:my_listings')
    } else {
      this.socket?.emit('market:get_listings', { slot: this.activeSlot, search: this.search })
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
    this.updateSilverText()

    // ESC close button
    this.add.text(24, 28, 'ESC  Close', {
      fontSize: '13px', fontFamily: 'Arial, sans-serif', color: TEXT_GRAY,
    }).setOrigin(0, 0.5)
  }

  private updateSilverText() {
    if (this.silverText) this.silverText.setText(`🪙 ${this.silver}`)
  }

  // ── Chrome: mode toggle + tabs + search ─────────────────────────────────

  private drawChrome() {
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

    // Item-type tabs
    const tabY = 120
    const tabW = (PANEL_W - 7 * 6) / 8
    TABS.forEach((tab, i) => {
      const x = PANEL_X + i * (tabW + 6)
      this.makeTab(tab.label, x, tabY, tabW, this.activeSlot === tab.slot, () => {
        if (this.activeSlot === tab.slot) return
        this.activeSlot = tab.slot; this.scrollOffset = 0
        this.drawChrome()
        if (!(this.mode === 'sell' && this.sellView === 'mine')) this.requestListings()
        this.rebuildList()
      })
    })

    // Search box (HTML input is positioned over this frame)
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

    // The HTML overlay shows the live text; this Phaser text is a fallback.
    this.searchText = this.add.text(PANEL_X + 10, searchY + 15, this.search || 'Search…', {
      fontSize: '13px', fontFamily: 'Arial, sans-serif',
      color: this.search ? TEXT_WHITE : TEXT_DIM,
    }).setOrigin(0, 0.5)
    this.chromeContainer.add(this.searchText)
    this.positionSearchInput(PANEL_X, searchY, 420, 30)
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

  // ── HTML search input overlay ───────────────────────────────────────────

  private buildSearchInput() {
    const input = document.createElement('input')
    input.type = 'text'
    input.placeholder = 'Search…'
    input.maxLength = 40
    Object.assign(input.style, {
      position: 'absolute', zIndex: '40', boxSizing: 'border-box',
      background: 'transparent', border: 'none', outline: 'none',
      color: '#ffffff', font: '13px Arial, sans-serif', padding: '0 10px',
    } as Partial<CSSStyleDeclaration>)
    let debounce = 0
    input.addEventListener('input', () => {
      this.search = input.value
      this.searchText.setText(this.search || 'Search…')
        .setColor(this.search ? TEXT_WHITE : TEXT_DIM)
      window.clearTimeout(debounce)
      debounce = window.setTimeout(() => {
        if (!(this.mode === 'sell' && this.sellView === 'mine')) this.requestListings()
        else this.rebuildList()
      }, 250)
    })
    // Don't let game keys (ESC handled here) pass to Phaser while typing.
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { input.blur(); this.closeScene() }
      e.stopPropagation()
    })
    const parent = this.game.canvas.parentElement ?? document.body
    parent.appendChild(input)
    this.htmlInput = input
  }

  /** Position the overlay input to line up with the canvas-space search frame. */
  private positionSearchInput(x: number, y: number, w: number, h: number) {
    const input = this.htmlInput
    if (!input) return
    const canvas = this.game.canvas
    const rect = canvas.getBoundingClientRect()
    const scaleX = rect.width / GAME_WIDTH
    const scaleY = rect.height / GAME_HEIGHT
    Object.assign(input.style, {
      left: `${rect.left + window.scrollX + x * scaleX}px`,
      top: `${rect.top + window.scrollY + y * scaleY}px`,
      width: `${w * scaleX}px`,
      height: `${h * scaleY}px`,
    } as Partial<CSSStyleDeclaration>)
  }

  private destroySearchInput() {
    if (this.htmlInput) {
      this.htmlInput.remove()
      this.htmlInput = null
    }
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
      return this.myListings.map((l) => (y: number) => this.drawMyListingRow(l, y))
    }
    // Sell items: own bag, filtered to the active tab slot.
    const items = (this.inventory?.items ?? []).filter((it) => this.sellableInSlot(it))
    return items.map((it) => (y: number) => this.drawSellRow(it, y))
  }

  /** True when a bag item is sellable AND belongs to the active tab's slot. */
  private sellableInSlot(item: ClientInventoryItem): boolean {
    const slot = this.slotOf(item)
    return slot === this.activeSlot
  }

  /** The market slot for a bag item (generated gear has an exact slot). */
  private slotOf(item: ClientInventoryItem): EquipSlot | null {
    const gen = EQUIPMENT_MAP[item.itemType]
    if (gen) return gen.slot
    // Legacy heuristic mirrors the server's buildItemSnapshot fallback.
    const s = item.stats ?? {}
    if (typeof s.attack === 'number' && s.attack > 0) return 'weapon'
    if (typeof s.defense === 'number' && s.defense > 0) return 'chest'
    return 'amulet'
  }

  // ── Price helpers (DISPLAY ONLY — server recomputes authoritatively) ─────

  private displayBasePrice(item: ClientInventoryItem): number {
    const gen = EQUIPMENT_MAP[item.itemType]
    if (gen) {
      const rv = RARITY_VALUE[gen.rarity] ?? RARITY_VALUE.common
      const attrSum = gen.attributes.reduce((a, x) => a + Math.abs(x.value), 0)
      return rv + attrSum * 3 + Math.floor(gen.xpRequired / 20)
    }
    const statSum = Object.values(item.stats ?? {}).reduce(
      (a, v) => a + (typeof v === 'number' ? v : 0), 0)
    return 10 + statSum * 5
  }

  private bonusSummary(data: { itemType: string; attributes?: MarketAttribute[]; stats?: Record<string, number | undefined> }): string {
    const gen = EQUIPMENT_MAP[data.itemType]
    if (gen) {
      return gen.attributes.map((a) => `+${a.value} ${this.attrLabel(a.type)}`).join('  ')
    }
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
    const t = this.add.text(x + w / 2, y + h / 2, label, {
      fontSize: '12px', fontFamily: 'Arial, sans-serif', color, fontStyle: 'bold', align: 'center',
    }).setOrigin(0.5, 0.5)
    this.listContainer.add(t)
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
      l.itemData.icon, l.itemData.rarity, l.itemData.name,
      `${rarName}  ·  seller: ${l.sellerUsername}`,
      this.bonusSummary(l.itemData), y,
    )
    const w = PANEL_W
    // Price
    this.listContainer.add(this.add.text(PANEL_X + w - 250, y + ROW_H / 2, `🪙 ${l.price}`, {
      fontSize: '16px', fontFamily: 'Georgia, serif', color: TEXT_GOLD, fontStyle: 'bold',
    }).setOrigin(0, 0.5))
    const affordable = this.silver >= l.price
    this.drawButton(
      affordable ? 'Buy' : 'Need 🪙', PANEL_X + w - 120, y + (ROW_H - 34) / 2, 108,
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
      attributes: EQUIPMENT_MAP[item.itemType]?.attributes,
    }
    this.drawRowFrame(
      item.icon, item.rarity, item.name, rarName, this.bonusSummary(dataForModal), y,
    )
    const w = PANEL_W
    // Sell to system (base)
    this.drawButton(
      `Sell\n🪙 ${base}`, PANEL_X + w - 250, y + (ROW_H - 34) / 2, 110, TEXT_WHITE,
      () => this.openConfirm(dataForModal, 'sell', base, () => {
        this.socket?.emit('market:sell_to_system', { itemInstanceId: item.id })
      }),
    )
    // List for players (2× base)
    this.drawButton(
      `List\n🪙 ${base * 2}`, PANEL_X + w - 130, y + (ROW_H - 34) / 2, 118, TEXT_GOLD,
      () => this.openConfirm(dataForModal, 'list', base * 2, () => {
        this.socket?.emit('market:list', { itemInstanceId: item.id })
      }),
    )
  }

  private drawMyListingRow(l: MarketListing, y: number) {
    const rarName = l.itemData.rarity.charAt(0).toUpperCase() + l.itemData.rarity.slice(1)
    this.drawRowFrame(
      l.itemData.icon, l.itemData.rarity, l.itemData.name,
      `${rarName}  ·  listed`, this.bonusSummary(l.itemData), y,
    )
    const w = PANEL_W
    this.listContainer.add(this.add.text(PANEL_X + w - 240, y + ROW_H / 2, `🪙 ${l.price}`, {
      fontSize: '16px', fontFamily: 'Georgia, serif', color: TEXT_GOLD, fontStyle: 'bold',
    }).setOrigin(0, 0.5))
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
    overlay.add(this.add.text(mx + 60, my + 86, data.icon, { fontSize: '32px' }).setOrigin(0.5, 0.5))
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
    overlay.add(this.add.text(GAME_WIDTH / 2, my + 182, `🪙 ${silver}`, {
      fontSize: '24px', fontFamily: 'Georgia, serif', color: TEXT_GOLD, fontStyle: 'bold',
    }).setOrigin(0.5, 0.5))

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
