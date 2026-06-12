// ============================================================
// materials.ts — crafting-material catalogue (server source of truth).
//
// Two axes (see docs/CRAFTING_DESIGN.md):
//   • base materials (metals / reagents) — a tier ladder that sets item LEVEL
//   • catalysts — special materials that gate item RARITY (rare+).
//
// Campaigns drop materials (never finished gear); crafting turns them into gear.
// ============================================================

import type { Rarity } from './equipmentGen.js';

export type MaterialFamily = 'metal' | 'reagent' | 'catalyst';

export interface Material {
  id: string;
  name: string;
  family: MaterialFamily;
  /** 1–7 for base materials (metals/reagents). */
  tier?: number;
  /** For catalysts: the item rarity this material unlocks. */
  rarityGate?: Rarity;
  icon: string;
}

// ── Base material ladders (tier = item level band) ───────────────────────────
// Metals → weapons & armor (The Forge / The Armory).
const METAL_DEFS: [string, string, number][] = [
  ['metal_copper', 'Copper', 1],
  ['metal_bronze', 'Bronze', 2],
  ['metal_iron', 'Iron', 3],
  ['metal_steel', 'Steel', 4],
  ['metal_mithril', 'Mithril', 5],
  ['metal_adamant', 'Adamant', 6],
  ['metal_lumensteel', 'Lumensteel', 7],
];
// Reagents → potions (The Alchemy Lab).
const REAGENT_DEFS: [string, string, number][] = [
  ['reagent_mossleaf', 'Mossleaf', 1],
  ['reagent_sunpetal', 'Sunpetal', 2],
  ['reagent_frostroot', 'Frostroot', 3],
  ['reagent_emberbloom', 'Emberbloom', 4],
  ['reagent_glimmercap', 'Glimmercap', 5],
  ['reagent_dreamthistle', 'Dreamthistle', 6],
  ['reagent_lumenblossom', 'Lumenblossom', 7],
];

// ── Rarity catalysts (the "very special" materials) ──────────────────────────
const CATALYST_DEFS: [string, string, Rarity, string][] = [
  ['cat_glimmer_dust', 'Glimmer Dust', 'uncommon', '✨'],
  ['cat_arcane_shard', 'Arcane Shard', 'rare', '🔹'],
  ['cat_astral_core', 'Astral Core', 'epic', '🔮'],
  ['cat_lumen_heart', 'Lumen Heart', 'legendary', '💖'],
];

// Family icons (per-material art comes with the crafting UIs; these always render).
const METAL_ICON = '⛏️';
const REAGENT_ICON = '🌿';

function build(): Record<string, Material> {
  const out: Record<string, Material> = {};
  for (const [id, name, tier] of METAL_DEFS) out[id] = { id, name, family: 'metal', tier, icon: METAL_ICON };
  for (const [id, name, tier] of REAGENT_DEFS) out[id] = { id, name, family: 'reagent', tier, icon: REAGENT_ICON };
  for (const [id, name, rarityGate, icon] of CATALYST_DEFS) out[id] = { id, name, family: 'catalyst', rarityGate, icon };
  return out;
}

export const MATERIALS: Record<string, Material> = build();

export const MAX_TIER = 7;

/** Metal / reagent id for a given tier (1–7), clamped. */
export const METAL_BY_TIER: string[] = ['', ...METAL_DEFS.map((m) => m[0])];
export const REAGENT_BY_TIER: string[] = ['', ...REAGENT_DEFS.map((r) => r[0])];

/** Catalyst id for an item rarity, or null (common needs no catalyst). */
export const CATALYST_BY_RARITY: Record<Rarity, string | null> = {
  common: null,
  uncommon: 'cat_glimmer_dust',
  rare: 'cat_arcane_shard',
  epic: 'cat_astral_core',
  legendary: 'cat_lumen_heart',
};

/** True when `id` is a known material. */
export function isMaterial(id: string): boolean {
  return id in MATERIALS;
}
