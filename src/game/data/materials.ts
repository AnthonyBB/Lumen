// ============================================================
// materials.ts — client mirror of the crafting-material catalogue.
//
// Display-only: names, icons, tiers and rarity gates so the Forge UI can render
// the player's stash and recipe costs. The server (server/game/data/materials.ts)
// is the source of truth for all spending — keep the ids/tiers in sync.
// ============================================================

import type { Rarity as ItemRarity } from './equipmentGen'

export type MaterialFamily = 'metal' | 'reagent' | 'catalyst'

export interface Material {
  id: string
  name: string
  family: MaterialFamily
  /** 1–7 for base materials (metals/reagents). */
  tier?: number
  /** For catalysts: the item rarity this material unlocks. */
  rarityGate?: ItemRarity
  icon: string
}

const METAL_DEFS: [string, string, number][] = [
  ['metal_copper', 'Copper', 1],
  ['metal_bronze', 'Bronze', 2],
  ['metal_iron', 'Iron', 3],
  ['metal_steel', 'Steel', 4],
  ['metal_mithril', 'Mithril', 5],
  ['metal_adamant', 'Adamant', 6],
  ['metal_lumensteel', 'Lumensteel', 7],
]
const REAGENT_DEFS: [string, string, number][] = [
  ['reagent_mossleaf', 'Mossleaf', 1],
  ['reagent_sunpetal', 'Sunpetal', 2],
  ['reagent_frostroot', 'Frostroot', 3],
  ['reagent_emberbloom', 'Emberbloom', 4],
  ['reagent_glimmercap', 'Glimmercap', 5],
  ['reagent_dreamthistle', 'Dreamthistle', 6],
  ['reagent_lumenblossom', 'Lumenblossom', 7],
]
const CATALYST_DEFS: [string, string, ItemRarity, string][] = [
  ['cat_glimmer_dust', 'Glimmer Dust', 'uncommon', '✨'],
  ['cat_arcane_shard', 'Arcane Shard', 'rare', '🔹'],
  ['cat_astral_core', 'Astral Core', 'epic', '🔮'],
  ['cat_lumen_heart', 'Lumen Heart', 'legendary', '💖'],
]

const METAL_ICON = '⛏️'
const REAGENT_ICON = '🌿'

function build(): Record<string, Material> {
  const out: Record<string, Material> = {}
  for (const [id, name, tier] of METAL_DEFS) out[id] = { id, name, family: 'metal', tier, icon: METAL_ICON }
  for (const [id, name, tier] of REAGENT_DEFS) out[id] = { id, name, family: 'reagent', tier, icon: REAGENT_ICON }
  for (const [id, name, rarityGate, icon] of CATALYST_DEFS) out[id] = { id, name, family: 'catalyst', rarityGate, icon }
  return out
}

export const MATERIALS: Record<string, Material> = build()

export const MAX_TIER = 7

/** Metal id for a given tier (1–7); index 0 is unused. */
export const METAL_BY_TIER: string[] = ['', ...METAL_DEFS.map((m) => m[0])]

/** Reagent id for a given tier (1–7); index 0 is unused. Used by the Alchemy Lab. */
export const REAGENT_BY_TIER: string[] = ['', ...REAGENT_DEFS.map((r) => r[0])]

/** The base-material ladder a crafting building spends (metals vs reagents). */
export function ladderFor(building: 'forge' | 'armory' | 'alchemy'): string[] {
  return building === 'alchemy' ? REAGENT_BY_TIER : METAL_BY_TIER
}

/** Catalysts in ascending rarity, for the catalyst picker. */
export const CATALYSTS: Material[] = CATALYST_DEFS.map(([id]) => MATERIALS[id])
