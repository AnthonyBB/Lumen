/**
 * Verified frame constants for the Kenney CC0 spritesheets in
 * public/assets/packs/ (see public/assets/CREDITS.md).
 *
 * Sheets (loaded in BootScene):
 *   'roguelike'    — roguelike_rpg.png, 16×16 tiles, 1px spacing, 57 cols × 31 rows.
 *                    frame = row * 57 + col
 *   'tiny_town'    — tiny_town.png, 16×16 tiles, no spacing, 12 cols × 11 rows.
 *                    frame = row * 12 + col
 *   'tiny_dungeon' — tiny_dungeon.png, same geometry as tiny_town.
 *
 * Every constant below was visually verified by extracting the tile from the
 * sheet. The (col,row) of each frame is noted in its comment.
 */

export const RL_COLS = 57
export const TT_COLS = 12

const rl = (col: number, row: number) => row * RL_COLS + col
const tt = (col: number, row: number) => row * TT_COLS + col
// tiny_dungeon shares tiny_town geometry (12 cols × 11 rows, 16px, no spacing)
const td = (col: number, row: number) => row * TT_COLS + col

// ── Roguelike: base terrain (each has two speckled variants) ────────────────
export const RL_WATER       = rl(0, 0)   // (0,0)  light blue water
export const RL_WATER2      = rl(1, 0)   // (1,0)  water variant
export const RL_GRASS       = rl(5, 0)   // (5,0)  plain green grass
export const RL_GRASS2      = rl(5, 1)   // (5,1)  grass variant
export const RL_DIRT        = rl(6, 0)   // (6,0)  brown dirt
export const RL_DIRT2       = rl(6, 1)   // (6,1)  dirt variant
export const RL_SNOW        = rl(7, 0)   // (7,0)  blue-gray snow/ice
export const RL_SNOW2       = rl(7, 1)   // (7,1)  snow variant
export const RL_SAND        = rl(8, 0)   // (8,0)  cream desert sand
export const RL_SAND2       = rl(8, 1)   // (8,1)  sand variant
export const RL_GRASS_PEBBLES = rl(9, 1) // (9,1)  grass with gray pebbles
export const RL_GRASS_LUSH  = rl(3, 16)  // (3,16) brighter lush grass fill ((2,16) is an edge-transition tile)

// ── Roguelike: 2×2 decoration patches (motif centred on shared corner) ──────
// Order: top-left, top-right, bottom-left, bottom-right.
export const RL_WATER_LILY: [number, number, number, number] =
  [rl(0, 1), rl(1, 1), rl(0, 2), rl(1, 2)]      // (0..1, 1..2) lily islet in water
export const RL_WATER_ROCK: [number, number, number, number] =
  [rl(0, 3), rl(1, 3), rl(0, 4), rl(1, 4)]      // (0..1, 3..4) rock islet in water
export const RL_FLOWERS_ORANGE: [number, number, number, number] =
  [rl(0, 6), rl(1, 6), rl(0, 7), rl(1, 7)]      // (0..1, 6..7) orange flowers on grass
export const RL_FLOWERS_WHITE: [number, number, number, number] =
  [rl(0, 9), rl(1, 9), rl(0, 10), rl(1, 10)]    // (0..1, 9..10) white flowers on grass
export const RL_FLOWERS_BLUE: [number, number, number, number] =
  [rl(0, 12), rl(1, 12), rl(0, 13), rl(1, 13)]  // (0..1, 12..13) blue flowers on grass
export const RL_SAND_ISLAND: [number, number, number, number] =
  [rl(7, 19), rl(8, 19), rl(7, 20), rl(8, 20)]  // (7..8, 19..20) round sand patch

// ── Roguelike: single-tile vegetation (row 9) ───────────────────────────────
export const RL_TREE_GREEN_SM  = rl(13, 9)  // (13,9) small round green tree
export const RL_TREE_TEAL_SM   = rl(15, 9)  // (15,9) small round teal tree
export const RL_PINE_GREEN_SM  = rl(16, 9)  // (16,9) small green pine
export const RL_PINE_TEAL_SM   = rl(18, 9)  // (18,9) small teal pine
export const RL_BUSH_GREEN     = rl(19, 9)  // (19,9) green bush
export const RL_BUSH_ORANGE    = rl(20, 9)  // (20,9) orange bush
export const RL_BUSH_TEAL      = rl(21, 9)  // (21,9) teal bush
export const RL_CACTUS         = rl(22, 9)  // (22,9) saguaro cactus

