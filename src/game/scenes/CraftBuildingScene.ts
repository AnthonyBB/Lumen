import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT } from '../constants'
import { Player } from '../objects/Player'
import type { CraftBuilding } from '../data/recipes'

type CursorKeys = Phaser.Types.Input.Keyboard.CursorKeys
type WASD = Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>

/** Buildings that use this walk-in interior (craft buildings + service shops). */
export type InteriorId = CraftBuilding | 'combat_training' | 'combat_strategy'

/** Which workstation centrepiece the room draws. */
type Station = 'anvil' | 'armorBench' | 'cauldron' | 'dummy'

interface BuildingDef {
  title: string
  /** Floor checker colours. */
  floor: number
  floorAlt: number
  /** Wall + trim colours. */
  wall: number
  wallTrim: number
  /** Warm/cool accent used for lighting + the workstation. */
  accent: number
  /** NPC texture key (loaded in BootScene) + display name. */
  npcKey: string
  npcName: string
  /** Emoji decorations hung on the back wall. */
  wallProps: string[]
  /** Centrepiece drawn for this building. */
  station: Station
  /** Scene the NPC opens (overlay), plus any data to pass it. */
  open: { scene: string; data?: Record<string, unknown> }
}

const DEFS: Record<InteriorId, BuildingDef> = {
  forge: {
    title: '🔥  The Forge',
    floor: 0x2b231d, floorAlt: 0x322a22, wall: 0x1c1611, wallTrim: 0x3a2a1c,
    accent: 0xff7a30, npcKey: 'npc_citizen3', npcName: 'Brann the Blacksmith',
    wallProps: ['🗡️', '⚔️', '🔨', '🔱'],
    station: 'anvil', open: { scene: 'CraftScene', data: { building: 'forge' } },
  },
  armory: {
    title: '🛡️  The Armory',
    floor: 0x282b31, floorAlt: 0x2f323a, wall: 0x171a22, wallTrim: 0x2c313d,
    accent: 0x6fb7ff, npcKey: 'npc_citizen4', npcName: 'Sera the Armorer',
    wallProps: ['🛡️', '⛑️', '🧤', '🥾'],
    station: 'armorBench', open: { scene: 'CraftScene', data: { building: 'armory' } },
  },
  alchemy: {
    title: '⚗️  The Alchemy Lab',
    floor: 0x1e2922, floorAlt: 0x24302a, wall: 0x132019, wallTrim: 0x274a38,
    accent: 0x66ffb0, npcKey: 'npc_citizen5', npcName: 'Mira the Alchemist',
    wallProps: ['❤️', '🔷', '💧', '🌿'],
    station: 'cauldron', open: { scene: 'CraftScene', data: { building: 'alchemy' } },
  },
  combat_training: {
    title: '⚔️  Combat Training',
    floor: 0x2a2622, floorAlt: 0x312d28, wall: 0x1a1714, wallTrim: 0x3a3128,
    accent: 0xffb74d, npcKey: 'npc_citizen1', npcName: 'Captain Doran',
    wallProps: ['⚔️', '🛡️', '🏹', '🎯'],
    station: 'dummy', open: { scene: 'SkillShopScene' },
  },
  combat_strategy: {
    title: '📜  Combat Strategy',
    floor: 0x26242e, floorAlt: 0x2c2a36, wall: 0x16151c, wallTrim: 0x322d44,
    accent: 0xb39ddb, npcKey: 'npc_citizen2', npcName: 'Tactician Vael',
    wallProps: ['📜', '🗺️', '🎯', '⚔️'],
    station: 'dummy', open: { scene: 'StrategyScene' },
  },
}

const WALL_BAND = 96 // top wall height
const BORDER = 28    // side/bottom stone border
const DOOR_W = 120   // door opening width (bottom-centre) — walk here + E to leave

/**
 * A walk-in service building. The player enters a themed interior and walks up
 * to the resident NPC; pressing E by them opens that building's screen (crafting
 * for the smiths, the skill shop for the combat trainer). ESC / the Exit button
 * returns to town.
 *
 * Launched as a full scene switch from WorldScene with { building, returnX,
 * returnY }, mirroring the Tavern. The opened overlay is told to resume this
 * scene on close (parentScene).
 */
