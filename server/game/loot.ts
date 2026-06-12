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

// Keep these keys in sync with the client's DIFFICULTIES (src/game/data/mobs.ts).
export type Difficulty = 'beginner' | 'easy' | 'medium' | 'hard' | 'expert';

export const DIFFICULTIES: Difficulty[] = ['beginner', 'easy', 'medium', 'hard', 'expert'];

const DIFF_IDX: Record<Difficulty, number> = {
  beginner: 0, easy: 1, medium: 2, hard: 3, expert: 4,
};

// Per-encounter base drop chance by difficulty ("small to medium").
const DIFF_DROP_CHANCE: Record<Difficulty, number> = {
  beginner: 0.08, easy: 0.12, medium: 0.20, hard: 0.28, expert: 0.34,
};

/** Per-encounter chance of a drop: difficulty base + a small level bonus, capped. */
export function dropChance(level: number, difficulty: Difficulty): number {
  return Math.min(0.45, DIFF_DROP_CHANCE[difficulty] + level * 0.0015);
}

/**
 * Per-difficulty rarity weights (relative; normalised at roll time). Difficulty
 * is the sole driver, and the higher tiers are hard-gated:
 *   • beginner / easy / medium → never epic or legendary
 *   • hard                     → epic possible (very rare), never legendary
 *   • expert                   → legendary possible
 * Rare stays low until the upper difficulties.
 */
const RARITY_WEIGHTS: Record<Difficulty, [Rarity, number][]> = {
  beginner: [['common', 80], ['uncommon', 18], ['rare', 2]],
  easy:     [['common', 65], ['uncommon', 28], ['rare', 7]],
  medium:   [['common', 50], ['uncommon', 36], ['rare', 14]],
  hard:     [['common', 30], ['uncommon', 38], ['rare', 27], ['epic', 5]],
  expert:   [['common', 20], ['uncommon', 33], ['rare', 32], ['epic', 11], ['legendary', 4]],
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

// ── Material drops (the new campaign reward — see docs/CRAFTING_DESIGN.md) ─────

export interface MaterialDrop {
  materialId: string;
  qty: number;
}

/** Base material tier by difficulty; nudged up by enemy level. */
const BASE_TIER: Record<Difficulty, number> = {
  beginner: 1, easy: 2, medium: 3, hard: 5, expert: 6,
};

/**
 * Roll the materials a victory grants. Campaigns drop a batch of the
 * difficulty-appropriate metal + reagent, plus a rarity-gated catalyst on the
 * existing (difficulty-gated) rarity roll. Per-encounter wins drop a smaller,
 * chance-based amount. No finished gear ever drops — only materials.
 */
export function rollMaterials(
  level: number,
  difficulty: Difficulty,
  campaignComplete: boolean,
): MaterialDrop[] {
  const tier = Math.min(MAX_TIER, BASE_TIER[difficulty] + Math.floor(level / 30));
  const drops: MaterialDrop[] = [];

  if (campaignComplete) {
    const batch = 2 + DIFF_IDX[difficulty]; // 2 (beginner) → 6 (expert)
    drops.push({ materialId: METAL_BY_TIER[tier], qty: batch });
    drops.push({ materialId: REAGENT_BY_TIER[tier], qty: batch });
    const cat = CATALYST_BY_RARITY[pickRarity(difficulty)];
    if (cat) drops.push({ materialId: cat, qty: 1 });
  } else if (Math.random() < dropChance(level, difficulty)) {
    const fam = Math.random() < 0.5 ? METAL_BY_TIER : REAGENT_BY_TIER;
    drops.push({ materialId: fam[tier], qty: 1 + (Math.random() < 0.3 ? 1 : 0) });
    const cat = CATALYST_BY_RARITY[pickRarity(difficulty)];
    if (cat && Math.random() < 0.5) drops.push({ materialId: cat, qty: 1 });
  }

  return drops;
}
