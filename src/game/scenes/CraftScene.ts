import Phaser from 'phaser'
import type { Socket } from 'socket.io-client'
import { GAME_WIDTH, GAME_HEIGHT } from '../constants'
import { recipesFor, type Recipe, type CraftBuilding } from '../data/recipes'
import { addLeaveButton } from '../ui/leaveButton'
import {
  MATERIALS, ladderFor, MAX_TIER, CATALYSTS, type Material,
} from '../data/materials'

/** Per-building UI flavour. `tierNote` describes what the base-material tier sets. */
const BUILDING_UI: Record<CraftBuilding, {
  title: string; prompt: string; subject: string; material: string; tierNote: string
}> = {
  forge:   { title: '🔥  THE  FORGE',       prompt: 'Choose a weapon to forge', subject: 'Math',    material: 'ore',     tierNote: 'sets weapon level' },
  armory:  { title: '🛡️  THE  ARMORY',      prompt: 'Choose armor to craft',    subject: 'Science', material: 'ore',     tierNote: 'sets armor level' },
  alchemy: { title: '⚗️  THE  ALCHEMY  LAB', prompt: 'Choose a potion to brew',  subject: 'Science', material: 'reagent', tierNote: 'sets potency' },
}

/** Client view of a craft-quiz question (server strips the correct index). */
interface CraftQuestion {
  id: string
  question: string
  answers: [string, string, string, string]
}

interface CraftResult {
  success: boolean
  score: number
  total: number
  item?: { name: string; icon: string; rarity: string }
  message: string
}

