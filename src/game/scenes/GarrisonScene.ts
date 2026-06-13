import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT } from '../constants'
import { Player } from '../objects/Player'
import { Sfx } from '../systems/Sfx'
import { bindOverlayInputSuspension } from '../systems/overlayInput'
import type { Socket } from 'socket.io-client'

type CursorKeys = Phaser.Types.Input.Keyboard.CursorKeys
type WASD = Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>

/** Which view an NPC opens — each routes to its own React roster-panel view:
 *  'barracks' (recruit/manage), 'squads' (team builder), 'spoils' (the War Spoils
 *  Table — deploy teams + collect idle rewards). See docs/TEAMS_DESIGN.md §1/§5. */
type GarrisonView = 'barracks' | 'squads' | 'spoils'

interface NpcDef {
  /** Sprite key (loaded in BootScene via townNpcs). */
  key: string
  /** NPC display name. */
  name: string
  /** One-line role blurb under the name. */
  role: string
  /** Horizontal placement as a fraction of the room width. */
  fx: number
  /** Accent colour for the proximity ring + desk glow. */
  accent: number
  /** What pressing E by this NPC does. */
  view: GarrisonView
}

// The Garrison's three stations (see docs/TEAMS_DESIGN.md §1). Recruitment is
// merged into the Barracks Master — there is no separate Mercenary Guild.
const NPCS: NpcDef[] = [
  { key: 'npc_citizen1', name: 'Barracks Master', role: 'Recruit & manage heroes', fx: 0.24, accent: 0xffd54f, view: 'barracks' },
  { key: 'npc_citizen2', name: 'Squad Captain',   role: 'Build your squads',       fx: 0.50, accent: 0x6fb7ff, view: 'squads' },
  { key: 'npc_citizen4', name: 'Field Marshal',   role: 'Deploy teams · collect spoils', fx: 0.76, accent: 0xb39ddb, view: 'spoils' },
]

const WALL_BAND = 96 // top wall height
const BORDER = 28    // side/bottom stone border
const DOOR_W = 120   // door opening width (bottom-centre) — walk here + E to leave
const NPC_RANGE = 120

/**
 * The Garrison — a walk-in building housing the three team-management NPCs:
 * the Barracks Master (recruit + manage heroes), the Squad Captain (build
 * squads), and the Field Marshal (deploy teams to campaigns). The player walks
 * up to one and presses E. See docs/TEAMS_DESIGN.md §1.
 *
 * Launched as a full scene switch from WorldScene with { returnX, returnY },
 * mirroring the crafting buildings / Tavern. Each NPC opens its own view of the
 * React roster panel via a window event (Phaser can't toggle React state); the
 * Field Marshal's War Spoils Table credits owed idle battles on open and glows a
 * "spoils ready" badge on entry when rewards are waiting.
 */
export class GarrisonScene extends Phaser.Scene {
  private returnX = 0
  private returnY = 0

  private player!: Player
  private cursors!: CursorKeys
  private wasd!: WASD
  private eKey!: Phaser.Input.Keyboard.Key
  /** Guards against the same E press that entered the building immediately
   *  triggering the door-exit on the first frame. Set once E is released. */
  private eReleased = false

  private npcs: { def: NpcDef; sprite: Phaser.GameObjects.Sprite }[] = []
  private npcRing!: Phaser.GameObjects.Graphics
  private prompt!: Phaser.GameObjects.Text

  constructor() {
    super({ key: 'GarrisonScene' })
  }

  init(data: { returnX?: number; returnY?: number }) {
    this.returnX = data?.returnX ?? GAME_WIDTH / 2
    this.returnY = data?.returnY ?? GAME_HEIGHT / 2
    this.npcs = []
  }

  create() {
    this.buildInterior()

    // Player at the door (bottom-centre).
    this.player = new Player(this, GAME_WIDTH / 2, GAME_HEIGHT - BORDER - 60)
    this.player.setDepth(20)
    this.physics.world.setBounds(
      BORDER, WALL_BAND,
      GAME_WIDTH - BORDER * 2, GAME_HEIGHT - WALL_BAND - BORDER,
    )
    this.player.setCollideWorldBounds(true)
    this.cameras.main.setBounds(0, 0, GAME_WIDTH, GAME_HEIGHT)

    this.cursors = this.input.keyboard!.createCursorKeys()
    this.wasd = {
      W: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      S: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      D: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    }
    this.eKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E)
    this.eReleased = false

