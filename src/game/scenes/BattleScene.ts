/**
 * BattleScene — turn-based combat that launches over BiomeScene.
 *
 * Flow:
 *  1. BiomeScene calls scene.launch('BattleScene', data) then scene.pause().
 *  2. Player answers questions to damage the current target mob.
 *  3. Wrong answers cost the player HP (mob counter-attacks).
 *  4. When all mobs are defeated → victory; player HP ≤ 0 → defeat.
 *  5. BattleScene calls biomeScene.onBattleResult(result), scene.stop(),
 *     scene.resume('BiomeScene').
 */

import Phaser from 'phaser'
import type { Socket } from 'socket.io-client'
import type { Question, Subject } from '../../engine/types'
import { QUESTIONS_BY_SUBJECT } from '../../engine/questions'
import { GAME_WIDTH, GAME_HEIGHT } from '../constants'
import type { BiomeScene } from './BiomeScene'

// ── Public types (imported by BiomeScene) ──────────────────────────────────

export interface MobDef {
  name: string
  level: number
  maxHp: number
}

export interface BattleSceneData {
  biome: string
  difficulty: 'easy' | 'medium' | 'hard'
  subject: Subject
  mobs: MobDef[]
  encounterIndex: number    // 0-based index of this encounter in the biome run
  totalEncounters: number
  playerHp: number
  playerMaxHp: number
}

export interface BattleResult {
  victory: boolean
  playerHp: number
  xpGained: number
}

// ── Combat constants ────────────────────────────────────────────────────────

const CORRECT_DAMAGE = 25          // damage per correct answer (all difficulties)
const MOB_DAMAGE: Record<string, number> = { easy: 8,  medium: 14, hard: 22 }
const XP_PER_MOB:  Record<string, number> = { easy: 15, medium: 25, hard: 40 }

// Biome → body color for mob sprites
const MOB_COLOR: Record<string, number> = {
  'Desert':              0xd4903a,
  'Pine Forest':         0x5a6a7a,
  'Deciduous Forest':    0x7a4a20,
  'Swamp':               0x3a6a38,
  'Snow':                0xddeeff,
  'Grassland':           0x7a5a40,
  'Tropical Rainforest': 0x2a2a40,
  'Ocean':               0x5a7a8a,
}

// ── Layout ─────────────────────────────────────────────────────────────────

const MOB_AREA_BOTTOM = 255
const STATUS_TOP      = MOB_AREA_BOTTOM
const STATUS_BOTTOM   = 310
const Q_CENTER_Y      = 385
const BTN_ROW1_Y      = 480
const BTN_ROW2_Y      = 578
const BTN_W           = 570
const BTN_H           = 82
const BTN_LEFT_X      = 320
const BTN_RIGHT_X     = 960
const FEEDBACK_Y      = 672
const LETTERS         = ['A', 'B', 'C', 'D']

// ── Active mob state ────────────────────────────────────────────────────────

interface ActiveMob extends MobDef {
  hp: number
  alive: boolean
  displayX: number
  displayY: number
}

// ── BattleScene ─────────────────────────────────────────────────────────────

export class BattleScene extends Phaser.Scene {
  private battleData!: BattleSceneData
  private mobs: ActiveMob[] = []
  private targetIdx = 0               // index of current target in this.mobs
  private playerHp = 100
  private playerMaxHp = 100
  private xpGained = 0
  private questionPool: Question[] = []
  private usedIds = new Set<string>()
  private currentQ!: Question
  private locked = false

  // ── Live GameObjects ──────────────────────────────────────────────────────
  private mobGfxLayer: Phaser.GameObjects.GameObject[] = []
  private playerHpGfx!: Phaser.GameObjects.Graphics
  private playerHpText!: Phaser.GameObjects.Text
  private questionText!: Phaser.GameObjects.Text
  private feedbackText!: Phaser.GameObjects.Text
  private btnContainers: Phaser.GameObjects.Container[] = []
  private numKeys!: Phaser.Input.Keyboard.Key[]

  constructor() { super({ key: 'BattleScene' }) }

