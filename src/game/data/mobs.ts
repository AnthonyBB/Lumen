/**
 * Mob bestiary — archetype-driven mob stats for biome encounters.
 *
 * Every mob type is a MobArchetype: a set of 1-10 stat WEIGHTS describing the
 * creature's identity (trolls hit hard but lumber, wolves are fast and
 * fragile, ghosts cast with intelligence). spawnMob() turns an archetype +
 * level (1-100) into a concrete MobInstance via the scaling formulas below.
 *
 * Sprites reuse the small set of verified Tiny Dungeon frames (tileFrames.ts)
 * and are differentiated per archetype with a Phaser tint — e.g. the cyclops
 * frame is a tan Desert Troll, an icy-blue Frost Troll, and a snowy Yeti.
 *
 * Each archetype belongs to one of three POOL tiers (easy/medium/hard). A
 * campaign is entered at one of FIVE difficulty MODES (see DIFFICULTIES); each
 * mode maps to a pool tier plus a level + mob-count band, so Beginner/Easy draw
 * gentle low-level fights from the easy pool while Hard/Expert push the hard
 * pool to high levels.
 */

import {
  TD_SLIME, TD_BAT, TD_SPIDER,
  TD_GHOST, TD_CRAB, TD_CRITTER,
  TD_CYCLOPS, TD_HOODED, TD_MIMIC,
} from './tileFrames'

// ── Types ───────────────────────────────────────────────────────────────────

export type MobTier = 'easy' | 'medium' | 'hard'

export interface MobArchetype {
  id: string
  name: string
  description: string      // one kid-friendly line
  frame: number            // tiny_dungeon frame (shared frames, see tileFrames)
  tint: number             // 0xffffff = untinted
  // Stat WEIGHTS (1-10 relative emphasis, fed into the level-scaling formulas)
  strength: number
  constitution: number
  dexterity: number
  intelligence: number
  spirit: number
  speed: number            // drives combat initiative
  /** Caster-flavored mobs derive attack from intelligence instead of strength. */
  caster?: boolean
  biomes: string[]         // which of the 8 biomes it appears in
  tier: MobTier            // which biome-location difficulty it spawns at
}

export interface MobInstance {
  archetypeId: string
  name: string
  level: number            // 1-100
  maxHp: number
  attack: number           // physical (or magical, for casters) damage base
  defense: number
  speed: number
  frame: number
  tint: number
}

// ── Level bands per biome-location difficulty ───────────────────────────────

export const TIER_LEVEL_BANDS: Record<MobTier, [number, number]> = {
  easy:   [1, 20],
  medium: [21, 55],
  hard:   [56, 100],
}

// ── Difficulty modes (per campaign) ─────────────────────────────────────────
//
// A campaign (formerly "biome") can be entered at one of FIVE difficulty modes.
// Each mode maps to a bestiary POOL (the archetype `tier`), a mob LEVEL band,
// and a per-encounter mob COUNT band. The two new gentle modes — Beginner and
// Easy — draw from the easy pool at very low levels so a brand-new player can
// actually win. Medium/Hard/Expert ramp up from there.
//
// This is the single source of truth for difficulty on the CLIENT. The server
// keeps a matching (small) copy for loot scaling — keep the keys in sync (see
// server/game/loot.ts).
export type Difficulty = 'beginner' | 'easy' | 'medium' | 'hard' | 'expert'

export interface DifficultyConfig {
  key: Difficulty
  label: string
  /** Bestiary archetype pool this mode draws from. */
  pool: MobTier
  /** Mob level band [min, max]. */
  band: [number, number]
  /** Per-encounter mob count band [min, max] (ramps across the campaign). */
  count: [number, number]
  /** UI accent as a CSS color string. */
  color: string
  /** UI accent as a Phaser color number. */
  colorNum: number
  /** Menu icon. */
  icon: string
}