// ── Roguelike: tall trees (top tile row 10, trunk tile row 11) ──────────────
export const RL_TREE_GREEN_TALL:  [number, number] = [rl(13, 10), rl(13, 11)]
export const RL_TREE_ORANGE_TALL: [number, number] = [rl(14, 10), rl(14, 11)]
export const RL_TREE_TEAL_TALL:   [number, number] = [rl(15, 10), rl(15, 11)]
export const RL_PINE_GREEN_TALL:  [number, number] = [rl(16, 10), rl(16, 11)]
export const RL_PINE_TEAL_TALL:   [number, number] = [rl(18, 10), rl(18, 11)]
export const RL_TREE_BERRY_TALL:  [number, number] = [rl(23, 10), rl(23, 11)]

export const RL_GRASS_TUFT  = rl(22, 10)  // (22,10) small grass tuft

// ── Roguelike: rocks (cols 54-56) ───────────────────────────────────────────
export const RL_ROCKS_BROWN      = [rl(54, 19), rl(55, 19), rl(56, 19)]  // (54..56,19)
export const RL_ROCKS_BROWN_MOSS = [rl(54, 20), rl(55, 20), rl(56, 20)]  // (54..56,20)
export const RL_ROCKS_GRAY       = [rl(54, 21), rl(55, 21), rl(56, 21)]  // (54..56,21)
export const RL_ROCKS_GRAY_MOSS  = [rl(54, 22), rl(55, 22), rl(56, 22)]  // (54..56,22)
export const RL_ROCKS_WATER      = [rl(54, 23), rl(55, 23), rl(56, 23)]  // (54..56,23) rock in water

// ── Tiny Town: trees & forest props ─────────────────────────────────────────
export const TT_POPLAR_ORANGE: [number, number] = [tt(3, 0), tt(3, 1)]  // (3,0)+(3,1) tall orange poplar
export const TT_POPLAR_GREEN:  [number, number] = [tt(4, 0), tt(4, 1)]  // (4,0)+(4,1) tall green poplar
export const TT_TREE_ROUND     = tt(5, 0)  // (5,0)  round green tree (single tile)
export const TT_MUSHROOMS      = tt(5, 2)  // (5,2)  red mushrooms

// ── Tiny Dungeon: monsters & creatures ──────────────────────────────────────
// All nine frames pixel-verified by extracting upscaled tiles from the sheet.
// Character block layout: row 7 = heroes + chests (mimic at col 8),
// row 8 = knights/princess + shields/swords, row 9 = monsters then potions,
// row 10 = monsters then torches/wands.

// Easy tier — small critters
export const TD_SLIME   = td(0, 9)  // (0,9)  green slime blob
export const TD_BAT     = td(0, 10) // (0,10) brown bat
export const TD_SPIDER  = td(2, 10) // (2,10) brown spider

// Medium tier — mid creatures
export const TD_GHOST   = td(1, 10) // (1,10) white ghost
export const TD_CRAB    = td(2, 9)  // (2,9)  red crab creature
export const TD_CRITTER = td(3, 10) // (3,10) shelled brown critter

// Hard tier — tough creatures
export const TD_CYCLOPS = td(1, 9)  // (1,9)  tan one-eyed brute
export const TD_HOODED  = td(3, 9)  // (3,9)  hooded red-eyed creature
export const TD_MIMIC   = td(8, 7)  // (8,7)  mimic chest with teeth

// Difficulty-tier pools used by BattleScene / BiomeScene
export const TD_MONSTERS: Record<'easy' | 'medium' | 'hard', number[]> = {
  easy:   [TD_SLIME, TD_BAT, TD_SPIDER],
  medium: [TD_GHOST, TD_CRAB, TD_CRITTER],
  hard:   [TD_CYCLOPS, TD_HOODED, TD_MIMIC],
}
