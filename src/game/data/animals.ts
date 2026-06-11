// ============================================================
// animals.ts — species table for wandering ambient overworld
// animals. Each animal is rendered from a real CraftPix top-down
// spritesheet (loaded in BootScene under the `sheet` key) with a
// 4-direction walk cycle. Pets roam near the city; farm animals
// roam the city and the open world; wild animals scatter across
// the world outside the town.
//
// All sheets share the same row convention (verified against the
// art): row 0 = DOWN, row 1 = UP, row 2 = RIGHT, row 3 = LEFT,
// with the walk cycle in the first `walkFrames` columns of each
// row. `frame` is the square cell size; `cols` is the row stride
// (frames per row). Frame index = row * cols + col.
// ============================================================

export type AnimalCategory = 'pet' | 'farm' | 'wild'

/** Direction-row indices, shared by every animal sheet. Verified against the
 *  art: row 2 is the LEFT-facing side walk and row 3 is the RIGHT-facing one
 *  (consistent across all the packs we use). */
export const DIR_ROW = { down: 0, up: 1, right: 3, left: 2 } as const
export type Facing = keyof typeof DIR_ROW

export interface AnimalSpecies {
  id: string
  name: string
  category: AnimalCategory
  /** Spritesheet texture key (loaded in BootScene from /assets/craftpix/animals). */
  sheet: string
  /** Square cell size in px. */
  frame: number
  /** Frames per row (row stride) in the sheet. */
  cols: number
  /** Walk-cycle length per direction (first N columns of each row). */
  walkFrames: number
  /** On-screen scale applied to the sprite. */
  scale: number
  /** Footprint width in px, used to size the physics body. */
  bodySize: number
  /** Base wander speed in px/sec. */
  speed: number
}

export const ANIMAL_SPECIES: Record<string, AnimalSpecies> = {
  // ── Pets (near the city) ─────────────────────────────────
  cat: {
    id: 'cat', name: 'Cat', category: 'pet',
    sheet: 'animal_cat', frame: 32, cols: 8, walkFrames: 6,
    scale: 1.0, bodySize: 14, speed: 46,
  },
  dog: {
    id: 'dog', name: 'Dog', category: 'pet',
    sheet: 'animal_dog', frame: 32, cols: 6, walkFrames: 6,
    scale: 1.05, bodySize: 18, speed: 54,
  },

  // ── Farm animals (city + open world) ─────────────────────
  cow: {
    id: 'cow', name: 'Cow', category: 'farm',
    sheet: 'animal_cow', frame: 64, cols: 6, walkFrames: 6,
    scale: 0.8, bodySize: 30, speed: 26,
  },
  sheep: {
    id: 'sheep', name: 'Sheep', category: 'farm',
    sheet: 'animal_sheep', frame: 32, cols: 6, walkFrames: 6,
    scale: 1.1, bodySize: 22, speed: 30,
  },
  chicken: {
    id: 'chicken', name: 'Chicken', category: 'farm',
    sheet: 'animal_chicken', frame: 32, cols: 6, walkFrames: 6,
    scale: 0.85, bodySize: 13, speed: 40,
  },
  pig: {
    id: 'pig', name: 'Pig', category: 'farm',
    sheet: 'animal_pig', frame: 32, cols: 6, walkFrames: 6,
    scale: 1.0, bodySize: 18, speed: 28,
  },
  piglet: {
    id: 'piglet', name: 'Piglet', category: 'farm',
    sheet: 'animal_pig', frame: 32, cols: 6, walkFrames: 6,
    scale: 0.7, bodySize: 12, speed: 36,
  },

  // ── Wild animals (outside the city) ──────────────────────
  deer: {
    id: 'deer', name: 'Deer', category: 'wild',
    sheet: 'animal_deer', frame: 32, cols: 6, walkFrames: 6,
    scale: 1.15, bodySize: 22, speed: 60,
  },
  fox: {
    id: 'fox', name: 'Fox', category: 'wild',
    sheet: 'animal_fox', frame: 32, cols: 6, walkFrames: 6,
    scale: 1.0, bodySize: 16, speed: 66,
  },
  rabbit: {
    id: 'rabbit', name: 'Rabbit', category: 'wild',
    sheet: 'animal_rabbit', frame: 32, cols: 6, walkFrames: 6,
    scale: 0.85, bodySize: 12, speed: 58,
  },
  boar: {
    id: 'boar', name: 'Boar', category: 'wild',
    sheet: 'animal_boar', frame: 32, cols: 6, walkFrames: 6,
    scale: 1.1, bodySize: 22, speed: 50,
  },
  grouse: {
    id: 'grouse', name: 'Black Grouse', category: 'wild',
    sheet: 'animal_grouse', frame: 32, cols: 6, walkFrames: 6,
    scale: 0.85, bodySize: 13, speed: 38,
  },
}

/** Every distinct spritesheet, for BootScene to load + build anims from. */
export const ANIMAL_SHEETS: { key: string; path: string; frame: number; cols: number; walkFrames: number }[] = [
  { key: 'animal_cat',     path: '/assets/craftpix/animals/cat.png',     frame: 32, cols: 8, walkFrames: 6 },
  { key: 'animal_dog',     path: '/assets/craftpix/animals/dog.png',     frame: 32, cols: 6, walkFrames: 6 },
  { key: 'animal_cow',     path: '/assets/craftpix/animals/cow.png',     frame: 64, cols: 6, walkFrames: 6 },
  { key: 'animal_sheep',   path: '/assets/craftpix/animals/sheep.png',   frame: 32, cols: 6, walkFrames: 6 },
  { key: 'animal_chicken', path: '/assets/craftpix/animals/chicken.png', frame: 32, cols: 6, walkFrames: 6 },
  { key: 'animal_pig',     path: '/assets/craftpix/animals/pig.png',     frame: 32, cols: 6, walkFrames: 6 },
  { key: 'animal_deer',    path: '/assets/craftpix/animals/deer.png',    frame: 32, cols: 6, walkFrames: 6 },
  { key: 'animal_fox',     path: '/assets/craftpix/animals/fox.png',     frame: 32, cols: 6, walkFrames: 6 },
  { key: 'animal_rabbit',  path: '/assets/craftpix/animals/rabbit.png',  frame: 32, cols: 6, walkFrames: 6 },
  { key: 'animal_boar',    path: '/assets/craftpix/animals/boar.png',    frame: 32, cols: 6, walkFrames: 6 },
  { key: 'animal_grouse',  path: '/assets/craftpix/animals/grouse.png',  frame: 32, cols: 6, walkFrames: 6 },
]

export const PET_IDS = ['cat', 'dog'] as const
export const FARM_IDS = ['cow', 'sheep', 'chicken', 'pig', 'piglet'] as const
export const WILD_IDS = ['deer', 'fox', 'rabbit', 'boar', 'grouse'] as const
