// ============================================================
// loot.ts — server-authoritative combat drop rolls.
//
// Drops are decided ENTIRELY on the server (per CLAUDE.md anti-cheat rule):
// the client only reports a battle victory; this module rolls whether an item
// drops and which one, scaled by the enemy level + biome difficulty.  The
// chosen items are added straight to the player's server-side inventory.
// ============================================================

import {
  EQUIPMENT_MAP,
  RARITY_ORDER,
  type EquipmentItem,
  type Rarity,
} from './data/equipmentGen.js';

// Keep these keys in sync with the client's DIFFICULTIES (src/game/data/mobs.ts).
export type Difficulty = 'beginner' | 'easy' | 'medium' | 'hard' | 'expert';

export const DIFFICULTIES: Difficulty[] = ['beginner', 'easy', 'medium', 'hard', 'expert'];

// Lazily index the 1000-item catalog by rarity (built once on first roll).
let byRarity: Record<Rarity, EquipmentItem[]> | null = null;
function itemsByRarity(): Record<Rarity, EquipmentItem[]> {
  if (byRarity) return byRarity;
  const map: Record<Rarity, EquipmentItem[]> = {
    common: [], uncommon: [], rare: [], epic: [], legendary: [],
  };
  for (const item of Object.values(EQUIPMENT_MAP)) map[item.rarity].push(item);
  byRarity = map;
  return map;
}

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
 * Weighted rarity pick, biased upward by enemy level + difficulty.  `boost`
 * shifts the whole distribution up (used for the campaign-completion reward).
 */
function pickRarity(level: number, difficulty: Difficulty, boost: number): Rarity {
  const tier = DIFF_IDX[difficulty] + Math.min(4, Math.floor(level / 22)) + boost; // ~0..8
  const weights: [Rarity, number][] = [
    ['common',    Math.max(2, 50 - tier * 10)],
    ['uncommon',  34],
    ['rare',      Math.min(45, 8 + tier * 6)],
    ['epic',      Math.min(35, Math.max(0, (tier - 1) * 5))],
    ['legendary', Math.max(0, (tier - 3) * 5)],
  ];
  const total = weights.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [rarity, w] of weights) {
    r -= w;
    if (r <= 0) return rarity;
  }
  return 'common';
}

/** Random item of a rarity, falling back to the nearest lower tier with stock. */
function pickItemOfRarity(rarity: Rarity): EquipmentItem | null {
  const pools = itemsByRarity();
  const idx = RARITY_ORDER.indexOf(rarity);
  for (let i = idx; i >= 0; i--) {
    const pool = pools[RARITY_ORDER[i]];
    if (pool && pool.length) return pool[Math.floor(Math.random() * pool.length)];
  }
  return null;
}

/**
 * Roll combat loot for a victory.
 *  - Per encounter: a small-to-medium chance of a single item.
 *  - Campaign completion (whole biome cleared): a guaranteed, sizeable reward —
 *    several items with a boosted rarity distribution.
 * Everything scales with enemy `level` and biome `difficulty`.
 */
export function rollCombatDrops(
  level: number,
  difficulty: Difficulty,
  campaignComplete: boolean,
): EquipmentItem[] {
  const drops: EquipmentItem[] = [];

  if (campaignComplete) {
    // 2 (easy) → 4 (hard), +1 for high-level biomes.
    const count = 2 + DIFF_IDX[difficulty] + (level >= 60 ? 1 : 0);
    for (let i = 0; i < count; i++) {
      const it = pickItemOfRarity(pickRarity(level, difficulty, 2));
      if (it) drops.push(it);
    }
  } else if (Math.random() < dropChance(level, difficulty)) {
    const it = pickItemOfRarity(pickRarity(level, difficulty, 0));
    if (it) drops.push(it);
  }

  return drops;
}