export const DIFFICULTIES: Record<Difficulty, DifficultyConfig> = {
  beginner: { key: 'beginner', label: 'Beginner', pool: 'easy',   band: [1, 4],    count: [1, 2],  color: '#9be88a', colorNum: 0x9be88a, icon: '🌱' },
  easy:     { key: 'easy',     label: 'Easy',     pool: 'easy',   band: [3, 12],   count: [2, 3],  color: '#88ff88', colorNum: 0x88ff88, icon: '🌿' },
  medium:   { key: 'medium',   label: 'Medium',   pool: 'medium', band: [14, 35],  count: [3, 5],  color: '#ffcc44', colorNum: 0xffcc44, icon: '🔥' },
  hard:     { key: 'hard',     label: 'Hard',     pool: 'hard',   band: [38, 65],  count: [5, 8],  color: '#ff6666', colorNum: 0xff6666, icon: '💀' },
  expert:   { key: 'expert',   label: 'Expert',   pool: 'hard',   band: [68, 100], count: [7, 10], color: '#c98bff', colorNum: 0xc98bff, icon: '👑' },
}

/** Difficulty keys ordered easiest → hardest (drives the campaign menu order). */
export const DIFFICULTY_ORDER: Difficulty[] = ['beginner', 'easy', 'medium', 'hard', 'expert']

// ── Bestiary ────────────────────────────────────────────────────────────────