    // Suspend our keyboard while the React roster panel (with its recruit-name /
    // team-rename inputs) is open over the canvas, so typing isn't stolen and
    // E/WASD don't talk-to-NPC or move the player. Re-enabled on close/shutdown.
    bindOverlayInputSuspension(this)

    this.npcRing = this.add.graphics().setDepth(14)
    this.prompt = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - BORDER - 10, '', {
      fontSize: '17px', color: '#ffffff', fontStyle: 'bold',
      backgroundColor: '#000000aa', padding: { x: 10, y: 5 },
    }).setOrigin(0.5, 1).setDepth(41).setScrollFactor(0).setVisible(false)

    // "Spoils ready" badge: a one-shot peek (no timer) — if any deployed team has
    // idle battles owed, glow the Field Marshal so the player knows to collect.
    const socket = (window as typeof window & { __lumenSocket?: Socket }).__lumenSocket
    if (socket) {
      socket.once('deployments:peek_result', (d: { battlesOwed?: number }) => {
        if (this.scene.isActive() && (d?.battlesOwed ?? 0) > 0) this.showSpoilsReady()
      })
      socket.emit('deployments:peek')
    }
  }

  // ── Interior rendering ──────────────────────────────────────────────────────

  private buildInterior() {
    const floorA = 0x26242e, floorB = 0x2c2a36, wall = 0x16151c, wallTrim = 0x322d44

    // Checkerboard stone floor.
    const floor = this.add.graphics().setDepth(0)
    const tile = 64
    for (let y = WALL_BAND; y < GAME_HEIGHT; y += tile) {
      for (let x = 0; x < GAME_WIDTH; x += tile) {
        const alt = ((x / tile) + (y / tile)) % 2 === 0
        floor.fillStyle(alt ? floorA : floorB, 1)
        floor.fillRect(x, y, tile, tile)
      }
    }

    // Walls — thick top band + side/bottom borders.
    const walls = this.add.graphics().setDepth(2)
    walls.fillStyle(wall, 1)
    walls.fillRect(0, 0, GAME_WIDTH, WALL_BAND)
    walls.fillRect(0, 0, BORDER, GAME_HEIGHT)
    walls.fillRect(GAME_WIDTH - BORDER, 0, BORDER, GAME_HEIGHT)
    walls.fillRect(0, GAME_HEIGHT - BORDER, GAME_WIDTH, BORDER)
    walls.fillStyle(wallTrim, 1)
    walls.fillRect(0, WALL_BAND - 8, GAME_WIDTH, 8)

    // Door opening at the bottom-centre.
    walls.fillStyle(0x000000, 1)
    walls.fillRect(GAME_WIDTH / 2 - DOOR_W / 2, GAME_HEIGHT - BORDER, DOOR_W, BORDER)
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - BORDER - 2, '⟵ door', {
      fontSize: '12px', color: '#9e9e9e',
    }).setOrigin(0.5, 1).setDepth(3)

    // Title + crossed-banner motif on the back wall.
    this.add.text(GAME_WIDTH / 2, WALL_BAND / 2, '🏰  The Garrison', {
      fontSize: '30px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(3)

    this.buildStations()
  }

  /** A lit desk + banner for each NPC, the NPC standing behind it. */
  private buildStations() {
    const deskY = WALL_BAND + 170
    for (const def of NPCS) {
      const cx = Math.round(GAME_WIDTH * def.fx)

      // Pool of accent light on the floor.
      const glow = this.add.graphics().setDepth(1)
      glow.fillStyle(def.accent, 0.12)
      glow.fillCircle(cx, deskY + 18, 130)

      // Wall banner above the station.
      const banner = this.add.graphics().setDepth(3)
      banner.fillStyle(def.accent, 0.9)
      banner.fillRect(cx - 22, WALL_BAND - 2, 44, 30)
      banner.fillStyle(0x000000, 0.25)
      banner.fillTriangle(cx - 22, WALL_BAND + 28, cx + 22, WALL_BAND + 28, cx, WALL_BAND + 40)

      // Desk the NPC stands behind.
      const desk = this.add.graphics().setDepth(15)
      desk.fillStyle(0x2b2e36, 1)
      desk.fillRect(cx - 56, deskY + 6, 112, 18)
      desk.fillStyle(0x363a45, 1)
      desk.fillRect(cx - 56, deskY - 6, 112, 12)

      // NPC sprite + name + role.
      const sprite = this.add.sprite(cx, deskY - 40, def.key).setDepth(16).setScale(2)
      const anim = `${def.key}_idle`
      if (this.anims.exists(anim)) sprite.play(anim)
      this.add.text(cx, deskY - 92, def.name, {
        fontSize: '15px', color: '#ffe0b2', fontStyle: 'bold',
        backgroundColor: '#000000aa', padding: { x: 6, y: 3 },
      }).setOrigin(0.5).setDepth(17)
      this.add.text(cx, deskY - 70, def.role, {
        fontSize: '11px', color: '#c9c2e0',
      }).setOrigin(0.5).setDepth(17)

      this.npcs.push({ def, sprite })
    }
  }

  // ── Interaction ─────────────────────────────────────────────────────────────

  /** The NPC within range whose centre is closest to the player, or null. */
  private nearestNpc(): { def: NpcDef; sprite: Phaser.GameObjects.Sprite } | null {
    let best: { def: NpcDef; sprite: Phaser.GameObjects.Sprite } | null = null
    let bestD = NPC_RANGE
    for (const n of this.npcs) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, n.sprite.x, n.sprite.y)
      if (d < bestD) { bestD = d; best = n }
    }
    return best
  }

  /** True when the player is standing on the door opening (bottom-centre). */
  private nearDoor(): boolean {
    return this.player.y > GAME_HEIGHT - BORDER - 80 &&
      Math.abs(this.player.x - GAME_WIDTH / 2) < DOOR_W / 2 + 24
  }

  private talkTo(def: NpcDef) {
    this.player.setVelocity(0, 0)
    Sfx.play('menu')
    // All three NPCs open the React roster panel; the `view` hint routes to the
    // right tab (Barracks / Squads / War Spoils).
    window.dispatchEvent(new CustomEvent('lumen:open-roster', {
      detail: { view: def.view, recruit: false },
    }))
  }

  /** Glow the Field Marshal when deployed teams have spoils waiting (TEAMS §5). */
  private showSpoilsReady() {
    const marshal = this.npcs.find((n) => n.def.view === 'spoils')
    if (!marshal) return
    const badge = this.add.text(marshal.sprite.x, marshal.sprite.y - 110, '✦ Spoils ready!', {
      fontSize: '13px', color: '#ffd54f', fontStyle: 'bold',
      backgroundColor: '#000000cc', padding: { x: 8, y: 4 },
    }).setOrigin(0.5).setDepth(30)
    this.tweens.add({
      targets: badge, alpha: { from: 1, to: 0.5 },
      duration: 800, yoyo: true, repeat: -1, ease: 'Sine.inOut',
    })
  }

  private leave() {
    // WorldScene.create() relaunches UIScene itself (mirrors CraftBuildingScene).
    this.scene.start('WorldScene', { spawnX: this.returnX, spawnY: this.returnY })
  }

  update() {
    this.player.update(this.cursors, this.wasd)

    // The E that entered the building is often still held on the first frames —
    // wait for a release before E can talk/leave, so we don't instantly exit.
    if (this.eKey.isUp) this.eReleased = true
    const ePressed = this.eReleased && Phaser.Input.Keyboard.JustDown(this.eKey)

    const near = this.nearestNpc()
    const onDoor = !near && this.nearDoor()
    this.npcRing.clear()

    if (near) {
      this.prompt.setText(`Press E to talk to ${near.def.name}`).setVisible(true)
      this.npcRing.lineStyle(3, near.def.accent, 0.9)
      this.npcRing.strokeEllipse(near.sprite.x, near.sprite.y + 24, 70, 28)
      if (ePressed) this.talkTo(near.def)
    } else if (onDoor) {
      this.prompt.setText('Press E to leave').setVisible(true)
      if (ePressed) { this.leave(); return }
    } else {
      this.prompt.setVisible(false)
    }
  }
}
