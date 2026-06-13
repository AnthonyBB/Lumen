// ============================================================
// SkillShopScene — the Combat Training building.
//
// Browse the 13 class skill trees and buy skills with Skill
// Shards (🔷).  SECURITY: this scene only RENDERS state the
// server reports ('shop:unlocks' / 'shop:skill_purchased') and
// requests purchases via 'shop:buy_skill'.  Prices, prerequisite
// checks and balances are all enforced server-side; the values
// shown here are display-only.
// ============================================================

import Phaser from 'phaser'
import type { Socket } from 'socket.io-client'
import { GAME_WIDTH, GAME_HEIGHT } from '../constants'
import { addLeaveButton } from '../ui/leaveButton'
import {
  SKILL_TREES, MAX_SKILL_RANK, skillRankCost, skillRankLevelGate,
  type CombatSkill, type SkillTreeDef,
} from '../data/skillTrees'
import { StatsStore } from '../systems/StatsStore'

const COLOR_BG         = 0x0d0d1a
const COLOR_PANEL      = 0x12122a
const COLOR_PANEL_ALT  = 0x1a1a3a
const COLOR_BORDER     = 0xffd700
const COLOR_BORDER_DIM = 0x554400
const COLOR_SELECTED   = 0x2a2a5a
const COLOR_HOVER      = 0x1e1e44
const COLOR_TEXT_GOLD  = '#ffd700'
const COLOR_TEXT_WHITE = '#ffffff'
const COLOR_TEXT_GRAY  = '#aaaacc'
const COLOR_TEXT_DIM   = '#666688'

const LEFT_PANEL_W  = 300
const LEFT_PANEL_X  = 20
const RIGHT_PANEL_X = LEFT_PANEL_X + LEFT_PANEL_W + 16
const RIGHT_PANEL_W = GAME_WIDTH - RIGHT_PANEL_X - 20
const PANEL_TOP     = 70
const PANEL_H       = GAME_HEIGHT - PANEL_TOP - 20

/** Display copy of the server's tier pricing (server enforces the real price). */
const SKILL_PRICE_BY_TIER: Record<1 | 2 | 3 | 4 | 5, number> = {
  1: 1, 2: 2, 3: 3, 4: 5, 5: 8,
}

const PATH_LABEL: Record<CombatSkill['path'], string> = {
  core: 'Core', path_a: 'Path A', path_b: 'Path B',
}

interface ShopUnlocks {
  unlockedSkills: string[]
  skillRanks?: Record<string, number>
  unlockedStrategies: string[]
  skillShards: number
  combatShards: number
}

export class SkillShopScene extends Phaser.Scene {
  private socket: Socket | null = null
  private selectedTree: SkillTreeDef = SKILL_TREES[0]
  private unlockedSkills: Set<string> = new Set()
  private skillRanks: Record<string, number> = {}
  private skillShards = 0

  private classContainer!: Phaser.GameObjects.Container
  private skillListContainer!: Phaser.GameObjects.Container
  private headerBalanceText!: Phaser.GameObjects.Text
  private feedbackText!: Phaser.GameObjects.Text
  private scrollOffset = 0

  constructor() {
    super({ key: 'SkillShopScene' })
  }

  /** Scene to resume when this overlay closes (the building interior, or town). */
  private parentScene = 'WorldScene'

  init(data?: { parentScene?: string }) {
    this.parentScene = data?.parentScene ?? 'WorldScene'
  }

  create() {
    this.socket = (window as typeof window & { __lumenSocket?: Socket }).__lumenSocket ?? null
    this.scrollOffset = 0

    // ── Background ────────────────────────────────────────────────────────────
    const bg = this.add.graphics().setDepth(0)
    bg.fillStyle(COLOR_BG, 0.97)
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)
    for (let row = 0; row < GAME_HEIGHT; row += 64) {
      for (let col = 0; col < GAME_WIDTH; col += 128) {
        const shade = (row + col) % 256 === 0 ? 0x111128 : 0x0e0e20
        bg.fillStyle(shade, 0.4)
        bg.fillRect(col, row, 128, 64)
      }
    }

    this.drawHeader()

    this.classContainer = this.add.container(0, 0).setDepth(10)
    this.skillListContainer = this.add.container(0, 0).setDepth(10)

