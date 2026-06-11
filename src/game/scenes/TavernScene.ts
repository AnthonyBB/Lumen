import Phaser from 'phaser'
import type { Socket } from 'socket.io-client'
import { GAME_WIDTH, GAME_HEIGHT } from '../constants'
import { Player } from '../objects/Player'

/**
 * TavernScene — a cozy multiplayer tavern interior the player enters from town.
 *
 * Multiplayer presence mirrors WorldScene.setupMultiplayer(): remote players are
 * rendered EXCLUSIVELY from server pushes (zone:players / player:joined /
 * player:moved) for the 'tavern' zone, and the client only reports its own
 * position. On enter we emit player:move {zone:'tavern'} + zone:get; on exit we
 * move back to the 'town' zone.
 *
 * Chat is server-authoritative: the client emits chat:message {message}; the
 * server validates/sanitises and rebroadcasts chat:message {username,message,ts}
 * to everyone in the SENDER'S zone, so tavern chat only reaches tavern patrons.
 *
 * Layout: the LEFT/CENTER is the room; the RIGHT CHAT_W px is the chat panel.
 */

// ── Interior tilesheet frame picks ───────────────────────────────────────────
// All frame picks below were read from the CraftPix tavern's own Tiled map
// (Tavern_interior_1nd_floor.tmx) so the multi-tile pieces match how the pack's
// artists assembled them, rather than guessing.
//
// tav_walls is 10 cols × 18 rows (160×288). The TMX `floor` layer fills the
// room with stone-cobble tiles from row 0, cols 3–9 (gids 4–10), and the wall
// band uses a plain stone fill plus an arched-window row.
const FLOOR_FRAMES = [3, 4, 5, 6, 7, 8, 9] // stone-cobble floor variants (row 0)
const WALL_FILL_FRAME = 11      // plain stone wall fill (gid 12)
const WALL_WINDOW_FRAME = 151   // arched-window wall tile (gid 152, row 15)
const WALL_SIDE_FRAME = 162     // vertical side-wall tile (gid 163)

// tav_interior is 21 cols × 22 rows (336×352). Furniture pieces are multi-tile;
// we crop each as a sub-rectangle and assemble it into one reusable texture via
// a RenderTexture. Each entry is [originCol, originRow, widthTiles, heightTiles].
// Spans verified against the TMX gid clusters (gid → frame = gid-1121,
// col = frame%21, row = frame//21).
// Every span below was decoded from the TMX furniture layers (gid→frame=gid-1121,
// col=frame%21, row=frame//21) and cross-checked against Interior_1st_floor.png.
const PIECES = {
  bottleShelf:   [9, 0, 4, 3],   // bottle/flask cabinet behind the bar (rows 0–2; row 3 is the counter)
  woodShelf:     [13, 0, 4, 3],  // plain wooden shelf (right of the bottle shelf)
  kegStack:      [18, 0, 3, 4],  // slatted keg/wine rack (cols 18–20; col 17 was bar-counter bleed)
  barCounter:    [9, 3, 4, 3],   // golden bar counter (rows 3–5: mugs/top/front)
  communalTable: [0, 0, 4, 3],   // long communal table + benches (top-left of sheet)
  roundTable:    [14, 9, 3, 2],  // small round table + stools, top view
  barrel:        [4, 6, 2, 3],   // wooden barrel with blue bands (rows 6–8)
  barrelSingle:  [4, 6, 2, 3],   // reuse the verified barrel
  chair:         [2, 6, 1, 2],   // single stool (col 2, rows 6–7) — old [6,4] hit the bar counter
  booth:         [8, 6, 2, 3],   // red corner booth opening RIGHT (cols 8–9, rows 6–8)
  boothR:        [12, 6, 2, 3],  // red corner booth opening LEFT (cols 12–13) — faces `booth`
  plant:         [4, 12, 2, 2],  // green potted plant (rows 12–13)
  plantTall:     [6, 12, 2, 2],  // second potted plant variant (rows 12–13)
  rug:           [16, 12, 5, 3], // large blue rug (rows 12–14)
} as const

const CHAT_W = 320

interface RosterEntry { id: string; username: string; position: { x: number; y: number } }

