// ============================================================
// encounters.ts — server-side campaign encounter generation.
//
// Idle combat has no client present, so the SERVER must generate the enemies
// (docs/CHARACTERS_DESIGN.md §6/§7). Idle fights are summarised, not watched, so
// we generate generic mobs scaled by level + difficulty rather than porting the
// whole client bestiary; buildEnemyCombatant() then rank-scales them just like a
// live fight. The level/count bands mirror the client's DIFFICULTIES so idle
// stays consistent with live play.
// ============================================================

import type { Difficulty } from '../loot.js';
import type { MobInput } from './adapter.js';

interface EncounterBand {
  /** Mob level band [min, max]. */
  band: [number, number];
  /** Per-encounter mob count band [min, max]. */
  count: [number, number];
}

/** Level/count bands per difficulty — mirror of the client mobs.ts DIFFICULTIES. */
const ENCOUNTER_BANDS: Record<Difficulty, EncounterBand> = {
  novice:    { band: [1, 4],    count: [1, 2] },
  easy:      { band: [4, 11],   count: [2, 3] },
  casual:    { band: [10, 20],  count: [2, 4] },
  medium:    { band: [18, 32],  count: [3, 5] },
  hard:      { band: [30, 46],  count: [4, 6] },
  veteran:   { band: [44, 60],  count: [5, 7] },
  expert:    { band: [58, 73],  count: [6, 8] },
  master:    { band: [71, 84],  count: [7, 9] },
  elite:     { band: [82, 93],  count: [8, 10] },
  legendary: { band: [90, 100], count: [9, 12] },
};

/** A generic mob's base stats at a given level (matches BiomeScene's legacy
 *  fallback formula; buildEnemyCombatant rank-scales HP/attack afterward). */
function genericMob(id: string, level: number): MobInput {
  return {
    id,
    name: 'Enemy',
    maxHp: 20 + level * 6,
    attack: 4 + Math.round(level * 1.2),
    defense: level,
    speed: 10 + Math.round(level * 0.5),
  };
}

/** The representative encounter level for a difficulty (band midpoint) — used for
 *  reward scaling. */
export function encounterLevel(difficulty: Difficulty): number {
  const b = ENCOUNTER_BANDS[difficulty] ?? ENCOUNTER_BANDS.novice;
  return Math.round((b.band[0] + b.band[1]) / 2);
}

/** Generate one campaign encounter's enemies for a difficulty (seeded). The
 *  count uses the mid-ramp of the band so it represents a typical fight. */
export function generateEncounter(difficulty: Difficulty, rng: () => number): MobInput[] {
  const cfg = ENCOUNTER_BANDS[difficulty] ?? ENCOUNTER_BANDS.novice;
  const count = Math.max(1, Math.round((cfg.count[0] + cfg.count[1]) / 2));
  const [lo, hi] = cfg.band;
  const mobs: MobInput[] = [];
  for (let i = 0; i < count; i++) {
    const level = Math.round(lo + rng() * Math.max(0, hi - lo));
    mobs.push(genericMob(`e${i}`, level));
  }
  return mobs;
}
