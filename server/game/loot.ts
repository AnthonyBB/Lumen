// ============================================================
// loot.ts — server-authoritative combat drop rolls.
//
// Drops are decided ENTIRELY on the server (per CLAUDE.md anti-cheat rule):
// the client only reports a battle victory; this module rolls whether an item
// drops and which one, scaled by the enemy level + biome difficulty.  The
// chosen items are added straight to the player's server-side inventory.
// ============================================================

import type { Rarity } from './data/equipmentGen.js';
import {
  METAL_BY_TIER, REAGENT_BY_TIER, CATALYST_BY_RARITY, MAX_TIER,
} from './data/materials.js';

// Keep these keys (and their ORDER) in sync with the client's DIFFICULTIES
// (src/game/data/mobs.ts).
export type Difficulty =
  | 'novice' | 'easy' | 'casual' | 'medium' | 'hard'
  | 'veteran' | 'expert' | 'master' | 'elite' | 'legendary';

export const DIFFICULTIES: Difficulty[] = [
  'novice', 'easy', 'casual', 'medium', 'hard',
  'veteran', 'expert', 'master', 'elite', 'legendary',
];

const DIFF_IDX: Record<Difficulty, number> = Object.fromEntries(
  DIFFICULTIES.map((d, i) => [d, i]),
) as Record<Difficulty, number>;

// Per-encounter base drop chance by difficulty ("small to medium"), 0..9.
const DIFF_DROP_CHANCE: Record<Difficulty, number> = {
  novice: 0.08, easy: 0.11, casual: 0.14, medium: 0.18, hard: 0.22,
  veteran: 0.26, expert: 0.30, master: 0.33, elite: 0.36, legendary: 0.40,
};

/** Per-encounter chance of a drop: difficulty base + a small level bonus, capped. */
export function dropChance(level: number, difficulty: Difficulty): number {
  return Math.min(0.48, DIFF_DROP_CHANCE[difficulty] + level * 0.0012);
}

/**
 * Per-difficulty CATALYST rarity weights (relative; normalised at roll time).
 * Difficulty is the sole driver and the higher rarities are gated: epic only
 * appears at hard+, legendary only at expert+.
 */
const RARITY_WEIGHTS: Record<Difficulty, [Rarity, number][]> = {
  novice:    [['common', 82], ['uncommon', 16], ['rare', 2]],
  easy:      [['common', 72], ['uncommon', 24], ['rare', 4]],
  casual:    [['common', 62], ['uncommon', 30], ['rare', 8]],
  medium:    [['common', 50], ['uncommon', 36], ['rare', 14]],
  hard:      [['common', 40], ['uncommon', 38], ['rare', 20], ['epic', 2]],
  veteran:   [['common', 32], ['uncommon', 38], ['rare', 25], ['epic', 5]],
  expert:    [['common', 25], ['uncommon', 35], ['rare', 30], ['epic', 9], ['legendary', 1]],
  master:    [['common', 20], ['uncommon', 33], ['rare', 32], ['epic', 12], ['legendary', 3]],
  elite:     [['common', 15], ['uncommon', 30], ['rare', 33], ['epic', 16], ['legendary', 6]],
  legendary: [['common', 10], ['uncommon', 26], ['rare', 34], ['epic', 20], ['legendary', 10]],
};

/** Weighted rarity pick driven purely by biome difficulty. */
function pickRarity(difficulty: Difficulty): Rarity {
  const weights = RARITY_WEIGHTS[difficulty];
  const total = weights.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [rarity, w] of weights) {
    r -= w;
    if (r <= 0) return rarity;
  }
  return 'common';
}

// ── Material drops (the campaign reward — see docs/CRAFTING_DESIGN.md) ─────────

export interface MaterialDrop {
  materialId: string;
  qty: number;
}

/**
 * Material TIER blend per difficulty: a weighted mix of (usually two) adjacent
 * tiers, biased toward the lower one, walking copper(1)→lumensteel(7) across the
 * 10 difficulties. So a harder campaign yields a mix — e.g. Hard drops mostly
 * Steel with some Mithril. `[tier, weight]` pairs, normalised at roll time.
 */