    this.feedbackText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 34, '', {
      fontSize: '14px', fontFamily: 'Arial, sans-serif', color: '#88ffaa',
      backgroundColor: '#000000aa', padding: { x: 10, y: 5 },
    }).setOrigin(0.5, 0.5).setDepth(50).setVisible(false)

    // ── Server listeners (server state is the only source of truth) ──────────
    const onUnlocks = (data: ShopUnlocks) => this.applyUnlocks(data)
    const onPurchased = (data: ShopUnlocks & { skillId: string }) => {
      this.applyUnlocks(data)
      const skill = this.findSkill(data.skillId)
      this.showFeedback(`✓ Learned ${skill?.name ?? data.skillId}!`, '#88ffaa')
    }
    const onError = (err: { message?: string }) => {
      if (err?.message) this.showFeedback(err.message, '#ff8866')
    }
    this.socket?.on('shop:unlocks', onUnlocks)
    this.socket?.on('shop:skill_purchased', onPurchased)
    this.socket?.on('error', onError)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.socket?.off('shop:unlocks', onUnlocks)
      this.socket?.off('shop:skill_purchased', onPurchased)
      this.socket?.off('error', onError)
    })

    // Request current unlocks + balance from the server
    this.socket?.emit('shop:get_unlocks')

    // ── Scrolling skill list (mouse wheel) ────────────────────────────────────
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      this.scrollOffset = Math.max(0, this.scrollOffset + Math.sign(dy))
      this.drawSkillList()
    })

    this.input.keyboard!.once('keydown-ESC', () => this.closeScene())

    this.drawClassPanel()
    this.drawSkillList()
  }

  private findSkill(skillId: string): CombatSkill | undefined {
    for (const tree of SKILL_TREES) {
      const s = tree.skills.find(sk => sk.id === skillId)
      if (s) return s
    }
    return undefined
  }

  private applyUnlocks(data: ShopUnlocks) {
    this.unlockedSkills = new Set(data.unlockedSkills ?? [])
    this.skillRanks = data.skillRanks
      ?? Object.fromEntries((data.unlockedSkills ?? []).map(id => [id, 1]))
    this.skillShards = data.skillShards ?? 0
    this.headerBalanceText.setText(`🔷 Skill Shards:  ${this.skillShards}`)
    this.drawSkillList()
  }

  private showFeedback(message: string, color: string) {
    this.feedbackText.setText(message).setColor(color).setVisible(true)
    this.time.delayedCall(2600, () => this.feedbackText.setVisible(false))
  }

  // ── Header ─────────────────────────────────────────────────────────────────
  private drawHeader() {
    const g = this.add.graphics().setDepth(5)
    g.fillStyle(COLOR_PANEL, 1)
    g.fillRect(0, 0, GAME_WIDTH, PANEL_TOP - 4)
    g.lineStyle(2, COLOR_BORDER, 1)
    g.lineBetween(0, PANEL_TOP - 4, GAME_WIDTH, PANEL_TOP - 4)

    // Title centred so the standard Leave button can own the top-left corner
    // (consistent with the crafting buildings).
    this.add.text(GAME_WIDTH / 2, PANEL_TOP / 2, '🏋  COMBAT TRAINING — SKILL SHOP', {
      fontSize: '22px', fontFamily: 'Georgia, serif',
      color: COLOR_TEXT_GOLD, fontStyle: 'bold',
    }).setOrigin(0.5, 0.5).setDepth(6)

    this.headerBalanceText = this.add.text(GAME_WIDTH - 24, PANEL_TOP / 2, '🔷 Skill Shards:  …', {
      fontSize: '16px', fontFamily: 'Georgia, serif', color: '#66bbff', fontStyle: 'bold',
    }).setOrigin(1, 0.5).setDepth(6)

    addLeaveButton(this, () => this.closeScene())
  }

  // ── Left panel: 13 classes ─────────────────────────────────────────────────
  private drawClassPanel() {
    this.classContainer.removeAll(true)

    const g = this.add.graphics()
    g.fillStyle(COLOR_PANEL, 1)
    g.fillRoundedRect(LEFT_PANEL_X, PANEL_TOP, LEFT_PANEL_W, PANEL_H, 8)
    g.lineStyle(1, COLOR_BORDER_DIM, 1)
    g.strokeRoundedRect(LEFT_PANEL_X, PANEL_TOP, LEFT_PANEL_W, PANEL_H, 8)
    this.classContainer.add(g)

    const hdrG = this.add.graphics()
    hdrG.fillStyle(0x1a1a35, 1)
    hdrG.fillRoundedRect(LEFT_PANEL_X, PANEL_TOP, LEFT_PANEL_W, 38, { tl: 8, tr: 8, bl: 0, br: 0 })
    this.classContainer.add(hdrG)

    this.classContainer.add(
      this.add.text(LEFT_PANEL_X + LEFT_PANEL_W / 2, PANEL_TOP + 19, 'CLASSES', {
        fontSize: '13px', fontFamily: 'Arial, sans-serif',
        color: COLOR_TEXT_GOLD, fontStyle: 'bold', letterSpacing: 2,
      }).setOrigin(0.5, 0.5)
    )

    const listStartY = PANEL_TOP + 46
    const itemH = Math.floor((PANEL_H - 54) / SKILL_TREES.length) - 2

    SKILL_TREES.forEach((tree, index) => {
      const itemY = listStartY + index * (itemH + 2)
      const isSelected = this.selectedTree.class === tree.class

      const btnBg = this.add.graphics()
      const drawBg = (selected: boolean, hover = false) => {
        btnBg.clear()
        btnBg.fillStyle(selected ? COLOR_SELECTED : hover ? COLOR_HOVER : COLOR_PANEL_ALT, 1)
        btnBg.fillRoundedRect(LEFT_PANEL_X + 8, itemY, LEFT_PANEL_W - 16, itemH, 5)
        btnBg.lineStyle(selected ? 2 : 1, selected ? COLOR_BORDER : 0x333366, selected ? 1 : 0.6)
        btnBg.strokeRoundedRect(LEFT_PANEL_X + 8, itemY, LEFT_PANEL_W - 16, itemH, 5)
      }
      drawBg(isSelected)
      this.classContainer.add(btnBg)

      const ownedCount = tree.skills.filter(s => this.unlockedSkills.has(s.id)).length
      const label = this.add.text(LEFT_PANEL_X + 18, itemY + itemH / 2, `${tree.icon} ${tree.label}`, {
        fontSize: '14px', fontFamily: 'Georgia, serif',
        color: isSelected ? COLOR_TEXT_GOLD : COLOR_TEXT_WHITE,
        fontStyle: isSelected ? 'bold' : 'normal',
      }).setOrigin(0, 0.5)
      this.classContainer.add(label)

      this.classContainer.add(
        this.add.text(LEFT_PANEL_X + LEFT_PANEL_W - 18, itemY + itemH / 2, `${ownedCount}/${tree.skills.length}`, {
          fontSize: '11px', fontFamily: 'Arial, sans-serif', color: COLOR_TEXT_DIM,
        }).setOrigin(1, 0.5)
      )

      const hit = this.add.zone(LEFT_PANEL_X + 8, itemY, LEFT_PANEL_W - 16, itemH).setOrigin(0, 0)
      hit.setInteractive({ useHandCursor: true })
      hit.on('pointerover', () => { if (!isSelected) { drawBg(false, true); label.setColor(COLOR_TEXT_GOLD) } })
      hit.on('pointerout',  () => { if (!isSelected) { drawBg(false); label.setColor(COLOR_TEXT_WHITE) } })
      hit.on('pointerdown', () => {
        this.selectedTree = tree
        this.scrollOffset = 0
        this.drawClassPanel()
        this.drawSkillList()
      })
      this.classContainer.add(hit)
    })
  }

  // ── Right panel: scrollable skill list for the selected class ──────────────
  private drawSkillList() {
    this.skillListContainer.removeAll(true)

    const tree = this.selectedTree

    const g = this.add.graphics()
    g.fillStyle(COLOR_PANEL, 1)
    g.fillRoundedRect(RIGHT_PANEL_X, PANEL_TOP, RIGHT_PANEL_W, PANEL_H, 8)
    g.lineStyle(1, COLOR_BORDER_DIM, 1)
    g.strokeRoundedRect(RIGHT_PANEL_X, PANEL_TOP, RIGHT_PANEL_W, PANEL_H, 8)
    this.skillListContainer.add(g)

    // Header: class name + description
    const hdrG = this.add.graphics()
    hdrG.fillStyle(0x1a1a35, 1)
    hdrG.fillRoundedRect(RIGHT_PANEL_X, PANEL_TOP, RIGHT_PANEL_W, 72, { tl: 8, tr: 8, bl: 0, br: 0 })
    this.skillListContainer.add(hdrG)

    this.skillListContainer.add(
      this.add.text(RIGHT_PANEL_X + 18, PANEL_TOP + 18, `${tree.icon}  ${tree.label}`, {
        fontSize: '19px', fontFamily: 'Georgia, serif', color: COLOR_TEXT_GOLD, fontStyle: 'bold',
      }).setOrigin(0, 0.5)
    )
    this.skillListContainer.add(
      this.add.text(RIGHT_PANEL_X + 18, PANEL_TOP + 46, tree.description, {
        fontSize: '11px', fontFamily: 'Arial, sans-serif', color: COLOR_TEXT_GRAY,
        wordWrap: { width: RIGHT_PANEL_W - 200 },
      }).setOrigin(0, 0.5)
    )
    this.skillListContainer.add(
      this.add.text(RIGHT_PANEL_X + RIGHT_PANEL_W - 16, PANEL_TOP + 18, 'Scroll: mouse wheel', {
        fontSize: '10px', fontFamily: 'Arial, sans-serif', color: COLOR_TEXT_DIM,
      }).setOrigin(1, 0.5)
    )

    // Skills sorted by tier, then path, so the tree reads top-down
    const pathOrder: Record<CombatSkill['path'], number> = { core: 0, path_a: 1, path_b: 2 }
    const skills = [...tree.skills].sort(
      (a, b) => a.tier - b.tier || pathOrder[a.path] - pathOrder[b.path]
    )

    const itemH = 62
    const listTop = PANEL_TOP + 80
    const listH = PANEL_H - 90
    const visibleCount = Math.floor(listH / (itemH + 6))
    const maxOffset = Math.max(0, skills.length - visibleCount)
    this.scrollOffset = Math.min(this.scrollOffset, maxOffset)

    const visible = skills.slice(this.scrollOffset, this.scrollOffset + visibleCount)

    visible.forEach((skill, i) => {
      const iy = listTop + i * (itemH + 6)
      this.drawSkillRow(skill, RIGHT_PANEL_X + 12, iy, RIGHT_PANEL_W - 24, itemH)
    })

    // Scroll indicator
    if (maxOffset > 0) {
      this.skillListContainer.add(
        this.add.text(RIGHT_PANEL_X + RIGHT_PANEL_W / 2, PANEL_TOP + PANEL_H - 10,
          `▲▼  ${this.scrollOffset + 1}–${this.scrollOffset + visible.length} of ${skills.length}`, {
          fontSize: '10px', fontFamily: 'Arial, sans-serif', color: COLOR_TEXT_DIM,
        }).setOrigin(0.5, 1)
      )
    }
  }

  private drawSkillRow(skill: CombatSkill, x: number, y: number, w: number, h: number) {
    const rank = this.skillRanks[skill.id] ?? 0
    const owned = rank >= 1
    const atMax = rank >= MAX_SKILL_RANK
    const missingPrereqs = owned ? [] : skill.requires.filter(r => (this.skillRanks[r] ?? 0) < 1)
    const locked = !owned && missingPrereqs.length > 0
    const nextRank = rank + 1
    const price = skillRankCost(SKILL_PRICE_BY_TIER[skill.tier], nextRank)
    const reqLevel = skillRankLevelGate(nextRank)
    const charLevel = StatsStore.get()?.level ?? 1
    const levelOk = charLevel >= reqLevel
    const affordable = this.skillShards >= price
    const canBuy = affordable && levelOk

    const bg = this.add.graphics()
    bg.fillStyle(owned ? 0x0e2a1a : locked ? 0x14142a : COLOR_PANEL_ALT, 1)
    bg.fillRoundedRect(x, y, w, h, 6)
    bg.lineStyle(1, owned ? 0x44aa66 : locked ? 0x333355 : 0x4444aa, 0.8)
    bg.strokeRoundedRect(x, y, w, h, 6)
    this.skillListContainer.add(bg)

    // Icon + name + tier/path
    this.skillListContainer.add(this.add.text(x + 12, y + h / 2, skill.icon, {
      fontSize: '22px',
    }).setOrigin(0, 0.5).setAlpha(locked ? 0.45 : 1))

    this.skillListContainer.add(this.add.text(x + 46, y + 14, skill.name, {
      fontSize: '15px', fontFamily: 'Georgia, serif',
      color: owned ? '#88ffaa' : locked ? COLOR_TEXT_DIM : COLOR_TEXT_WHITE,
      fontStyle: 'bold',
    }).setOrigin(0, 0.5))

    const rankTag = owned ? `  ·  Rank ${rank}/${MAX_SKILL_RANK}` : ''
    this.skillListContainer.add(this.add.text(x + 46, y + 33, `Tier ${skill.tier}  ·  ${PATH_LABEL[skill.path]}${rankTag}`, {
      fontSize: '10px', fontFamily: 'Arial, sans-serif', color: owned ? '#7fd6a0' : COLOR_TEXT_DIM,
    }).setOrigin(0, 0.5))

    const desc = skill.description.length > 78 ? skill.description.slice(0, 78) + '…' : skill.description
    this.skillListContainer.add(this.add.text(x + 46, y + 49, desc, {
      fontSize: '11px', fontFamily: 'Arial, sans-serif',
      color: locked ? '#555577' : COLOR_TEXT_GRAY,
    }).setOrigin(0, 0.5))

    // Right side: maxed badge / locked hint / buy-or-upgrade button
    if (atMax) {
      this.skillListContainer.add(this.add.text(x + w - 14, y + h / 2, `✓ MAX  ·  Rank ${MAX_SKILL_RANK}`, {
        fontSize: '12px', fontFamily: 'Arial, sans-serif', color: '#88ffaa',
        backgroundColor: '#0a2a1a', padding: { x: 8, y: 5 }, fontStyle: 'bold',
      }).setOrigin(1, 0.5))
      return
    }

    if (locked) {
      const prereqNames = missingPrereqs
        .map(id => this.findSkill(id)?.name ?? id)
        .slice(0, 2)
        .join(', ')
      this.skillListContainer.add(this.add.text(x + w - 14, y + h / 2 - 10, `🔒 Locked  ·  ${price} 🔷`, {
        fontSize: '12px', fontFamily: 'Arial, sans-serif', color: '#777799', fontStyle: 'bold',
      }).setOrigin(1, 0.5))
      this.skillListContainer.add(this.add.text(x + w - 14, y + h / 2 + 10, `Needs: ${prereqNames}`, {
        fontSize: '10px', fontFamily: 'Arial, sans-serif', color: COLOR_TEXT_DIM,
      }).setOrigin(1, 0.5))
      return
    }

    // Purchasable — Buy (first unlock) or Upgrade (next rank) button.
    const btnW = 120, btnH = 32
    const bx = x + w - btnW - 12
    const by = y + (h - btnH) / 2

    // Level gate not met → show a hint instead of an active button.
    if (!levelOk) {
      this.skillListContainer.add(this.add.text(x + w - 14, y + h / 2 - 9,
        `${owned ? `Rank ${nextRank}` : 'Unlock'}  ·  ${price} 🔷`, {
        fontSize: '12px', fontFamily: 'Arial, sans-serif', color: '#777799', fontStyle: 'bold',
      }).setOrigin(1, 0.5))
      this.skillListContainer.add(this.add.text(x + w - 14, y + h / 2 + 10, `🔒 Needs Level ${reqLevel}`, {
        fontSize: '10px', fontFamily: 'Arial, sans-serif', color: COLOR_TEXT_DIM,
      }).setOrigin(1, 0.5))
      return
    }

    const btnBg = this.add.graphics()
    const drawBtn = (hover = false) => {
      btnBg.clear()
      btnBg.fillStyle(canBuy ? (hover ? 0x2a3a1a : 0x1a2a1a) : 0x2a1a1a, 1)
      btnBg.fillRoundedRect(bx, by, btnW, btnH, 7)
      btnBg.lineStyle(2, canBuy ? (hover ? 0x88dd44 : 0x44aa44) : 0x664444, 1)
      btnBg.strokeRoundedRect(bx, by, btnW, btnH, 7)
    }
    drawBtn()
    this.skillListContainer.add(btnBg)

    const label = owned ? `Rank ${nextRank}  ${price} 🔷` : `Buy  ${price} 🔷`
    const btnText = this.add.text(bx + btnW / 2, by + btnH / 2, label, {
      fontSize: '12px', fontFamily: 'Arial, sans-serif',
      color: canBuy ? '#aaffaa' : '#cc7766', fontStyle: 'bold',
    }).setOrigin(0.5, 0.5).setInteractive({ useHandCursor: true })
    btnText.on('pointerover', () => drawBtn(true))
    btnText.on('pointerout',  () => drawBtn(false))
    btnText.on('pointerdown', () => {
      // The server re-validates everything (existence, prerequisites, level,
      // ownership, balance) — this emit is just a request to buy the NEXT rank.
      if (!this.socket?.connected) {
        this.showFeedback('Not connected to the server.', '#ff8866')
        return
      }
      this.socket.emit('shop:buy_skill', { skillId: skill.id })
    })
    this.skillListContainer.add(btnText)
  }

  private closeScene() {
    this.scene.resume(this.parentScene)
    this.scene.stop()
  }
}