export class CraftBuildingScene extends Phaser.Scene {
  private building: InteriorId = 'forge'
  private theme: BuildingDef = DEFS.forge
  private returnX = 0
  private returnY = 0

  private player!: Player
  private cursors!: CursorKeys
  private wasd!: WASD
  private eKey!: Phaser.Input.Keyboard.Key
  /** Guards against the same E press that entered the house immediately
   *  triggering the door-exit on the first frame. Set once E is released. */
  private eReleased = false

  private npc!: Phaser.GameObjects.Sprite
  private npcRing!: Phaser.GameObjects.Graphics
  private prompt!: Phaser.GameObjects.Text

  constructor() {
    super({ key: 'CraftBuildingScene' })
  }

  init(data: { building?: InteriorId; returnX?: number; returnY?: number }) {
    this.building = data?.building ?? 'forge'
    this.theme = DEFS[this.building]
    this.returnX = data?.returnX ?? GAME_WIDTH / 2
    this.returnY = data?.returnY ?? GAME_HEIGHT / 2
  }

  create() {
    this.buildInterior()

    // ── Player at the door (bottom-centre) ──────────────────────────────────
    this.player = new Player(this, GAME_WIDTH / 2, GAME_HEIGHT - BORDER - 60)
    this.player.setDepth(20)
    this.physics.world.setBounds(
      BORDER, WALL_BAND,
      GAME_WIDTH - BORDER * 2, GAME_HEIGHT - WALL_BAND - BORDER,
    )
    this.player.setCollideWorldBounds(true)

    // Workstation (anvil / bench) is solid; the NPC stands just behind it.
    const benchY = WALL_BAND + 150
    this.addSolid(GAME_WIDTH / 2, benchY + 26, 150, 46)

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

    // The interaction prompt (hidden until near the smith).
    this.prompt = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - BORDER - 10, '', {
      fontSize: '17px', color: '#ffffff', fontStyle: 'bold',
      backgroundColor: '#000000aa', padding: { x: 10, y: 5 },
    }).setOrigin(0.5, 1).setDepth(41).setScrollFactor(0).setVisible(false)
  }

  // ── Interior rendering ──────────────────────────────────────────────────────

  private buildInterior() {
    const t = this.theme

    // Checkerboard stone floor.
    const floor = this.add.graphics().setDepth(0)
    const tile = 64
    for (let y = WALL_BAND; y < GAME_HEIGHT; y += tile) {
      for (let x = 0; x < GAME_WIDTH; x += tile) {
        const alt = ((x / tile) + (y / tile)) % 2 === 0
        floor.fillStyle(alt ? t.floor : t.floorAlt, 1)
        floor.fillRect(x, y, tile, tile)
      }
    }

    // Walls — thick top band + side/bottom borders.
    const walls = this.add.graphics().setDepth(2)
    walls.fillStyle(t.wall, 1)
    walls.fillRect(0, 0, GAME_WIDTH, WALL_BAND)
    walls.fillRect(0, 0, BORDER, GAME_HEIGHT)
    walls.fillRect(GAME_WIDTH - BORDER, 0, BORDER, GAME_HEIGHT)
    walls.fillRect(0, GAME_HEIGHT - BORDER, GAME_WIDTH, BORDER)
    walls.fillStyle(t.wallTrim, 1)
    walls.fillRect(0, WALL_BAND - 8, GAME_WIDTH, 8) // trim under the top wall

    // Door opening at the bottom-centre.
    walls.fillStyle(0x000000, 1)
    walls.fillRect(GAME_WIDTH / 2 - DOOR_W / 2, GAME_HEIGHT - BORDER, DOOR_W, BORDER)
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - BORDER - 2, '⟵ door', {
      fontSize: '12px', color: '#9e9e9e',
    }).setOrigin(0.5, 1).setDepth(3)

    // Title on the back wall.
    this.add.text(GAME_WIDTH / 2, WALL_BAND / 2, t.title, {
      fontSize: '30px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(3)

    // Wall props (hung gear) spaced along the back wall.
    t.wallProps.forEach((emoji, i) => {
      const x = GAME_WIDTH * (0.16 + 0.68 * (i / (t.wallProps.length - 1)))
      this.add.text(x, WALL_BAND - 34, emoji, { fontSize: '30px' }).setOrigin(0.5).setDepth(3)
    })

    this.buildWorkstation()
  }

  /** The lit workstation the smith stands at (anvil + forge glow / armor bench). */
  private buildWorkstation() {
    const t = this.theme
    const cx = GAME_WIDTH / 2
    const benchY = WALL_BAND + 150

    // Warm/cool pool of light on the floor around the station.
    const glow = this.add.graphics().setDepth(1)
    glow.fillStyle(t.accent, 0.12)
    glow.fillCircle(cx, benchY + 20, 170)

    if (this.theme.station === 'anvil') {
      // Furnace set into the back wall with a pulsing fire.
      const furnace = this.add.graphics().setDepth(3)
      furnace.fillStyle(0x120a06, 1)
      furnace.fillRoundedRect(cx - 60, WALL_BAND - 4, 120, 70, 8)
      const fire = this.add.ellipse(cx, WALL_BAND + 34, 70, 44, t.accent, 0.9).setDepth(4)
      this.tweens.add({
        targets: fire, scaleX: 1.15, scaleY: 1.3, alpha: 0.6,
        duration: 650, yoyo: true, repeat: -1, ease: 'Sine.inOut',
      })
      this.add.text(cx, WALL_BAND + 34, '🔥', { fontSize: '34px' }).setOrigin(0.5).setDepth(5)

      // Anvil.
      const anvil = this.add.graphics().setDepth(15)
      anvil.fillStyle(0x2b2b30, 1)
      anvil.fillRect(cx - 46, benchY + 6, 92, 16)         // base
      anvil.fillRect(cx - 18, benchY - 10, 36, 18)        // waist
      anvil.fillStyle(0x3a3a42, 1)
      anvil.fillRect(cx - 56, benchY - 26, 112, 18)       // face + horn
    } else if (this.theme.station === 'armorBench') {
      // Armor bench + weapon rack on the back wall.
      const rack = this.add.graphics().setDepth(3)
      rack.fillStyle(0x14161d, 1)
      rack.fillRoundedRect(cx - 70, WALL_BAND - 2, 140, 26, 6)
      this.add.text(cx, WALL_BAND + 10, '⚔️ 🛡️ ⚔️', { fontSize: '20px' }).setOrigin(0.5).setDepth(4)

      // Two armor stands flanking the bench.
      for (const dx of [-150, 150]) {
        this.add.text(cx + dx, benchY - 6, '🛡️', { fontSize: '40px' }).setOrigin(0.5).setDepth(15)
      }
      const bench = this.add.graphics().setDepth(15)
      bench.fillStyle(0x2b2e36, 1)
      bench.fillRect(cx - 60, benchY + 4, 120, 18)
      bench.fillStyle(0x363a45, 1)
      bench.fillRect(cx - 60, benchY - 8, 120, 12)
    } else if (this.theme.station === 'cauldron') {
      // Shelves of reagents on the back wall.
      const shelf = this.add.graphics().setDepth(3)
      shelf.fillStyle(0x122019, 1)
      shelf.fillRoundedRect(cx - 90, WALL_BAND - 2, 180, 24, 5)
      this.add.text(cx, WALL_BAND + 10, '🧫 🌿 🍄 🌱', { fontSize: '18px' }).setOrigin(0.5).setDepth(4)

      // A bubbling cauldron on a stand.
      const stand = this.add.graphics().setDepth(15)
      stand.fillStyle(0x101512, 1)
      stand.fillRect(cx - 44, benchY + 4, 88, 22)          // cauldron body
      stand.fillStyle(0x2a221a, 1)
      stand.fillRect(cx - 24, benchY + 26, 48, 14)         // legs/base
      const brew = this.add.ellipse(cx, benchY + 4, 78, 24, t.accent, 0.85).setDepth(16)
      this.tweens.add({
        targets: brew, scaleX: 1.1, scaleY: 1.3, alpha: 0.5,
        duration: 800, yoyo: true, repeat: -1, ease: 'Sine.inOut',
      })
      // Rising bubbles.
      for (const dx of [-14, 6, 18]) {
        const b = this.add.text(cx + dx, benchY, '∘', { fontSize: '16px', color: '#dfffe9' }).setOrigin(0.5).setDepth(17)
        this.tweens.add({ targets: b, y: benchY - 26, alpha: 0, duration: 1400, repeat: -1, delay: (dx + 14) * 80, ease: 'Sine.out' })
      }
    } else {
      // Combat training: a weapon rack on the wall + a straw training dummy.
      const rack = this.add.graphics().setDepth(3)
      rack.fillStyle(0x1d1813, 1)
      rack.fillRoundedRect(cx - 80, WALL_BAND - 2, 160, 24, 5)
      this.add.text(cx, WALL_BAND + 10, '⚔️ 🏹 🛡️', { fontSize: '18px' }).setOrigin(0.5).setDepth(4)

      // Target dummies flanking the trainer.
      for (const dx of [-160, 160]) {
        this.add.text(cx + dx, benchY - 4, '🎯', { fontSize: '34px' }).setOrigin(0.5).setDepth(15)
      }
      // A straw practice dummy (post + cross-arm + sack head).
      const dummy = this.add.graphics().setDepth(15)
      dummy.fillStyle(0x6b4f2a, 1)
      dummy.fillRect(cx - 6, benchY - 30, 12, 60)           // post
      dummy.fillRect(cx - 34, benchY - 18, 68, 10)          // arms
      dummy.fillStyle(0xc9a25a, 1)
      dummy.fillCircle(cx, benchY - 34, 14)                 // straw head
    }

    // The smith / alchemist — stands behind the station, facing the player.
    this.npcRing = this.add.graphics().setDepth(14)
    this.npc = this.add.sprite(cx, benchY - 40, this.theme.npcKey).setDepth(16).setScale(2)
    const anim = `${this.theme.npcKey}_idle`
    if (this.anims.exists(anim)) this.npc.play(anim)
    this.add.text(cx, benchY - 92, this.theme.npcName, {
      fontSize: '14px', color: '#ffe0b2', fontStyle: 'bold',
      backgroundColor: '#000000aa', padding: { x: 6, y: 3 },
    }).setOrigin(0.5).setDepth(17)
  }

  private addSolid(x: number, y: number, w: number, h: number) {
    const z = this.add.zone(x, y, w, h)
    this.physics.add.existing(z, true)
    this.physics.add.collider(this.player, z)
  }

  // ── Interaction ─────────────────────────────────────────────────────────────

  private nearSmith(): boolean {
    return Phaser.Math.Distance.Between(this.player.x, this.player.y, this.npc.x, this.npc.y) < 120
  }

  /** True when the player is standing on the door opening (bottom-centre). */
  private nearDoor(): boolean {
    return this.player.y > GAME_HEIGHT - BORDER - 80 &&
      Math.abs(this.player.x - GAME_WIDTH / 2) < DOOR_W / 2 + 24
  }

  private openShop() {
    this.player.setVelocity(0, 0)
    this.scene.pause()
    const { scene, data } = this.theme.open
    this.scene.launch(scene, { ...(data ?? {}), parentScene: this.scene.key })
    // Scenes render in scene-list order and this interior may be registered AFTER
    // the overlay, so without this the overlay could draw underneath the (paused
    // but still rendering) interior and look frozen. Force it to the top.
    this.scene.bringToTop(scene)
  }

  private leave() {
    this.scene.start('WorldScene', { spawnX: this.returnX, spawnY: this.returnY })
  }

  update() {
    this.player.update(this.cursors, this.wasd)

    // The E that entered the house is often still held on the first frames —
    // wait for a release before E can talk/leave, so we don't instantly exit.
    if (this.eKey.isUp) this.eReleased = true
    const ePressed = this.eReleased && Phaser.Input.Keyboard.JustDown(this.eKey)

    const nearSmith = this.nearSmith()
    const nearDoor = !nearSmith && this.nearDoor()
    this.npcRing.clear()

    if (nearSmith) {
      this.prompt.setText(`Press E to talk to ${this.theme.npcName}`).setVisible(true)
      this.npcRing.lineStyle(3, this.theme.accent, 0.9)
      this.npcRing.strokeEllipse(this.npc.x, this.npc.y + 24, 70, 28)
      if (ePressed) this.openShop()
    } else if (nearDoor) {
      this.prompt.setText('Press E to leave').setVisible(true)
      if (ePressed) { this.leave(); return }
    } else {
      this.prompt.setVisible(false)
    }
  }
}
