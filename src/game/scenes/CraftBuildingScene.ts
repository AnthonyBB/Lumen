import Phaser from 'phaser'
import { GAME_WIDTH, GAME_HEIGHT } from '../constants'
import { Player } from '../objects/Player'
import type { CraftBuilding } from '../data/recipes'

type CursorKeys = Phaser.Types.Input.Keyboard.CursorKeys
type WASD = Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>

interface Theme {
  title: string
  /** Floor checker colours. */
  floor: number
  floorAlt: number
  /** Wall + trim colours. */
  wall: number
  wallTrim: number
  /** Warm/cool accent used for lighting + the workstation. */
  accent: number
  /** NPC texture key (loaded in BootScene) + display name + craft verb. */
  npcKey: string
  npcName: string
  /** Emoji decorations hung on the back wall. */
  wallProps: string[]
}

const THEMES: Record<CraftBuilding, Theme> = {
  forge: {
    title: '🔥  The Forge',
    floor: 0x2b231d, floorAlt: 0x322a22, wall: 0x1c1611, wallTrim: 0x3a2a1c,
    accent: 0xff7a30, npcKey: 'npc_citizen3', npcName: 'Brann the Blacksmith',
    wallProps: ['🗡️', '⚔️', '🔨', '🔱'],
  },
  armory: {
    title: '🛡️  The Armory',
    floor: 0x282b31, floorAlt: 0x2f323a, wall: 0x171a22, wallTrim: 0x2c313d,
    accent: 0x6fb7ff, npcKey: 'npc_citizen4', npcName: 'Sera the Armorer',
    wallProps: ['🛡️', '⛑️', '🧤', '🥾'],
  },
}

const WALL_BAND = 96 // top wall height
const BORDER = 28    // side/bottom stone border

/**
 * A walk-in crafting building. The player enters a themed interior (Forge or
 * Armory) and walks up to the resident smith; pressing E by the smith opens the
 * crafting screen (CraftScene). ESC / the Exit button returns to town.
 *
 * Launched as a full scene switch from WorldScene with { building, returnX,
 * returnY }, mirroring the Tavern.
 */
export class CraftBuildingScene extends Phaser.Scene {
  private building: CraftBuilding = 'forge'
  private theme: Theme = THEMES.forge
  private returnX = 0
  private returnY = 0

  private player!: Player
  private cursors!: CursorKeys
  private wasd!: WASD
  private eKey!: Phaser.Input.Keyboard.Key
  private escKey!: Phaser.Input.Keyboard.Key

  private npc!: Phaser.GameObjects.Sprite
  private npcRing!: Phaser.GameObjects.Graphics
  private prompt!: Phaser.GameObjects.Text

  constructor() {
    super({ key: 'CraftBuildingScene' })
  }

  init(data: { building?: CraftBuilding; returnX?: number; returnY?: number }) {
    this.building = data?.building ?? 'forge'
    this.theme = THEMES[this.building]
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
    this.escKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC)

    this.buildExitButton()

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
    const doorW = 120
    walls.fillStyle(0x000000, 1)
    walls.fillRect(GAME_WIDTH / 2 - doorW / 2, GAME_HEIGHT - BORDER, doorW, BORDER)
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

    if (this.building === 'forge') {
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
    } else {
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
    }

    // The smith — stands behind the bench, facing the player.
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

  private buildExitButton() {
    const w = 150, h = 38, x = 24, y = 24
    const btn = this.add.graphics().setDepth(40).setScrollFactor(0)
    btn.fillStyle(0x000000, 0.6); btn.fillRoundedRect(x, y, w, h, 8)
    btn.lineStyle(2, this.theme.accent, 1); btn.strokeRoundedRect(x, y, w, h, 8)
    const label = this.add.text(x + w / 2, y + h / 2, '⟵ Leave (Esc)', {
      fontSize: '15px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(41).setScrollFactor(0).setInteractive({ useHandCursor: true })
    label.on('pointerover', () => label.setColor('#ffd54f'))
    label.on('pointerout', () => label.setColor('#ffffff'))
    label.on('pointerdown', () => this.leave())
  }

  // ── Interaction ─────────────────────────────────────────────────────────────

  private nearSmith(): boolean {
    return Phaser.Math.Distance.Between(this.player.x, this.player.y, this.npc.x, this.npc.y) < 120
  }

  private openCraft() {
    this.player.setVelocity(0, 0)
    this.scene.pause()
    this.scene.launch('CraftScene', { building: this.building, parentScene: this.scene.key })
    // Scenes render in scene-list order; this interior is registered AFTER
    // CraftScene, so without this the craft UI would draw underneath the (paused
    // but still rendering) interior and look frozen. Force it to the top.
    this.scene.bringToTop('CraftScene')
  }

  private leave() {
    this.scene.start('WorldScene', { spawnX: this.returnX, spawnY: this.returnY })
  }

  update() {
    this.player.update(this.cursors, this.wasd)

    if (Phaser.Input.Keyboard.JustDown(this.escKey)) { this.leave(); return }

    const near = this.nearSmith()
    this.prompt.setVisible(near)
    this.npcRing.clear()
    if (near) {
      this.prompt.setText(`Press E to talk to ${this.theme.npcName}`)
      this.npcRing.lineStyle(3, this.theme.accent, 0.9)
      this.npcRing.strokeEllipse(this.npc.x, this.npc.y + 24, 70, 28)
      if (Phaser.Input.Keyboard.JustDown(this.eKey)) this.openCraft()
    }
  }
}