export const MOB_ARCHETYPES: MobArchetype[] = [
  // ── Desert ────────────────────────────────────────────────────────────────
  {
    id: 'sand_scorpion', name: 'Sand Scorpion',
    description: 'A skittering scorpion whose pincers snap faster than you can blink.',
    frame: TD_SPIDER, tint: 0xf0d878,
    strength: 4, constitution: 3, dexterity: 8, intelligence: 2, spirit: 2, speed: 6,
    biomes: ['Desert'], tier: 'easy',
  },
  {
    id: 'dust_bat', name: 'Dust Bat',
    description: 'A flittery bat that kicks up little sandstorms with its wings.',
    frame: TD_BAT, tint: 0xe0cc99,
    strength: 2, constitution: 2, dexterity: 7, intelligence: 3, spirit: 3, speed: 8,
    biomes: ['Desert'], tier: 'easy',
  },
  {
    id: 'sand_crab', name: 'Sand Crab',
    description: 'A stout crab with a shell as tough as sun-baked clay.',
    frame: TD_CRAB, tint: 0xf0d890,
    strength: 5, constitution: 7, dexterity: 4, intelligence: 2, spirit: 2, speed: 3,
    biomes: ['Desert'], tier: 'medium',
  },
  {
    id: 'mummy_hound', name: 'Mummy Hound',
    description: 'A bandage-wrapped hound that guards forgotten ruins.',
    frame: TD_HOODED, tint: 0xddd5aa,
    strength: 6, constitution: 5, dexterity: 5, intelligence: 3, spirit: 5, speed: 5,
    biomes: ['Desert'], tier: 'medium',
  },
  {
    id: 'desert_troll', name: 'Desert Troll',
    description: 'A huge, slow brute who naps under dunes and wakes up grumpy.',
    frame: TD_CYCLOPS, tint: 0xddbb66,
    strength: 9, constitution: 8, dexterity: 3, intelligence: 2, spirit: 2, speed: 2,
    biomes: ['Desert'], tier: 'hard',
  },
  {
    id: 'dune_mimic', name: 'Dune Mimic',
    description: 'A sneaky treasure chest that is definitely NOT full of gold.',
    frame: TD_MIMIC, tint: 0xf0e0a0,
    strength: 7, constitution: 7, dexterity: 4, intelligence: 5, spirit: 4, speed: 3,
    biomes: ['Desert'], tier: 'hard',
  },

  // ── Pine Forest ───────────────────────────────────────────────────────────
  {
    id: 'pine_slime', name: 'Pine Slime',
    description: 'A wobbly green blob that smells faintly of pine needles.',
    frame: TD_SLIME, tint: 0x88cc66,
    strength: 2, constitution: 7, dexterity: 2, intelligence: 1, spirit: 2, speed: 2,
    biomes: ['Pine Forest'], tier: 'easy',
  },
  {
    id: 'cave_bat', name: 'Cave Bat',
    description: 'A squeaky bat that darts out of hollow trees and dark caves.',
    frame: TD_BAT, tint: 0xffffff,
    strength: 2, constitution: 2, dexterity: 7, intelligence: 2, spirit: 3, speed: 8,
    biomes: ['Pine Forest', 'Deciduous Forest'], tier: 'easy',
  },
  {
    id: 'forest_wolf', name: 'Forest Wolf',
    description: 'A swift gray wolf that races between the trees.',
    frame: TD_HOODED, tint: 0xbbc4cc,
    strength: 4, constitution: 3, dexterity: 7, intelligence: 3, spirit: 3, speed: 9,
    biomes: ['Pine Forest', 'Deciduous Forest'], tier: 'easy',
  },
  {
    id: 'timber_spider', name: 'Timber Spider',
    description: 'A leggy spider that strings webs between pine trunks.',
    frame: TD_SPIDER, tint: 0x99bb77,
    strength: 4, constitution: 4, dexterity: 7, intelligence: 3, spirit: 2, speed: 6,
    biomes: ['Pine Forest'], tier: 'medium',
  },
  {
    id: 'thorn_critter', name: 'Thorn Critter',
    description: 'A round little creature covered in prickly pine burrs.',
    frame: TD_CRITTER, tint: 0x88aa55,
    strength: 5, constitution: 6, dexterity: 3, intelligence: 2, spirit: 3, speed: 3,
    biomes: ['Pine Forest'], tier: 'medium',
  },
  {
    id: 'moss_troll', name: 'Moss Troll',
    description: 'A mossy giant who mistakes hikers for hugging practice.',
    frame: TD_CYCLOPS, tint: 0x99cc77,
    strength: 9, constitution: 8, dexterity: 3, intelligence: 2, spirit: 3, speed: 2,
    biomes: ['Pine Forest'], tier: 'hard',
  },
  {
    id: 'shadow_lynx', name: 'Shadow Lynx',
    description: 'A sleek twilight cat that pounces before you see it move.',
    frame: TD_HOODED, tint: 0x9988cc,
    strength: 6, constitution: 4, dexterity: 8, intelligence: 4, spirit: 4, speed: 9,
    biomes: ['Pine Forest'], tier: 'hard',
  },

  // ── Deciduous Forest ──────────────────────────────────────────────────────
  {
    id: 'acorn_slime', name: 'Acorn Slime',
    description: 'A gooey blob that hoards acorns inside itself like a piggy bank.',
    frame: TD_SLIME, tint: 0xbb9944,
    strength: 2, constitution: 6, dexterity: 2, intelligence: 1, spirit: 2, speed: 2,
    biomes: ['Deciduous Forest'], tier: 'easy',
  },
  {
    id: 'will_o_wisp', name: 'Will-o-Wisp',
    description: 'A glowing forest spirit that loves leading travelers in circles.',
    frame: TD_GHOST, tint: 0xaaffdd,
    strength: 1, constitution: 2, dexterity: 4, intelligence: 8, spirit: 8, speed: 6,
    caster: true,
    biomes: ['Deciduous Forest'], tier: 'medium',
  },
  {
    id: 'woodland_boar', name: 'Woodland Boar',
    description: 'A bristly boar that charges first and asks questions never.',
    frame: TD_CRITTER, tint: 0xbb8855,
    strength: 6, constitution: 6, dexterity: 4, intelligence: 2, spirit: 2, speed: 5,
    biomes: ['Deciduous Forest'], tier: 'medium',
  },
  {
    id: 'woodland_bear', name: 'Woodland Bear',
    description: 'A burly bear who guards the deep woods and all its berries.',
    frame: TD_CYCLOPS, tint: 0xaa7744,
    strength: 9, constitution: 9, dexterity: 3, intelligence: 3, spirit: 3, speed: 3,
    biomes: ['Deciduous Forest'], tier: 'hard',
  },

  // ── Swamp ─────────────────────────────────────────────────────────────────
  {
    id: 'bog_slime', name: 'Bog Slime',
    description: 'A squelchy blob of swamp goo that leaves muddy footprints. Somehow.',
    frame: TD_SLIME, tint: 0x66aa44,
    strength: 2, constitution: 7, dexterity: 2, intelligence: 1, spirit: 2, speed: 1,
    biomes: ['Swamp'], tier: 'easy',
  },
  {
    id: 'mud_crab', name: 'Mud Crab',
    description: 'A grumpy crab that pinches anything that disturbs its mud bath.',
    frame: TD_CRAB, tint: 0xaa8855,
    strength: 4, constitution: 6, dexterity: 4, intelligence: 2, spirit: 2, speed: 3,
    biomes: ['Swamp'], tier: 'easy',
  },
  {
    id: 'swamp_serpent', name: 'Swamp Serpent',
    description: 'A slithery serpent that glides silently through the reeds.',
    frame: TD_CRITTER, tint: 0x77bb66,
    strength: 5, constitution: 4, dexterity: 7, intelligence: 3, spirit: 3, speed: 7,
    biomes: ['Swamp'], tier: 'medium',
  },
  {
    id: 'marsh_ghost', name: 'Marsh Ghost',
    description: 'A misty spirit that hums old songs over the bog at night.',
    frame: TD_GHOST, tint: 0xaaffcc,
    strength: 1, constitution: 3, dexterity: 4, intelligence: 7, spirit: 8, speed: 5,
    caster: true,
    biomes: ['Swamp'], tier: 'medium',
  },
  {
    id: 'bog_troll', name: 'Bog Troll',
    description: 'A moss-covered giant who is very strong and VERY slow.',
    frame: TD_CYCLOPS, tint: 0x88aa55,
    strength: 9, constitution: 9, dexterity: 2, intelligence: 2, spirit: 2, speed: 1,
    biomes: ['Swamp'], tier: 'hard',
  },
  {
    id: 'venom_spider', name: 'Venom Spider',
    description: 'A quick purple spider whose bite tingles like static.',
    frame: TD_SPIDER, tint: 0xbb88ee,
    strength: 5, constitution: 4, dexterity: 9, intelligence: 4, spirit: 3, speed: 8,
    biomes: ['Swamp'], tier: 'hard',
  },

  // ── Snow ──────────────────────────────────────────────────────────────────
  {
    id: 'snow_hare', name: 'Snow Hare',
    description: 'A fluffy white hare that hops faster than a snowball rolls.',
    frame: TD_CRITTER, tint: 0xeeffff,
    strength: 2, constitution: 2, dexterity: 7, intelligence: 2, spirit: 3, speed: 9,
    biomes: ['Snow'], tier: 'easy',
  },
  {
    id: 'frost_bat', name: 'Frost Bat',
    description: 'A pale bat whose wings sparkle with tiny ice crystals.',
    frame: TD_BAT, tint: 0xaaddff,
    strength: 2, constitution: 2, dexterity: 6, intelligence: 3, spirit: 4, speed: 8,
    biomes: ['Snow'], tier: 'easy',
  },
  {
    id: 'ice_slime', name: 'Ice Slime',
    description: 'A half-frozen blob that is basically a living snow cone.',
    frame: TD_SLIME, tint: 0x99ddff,
    strength: 3, constitution: 8, dexterity: 2, intelligence: 2, spirit: 3, speed: 1,
    biomes: ['Snow'], tier: 'medium',
  },
  {
    id: 'frost_wraith', name: 'Frost Wraith',
    description: 'A shimmering spirit of winter that whispers chilly riddles.',
    frame: TD_GHOST, tint: 0xcceeff,
    strength: 1, constitution: 3, dexterity: 4, intelligence: 8, spirit: 8, speed: 6,
    caster: true,
    biomes: ['Snow'], tier: 'medium',
  },
  {
    id: 'frost_troll', name: 'Frost Troll',
    description: 'A blue-skinned giant with icicles for a beard.',
    frame: TD_CYCLOPS, tint: 0xaaddff,
    strength: 9, constitution: 8, dexterity: 3, intelligence: 2, spirit: 3, speed: 2,
    biomes: ['Snow'], tier: 'hard',
  },
  {
    id: 'yeti', name: 'Yeti',
    description: 'The legendary mountain giant. Mostly fur. Entirely muscle.',
    frame: TD_CYCLOPS, tint: 0xe8f4ff,
    strength: 10, constitution: 9, dexterity: 2, intelligence: 1, spirit: 3, speed: 3,
    biomes: ['Snow'], tier: 'hard',
  },

  // ── Grassland ─────────────────────────────────────────────────────────────
  {
    id: 'meadow_slime', name: 'Meadow Slime',
    description: 'A cheerful green blob that bounces through the wildflowers.',
    frame: TD_SLIME, tint: 0xffffff,
    strength: 2, constitution: 6, dexterity: 2, intelligence: 1, spirit: 2, speed: 2,
    biomes: ['Grassland'], tier: 'easy',
  },
  {
    id: 'prairie_pup', name: 'Prairie Pup',
    description: 'A zippy little critter that pops in and out of burrows.',
    frame: TD_CRITTER, tint: 0xddbb88,
    strength: 3, constitution: 3, dexterity: 6, intelligence: 3, spirit: 3, speed: 8,
    biomes: ['Grassland'], tier: 'easy',
  },
  {
    id: 'tallgrass_spider', name: 'Tallgrass Spider',
    description: 'A green spider that hides in the grass and startles picnickers.',
    frame: TD_SPIDER, tint: 0xaacc66,
    strength: 3, constitution: 3, dexterity: 7, intelligence: 2, spirit: 2, speed: 6,
    biomes: ['Grassland'], tier: 'easy',
  },
  {
    id: 'wild_boar', name: 'Wild Boar',
    description: 'A stubborn boar with tusks and absolutely no patience.',
    frame: TD_CRITTER, tint: 0xcc9966,
    strength: 7, constitution: 6, dexterity: 4, intelligence: 2, spirit: 2, speed: 5,
    biomes: ['Grassland'], tier: 'medium',
  },
  {
    id: 'harrier_hawk', name: 'Harrier Hawk',
    description: 'A sharp-eyed hunter that dives out of the sun.',
    frame: TD_BAT, tint: 0xcc9944,
    strength: 4, constitution: 3, dexterity: 8, intelligence: 4, spirit: 3, speed: 9,
    biomes: ['Grassland'], tier: 'medium',
  },
  {
    id: 'plains_ogre', name: 'Plains Ogre',
    description: 'A towering ogre who thinks the whole prairie is his backyard.',
    frame: TD_CYCLOPS, tint: 0xffffff,
    strength: 9, constitution: 8, dexterity: 3, intelligence: 2, spirit: 2, speed: 2,
    biomes: ['Grassland'], tier: 'hard',
  },

  // ── Tropical Rainforest ───────────────────────────────────────────────────
  {
    id: 'jungle_spider', name: 'Jungle Spider',
    description: 'A bright green spider that swings between vines like a gymnast.',
    frame: TD_SPIDER, tint: 0x66cc55,
    strength: 3, constitution: 3, dexterity: 7, intelligence: 2, spirit: 2, speed: 6,
    biomes: ['Tropical Rainforest'], tier: 'easy',
  },
  {
    id: 'leaf_frog', name: 'Leaf Frog',
    description: 'A springy frog that bounces off leaves like a trampoline.',
    frame: TD_SLIME, tint: 0x44dd77,
    strength: 2, constitution: 3, dexterity: 6, intelligence: 2, spirit: 3, speed: 7,
    biomes: ['Tropical Rainforest'], tier: 'easy',
  },
  {
    id: 'vine_bat', name: 'Vine Bat',
    description: 'A leaf-green bat that hangs from vines pretending to be fruit.',
    frame: TD_BAT, tint: 0x77cc77,
    strength: 3, constitution: 3, dexterity: 7, intelligence: 3, spirit: 3, speed: 8,
    biomes: ['Tropical Rainforest'], tier: 'medium',
  },
  {
    id: 'poison_crawler', name: 'Poison Crawler',
    description: 'A shimmering purple critter best admired from far away.',
    frame: TD_CRITTER, tint: 0xbb88ee,
    strength: 4, constitution: 5, dexterity: 7, intelligence: 4, spirit: 3, speed: 5,
    biomes: ['Tropical Rainforest'], tier: 'medium',
  },
  {
    id: 'shadow_panther', name: 'Shadow Panther',
    description: 'The fastest hunter in the jungle — blink and it is behind you.',
    frame: TD_HOODED, tint: 0x9977cc,
    strength: 7, constitution: 4, dexterity: 9, intelligence: 4, spirit: 4, speed: 10,
    biomes: ['Tropical Rainforest'], tier: 'hard',
  },
  {
    id: 'jungle_mimic', name: 'Jungle Mimic',
    description: 'A vine-covered chest that has fooled many treasure hunters.',
    frame: TD_MIMIC, tint: 0x88cc88,
    strength: 7, constitution: 7, dexterity: 4, intelligence: 5, spirit: 4, speed: 3,
    biomes: ['Tropical Rainforest'], tier: 'hard',
  },

  // ── Ocean ─────────────────────────────────────────────────────────────────
  {
    id: 'reef_crab', name: 'Reef Crab',
    description: 'A sturdy little crab that defends its reef with proud pinches.',
    frame: TD_CRAB, tint: 0xffffff,
    strength: 4, constitution: 6, dexterity: 4, intelligence: 2, spirit: 2, speed: 2,
    biomes: ['Ocean'], tier: 'easy',
  },
  {
    id: 'jellyfish', name: 'Jellyfish',
    description: 'A drifting pink jelly whose gentle glow hides a zappy sting.',
    frame: TD_GHOST, tint: 0xffaadd,
    strength: 1, constitution: 3, dexterity: 3, intelligence: 5, spirit: 6, speed: 3,
    caster: true,
    biomes: ['Ocean'], tier: 'easy',
  },
  {
    id: 'siren_slime', name: 'Siren Slime',
    description: 'A sparkling blue blob that sings surprisingly lovely songs.',
    frame: TD_SLIME, tint: 0x66ccff,
    strength: 2, constitution: 5, dexterity: 3, intelligence: 7, spirit: 7, speed: 3,
    caster: true,
    biomes: ['Ocean'], tier: 'medium',
  },
  {
    id: 'snapping_shell', name: 'Snapping Shell',
    description: 'A heavily armored shellback that snaps shut like a bear trap.',
    frame: TD_CRITTER, tint: 0x66bbdd,
    strength: 6, constitution: 8, dexterity: 3, intelligence: 2, spirit: 2, speed: 1,
    biomes: ['Ocean'], tier: 'medium',
  },
  {
    id: 'deep_shark', name: 'Deep Shark',
    description: 'A streamlined hunter from the deep — fast, sleek, and always hungry.',
    frame: TD_HOODED, tint: 0x7799dd,
    strength: 8, constitution: 5, dexterity: 7, intelligence: 3, spirit: 2, speed: 9,
    biomes: ['Ocean'], tier: 'hard',
  },
  {
    id: 'kraken_spawn', name: 'Kraken Spawn',
    description: 'A young kraken with far too many arms and big ideas.',
    frame: TD_CYCLOPS, tint: 0x8877cc,
    strength: 9, constitution: 8, dexterity: 5, intelligence: 6, spirit: 4, speed: 4,
    biomes: ['Ocean'], tier: 'hard',
  },
]

