import Phaser from 'phaser'
import type { Socket } from 'socket.io-client'
import { GAME_WIDTH, GAME_HEIGHT, PLAYER_SPEED } from '../constants'
import type { Subject, Difficulty } from '../../engine/types'
import {
  TOPICS_BY_SUBJECT_GRADE,
  MASTERED_GRADE,
  type GradeTopic,
} from '../data/curriculum'

type ClassroomState = 'exploring' | 'teacher_dialog' | 'topic_select' | 'seated' | 'questioning' | 'results'

// ---------------------------------------------------------------------------
// Server-session types — mirror the server's client-safe payloads.
// SECURITY: questions arrive WITHOUT correctIndex; answers are validated by
// the server, and every reward fact (pass, passes, grade-up, shards) is
// computed server-side and delivered in `learning:complete`.
// ---------------------------------------------------------------------------

interface ServerQuestion {
  id: string
  subject: Subject
  grade: number
  topic: string
  question: string
  answers: [string, string, string, string]
  difficulty: Difficulty
  timeLimit: number
}

interface AnswerResult {
  correct: boolean
  attemptsLeft: number
  explanation: string
  xpEarned: number
  sessionComplete: boolean
  perfectScore: boolean
  nextQuestion?: ServerQuestion
}

interface CompleteResult {
  topicId: string
  score: number
  passed: boolean
  topicPasses: number
  gradeCompleted: boolean
  newGrade: number
  skillShardsAwarded: number
  combatShardAwarded: number
}

interface UnlocksPayload {
  subjectGrades: Record<Subject, number>
  topicPasses: Record<string, number>
}

/** XP per correct answer by difficulty — display only; the server computes the real award. */
const XP_BY_DIFFICULTY: Record<Difficulty, number> = { easy: 10, medium: 20, hard: 35 }

const QUESTIONS_PER_SESSION = 5
const PASSES_TO_COMPLETE = 3

const SUBJECT_CONFIG = [
  { key: 'math'     as Subject, label: 'Mathematics',   icon: '➕', color: 0x1a3a8a, hover: 0x2a4aaa },
  { key: 'science'  as Subject, label: 'Science',       icon: '🔬', color: 0x0a5a2a, hover: 0x1a7a3a },
  { key: 'history'  as Subject, label: 'History',       icon: '📜', color: 0x7a3a00, hover: 0x9a5a10 },
  { key: 'language' as Subject, label: 'Language Arts', icon: '📖', color: 0x6a1060, hover: 0x8a2080 },
]

// 12 desks: 3 rows × 4 columns — 8 occupied, 4 empty
const DESK_DEFS = [
  { x: 230, y: 398, occupied: true,  color: 0x3355cc },
  { x: 460, y: 398, occupied: true,  color: 0x338844 },
  { x: 730, y: 398, occupied: false, color: 0 },
  { x: 960, y: 398, occupied: true,  color: 0xcc4422 },
  { x: 230, y: 490, occupied: true,  color: 0x8822aa },
  { x: 460, y: 490, occupied: false, color: 0 },
  { x: 730, y: 490, occupied: true,  color: 0x228899 },
  { x: 960, y: 490, occupied: true,  color: 0xaa7722 },
  { x: 230, y: 572, occupied: false, color: 0 },
  { x: 460, y: 572, occupied: true,  color: 0x334488 },
  { x: 730, y: 572, occupied: true,  color: 0x559922 },
  { x: 960, y: 572, occupied: false, color: 0 },
]

const EMPTY_DESKS = DESK_DEFS.filter(d => !d.occupied)

/** Render a passes indicator like ●●○ for 2 of 3. */
function passesDots(passes: number): string {
  const filled = Math.max(0, Math.min(PASSES_TO_COMPLETE, passes))
  return '●'.repeat(filled) + '○'.repeat(PASSES_TO_COMPLETE - filled)
}