const TIER_BLEND: Record<Difficulty, [number, number][]> = {
  novice:    [[1, 100]],
  easy:      [[1, 70], [2, 30]],
  casual:    [[2, 70], [3, 30]],
  medium:    [[2, 40], [3, 60]],
  hard:      [[3, 65], [4, 35]],
  veteran:   [[4, 65], [5, 35]],
  expert:    [[5, 65], [6, 35]],
  master:    [[5, 40], [6, 60]],
  elite:     [[6, 65], [7, 35]],
  legendary: [[6, 30], [7, 70]],
};

/** Weighted pick of a single material tier from a difficulty's blend. */
function pickTier(difficulty: Difficulty): number {
  const blend = TIER_BLEND[difficulty];
  const total = blend.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [tier, w] of blend) {
    r -= w;
    if (r <= 0) return Math.min(MAX_TIER, tier);
  }
  return blend[blend.length - 1][0];
}

/**
 * Roll `units` of a material ladder, each unit's tier drawn from the difficulty
 * blend, then aggregate into one stack per tier — so the haul reads as a mix
 * (e.g. "Steel ×4, Mithril ×2") rather than a single uniform pile.
 */
function rollBatch(ladder: string[], difficulty: Difficulty, units: number): MaterialDrop[] {
  const counts = new Map<number, number>();
  for (let i = 0; i < units; i++) {
    const t = pickTier(difficulty);
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([tier, qty]) => ({ materialId: ladder[tier], qty }));
}

export interface MaterialRoll {
  drops: MaterialDrop[];
  /** A campaign "rich vein" — doubled the material haul (drives the end-screen FX). */
  richVein: boolean;
}

/**
 * Roll the materials a victory grants. Campaigns drop a mixed batch of metal +
 * reagent (tiers blended per difficulty) plus a chance-based, difficulty-gated
 * catalyst, and occasionally hit a "rich vein" that doubles the haul. Per-
 * encounter wins drop a smaller, chance-based amount. No finished gear ever
 * drops — only materials.
 */
export function rollMaterials(
  level: number,
  difficulty: Difficulty,
  campaignComplete: boolean,
  rankMult = 1,
): MaterialRoll {
  const drops: MaterialDrop[] = [];
  const di = DIFF_IDX[difficulty];
  let richVein = false;

  // The bulk material haul scales with the player's rank (M(currentRank)) so a
  // higher-rank player earns proportionally more — funding the steeper craft
  // costs at that rank (see docs/ADVENTURE_RANKS_DESIGN.md §1). Gated catalysts
  // are NOT scaled; they stay a single, rarity-driven drop.
  if (campaignComplete) {
    richVein = Math.random() < (0.12 + di * 0.011); // ~12% (novice) → ~22% (legendary)
    const baseUnits = (2 + Math.ceil(di / 2)) * (richVein ? 2 : 1); // base 2→7, doubled on a vein
    const units = Math.max(1, Math.round(baseUnits * rankMult));
    drops.push(...rollBatch(METAL_BY_TIER, difficulty, units));
    drops.push(...rollBatch(REAGENT_BY_TIER, difficulty, units));

    // Catalyst: chance-based per difficulty (a common roll = no catalyst). Never guaranteed.
    const cat = CATALYST_BY_RARITY[pickRarity(difficulty)];
    if (cat) drops.push({ materialId: cat, qty: 1 });
  } else if (Math.random() < dropChance(level, difficulty)) {
    const fam = Math.random() < 0.5 ? METAL_BY_TIER : REAGENT_BY_TIER;
    const baseQty = 1 + (Math.random() < 0.3 ? 1 : 0);
    drops.push({ materialId: fam[pickTier(difficulty)], qty: Math.max(1, Math.round(baseQty * rankMult)) });
    const cat = CATALYST_BY_RARITY[pickRarity(difficulty)];
    if (cat && Math.random() < 0.5) drops.push({ materialId: cat, qty: 1 });
  }

  return { drops, richVein };
}
