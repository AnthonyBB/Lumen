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

interface BiomeGate {
  name: string
  x: number
  y: number
  color: number
}

const BIOME_COLORS: Record<string, number> = {
  'Desert':              0xe8b84b,
  'Pine Forest':         0x1a5c2a,
  'Deciduous Forest':    0x4a8c3a,
  'Swamp':               0x2d4a1e,
  'Snow':                0xc8e8f8,
  'Grassland':           0x78c850,
  'Tropical Rainforest': 0x0d6e1e,
  'Ocean':               0x1a6eb5,
}

const BIOME_LOCATIONS: Record<string, [string, string, string]> = {
  'Desert':              ['Sandy Flats',    'Scorching Dunes', 'Cursed Sands'],
  'Pine Forest':         ['Mossy Clearing', 'Dense Pines',     'Ancient Grove'],
  'Deciduous Forest':    ['Sunlit Path',    'Tangled Wood',    'Gnarled Hollow'],
  'Swamp':               ['Murky Shallows', 'Boggy Depths',    'The Fetid Mire'],
  'Snow':                ['Frost Meadow',   'Frozen Pass',     'Glacial Abyss'],
  'Grassland':           ['Open Plains',    'Rolling Hills',   'Windswept Peaks'],
  'Tropical Rainforest': ['Forest Edge',    'Jungle Thicket',  'Heart of Darkness'],
  'Ocean':               ['Tidal Pools',    'Open Waters',     'The Deep Abyss'],
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
  private biomeMenuOpen = false
  private biomeMenuContainer: Phaser.GameObjects.Container | null = null

  // Chest
  private chestPos = { x: 1280, y: 1220 }
  private nearChest = false

  // Biome gates
  private biomeGates: BiomeGate[] = [
    { name: 'Desert',              x: 320,  y: 1280, color: BIOME_COLORS['Desert'] },
    { name: 'Ocean',               x: 2240, y: 1280, color: BIOME_COLORS['Ocean'] },
    { name: 'Snow',                x: 1280, y: 320,  color: BIOME_COLORS['Snow'] },
    { name: 'Swamp',               x: 1280, y: 2240, color: BIOME_COLORS['Swamp'] },
    { name: 'Pine Forest',         x: 640,  y: 640,  color: BIOME_COLORS['Pine Forest'] },
    { name: 'Deciduous Forest',    x: 1920, y: 640,  color: BIOME_COLORS['Deciduous Forest'] },
    { name: 'Grassland',           x: 640,  y: 1920, color: BIOME_COLORS['Grassland'] },
    { name: 'Tropical Rainforest', x: 1920, y: 1920, color: BIOME_COLORS['Tropical Rainforest'] },
  ]
  private nearBiomeGate: BiomeGate | null = null

  constructor() {
    super({ key: 'WorldScene' })
  }

  create() {
    // ── Ground ───────────────────────────────────────────────────────────────
    const ground = this.add.tileSprite(0, 0, WORLD_WIDTH, WORLD_HEIGHT, 'ground').setOrigin(0, 0)
    ground.setTileScale(4, 4)

    // ── Path (cobblestone road) ───────────────────────────────────────────────
    const centerX = WORLD_WIDTH / 2
    const centerY = WORLD_HEIGHT / 2
    const pathHalfW = 3  // tiles either side
    const pathHalfH = 3

    // Horizontal path — extends full world width (covers Desert at x=320 and Ocean at x=2240)
    for (let tx = 0; tx < WORLD_WIDTH / TILE_SIZE; tx++) {
      for (let ty = -pathHalfH; ty <= pathHalfH; ty++) {
        const px = tx * TILE_SIZE
        const py = centerY + ty * TILE_SIZE
        const p = this.add.tileSprite(px, py, TILE_SIZE, TILE_SIZE, 'path').setOrigin(0, 0)
        p.setTileScale(4, 4)
      }
    }

    // Vertical path — extends full world height (covers Snow at y=320 and Swamp at y=2240)
    for (let ty = 0; ty < WORLD_HEIGHT / TILE_SIZE; ty++) {
      for (let tx = -pathHalfW; tx <= pathHalfW; tx++) {
        const px = centerX + tx * TILE_SIZE
        const py = ty * TILE_SIZE
        const p = this.add.tileSprite(px, py, TILE_SIZE, TILE_SIZE, 'path').setOrigin(0, 0)
        p.setTileScale(4, 4)
      }
    }

    // ── Diagonal branch paths to corner biomes ────────────────────────────────
    // Each diagonal is 3 tiles wide and steps from the branch point to the biome entrance
    const diagonalBranches = [
      // NW: from (960,960) to (640,640) — Pine Forest
      { fromX: 960, fromY: 960, toX: 640, toY: 640 },
      // NE: from (1600,960) to (1920,640) — Deciduous Forest
      { fromX: 1600, fromY: 960, toX: 1920, toY: 640 },
      // SW: from (960,1600) to (640,1920) — Grassland
      { fromX: 960, fromY: 1600, toX: 640, toY: 1920 },
      // SE: from (1600,1600) to (1920,1920) — Tropical Rainforest
      { fromX: 1600, fromY: 1600, toX: 1920, toY: 1920 },
    ]

    for (const branch of diagonalBranches) {
      this.drawDiagonalPath(branch.fromX, branch.fromY, branch.toX, branch.toY)
    }

    // ── Trees ────────────────────────────────────────────────────────────────
    const treePositions = this.generateTreePositions(20)
    for (const [tx, ty] of treePositions) {
      this.add.image(tx + 16, ty + 44, 'shadow').setAlpha(0.5).setDepth(1)
      this.add.image(tx, ty, 'tree').setOrigin(0, 0).setDepth(2)
    }

    // ── Buildings ────────────────────────────────────────────────────────────
    const buildingDefs = [
      { label: 'Learning Center', x: 1050, y: 1100, w: 192, h: 192 },
      { label: 'Combat Training', x: 1510, y: 1100, w: 252, h: 180 },
      { label: 'Market',          x: 1280, y: 1420, w: 220, h: 157 },
      { label: 'Combat Strategy', x: 1510, y: 1420, w: 196, h: 196 },
    ]

    for (const def of buildingDefs) {
      const b = new Building(this, def.x, def.y, def.label, def.w, def.h)
      this.buildings.push({ building: b, label: def.label, x: def.x, y: def.y })
    }

    // ── Decorative world elements ─────────────────────────────────────────────
    this.add.image(1280, 1285, 'well').setDepth(3).setScale(3)

    for (const [lx, ly] of [[1100, 1180], [1460, 1180], [1100, 1350], [1460, 1350]] as [number, number][]) {
      this.add.image(lx, ly, 'lamppost').setDepth(3).setScale(2.5)
    }

    for (const [bx, by] of [[1190, 1310], [1370, 1310], [1250, 1360], [1310, 1360]] as [number, number][]) {
      this.add.image(bx, by, 'bench').setDepth(3).setScale(3)
    }

    for (const [bx, by] of [[1200, 1440], [1220, 1455], [1360, 1440], [1380, 1455]] as [number, number][]) {
      this.add.image(bx, by, 'barrel').setDepth(3).setScale(2.5)
    }

    this.add.image(1280, 1170, 'sign').setDepth(3).setScale(3)
    this.add.image(1150, 1280, 'sign').setDepth(3).setScale(3).setFlipX(true)

    for (const [rx, ry] of [
      [1010, 1220], [1550, 1220], [1010, 1380], [1550, 1380],
    ] as [number, number][]) {
      this.add.image(rx, ry, 'rock').setDepth(3).setScale(3)
    }

    // ── Chest ─────────────────────────────────────────────────────────────────
    this.add.image(this.chestPos.x, this.chestPos.y, 'chest').setDepth(4).setScale(2)

    this.add.text(this.chestPos.x, this.chestPos.y - 56, 'Chest', {
      fontSize: '13px',
      fontFamily: 'Arial, sans-serif',
      color: '#ffd700',
      backgroundColor: '#00000099',
      padding: { x: 6, y: 3 },
    }).setOrigin(0.5, 0.5).setDepth(5)

    // ── Biome entrance gates ──────────────────────────────────────────────────
    for (const gate of this.biomeGates) {
      this.drawBiomeGate(gate.x, gate.y, gate.name, gate.color)
    }

    // ── Player ────────────────────────────────────────────────────────────────
    this.player = new Player(this, WORLD_WIDTH / 2, WORLD_HEIGHT / 2)

    for (const entry of this.buildings) {
      this.physics.add.collider(this.player, entry.building.collider)
    }

    // ── Camera ────────────────────────────────────────────────────────────────
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT)
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1)
    this.cameras.main.setZoom(1)

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

    this.scene.launch('UIScene')
  }

  /** Draw a diagonal path (3 tiles wide) stepping from (fromX,fromY) to (toX,toY) */
  private drawDiagonalPath(fromX: number, fromY: number, toX: number, toY: number) {
    const dx = toX > fromX ? 1 : -1
    const dy = toY > fromY ? 1 : -1
    const steps = Math.abs(toX - fromX) / TILE_SIZE

    for (let s = 0; s <= steps; s++) {
      const cx = fromX + s * dx * TILE_SIZE
      const cy = fromY + s * dy * TILE_SIZE
      // Draw 3 tiles in the perpendicular diagonal direction
      for (let t = -1; t <= 1; t++) {
        // Offset perpendicular to the diagonal direction
        const ox = cx + t * dy * TILE_SIZE  // use dy as perpendicular x component
        const oy = cy + t * dx * TILE_SIZE  // use dx as perpendicular y component (negated effectively)
        const p = this.add.tileSprite(ox - TILE_SIZE / 2, oy - TILE_SIZE / 2, TILE_SIZE, TILE_SIZE, 'path').setOrigin(0, 0)
        p.setTileScale(4, 4)
      }
    }
  }

  /** Draw a biome entrance gate at world position (x,y) */
  private drawBiomeGate(x: number, y: number, name: string, color: number) {
    const g = this.add.graphics()
    g.setDepth(4)

    // Stone pillars (dark gray rectangles, 16×48)
    g.fillStyle(0x555566, 1)
    g.fillRect(x - 28, y - 40, 16, 48)
    g.fillRect(x + 12, y - 40, 16, 48)

    // Pillar highlights
    g.fillStyle(0x777788, 1)
    g.fillRect(x - 28, y - 40, 3, 48)
    g.fillRect(x + 12, y - 40, 3, 48)

    // Lintel (horizontal bar)
    g.fillStyle(0x555566, 1)
    g.fillRect(x - 32, y - 44, 64, 8)

    // Lintel highlight
    g.fillStyle(0x777788, 1)
    g.fillRect(x - 32, y - 44, 64, 2)

    // Banner / flag (small colored rectangle above arch)
    g.fillStyle(color, 1)
    g.fillRect(x - 12, y - 64, 24, 14)
    g.fillStyle(0x333344, 1)
    g.fillRect(x - 12, y - 66, 24, 3)

    // Glowing orb at center top of arch
    g.fillStyle(color, 0.8)
    g.fillCircle(x, y - 56, 6)
    // Orb inner highlight
    g.fillStyle(0xffffff, 0.4)
    g.fillCircle(x - 2, y - 58, 2)

    // Label underneath
    this.add.text(x, y + 16, name, {
      fontSize: '12px',
      fontFamily: 'Georgia, serif',
      color: '#ffd700',
      backgroundColor: '#00000099',
      padding: { x: 4, y: 2 },
    }).setOrigin(0.5, 0).setDepth(4)
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

  /** Open the biome selection menu (camera-fixed, depth 200) */
  openBiomeMenu(biomeName: string) {
    if (this.biomeMenuOpen) return
    this.biomeMenuOpen = true
    this.player.setVelocity(0, 0)

    const color = BIOME_COLORS[biomeName] ?? 0xffd700
    const locations = BIOME_LOCATIONS[biomeName] ?? ['Easy Area', 'Medium Area', 'Hard Area']

    const panelW = 420
    const panelH = 280
    const cx = GAME_WIDTH / 2
    const cy = GAME_HEIGHT / 2

    const container = this.add.container(cx, cy)
    container.setScrollFactor(0)
    container.setDepth(200)

    // Background panel
    const bg = this.add.graphics()
    bg.fillStyle(0x0a0a1a, 0.97)
    bg.fillRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, 14)
    bg.lineStyle(2, color, 1)
    bg.strokeRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, 14)
    container.add(bg)

    // Title
    const title = this.add.text(0, -panelH / 2 + 32, `⚔ Enter ${biomeName}`, {
      fontSize: '20px',
      fontFamily: 'Georgia, serif',
      color: '#ffd700',
      fontStyle: 'bold',
    })
    title.setOrigin(0.5, 0.5)
    container.add(title)

    // Divider
    const divider = this.add.graphics()
    divider.lineStyle(1, color, 0.5)
    divider.lineBetween(-panelW / 2 + 20, -panelH / 2 + 52, panelW / 2 - 20, -panelH / 2 + 52)
    container.add(divider)

    // Difficulty buttons
    const difficultyData = [
      { icon: '🌿', label: locations[0], difficulty: 'easy' as const,   emoji: 'Easy',   yOff: -60 },
      { icon: '🔥', label: locations[1], difficulty: 'medium' as const, emoji: 'Medium', yOff:   0 },
      { icon: '💀', label: locations[2], difficulty: 'hard' as const,   emoji: 'Hard',   yOff:  60 },
    ]

    for (const dd of difficultyData) {
      this.createBiomeButton(container, dd.icon, dd.label, dd.difficulty, biomeName, dd.yOff, color)
    }

    // Cancel button
    const cancelBg = this.add.graphics()
    const cancelY = panelH / 2 - 28
    cancelBg.fillStyle(0x2a0a0a, 1)
    cancelBg.fillRoundedRect(-60, cancelY - 14, 120, 26, 6)
    cancelBg.lineStyle(1, 0xaa3333, 1)
    cancelBg.strokeRoundedRect(-60, cancelY - 14, 120, 26, 6)
    container.add(cancelBg)

    const cancelText = this.add.text(0, cancelY, '✕ Cancel', {
      fontSize: '13px',
      fontFamily: 'Arial, sans-serif',
      color: '#cc6666',
    })
    cancelText.setOrigin(0.5, 0.5)
    cancelText.setInteractive({ useHandCursor: true })
    cancelText.on('pointerover', () => cancelText.setColor('#ff9999'))
    cancelText.on('pointerout',  () => cancelText.setColor('#cc6666'))
    cancelText.on('pointerdown', () => this.closeBiomeMenu())
    container.add(cancelText)

    this.biomeMenuContainer = container
  }

  private createBiomeButton(
    container: Phaser.GameObjects.Container,
    icon: string,
    locationName: string,
    difficulty: 'easy' | 'medium' | 'hard',
    biomeName: string,
    yOffset: number,
    borderColor: number
  ) {
    const bw = 340
    const bh = 44
    const by = yOffset - bh / 2

    const btnBg = this.add.graphics()
    btnBg.fillStyle(0x1a1a3a, 1)
    btnBg.fillRoundedRect(-bw / 2, by, bw, bh, 8)
    btnBg.lineStyle(1, borderColor, 0.7)
    btnBg.strokeRoundedRect(-bw / 2, by, bw, bh, 8)
    container.add(btnBg)

    const diffColors: Record<string, string> = { easy: '#88ff88', medium: '#ffcc44', hard: '#ff6666' }
    const diffColor = diffColors[difficulty]
    const diffLabel = difficulty.charAt(0).toUpperCase() + difficulty.slice(1)

    const btnText = this.add.text(-bw / 2 + 16, yOffset, `${icon} ${locationName}`, {
      fontSize: '15px',
      fontFamily: 'Georgia, serif',
      color: '#dddddd',
    })
    btnText.setOrigin(0, 0.5)
    container.add(btnText)

    const diffText = this.add.text(bw / 2 - 16, yOffset, `— ${diffLabel}`, {
      fontSize: '13px',
      fontFamily: 'Arial, sans-serif',
      color: diffColor,
    })
    diffText.setOrigin(1, 0.5)
    container.add(diffText)

    // Invisible hit area
    const hitZone = this.add.zone(-bw / 2, by, bw, bh).setOrigin(0, 0)
    hitZone.setInteractive({ useHandCursor: true })
    hitZone.on('pointerover', () => {
      btnBg.clear()
      btnBg.fillStyle(0x2a2a5a, 1)
      btnBg.fillRoundedRect(-bw / 2, by, bw, bh, 8)
      btnBg.lineStyle(2, borderColor, 1)
      btnBg.strokeRoundedRect(-bw / 2, by, bw, bh, 8)
    })
    hitZone.on('pointerout', () => {
      btnBg.clear()
      btnBg.fillStyle(0x1a1a3a, 1)
      btnBg.fillRoundedRect(-bw / 2, by, bw, bh, 8)
      btnBg.lineStyle(1, borderColor, 0.7)
      btnBg.strokeRoundedRect(-bw / 2, by, bw, bh, 8)
    })
    hitZone.on('pointerdown', () => {
      this.closeBiomeMenu()
      this.scene.stop('UIScene')
      this.scene.start('BiomeScene', { biome: biomeName, difficulty, location: locationName })
    })
    container.add(hitZone)
  }

  private closeBiomeMenu() {
    if (this.biomeMenuContainer) {
      this.biomeMenuContainer.destroy()
      this.biomeMenuContainer = null
    }
    this.biomeMenuOpen = false
  }

  update() {
    // Open character screen with C key
    if (!this.popupOpen && !this.characterOpen && !this.biomeMenuOpen && Phaser.Input.Keyboard.JustDown(this.cKey)) {
      this.characterOpen = true
      this.player.setVelocity(0, 0)
      this.scene.pause('WorldScene')
      this.scene.launch('CharacterScene')
      this.scene.get('CharacterScene').events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        this.characterOpen = false
      })
      return
    }

    if (!this.popupOpen && !this.biomeMenuOpen) {
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

    // Check proximity to biome gates
    this.nearBiomeGate = null
    for (const gate of this.biomeGates) {
      const dist = Phaser.Math.Distance.Between(
        this.player.x, this.player.y,
        gate.x, gate.y
      )
      if (dist < 80) {
        this.nearBiomeGate = gate
        break
      }
    }

    // Handle prompt display and E key interactions
    if (this.biomeMenuOpen) {
      this.promptText.setVisible(false)
      // ESC closes biome menu
      if (Phaser.Input.Keyboard.JustDown(this.escKey)) {
        this.closeBiomeMenu()
      }
    } else if (this.nearBiomeGate && !this.popupOpen) {
      this.promptText.setText(`Press E to enter ${this.nearBiomeGate.name}`).setVisible(true)
      if (Phaser.Input.Keyboard.JustDown(this.eKey)) {
        this.openBiomeMenu(this.nearBiomeGate.name)
      }
    } else if (nearBuilding && !this.popupOpen) {
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

    // Close building popup
    if (this.popupOpen) {
      if (Phaser.Input.Keyboard.JustDown(this.eKey) || Phaser.Input.Keyboard.JustDown(this.escKey)) {
        this.closePopup()
      }
    }

    // I key — open Equipment screen
    if (!this.popupOpen && !this.biomeMenuOpen && Phaser.Input.Keyboard.JustDown(this.iKey)) {
      this.player.setVelocity(0, 0)
      this.scene.pause()
      this.scene.launch('EquipmentScene')
    }
  }
}