export class TavernScene extends Phaser.Scene {
  private player!: Player
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd!: { W: Phaser.Input.Keyboard.Key; A: Phaser.Input.Keyboard.Key; S: Phaser.Input.Keyboard.Key; D: Phaser.Input.Keyboard.Key }
  private escKey!: Phaser.Input.Keyboard.Key

  // Where to drop the player back in town when they leave
  private returnX = 0
  private returnY = 0

  // Room bounds (world == screen for this fixed single-room scene)
  private readonly roomX = 24
  private readonly roomY = 24
  private roomW = 0
  private roomH = 0
  private wallBand = 96   // height of the decorative top wall band (set in buildInterior)
  // Collision footprints for the furniture, recorded while building the room
  // (centre x/y + size) and turned into static colliders in create().
  private solids: { x: number; y: number; w: number; h: number }[] = []

  // ── Multiplayer presence (tavern zone) ─────────────────────────────────────
  private socket: Socket | null = null
  private remotePlayers = new Map<string, {
    sprite: Phaser.GameObjects.Sprite
    label: Phaser.GameObjects.Text
    tx: number
    ty: number
    dir: 'down' | 'left' | 'right' | 'up'
  }>()
  private lastMoveSentAt = 0
  private lastSentX = 0
  private lastSentY = 0

  // ── Chat ────────────────────────────────────────────────────────────────────
  private chatLog: { username: string; message: string; mine: boolean }[] = []
  private chatText!: Phaser.GameObjects.Text
  private chatInput: HTMLInputElement | null = null
  private static readonly CHAT_INPUT_ID = 'lumen-tavern-chat'

  constructor() {
    super({ key: 'TavernScene' })
  }

  init(data?: { returnX?: number; returnY?: number }) {
    this.returnX = data?.returnX ?? 0
    this.returnY = data?.returnY ?? 0
    // Reset transient state (the scene instance is reused across visits).
    this.remotePlayers.clear()
    this.chatLog = []
  }

  create() {
    this.roomW = GAME_WIDTH - CHAT_W - this.roomX * 2
    this.roomH = GAME_HEIGHT - this.roomY * 2

    this.buildInterior()
    this.buildChatPanel()

    // ── Player ────────────────────────────────────────────────────────────────
    // Spawn near the bottom-centre of the room (by the "door").
    const spawnX = this.roomX + this.roomW / 2
    const spawnY = this.roomY + this.roomH - 60
    this.player = new Player(this, spawnX, spawnY)
    this.player.setDepth(20)

    // World bounds = the room's floor: inside the L/R/bottom stone borders and
    // below the windowed top wall band. No artificial interior walls — the only
    // things that block the player are the room walls and the furniture
    // colliders below, which are shaped to the actual objects on screen.
    const border = 40
    const floorTop = this.roomY + this.wallBand
    this.physics.world.setBounds(
      this.roomX + border,
      floorTop,
      this.roomW - border * 2,
      this.roomY + this.roomH - border - floorTop,
    )
    this.player.setCollideWorldBounds(true)

    // One static collider per solid furniture footprint (recorded in
    // buildInterior), so collision lines up with the drawn objects. Stools and
    // chairs are intentionally walkable.
    for (const s of this.solids) {
      const z = this.add.zone(s.x, s.y, s.w, s.h)
      this.physics.add.existing(z, true)
      this.physics.add.collider(this.player, z)
    }

    this.cameras.main.setBounds(0, 0, GAME_WIDTH, GAME_HEIGHT)
    this.cameras.main.setZoom(1)

    // ── Input ───────────────────────────────────────────────────────────────
    this.cursors = this.input.keyboard!.createCursorKeys()
    this.wasd = {
      W: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      S: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      D: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    }
    this.escKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC)

    this.buildExitButton()

