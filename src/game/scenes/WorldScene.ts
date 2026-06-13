import Phaser from 'phaser'
import type { Socket } from 'socket.io-client'
import { WORLD_WIDTH, WORLD_HEIGHT, GAME_WIDTH, GAME_HEIGHT } from '../constants'
import { Player } from '../objects/Player'
import { Building } from '../objects/Building'
import { TownNpc } from '../objects/TownNpc'
import { NpcDialog } from '../objects/NpcDialog'
import { TOWN_NPCS } from '../data/townNpcs'
import { DIFFICULTIES, DIFFICULTY_ORDER, type Difficulty } from '../data/mobs'
import { AnimalManager } from '../systems/AnimalManager'
import { Sfx } from '../systems/Sfx'
import { bindOverlayInputSuspension } from '../systems/overlayInput'
import { CP_GRASS, CP_GRASS2, CPD_BLADES, CPD_SPECKS, ROAD, ROAD_GRASS_TINT } from '../data/tileFrames'

interface BuildingEntry {
  building: Building
  label: string
  x: number
  y: number
  doorX: number   // spot just in front of the entrance to return the player to
  doorY: number
}

interface BiomeGate {
  name: string
  x: number
  y: number
  color: number
}

// Multiply-tint applied to the overworld grass tiles + backstop. It cuts the
// blue/grey cast of the raw CraftPix tiles (grey = equal RGB) and keeps green
// near full, so the lawn reads as a fresher, more vibrant green WITHOUT getting
// brighter/harsher (a multiply tint can only darken). Tuned to stay calm, not
// neon. The matching backstop fill (GRASS_BACKSTOP) is this tint applied to the
// old fill so any gaps between tiles match.
const GRASS_TINT = 0xc6f59a
const GRASS_BACKSTOP = 0x79b239

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

