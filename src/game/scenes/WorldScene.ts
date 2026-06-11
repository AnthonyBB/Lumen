import Phaser from 'phaser'
import type { Socket } from 'socket.io-client'
import { TILE_SIZE, WORLD_WIDTH, WORLD_HEIGHT, GAME_WIDTH, GAME_HEIGHT } from '../constants'
import { Player } from '../objects/Player'
import { Building } from '../objects/Building'
import { CP_GRASS, CP_GRASS2, CP_DIRT, CPD_BLADES, CPD_SPECKS, CPD_PEBBLES } from '../data/tileFrames'

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

  // Spawn position — set via init() when returning from a biome, otherwise world centre
  private spawnX = WORLD_WIDTH / 2
  private spawnY = WORLD_HEIGHT / 2

  // ── Multiplayer presence ──────────────────────────────────────────────────
  // Other players in the shared 'town' zone, rendered from server pushes only.
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

  constructor() {
    super({ key: 'WorldScene' })
  }

  init(data?: { spawnX?: number; spawnY?: number }) {
    this.spawnX = data?.spawnX ?? WORLD_WIDTH / 2
    this.spawnY = data?.spawnY ?? WORLD_HEIGHT / 2
  }

  create() {
    // ── Ground (CraftPix grassland) ──────────────────────────────────────────
    // Solid backstop fill in the CraftPix grass tone, then the real tiles.
    const groundFill = this.add.graphics()
    groundFill.fillStyle(0x9cba5f, 1)
    groundFill.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT)
    groundFill.setDepth(0)

    // Grass: 16px tiles stamped at 4× (64px cells) onto one RenderTexture,
    // then textured with small decals from the Details sheet — the fill tiles
    // are deliberately flat; the pack's own demo map gets its grassy look the
    // same way (flat fill + dense decal scatter).
    {
      const groundRT = this.add.renderTexture(0, 0, WORLD_WIDTH, WORLD_HEIGHT).setOrigin(0)
      groundRT.setDepth(0)
      const tileW = 64
      const rand = this.rng(99)
      const scale = { scaleX: 4, scaleY: 4 }
      for (let ty = 0; ty < WORLD_HEIGHT; ty += tileW) {
        for (let tx = 0; tx < WORLD_WIDTH; tx += tileW) {
          const frame = rand() < 0.9 ? CP_GRASS : CP_GRASS2
          groundRT.stamp('cp_ground', frame, tx + tileW / 2, ty + tileW / 2, scale)
        }
      }

      // Texture decals — at most one per 64px cell. ONLY the single-tile
      // decal rows are safe here: the sheet's mounds/bushes/flowers are
      // multi-tile clusters, and stamping one 16px slice of them renders
      // visibly cut-off chunks. Flowers/tufts are placed as complete
      // standalone PNG props below instead.
      const decals = [
        { frames: CPD_BLADES, chance: 0.30 },
        { frames: CPD_SPECKS, chance: 0.12 },
      ]
      for (let ty = 0; ty < WORLD_HEIGHT; ty += tileW) {
        for (let tx = 0; tx < WORLD_WIDTH; tx += tileW) {
          for (const d of decals) {
            if (rand() < d.chance) {
              const frame = d.frames[Math.floor(rand() * d.frames.length)]
              const jx = tx + 16 + rand() * (tileW - 32)
              const jy = ty + 16 + rand() * (tileW - 32)
              groundRT.stamp('cp_details', frame, jx, jy, scale)
              break
            }
          }
        }
      }
    }

    // ── Flower/tuft props (complete standalone sprites, never clipped) ────────
    {
      const rand = this.rng(7)
      const cX = WORLD_WIDTH / 2
      const cY = WORLD_HEIGHT / 2
      // Keep props off the trail corridors: the two main roads run along the
      // world center lines (wander ≤ ±2 tiles + half ribbon ≈ 112px) and the
      // four diagonal branches connect fixed points (see diagonalBranches).
      const diags: [number, number, number, number][] = [
        [960, 960, 640, 640], [1600, 960, 1920, 640],
        [960, 1600, 640, 1920], [1600, 1600, 1920, 1920],
      ]
      const nearTrail = (x: number, y: number): boolean => {
        if (Math.abs(y - cY) < 140 || Math.abs(x - cX) < 140) return true
        for (const [x1, y1, x2, y2] of diags) {
          const dx = x2 - x1
          const dy = y2 - y1
          const t = Phaser.Math.Clamp(((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy), 0, 1)
          if (Math.hypot(x - (x1 + dx * t), y - (y1 + dy * t)) < 140) return true
        }
        return false
      }

      let placed = 0
      let attempts = 0
      while (placed < 70 && attempts < 700) {
        attempts++
        const x = 60 + rand() * (WORLD_WIDTH - 120)
        const y = 60 + rand() * (WORLD_HEIGHT - 120)
        if (nearTrail(x, y)) continue
        if (rand() < 0.6) {
          this.add.image(x, y, `cp_flower${1 + Math.floor(rand() * 6)}`).setScale(3).setDepth(1)
        } else {
          this.add.image(x, y, `cp_tuft${1 + Math.floor(rand() * 2)}`).setScale(2).setDepth(1)
        }
        placed++
      }
    }

    // ── Trails (blob-brush ribbons) ───────────────────────────────────────────
    // The atlas ships a rounded 3×3 dirt blob (48px, fringed rim, transparent
    // outside). Stamping it densely along a smoothly-interpolated centerline
    // merges the blobs into one organic ribbon — later interiors overdraw
    // earlier rims, so fringe survives only on the OUTSIDE edge. This is how
    // the pack's demo map gets its winding trails; per-cell autotiling of the
    // same set leaves notches at staircase steps.
    const groundTex = this.textures.get('cp_ground')
    if (!groundTex.has('trail_blob')) {
      groundTex.add('trail_blob', 0, 8 * 16, 7 * 16, 48, 48)  // atlas cols 8-10, rows 7-9
    }
    const trailRT = this.add.renderTexture(0, 0, WORLD_WIDTH, WORLD_HEIGHT).setOrigin(0)
    trailRT.setDepth(1)

    const centerY = WORLD_HEIGHT / 2
    const centerX = WORLD_WIDTH / 2

    // Horizontal winding trail (Desert ↔ Ocean)
    {
      const rand = this.rng(42)
      // Gentle wander (±2 tiles over long 16-cell segments) — higher
      // amplitudes read as wobbly "intestines" rather than a country road
      const offsets = this.buildWindingOffsets(WORLD_WIDTH / TILE_SIZE + 1, 2, 16, rand)
      for (let i = 36; i <= 44; i++) offsets[i] = 0   // straight through town
      this.stampTrail(trailRT, (t) => {
        const px = t * WORLD_WIDTH
        const i = Math.min(offsets.length - 2, Math.floor(px / TILE_SIZE))
        const frac = px / TILE_SIZE - i
        const yOff = offsets[i] + (offsets[i + 1] - offsets[i]) * frac
        return { x: px, y: centerY + yOff * TILE_SIZE + TILE_SIZE / 2 }
      })
    }

    // Vertical winding trail (Snow ↔ Swamp)
    {
      const rand = this.rng(137)
      const offsets = this.buildWindingOffsets(WORLD_HEIGHT / TILE_SIZE + 1, 2, 16, rand)
      for (let i = 36; i <= 44; i++) offsets[i] = 0
      this.stampTrail(trailRT, (t) => {
        const py = t * WORLD_HEIGHT
        const i = Math.min(offsets.length - 2, Math.floor(py / TILE_SIZE))
        const frac = py / TILE_SIZE - i
        const xOff = offsets[i] + (offsets[i + 1] - offsets[i]) * frac
        return { x: centerX + xOff * TILE_SIZE + TILE_SIZE / 2, y: py }
      })
    }

    // Diagonal branch trails to the corner biomes (with perpendicular wander)
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
    for (const b of diagonalBranches) {
      const rand = this.rng(b.fromX ^ (b.fromY << 8))
      const steps = Math.abs(b.toX - b.fromX) / TILE_SIZE
      const offsets = this.buildWindingOffsets(steps + 1, 1, 12, rand)
      const perpX = -Math.sign(b.toY - b.fromY)
      const perpY = Math.sign(b.toX - b.fromX)
      this.stampTrail(trailRT, (t) => {
        const s = t * steps
        const i = Math.min(offsets.length - 2, Math.floor(s))
        const frac = s - i
        const wander = (offsets[i] + (offsets[i + 1] - offsets[i]) * frac) * TILE_SIZE
        return {
          x: b.fromX + (b.toX - b.fromX) * t + perpX * wander,
          y: b.fromY + (b.toY - b.fromY) * t + perpY * wander,
        }
      })
    }

    // ── Trees (CraftPix grassland + forest — full sprites, shadows baked in) ──
    const TREE_KEYS = [
      'cp_tree1', 'cp_tree2', 'cp_tree3', 'cp_tree4',
      'cp_ftree1', 'cp_ftree2', 'cp_ftree3', 'cp_ftree5', 'cp_ftree6', 'cp_ftree11',
    ]
    const treePositions = this.generateTreePositions(26)
    treePositions.forEach(([tx, ty], i) => {
      this.add.image(tx, ty, TREE_KEYS[i % TREE_KEYS.length]).setScale(1.5).setDepth(2)
    })

    // Woodland accents: stones, mushrooms, and two ruin landmarks
    this.add.image(430, 980, 'cp_ruin1').setScale(1.5).setDepth(2)
    this.add.image(2140, 1690, 'cp_ruin2').setScale(1.5).setDepth(2)
    this.add.image(820, 1560, 'cp_mushroom_red').setScale(1.5).setDepth(2)
    this.add.image(1730, 820, 'cp_mushroom_brown').setScale(1.5).setDepth(2)
    this.add.image(960, 700, 'cp_stone1').setDepth(2)
    this.add.image(1640, 1840, 'cp_stone2').setDepth(2)

    // ── Buildings ────────────────────────────────────────────────────────────
    const buildingDefs = [
      { label: 'Learning Center', x: 1050, y: 1100, w: 192, h: 192 },
      { label: 'Combat Training', x: 1510, y: 1100, w: 252, h: 180 },
      { label: 'Market',          x: 1050, y: 1420, w: 220, h: 157 },
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

    for (const [bx, by] of [[1200, 1440], [1220, 1455], [1360, 1440], [1380, 1455]] as [number, number][]) {
      this.add.image(bx, by, 'barrel').setDepth(3).setScale(2.5)
    }

    this.add.image(1280, 1170, 'sign').setDepth(3).setScale(3)

    // Bushes framing the town square (CraftPix, 64px sprites at native size)
    ;([
      [1010, 1220, 'cp_bush1'], [1550, 1220, 'cp_bush2'],
      [1010, 1380, 'cp_bush3'], [1550, 1380, 'cp_bush4'],
    ] as [number, number, string][]).forEach(([rx, ry, key]) => {
      this.add.image(rx, ry, key).setDepth(3)
    })

    // ── Chest ─────────────────────────────────────────────────────────────────
    // Treasure chest sprite is 200×160; ~0.6× renders it ~120px wide.
    this.add.image(this.chestPos.x, this.chestPos.y, 'chest').setDepth(4).setScale(0.6)

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

    // ── Stone accents around each biome gate (CraftPix) ──────────────────────
    this.biomeGates.forEach((gate, i) => {
      this.add.image(gate.x - 56, gate.y + 8, i % 2 === 0 ? 'cp_stone1' : 'cp_stone2').setDepth(3)
      this.add.image(gate.x + 56, gate.y + 8, i % 2 === 0 ? 'cp_stone2' : 'cp_stone1').setDepth(3)
    })

    // ── Benches near the town square ──────────────────────────────────────────
    const benchPositions: [number, number][] = [
      [1100, 1250], [1460, 1250], [1130, 1390], [1430, 1390],
    ]
    for (const [bx, by] of benchPositions) {
      this.add.image(bx, by, 'bench').setScale(2.5).setDepth(3)
    }

    // ── Player ────────────────────────────────────────────────────────────────
    this.player = new Player(this, this.spawnX, this.spawnY)

    for (const entry of this.buildings) {
      this.physics.add.collider(this.player, entry.building.collider)
    }

    // ── Multiplayer: see and be seen by other players in town ───────────────
    this.setupMultiplayer()

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

  // ── Multiplayer presence ────────────────────────────────────────────────────

  /**
   * Subscribe to server presence pushes and request the current town roster.
   * SECURITY: remote players are rendered exclusively from server events
   * (zone:players / player:moved); the client only reports its own position.
   */
  private setupMultiplayer() {
    this.socket = (window as typeof window & { __lumenSocket?: Socket }).__lumenSocket ?? null
    if (!this.socket) return

    interface RosterEntry { id: string; username: string; position: { x: number; y: number } }

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
      this.remotePlayers.forEach(rp => { rp.sprite.destroy(); rp.label.destroy() })
      this.remotePlayers.clear()
    })

    // The join ack fired before this scene existed — fetch the roster now,
    // and report our real spawn position so others see us where we stand.
    this.socket.emit('zone:get')
    this.socket.emit('player:move', {
      x: Math.round(this.player.x), y: Math.round(this.player.y), zone: 'town',
    })
    this.lastSentX = this.player.x
    this.lastSentY = this.player.y
  }

  /** Reconcile rendered remote players against a server roster snapshot. */
  private syncRemotePlayers(players: { id: string; username: string; position: { x: number; y: number } }[]) {
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

      const sprite = this.add.sprite(p.position.x, p.position.y, 'character_idle')
        .setDepth(9)
      if (this.anims.exists('idle_down')) sprite.play('idle_down')

      const label = this.add.text(p.position.x, p.position.y - 34, p.username, {
        fontSize: '11px', fontFamily: 'Arial', color: '#aaddff',
        backgroundColor: '#00000088', padding: { x: 4, y: 1 },
      }).setOrigin(0.5, 1).setDepth(9)

      this.remotePlayers.set(p.id, { sprite, label, tx: p.position.x, ty: p.position.y, dir: 'down' })
    }

    // Remove players no longer in the zone
    for (const [id, rp] of this.remotePlayers) {
      if (!present.has(id)) {
        rp.sprite.destroy()
        rp.label.destroy()
        this.remotePlayers.delete(id)
      }
    }
  }

  /** Stamp a trail along a parametric centerline (t: 0→1) in four passes:
   *  1. the fringed 48px blob every 8px — overlapping blobs fuse into a
   *     ribbon, but each blob's rim also braids over its neighbours;
   *  2. the solid dirt tile across the ribbon INTERIOR (3 stamps perpendicular
   *     to the tangent), erasing the braiding so the fringe survives only on
   *     the outside edge;
   *  3. pebble/dirt-clod decals scattered over the interior so the dirt reads
   *     as textured ground rather than a flat brown stripe;
   *  4. grass-blade decals straddling both edges, so the dirt/grass boundary
   *     is softened with overhanging grass like the pack's demo map (rather
   *     than a hard rim). All verified against a rendered simulation. */
  private stampTrail(
    rt: Phaser.GameObjects.RenderTexture,
    centerline: (t: number) => { x: number; y: number },
  ) {
    // Estimate length from a coarse pass so step density stays uniform
    let length = 0
    let prev = centerline(0)
    for (let i = 1; i <= 32; i++) {
      const p = centerline(i / 32)
      length += Math.hypot(p.x - prev.x, p.y - prev.y)
      prev = p
    }
    // Blobs at 1× (≈48px) every 8px give a skinny footpath like the demo map;
    // step finely so the smaller blobs still overlap into a continuous ribbon.
    const steps = Math.max(8, Math.ceil(length / 8))
    const scale = { scaleX: 1, scaleY: 1 }

    for (let i = 0; i <= steps; i++) {
      const p = centerline(i / steps)
      rt.stamp('cp_ground', 'trail_blob', p.x, p.y, scale)
    }

    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const p = centerline(t)
      const ahead = centerline(Math.min(1, t + 0.01))
      const dx = ahead.x - p.x
      const dy = ahead.y - p.y
      const len = Math.max(1, Math.hypot(dx, dy))
      const nx = -dy / len
      const ny = dx / len
      for (const o of [-8, 0, 8]) {
        rt.stamp('cp_ground', CP_DIRT, p.x + nx * o, p.y + ny * o, scale)
      }
    }

    // Pass 3: pebble texture scattered across the dirt interior (±9px of center)
    const pebbleRand = this.rng(steps * 17 + 3)
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const p = centerline(t)
      const ahead = centerline(Math.min(1, t + 0.01))
      const dx = ahead.x - p.x
      const dy = ahead.y - p.y
      const len = Math.max(1, Math.hypot(dx, dy))
      const nx = -dy / len
      const ny = dx / len
      if (pebbleRand() < 0.3) {
        const o = (pebbleRand() - 0.5) * 18
        const frame = CPD_PEBBLES[Math.floor(pebbleRand() * CPD_PEBBLES.length)]
        rt.stamp('cp_details', frame, p.x + nx * o, p.y + ny * o, scale)
      }
    }

    // Pass 4: grassy overgrowth straddling both edges (~20px out from center)
    const edgeRand = this.rng(steps * 31 + 7)
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const p = centerline(t)
      const ahead = centerline(Math.min(1, t + 0.01))
      const dx = ahead.x - p.x
      const dy = ahead.y - p.y
      const len = Math.max(1, Math.hypot(dx, dy))
      const nx = -dy / len
      const ny = dx / len
      for (const side of [-1, 1]) {
        if (edgeRand() < 0.6) {
          const o = side * (16 + edgeRand() * 8)
          const frame = CPD_BLADES[Math.floor(edgeRand() * CPD_BLADES.length)]
          rt.stamp('cp_details', frame, p.x + nx * o, p.y + ny * o, { scaleX: 2, scaleY: 2 })
        }
      }
    }
  }

  /** Tiny seeded RNG (LCG) — returns a function that yields values in [0, 1). */
  private rng(seed: number): () => number {
    let s = seed >>> 0
    return () => {
      s = (((s * 1664525 + 1013904223) | 0) >>> 0)
      return s / 0x100000000
    }
  }

  /** True when the player is within `range` px of world position (x, y). */
  private playerIsNear(x: number, y: number, range: number): boolean {
    return Phaser.Math.Distance.Between(this.player.x, this.player.y, x, y) < range
  }

  /**
   * Returns an array of tile-unit offsets (one per tile along the path axis).
   * Offsets start and end at 0, stay within [-maxOff, +maxOff], and change
   * smoothly (cosine-interpolated between waypoints spaced waypointEvery tiles).
   */
  private buildWindingOffsets(
    totalTiles: number,
    maxOff: number,
    waypointEvery: number,
    rand: () => number,
  ): number[] {
    // Place waypoints; first and last are pinned to 0
    const numWP = Math.ceil(totalTiles / waypointEvery) + 1
    const wp: number[] = [0]
    for (let i = 1; i < numWP - 1; i++) {
      const prev = wp[i - 1]
      const step = (rand() - 0.5) * maxOff * 1.5
      wp.push(Math.round(Math.max(-maxOff, Math.min(maxOff, prev + step))))
    }
    wp.push(0)

    // Cosine-interpolate to per-tile resolution
    const offsets: number[] = []
    for (let t = 0; t < totalTiles; t++) {
      const pos = (t / (totalTiles - 1)) * (numWP - 1)
      const i   = Math.min(Math.floor(pos), numWP - 2)
      const mu  = pos - i
      const cos = (1 - Math.cos(mu * Math.PI)) / 2  // smooth step
      offsets.push(Math.round(wp[i] * (1 - cos) + wp[i + 1] * cos))
    }
    return offsets
  }

  /** Draw a biome entrance portal at world position (x,y) — an animated
   *  magical vortex in the biome's color that reads as "step in to travel". */
  private drawBiomeGate(x: number, y: number, name: string, color: number) {
    // Stone platform base grounding the portal
    const base = this.add.graphics().setDepth(3)
    base.fillStyle(0x4a4a55, 1)
    base.fillEllipse(x, y + 8, 76, 22)
    base.fillStyle(0x5d5d6a, 1)
    base.fillEllipse(x, y + 5, 76, 22)
    base.fillStyle(0x44444f, 1)
    base.fillEllipse(x, y + 5, 58, 15)

    // Soft colored halo behind the vortex
    const halo = this.add.graphics().setDepth(4)
    for (let i = 4; i >= 1; i--) {
      halo.fillStyle(color, 0.05 * i)
      halo.fillEllipse(x, y - 32, 30 + i * 14, 60 + i * 16)
    }

    // The vortex: nested ellipses, bright rim → deep center
    const vortex = this.add.graphics().setDepth(5)
    vortex.fillStyle(color, 0.95)
    vortex.fillEllipse(0, 0, 44, 72)
    vortex.fillStyle(0xffffff, 0.55)
    vortex.fillEllipse(0, 0, 34, 58)
    vortex.fillStyle(color, 0.9)
    vortex.fillEllipse(0, 0, 26, 46)
    vortex.fillStyle(0x16162a, 0.85)
    vortex.fillEllipse(0, 0, 14, 28)
    vortex.setPosition(x, y - 32)

    // Slow breathing pulse on the vortex
    this.tweens.add({
      targets: vortex,
      scaleX: 1.12, scaleY: 1.06,
      duration: 1400,
      yoyo: true, repeat: -1,
      ease: 'Sine.easeInOut',
    })
    // Halo pulses opposite for shimmer
    this.tweens.add({
      targets: halo,
      alpha: 0.55,
      duration: 1400,
      yoyo: true, repeat: -1,
      ease: 'Sine.easeInOut',
    })

    // Rising sparkles around the portal mouth
    for (let i = 0; i < 5; i++) {
      const sp = this.add.graphics().setDepth(6)
      sp.fillStyle(0xffffff, 0.9)
      sp.fillCircle(0, 0, 2)
      sp.fillStyle(color, 0.6)
      sp.fillCircle(0, 0, 4)
      const sx = x + (i - 2) * 12 + (i % 2 === 0 ? 4 : -4)
      sp.setPosition(sx, y - 8)
      sp.setAlpha(0)
      this.tweens.add({
        targets: sp,
        y: y - 76,
        alpha: { from: 0.9, to: 0 },
        duration: 1800,
        delay: i * 360,
        repeat: -1,
        ease: 'Sine.easeOut',
        onRepeat: () => { sp.setPosition(sx, y - 8) },
      })
    }

    // Label underneath
    this.add.text(x, y + 20, name, {
      fontSize: '12px',
      fontFamily: 'Georgia, serif',
      color: '#ffd700',
      backgroundColor: '#00000099',
      padding: { x: 4, y: 2 },
    }).setOrigin(0.5, 0).setDepth(6)
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

    // Rejection sampling with a minimum spacing — the tree sprites are
    // 128-192px wide, so anything closer than ~190px visibly stacks.
    const rand = this.rng(3131)
    let attempts = 0
    while (positions.length < count && attempts < count * 40) {
      attempts++
      const zone = zones[attempts % zones.length]
      const x = zone.xMin + rand() * (zone.xMax - zone.xMin)
      const y = zone.yMin + rand() * (zone.yMax - zone.yMin)
      if (positions.some(([px, py]) => Math.hypot(px - x, py - y) < 190)) continue
      positions.push([x, y])
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
    const cam = this.cameras.main
    const cx = cam.scrollX + GAME_WIDTH / 2
    const cy = cam.scrollY + GAME_HEIGHT / 2

    const container = this.add.container(cx, cy)
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
      this.scene.start('BiomeScene', {
        biome: biomeName,
        difficulty,
        location: locationName,
        returnX: this.player.x,
        returnY: this.player.y,
      })
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

    // ── Multiplayer: smooth remote players toward their reported positions,
    //    deriving facing + walk/idle animation from the movement delta ───────
    this.remotePlayers.forEach(rp => {
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

    // ── Multiplayer: report our own position (throttled to 10 Hz, only when
    //    we actually moved — the server validates and rebroadcasts) ──────────
    if (this.socket && this.time.now - this.lastMoveSentAt > 100) {
      if (Math.abs(this.player.x - this.lastSentX) > 2 || Math.abs(this.player.y - this.lastSentY) > 2) {
        this.lastMoveSentAt = this.time.now
        this.lastSentX = this.player.x
        this.lastSentY = this.player.y
        this.socket.emit('player:move', {
          x: Math.round(this.player.x),
          y: Math.round(this.player.y),
          zone: 'town',
        })
      }
    }

    // Check proximity to buildings, chest, and biome gates
    const nearBuilding =
      this.buildings.find(entry => this.playerIsNear(entry.x, entry.y, 120)) ?? null

    this.nearChest = this.playerIsNear(this.chestPos.x, this.chestPos.y, 80)

    this.nearBiomeGate =
      this.biomeGates.find(gate => this.playerIsNear(gate.x, gate.y, 80)) ?? null

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
        if (nearBuilding.label === 'Combat Strategy') {
          this.player.setVelocity(0, 0)
          this.scene.pause('WorldScene')
          this.scene.launch('StrategyScene')
          return
        }
        if (nearBuilding.label === 'Combat Training') {
          this.player.setVelocity(0, 0)
          this.scene.pause('WorldScene')
          this.scene.launch('SkillShopScene')
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