export class ClassroomScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite
  private seatedGfx!: Phaser.GameObjects.Graphics
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd!: { W: Phaser.Input.Keyboard.Key; A: Phaser.Input.Keyboard.Key; S: Phaser.Input.Keyboard.Key; D: Phaser.Input.Keyboard.Key }
  private eKey!: Phaser.Input.Keyboard.Key
  private escKey!: Phaser.Input.Keyboard.Key
  private numKeys!: Phaser.Input.Keyboard.Key[]

  private state: ClassroomState = 'exploring'
  private teacherPrompt!: Phaser.GameObjects.Text
  private overlay!: Phaser.GameObjects.Rectangle

  private topicModal!: Phaser.GameObjects.Container
  private questionPanel!: Phaser.GameObjects.Container
  private resultsPanel!: Phaser.GameObjects.Container

  // Server-authoritative progression snapshot (fetched via shop:unlocks on open).
  private subjectGrades: Record<Subject, number> = { math: 1, science: 1, history: 1, language: 1 }
  private topicPasses: Record<string, number> = {}

  // Topic modal navigation: null = subject-select view; a subject = its topic list.
  private modalSubject: Subject | null = null

  private sessionTopic: GradeTopic | null = null

  // Server-driven session state — populated exclusively from server responses.
  private sessionId: string | null = null
  private currentQuestion: ServerQuestion | null = null
  private questionNumber = 1          // 1-based, for display
  private attemptsLeft = 3
  private correctCount = 0
  private xpEarned = 0
  private questionResults: { text: string; correct: boolean }[] = []
  private completeResult: CompleteResult | null = null
  private sessionWasPerfect = false
  private questionLocked = false
  private socket: Socket | null = null
  private onAnswerResult: ((res: AnswerResult) => void) | null = null
  private onComplete: ((res: CompleteResult) => void) | null = null
  private onUnlocks: ((res: UnlocksPayload) => void) | null = null

  constructor() { super({ key: 'ClassroomScene' }) }

  create() {
    this.state = 'exploring'
    this.questionLocked = false
    this.sessionTopic = null
    this.sessionId = null
    this.currentQuestion = null
    this.completeResult = null

    // Socket is attached to window by GamePage.tsx
    this.socket = (window as typeof window & { __lumenSocket?: Socket }).__lumenSocket ?? null

    // Persistent listener for answer results — routed to the active handler
    this.onAnswerResult = (res: AnswerResult) => this.handleAnswerResult(res)
    this.socket?.on('learning:answer_result', this.onAnswerResult)

    // Quiz completion — carries all reward facts (pass, passes, grade-up, shards)
    this.onComplete = (res: CompleteResult) => this.handleComplete(res)
    this.socket?.on('learning:complete', this.onComplete)

    // Progression snapshot — refreshes the classroom grade badges / passes
    this.onUnlocks = (res: UnlocksPayload) => {
      if (res?.subjectGrades) this.subjectGrades = res.subjectGrades
      if (res?.topicPasses) this.topicPasses = res.topicPasses
      // Rebuild the topic modal if it is currently open
      if (this.state === 'teacher_dialog' || this.state === 'topic_select') {
        this.buildTopicModal()
      }
    }
    this.socket?.on('shop:unlocks', this.onUnlocks)

    // Keep the registry in sync with the server's confirmed XP / level
    const onXpUpdated = (data: { newXp: number; newLevel: number }) => {
      this.registry.set('xp', data.newXp)
      this.registry.set('level', data.newLevel)
    }
    this.socket?.on('player:xp_updated', onXpUpdated)

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.onAnswerResult) this.socket?.off('learning:answer_result', this.onAnswerResult)
      if (this.onComplete) this.socket?.off('learning:complete', this.onComplete)
      if (this.onUnlocks) this.socket?.off('shop:unlocks', this.onUnlocks)
      this.socket?.off('player:xp_updated', onXpUpdated)
      // End any in-flight session so the server can free it
      if (this.sessionId && this.state === 'questioning') {
        this.socket?.emit('learning:end', { sessionId: this.sessionId })
      }
    })

    this.drawRoom()
    this.createDesks()
    this.createTeacher()

    // Overlay (behind all modals)
    this.overlay = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.72)
      .setDepth(90).setVisible(false)

    this.seatedGfx = this.add.graphics().setDepth(8)

    this.createPlayer()
    this.setupInput()

    this.teacherPrompt = this.add.text(GAME_WIDTH / 2, 308, 'Press  E  to speak with Prof. Lumina', {
      fontSize: '16px', fontFamily: 'Arial', color: '#ffffff',
      backgroundColor: '#00000099', padding: { x: 12, y: 6 },
    }).setOrigin(0.5, 0).setDepth(50).setVisible(false)

    this.topicModal = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2).setDepth(100).setVisible(false)
    this.questionPanel = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2).setDepth(100).setVisible(false)
    this.resultsPanel = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2).setDepth(100).setVisible(false)

    // Fetch the player's current grades / passes so the classroom renders progress.
    this.socket?.emit('shop:get_unlocks')
  }

  // ─── ROOM ──────────────────────────────────────────────────────────────────

  private drawRoom() {
    // Warm wood floor
    const floor = this.add.graphics().setDepth(0)
    floor.fillStyle(0xc49050, 1)
    floor.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)
    floor.lineStyle(1, 0xaa7830, 0.45)
    for (let y = 0; y < GAME_HEIGHT; y += 50) floor.lineBetween(0, y, GAME_WIDTH, y)
    for (let x = 0; x < GAME_WIDTH; x += 130) floor.lineBetween(x, 0, x, GAME_HEIGHT)
    floor.fillStyle(0xaa7830, 0.2)
    for (let r = 0; r < 15; r++) for (let c = 0; c < 11; c++)
      if ((r + c) % 3 === 0) floor.fillRect(c * 130, r * 50, 130, 50)

    // Front wall (stone/plaster)
    const wall = this.add.graphics().setDepth(1)
    wall.fillStyle(0xddd0b0, 1)
    wall.fillRect(0, 0, GAME_WIDTH, 286)
    wall.lineStyle(1, 0xbba888, 0.55)
    for (let y = 0; y < 286; y += 42) wall.lineBetween(0, y, GAME_WIDTH, y)
    for (let row = 0; row < 7; row++) {
      const off = (row % 2 === 0) ? 0 : 95
      for (let x = off; x < GAME_WIDTH; x += 190)
        wall.lineBetween(x, row * 42, x, row * 42 + 42)
    }
    // Wall/floor divider strip
    wall.fillStyle(0x887a60, 1)
    wall.fillRect(0, 279, GAME_WIDTH, 7)

    // Side pillars
    const pillars = this.add.graphics().setDepth(2)
    pillars.fillStyle(0xc8b898, 1)
    pillars.fillRect(0, 0, 44, GAME_HEIGHT)
    pillars.fillRect(GAME_WIDTH - 44, 0, 44, GAME_HEIGHT)
    pillars.lineStyle(2, 0xa09070, 1)
    pillars.lineBetween(44, 0, 44, GAME_HEIGHT)
    pillars.lineBetween(GAME_WIDTH - 44, 0, GAME_WIDTH - 44, GAME_HEIGHT)

    // Chalkboard
    const cbX = 190, cbY = 28, cbW = 900, cbH = 172
    const cb = this.add.graphics().setDepth(3)
    cb.fillStyle(0x5a3a1a, 1)
    cb.fillRect(cbX - 14, cbY - 10, cbW + 28, cbH + 22)
    cb.fillStyle(0x1e5c2a, 1)
    cb.fillRect(cbX, cbY, cbW, cbH)
    // Chalk ledge
    cb.fillStyle(0x4a2a08, 1)
    cb.fillRect(cbX - 6, cbY + cbH, cbW + 12, 8)
    // Chalk pieces
    for (let i = 0; i < 6; i++) {
      cb.fillStyle(0xeeeedd, 0.8)
      cb.fillRect(cbX + 18 + i * 32, cbY + cbH + 1, 14, 5)
    }

    // Board text
    this.add.text(cbX + cbW / 2, cbY + 26, 'Welcome to the Learning Center', {
      fontSize: '21px', fontFamily: 'Georgia, serif', color: '#eeeedd',
    }).setOrigin(0.5, 0).setDepth(4).setAlpha(0.85)
    this.add.text(cbX + cbW / 2, cbY + 62, '~ Knowledge is the greatest power ~', {
      fontSize: '15px', fontFamily: 'Georgia, serif', color: '#ccdccc', fontStyle: 'italic',
    }).setOrigin(0.5, 0).setDepth(4).setAlpha(0.7)
    this.add.text(cbX + 80, cbY + 108, 'E = mc²', {
      fontSize: '19px', fontFamily: 'Georgia, serif', color: '#dddcbb',
    }).setOrigin(0, 0).setDepth(4).setAlpha(0.55)
    this.add.text(cbX + 360, cbY + 108, 'Σxᵢ / n  =  x̄', {
      fontSize: '17px', fontFamily: 'Georgia, serif', color: '#dddcbb',
    }).setOrigin(0, 0).setDepth(4).setAlpha(0.55)
    this.add.text(cbX + 660, cbY + 108, '6CO₂ + 6H₂O → C₆H₁₂O₆', {
      fontSize: '14px', fontFamily: 'Georgia, serif', color: '#dddcbb',
    }).setOrigin(0, 0).setDepth(4).setAlpha(0.55)

    // Exit door
    const door = this.add.graphics().setDepth(2)
    door.fillStyle(0x4a2a0a, 1)
    door.fillRect(562, GAME_HEIGHT - 82, 156, 82)
    door.fillStyle(0x7a4e22, 0.5)
    door.fillRect(570, GAME_HEIGHT - 76, 66, 34)
    door.fillRect(644, GAME_HEIGHT - 76, 66, 34)
    door.fillRect(570, GAME_HEIGHT - 38, 66, 30)
    door.fillRect(644, GAME_HEIGHT - 38, 66, 30)
    door.lineStyle(3, 0x2a1006, 1)
    door.strokeRect(562, GAME_HEIGHT - 82, 156, 82)
    door.fillStyle(0xffd700, 1)
    door.fillCircle(638, GAME_HEIGHT - 44, 4)

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 12, '[ ESC ]  Return to World', {
      fontSize: '13px', fontFamily: 'Arial', color: '#ccaa66',
      backgroundColor: '#00000088', padding: { x: 8, y: 4 },
    }).setOrigin(0.5, 1).setDepth(10)
  }

  // ─── DESKS & STUDENTS ──────────────────────────────────────────────────────

  private createDesks() {
    for (const d of DESK_DEFS) {
      const g = this.add.graphics().setDepth(4)
      // Shadow
      g.fillStyle(0x000000, 0.14)
      g.fillEllipse(d.x + 4, d.y + 34, 92, 14)
      // Legs
      g.fillStyle(0x7a5230, 1)
      for (const [lx, ly] of [[-36, 10], [30, 10], [-36, 22], [30, 22]] as [number, number][])
        g.fillRect(d.x + lx, d.y + ly, 6, 20)
      // Surface
      g.fillStyle(0xc4904a, 1)
      g.fillRect(d.x - 44, d.y - 4, 88, 26)
      g.lineStyle(1, 0xa07030, 1)
      g.strokeRect(d.x - 44, d.y - 4, 88, 26)
      g.lineStyle(1, 0xb07838, 0.35)
      g.lineBetween(d.x - 28, d.y - 4, d.x - 28, d.y + 22)
      g.lineBetween(d.x + 16, d.y - 4, d.x + 16, d.y + 22)

      // Paper on desk
      const paper = this.add.graphics().setDepth(5)
      paper.fillStyle(0xf5f0e0, 1)
      paper.fillRect(d.x - 20, d.y - 2, 26, 18)
      paper.lineStyle(1, 0xaaaaaa, 0.4)
      for (let l = 0; l < 3; l++) paper.lineBetween(d.x - 16, d.y + 3 + l * 4, d.x + 2, d.y + 3 + l * 4)

      // Seated student
      if (d.occupied) {
        const s = this.add.graphics().setDepth(6)
        s.fillStyle(d.color, 1)
        s.fillRect(d.x - 12, d.y - 22, 24, 20)
        s.fillStyle(0xffe0b2, 1)
        s.fillCircle(d.x, d.y - 28, 10)
        s.fillStyle(0x222222, 1)
        s.fillCircle(d.x - 4, d.y - 29, 2)
        s.fillCircle(d.x + 4, d.y - 29, 2)
        // Hair
        const dark = (d.color & 0xff) + ((d.color >> 8) & 0xff) + ((d.color >> 16) & 0xff) < 384
        s.fillStyle(dark ? 0xddbb88 : 0x221100, 1)
        s.fillEllipse(d.x, d.y - 37, 22, 12)
      }
    }
  }

  // ─── TEACHER ───────────────────────────────────────────────────────────────

  private createTeacher() {
    const tx = 640, ty = 248
    const g = this.add.graphics().setDepth(7)

    // Shadow
    g.fillStyle(0x000000, 0.18)
    g.fillEllipse(tx + 3, ty + 38, 46, 10)
    // Robe
    g.fillStyle(0x6a1818, 1)
    g.fillRect(tx - 14, ty - 10, 28, 40)
    g.fillTriangle(tx - 14, ty + 30, tx - 22, ty + 48, tx, ty + 30)
    g.fillTriangle(tx + 14, ty + 30, tx + 22, ty + 48, tx, ty + 30)
    g.fillStyle(0x8a3030, 0.5)
    g.fillRect(tx - 4, ty - 10, 6, 38)
    // Collar
    g.fillStyle(0x221808, 1)
    g.fillRect(tx - 16, ty - 12, 32, 12)
    // Head
    g.fillStyle(0xffe0b2, 1)
    g.fillCircle(tx, ty - 22, 13)
    // Glasses
    g.lineStyle(1, 0x555555, 1)
    g.strokeCircle(tx - 5, ty - 24, 4)
    g.strokeCircle(tx + 5, ty - 24, 4)
    g.lineBetween(tx - 1, ty - 24, tx + 1, ty - 24)
    g.fillStyle(0x222222, 1)
    g.fillCircle(tx - 5, ty - 24, 2)
    g.fillCircle(tx + 5, ty - 24, 2)
    // White hair
    g.fillStyle(0xe8e8e8, 1)
    g.fillEllipse(tx, ty - 34, 28, 14)
    g.fillStyle(0xdddddd, 0.7)
    g.fillEllipse(tx - 6, ty - 33, 14, 8)
    // Graduation cap
    g.fillStyle(0x111111, 1)
    g.fillRect(tx - 16, ty - 42, 32, 6)
    g.fillRect(tx - 10, ty - 48, 20, 6)
    g.lineStyle(2, 0xffd700, 1)
    g.lineBetween(tx + 10, ty - 45, tx + 18, ty - 34)
    g.fillStyle(0xffd700, 1)
    g.fillRect(tx + 16, ty - 35, 6, 6)
    // Book in hand
    g.fillStyle(0x2244aa, 1)
    g.fillRect(tx + 14, ty - 8, 16, 22)
    g.fillStyle(0xf5f0e0, 0.9)
    g.fillRect(tx + 16, ty - 6, 12, 18)
    g.lineStyle(1, 0xaaaaaa, 0.5)
    for (let l = 0; l < 3; l++) g.lineBetween(tx + 18, ty - 2 + l * 5, tx + 26, ty - 2 + l * 5)

    // Teacher desk
    const td = this.add.graphics().setDepth(5)
    td.fillStyle(0x000000, 0.18)
    td.fillEllipse(tx + 4, ty + 82, 210, 16)
    td.fillStyle(0x9a6830, 1)
    td.fillRect(tx - 104, ty + 52, 208, 30)
    td.lineStyle(2, 0x7a4818, 1)
    td.strokeRect(tx - 104, ty + 52, 208, 30)
    td.fillStyle(0x8a5820, 1)
    td.fillRect(tx - 104, ty + 66, 208, 16)
    // Items on desk
    td.fillStyle(0x2244aa, 1)
    td.fillRect(tx - 82, ty + 40, 30, 18)
    td.fillStyle(0xf5f0e0, 1)
    td.fillRect(tx + 42, ty + 44, 26, 12)
    td.fillStyle(0xffd700, 0.9)
    td.fillRect(tx - 8, ty + 44, 8, 14)

    // Name label
    const nb = this.add.graphics().setDepth(8)
    nb.fillStyle(0x1a0a2e, 0.88)
    nb.fillRoundedRect(tx - 62, ty - 76, 124, 28, 6)
    nb.lineStyle(1, 0xffd700, 0.85)
    nb.strokeRoundedRect(tx - 62, ty - 76, 124, 28, 6)
    this.add.text(tx, ty - 61, 'Prof. Lumina', {
      fontSize: '14px', fontFamily: 'Georgia, serif', color: '#ffd700', fontStyle: 'bold',
    }).setOrigin(0.5, 0.5).setDepth(9)
  }

  // ─── PLAYER ────────────────────────────────────────────────────────────────

  private createPlayer() {
    this.player = this.physics.add.sprite(640, 650, 'character_idle')
    this.player.setScale(1.5).setDepth(10).setCollideWorldBounds(true)
    const body = this.player.body as Phaser.Physics.Arcade.Body
    body.setSize(24, 20)
    body.setOffset(8, 28)
    this.physics.world.setBounds(44, 286, GAME_WIDTH - 88, GAME_HEIGHT - 290)

    if (this.anims.exists('idle_down')) this.player.play('idle_down')
  }

  private setupInput() {
    this.cursors = this.input.keyboard!.createCursorKeys()
    this.wasd = {
      W: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      S: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      D: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    }
    this.eKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E)
    this.escKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC)
    this.numKeys = [
      this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ONE),
      this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.TWO),
      this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.THREE),
      this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.FOUR),
    ]
  }

  // ─── BUTTON HELPER ─────────────────────────────────────────────────────────

  private makeButton(label: string, sub: string, w: number, h: number, fill: number, hover: number, cb: () => void) {
    const btn = this.add.container(0, 0)
    const bg = this.add.graphics()
    const draw = (c: number) => {
      bg.clear()
      bg.fillStyle(c, 1)
      bg.fillRoundedRect(-w / 2, -h / 2, w, h, 10)
      bg.lineStyle(2, 0xffd700, 0.65)
      bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 10)
    }
    draw(fill)
    btn.add(bg)
    btn.add(this.add.text(0, sub ? -9 : 0, label, {
      fontSize: '18px', fontFamily: 'Georgia, serif', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5, 0.5))
    if (sub) btn.add(this.add.text(0, 12, sub, {
      fontSize: '12px', fontFamily: 'Arial', color: '#cccccc',
    }).setOrigin(0.5, 0.5))
    const hit = this.add.rectangle(0, 0, w, h, 0, 0).setInteractive({ useHandCursor: true })
    hit.on('pointerover', () => draw(hover))
    hit.on('pointerout', () => draw(fill))
    hit.on('pointerdown', () => { draw(0xffd700); this.time.delayedCall(100, () => { draw(fill); cb() }) })
    btn.add(hit)
    return btn
  }

  // ─── TOPIC MODAL ───────────────────────────────────────────────────────────
  //
  // Two-level navigation, all from server data only:
  //   1. modalSubject === null → pick one of the 4 subjects (with grade badge)
  //   2. modalSubject set       → that subject's CURRENT grade topics (●●○)

  /** Open the modal at the top level (subject select). */
  private openTopicModal() {
    this.modalSubject = null
    this.buildTopicModal()
    this.topicModal.setVisible(true)
  }

  private buildTopicModal() {
    if (this.modalSubject === null) this.buildSubjectSelect()
    else this.buildTopicList(this.modalSubject)
  }

  /** Level 1: choose a subject. */
  private buildSubjectSelect() {
    this.topicModal.removeAll(true)

    const W = 820, H = 500
    const bg = this.add.graphics()
    bg.fillStyle(0x0c0c24, 0.98)
    bg.fillRoundedRect(-W / 2, -H / 2, W, H, 16)
    bg.lineStyle(2, 0xffd700, 1)
    bg.strokeRoundedRect(-W / 2, -H / 2, W, H, 16)
    this.topicModal.add(bg)

    this.topicModal.add(this.add.text(0, -H / 2 + 32, 'What would you like to study today?', {
      fontSize: '22px', fontFamily: 'Georgia, serif', color: '#ffd700', fontStyle: 'bold',
    }).setOrigin(0.5, 0.5))
    this.topicModal.add(this.add.text(0, -H / 2 + 60, 'Choose a subject to see this grade\'s topics', {
      fontSize: '13px', fontFamily: 'Arial', color: '#aaaaaa',
    }).setOrigin(0.5, 0.5))

    const div = this.add.graphics()
    div.lineStyle(1, 0xffd700, 0.35)
    div.lineBetween(-W / 2 + 40, -H / 2 + 80, W / 2 - 40, -H / 2 + 80)
    this.topicModal.add(div)

    // 2 × 2 grid of big subject buttons
    const bw = 360, bh = 96
    const grid = [
      { x: -190, y: -64 }, { x: 190, y: -64 },
      { x: -190, y: 56 },  { x: 190, y: 56 },
    ]
    SUBJECT_CONFIG.forEach((s, i) => {
      const grade = this.subjectGrades[s.key] ?? 1
      const mastered = grade >= MASTERED_GRADE
      const btn = this.makeButton(
        `${s.icon}  ${s.label}`,
        mastered ? 'Mastered ✓' : `Grade ${grade}`,
        bw, bh, s.color, s.hover,
        () => { this.modalSubject = s.key; this.buildTopicModal() },
      )
      btn.setPosition(grid[i].x, grid[i].y)
      this.topicModal.add(btn)
    })

    const exit = this.makeButton('← Return to World', '', 210, 40, 0x2a2a44, 0x3a3a60, () => this.returnToWorld())
    exit.setPosition(0, H / 2 - 32)
    this.topicModal.add(exit)
  }

  /** Level 2: the chosen subject's current-grade topics. */
  private buildTopicList(subject: Subject) {
    this.topicModal.removeAll(true)

    const s = SUBJECT_CONFIG.find(c => c.key === subject)!
    const grade = this.subjectGrades[subject] ?? 1
    const mastered = grade >= MASTERED_GRADE

    const W = 720, H = 460
    const bg = this.add.graphics()
    bg.fillStyle(0x0c0c24, 0.98)
    bg.fillRoundedRect(-W / 2, -H / 2, W, H, 16)
    bg.lineStyle(2, 0xffd700, 1)
    bg.strokeRoundedRect(-W / 2, -H / 2, W, H, 16)
    this.topicModal.add(bg)

    this.topicModal.add(this.add.text(0, -H / 2 + 32, `${s.icon}  ${s.label}`, {
      fontSize: '22px', fontFamily: 'Georgia, serif', color: '#ffd700', fontStyle: 'bold',
    }).setOrigin(0.5, 0.5))
    this.topicModal.add(this.add.text(0, -H / 2 + 60,
      mastered ? 'Mastered ✓' : `Grade ${grade}  ·  each topic is a 5-question quiz, pass at 4/5`, {
      fontSize: '13px', fontFamily: 'Arial', color: mastered ? '#ffd700' : '#aaaaaa',
    }).setOrigin(0.5, 0.5))

    // Back button (top-left) → subject select
    const back = this.makeButton('← Subjects', '', 130, 34, 0x2a2a44, 0x3a3a60,
      () => { this.modalSubject = null; this.buildTopicModal() })
    back.setPosition(-W / 2 + 80, -H / 2 + 30)
    this.topicModal.add(back)

    const div = this.add.graphics()
    div.lineStyle(1, 0xffd700, 0.35)
    div.lineBetween(-W / 2 + 40, -H / 2 + 84, W / 2 - 40, -H / 2 + 84)
    this.topicModal.add(div)

    if (mastered) {
      this.topicModal.add(this.add.text(0, -10, '🏆  All 12 grades complete!\nYou have mastered this subject.', {
        fontSize: '17px', fontFamily: 'Georgia, serif', color: '#ffd700', align: 'center', lineSpacing: 8,
      }).setOrigin(0.5, 0.5))
    } else {
      const topics = TOPICS_BY_SUBJECT_GRADE[subject]?.[grade] ?? []
      topics.forEach((t, ti) => {
        const passes = this.topicPasses[t.id] ?? 0
        const done = passes >= PASSES_TO_COMPLETE
        const btn = this.makeButton(
          `${t.icon}  ${t.name}`,
          `${passesDots(passes)}  ${done ? 'Complete!' : `${passes}/${PASSES_TO_COMPLETE} passes`}`,
          W - 120, 80,
          done ? 0x1a5a2a : s.color,
          done ? 0x2a7a3a : s.hover,
          () => this.onTopicChosen(t),
        )
        btn.setPosition(0, -30 + ti * 104)
        this.topicModal.add(btn)
      })
    }

    const exit = this.makeButton('← Return to World', '', 210, 40, 0x2a2a44, 0x3a3a60, () => this.returnToWorld())
    exit.setPosition(0, H / 2 - 32)
    this.topicModal.add(exit)
  }

  private onTopicChosen(topic: GradeTopic) {
    this.sessionTopic = topic
    this.topicModal.setVisible(false)

    // Seat player at a random empty desk
    const desk = EMPTY_DESKS[Phaser.Math.Between(0, EMPTY_DESKS.length - 1)]
    this.player.setVisible(false)
    this.seatedGfx.clear()
    this.seatedGfx.fillStyle(0x4b0082, 1)
    this.seatedGfx.fillRect(desk.x - 11, desk.y - 32, 22, 18)
    this.seatedGfx.fillStyle(0xffe0b2, 1)
    this.seatedGfx.fillCircle(desk.x, desk.y - 42, 10)
    this.seatedGfx.fillStyle(0x222222, 1)
    this.seatedGfx.fillCircle(desk.x - 3, desk.y - 43, 2)
    this.seatedGfx.fillCircle(desk.x + 3, desk.y - 43, 2)
    this.seatedGfx.fillStyle(0x1a0050, 1)
    this.seatedGfx.fillEllipse(desk.x, desk.y - 51, 20, 6)
    this.seatedGfx.fillTriangle(desk.x, desk.y - 64, desk.x - 8, desk.y - 51, desk.x + 8, desk.y - 51)
    this.seatedGfx.fillStyle(0xffd700, 1)
    this.seatedGfx.fillRect(desk.x - 11, desk.y - 28, 22, 3)

    this.state = 'seated'
    this.time.delayedCall(280, () => this.startQuiz(topic))
  }

  // ─── QUIZ START ──────────────────────────────────────────────────────────

  private startQuiz(topic: GradeTopic) {
    // SECURITY: questions, answers, and rewards all come from the server.
    if (!this.socket?.connected) {
      this.showOfflineNotice()
      return
    }

    // Reset session accumulators (populated by server responses only)
    this.sessionId = null
    this.currentQuestion = null
    this.questionNumber = 1
    this.attemptsLeft = 3
    this.correctCount = 0
    this.xpEarned = 0
    this.questionResults = []
    this.completeResult = null
    this.sessionWasPerfect = false
    this.questionLocked = false

    const onStarted = (data: { sessionId: string; firstQuestion: ServerQuestion }) => {
      this.socket?.off('error', onError)
      if (!this.scene.isActive()) return
      this.sessionId = data.sessionId
      this.currentQuestion = data.firstQuestion
      this.state = 'questioning'
      this.buildQuestion()
    }
    const onError = (err: { message?: string }) => {
      this.socket?.off('learning:session_started', onStarted)
      if (!this.scene.isActive()) return
      this.showOfflineNotice(err?.message ?? 'Could not start the quiz. Please try again.')
    }
    this.socket.once('learning:session_started', onStarted)
    this.socket.once('error', onError)

    this.socket.emit('learning:start', { topicId: topic.id })
  }

  private showOfflineNotice(message = 'You are not connected to the server. Quizzes (and rewards) need a live connection — please try again in a moment.') {
    const W = 560, H = 260
    const panel = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2).setDepth(120)
    const bg = this.add.graphics()
    bg.fillStyle(0x0c0c24, 0.98)
    bg.fillRoundedRect(-W / 2, -H / 2, W, H, 16)
    bg.lineStyle(2, 0xaa4433, 1)
    bg.strokeRoundedRect(-W / 2, -H / 2, W, H, 16)
    panel.add(bg)
    panel.add(this.add.text(0, -H / 2 + 40, '⚠  Cannot Start Quiz', {
      fontSize: '22px', fontFamily: 'Georgia, serif', color: '#ff9977', fontStyle: 'bold',
    }).setOrigin(0.5, 0.5))
    panel.add(this.add.text(0, -16, message, {
      fontSize: '15px', fontFamily: 'Arial', color: '#cccccc',
      align: 'center', wordWrap: { width: W - 70 },
    }).setOrigin(0.5, 0.5))
    const back = this.makeButton('← Return to World', '', 230, 44, 0x2a2a44, 0x3a3a60, () => this.returnToWorld())
    back.setPosition(0, H / 2 - 42)
    panel.add(back)
    this.state = 'results' // block movement / re-entry while notice is up
  }

  // ─── QUESTION PANEL ────────────────────────────────────────────────────────

  private buildQuestion() {
    this.questionPanel.removeAll(true)
    this.questionPanel.setVisible(true)
    this.questionLocked = false

    const q = this.currentQuestion
    if (!q) return
    const W = 920, H = 510

    // Panel bg
    const bg = this.add.graphics()
    bg.fillStyle(0x0c0c24, 0.98)
    bg.fillRoundedRect(-W / 2, -H / 2, W, H, 16)
    bg.lineStyle(2, 0x5533aa, 1)
    bg.strokeRoundedRect(-W / 2, -H / 2, W, H, 16)
    // Header bar
    bg.fillStyle(0x18083a, 1)
    bg.fillRoundedRect(-W / 2, -H / 2, W, 58, { tl: 16, tr: 16, bl: 0, br: 0 })
    this.questionPanel.add(bg)

    // Header labels
    const subj = SUBJECT_CONFIG.find(s => s.key === this.sessionTopic?.subject)
    const topic = this.sessionTopic
    this.questionPanel.add(this.add.text(-W / 2 + 20, -H / 2 + 14, `${subj?.icon ?? ''}  ${subj?.label ?? ''}  ·  ${topic?.icon ?? ''} ${topic?.name ?? ''}  ·  Grade ${topic?.grade ?? ''}`, {
      fontSize: '15px', fontFamily: 'Arial', color: '#bbaaff',
    }).setOrigin(0, 0.5))
    this.questionPanel.add(this.add.text(W / 2 - 20, -H / 2 + 14, `Question  ${this.questionNumber}  of  ${QUESTIONS_PER_SESSION}`, {
      fontSize: '15px', fontFamily: 'Arial', color: '#ffd700', fontStyle: 'bold',
    }).setOrigin(1, 0.5))

    // Attempt hearts
    const hy = -H / 2 + 86
    for (let i = 0; i < 3; i++) {
      this.questionPanel.add(this.add.text(-60 + i * 30, hy, '❤', {
        fontSize: '20px', color: i < this.attemptsLeft ? '#ff4455' : '#333344',
      }).setOrigin(0.5, 0.5))
    }
    this.questionPanel.add(this.add.text(42, hy, `${this.attemptsLeft} attempt${this.attemptsLeft !== 1 ? 's' : ''} left`, {
      fontSize: '13px', fontFamily: 'Arial', color: '#999999',
    }).setOrigin(0, 0.5))
    this.questionPanel.add(this.add.text(W / 2 - 20, hy, `+${XP_BY_DIFFICULTY[q.difficulty]} XP`, {
      fontSize: '15px', fontFamily: 'Arial', color: '#44ffaa', fontStyle: 'bold',
    }).setOrigin(1, 0.5))

    // Divider
    const dv = this.add.graphics()
    dv.lineStyle(1, 0x4422aa, 1)
    dv.lineBetween(-W / 2 + 20, -H / 2 + 104, W / 2 - 20, -H / 2 + 104)
    this.questionPanel.add(dv)

    // Question text
    this.questionPanel.add(this.add.text(0, -H / 2 + 152, q.question, {
      fontSize: '20px', fontFamily: 'Georgia, serif', color: '#ffffff',
      align: 'center', wordWrap: { width: W - 80 },
    }).setOrigin(0.5, 0.5))

    // Answer buttons (2 × 2)
    const bW = 410, bH = 74
    const positions = [{ x: -226, y: 62 }, { x: 226, y: 62 }, { x: -226, y: 152 }, { x: 226, y: 152 }]
    const letters = ['A', 'B', 'C', 'D']
    q.answers.forEach((ans, i) => {
      const btn = this.makeButton(`${letters[i]}.  ${ans}`, '', bW, bH, 0x181430, 0x2a2050, () => {
        if (!this.questionLocked) this.handleAnswer(i)
      })
      btn.setPosition(positions[i].x, positions[i].y)
      this.questionPanel.add(btn)
      this.questionPanel.add(this.add.text(
        positions[i].x - bW / 2 + 8, positions[i].y - bH / 2 + 6, `[${i + 1}]`,
        { fontSize: '11px', fontFamily: 'Arial', color: '#666666' }
      ).setOrigin(0, 0))
    })

    // Feedback text (hidden until used)
    this.questionPanel.add(
      this.add.text(0, H / 2 - 42, '', {
        fontSize: '17px', fontFamily: 'Georgia, serif', color: '#44ff88', fontStyle: 'bold',
        wordWrap: { width: W - 60 }, align: 'center',
      }).setOrigin(0.5, 0.5).setName('feedback').setVisible(false)
    )
  }

  private handleAnswer(idx: number) {
    if (this.state !== 'questioning' || this.questionLocked) return
    const q = this.currentQuestion
    if (!q || !this.sessionId || !this.socket?.connected) return
    this.questionLocked = true

    // The server validates the answer (it alone knows correctIndex).
    this.socket.emit('learning:answer', {
      sessionId: this.sessionId,
      questionId: q.id,
      answerIndex: idx,
    })
  }

  /** Process the server's verdict for the answer we just submitted. */
  private handleAnswerResult(res: AnswerResult) {
    if (this.state !== 'questioning' || !this.questionLocked) return
    const q = this.currentQuestion
    if (!q) return

    const fb = this.questionPanel.getByName('feedback') as Phaser.GameObjects.Text | null
    fb?.setVisible(true)

    this.xpEarned += res.xpEarned
    if (res.sessionComplete) this.sessionWasPerfect = res.perfectScore

    const shortText = q.question.length > 60 ? q.question.slice(0, 60) + '…' : q.question

    const advance = () => {
      if (res.sessionComplete) {
        // Wait for `learning:complete` to deliver the reward facts; show a
        // brief tallying state in the meantime.
        this.state = 'results'
        this.questionPanel.setVisible(false)
        if (this.completeResult) this.showResults()
        else this.showTallying()
      } else if (res.nextQuestion) {
        this.currentQuestion = res.nextQuestion
        this.questionNumber++
        this.attemptsLeft = res.attemptsLeft
        this.buildQuestion()
      }
    }

    if (res.correct) {
      this.correctCount++
      this.questionResults.push({ text: shortText, correct: true })
      fb?.setText(`✓  Correct!  +${res.xpEarned} XP`).setColor('#44ff88')
      this.time.delayedCall(1300, advance)
    } else if (res.attemptsLeft <= 0 || res.sessionComplete || res.nextQuestion) {
      this.questionResults.push({ text: shortText, correct: false })
      fb?.setText(`✗  Out of attempts!  ${res.explanation}`).setColor('#ff6644')
      this.time.delayedCall(2600, advance)
    } else {
      this.attemptsLeft = res.attemptsLeft
      fb?.setText(`✗  Incorrect — ${res.attemptsLeft} attempt${res.attemptsLeft > 1 ? 's' : ''} remaining`).setColor('#ffaa44')
      this.time.delayedCall(1300, () => { fb?.setVisible(false); this.buildQuestion() })
    }
  }

  /** Store the completion result; render now if the quiz UI already finished. */
  private handleComplete(res: CompleteResult) {
    this.completeResult = res
    // Keep our local snapshot fresh for the next visit to the topic modal.
    if (this.sessionTopic) {
      this.topicPasses[this.sessionTopic.id] = res.topicPasses
      if (res.gradeCompleted) this.subjectGrades[this.sessionTopic.subject] = res.newGrade
    }
    if (this.state === 'results') this.showResults()
  }

  // ─── RESULTS ───────────────────────────────────────────────────────────────

  /** Transient panel shown while we await `learning:complete`. */
  private showTallying() {
    this.resultsPanel.removeAll(true)
    this.resultsPanel.setVisible(true)
    const W = 520, H = 200
    const bg = this.add.graphics()
    bg.fillStyle(0x0c0c24, 0.98)
    bg.fillRoundedRect(-W / 2, -H / 2, W, H, 16)
    bg.lineStyle(2, 0x5533aa, 1)
    bg.strokeRoundedRect(-W / 2, -H / 2, W, H, 16)
    this.resultsPanel.add(bg)
    this.resultsPanel.add(this.add.text(0, 0, 'Tallying your results…', {
      fontSize: '20px', fontFamily: 'Georgia, serif', color: '#ffffff',
    }).setOrigin(0.5, 0.5))
  }

  private showResults() {
    const res = this.completeResult
    if (!res) { this.showTallying(); return }

    this.resultsPanel.removeAll(true)
    this.resultsPanel.setVisible(true)

    const passed = res.passed
    const gradeUp = res.gradeCompleted
    const W = 720
    const H = 430 + this.questionResults.length * 36 + (gradeUp ? 110 : 30)

    const bg = this.add.graphics()
    bg.fillStyle(0x0c0c24, 0.98)
    bg.fillRoundedRect(-W / 2, -H / 2, W, H, 16)
    bg.lineStyle(2, gradeUp ? 0xffd700 : (passed ? 0x33aa55 : 0xaa4433), 1)
    bg.strokeRoundedRect(-W / 2, -H / 2, W, H, 16)
    if (gradeUp) {
      bg.lineStyle(3, 0xffee44, 0.5)
      bg.strokeRoundedRect(-W / 2 + 4, -H / 2 + 4, W - 8, H - 8, 13)
    }
    this.resultsPanel.add(bg)

    const title = this.sessionWasPerfect ? '🎉  Perfect Score!' : (passed ? '✓  Quiz Passed!' : 'Quiz Complete')
    this.resultsPanel.add(this.add.text(0, -H / 2 + 36, title, {
      fontSize: '28px', fontFamily: 'Georgia, serif',
      color: passed ? '#ffd700' : '#ffaa88', fontStyle: 'bold',
    }).setOrigin(0.5, 0.5))

    const subj = SUBJECT_CONFIG.find(s => s.key === this.sessionTopic?.subject)
    const topic = this.sessionTopic
    this.resultsPanel.add(this.add.text(0, -H / 2 + 70, `${subj?.icon ?? ''}  ${subj?.label ?? ''}  ·  ${topic?.icon ?? ''} ${topic?.name ?? ''}  ·  Grade ${topic?.grade ?? ''}`, {
      fontSize: '15px', fontFamily: 'Arial', color: '#888888',
    }).setOrigin(0.5, 0.5))

    const dv = this.add.graphics()
    dv.lineStyle(1, 0xffd700, 0.35)
    dv.lineBetween(-W / 2 + 40, -H / 2 + 88, W / 2 - 40, -H / 2 + 88)
    this.resultsPanel.add(dv)

    // Per-question rows
    this.questionResults.forEach((row, i) => {
      this.resultsPanel.add(this.add.text(
        0, -H / 2 + 118 + i * 36,
        `${row.correct ? '✓' : '✗'}  Q${i + 1}:  ${row.text}`,
        { fontSize: '14px', fontFamily: 'Arial', color: row.correct ? '#44ff88' : '#ff6655', wordWrap: { width: W - 60 } }
      ).setOrigin(0.5, 0.5))
    })

    let y = -H / 2 + 126 + this.questionResults.length * 36

    // Score line + pass threshold reminder (server-reported score)
    this.resultsPanel.add(this.add.text(0, y,
      `Score:  ${res.score} / ${QUESTIONS_PER_SESSION}    ·    +${this.xpEarned} XP earned`, {
      fontSize: '19px', fontFamily: 'Georgia, serif', color: '#44ffaa', fontStyle: 'bold',
    }).setOrigin(0.5, 0.5))
    y += 30
    this.resultsPanel.add(this.add.text(0, y,
      passed ? 'You passed! (4 or more correct)' : 'You need 4 of 5 correct to pass — try again!', {
      fontSize: '13px', fontFamily: 'Arial', color: passed ? '#88ddaa' : '#ffaa88',
    }).setOrigin(0.5, 0.5))
    y += 34

    // Topic progress (passes), reported by the server
    const done = res.topicPasses >= PASSES_TO_COMPLETE
    this.resultsPanel.add(this.add.text(0, y,
      `${topic?.name ?? 'Topic'} progress:  ${passesDots(res.topicPasses)}  ${done ? 'Complete!' : `${res.topicPasses}/${PASSES_TO_COMPLETE} passes`}`, {
      fontSize: '16px', fontFamily: 'Georgia, serif', color: done ? '#66ffaa' : '#bbbbff', fontStyle: 'bold',
    }).setOrigin(0.5, 0.5))
    y += 40

    // Per-quiz skill shard (every completed test earns 1). On a grade-up the
    // total — including the grade bonus — is shown in the celebration instead.
    if (!gradeUp && res.skillShardsAwarded > 0) {
      this.resultsPanel.add(this.add.text(0, y,
        `+${res.skillShardsAwarded} 🔷  Skill Shard earned!`, {
        fontSize: '17px', fontFamily: 'Georgia, serif', color: '#66bbff', fontStyle: 'bold',
      }).setOrigin(0.5, 0.5))
      y += 32
    }

    // Grade-up celebration (only when the server says both topics completed)
    if (gradeUp) {
      const mastered = res.newGrade >= MASTERED_GRADE
      this.resultsPanel.add(this.add.text(0, y,
        mastered
          ? `🏆  ${subj?.label ?? 'Subject'} Mastered!`
          : `🎓  Grade ${(topic?.grade ?? 1)} complete!`, {
        fontSize: '22px', fontFamily: 'Georgia, serif', color: '#ffd700', fontStyle: 'bold',
      }).setOrigin(0.5, 0.5))
      y += 32
      this.resultsPanel.add(this.add.text(0, y,
        `+${res.skillShardsAwarded} 🔷   +${res.combatShardAwarded} 🔶`, {
        fontSize: '20px', fontFamily: 'Georgia, serif', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0.5, 0.5))
      y += 28
      this.resultsPanel.add(this.add.text(0, y,
        mastered
          ? 'You have completed all 12 grades in this subject!'
          : `Advanced to Grade ${res.newGrade} in ${subj?.label ?? 'this subject'}!`, {
        fontSize: '13px', fontFamily: 'Arial', color: '#cccccc',
      }).setOrigin(0.5, 0.5))
      y += 24
    }

    // Primary: stay in the school and return to this subject's topic list so
    // the player can keep studying (the next topic, or the same one again).
    const cont = this.makeButton('Continue Studying', '', 290, 52, 0x1a5a2a, 0x2a7a3a, () => this.continueStudying())
    cont.setPosition(-156, H / 2 - 36)
    this.resultsPanel.add(cont)

    const ret = this.makeButton('Return to World', '', 290, 52, 0x2a1060, 0x4a2090, () => this.returnToWorld())
    ret.setPosition(156, H / 2 - 36)
    this.resultsPanel.add(ret)
  }

  // ─── RETURN ────────────────────────────────────────────────────────────────

  /** After a quiz, stay in the classroom and reopen the topic list for the
   *  subject just studied (its grade/passes already refreshed in handleComplete,
   *  so completing a grade lands the player on the next grade's topics). */
  private continueStudying() {
    this.resultsPanel.setVisible(false)
    this.questionPanel.setVisible(false)

    // Un-seat: clear the seated avatar and restore the walking sprite for when
    // the player eventually leaves the modal.
    this.seatedGfx.clear()
    this.player.setVisible(true).setVelocity(0, 0)

    // Reset session state
    this.sessionId = null
    this.currentQuestion = null
    this.completeResult = null

    // Reopen the topic list for the same subject
    this.modalSubject = this.sessionTopic?.subject ?? null
    this.state = 'teacher_dialog'
    this.overlay.setVisible(true)
    this.socket?.emit('shop:get_unlocks')   // confirm fresh passes/grade from server
    this.buildTopicModal()
    this.topicModal.setVisible(true)
  }

  private returnToWorld() {
    this.scene.start('WorldScene')
  }

  // ─── UPDATE ────────────────────────────────────────────────────────────────

  update() {
    if (this.state === 'exploring') {
      let vx = 0, vy = 0
      if (this.cursors.left.isDown  || this.wasd.A.isDown) vx--
      if (this.cursors.right.isDown || this.wasd.D.isDown) vx++
      if (this.cursors.up.isDown    || this.wasd.W.isDown) vy--
      if (this.cursors.down.isDown  || this.wasd.S.isDown) vy++
      if (vx !== 0 && vy !== 0) { vx *= 0.707; vy *= 0.707 }
      this.player.setVelocity(vx * PLAYER_SPEED, vy * PLAYER_SPEED)

      if (this.anims.exists('walk_down')) {
        if (vx !== 0 || vy !== 0) {
          let dir: string
          if (Math.abs(vy) >= Math.abs(vx)) dir = vy > 0 ? 'down' : 'up'
          else                               dir = vx > 0 ? 'right' : 'left'
          const key = `walk_${dir}`
          if (this.player.anims.currentAnim?.key !== key) this.player.play(key)
        } else {
          const lastDir = (this.player.anims.currentAnim?.key ?? 'walk_down').replace('walk_', '').replace('idle_', '')
          const key = `idle_${lastDir}`
          if (this.player.anims.currentAnim?.key !== key) this.player.play(key)
        }
      }

      if (Phaser.Input.Keyboard.JustDown(this.escKey)) { this.returnToWorld(); return }

      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, 640, 248)
      if (dist < 130) {
        this.teacherPrompt.setVisible(true)
        if (Phaser.Input.Keyboard.JustDown(this.eKey)) {
          this.player.setVelocity(0, 0)
          this.state = 'teacher_dialog'
          this.overlay.setVisible(true)
          // Refresh progression then show the subject picker
          this.socket?.emit('shop:get_unlocks')
          this.openTopicModal()
        }
      } else {
        this.teacherPrompt.setVisible(false)
      }
    }

    // Keyboard answers (1–4) while questioning
    if (this.state === 'questioning' && !this.questionLocked) {
      this.numKeys.forEach((key, i) => {
        if (Phaser.Input.Keyboard.JustDown(key)) this.handleAnswer(i)
      })
    }
  }
}
