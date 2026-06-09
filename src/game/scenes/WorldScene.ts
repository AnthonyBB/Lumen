import Phaser from 'phaser'
import { TILE_SIZE, WORLD_WIDTH, WORLD_HEIGHT, GAME_WIDTH, GAME_HEIGHT } from '../constants'
import { Player } from '../objects/Player'
import { Building } from '../objects/Building'

interface BuildingEntry {
  building: Building
  label: string
  x: number
  y: number
}

export class WorldScene extends Phaser.Scene {
  private player!: Player
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd!: { W: Phaser.Input.Keyboard.Key; A: Phaser.Input.Keyboard.Key; S: Phaser.Input.Keyboard.Key; D: Phaser.Input.Keyboard.Key }
  private buildings: BuildingEntry[] = []
  private eKey!:   Phaser.Input.Keyboard.Key
  private escKey!: Phaser.Input.Keyboard.Key
  private cKey!: Phaser.Input.Keyboard.Key
  private iKey!: Phaser.Input.Keyboard.Key
  private promptText!: Phaser.GameObjects.Text
  private popup!: Phaser.GameObjects.Container
  private popupOpen = false
  private characterOpen = false

  // Chest
  private chestPos = { x: 1280, y: 1220 }
  private nearChest = false

  constructor() {
    super({ key: 'WorldScene' })
  }

