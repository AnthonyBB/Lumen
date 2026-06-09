import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT, PLAYER_SPEED } from '../constants'
import type { Subject, Difficulty, Question } from '../../engine/types'
import { QUESTIONS_BY_SUBJECT } from '../../engine/questions'

type ClassroomState = 'exploring' | 'teacher_dialog' | 'seated' | 'questioning' | 'results'

const SUBJECT_CONFIG = [
  { key: 'math'     as Subject, label: 'Mathematics',  icon: '➕', color: 0x1a3a8a, hover: 0x2a4aaa },
  { key: 'science'  as Subject, label: 'Science',       icon: '🔬', color: 0x0a5a2a, hover: 0x1a7a3a },
  { key: 'history'  as Subject, label: 'History',       icon: '📜', color: 0x7a3a00, hover: 0x9a5a10 },
  { key: 'language' as Subject, label: 'Language Arts', icon: '📖', color: 0x6a1060, hover: 0x8a2080 },
]

const DIFFICULTY_CONFIG = [
  { key: 'easy'   as Difficulty, label: 'Easy',   desc: 'Accessible questions · +10 XP each', color: 0x0a5a1a, hover: 0x1a8a2a },
  { key: 'medium' as Difficulty, label: 'Medium', desc: 'A real challenge · +20 XP each',      color: 0x7a5000, hover: 0x9a7000 },
  { key: 'hard'   as Difficulty, label: 'Hard',   desc: 'Expert level · +35 XP each',          color: 0x7a1010, hover: 0x9a2020 },
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

  private subjectModal!: Phaser.GameObjects.Container
  private difficultyModal!: Phaser.GameObjects.Container
  private questionPanel!: Phaser.GameObjects.Container
  private resultsPanel!: Phaser.GameObjects.Container

  private sessionSubject!: Subject
  private sessionDifficulty!: Difficulty
  private sessionQuestions: Question[] = []
  private currentQuestionIdx = 0
  private attemptsLeft = 3
  private correctCount = 0
  private xpEarned = 0
  private questionResults: boolean[] = []
  private questionLocked = false

  constructor() { super({ key: 'ClassroomScene' }) }

  create() {
    this.state = 'exploring'
    this.questionLocked = false

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

    this.createSubjectModal()
    this.createDifficultyModal()
    this.createQuestionPanel()
    this.createResultsPanel()
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
    this.player = this.physics.add.sprite(640, 650, 'player')
    this.player.setScale(2).setDepth(10).setCollideWorldBounds(true)
    const body = this.player.body as Phaser.Physics.Arcade.Body
    body.setSize(18, 28)
    body.setOffset(7, 18)
    this.physics.world.setBounds(44, 286, GAME_WIDTH - 88, GAME_HEIGHT - 290)
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

  // ─── SUBJECT MODAL ─────────────────────────────────────────────────────────

  private createSubjectModal() {
    const W = 760, H = 430
    this.subjectModal = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2)
      .setDepth(100).setVisible(false)

    const bg = this.add.graphics()
    bg.fillStyle(0x0c0c24, 0.98)
    bg.fillRoundedRect(-W / 2, -H / 2, W, H, 16)
    bg.lineStyle(2, 0xffd700, 1)
    bg.strokeRoundedRect(-W / 2, -H / 2, W, H, 16)
    this.subjectModal.add(bg)

    this.subjectModal.add(this.add.text(0, -H / 2 + 32, 'What would you like to study today?', {
      fontSize: '22px', fontFamily: 'Georgia, serif', color: '#ffd700', fontStyle: 'bold',
    }).setOrigin(0.5, 0.5))
    this.subjectModal.add(this.add.text(0, -H / 2 + 62, 'Choose a subject — 5 questions · 3 attempts each', {
      fontSize: '14px', fontFamily: 'Arial', color: '#aaaaaa',
    }).setOrigin(0.5, 0.5))

    const div = this.add.graphics()
    div.lineStyle(1, 0xffd700, 0.35)
    div.lineBetween(-W / 2 + 40, -H / 2 + 80, W / 2 - 40, -H / 2 + 80)
    this.subjectModal.add(div)

    const grid = [{ x: -180, y: -44 }, { x: 180, y: -44 }, { x: -180, y: 72 }, { x: 180, y: 72 }]
    SUBJECT_CONFIG.forEach((s, i) => {
      const btn = this.makeButton(`${s.icon}  ${s.label}`, '', 320, 96, s.color, s.hover, () => {
        if (this.state === 'teacher_dialog') this.onSubjectChosen(s.key)
      })
      btn.setPosition(grid[i].x, grid[i].y)
      this.subjectModal.add(btn)
    })

    const exit = this.makeButton('← Return to World', '', 210, 40, 0x2a2a44, 0x3a3a60, () => this.returnToWorld())
    exit.setPosition(0, H / 2 - 34)
    this.subjectModal.add(exit)
  }

  private onSubjectChosen(subject: Subject) {
    this.sessionSubject = subject
    this.subjectModal.setVisible(false)

    // Seat player at a random empty desk
    const desk = EMPTY_DESKS[Phaser.Math.Between(0, EMPTY_DESKS.length - 1)]
    this.player.setVisible(false)
    this.seatedGfx.clear()
    // Seated wizard
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
    this.time.delayedCall(320, () => this.difficultyModal.setVisible(true))
  }

  // ─── DIFFICULTY MODAL ──────────────────────────────────────────────────────

  private createDifficultyModal() {
    const W = 640, H = 390
    this.difficultyModal = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2)
      .setDepth(100).setVisible(false)

    const bg = this.add.graphics()
    bg.fillStyle(0x0c0c24, 0.98)
    bg.fillRoundedRect(-W / 2, -H / 2, W, H, 16)
    bg.lineStyle(2, 0xffd700, 1)
    bg.strokeRoundedRect(-W / 2, -H / 2, W, H, 16)
    this.difficultyModal.add(bg)

    this.difficultyModal.add(this.add.text(0, -H / 2 + 34, 'Choose Your Difficulty', {
      fontSize: '24px', fontFamily: 'Georgia, serif', color: '#ffd700', fontStyle: 'bold',
    }).setOrigin(0.5, 0.5))
    this.difficultyModal.add(this.add.text(0, -H / 2 + 64, '5 questions · 3 attempts each · Earn XP!', {
      fontSize: '14px', fontFamily: 'Arial', color: '#aaaaaa',
    }).setOrigin(0.5, 0.5))

    const div = this.add.graphics()
    div.lineStyle(1, 0xffd700, 0.35)
    div.lineBetween(-W / 2 + 40, -H / 2 + 80, W / 2 - 40, -H / 2 + 80)
    this.difficultyModal.add(div)

    const yPos = [-70, 24, 118]
    DIFFICULTY_CONFIG.forEach((d, i) => {
      const btn = this.makeButton(d.label, d.desc, 520, 76, d.color, d.hover, () => {
        if (this.state === 'seated') this.onDifficultyChosen(d.key)
      })
      btn.setPosition(0, yPos[i])
      this.difficultyModal.add(btn)
    })
  }

  private onDifficultyChosen(difficulty: Difficulty) {
    this.sessionDifficulty = difficulty
    this.difficultyModal.setVisible(false)

    const pool = QUESTIONS_BY_SUBJECT[this.sessionSubject].filter(q => q.difficulty === difficulty)
    const shuffled = Phaser.Utils.Array.Shuffle([...pool]) as Question[]
    this.sessionQuestions = shuffled.slice(0, Math.min(5, shuffled.length))
    this.currentQuestionIdx = 0
    this.attemptsLeft = 3
    this.correctCount = 0
    this.xpEarned = 0
    this.questionResults = []
    this.questionLocked = false

    this.state = 'questioning'
    this.buildQuestion()
  }

  // ─── QUESTION PANEL ────────────────────────────────────────────────────────

  private createQuestionPanel() {
    this.questionPanel = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2)
      .setDepth(100).setVisible(false)
  }

  private buildQuestion() {
    this.questionPanel.removeAll(true)
    this.questionPanel.setVisible(true)
    this.questionLocked = false

    const q = this.sessionQuestions[this.currentQuestionIdx]
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
    const subj = SUBJECT_CONFIG.find(s => s.key === this.sessionSubject)!
    const diff = DIFFICULTY_CONFIG.find(d => d.key === this.sessionDifficulty)!
    this.questionPanel.add(this.add.text(-W / 2 + 20, -H / 2 + 14, `${subj.icon}  ${subj.label}  ·  ${diff.label}`, {
      fontSize: '15px', fontFamily: 'Arial', color: '#bbaaff',
    }).setOrigin(0, 0.5))
    this.questionPanel.add(this.add.text(W / 2 - 20, -H / 2 + 14, `Question  ${this.currentQuestionIdx + 1}  of  ${this.sessionQuestions.length}`, {
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
    this.questionPanel.add(this.add.text(W / 2 - 20, hy, `+${q.xpReward} XP`, {
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
    this.questionLocked = true

    const q = this.sessionQuestions[this.currentQuestionIdx]
    const fb = this.questionPanel.getByName('feedback') as Phaser.GameObjects.Text
    fb.setVisible(true)

    if (idx === q.correctIndex) {
      this.correctCount++
      this.xpEarned += q.xpReward
      this.questionResults.push(true)
      fb.setText(`✓  Correct!  +${q.xpReward} XP`).setColor('#44ff88')
      this.time.delayedCall(1400, () => this.advance())
    } else {
      this.attemptsLeft--
      if (this.attemptsLeft <= 0) {
        this.questionResults.push(false)
        fb.setText(`✗  Out of attempts!  Answer: ${q.answers[q.correctIndex]}`).setColor('#ff6644')
        this.time.delayedCall(2200, () => this.advance())
      } else {
        fb.setText(`✗  Incorrect — ${this.attemptsLeft} attempt${this.attemptsLeft > 1 ? 's' : ''} remaining`).setColor('#ffaa44')
        this.time.delayedCall(1300, () => { fb.setVisible(false); this.buildQuestion() })
      }
    }
  }

  private advance() {
    this.currentQuestionIdx++
    if (this.currentQuestionIdx >= this.sessionQuestions.length) {
      this.state = 'results'
      this.questionPanel.setVisible(false)
      this.showResults()
    } else {
      this.attemptsLeft = 3
      this.buildQuestion()
    }
  }

  // ─── RESULTS ───────────────────────────────────────────────────────────────

  private createResultsPanel() {
    this.resultsPanel = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2)
      .setDepth(100).setVisible(false)
  }

  private showResults() {
    this.resultsPanel.removeAll(true)
    this.resultsPanel.setVisible(true)

    const perfect = this.correctCount === this.sessionQuestions.length
    const W = 720, H = perfect ? 540 : 470
    const bg = this.add.graphics()
    bg.fillStyle(0x0c0c24, 0.98)
    bg.fillRoundedRect(-W / 2, -H / 2, W, H, 16)
    bg.lineStyle(2, perfect ? 0xffd700 : 0x5533aa, 1)
    bg.strokeRoundedRect(-W / 2, -H / 2, W, H, 16)
    if (perfect) {
      bg.lineStyle(3, 0xffee44, 0.5)
      bg.strokeRoundedRect(-W / 2 + 4, -H / 2 + 4, W - 8, H - 8, 13)
    }
    this.resultsPanel.add(bg)

    this.resultsPanel.add(this.add.text(0, -H / 2 + 38, perfect ? '🎉  Perfect Score!' : 'Lesson Complete!', {
      fontSize: '28px', fontFamily: 'Georgia, serif',
      color: perfect ? '#ffd700' : '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5, 0.5))

    const subj = SUBJECT_CONFIG.find(s => s.key === this.sessionSubject)!
    const diff = DIFFICULTY_CONFIG.find(d => d.key === this.sessionDifficulty)!
    this.resultsPanel.add(this.add.text(0, -H / 2 + 72, `${subj.icon}  ${subj.label}  ·  ${diff.label}`, {
      fontSize: '15px', fontFamily: 'Arial', color: '#888888',
    }).setOrigin(0.5, 0.5))

    const dv = this.add.graphics()
    dv.lineStyle(1, 0xffd700, 0.35)
    dv.lineBetween(-W / 2 + 40, -H / 2 + 90, W / 2 - 40, -H / 2 + 90)
    this.resultsPanel.add(dv)

    // Per-question rows
    this.questionResults.forEach((correct, i) => {
      const q = this.sessionQuestions[i]
      const short = q.question.length > 60 ? q.question.slice(0, 60) + '…' : q.question
      this.resultsPanel.add(this.add.text(
        0, -H / 2 + 124 + i * 38,
        `${correct ? '✓' : '✗'}  Q${i + 1}:  ${short}`,
        { fontSize: '14px', fontFamily: 'Arial', color: correct ? '#44ff88' : '#ff6655', wordWrap: { width: W - 60 } }
      ).setOrigin(0.5, 0.5))
    })

    // Score tally
    this.resultsPanel.add(this.add.text(
      0, -H / 2 + 130 + this.sessionQuestions.length * 38,
      `Score:  ${this.correctCount} / ${this.sessionQuestions.length}    ·    +${this.xpEarned} XP earned`,
      { fontSize: '19px', fontFamily: 'Georgia, serif', color: '#44ffaa', fontStyle: 'bold' }
    ).setOrigin(0.5, 0.5))

    // Shard award
    if (perfect) {
      const sy = H / 2 - 136
      // Glowing orb
      const orb = this.add.graphics()
      orb.fillStyle(0x0044aa, 0.28); orb.fillCircle(0, sy, 32)
      orb.fillStyle(0x2288dd, 0.55); orb.fillCircle(0, sy, 22)
      orb.fillStyle(0x88ddff, 1);    orb.fillCircle(0, sy, 13)
      orb.fillStyle(0xffffff, 0.8);  orb.fillTriangle(-6, sy - 8, 0, sy - 16, 6, sy - 8)
      this.resultsPanel.add(orb)
      this.tweens.add({ targets: orb, scaleX: 1.18, scaleY: 1.18, duration: 750, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })

      this.resultsPanel.add(this.add.text(0, sy + 42, '🔮  Shard of Knowledge Awarded!', {
        fontSize: '20px', fontFamily: 'Georgia, serif', color: '#88eeff', fontStyle: 'bold',
      }).setOrigin(0.5, 0.5))
      this.resultsPanel.add(this.add.text(0, sy + 68, 'Added to your inventory', {
        fontSize: '13px', fontFamily: 'Arial', color: '#888888',
      }).setOrigin(0.5, 0.5))

      // Add to inventory via registry
      this.registry.set('shards', ((this.registry.get('shards') as number) || 0) + 1)
    }

    // Return button
    const ret = this.makeButton('Return to World', '', 290, 52, 0x2a1060, 0x4a2090, () => this.returnToWorld())
    ret.setPosition(0, H / 2 - 36)
    this.resultsPanel.add(ret)
  }

  // ─── RETURN ────────────────────────────────────────────────────────────────

  private returnToWorld() {
    this.scene.start('WorldScene')
  }

  // ─── UPDATE ────────────────────────────────────────────────────────────────

  update() {
    if (this.state === 'exploring') {
      // Movement
      let vx = 0, vy = 0
      if (this.cursors.left.isDown  || this.wasd.A.isDown) vx--
      if (this.cursors.right.isDown || this.wasd.D.isDown) vx++
      if (this.cursors.up.isDown    || this.wasd.W.isDown) vy--
      if (this.cursors.down.isDown  || this.wasd.S.isDown) vy++
      if (vx !== 0 && vy !== 0) { vx *= 0.707; vy *= 0.707 }
      this.player.setVelocity(vx * PLAYER_SPEED, vy * PLAYER_SPEED)
      if (vx < 0) this.player.setFlipX(true)
      else if (vx > 0) this.player.setFlipX(false)

      // ESC → world
      if (Phaser.Input.Keyboard.JustDown(this.escKey)) { this.returnToWorld(); return }

      // Teacher proximity
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, 640, 248)
      if (dist < 130) {
        this.teacherPrompt.setVisible(true)
        if (Phaser.Input.Keyboard.JustDown(this.eKey)) {
          this.player.setVelocity(0, 0)
          this.state = 'teacher_dialog'
          this.overlay.setVisible(true)
          this.subjectModal.setVisible(true)
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