    // ── Multiplayer ───────────────────────────────────────────────────────────
    this.setupMultiplayer()
    this.setupChat()

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup())
  }

  // ── Interior rendering ──────────────────────────────────────────────────────

  /** Crop a multi-tile furniture piece from the tav_interior sheet into a single
   *  reusable texture, returning the generated key. Idempotent per key. */
  private makePieceTexture(name: keyof typeof PIECES): string {
    const key = `tavpiece_${name}`
    if (this.textures.exists(key)) return key
    const [c0, r0, w, h] = PIECES[name]
    const rt = this.add.renderTexture(0, 0, w * 16, h * 16).setVisible(false)
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        // stamp() draws centred (proven RenderTexture path, see WorldScene).
        rt.stamp('tav_interior', (r0 + r) * 21 + (c0 + c), c * 16 + 8, r * 16 + 8)
      }
    }
    rt.saveTexture(key)
    rt.destroy()
    return key
  }

  private addPiece(name: keyof typeof PIECES, x: number, y: number, scale = 3, depth = 5) {
    return this.add.image(x, y, this.makePieceTexture(name)).setScale(scale).setDepth(depth)
  }

  /** Record a furniture collision footprint (centre x/y + size). */
  private addSolid(x: number, y: number, w: number, h: number) {
    this.solids.push({ x, y, w, h })
  }

  private buildInterior() {
    const { roomX, roomY, roomW, roomH } = this
    const cell = 48                 // 16px tile rendered at 3×
    const cx = roomX + roomW / 2
    // Thickness of the decorative wall band (top) and thin borders.
    this.wallBand = cell * 2         // two-tile-tall top wall (window band)

    // Backdrop behind the room (dark wood tone) so edges read as walls.
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x1c130c).setOrigin(0).setDepth(0)

    // ── Stone floor — random cobble tiles across the whole room at 3×. ─────────
    const floorRT = this.add.renderTexture(roomX, roomY, roomW, roomH).setOrigin(0).setDepth(1)
    let seed = 1337
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
    for (let y = 0; y < roomH; y += cell) {
      for (let x = 0; x < roomW; x += cell) {
        const f = FLOOR_FRAMES[Math.floor(rnd() * FLOOR_FRAMES.length)]
        floorRT.stamp('tav_walls', f, x + cell / 2, y + cell / 2, { scaleX: 3, scaleY: 3 })
      }
    }

    // ── Walls — thick windowed band along the top, thin stone borders L/R/bottom.
    const wallRT = this.add.renderTexture(roomX, roomY, roomW, roomH).setOrigin(0).setDepth(2)
    for (let x = 0; x < roomW; x += cell) {
      // Top band: a plain stone course capped by a row of arched windows.
      wallRT.stamp('tav_walls', WALL_FILL_FRAME,   x + cell / 2, cell / 2,            { scaleX: 3, scaleY: 3 })
      wallRT.stamp('tav_walls', WALL_WINDOW_FRAME, x + cell / 2, cell + cell / 2,     { scaleX: 3, scaleY: 3 })
      // Thin bottom border.
      wallRT.stamp('tav_walls', WALL_FILL_FRAME,   x + cell / 2, roomH - cell / 2,    { scaleX: 3, scaleY: 3 })
    }
    for (let y = 0; y < roomH; y += cell) {
      wallRT.stamp('tav_walls', WALL_SIDE_FRAME, cell / 2,         y + cell / 2, { scaleX: 3, scaleY: 3 })
      wallRT.stamp('tav_walls', WALL_SIDE_FRAME, roomW - cell / 2, y + cell / 2, { scaleX: 3, scaleY: 3 })
    }

    // Wooden ceiling beams across the top band for depth.
    const beams = this.add.graphics().setDepth(2)
    beams.fillStyle(0x4a2f1a, 0.55)
    for (let x = roomX + cell; x < roomX + roomW - cell; x += cell * 2) {
      beams.fillRect(x - 4, roomY + this.wallBand - 6, 8, roomH - this.wallBand)
    }

    // Convenience: a furniture depth that sorts by Y so lower pieces overlap
    // higher ones naturally (kept within the 5–18 furniture band).
    const dy = (y: number) => 5 + Math.min(12, Math.max(0, (y - roomY) / roomH) * 12)

    // ── The BAR along the back wall: bottle + wood shelves, a long counter the
    //    bartender works behind, and barrels stacked at the right end. ─────────
    const barShelfY = roomY + this.wallBand + 26
    this.addPiece('bottleShelf', roomX + 132, barShelfY,     3, 4)
    this.addPiece('woodShelf',   roomX + 264, barShelfY + 4, 3, 4)
    this.addPiece('kegStack',    roomX + 392, barShelfY + 4, 3, 4)
    // Barrels along the right end of the back bar — spaced apart (and clear of
    // the corner plant) so they read as two barrels, not one overlapping blob.
    this.addPiece('barrel', roomX + roomW - 316, barShelfY + 6,  3, 4)
    this.addPiece('barrel', roomX + roomW - 206, barShelfY + 34, 3, 5)

    const barCounterY = barShelfY + 104
    this.addPiece('barCounter', roomX + 160, barCounterY, 3, 7)
    this.addPiece('barCounter', roomX + 352, barCounterY, 3, 7)

    // The bartender — the only character in the room — works behind the counter,
    // drawn below the counter's depth so it overlaps the waist down.
    this.createBartender(roomX + 256, barCounterY - 6)

    // Stools lined up at the front of the bar.
    this.addPiece('chair', roomX + 150, barCounterY + 58, 3, 8)
    this.addPiece('chair', roomX + 256, barCounterY + 58, 3, 8)
    this.addPiece('chair', roomX + 362, barCounterY + 58, 3, 8)

    // ── A long communal table centred on a rug. ───────────────────────────────
    const midY = roomY + roomH * 0.56
    this.addPiece('rug', cx, midY + 12, 3.6, 4)
    this.addPiece('communalTable', cx, midY + 12, 2.7, dy(midY + 12))

    // ── Round tables with stools flanking BOTH side walls. ────────────────────
    const sideTop = roomY + this.wallBand + 252
    const sideBot = midY + 100
    for (const sx of [roomX + 116, roomX + roomW - 116]) {
      this.addPiece('roundTable', sx, sideTop, 3, dy(sideTop))
      this.addPiece('chair',      sx - 54, sideTop - 4, 3, dy(sideTop))
      this.addPiece('chair',      sx + 54, sideTop + 50, 3, dy(sideTop + 50))
      this.addPiece('roundTable', sx, sideBot, 3, dy(sideBot))
      this.addPiece('chair',      sx - 54, sideBot - 4, 3, dy(sideBot))
      this.addPiece('chair',      sx + 54, sideBot + 50, 3, dy(sideBot + 50))
    }

    // ── Cushioned booth nooks tucked into BOTH bottom corners (benches facing
    //    across a small round table). ──────────────────────────────────────────
    const boothY = roomY + roomH - 96
    this.addPiece('booth',      roomX + 108, boothY, 3, dy(boothY))
    this.addPiece('roundTable', roomX + 198, boothY + 6, 1.8, dy(boothY) + 0.3)
    this.addPiece('boothR',     roomX + 288, boothY, 3, dy(boothY))
    this.addPiece('booth',      roomX + roomW - 288, boothY, 3, dy(boothY))
    this.addPiece('roundTable', roomX + roomW - 198, boothY + 6, 1.8, dy(boothY) + 0.3)
    this.addPiece('boothR',     roomX + roomW - 108, boothY, 3, dy(boothY))

    // ── Potted plants: one sitting on the left end of the bar, one in the
    //    top-right corner. ──────────────────────────────────────────────────────
    this.addPiece('plant',     roomX + 96,         barCounterY - 46, 2.2, 9)
    this.addPiece('plantTall', roomX + roomW - 58, roomY + this.wallBand + 60, 3, 10)

    // ── Collision footprints — one per solid object, matched to what's drawn so
    //    the player bumps into the actual furniture (stools/chairs stay walkable).
    //    The bar (shelves + counter + the keeper's lane) is one solid block.
    this.solids = []
    this.addSolid(roomX + 256, roomY + this.wallBand + 101, 420, 202)   // the whole bar
    this.addSolid(cx, midY + 12, 150, 84)                               // communal table
    for (const sx of [roomX + 116, roomX + roomW - 116]) {              // side round tables
      this.addSolid(sx, sideTop, 96, 70)
      this.addSolid(sx, sideBot, 96, 70)
    }
    for (const bx of [roomX + 108, roomX + 288, roomX + roomW - 288, roomX + roomW - 108]) {
      this.addSolid(bx, boothY - 4, 72, 112)                            // booth benches
    }
    this.addSolid(roomX + 198,         boothY + 6, 56, 44)              // booth tables
    this.addSolid(roomX + roomW - 198, boothY + 6, 56, 44)
    this.addSolid(roomX + roomW - 316, barShelfY + 16, 64, 84)         // barrels
    this.addSolid(roomX + roomW - 206, barShelfY + 44, 64, 84)
    this.addSolid(roomX + roomW - 58,  roomY + this.wallBand + 75, 44, 60) // corner plant

    // ── Hanging lanterns over the bar + tables, and a warm amber wash. ────────
    this.addLantern(roomX + 200,        roomY + this.wallBand + 14)
    this.addLantern(roomX + 380,        roomY + this.wallBand + 14)
    this.addLantern(cx,                 midY - 80)
    this.addLantern(roomX + 116,        midY - 30)
    this.addLantern(roomX + roomW - 116, midY - 30)

    const glow = this.add.graphics().setDepth(12)
    glow.fillStyle(0xff9933, 0.06)
    glow.fillCircle(cx, roomY + roomH / 2, roomW * 0.6)
    glow.fillStyle(0xffcc66, 0.05)
    glow.fillCircle(roomX + 250, barShelfY + 70, 240)
    glow.fillStyle(0xffbb55, 0.04)
    glow.fillCircle(cx, midY, 200)

    // Title sign
    this.add.text(cx, roomY + 12, '🍺  The Prancing Lumen  🍺', {
      fontSize: '18px', fontFamily: 'Georgia, serif', color: '#ffd27f',
      backgroundColor: '#00000088', padding: { x: 10, y: 4 },
    }).setOrigin(0.5, 0).setDepth(15)
  }

  /** The bartender — the only character in the room — standing behind the bar.
   *  Drawn at depth 6 so the counter (depth 7) overlaps everything below the
   *  waist, leaving the head and shoulders visible above the bar. */
  private createBartender(x: number, y: number) {
    const key = 'npc_drinks'   // the CraftPix "drinks trader" reads as a barkeep
    if (this.textures.exists(key)) {
      const keeper = this.add.sprite(x, y, key, 0).setOrigin(0.5, 1).setScale(2.1).setDepth(6)
      if (this.anims.exists(`${key}_idle`)) {
        keeper.play(`${key}_idle`)
        keeper.anims.setProgress(Phaser.Math.FloatBetween(0, 1))
      }
    } else {
      // Fallback: a simple drawn figure if the sprite sheet is missing.
      const g = this.add.graphics().setDepth(6)
      g.fillStyle(0x6b4a2a, 1); g.fillRect(x - 11, y - 46, 22, 32)   // torso
      g.fillStyle(0xffe0b2, 1); g.fillCircle(x, y - 52, 9)           // head
    }
  }

  /** A small hanging lantern: a dark bracket with a warm glowing bulb. Drawn
   *  programmatically to avoid an uncertain sprite-sheet frame pick. */
  private addLantern(x: number, y: number) {
    const g = this.add.graphics().setDepth(13)
    g.lineStyle(2, 0x2a1c0e, 1)
    g.beginPath(); g.moveTo(x, y - 22); g.lineTo(x, y - 8); g.strokePath()
    g.fillStyle(0x3a2616, 1)
    g.fillRoundedRect(x - 7, y - 8, 14, 16, 3)       // lantern body
    g.fillStyle(0xffcc66, 0.95)
    g.fillRoundedRect(x - 4, y - 5, 8, 10, 2)        // warm pane
    // Soft glow.
    g.fillStyle(0xffaa33, 0.10)
    g.fillCircle(x, y, 34)
  }

  private buildExitButton() {
    const w = 96, h = 30
    const x = this.roomX + 8, y = this.roomY + 8
    const btn = this.add.graphics().setDepth(40).setScrollFactor(0)
    btn.fillStyle(0x3a1a1a, 0.95)
    btn.fillRoundedRect(x, y, w, h, 6)
    btn.lineStyle(1, 0xcc6666, 1)
    btn.strokeRoundedRect(x, y, w, h, 6)
    const label = this.add.text(x + w / 2, y + h / 2, '⟵ Exit (Esc)', {
      fontSize: '12px', fontFamily: 'Arial, sans-serif', color: '#ffbbbb',
    }).setOrigin(0.5).setDepth(41).setScrollFactor(0)
    label.setInteractive({ useHandCursor: true })
    label.on('pointerover', () => label.setColor('#ffffff'))
    label.on('pointerout', () => label.setColor('#ffbbbb'))
    label.on('pointerdown', () => this.leaveTavern())
  }

  // ── Multiplayer presence ────────────────────────────────────────────────────

  private setupMultiplayer() {
    this.socket = (window as typeof window & { __lumenSocket?: Socket }).__lumenSocket ?? null
    if (!this.socket) return

    const onZonePlayers = (data: { players: RosterEntry[] }) =>
      this.syncRemotePlayers(data?.players ?? [])
    const onJoined = (data: { zonePlayers: RosterEntry[] }) =>
      this.syncRemotePlayers(data?.zonePlayers ?? [])
    const onMoved = (data: { playerId: string; x: number; y: number }) => {
      const rp = this.remotePlayers.get(data.playerId)
      if (rp) { rp.tx = data.x; rp.ty = data.y }
    }

    this.socket.on('zone:players', onZonePlayers)
    this.socket.on('player:joined', onJoined)
    this.socket.on('player:moved', onMoved)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.socket?.off('zone:players', onZonePlayers)
      this.socket?.off('player:joined', onJoined)
      this.socket?.off('player:moved', onMoved)
    })

    // Enter the tavern zone and pull the current roster.
    this.socket.emit('player:move', {
      x: Math.round(this.player.x), y: Math.round(this.player.y), zone: 'tavern',
    })
    this.socket.emit('zone:get')
    this.lastSentX = this.player.x
    this.lastSentY = this.player.y
  }

  private syncRemotePlayers(players: RosterEntry[]) {
    const selfId = this.socket?.id
    const present = new Set<string>()

    for (const p of players) {
      if (!p?.id || p.id === selfId) continue
      present.add(p.id)

      const existing = this.remotePlayers.get(p.id)
      if (existing) {
        existing.tx = p.position.x
        existing.ty = p.position.y
        continue
      }

      const sprite = this.add.sprite(p.position.x, p.position.y, 'character_idle').setDepth(19)
      if (this.anims.exists('idle_down')) sprite.play('idle_down')

      const label = this.add.text(p.position.x, p.position.y - 34, p.username, {
        fontSize: '11px', fontFamily: 'Arial', color: '#aaddff',
        backgroundColor: '#00000088', padding: { x: 4, y: 1 },
      }).setOrigin(0.5, 1).setDepth(19)

      this.remotePlayers.set(p.id, { sprite, label, tx: p.position.x, ty: p.position.y, dir: 'down' })
    }

    for (const [id, rp] of this.remotePlayers) {
      if (!present.has(id)) {
        rp.sprite.destroy()
        rp.label.destroy()
        this.remotePlayers.delete(id)
      }
    }
  }

  // ── Chat ──────────────────────────────────────────────────────────────────

  private buildChatPanel() {
    const px = GAME_WIDTH - CHAT_W
    // Panel background
    const bg = this.add.graphics().setDepth(30).setScrollFactor(0)
    bg.fillStyle(0x140d08, 0.96)
    bg.fillRect(px, 0, CHAT_W, GAME_HEIGHT)
    bg.lineStyle(2, 0x6b4a2a, 1)
    bg.strokeRect(px + 1, 1, CHAT_W - 2, GAME_HEIGHT - 2)

    this.add.text(px + CHAT_W / 2, 16, 'Tavern Chat', {
      fontSize: '16px', fontFamily: 'Georgia, serif', color: '#ffd27f',
    }).setOrigin(0.5, 0).setDepth(31).setScrollFactor(0)

    // Scrolling message log (most recent at the bottom). Wrapped text grown
    // upward from just above the input box.
    this.chatText = this.add.text(px + 14, GAME_HEIGHT - 60, '', {
      fontSize: '13px', fontFamily: 'Arial, sans-serif', color: '#e8e0d4',
      wordWrap: { width: CHAT_W - 28 },
      lineSpacing: 3,
    }).setOrigin(0, 1).setDepth(31).setScrollFactor(0)

    // Input frame at the bottom (HTML <input> is positioned over this).
    const iy = GAME_HEIGHT - 44, ih = 32
    const inputBg = this.add.graphics().setDepth(31).setScrollFactor(0)
    inputBg.fillStyle(0x2a1d10, 1)
    inputBg.fillRoundedRect(px + 12, iy, CHAT_W - 24, ih, 6)
    inputBg.lineStyle(1, 0x6b4a2a, 1)
    inputBg.strokeRoundedRect(px + 12, iy, CHAT_W - 24, ih, 6)
  }

  /** Subscribe to chat:message and create the HTML input overlay. */
  private setupChat() {
    if (!this.socket) {
      this.appendSystem('(offline — chat unavailable)')
      return
    }

    const onChat = (data: { playerId?: string; username?: string; message?: string }) => {
      if (typeof data?.username !== 'string' || typeof data?.message !== 'string') return
      const mine = data.playerId === this.socket?.id
      this.appendMessage(data.username, data.message, mine)
    }
    this.socket.on('chat:message', onChat)
    this.socket.on('error', this.onChatError)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.socket?.off('chat:message', onChat)
      this.socket?.off('error', this.onChatError)
    })

    this.appendSystem('— entered the tavern —')
    this.buildChatInput()
  }

  private onChatError = (data: { message?: string }) => {
    // Surface server-side chat rejections (rate-limit, empty, too long) inline.
    if (typeof data?.message === 'string') this.appendSystem(`⚠ ${data.message}`)
  }

  private buildChatInput() {
    // Remove any stray prior input (e.g. orphaned by a dev HMR reload or a
    // recreated Phaser game) so exactly one overlay ever exists.
    document.getElementById(TavernScene.CHAT_INPUT_ID)?.remove()

    const input = document.createElement('input')
    input.id = TavernScene.CHAT_INPUT_ID
    input.type = 'text'
    input.placeholder = 'Say something…'
    input.maxLength = 200
    // `fixed` is viewport-relative, matching canvas.getBoundingClientRect() — an
    // `absolute` input is positioned relative to its offset-parent, which put it
    // off the visible field so it couldn't be clicked. pointerEvents:auto + a
    // high z-index ensure it sits clickable above the canvas.
    Object.assign(input.style, {
      position: 'fixed', zIndex: '1000', boxSizing: 'border-box', pointerEvents: 'auto',
      background: 'transparent', border: 'none', outline: 'none',
      color: '#ffffff', font: '13px Arial, sans-serif', padding: '0 10px', margin: '0',
    } as Partial<CSSStyleDeclaration>)
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.sendChat(input.value)
        input.value = ''
      } else if (e.key === 'Escape') {
        input.blur()
        this.leaveTavern()
      }
      // Don't let movement keys leak to Phaser while typing.
      e.stopPropagation()
    })
    // While the chat box has focus, fully disable Phaser's keyboard so it can't
    // capture/preventDefault the movement keys (W/A/S/D, arrows, space) — that
    // global capture was swallowing those characters before they reached the
    // input, which is why typing appeared to do nothing. Re-enable on blur.
    input.addEventListener('focus', () => {
      if (this.input.keyboard) this.input.keyboard.enabled = false
    })
    input.addEventListener('blur', () => {
      if (this.input.keyboard) this.input.keyboard.enabled = true
    })
    document.body.appendChild(input)   // fixed-positioned, so body is the right host
    this.chatInput = input
    this.positionChatInput()
  }

  private positionChatInput() {
    const input = this.chatInput
    if (!input) return
    const canvas = this.game.canvas
    const rect = canvas.getBoundingClientRect()
    const scaleX = rect.width / GAME_WIDTH
    const scaleY = rect.height / GAME_HEIGHT
    const px = GAME_WIDTH - CHAT_W + 12
    const py = GAME_HEIGHT - 44
    const w = CHAT_W - 24
    const h = 32
    // `fixed` positioning is viewport-relative, so use the rect directly (no
    // scroll offset).
    Object.assign(input.style, {
      left: `${rect.left + px * scaleX}px`,
      top: `${rect.top + py * scaleY}px`,
      width: `${w * scaleX}px`,
      height: `${h * scaleY}px`,
    } as Partial<CSSStyleDeclaration>)
  }

  /** Send a chat intent. The server owns the username + sanitisation; we only
   *  forward the raw text under the existing chat:message contract. */
  private sendChat(raw: string) {
    const text = raw.trim()
    if (!text || !this.socket) return
    this.socket.emit('chat:message', { message: text })
  }

  private appendMessage(username: string, message: string, mine: boolean) {
    this.chatLog.push({ username, message, mine })
    if (this.chatLog.length > 100) this.chatLog.shift()
    this.renderChat()
  }

  private appendSystem(message: string) {
    this.chatLog.push({ username: '', message, mine: false })
    if (this.chatLog.length > 100) this.chatLog.shift()
    this.renderChat()
  }

  /** Render the most recent messages as one wrapped text block. Phaser's Text
   *  can't colour spans, so the sender's own lines are prefixed with "You:". */
  private renderChat() {
    // Keep only the tail that comfortably fits the panel height.
    const tail = this.chatLog.slice(-22)
    const lines = tail.map((m) => {
      if (!m.username) return m.message            // system line
      const who = m.mine ? 'You' : m.username
      return `${who}: ${m.message}`
    })
    this.chatText.setText(lines.join('\n'))
  }

  // ── Exit ──────────────────────────────────────────────────────────────────

  private leaveTavern() {
    // Move back to the town zone at the tavern door before leaving.
    this.socket?.emit('player:move', {
      x: Math.round(this.returnX), y: Math.round(this.returnY), zone: 'town',
    })
    // WorldScene.create() relaunches UIScene itself, so we only start the world.
    this.scene.start('WorldScene', { spawnX: this.returnX, spawnY: this.returnY })
  }

  private cleanup() {
    this.remotePlayers.forEach((rp) => { rp.sprite.destroy(); rp.label.destroy() })
    this.remotePlayers.clear()
    this.chatInput?.remove()
    this.chatInput = null
    // Belt-and-suspenders: also clear any element left under the stable id.
    document.getElementById(TavernScene.CHAT_INPUT_ID)?.remove()
  }

  update() {
    this.player.update(this.cursors, this.wasd)

    // Keep the overlay input aligned (handles canvas resize / scroll).
    this.positionChatInput()

    // ESC leaves the tavern (unless the chat input has focus — handled there).
    if (Phaser.Input.Keyboard.JustDown(this.escKey) && document.activeElement !== this.chatInput) {
      this.leaveTavern()
      return
    }

    // Smooth remote players toward their reported positions + animate.
    this.remotePlayers.forEach((rp) => {
      const dx = rp.tx - rp.sprite.x
      const dy = rp.ty - rp.sprite.y
      rp.sprite.x = Phaser.Math.Linear(rp.sprite.x, rp.tx, 0.2)
      rp.sprite.y = Phaser.Math.Linear(rp.sprite.y, rp.ty, 0.2)
      rp.label.setPosition(rp.sprite.x, rp.sprite.y - 34)

      const moving = Math.abs(dx) > 1.5 || Math.abs(dy) > 1.5
      if (moving) {
        rp.dir = Math.abs(dy) >= Math.abs(dx)
          ? (dy > 0 ? 'down' : 'up')
          : (dx > 0 ? 'right' : 'left')
      }
      const animKey = moving ? `walk_${rp.dir}` : `idle_${rp.dir}`
      if (this.anims.exists(animKey) && rp.sprite.anims.currentAnim?.key !== animKey) {
        rp.sprite.play(animKey)
      }
    })

    // Report our own position (throttled to 10 Hz, only when we actually moved).
    if (this.socket && this.time.now - this.lastMoveSentAt > 100) {
      if (Math.abs(this.player.x - this.lastSentX) > 2 || Math.abs(this.player.y - this.lastSentY) > 2) {
        this.lastMoveSentAt = this.time.now
        this.lastSentX = this.player.x
        this.lastSentY = this.player.y
        this.socket.emit('player:move', {
          x: Math.round(this.player.x),
          y: Math.round(this.player.y),
          zone: 'tavern',
        })
      }
    }
  }
}
