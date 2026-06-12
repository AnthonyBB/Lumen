import Phaser from 'phaser'
import { ANIMAL_SHEETS, ANIMAL_SPECIES, DIR_ROW } from '../data/animals'
import { NPC_SHEETS } from '../data/townNpcs'

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' })
  }

  preload() {
    // ── PLAYER spritesheets (160x192, 4 cols x 4 rows = 40x48 per frame) ───────
    // Both spritesheets share the same row layout (confirmed):
    //   Row 0 (frames  0– 3) → facing LEFT
    //   Row 1 (frames  4– 7) → facing RIGHT
    //   Row 2 (frames  8–11) → facing UP   (back to viewer)
    //   Row 3 (frames 12–15) → facing DOWN (front, toward viewer)
    this.load.spritesheet('character_walk', '/assets/sprites/character_walk.png', {
      frameWidth: 40,
      frameHeight: 48,
    })
    this.load.spritesheet('character_idle', '/assets/sprites/character_idle.png', {
      frameWidth: 40,
      frameHeight: 48,
    })

    // ── KENNEY CC0 ASSET PACKS (see public/assets/CREDITS.md) ───────────────────
    // roguelike:    968×526, 16×16 tiles with 1px spacing, 57 cols × 31 rows
    // tiny_town:    192×176, 16×16 tiles, no spacing, 12 cols × 11 rows
    // tiny_dungeon: 192×176, same geometry as tiny_town
    // Frame constants for these sheets live in src/game/data/tileFrames.ts.
    this.load.spritesheet('roguelike', '/assets/packs/roguelike_rpg.png', {
      frameWidth: 16, frameHeight: 16, spacing: 1,
    })
    this.load.spritesheet('tiny_town', '/assets/packs/tiny_town.png', {
      frameWidth: 16, frameHeight: 16,
    })
    this.load.spritesheet('tiny_dungeon', '/assets/packs/tiny_dungeon.png', {
      frameWidth: 16, frameHeight: 16,
    })

    // ── CRAFTPIX GRASSLAND/FOREST (purchased — see docs/GRAPHICS.md) ────────────
    // Ground atlas: the Tiled/ copy is the FULL tileset (53 cols × 14 rows of
    // 16px, per the pack's .tsx). Frame constants live in tileFrames.ts.
    this.load.spritesheet('cp_ground', '/assets/craftpix/grassland/Tiled/ground_grasss.png', {
      frameWidth: 16, frameHeight: 16,
    })
    // Decal sheet stamped over the grass for texture (12 cols × 14 rows)
    this.load.spritesheet('cp_details', '/assets/craftpix/grassland/PNG/Details.png', {
      frameWidth: 16, frameHeight: 16,
    })
    // Road autotile pack (15 cols × 26 rows of 16px). Two parallel sheets share
    // one layout: '_ground' is the opaque cobble body (with a dirt shoulder),
    // '_grass' is the grass-overhang fringe drawn on top. See tileFrames ROAD_*.
    this.load.spritesheet('road_body', '/assets/craftpix/roads/Road3_ground.png', {
      frameWidth: 16, frameHeight: 16,
    })
    this.load.spritesheet('road_fringe', '/assets/craftpix/roads/Road3_grass.png', {
      frameWidth: 16, frameHeight: 16,
    })
    // Biome-entrance gate sprite (64×64 stone arch) — tinted per biome.
    this.load.image('biome_gate', '/assets/craftpix/desert/PNG/Objects_separately/Gates1.png')
    // Armor/weapon RPG icons (32×32, 18 cols × 11 rows) — empty equipment-slot
    // placeholders. frame = row*18 + col.
    this.load.spritesheet('armor_icons', '/assets/icons/armor_icons.png', {
      frameWidth: 32, frameHeight: 32,
    })
    // Vegetation & props ship as individual alpha PNGs (shadows baked in) —
    // loaded as plain images, no frame math needed.
    const gObj = '/assets/craftpix/grassland/PNG/Objects_separated'
    const fObj = '/assets/craftpix/forest/PNG/Objects_separated'
    for (let i = 1; i <= 4; i++) this.load.image(`cp_tree${i}`, `${gObj}/Tree${i}.png`)
    for (const i of [1, 2, 3, 5, 6, 11]) this.load.image(`cp_ftree${i}`, `${fObj}/Tree${i}.png`)
    for (let i = 1; i <= 6; i++) this.load.image(`cp_bush${i}`, `${gObj}/Bush${i}.png`)
    for (let i = 1; i <= 6; i++) this.load.image(`cp_flower${i}`, `${gObj}/Flower${i}.png`)
    this.load.image('cp_tuft1',  `${gObj}/grass_element2.png`)
    this.load.image('cp_tuft2',  `${gObj}/grass_element3.png`)
    this.load.image('cp_stone1', `${gObj}/Stone1_grass_shadow.png`)
    this.load.image('cp_stone2', `${gObj}/Stone2_grass_shadow.png`)
    this.load.image('cp_ruin1',  `${gObj}/Ruin1_grass_shadow.png`)
    this.load.image('cp_ruin2',  `${gObj}/Ruin2_grass_shadow.png`)
    this.load.image('cp_mushroom_red',   `${fObj}/Red_mushroom1.png`)
    this.load.image('cp_mushroom_brown', `${fObj}/Brown_mushroom.png`)

    // ── CRAFTPIX FOREST props for the Pine Forest biome (Mossy Clearing) ─────────
    // Big trees (mix of round-bushy and pine, ~128px) for the dense canopy.
    for (const i of [1, 2, 3, 5, 6, 7, 11, 13]) this.load.image(`cpf_tree${i}`, `${fObj}/Tree${i}.png`)
    // Small round trees (~64px) for layering inside the clusters.
    for (const i of [4, 10, 12, 14]) this.load.image(`cpf_treesm${i}`, `${fObj}/Tree${i}.png`)
    // Low bushes.
    for (const i of [1, 2, 4, 7, 10]) this.load.image(`cpf_bush${i}`, `${fObj}/Bush${i}.png`)
    // Stumps / snags / a fallen log.
    for (const i of [1, 3, 5]) this.load.image(`cpf_stump${i}`, `${fObj}/Broken_tree${i}.png`)
    // Red & brown mushrooms.
    this.load.image('cpf_redmush1',  `${fObj}/Red_mushroom1.png`)
    this.load.image('cpf_redmush2',  `${fObj}/Red_mushroom2.png`)
    this.load.image('cpf_redmush3',  `${fObj}/Red_mushroom3.png`)
    this.load.image('cpf_brownmush', `${fObj}/Brown_mushroom1.png`)
    // Gray/white boulders sitting in grass.
    this.load.image('cpf_stone1', `${fObj}/Beige_stone_grass1.png`)
    this.load.image('cpf_stone2', `${fObj}/Beige_stone_grass3.png`)
    this.load.image('cpf_stone3', `${fObj}/Beige_stone_grass5.png`)
    this.load.image('cpf_stone4', `${fObj}/Light_stone_grass3.png`)
    // Stone pillar (statue) + ruined pillars feature.
    this.load.image('cpf_pillar', `${fObj}/Light_stone_grass1.png`)
    this.load.image('cpf_ruin',   `${fObj}/Ruin_grass2.png`)
    // Reeds for pond fringes.
    this.load.image('cpf_reeds1', `${fObj}/reeds1.png`)
    this.load.image('cpf_reeds2', `${fObj}/reeds2.png`)
    this.load.image('cpf_reeds3', `${fObj}/reeds3.png`)
    // Lily-pad decal sheet for ponds (240×192, 6 cols × 6 rows of 40×32 pads).
    this.load.spritesheet('cpf_lilis', `${fObj.replace('/Objects_separated', '')}/Water_lilis.png`, {
      frameWidth: 40, frameHeight: 32,
    })

    // ── AMBIENT ANIMALS (CraftPix top-down animal packs) ────────────────────────
    // Each sheet is a 4-direction walk cycle (row 0 down, 1 up, 2 right, 3 left).
    // Frame geometry varies per sheet — see ANIMAL_SHEETS. Walk/idle anims are
    // built from these in create() → makeAnimalAnims.
    for (const s of ANIMAL_SHEETS) {
      this.load.spritesheet(s.key, s.path, { frameWidth: s.frame, frameHeight: s.frame })
    }

    // ── TOWN / TAVERN NPC CHARACTERS (market-square NPC pack) ───────────────────
    // Citizens ship an Idle (12-frame) and Walk (6-frame) sheet, both 32px with
    // the same row convention as the animals. "Others" (lute player, drink
    // trader, eater) are single-row idle loops used as tavern patrons.
    for (const s of NPC_SHEETS) {
      this.load.spritesheet(s.key, s.path, { frameWidth: s.frame, frameHeight: s.frame })
    }

    // ── BUILDINGS ───────────────────────────────────────────────────────────────
    // building_learning = purple house (magical / scholarly)
    // building_combat   = large stone house
    // building_market   = wider commercial house
    this.load.image('building_learning',  '/assets/buildings/house_purple.png')
    this.load.image('building_combat',    '/assets/buildings/house_3.png')
    this.load.image('building_market',    '/assets/buildings/house_2.png')
    this.load.image('building_strategy',  '/assets/buildings/house_1.png')
    // Tavern exterior building (town entrance). The CraftPix tavern Exterior
    // sheet ships a fully-assembled two-storey tavern (red peaked roof, ivy,
    // timber-frame walls, arched door) in its top-left corner. We load the sheet
    // here and crop that building into the `building_tavern` texture in create().
    // A house sprite is loaded as a fallback under a separate key in case the
    // crop is unavailable.
    this.load.image('building_tavern_fallback', '/assets/buildings/house_2.png')
    this.load.image('tav_exterior_raw', '/assets/craftpix/tavern/Tiled/Exterior.png')

    // ── FUNCTION EMBLEM PROPS (CraftPix autumn_vector) ──────────────────────────
    // Standalone top-down props placed beside each shop's door so the building
    // reads as its purpose (see WorldScene.decorateBuilding). Spaces in the source
    // filenames are URL-encoded so the dev server / browser resolve them.
    // (The Forge uses a drawn anvil — the only blacksmith art is a whole
    // building, which read as a second house, so no emblem_forge sprite.)
    const EMBLEM = '/assets/craftpix/autumn_vector/PNG/Top-Down%20Simple%20Autumn_Prop%20-'
    this.load.image('emblem_armory',   `${EMBLEM}%20Weapon%20Rack.png`)
    this.load.image('emblem_alchemy',  `${EMBLEM}%20Cooking%20Pot.png`)
    this.load.image('emblem_market',   `${EMBLEM}%20Stall.png`)
    this.load.image('emblem_training', `${EMBLEM}%20Training%20Dummy.png`)
    this.load.image('emblem_strategy', `${EMBLEM}%20Wagon.png`)

    // ── TAVERN INTERIOR (CraftPix tavern pack) ──────────────────────────────────
    // Two 16px tilesheets drive the TavernScene interior:
    //   tav_walls    160×288  → 10 cols × 18 rows: stone floor + wall/window tiles
    //   tav_interior 336×352  → 21 cols × 22 rows: bar, tables, chairs, barrels…
    // Frame constants for the pieces we use live in TavernScene.
    this.load.spritesheet('tav_walls', '/assets/craftpix/tavern/Tiled/Walls_interior.png', {
      frameWidth: 16, frameHeight: 16,
    })
    this.load.spritesheet('tav_interior', '/assets/craftpix/tavern/Tiled/Interior_1st_floor.png', {
      frameWidth: 16, frameHeight: 16,
    })

    // ── CLASSROOM (Learning Center) interior pieces ─────────────────────────────
    //   class_floor   160×288 → 10 cols × 18 rows: warm wood-plank floor tiles
    //                 live at cols 0–1, rows 14–15 (see ClassroomScene).
    //   class_objects 304×160 → 19 cols × 10 rows: chapel furniture; the
    //                 desk-with-open-book sits at cols 12–15, rows 8–9.
    this.load.spritesheet('class_floor', '/assets/craftpix/interiors/classroom_floor.png', {
      frameWidth: 16, frameHeight: 16,
    })
    this.load.spritesheet('class_objects', '/assets/craftpix/interiors/classroom_objects.png', {
      frameWidth: 16, frameHeight: 16,
    })

    // ── WORLD PROPS ─────────────────────────────────────────────────────────────
    this.load.image('well',     '/assets/buildings/well.png')
    this.load.image('lamppost', '/assets/props/lamppost.png')
    this.load.image('bench',    '/assets/props/bench.png')
    this.load.image('barrel',   '/assets/props/barrel.png')
    this.load.image('sign',     '/assets/props/sign.png')
    // (trees and rocks now come from the Kenney packs above)

    // ── CHEST (keep existing SVG) ────────────────────────────────────────────────
    this.load.image('chest', '/assets/craftpix/props/treasure_chest.png')

    // ── SHADOW (programmatic — 40x8 ellipse) ────────────────────────────────────
    const shadowGfx = this.make.graphics({ x: 0, y: 0 })
    shadowGfx.fillStyle(0x000000, 0.25)
    shadowGfx.fillEllipse(20, 4, 36, 8)
    shadowGfx.generateTexture('shadow', 40, 8)
    shadowGfx.destroy()

  }

  create() {
    this.buildTavernFacade()
    this.makeAnimalAnims()
    this.makeNpcAnims()
    this.scene.start('WorldScene')
  }

  /**
   * Build the 4-direction walk animations for every ambient animal species.
   * Keys: `${id}_walk_{down|up|right|left}`. Frame index = row * cols + col, so
   * each direction's walk cycle is `walkFrames` frames starting at the row head.
   */
  private makeAnimalAnims() {
    for (const sp of Object.values(ANIMAL_SPECIES)) {
      for (const [dir, row] of Object.entries(DIR_ROW)) {
        const key = `${sp.id}_walk_${dir}`
        if (this.anims.exists(key)) continue
        const start = row * sp.cols
        this.anims.create({
          key,
          frames: this.anims.generateFrameNumbers(sp.sheet, {
            start, end: start + sp.walkFrames - 1,
          }),
          frameRate: 9,
          repeat: -1,
        })
      }
    }
  }

  /**
   * Build idle animations for the NPC character sheets. Citizen idle sheets are
   * 12-frame, 4-direction; we use the down-facing row for standing townsfolk.
   * The single-row "others" (lute/drinks/eater) loop their whole strip in place.
   */
  private makeNpcAnims() {
    for (const s of NPC_SHEETS) {
      const key = `${s.key}_idle`
      if (this.anims.exists(key)) continue
      // down-facing row for multi-direction sheets, else the whole single row.
      const start = s.idleRow !== undefined ? s.idleRow * s.cols : 0
      const count = s.idleFrames ?? s.cols
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers(s.key, {
          start, end: start + count - 1,
        }),
        frameRate: s.idleFps ?? 4,
        repeat: -1,
      })
    }
  }

  /**
   * Crop the pre-assembled tavern building out of the CraftPix Exterior sheet
   * into a `building_tavern` texture. The two-storey tavern (red peaked roof,
   * ivy, timber-frame walls, arched double door) sits in the sheet's top-left
   * corner. We copy just that sub-rectangle into a fresh texture so the town
   * facade reads like the reference. Falls back to the house sprite on failure.
   */
  private buildTavernFacade() {
    const SRC = 'tav_exterior_raw'
    if (!this.textures.exists(SRC)) {
      if (this.textures.exists('building_tavern_fallback')) {
        this.textures.addImage('building_tavern',
          this.textures.get('building_tavern_fallback').getSourceImage() as HTMLImageElement)
      }
      return
    }
    // Building bounds within Exterior.png (measured from the sheet): the facade
    // runs roughly x:6..182, y:6..176. A small margin keeps the roof apex + the
    // ground-floor door fully inside the crop without grabbing the neighbour.
    const cx = 5, cy = 4, cw = 180, ch = 174
    const rt = this.add.renderTexture(0, 0, cw, ch).setVisible(false)
    rt.drawFrame(SRC, undefined, -cx, -cy)
    rt.saveTexture('building_tavern')
    rt.destroy()
  }
}