const RARITY_COLOR: Record<string, string> = {
  common: '#cfd8dc', uncommon: '#66bb6a', rare: '#42a5f5',
  epic: '#ab47bc', legendary: '#ffb300',
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII']

/**
 * A crafting building — forge a weapon or craft armor by answering a short quiz.
 * The server owns the questions, material spend and item roll (see
 * CraftSessionManager); this scene only collects the player's recipe/tier/
 * catalyst choices and renders the quiz. The `building` launch param selects
 * which recipes + subject + chrome are shown (Forge = Math, Armory = Science).
 */
export class CraftScene extends Phaser.Scene {
  private socket: Socket | null = null
  private content!: Phaser.GameObjects.Container
  private feedback!: Phaser.GameObjects.Text

  private building: CraftBuilding = 'forge'
  private recipes: Recipe[] = []
  /** Scene to resume when this overlay closes (the building interior). */
  private parentScene = 'WorldScene'

  private materials: Record<string, number> = {}
  private state: 'select' | 'quiz' | 'result' = 'select'

  private selectedRecipe!: Recipe
  private selectedTier = 1
  private selectedCatalystId: string | null = null

  private sessionId: string | null = null
  private question: CraftQuestion | null = null
  private answered = false
  private lastResult: CraftResult | null = null

  constructor() {
    super({ key: 'CraftScene' })
  }

  init(data: { building?: CraftBuilding; parentScene?: string }) {
    this.building = data?.building ?? 'forge'
    this.parentScene = data?.parentScene ?? 'WorldScene'
    this.recipes = recipesFor(this.building)
    this.selectedRecipe = this.recipes[0]
    this.state = 'select'
    this.selectedTier = 1
    this.selectedCatalystId = null
  }

  create() {
    this.socket = (window as typeof window & { __lumenSocket?: Socket }).__lumenSocket ?? null

    this.drawChrome()
    this.content = this.add.container(0, 0)
    this.feedback = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 16, '', {
      fontSize: '15px', color: '#ffd54f', fontStyle: 'bold',
    }).setOrigin(0.5)

    const onMaterials = (data: { materials?: Record<string, number> }) => {
      this.materials = data?.materials ?? {}
      if (this.state === 'select') this.render()
    }
    const onStarted = (data: { sessionId: string; firstQuestion: CraftQuestion }) => {
      this.sessionId = data.sessionId
      this.question = data.firstQuestion
      this.answered = false
      this.state = 'quiz'
      this.feedback.setText('')
      this.render()
    }
    const onAnswer = (data: {
      correct: boolean; explanation: string; sessionComplete: boolean
      nextQuestion?: CraftQuestion; craft?: CraftResult
    }) => {
      this.feedback.setColor(data.correct ? '#81c784' : '#ef9a9a')
      this.feedback.setText(data.explanation)
      if (data.sessionComplete) {
        this.lastResult = data.craft ?? null
        this.sessionId = null
        this.question = null
        this.state = 'result'
        this.render()
      } else if (data.nextQuestion) {
        this.time.delayedCall(900, () => {
          this.question = data.nextQuestion!
          this.answered = false
          this.feedback.setText('')
          this.render()
        })
      }
    }
    const onError = (data: { message?: string }) => {
      this.feedback.setColor('#ef9a9a')
      this.feedback.setText(data?.message ?? 'Something went wrong.')
      this.answered = false
    }

    this.socket?.on('materials:data', onMaterials)
    this.socket?.on('craft:session_started', onStarted)
    this.socket?.on('craft:answer_result', onAnswer)
    this.socket?.on('error', onError)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.socket?.off('materials:data', onMaterials)
      this.socket?.off('craft:session_started', onStarted)
      this.socket?.off('craft:answer_result', onAnswer)
      this.socket?.off('error', onError)
    })

    // ESC always leaves, even mid-quiz — abandoning a craft is free because
    // materials are only consumed when a craft completes.
    this.input.keyboard!.on('keydown-ESC', () => this.closeScene())

    this.socket?.emit('materials:get')
    this.render()
  }

  private closeScene() {
    this.scene.resume(this.parentScene)
    this.scene.stop() // stop THIS scene (key-agnostic, survives renames)
  }

  // ── Chrome ────────────────────────────────────────────────────────────────

  private drawChrome() {
    const bg = this.add.graphics()
    bg.fillStyle(0x1a120b, 1)
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)
    const hg = this.add.graphics()
    hg.fillStyle(0x3a2616, 1)
    hg.fillRect(0, 0, GAME_WIDTH, 56)
    hg.lineStyle(2, 0xff8a50, 1)
    hg.lineBetween(0, 56, GAME_WIDTH, 56)
    this.add.text(GAME_WIDTH / 2, 28, BUILDING_UI[this.building].title, {
      fontSize: '22px', color: '#ffcc80', fontStyle: 'bold',
    }).setOrigin(0.5)
    // Standard leave button (works in every state, independent of the keyboard).
    addLeaveButton(this, () => this.closeScene())
  }

  // ── Rendering ───────────────────────────────────────────────────────────────

  private render() {
    this.content.removeAll(true)
    if (this.state === 'select') this.renderSelect()
    else if (this.state === 'quiz') this.renderQuiz()
    else this.renderResult()
  }

  private renderSelect() {
    const cx = GAME_WIDTH / 2

    this.content.add(this.label(cx, 78, BUILDING_UI[this.building].prompt, '16px', '#d7ccc8').setOrigin(0.5))

    // Recipe cards row.
    const n = this.recipes.length
    const cardW = 144, gap = 16
    const totalW = n * cardW + (n - 1) * gap
    let x = cx - totalW / 2
    for (const r of this.recipes) {
      const selected = r.id === this.selectedRecipe.id
      const card = this.card(x, 104, cardW, 110, selected)
      this.content.add(card)
      this.content.add(this.label(x + cardW / 2, 132, r.icon, '34px', '#ffffff').setOrigin(0.5))
      // Name wraps inside the card so long names ("Rejuvenation Potion") don't bleed.
      this.content.add(this.label(x + cardW / 2, 166, r.name, '14px', '#ffffff', true)
        .setOrigin(0.5).setAlign('center').setWordWrapWidth(cardW - 12))
      this.content.add(this.label(x + cardW / 2, 199, r.topicHint, '11px', '#a1887f')
        .setOrigin(0.5).setWordWrapWidth(cardW - 8))
      this.hit(x, 104, cardW, 110, () => { this.selectedRecipe = r; this.render() })
      x += cardW + gap
    }

    // Base-material tier picker — only tiers the player owns enough of selectable.
    const ui = BUILDING_UI[this.building]
    const ladder = ladderFor(this.building)
    const cost = this.selectedRecipe.materialCost
    let y = 250
    this.content.add(this.label(cx, y, `${ui.material === 'reagent' ? 'Reagent' : 'Metal'} tier  (costs ${cost} ${ui.material} — ${ui.tierNote})`, '14px', '#d7ccc8').setOrigin(0.5))
    y += 30
    const tileW = 104, tgap = 8
    const totalTW = MAX_TIER * tileW + (MAX_TIER - 1) * tgap
    let tx = cx - totalTW / 2
    let bestAffordable = 0
    for (let t = 1; t <= MAX_TIER; t++) {
      const mat = MATERIALS[ladder[t]]
      const owned = this.materials[ladder[t]] ?? 0
      const affordable = owned >= cost
      if (affordable) bestAffordable = t
      const selected = t === this.selectedTier
      this.content.add(this.card(tx, y, tileW, 58, selected, !affordable))
      // Material name wraps inside the tile; tier + owned count on the line below.
      this.content.add(this.label(tx + tileW / 2, y + 15, mat.name, '11px', affordable ? '#ffffff' : '#6d5b4f', true)
        .setOrigin(0.5).setAlign('center').setWordWrapWidth(tileW - 10))
      this.content.add(this.label(tx + tileW / 2, y + 40, `${ROMAN[t]} · ${owned} owned`, '10px', affordable ? '#cfd8dc' : '#6d5b4f').setOrigin(0.5))
      if (affordable) this.hit(tx, y, tileW, 58, () => { this.selectedTier = t; this.render() })
      tx += tileW + tgap
    }
    // Keep the selection valid/affordable.
    if ((this.materials[ladder[this.selectedTier]] ?? 0) < cost) {
      this.selectedTier = bestAffordable
    }

    // Catalyst picker (None + any owned catalysts).
    y += 90
    this.content.add(this.label(cx, y, 'Catalyst  (optional — unlocks higher rarity)', '14px', '#d7ccc8').setOrigin(0.5))
    y += 30
    const options: (Material | null)[] = [null, ...CATALYSTS.filter((c) => (this.materials[c.id] ?? 0) > 0)]
    const optW = 130, ogap = 12
    const totalOW = options.length * optW + (options.length - 1) * ogap
    let ox = cx - totalOW / 2
    for (const opt of options) {
      const id = opt?.id ?? null
      const selected = id === this.selectedCatalystId
      this.content.add(this.card(ox, y, optW, 52, selected))
      const lbl = opt ? `${opt.icon} ${opt.name}` : '— None —'
      this.content.add(this.label(ox + optW / 2, y + 18, lbl, '12px', opt ? RARITY_COLOR[opt.rarityGate ?? 'common'] : '#cfd8dc', true).setOrigin(0.5))
      if (opt) this.content.add(this.label(ox + optW / 2, y + 36, `×${this.materials[opt.id] ?? 0}`, '11px', '#a1887f').setOrigin(0.5))
      else this.content.add(this.label(ox + optW / 2, y + 36, 'common', '11px', '#a1887f').setOrigin(0.5))
      this.hit(ox, y, optW, 52, () => { this.selectedCatalystId = id; this.render() })
      ox += optW + ogap
    }
    // Drop a now-unowned catalyst selection.
    if (this.selectedCatalystId && (this.materials[this.selectedCatalystId] ?? 0) <= 0) {
      this.selectedCatalystId = null
    }

    // Begin button.
    const canCraft = bestAffordable > 0
    y += 96
    const btn = this.button(cx - 130, y, 260, 52, canCraft ? 'Begin Crafting ⚒️' : `Need more ${ui.material}`, canCraft, () => {
      this.feedback.setText('')
      this.socket?.emit('craft:start', {
        recipeId: this.selectedRecipe.id,
        tier: this.selectedTier,
        catalystId: this.selectedCatalystId,
      })
    })
    this.content.add(btn)
    this.content.add(this.label(cx, y + 70, 'Answer 3 of 5 questions to craft. A perfect quiz reaches the catalyst’s full rarity.', '12px', '#8d6e63').setOrigin(0.5))
  }

  private renderQuiz() {
    const cx = GAME_WIDTH / 2
    if (!this.question) return
    this.content.add(this.label(cx, 90, `Crafting a ${this.selectedRecipe.name}  ·  ${BUILDING_UI[this.building].subject} quiz`, '15px', '#ffcc80', true).setOrigin(0.5))

    this.content.add(this.card(cx - 380, 120, 760, 90, false))
    this.content.add(this.label(cx, 165, this.question.question, '18px', '#ffffff').setOrigin(0.5).setWordWrapWidth(720))

    let y = 250
    this.question.answers.forEach((ans, i) => {
      const btn = this.button(cx - 320, y, 640, 56, ans, !this.answered, () => {
        if (this.answered || !this.sessionId || !this.question) return
        this.answered = true
        this.socket?.emit('craft:answer', {
          sessionId: this.sessionId, questionId: this.question.id, answerIndex: i,
        })
      })
      this.content.add(btn)
      y += 68
    })
  }

  private renderResult() {
    const cx = GAME_WIDTH / 2
    const r = this.lastResult
    const title = r?.success ? 'Weapon Forged!' : 'Craft Failed'
    this.content.add(this.label(cx, 150, title, '26px', r?.success ? '#ffd54f' : '#ef9a9a', true).setOrigin(0.5))

    if (r?.item) {
      this.content.add(this.label(cx, 230, r.item.icon, '64px', '#ffffff').setOrigin(0.5))
      this.content.add(this.label(cx, 295, r.item.name, '20px', RARITY_COLOR[r.item.rarity] ?? '#ffffff', true).setOrigin(0.5))
      this.content.add(this.label(cx, 322, r.item.rarity.toUpperCase(), '13px', RARITY_COLOR[r.item.rarity] ?? '#ffffff').setOrigin(0.5))
    }
    if (r) {
      this.content.add(this.label(cx, 375, `Score: ${r.score} / ${r.total}`, '16px', '#d7ccc8').setOrigin(0.5))
      this.content.add(this.label(cx, 405, r.message, '14px', '#bcaaa4').setOrigin(0.5).setWordWrapWidth(700))
    }

    this.content.add(this.button(cx - 270, 470, 250, 52, 'Forge Again', true, () => {
      this.state = 'select'; this.feedback.setText(''); this.socket?.emit('materials:get'); this.render()
    }))
    this.content.add(this.button(cx + 20, 470, 250, 52, 'Leave', true, () => this.closeScene()))
  }

  // ── Small UI helpers ─────────────────────────────────────────────────────────

  private label(x: number, y: number, text: string, size: string, color: string, bold = false) {
    return this.add.text(x, y, text, {
      fontSize: size, color, fontStyle: bold ? 'bold' : 'normal',
    })
  }

  private card(x: number, y: number, w: number, h: number, selected: boolean, dim = false) {
    const g = this.add.graphics()
    g.fillStyle(dim ? 0x241a12 : selected ? 0x4e342e : 0x2e2018, 1)
    g.fillRoundedRect(x, y, w, h, 8)
    g.lineStyle(2, selected ? 0xffb300 : 0x5d4037, 1)
    g.strokeRoundedRect(x, y, w, h, 8)
    return g
  }

  private button(x: number, y: number, w: number, h: number, text: string, enabled: boolean, cb: () => void) {
    const c = this.add.container(0, 0)
    const g = this.add.graphics()
    const draw = (fill: number) => {
      g.clear()
      g.fillStyle(enabled ? fill : 0x2a2018, 1)
      g.fillRoundedRect(x, y, w, h, 8)
      g.lineStyle(2, enabled ? 0xff8a50 : 0x4e342e, 1)
      g.strokeRoundedRect(x, y, w, h, 8)
    }
    draw(0x5d4037)
    const t = this.add.text(x + w / 2, y + h / 2, text, {
      fontSize: '16px', color: enabled ? '#ffffff' : '#7c6a5d', fontStyle: 'bold',
    }).setOrigin(0.5)
    c.add([g, t])
    if (enabled) {
      const zone = this.add.zone(x, y, w, h).setOrigin(0).setInteractive({ useHandCursor: true })
      zone.on('pointerover', () => draw(0x6d4c41))
      zone.on('pointerout', () => draw(0x5d4037))
      zone.on('pointerdown', () => { draw(0xffb300); this.time.delayedCall(90, () => { draw(0x5d4037); cb() }) })
      c.add(zone)
    }
    return c
  }

  /** Transparent interactive overlay used to make a drawn card clickable. */
  private hit(x: number, y: number, w: number, h: number, cb: () => void) {
    const zone = this.add.zone(x, y, w, h).setOrigin(0).setInteractive({ useHandCursor: true })
    zone.on('pointerdown', cb)
    this.content.add(zone)
  }
}