// ── Lookup tables ───────────────────────────────────────────────────────────

const ARCHETYPES_BY_ID = new Map(MOB_ARCHETYPES.map(a => [a.id, a]))

export const MOBS_BY_BIOME: Record<string, Record<MobTier, MobArchetype[]>> = {}
for (const arch of MOB_ARCHETYPES) {
  for (const biome of arch.biomes) {
    const byTier = (MOBS_BY_BIOME[biome] ??= { easy: [], medium: [], hard: [] })
    byTier[arch.tier].push(arch)
  }
}

// ── Stat derivation ─────────────────────────────────────────────────────────
//
//   maxHp   = round((20 + level * 6)   * constitution / 5)
//   attack  = round((4  + level * 1.2) * strength / 5)        (intelligence for casters)
//   defense = round((2  + level * 0.8) * (constitution + strength) / 10)
//   speed   = round((10 + level * 0.5) * speedWeight / 5)
//
// All four are monotonically increasing in level; weights set the slope, so a
// 10-CON slime out-tanks a 3-CON wolf at every level.

export function spawnMob(archetypeId: string, level: number): MobInstance {
  const arch = ARCHETYPES_BY_ID.get(archetypeId)
  if (!arch) throw new Error(`Unknown mob archetype: ${archetypeId}`)

  const lv = Phaser_clamp(Math.round(level), 1, 100)
  const atkWeight = arch.caster ? arch.intelligence : arch.strength

  return {
    archetypeId: arch.id,
    name: arch.name,
    level: lv,
    maxHp:   Math.max(1, Math.round((20 + lv * 6)   * (arch.constitution / 5))),
    attack:  Math.max(1, Math.round((4  + lv * 1.2) * (atkWeight / 5))),
    defense: Math.max(0, Math.round((2  + lv * 0.8) * ((arch.constitution + arch.strength) / 10))),
    speed:   Math.max(1, Math.round((10 + lv * 0.5) * (arch.speed / 5))),
    frame: arch.frame,
    tint:  arch.tint,
  }
}

// Local clamp so this data module has no Phaser import (usable from scripts).
function Phaser_clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v
}