  create() {
    // ── Ground ───────────────────────────────────────────────────────────────
    // Use the tileset PNG as a tileSprite — the grass variants create natural
    // terrain variation.  tileScaleX/Y=4 makes each 16px tile render at 64px,
    // matching the game's TILE_SIZE constant.
    const ground = this.add.tileSprite(0, 0, WORLD_WIDTH, WORLD_HEIGHT, 'ground').setOrigin(0, 0)
    ground.setTileScale(4, 4)

    // ── Path (cobblestone road) ───────────────────────────────────────────────
    const centerX = WORLD_WIDTH / 2
    const centerY = WORLD_HEIGHT / 2
    const pathHalfW = 3  // tiles either side
    const pathHalfH = 3

    // Horizontal path
    for (let tx = 0; tx < WORLD_WIDTH / TILE_SIZE; tx++) {
      for (let ty = -pathHalfH; ty <= pathHalfH; ty++) {
        const px = tx * TILE_SIZE
        const py = centerY + ty * TILE_SIZE
        const p = this.add.tileSprite(px, py, TILE_SIZE, TILE_SIZE, 'path').setOrigin(0, 0)
        p.setTileScale(4, 4)
      }
    }

    // Vertical path
    for (let ty = 0; ty < WORLD_HEIGHT / TILE_SIZE; ty++) {
      for (let tx = -pathHalfW; tx <= pathHalfW; tx++) {
        const px = centerX + tx * TILE_SIZE
        const py = ty * TILE_SIZE
        const p = this.add.tileSprite(px, py, TILE_SIZE, TILE_SIZE, 'path').setOrigin(0, 0)
        p.setTileScale(4, 4)
      }
    }

    // ── Trees (keep SVG — no tree sprite in tileset pack) ────────────────────
    const treePositions = this.generateTreePositions(20)
    for (const [tx, ty] of treePositions) {
      this.add.image(tx + 16, ty + 44, 'shadow').setAlpha(0.5).setDepth(1)
      this.add.image(tx, ty, 'tree').setOrigin(0, 0).setDepth(2)
    }

    // ── Buildings ────────────────────────────────────────────────────────────
    // Sizes chosen to maintain each sprite's natural aspect ratio while being
    // large enough to fill the village area.
    //   house_purple: 128x128 → 192x192 (1.5x, square)
    //   house_3:      180x128 → 252x180 (1.4x, wide)
    //   house_2:      157x112 → 220x157 (1.4x, wide)
    const buildingDefs = [
      { label: 'Learning Center', x: 1050, y: 1100, w: 192, h: 192 },
      { label: 'Combat Training', x: 1510, y: 1100, w: 252, h: 180 },
      { label: 'Market',          x: 1280, y: 1420, w: 220, h: 157 },
    ]

    for (const def of buildingDefs) {
      const b = new Building(this, def.x, def.y, def.label, def.w, def.h)
      this.buildings.push({ building: b, label: def.label, x: def.x, y: def.y })
    }

    // ── Decorative world elements ─────────────────────────────────────────────

    // Well — replaces the programmatic fountain
    this.add.image(1280, 1285, 'well').setDepth(3).setScale(3)

    // Lamp posts — PNG sprites scaled 3x (46x62 source → ~138x186 display)
    for (const [lx, ly] of [[1100, 1180], [1460, 1180], [1100, 1350], [1460, 1350]] as [number, number][]) {
      this.add.image(lx, ly, 'lamppost').setDepth(3).setScale(2.5)
    }

    // Benches — 4 around the well
    for (const [bx, by] of [[1190, 1310], [1370, 1310], [1250, 1360], [1310, 1360]] as [number, number][]) {
      this.add.image(bx, by, 'bench').setDepth(3).setScale(3)
    }

    // Barrels near the Market
    for (const [bx, by] of [[1200, 1440], [1220, 1455], [1360, 1440], [1380, 1455]] as [number, number][]) {
      this.add.image(bx, by, 'barrel').setDepth(3).setScale(2.5)
    }

    // Signs on paths as direction markers
    this.add.image(1280, 1170, 'sign').setDepth(3).setScale(3)
    this.add.image(1150, 1280, 'sign').setDepth(3).setScale(3).setFlipX(true)

    // Rocks scattered around the edges of the village square
    for (const [rx, ry] of [
      [1010, 1220], [1550, 1220], [1010, 1380], [1550, 1380],
    ] as [number, number][]) {
      this.add.image(rx, ry, 'rock').setDepth(3).setScale(3)
    }

    // ── Chest — personal storage ──────────────────────────────────────────────
    this.add.image(this.chestPos.x, this.chestPos.y, 'chest').setDepth(4).setScale(2)

    this.add.text(this.chestPos.x, this.chestPos.y - 56, 'Chest', {
      fontSize: '13px',
      fontFamily: 'Arial, sans-serif',
      color: '#ffd700',
      backgroundColor: '#00000099',
      padding: { x: 6, y: 3 },
    }).setOrigin(0.5, 0.5).setDepth(5)

    // ── Player ────────────────────────────────────────────────────────────────
    this.player = new Player(this, WORLD_WIDTH / 2, WORLD_HEIGHT / 2)

    // Physics collisions between player and building colliders
    for (const entry of this.buildings) {
      this.physics.add.collider(this.player, entry.building.collider)
    }

    // ── Camera ────────────────────────────────────────────────────────────────
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT)
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1)
    this.cameras.main.setZoom(1)

    // World bounds
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT)

    // ── Input ─────────────────────────────────────────────────────────────────
    this.cursors = this.input.keyboard!.createCursorKeys()
    this.wasd = {
      W: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      S: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      D: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    }
    this.eKey   = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E)
    this.escKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC)
    this.cKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.C)
    this.iKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.I)

    // Proximity prompt (camera-fixed)
    this.promptText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 100, 'Press E to enter', {
      fontSize: '18px',
      fontFamily: 'Arial, sans-serif',
      color: '#ffffff',
      backgroundColor: '#00000099',
      padding: { x: 12, y: 6 },
    })
    this.promptText.setOrigin(0.5, 0.5)
    this.promptText.setScrollFactor(0)
    this.promptText.setDepth(50)
    this.promptText.setVisible(false)

    // Popup panel (camera-fixed)
    this.popup = this.createPopup()
    this.popup.setScrollFactor(0)
    this.popup.setDepth(100)
    this.popup.setVisible(false)

    // Launch UI scene in parallel
    this.scene.launch('UIScene')
  }

  private generateTreePositions(count: number): [number, number][] {
    const positions: [number, number][] = []
    const margin = 64
    const zones = [
      { xMin: margin, xMax: 400, yMin: margin, yMax: 400 },
      { xMin: WORLD_WIDTH - 400, xMax: WORLD_WIDTH - margin, yMin: margin, yMax: 400 },
      { xMin: margin, xMax: 400, yMin: WORLD_HEIGHT - 400, yMax: WORLD_HEIGHT - margin },
      { xMin: WORLD_WIDTH - 400, xMax: WORLD_WIDTH - margin, yMin: WORLD_HEIGHT - 400, yMax: WORLD_HEIGHT - margin },
      { xMin: margin, xMax: 400, yMin: 400, yMax: WORLD_HEIGHT - 400 },
      { xMin: WORLD_WIDTH - 400, xMax: WORLD_WIDTH - margin, yMin: 400, yMax: WORLD_HEIGHT - 400 },
    ]

    for (let i = 0; i < count; i++) {
      const zone = zones[i % zones.length]
      positions.push([
        Phaser.Math.Between(zone.xMin, zone.xMax),
        Phaser.Math.Between(zone.yMin, zone.yMax),
      ])
    }
    return positions
  }

  private createPopup(): Phaser.GameObjects.Container {
    const container = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2)

    const panelW = 400
    const panelH = 220

    const bg = this.add.graphics()
    bg.fillStyle(0x1a1a2e, 0.95)
    bg.fillRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, 12)
    bg.lineStyle(2, 0xffd700, 1)
    bg.strokeRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, 12)
    container.add(bg)

    const titleText = this.add.text(0, -panelH / 2 + 30, '', {
      fontSize: '22px',
      fontFamily: 'Arial, sans-serif',
      color: '#ffd700',
      fontStyle: 'bold',
    })
    titleText.setOrigin(0.5, 0.5)
    titleText.setName('title')
    container.add(titleText)

    const bodyText = this.add.text(0, 10, 'Coming soon!', {
      fontSize: '16px',
      fontFamily: 'Arial, sans-serif',
      color: '#cccccc',
    })
    bodyText.setOrigin(0.5, 0.5)
    container.add(bodyText)

    const closeHint = this.add.text(0, panelH / 2 - 24, 'Press E or Escape to close', {
      fontSize: '12px',
      fontFamily: 'Arial, sans-serif',
      color: '#888888',
    })
    closeHint.setOrigin(0.5, 0.5)
    container.add(closeHint)

    return container
  }

  private openPopup(label: string) {
    const titleText = this.popup.getByName('title') as Phaser.GameObjects.Text
    titleText.setText(label)
    this.popup.setVisible(true)
    this.popupOpen = true
  }

  private closePopup() {
    this.popup.setVisible(false)
    this.popupOpen = false
  }

  update() {
    // Open character screen with C key
    if (!this.popupOpen && !this.characterOpen && Phaser.Input.Keyboard.JustDown(this.cKey)) {
      this.characterOpen = true
      this.player.setVelocity(0, 0)
      this.scene.pause('WorldScene')
      this.scene.launch('CharacterScene')
      this.scene.get('CharacterScene').events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        this.characterOpen = false
      })
      return
    }

    if (!this.popupOpen) {
      this.player.update(this.cursors, this.wasd)
    } else {
      this.player.setVelocity(0, 0)
    }

    // Check proximity to buildings
    let nearBuilding: BuildingEntry | null = null
    for (const entry of this.buildings) {
      const dist = Phaser.Math.Distance.Between(
        this.player.x, this.player.y,
        entry.x, entry.y
      )
      if (dist < 120) {
        nearBuilding = entry
        break
      }
    }

    // Check proximity to chest
    const chestDist = Phaser.Math.Distance.Between(
      this.player.x, this.player.y,
      this.chestPos.x, this.chestPos.y
    )
    this.nearChest = chestDist < 80

    if (nearBuilding && !this.popupOpen) {
      this.promptText.setText('Press E to enter').setVisible(true)
      if (Phaser.Input.Keyboard.JustDown(this.eKey)) {
        if (nearBuilding.label === 'Learning Center') {
          this.scene.stop('UIScene')
          this.scene.start('ClassroomScene')
          return
        }
        this.openPopup(nearBuilding.label)
      }
    } else if (this.nearChest && !this.popupOpen) {
      this.promptText.setText('Press E to open chest').setVisible(true)
      if (Phaser.Input.Keyboard.JustDown(this.eKey)) {
        this.player.setVelocity(0, 0)
        this.scene.stop('UIScene')
        this.scene.start('ChestScene')
        return
      }
    } else {
      this.promptText.setVisible(false)
    }

    // Close popup
    if (this.popupOpen) {
      if (Phaser.Input.Keyboard.JustDown(this.eKey) || Phaser.Input.Keyboard.JustDown(this.escKey)) {
        this.closePopup()
      }
    }

    // I key — open Equipment screen
    if (!this.popupOpen && Phaser.Input.Keyboard.JustDown(this.iKey)) {
      this.player.setVelocity(0, 0)
      this.scene.pause()
      this.scene.launch('EquipmentScene')
    }
  }
}
