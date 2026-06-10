import Phaser from 'phaser'

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

    // ── BUILDINGS ───────────────────────────────────────────────────────────────
    // building_learning = purple house (magical / scholarly)
    // building_combat   = large stone house
    // building_market   = wider commercial house
    this.load.image('building_learning',  '/assets/buildings/house_purple.png')
    this.load.image('building_combat',    '/assets/buildings/house_3.png')
    this.load.image('building_market',    '/assets/buildings/house_2.png')
    this.load.image('building_strategy',  '/assets/buildings/house_1.png')

    // ── WORLD PROPS ─────────────────────────────────────────────────────────────
    this.load.image('well',     '/assets/buildings/well.png')
    this.load.image('lamppost', '/assets/props/lamppost.png')
    this.load.image('bench',    '/assets/props/bench.png')
    this.load.image('barrel',   '/assets/props/barrel.png')
    this.load.image('sign',     '/assets/props/sign.png')
    // (trees and rocks now come from the Kenney packs above)

    // ── CHEST (keep existing SVG) ────────────────────────────────────────────────
    this.load.image('chest', '/assets/sprites/chest.svg')

    // ── SHADOW (programmatic — 40x8 ellipse) ────────────────────────────────────
    const shadowGfx = this.make.graphics({ x: 0, y: 0 })
    shadowGfx.fillStyle(0x000000, 0.25)
    shadowGfx.fillEllipse(20, 4, 36, 8)
    shadowGfx.generateTexture('shadow', 40, 8)
    shadowGfx.destroy()

  }

  create() {
    this.scene.start('WorldScene')
  }
}