  init(data: BattleSceneData) {
    this.battleData = data
    this.playerHp = data.playerHp
    this.playerMaxHp = data.playerMaxHp
    this.xpGained = 0
    this.locked = false
    this.usedIds = new Set()
    this.mobs = []
    this.targetIdx = 0
  }

  create() {
    // Build question pool for this battle's subject + difficulty
    const pool = QUESTIONS_BY_SUBJECT[this.battleData.subject]
      .filter(q => q.difficulty === this.battleData.difficulty)
    // Fallback: all subjects at this difficulty
    this.questionPool = pool.length > 0
      ? Phaser.Utils.Array.Shuffle([...pool]) as Question[]
      : Phaser.Utils.Array.Shuffle(
          Object.values(QUESTIONS_BY_SUBJECT).flat()
            .filter(q => q.difficulty === this.battleData.difficulty)
        ) as Question[]

    // Assign display positions to mobs, then build ActiveMob array
    this.assignMobPositions()

    // Draw static UI
    this.drawBackground()
    this.drawMobs()
    this.drawStatusBar()
    this.drawQuestionArea()

    // Keyboard shortcuts
    this.numKeys = [
      this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ONE),
      this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.TWO),
      this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.THREE),
      this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.FOUR),
    ]

    this.nextQuestion()
  }

  // ── Mob position assignment ─────────────────────────────────────────────

  private assignMobPositions() {
    const total = this.battleData.mobs.length
    const row1 = Math.min(5, total)
    const row2 = total - row1

    const ROW1_Y = row2 > 0 ? 118 : 160
    const ROW2_Y = 218
    const spacing = (n: number) => Math.min(140, (GAME_WIDTH - 120) / Math.max(n, 1))

    const place = (count: number, y: number, offset: number): { x: number; y: number }[] => {
      const sp = spacing(count)
      const startX = GAME_WIDTH / 2 - ((count - 1) * sp) / 2
      return Array.from({ length: count }, (_, i) => ({
        x: startX + i * sp + offset,
        y,
      }))
    }

    const positions = [
      ...place(row1, ROW1_Y, 0),
      ...place(row2, ROW2_Y, 0),
    ]

    this.mobs = this.battleData.mobs.map((def, i) => ({
      ...def,
      hp: def.maxHp,
      alive: true,
      displayX: positions[i]?.x ?? GAME_WIDTH / 2,
      displayY: positions[i]?.y ?? 160,
    }))
  }

  // ── Background ────────────────────────────────────────────────────────────

  private drawBackground() {
    const bg = this.add.graphics().setDepth(0)

    // Dark battle overlay
    bg.fillStyle(0x080818, 0.95)
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)

    // Mob area tint
    bg.fillStyle(0x1a0a0a, 1)
    bg.fillRect(0, 0, GAME_WIDTH, MOB_AREA_BOTTOM)

    // Status bar
    bg.fillStyle(0x100808, 1)
    bg.fillRect(0, STATUS_TOP, GAME_WIDTH, STATUS_BOTTOM - STATUS_TOP)

    // Dividers
    bg.lineStyle(1, 0x443322, 1)
    bg.lineBetween(0, MOB_AREA_BOTTOM, GAME_WIDTH, MOB_AREA_BOTTOM)
    bg.lineStyle(1, 0x443322, 1)
    bg.lineBetween(0, STATUS_BOTTOM, GAME_WIDTH, STATUS_BOTTOM)

    // Header
    const { biome, difficulty, encounterIndex, totalEncounters } = this.battleData
    const diffColors: Record<string, string> = { easy: '#44cc44', medium: '#ffcc00', hard: '#ff5544' }
    this.add.text(GAME_WIDTH / 2, 8, '⚔  BATTLE  ⚔', {
      fontSize: '15px', fontFamily: 'Georgia, serif', color: '#ff5544', fontStyle: 'bold',
    }).setOrigin(0.5, 0).setDepth(1)
    this.add.text(GAME_WIDTH / 2, 26, `${biome}  ·  Encounter ${encounterIndex + 1} of ${totalEncounters}`, {
      fontSize: '11px', fontFamily: 'Arial', color: '#888888',
    }).setOrigin(0.5, 0).setDepth(1)
    this.add.text(GAME_WIDTH - 12, 17, difficulty.toUpperCase(), {
      fontSize: '11px', fontFamily: 'Arial', color: diffColors[difficulty],
      backgroundColor: '#00000088', padding: { x: 5, y: 2 },
    }).setOrigin(1, 0.5).setDepth(1)

    // Question section header
    this.add.text(12, STATUS_BOTTOM + 6, 'Answer the question to strike:', {
      fontSize: '11px', fontFamily: 'Arial', color: '#666666',
    }).setOrigin(0, 0).setDepth(1)
  }

  // ── Mob display ─────────────────────────────────────────────────────────

  private drawMobs() {
    this.mobGfxLayer.forEach(o => (o as Phaser.GameObjects.GameObject).destroy())
    this.mobGfxLayer = []

    const color = MOB_COLOR[this.battleData.biome] ?? 0x888888

    this.mobs.forEach((mob, i) => {
      const { displayX: mx, displayY: my, alive, hp, maxHp } = mob
      const isTarget = alive && i === this.targetIdx

      const g = this.add.graphics().setDepth(5)
      this.mobGfxLayer.push(g)

      const alpha = alive ? 1 : 0.25
      const c = alive ? color : 0x555555

      // Target glow
      if (isTarget) {
        g.fillStyle(0xff4444, 0.18)
        g.fillCircle(mx, my - 4, 38)
        g.lineStyle(2, 0xff4444, 0.7)
        g.strokeCircle(mx, my - 4, 38)
      }

      // Body
      g.fillStyle(c, alpha)
      g.fillEllipse(mx, my + 8, 38, 28)
      // Head
      g.fillCircle(mx, my - 10, 16)

      if (alive) {
        // Eyes
        g.fillStyle(0xffffff, 1)
        g.fillCircle(mx - 5, my - 12, 4)
        g.fillCircle(mx + 5, my - 12, 4)
        g.fillStyle(0x111111, 1)
        g.fillCircle(mx - 5, my - 12, 2)
        g.fillCircle(mx + 5, my - 12, 2)
        // Menace marks (biome style)
        g.lineStyle(1, Phaser.Display.Color.IntegerToColor(c).darken(30).color, 0.7)
        g.lineBetween(mx - 10, my - 5, mx + 10, my - 5)
      } else {
        // Dead: X eyes
        g.lineStyle(2, 0x888888, 0.7)
        g.lineBetween(mx - 7, my - 15, mx - 2, my - 10)
        g.lineBetween(mx - 2, my - 15, mx - 7, my - 10)
        g.lineBetween(mx + 2, my - 15, mx + 7, my - 10)
        g.lineBetween(mx + 7, my - 15, mx + 2, my - 10)
      }

      // HP bar (only alive mobs)
      if (alive) {
        const barW = 52
        const barY = my + 24
        g.fillStyle(0x333333, 1)
        g.fillRect(mx - barW / 2, barY, barW, 5)
        const pct = Math.max(0, hp / maxHp)
        const hpColor = pct > 0.5 ? 0x44cc44 : pct > 0.25 ? 0xffcc00 : 0xff4444
        g.fillStyle(hpColor, 1)
        g.fillRect(mx - barW / 2, barY, Math.round(barW * pct), 5)
      }

      // Name + level label
      const label = this.add.text(mx, my - 30, `${mob.name}\nLv.${mob.level}`, {
        fontSize: '9px', fontFamily: 'Arial', color: alive ? '#cccccc' : '#555555',
        align: 'center',
      }).setOrigin(0.5, 1).setDepth(6)
      this.mobGfxLayer.push(label)
    })

    // Mob count summary
    const alive = this.mobs.filter(m => m.alive).length
    const summary = this.add.text(GAME_WIDTH - 10, MOB_AREA_BOTTOM - 6,
      `${alive} remaining`, {
        fontSize: '10px', fontFamily: 'Arial', color: '#666666',
      }).setOrigin(1, 1).setDepth(6)
    this.mobGfxLayer.push(summary)
  }

  // ── Status bar ────────────────────────────────────────────────────────────

  private drawStatusBar() {
    this.playerHpGfx = this.add.graphics().setDepth(5)
    this.playerHpText = this.add.text(12, STATUS_TOP + 14, '', {
      fontSize: '11px', fontFamily: 'Arial', color: '#ffffff',
    }).setOrigin(0, 0.5).setDepth(6)
    this.refreshStatusBar()
  }

  private refreshStatusBar() {
    this.playerHpGfx.clear()
    const pct = Math.max(0, this.playerHp / this.playerMaxHp)
    const barW = GAME_WIDTH - 24
    const barY = STATUS_TOP + 8
    this.playerHpGfx.fillStyle(0x333333, 1)
    this.playerHpGfx.fillRect(12, barY, barW, 18)
    const hpColor = pct > 0.5 ? 0x44cc44 : pct > 0.25 ? 0xffcc00 : 0xff4444
    this.playerHpGfx.fillStyle(hpColor, 1)
    this.playerHpGfx.fillRect(12, barY, Math.round(barW * pct), 18)
    this.playerHpText.setText(`❤  ${this.playerHp} / ${this.playerMaxHp}  HP`)
  }

  // ── Question area ─────────────────────────────────────────────────────────

  private drawQuestionArea() {
    this.questionText = this.add.text(GAME_WIDTH / 2, Q_CENTER_Y, '', {
      fontSize: '19px', fontFamily: 'Georgia, serif', color: '#ffffff',
      align: 'center', wordWrap: { width: GAME_WIDTH - 80 },
    }).setOrigin(0.5, 0.5).setDepth(5)

    this.feedbackText = this.add.text(GAME_WIDTH / 2, FEEDBACK_Y, '', {
      fontSize: '16px', fontFamily: 'Georgia, serif', color: '#44ff88', fontStyle: 'bold',
    }).setOrigin(0.5, 0.5).setDepth(6)

    // Answer buttons
    this.btnContainers.forEach(b => b.destroy())
    this.btnContainers = []

    const positions = [
      { x: BTN_LEFT_X,  y: BTN_ROW1_Y },
      { x: BTN_RIGHT_X, y: BTN_ROW1_Y },
      { x: BTN_LEFT_X,  y: BTN_ROW2_Y },
      { x: BTN_RIGHT_X, y: BTN_ROW2_Y },
    ]

    positions.forEach(({ x, y }, i) => {
      const c = this.makeAnswerButton(x, y, i)
      this.btnContainers.push(c)
    })
  }

  private makeAnswerButton(x: number, y: number, idx: number): Phaser.GameObjects.Container {
    const btn = this.add.container(x, y).setDepth(5)

    const bg = this.add.graphics()
    const draw = (fill: number) => {
      bg.clear()
      bg.fillStyle(fill, 1)
      bg.fillRoundedRect(-BTN_W / 2, -BTN_H / 2, BTN_W, BTN_H, 10)
      bg.lineStyle(2, 0x4444aa, 0.6)
      bg.strokeRoundedRect(-BTN_W / 2, -BTN_H / 2, BTN_W, BTN_H, 10)
    }
    draw(0x181430)

    const letterLabel = this.add.text(-BTN_W / 2 + 12, -BTN_H / 2 + 6,
      `[${idx + 1}]`, { fontSize: '11px', fontFamily: 'Arial', color: '#555555' }
    ).setOrigin(0, 0)

    const answerLabel = this.add.text(0, 0, '', {
      fontSize: '16px', fontFamily: 'Georgia, serif', color: '#ffffff',
      wordWrap: { width: BTN_W - 40 }, align: 'center',
    }).setOrigin(0.5, 0.5).setName('label')

    const hit = this.add.rectangle(0, 0, BTN_W, BTN_H, 0, 0)
      .setInteractive({ useHandCursor: true })
    hit.on('pointerover',  () => { if (!this.locked) draw(0x282450) })
    hit.on('pointerout',   () => { if (!this.locked) draw(0x181430) })
    hit.on('pointerdown',  () => { if (!this.locked) this.handleAnswer(idx) })

    btn.add([bg, letterLabel, answerLabel, hit])
    return btn
  }

  // ── Question cycling ──────────────────────────────────────────────────────

  private nextQuestion() {
    this.locked = false
    this.feedbackText.setText('')

    // Pick a fresh question from the pool (reshuffle when exhausted)
    let q = this.questionPool.find(q => !this.usedIds.has(q.id))
    if (!q) {
      this.usedIds.clear()
      this.questionPool = Phaser.Utils.Array.Shuffle([...this.questionPool]) as Question[]
      q = this.questionPool[0]
    }
    this.currentQ = q
    this.usedIds.add(q.id)

    // Populate question text
    this.questionText.setText(q.question)

    // Populate answer buttons
    q.answers.forEach((ans, i) => {
      const lbl = this.btnContainers[i].getByName('label') as Phaser.GameObjects.Text
      lbl.setText(`${LETTERS[i]}.  ${ans}`)
    })
  }

  // ── Answer handling ───────────────────────────────────────────────────────

  private handleAnswer(idx: number) {
    if (this.locked) return
    this.locked = true

    const correct = idx === this.currentQ.correctIndex

    if (correct) {
      // Damage current target
      const target = this.mobs[this.targetIdx]
      target.hp = Math.max(0, target.hp - CORRECT_DAMAGE)

      if (target.hp <= 0) {
        target.alive = false
        this.xpGained += XP_PER_MOB[this.battleData.difficulty]

        // Advance to next alive mob
        const next = this.mobs.findIndex((m, i) => i > this.targetIdx && m.alive)
        if (next !== -1) {
          this.targetIdx = next
        } else {
          const any = this.mobs.findIndex(m => m.alive)
          if (any === -1) {
            // All dead — victory!
            this.drawMobs()
            this.feedbackText.setColor('#ffd700').setText('✓  All enemies defeated!')
            this.time.delayedCall(1200, () => this.endBattle(true))
            return
          }
          this.targetIdx = any
        }
        this.feedbackText.setColor('#44ff88')
          .setText(`✓  Correct!  Enemy defeated!  +${XP_PER_MOB[this.battleData.difficulty]} XP`)
      } else {
        this.feedbackText.setColor('#44ff88')
          .setText(`✓  Correct!  -${CORRECT_DAMAGE} HP to enemy!`)
      }
    } else {
      // Mobs attack player
      const dmg = MOB_DAMAGE[this.battleData.difficulty]
      this.playerHp = Math.max(0, this.playerHp - dmg)
      this.refreshStatusBar()

      if (this.playerHp <= 0) {
        this.feedbackText.setColor('#ff5544').setText('✗  Wrong!  You were defeated...')
        this.time.delayedCall(1400, () => this.endBattle(false))
        return
      }
      this.feedbackText.setColor('#ff6644')
        .setText(`✗  Wrong!  Enemies attack for ${dmg} damage!`)
    }

    // Refresh mob display and continue
    this.drawMobs()
    this.time.delayedCall(1100, () => this.nextQuestion())
  }

  // ── End battle ────────────────────────────────────────────────────────────

  private endBattle(victory: boolean) {
    // Award XP on server if victory
    if (victory && this.xpGained > 0) {
      const socket = (window as typeof window & { __lumenSocket?: Socket }).__lumenSocket
      socket?.emit('player:award_xp', { xp: Math.min(this.xpGained, 500), awardShard: false })
    }

    const result: BattleResult = {
      victory,
      playerHp: this.playerHp,
      xpGained: this.xpGained,
    }

    const biomeScene = this.scene.get('BiomeScene') as BiomeScene
    biomeScene.onBattleResult(result)
    this.scene.stop()
    this.scene.resume('BiomeScene')
  }

  // ── Update ────────────────────────────────────────────────────────────────

  update() {
    if (!this.locked) {
      this.numKeys.forEach((key, i) => {
        if (Phaser.Input.Keyboard.JustDown(key)) this.handleAnswer(i)
      })
    }
  }
}