// Five location names per campaign, ordered easiest → hardest to match
// DIFFICULTY_ORDER (Beginner, Easy, Medium, Hard, Expert).
type FiveLocations = [string, string, string, string, string]
const BIOME_LOCATIONS: Record<string, FiveLocations> = {
  'Desert':              ['Oasis Edge',      'Sandy Flats',    'Scorching Dunes', 'Cursed Sands',     "Pharaoh's Tomb"],
  'Pine Forest':         ['Forest Trailhead','Mossy Clearing', 'Dense Pines',     'Ancient Grove',    'Heartwood Throne'],
  'Deciduous Forest':    ['Meadow Verge',    'Sunlit Path',    'Tangled Wood',    'Gnarled Hollow',   'Eldertree Heart'],
  'Swamp':               ['Reedy Banks',     'Murky Shallows', 'Boggy Depths',    'The Fetid Mire',   'Drowned Sepulcher'],
  'Snow':                ['Snowy Foothills', 'Frost Meadow',   'Frozen Pass',     'Glacial Abyss',    'Frostforged Summit'],
  'Grassland':           ['Gentle Pasture',  'Open Plains',    'Rolling Hills',   'Windswept Peaks',  'Stormcrest Summit'],
  'Tropical Rainforest': ['Canopy Fringe',   'Forest Edge',    'Jungle Thicket',  'Heart of Darkness','Primeval Depths'],
  'Ocean':               ['Shallow Cove',    'Tidal Pools',    'Open Waters',     'The Deep Abyss',   'The Abyssal Trench'],
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
  // Combat mode chosen at campaign start: hand-play every turn ('manual') or
  // watch the party's strategy loadout fight autonomously ('auto'). Persists
  // across menu opens within a session.
  private campaignMode: 'manual' | 'auto' = 'manual'

  // Chest
  private chestPos = { x: 1280, y: 1220 }
  private nearChest = false

  // Biome gates
  // Scattered around the town (center ~1280,1280): one gate per angular sector
  // but with irregular angles and radii so they don't sit on a perfect 45° grid.
  private biomeGates: BiomeGate[] = [
    { name: 'Ocean',               x: 2180, y: 1080, color: BIOME_COLORS['Ocean'] },
    { name: 'Tropical Rainforest', x: 2010, y: 1880, color: BIOME_COLORS['Tropical Rainforest'] },
    { name: 'Swamp',               x: 1480, y: 2270, color: BIOME_COLORS['Swamp'] },
    { name: 'Grassland',           x: 760,  y: 2020, color: BIOME_COLORS['Grassland'] },
    { name: 'Desert',              x: 430,  y: 1520, color: BIOME_COLORS['Desert'] },
    { name: 'Pine Forest',         x: 560,  y: 760,  color: BIOME_COLORS['Pine Forest'] },
    { name: 'Snow',                x: 1100, y: 290,  color: BIOME_COLORS['Snow'] },
    { name: 'Deciduous Forest',    x: 2080, y: 540,  color: BIOME_COLORS['Deciduous Forest'] },
  ]
  private nearBiomeGate: BiomeGate | null = null

  // Townsfolk you can talk to for guidance.
  private npcs: TownNpc[] = []
  private npcDialog!: NpcDialog
  private nearNpc: TownNpc | null = null

  // Per-gate dark "doorway opening" overlay that grows from the centre out when
  // the player is in range, making the gate look like it opens.
  private gateGlows = new Map<string, { glow: Phaser.GameObjects.Graphics; open: boolean }>()
  // Solid static bodies for the stone gates, so the player can't walk through a
  // portal (entry is still by the "Press E" proximity prompt). Rebuilt per scene.
  private gateColliders: Phaser.GameObjects.Zone[] = []

  // Spawn position — set via init() when returning from a biome, otherwise world centre
  private spawnX = WORLD_WIDTH / 2
  private spawnY = WORLD_HEIGHT / 2

  // ── Multiplayer presence ──────────────────────────────────────────────────
  // Other players in the shared 'town' zone, rendered from server pushes only.
  private socket: Socket | null = null
  /** Biomes that currently have a team deployed (for the portal-menu badge). */
  private deployedBiomes = new Set<string>()
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
    groundFill.fillStyle(GRASS_BACKSTOP, 1)
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
      // Tinted variant for the grass body (see GRASS_TINT) — passed to stamp so
      // the lawn reads as a more vibrant green.
      const grassStamp = { ...scale, tint: GRASS_TINT }
      for (let ty = 0; ty < WORLD_HEIGHT; ty += tileW) {
        for (let tx = 0; tx < WORLD_WIDTH; tx += tileW) {
          const frame = rand() < 0.9 ? CP_GRASS : CP_GRASS2
          groundRT.stamp('cp_ground', frame, tx + tileW / 2, ty + tileW / 2, grassStamp)
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
              groundRT.stamp('cp_details', frame, jx, jy, grassStamp)
              break
            }
          }
        }
      }
    }

    // ── Road network (CraftPix road pack, autotiled) ─────────────────────────
    // Two main roads cross at the town square; an axis-aligned L-route then
    // connects the square to every biome gate. Each cell is stamped twice: the
    // opaque cobble body, then the grass-overhang fringe on top.
    const roadMask = this.buildPathMask()
    {
      const roadRT = this.add.renderTexture(0, 0, WORLD_WIDTH, WORLD_HEIGHT).setOrigin(0)
      roadRT.setDepth(1)
      this.renderRoads(roadRT, roadMask)
    }

    // ── Flower/tuft props (complete standalone sprites, never clipped) ────────
    {
      const rand = this.rng(7)
      let placed = 0
      let attempts = 0
      while (placed < 70 && attempts < 700) {
        attempts++
        const x = 60 + rand() * (WORLD_WIDTH - 120)
        const y = 60 + rand() * (WORLD_HEIGHT - 120)
        if (this.maskHasNearby(roadMask, x, y, 1)) continue   // keep off the roads
        if (rand() < 0.6) {
          this.add.image(x, y, `cp_flower${1 + Math.floor(rand() * 6)}`).setScale(3).setDepth(1)
        } else {
          this.add.image(x, y, `cp_tuft${1 + Math.floor(rand() * 2)}`).setScale(2).setDepth(1)
        }
        placed++
      }
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
    // Spread around a central plaza (the well, ~1280,1280) at varied distances
    // and angles — deliberately NOT a tidy grid — so the town reads as an
    // organic village rather than a square. Each building's frontage is dressed
    // by decorateBuilding() so the props follow wherever a building sits.
    const buildingDefs = [
      { label: 'Tavern',          x: 1395, y: 870,  w: 220, h: 180 },
      { label: 'Combat Training', x: 1780, y: 1150, w: 252, h: 180 },
      { label: 'Market',          x: 935,  y: 1575, w: 220, h: 157 },
      { label: 'Combat Strategy', x: 1715, y: 1610, w: 196, h: 196 },
      { label: 'The Forge',       x: 1290, y: 1700, w: 200, h: 170 },
      { label: 'The Armory',      x: 895,  y: 1010, w: 200, h: 170 },
      { label: 'Alchemy Lab',     x: 620,  y: 1640, w: 200, h: 170 },
      // The Garrison — recruit/manage heroes, build squads, and deploy teams.
      // (Recruitment merged in here; the standalone Mercenary Guild is retired.)
      { label: 'The Garrison', x: 1130, y: 760,  w: 200, h: 170 },
    ]

    this.buildings = []
    buildingDefs.forEach((def, i) => {
      const b = new Building(this, def.x, def.y, def.label, def.w, def.h)
      // Door is centred just below the footprint (clear of the collider).
      const entry: BuildingEntry = {
        building: b, label: def.label, x: def.x, y: def.y,
        doorX: def.x, doorY: def.y + def.h / 2 + 40,
      }
      this.buildings.push(entry)
      this.decorateBuilding(entry, i)
    })

    // ── Central plaza ─────────────────────────────────────────────────────────
    // The open heart of the town: a well, the town sign, a ring of lamps and
    // benches, and scattered greenery. With the buildings pushed outward this
    // square stays clear for the player to spawn into and move through.
    this.add.image(1280, 1285, 'well').setDepth(3).setScale(3)
    this.add.image(1280, 1160, 'sign').setDepth(3).setScale(3)

    // Lamps + benches loosely ringing the plaza (not perfectly symmetric).
    for (const [lx, ly] of [[1120, 1205], [1455, 1170], [1150, 1395], [1430, 1380]] as [number, number][]) {
      this.add.image(lx, ly, 'lamppost').setDepth(3).setScale(2.5)
    }
    for (const [bx, by, flip] of [[1185, 1410, 0], [1380, 1415, 1]] as [number, number, number][]) {
      this.add.image(bx, by, 'bench').setDepth(3).setScale(2.4).setFlipX(flip === 1)
    }

    // Scattered greenery + a couple of in-town trees to break up the open grass.
    ;([
      [1090, 1300, 'cp_bush1'], [1470, 1320, 'cp_bush4'],
      [1230, 1145, 'cp_flower2'], [1335, 1150, 'cp_flower5'],
      [1175, 1340, 'cp_tuft1'], [1395, 1345, 'cp_tuft2'],
    ] as [number, number, string][]).forEach(([rx, ry, key]) => {
      this.add.image(rx, ry, key).setDepth(2)
    })
    // A few trees nestled in the gaps between buildings (decorative, no collider).
    ;([
      [1170, 980, 'cp_tree2'], [1600, 1010, 'cp_ftree2'],
      [760, 1300, 'cp_tree4'], [1560, 1430, 'cp_tree1'], [1120, 1700, 'cp_ftree5'],
    ] as [number, number, string][]).forEach(([tx, ty, key]) => {
      this.add.image(tx, ty, key).setScale(1.4).setDepth(2)
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
    this.gateGlows.clear()   // scene instance is reused across restarts
    this.gateColliders = []
    for (const gate of this.biomeGates) {
      this.drawBiomeGate(gate.x, gate.y, gate.name, gate.color)
      // Solid body over the gate's lower stone (pillars + base). Bottom sits at
      // the gate's ground point so the player bumps into it yet stays well
      // inside the 80px "Press E" range that opens the biome menu.
      const block = this.add.zone(gate.x, gate.y - 35, 104, 70)
      this.physics.add.existing(block, true)
      this.gateColliders.push(block)
    }

    // ── Stone accents around each biome gate (CraftPix) ──────────────────────
    this.biomeGates.forEach((gate, i) => {
      this.add.image(gate.x - 56, gate.y + 8, i % 2 === 0 ? 'cp_stone1' : 'cp_stone2').setDepth(3)
      this.add.image(gate.x + 56, gate.y + 8, i % 2 === 0 ? 'cp_stone2' : 'cp_stone1').setDepth(3)
    })

    // ── Tavern terrace (outdoor tables + seated patrons, props) ───────────────
    this.addTavernTerrace()

    // ── Townsfolk (guides you can talk to) ────────────────────────────────────
    this.npcs = TOWN_NPCS.map(def => new TownNpc(this, def))

    // ── Player ────────────────────────────────────────────────────────────────
    this.player = new Player(this, this.spawnX, this.spawnY)

    for (const entry of this.buildings) {
      this.physics.add.collider(this.player, entry.building.collider)
    }
    for (const block of this.gateColliders) {
      this.physics.add.collider(this.player, block)
    }

    // ── Multiplayer: see and be seen by other players in town ───────────────
    this.setupMultiplayer()

    // ── Camera ────────────────────────────────────────────────────────────────
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT)
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1)
    this.cameras.main.setZoom(1)

    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT)

    // ── Ambient animals (cats/dogs near town; farm + wild animals outside) ────
    // The manager registers its own update/shutdown via scene events and is
    // kept alive by those listeners, so we don't need to hold a reference.
    new AnimalManager(this, {
      worldWidth: WORLD_WIDTH, worldHeight: WORLD_HEIGHT,
      townCenter: { x: 1280, y: 1280 }, townRadius: 580,
      colliders: this.buildings.map(b => b.building.collider),
    })

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

    // Suspend our keyboard while an input-bearing React overlay (the roster
    // panel, openable here via HUD buttons) is open, so typed letters reach the
    // DOM input and E/WASD don't fire interactions/movement under it.
    bindOverlayInputSuspension(this)

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

    // NPC dialogue box (camera-fixed) + click-to-advance while talking.
    this.npcDialog = new NpcDialog(this)
    this.input.on('pointerdown', () => {
      if (this.npcDialog.isOpen) this.npcDialog.advance()
    })

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

    // Track which campaigns have a team deployed, to badge the portal menu
    // (TEAMS §5 — informational only; never blocks entering a campaign).
    const onRoster = (data: { deployments?: { biome: string }[] }) => {
      this.deployedBiomes = new Set((data?.deployments ?? []).map((d) => d.biome))
    }

    this.socket.on('zone:players', onZonePlayers)
    this.socket.on('player:joined', onJoined)
    this.socket.on('player:moved', onMoved)
    this.socket.on('roster:data', onRoster)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.socket?.off('zone:players', onZonePlayers)
      this.socket?.off('player:joined', onJoined)
      this.socket?.off('player:moved', onMoved)
      this.socket?.off('roster:data', onRoster)
      this.remotePlayers.forEach(rp => { rp.sprite.destroy(); rp.label.destroy() })
      this.remotePlayers.clear()
    })

    // The join ack fired before this scene existed — fetch the roster now,
    // and report our real spawn position so others see us where we stand.
    this.socket.emit('zone:get')
    this.socket.emit('roster:get')
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
        .setScale(1.8)   // match the local player's scale
        .setDepth(9)
      if (this.anims.exists('idle_down')) sprite.play('idle_down')

      const label = this.add.text(p.position.x, p.position.y - 50, p.username, {
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

  // Road grid: 64px cells (matches the 4× ground tiling); roads are 3 cells wide.
  private static readonly ROAD_CELL = 48   // 16px tile × 3; a 3-cell road is ~144px wide
  private static readonly ROAD_HALF = 1

  /** Build the boolean road mask: two main cross roads through the town square
   *  plus an axis-aligned L-route (horizontal leg, then vertical leg) from the
   *  square out to every biome gate. Each `true` cell is road. */
  private buildPathMask(): boolean[][] {
    const CELL = WorldScene.ROAD_CELL
    const HALF = WorldScene.ROAD_HALF
    const cols = Math.floor(WORLD_WIDTH / CELL)
    const rows = Math.floor(WORLD_HEIGHT / CELL)
    const mask: boolean[][] = Array.from({ length: rows }, () => new Array<boolean>(cols).fill(false))
    const mark = (c: number, r: number) => {
      if (r >= 0 && r < rows && c >= 0 && c < cols) mask[r][c] = true
    }
    const hRoad = (c0: number, c1: number, rC: number) => {
      for (let c = Math.min(c0, c1); c <= Math.max(c0, c1); c++)
        for (let d = -HALF; d <= HALF; d++) mark(c, rC + d)
    }
    const vRoad = (r0: number, r1: number, cC: number) => {
      for (let r = Math.min(r0, r1); r <= Math.max(r0, r1); r++)
        for (let d = -HALF; d <= HALF; d++) mark(cC + d, r)
    }

    // Roads only ever connect the town square to a biome gate — no full-map
    // spans (those left dead-end paths running off to the empty map edges).
    const cx = Math.round(WORLD_WIDTH / 2 / CELL)
    const cy = Math.round(WORLD_HEIGHT / 2 / CELL)
    for (const g of this.biomeGates) {
      const gc = Phaser.Math.Clamp(Math.round(g.x / CELL), 0, cols - 1)
      const gr = Phaser.Math.Clamp(Math.round(g.y / CELL), 0, rows - 1)
      hRoad(cx, gc, cy)          // run out along the town's centre row…
      vRoad(cy, gr, gc)          // …then turn to reach the gate
    }
    return mask
  }

  /** Autotile the road mask. Each cell is stamped twice — the opaque cobble
   *  body ('road_body'), then the grass-overhang fringe ('road_grass') on top —
   *  with the frame chosen by which sides border grass (see ROAD in tileFrames). */
  private renderRoads(rt: Phaser.GameObjects.RenderTexture, mask: boolean[][]) {
    const CELL = WorldScene.ROAD_CELL
    const rows = mask.length
    const cols = mask[0].length
    const scale = { scaleX: CELL / 16, scaleY: CELL / 16 }   // stamp the 16px tile to fill a cell
    const isP = (c: number, r: number) =>
      r >= 0 && r < rows && c >= 0 && c < cols && mask[r][c]

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!mask[r][c]) continue
        const n = !isP(c, r - 1), s = !isP(c, r + 1)
        const w = !isP(c - 1, r), e = !isP(c + 1, r)
        let frame: number
        if (n && w) frame = ROAD.NW
        else if (n && e) frame = ROAD.NE
        else if (s && w) frame = ROAD.SW
        else if (s && e) frame = ROAD.SE
        else if (n) frame = ROAD.N
        else if (s) frame = ROAD.S
        else if (w) frame = ROAD.W
        else if (e) frame = ROAD.E
        else frame = ROAD.C[(c + r) % ROAD.C.length]   // interior — vary the cobble
        const px = c * CELL + CELL / 2
        const py = r * CELL + CELL / 2
        rt.stamp('road_body', frame, px, py, scale)     // opaque cobble body
        // grass overhang, tinted to match the world's darker grass
        rt.stamp('road_fringe', frame, px, py, { ...scale, tint: ROAD_GRASS_TINT })
      }
    }
  }

  /** True when a road cell lies within `margin` cells of world point (x, y). */
  private maskHasNearby(mask: boolean[][], x: number, y: number, margin: number): boolean {
    const CELL = WorldScene.ROAD_CELL
    const cc = Math.floor(x / CELL)
    const cr = Math.floor(y / CELL)
    for (let dr = -margin; dr <= margin; dr++) {
      const row = mask[cr + dr]
      if (!row) continue
      for (let dc = -margin; dc <= margin; dc++) if (row[cc + dc]) return true
    }
    return false
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

  /** Draw a biome entrance gate at world position (x,y) — the stone-arch sprite
   *  tinted with the biome's color, standing on the ground point used for the
   *  "Press E to enter" proximity check. */
  private drawBiomeGate(x: number, y: number, name: string, color: number) {
    // Soft ground shadow to seat the gate
    const base = this.add.graphics().setDepth(3)
    base.fillStyle(0x000000, 0.18)
    base.fillEllipse(x, y + 14, 90, 20)

    // Gate sprite, tinted to the biome color. Origin at the foot of the pillars
    // so the arch stands on (x, y); the dark doorway sits above for "step in".
    // The tint is lightened toward white first — a straight multiply by the dark
    // forest/swamp colors would render the stone muddy and unreadable on grass.
    const r = (color >> 16) & 0xff, g = (color >> 8) & 0xff, b = color & 0xff
    const lf = 0.45
    const tint =
      (Math.round(r + (255 - r) * lf) << 16) |
      (Math.round(g + (255 - g) * lf) << 8) |
       Math.round(b + (255 - b) * lf)
    const gate = this.add.image(x, y + 16, 'biome_gate').setOrigin(0.5, 1).setDepth(5)
    gate.setScale(2.4)
    gate.setTint(tint)

    // Door "opening" overlay — a black, door-shaped panel (arched top, squarer
    // bottom) sized to the gate's doorway. It grows from the centre out when the
    // player is in range (see updateGateGlows), so the gate reads as its door
    // opening to a dark passage. Drawn centred on the doorway; starts closed.
    // (Geometry is tuned to the Gates1 sprite at scale 2.4.)
    const glow = this.add.graphics().setDepth(6)
    glow.fillStyle(0x05050a, 1)
    glow.fillRoundedRect(-26.5, -38.5, 53, 77, { tl: 22, tr: 22, bl: 5, br: 5 })
    glow.setPosition(x, y - 49)
    glow.setScale(0)
    this.gateGlows.set(name, { glow, open: false })

    // Label underneath
    this.add.text(x, y + 22, name, {
      fontSize: '12px',
      fontFamily: 'Georgia, serif',
      color: '#ffd700',
      backgroundColor: '#00000099',
      padding: { x: 4, y: 2 },
    }).setOrigin(0.5, 0).setDepth(6)
  }

  /** Grow the dark doorway open on the gate the player can enter (black filling
   *  from the centre out), shrink the rest closed. Each transition fires once,
   *  tracked by the per-gate `open` flag. */
  private updateGateGlows() {
    const nearName = this.nearBiomeGate?.name ?? null
    for (const [name, entry] of this.gateGlows) {
      const wantOpen = name === nearName
      if (wantOpen === entry.open) continue
      entry.open = wantOpen
      this.tweens.killTweensOf(entry.glow)
      this.tweens.add({
        targets: entry.glow,
        scale: wantOpen ? 1 : 0,
        duration: wantOpen ? 300 : 200,
        ease: wantOpen ? 'Cubic.easeOut' : 'Quad.easeIn',
      })
    }
  }

  /**
   * Dress the open ground in front of (below) and beside the Tavern with an
   * outdoor terrace: a few round wooden tables, each ringed by seated patrons,
   * plus a couple of barrels and a planter — so the tavern reads "lived-in"
   * like the CraftPix reference. Everything here is purely decorative: drawn
   * with Phaser graphics (chibi style matching TownNpc) at town-prop depth, no
   * physics colliders. Positions are hand-placed to keep clear of the tavern
   * door (~1280,1070), the building footprint (y < 1030), the centre road row,
   * and the town NPCs near (1460,1250).
   */
  /**
   * Dress a building's frontage so it reads as lived-in and the town doesn't
   * look like bare houses on grass. Props are placed relative to the door, to
   * the sides of the entrance (the door-return spot itself stays clear), so they
   * follow wherever the building is positioned. A little per-building variety
   * (bush/flower species, which side the lamp sits) keeps it from feeling tiled.
   */
  private decorateBuilding(e: BuildingEntry, i: number) {
    const dx = e.doorX
    const dy = e.doorY
    // Shared ambiance — a lamp by the door and a little greenery — so every
    // frontage feels lived-in. The door-return spot itself stays clear.
    this.add.image(dx + 84, dy - 8, 'lamppost').setDepth(3).setScale(2.4)
    this.add.image(dx + 104, dy + 36, `cp_bush${(i % 6) + 1}`).setDepth(3)
    this.add.image(dx + 66,  dy + 50, `cp_flower${(i % 6) + 1}`).setDepth(2)

    // A FUNCTION EMBLEM on the left of the door — a small drawn vignette that
    // signals what the building is for (echoing its interior workstation).
    this.drawFunctionEmblem(e.label, dx - 104, dy + 18)
  }

  /**
   * Place a real prop sprite beside a building's door that signals its function
   * (a blacksmith forge for the Forge, a weapon rack for the Armory, a cooking
   * pot for the Alchemy Lab, a market stall, a training dummy, a supply wagon).
   * Sprites are CraftPix `autumn_vector` props loaded in BootScene. Each is given
   * a target on-screen width so the differently-sized source art reads at a
   * consistent scale; their origin sits near the base so they plant on the
   * ground. Buildings with no emblem (the Tavern — it has its own terrace) keep
   * the old generic barrels.
   */
  private drawFunctionEmblem(label: string, x: number, y: number) {
    // The Forge has no standalone anvil/forge PROP in the art library (only a
    // whole blacksmith BUILDING, which reads as a second house), so it uses a
    // drawn anvil-and-brazier object instead of a sprite.
    if (label === 'The Forge') { this.emblemForge(x, y); return }
    if (label === 'The Garrison') { this.emblemGarrison(x, y); return }

    // The rest are real CraftPix props. [textureKey, target on-screen width].
    const EMBLEMS: Record<string, [string, number]> = {
      'The Armory':      ['emblem_armory',    84],
      'Alchemy Lab':     ['emblem_alchemy',   92],
      'Market':          ['emblem_market',    98],
      'Combat Training': ['emblem_training',  72],
      'Combat Strategy': ['emblem_strategy',  98],
    }
    const emblem = EMBLEMS[label]
    if (!emblem) {
      this.add.image(x, y + 12, 'barrel').setDepth(3).setScale(2.2)
      this.add.image(x + 18, y + 26, 'barrel').setDepth(3).setScale(2.2)
      return
    }
    const [key, targetW] = emblem
    if (!this.textures.exists(key)) return   // art missing — skip rather than crash
    const img = this.add.image(x, y, key).setDepth(3).setOrigin(0.5, 0.82)
    img.setScale(targetW / img.width)        // uniform scale preserves aspect ratio
  }

  /** The Garrison: a sword planted point-down with a round shield leaning
   *  against it and a banner pole — a martial "muster here" mark (drawn; no
   *  matching prop in the library). */
  private emblemGarrison(x: number, y: number) {
    const g = this.add.graphics().setDepth(3)
    g.fillStyle(0x000000, 0.18); g.fillEllipse(x, y + 14, 92, 30)        // ground shadow
    // Planted sword (blade sunk into the dirt, hilt up).
    g.fillStyle(0xb9c2cc, 1); g.fillRect(x - 3, y - 40, 6, 44)           // blade
    g.fillStyle(0x8a929c, 1); g.fillTriangle(x - 3, y + 4, x + 3, y + 4, x, y + 12) // buried tip
    g.fillStyle(0x6b4a2a, 1); g.fillRect(x - 11, y - 44, 22, 6)          // crossguard
    g.fillStyle(0x3a2a18, 1); g.fillRect(x - 2, y - 56, 4, 12)           // grip
    g.fillStyle(0xd4a830, 1); g.fillCircle(x, y - 58, 4)                 // pommel
    // Round shield leaning at the base.
    g.fillStyle(0x7a3b2a, 1); g.fillCircle(x + 30, y - 2, 18)            // shield body
    g.lineStyle(3, 0x9c5a3a, 1); g.strokeCircle(x + 30, y - 2, 18)       // rim
    g.fillStyle(0xd4a830, 1); g.fillCircle(x + 30, y - 2, 5)             // boss
    // Small banner pole behind for a guild touch.
    g.fillStyle(0x5a4632, 1); g.fillRect(x - 40, y - 50, 4, 54)         // pole
    g.fillStyle(0x9c2b2b, 1); g.fillTriangle(x - 36, y - 50, x - 36, y - 28, x - 18, y - 39) // pennant
  }

  /** Forge: a drawn anvil beside a glowing coal brazier (no anvil prop exists). */
  private emblemForge(x: number, y: number) {
    const g = this.add.graphics().setDepth(3)
    g.fillStyle(0x000000, 0.18); g.fillEllipse(x, y + 14, 96, 32)   // ground shadow
    // Anvil
    g.fillStyle(0x2b2b30, 1)
    g.fillRect(x - 22, y + 4, 44, 9)         // base
    g.fillRect(x - 8,  y - 6, 16, 12)        // waist
    g.fillStyle(0x3a3a42, 1)
    g.fillRect(x - 27, y - 16, 54, 11)       // face
    g.fillStyle(0x4a4a54, 1)
    g.fillTriangle(x + 24, y - 16, x + 38, y - 11, x + 24, y - 5) // horn
    // Coal brazier with a pulsing flame
    const bx = x + 52
    g.fillStyle(0x1b120c, 1); g.fillRect(bx - 14, y - 4, 28, 16)
    g.fillStyle(0x2a1c12, 1); g.fillRect(bx - 16, y + 10, 32, 6)
    const fire = this.add.ellipse(bx, y - 6, 22, 16, 0xff7a30, 0.92).setDepth(4)
    this.tweens.add({ targets: fire, scaleX: 1.2, scaleY: 1.35, alpha: 0.6,
      duration: 620, yoyo: true, repeat: -1, ease: 'Sine.inOut' })
    this.add.text(bx, y - 6, '🔥', { fontSize: '18px' }).setOrigin(0.5).setDepth(5)
  }

  private addTavernTerrace() {
    // Three table groupings, tastefully spaced across the terrace strip
    // (y ≈ 1040–1180), left and right of the door column.
    //   patrons: [seatAngleDeg, npcSheetKey] — angle places a standing CraftPix
    //   citizen around the table rim (a lively tavern crowd). Sheet keys cycle
    //   through the citizen idle sheets + the lute player / drinks server for
    //   variety; see NPC_SHEETS in townNpcs.ts.
    // Anchor the terrace on the tavern's actual position so it follows the
    // building wherever it sits. Tables fan out in the open ground in front of
    // (below) the door, clear of the door-return spot.
    const tav = this.buildings.find(b => b.label === 'Tavern')
    const ox = tav ? tav.x : 1395
    const oy = tav ? tav.doorY + 30 : 1100

    const tables: { x: number; y: number; patrons: [number, string][] }[] = [
      // Left table — three drinkers
      { x: ox - 150, y: oy + 5,  patrons: [[205, 'npc_citizen1'], [335, 'npc_citizen3'], [80, 'npc_drinks']] },
      // Right table — four patrons, busiest spot (a lute player among them)
      { x: ox + 40,  y: oy + 20, patrons: [[205, 'npc_citizen5'], [335, 'npc_lute'], [70, 'npc_citizen2'], [120, 'npc_citizen4']] },
      // Lower table — two, set further out from the door
      { x: ox - 70,  y: oy + 95, patrons: [[215, 'npc_citizen2'], [325, 'npc_citizen1']] },
    ]
    for (const t of tables) this.drawTerraceTable(t.x, t.y, t.patrons)

    // Dressing props (reuse loaded sprites) — barrels clustered beside the tables.
    for (const [bx, by] of [[ox - 182, oy + 62], [ox - 159, oy + 74], [ox + 78, oy + 68]] as [number, number][]) {
      this.add.image(bx, by, 'barrel').setDepth(3).setScale(2.2)
    }
  }

  /** Draw one round wooden table at (x, y) with standing patrons around it.
   *  Tables sit at depth 3; patrons in front sort above (depth 4), patrons on
   *  the far side sort below (depth 2.5) so the table overlaps their legs and
   *  they read as gathered around it. No collider — the player walks through. */
  private drawTerraceTable(x: number, y: number, patrons: [number, string][]) {
    const g = this.add.graphics().setDepth(3)
    // Ground shadow
    g.fillStyle(0x000000, 0.18); g.fillEllipse(x, y + 6, 78, 26)
    // Table top (round wooden) with a darker rim + a couple of mugs
    g.fillStyle(0x6b4a2a, 1); g.fillEllipse(x, y, 64, 38)
    g.fillStyle(0x8a6238, 1); g.fillEllipse(x, y - 3, 56, 30)
    g.lineStyle(2, 0x4a321c, 1); g.strokeEllipse(x, y - 3, 56, 30)
    // Mugs on the table
    g.fillStyle(0x3a2a18, 1)
    g.fillRoundedRect(x - 16, y - 10, 8, 9, 2)
    g.fillRoundedRect(x + 8, y - 8, 8, 9, 2)
    g.fillStyle(0xe8d6a0, 1)
    g.fillEllipse(x - 12, y - 11, 8, 3)
    g.fillEllipse(x + 12, y - 9, 8, 3)

    // Patrons standing around the rim
    for (const [angleDeg, sheet] of patrons) {
      const a = Phaser.Math.DegToRad(angleDeg)
      const px = x + Math.cos(a) * 46
      const py = y + Math.sin(a) * 24
      this.drawStandingPatron(px, py, sheet, py < y)
    }
  }

  /** A standing CraftPix citizen at (x, y) playing its idle loop. `behind` =
   *  on the far side of the table (drawn under the table so it overlaps the
   *  patron's legs, selling the "gathered round" look). */
  private drawStandingPatron(x: number, y: number, sheet: string, behind: boolean) {
    const sprite = this.add.sprite(x, y - 18, sheet, 0)
      .setScale(1.9)
      .setDepth(behind ? 2.5 : 4)
    const idleKey = `${sheet}_idle`
    if (this.anims.exists(idleKey)) {
      sprite.anims.play(idleKey)
      // Desync patrons from each other so the crowd doesn't move in lockstep.
      sprite.anims.setProgress(Phaser.Math.FloatBetween(0, 1))
      sprite.anims.timeScale = Phaser.Math.FloatBetween(0.8, 1.2)
    }
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
    Sfx.play('menu')

    const color = BIOME_COLORS[biomeName] ?? 0xffd700
    const locations: FiveLocations = BIOME_LOCATIONS[biomeName]
      ?? ['Beginner Area', 'Easy Area', 'Medium Area', 'Hard Area', 'Expert Area']

    const panelW = 420
    const panelH = 640
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
    const title = this.add.text(0, -panelH / 2 + 32, `⚔ Enter the ${biomeName} Campaign`, {
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

    // Combat-mode toggle: hand-play every turn, or watch the party's strategy
    // loadout fight autonomously (so you can both play AND see your strategy live).
    this.drawModeToggle(container, -218, color)

    // Difficulty buttons — one per mode, easiest → hardest, accents + level
    // bands pulled from the shared DIFFICULTIES config. Per-biome flavour names
    // only exist for the first few modes, so fall back to the difficulty label.
    const firstY = -150
    const stepY = 42
    DIFFICULTY_ORDER.forEach((diff, i) => {
      const cfg = DIFFICULTIES[diff]
      const loc = locations[i] ?? cfg.label
      this.createBiomeButton(
        container, cfg.icon, loc, diff, biomeName, firstY + i * stepY, color,
      )
    })

    // Deployment badge — informational (TEAMS §5); never blocks the campaign.
    if (this.deployedBiomes.has(biomeName)) {
      container.add(this.add.text(0, panelH / 2 - 62, '⚔ A team is deployed to this campaign', {
        fontSize: '11px', fontFamily: 'Arial', color: '#ffd54f',
        backgroundColor: '#00000088', padding: { x: 8, y: 3 },
      }).setOrigin(0.5, 0.5))
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

  /** Two-pill segmented control choosing how the campaign's battles play out. */
  private drawModeToggle(container: Phaser.GameObjects.Container, y: number, color: number) {
    container.add(this.add.text(0, y - 28, 'COMBAT MODE', {
      fontSize: '10px', fontFamily: 'Arial', color: '#9aa0c0', fontStyle: 'bold',
    }).setOrigin(0.5))

    const hint = this.add.text(0, y + 26, '', {
      fontSize: '10px', fontFamily: 'Arial', color: '#777a9a',
    }).setOrigin(0.5)
    container.add(hint)

    const pillW = 168, pillH = 28
    const defs: { mode: 'manual' | 'auto'; x: number; label: string }[] = [
      { mode: 'manual', x: -90, label: '⚔ Manual' },
      { mode: 'auto', x: 90, label: '⚙ Strategy' },
    ]
    const pills = defs.map(def => {
      const bg = this.add.graphics(); container.add(bg)
      const txt = this.add.text(def.x, y, def.label, {
        fontSize: '14px', fontFamily: 'Georgia, serif', fontStyle: 'bold',
      }).setOrigin(0.5); container.add(txt)
      const zone = this.add.zone(def.x - pillW / 2, y - pillH / 2, pillW, pillH).setOrigin(0)
        .setInteractive({ useHandCursor: true })
      zone.on('pointerdown', () => { this.campaignMode = def.mode; paint(); Sfx.play('click') })
      container.add(zone)
      return { ...def, bg, txt }
    })
    const paint = () => {
      for (const p of pills) {
        const sel = p.mode === this.campaignMode
        p.bg.clear()
        p.bg.fillStyle(sel ? 0x2a2a5a : 0x14142e, 1).fillRoundedRect(p.x - pillW / 2, y - pillH / 2, pillW, pillH, 8)
        p.bg.lineStyle(sel ? 2 : 1, sel ? color : 0x44446a, sel ? 1 : 0.7).strokeRoundedRect(p.x - pillW / 2, y - pillH / 2, pillW, pillH, 8)
        p.txt.setColor(sel ? '#ffd700' : '#9aa0c0')
      }
      hint.setText(this.campaignMode === 'auto'
        ? 'Your strategy loadout fights — watch it play out.'
        : 'Hand-play every character each turn.')
    }
    paint()
  }

  private createBiomeButton(
    container: Phaser.GameObjects.Container,
    icon: string,
    locationName: string,
    difficulty: Difficulty,
    biomeName: string,
    yOffset: number,
    borderColor: number
  ) {
    const bw = 360
    const bh = 38
    const by = yOffset - bh / 2

    const btnBg = this.add.graphics()
    btnBg.fillStyle(0x1a1a3a, 1)
    btnBg.fillRoundedRect(-bw / 2, by, bw, bh, 8)
    btnBg.lineStyle(1, borderColor, 0.7)
    btnBg.strokeRoundedRect(-bw / 2, by, bw, bh, 8)
    container.add(btnBg)

    const cfg = DIFFICULTIES[difficulty]

    const btnText = this.add.text(-bw / 2 + 16, yOffset, `${icon} ${cfg.label}`, {
      fontSize: '15px',
      fontFamily: 'Georgia, serif',
      color: cfg.color,
      fontStyle: 'bold',
    })
    btnText.setOrigin(0, 0.5)
    container.add(btnText)

    const diffText = this.add.text(bw / 2 - 16, yOffset, `Lv ${cfg.band[0]}–${cfg.band[1]}`, {
      fontSize: '12px',
      fontFamily: 'Arial, sans-serif',
      color: '#9aa0c0',
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
      Sfx.play('click')
      this.closeBiomeMenu()
      this.scene.stop('UIScene')
      this.scene.start('BiomeScene', {
        biome: biomeName,
        difficulty,
        location: locationName,
        mode: this.campaignMode,
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

    if (!this.popupOpen && !this.biomeMenuOpen && !this.npcDialog.isOpen) {
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
      rp.label.setPosition(rp.sprite.x, rp.sprite.y - 50)

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
    this.updateGateGlows()

    this.nearNpc = this.npcs.find(n => this.playerIsNear(n.def.x, n.def.y, 80)) ?? null

    // While talking to an NPC, that conversation owns the input.
    if (this.npcDialog.isOpen) {
      this.promptText.setVisible(false)
      if (Phaser.Input.Keyboard.JustDown(this.eKey)) this.npcDialog.advance()
      else if (Phaser.Input.Keyboard.JustDown(this.escKey)) this.npcDialog.close()
      return
    }

    // Handle prompt display and E key interactions
    if (this.biomeMenuOpen) {
      this.promptText.setVisible(false)
      // ESC closes biome menu
      if (Phaser.Input.Keyboard.JustDown(this.escKey)) {
        this.closeBiomeMenu()
      }
    } else if (this.nearBiomeGate && !this.popupOpen) {
      this.promptText.setText(`Press E to enter the ${this.nearBiomeGate.name} Campaign`).setVisible(true)
      if (Phaser.Input.Keyboard.JustDown(this.eKey)) {
        this.openBiomeMenu(this.nearBiomeGate.name)
      }
    } else if (nearBuilding && !this.popupOpen) {
      this.promptText
        .setText('Press E to enter')
        .setVisible(true)
      if (Phaser.Input.Keyboard.JustDown(this.eKey)) {
        Sfx.play('menu')
        if (nearBuilding.label === 'The Garrison') {
          // Walk-in building housing the Barracks Master / Squad Captain / Field
          // Marshal NPCs (see docs/TEAMS_DESIGN.md §1).
          this.player.setVelocity(0, 0)
          this.scene.stop('UIScene')
          this.scene.start('GarrisonScene', {
            returnX: nearBuilding.doorX, returnY: nearBuilding.doorY,
          })
          return
        }
        if (nearBuilding.label === 'Combat Strategy') {
          this.player.setVelocity(0, 0)
          this.scene.stop('UIScene')
          this.scene.start('CraftBuildingScene', {
            building: 'combat_strategy',
            returnX: nearBuilding.doorX, returnY: nearBuilding.doorY,
          })
          return
        }
        if (nearBuilding.label === 'Combat Training') {
          this.player.setVelocity(0, 0)
          this.scene.stop('UIScene')
          this.scene.start('CraftBuildingScene', {
            building: 'combat_training',
            returnX: nearBuilding.doorX, returnY: nearBuilding.doorY,
          })
          return
        }
        if (nearBuilding.label === 'Market') {
          this.player.setVelocity(0, 0)
          this.scene.pause('WorldScene')
          this.scene.launch('MarketScene')
          return
        }
        const craftBuilding =
          nearBuilding.label === 'The Forge'  ? 'forge'  :
          nearBuilding.label === 'The Armory' ? 'armory' :
          nearBuilding.label === 'Alchemy Lab' ? 'alchemy' : null
        if (craftBuilding) {
          this.player.setVelocity(0, 0)
          this.scene.stop('UIScene')
          this.scene.start('CraftBuildingScene', {
            building: craftBuilding,
            returnX: nearBuilding.doorX, returnY: nearBuilding.doorY,
          })
          return
        }
        if (nearBuilding.label === 'Tavern') {
          // Full scene switch (like ClassroomScene/ChestScene). The tavern owns
          // its own multiplayer 'tavern' zone; returnX/returnY drop the player
          // back at the tavern door when they leave.
          this.player.setVelocity(0, 0)
          this.scene.stop('UIScene')
          this.scene.start('TavernScene', {
            returnX: nearBuilding.doorX, returnY: nearBuilding.doorY,
          })
          return
        }
        this.openPopup(nearBuilding.label)
      }
    } else if (this.nearChest && !this.popupOpen) {
      this.promptText.setText('Press E to open chest').setVisible(true)
      if (Phaser.Input.Keyboard.JustDown(this.eKey)) {
        this.player.setVelocity(0, 0)
        this.scene.stop('UIScene')
        this.scene.start('ChestScene', {
          returnX: this.chestPos.x, returnY: this.chestPos.y + 70,
        })
        return
      }
    } else if (this.nearNpc && !this.popupOpen) {
      this.promptText.setText(`Press E to talk to ${this.nearNpc.def.name}`).setVisible(true)
      if (Phaser.Input.Keyboard.JustDown(this.eKey)) {
        this.player.setVelocity(0, 0)
        this.npcDialog.open(this.nearNpc.def.name, this.nearNpc.def.lines)
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
