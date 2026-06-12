// ============================================================
// idle.ts — lazy, server-authoritative idle-combat resolution.
//
// "Your team fights while you're away" (docs/CHARACTERS_DESIGN.md §6/§7). NOT a
// background job: resolveIdle() runs on ACCESS (login), walks the haste timeline
// from the last resolve to now, resolves that many battles HEADLESS with the same
// resolver live combat uses, batches the rewards, and advances the clock. A
// 2-week inactivity stop bounds the catch-up and skips the paused gap.
// ============================================================

import type { PlayerManager } from '../PlayerManager.js';
import { HASTE_DEFAULT_MIN, HASTE_FLOOR_MIN } from '../PlayerManager.js';
import type { InventoryManager } from '../InventoryManager.js';
import type { HasteStack } from '../../types/index.js';
import { DIFFICULTIES, rollMaterials, type Difficulty } from '../loot.js';
import { rankMultiplier } from '../data/adventureRanks.js';
import { MATERIALS } from '../data/materials.js';
import { resolveBattle } from './resolver.js';
import { buildAllyCombatant, buildEnemyCombatant } from './adapter.js';
import { generateEncounter, encounterLevel } from './encounters.js';

const MINUTE = 60_000;
const INACTIVITY_MS = 14 * 24 * 60 * MINUTE; // combat pauses 2 weeks after last activity
const MAX_IDLE_BATTLES = 600;                 // safety cap on a single catch-up

export interface IdleSummary {
  battles: number;
  wins: number;
  losses: number;
  /** Total XP granted to EACH party character. */
  xpPerCharacter: number;
  silver: number;
  items: { name: string; icon: string; rarity: string }[];
  /** Current interval (minutes) so the client can show "next battle in …". */
  intervalMinutes: number;
}

/** The automated-battle interval (minutes) at a given moment, given the active
 *  haste stacks then. */
function intervalAt(stacks: HasteStack[], t: number): number {
  const reduction = stacks.filter((s) => s.expiresAt > t).reduce((s, st) => s + st.minutes, 0);
  return Math.max(HASTE_FLOOR_MIN, Math.min(HASTE_DEFAULT_MIN, HASTE_DEFAULT_MIN - reduction));
}

/** Tiny seeded RNG (mulberry32) for deterministic per-battle rolls. */
function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function tierRarity(t: number): string {
  return t >= 7 ? 'legendary' : t >= 6 ? 'epic' : t >= 5 ? 'rare' : t >= 3 ? 'uncommon' : 'common';
}

/**
 * Resolve all idle battles owed to the player's deployed team. Grants batched
 * rewards and advances the resolve clock. Returns a summary, or null if no team
 * is deployed / the party is empty / nothing was owed.
 */
export function resolveIdle(
  playerManager: PlayerManager,
  inventoryManager: InventoryManager,
  socketId: string,
): IdleSummary | null {
  const idle = playerManager.getIdle(socketId);
  if (!idle) return null;
  if (!(DIFFICULTIES as string[]).includes(idle.difficulty)) return null;
  const difficulty = idle.difficulty as Difficulty;

  const characters = playerManager.getCharacters(socketId);
  const allyChars = playerManager.getParty(socketId)
    .map((id) => characters.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => !!c);
  if (allyChars.length === 0) return null;

  const now = Date.now();
  const elapsed = now - idle.lastResolvedAt;
  // Inactivity stop: only credit battles within 14 days of the last resolve.
  const end = Math.min(now, idle.lastResolvedAt + INACTIVITY_MS);
  const stacks = playerManager.getHasteStacks(socketId);
  const currentRank = playerManager.getAdventureRank(socketId);
  const rankMult = rankMultiplier(currentRank);
  const encLevel = encounterLevel(difficulty);

  let t = idle.lastResolvedAt;
  let lastBattleT = t;
  let battles = 0, wins = 0, losses = 0;
  let totalXp = 0, totalSilver = 0;
  const matTotals: Record<string, number> = {};

  while (battles < MAX_IDLE_BATTLES) {
    const next = t + intervalAt(stacks, t) * MINUTE;
    if (next > end) break;
    t = next;
    lastBattleT = t;
    battles++;

    const rng = makeRng((t >>> 0) ^ 0x9e3779b9);
    const mobs = generateEncounter(difficulty, rng);
    const allies = allyChars.map((ch) =>
      buildAllyCombatant(ch, inventoryManager.equipmentFor(socketId, ch.id), currentRank));
    const enemies = mobs.map((m) => buildEnemyCombatant(m, currentRank));
    const { outcome } = resolveBattle({ allies, enemies, seed: (t >>> 0) || 1 });

    if (outcome.victory) {
      wins++;
      totalXp += Math.min(500, mobs.length * (10 + encLevel * 2));
      totalSilver += mobs.length * Math.round(encLevel * 1.5);
      const { drops } = rollMaterials(encLevel, difficulty, false, rankMult);
      for (const d of drops) matTotals[d.materialId] = (matTotals[d.materialId] ?? 0) + d.qty;
    } else {
      losses++;
    }
  }

  if (battles === 0) return null;

  // Batch-grant rewards (each party character levels individually).
  for (const ch of allyChars) playerManager.addXpToCharacter(socketId, ch.id, totalXp);
  if (totalSilver > 0) playerManager.addSilver(socketId, totalSilver);
  const drops = Object.entries(matTotals).map(([materialId, qty]) => ({ materialId, qty }));
  if (drops.length) playerManager.grantMaterials(socketId, drops);

  // Advance the clock: on a long (>14d) absence skip the paused gap and resume
  // from now; otherwise keep the partial interval since the last battle.
  playerManager.setIdleResolvedAt(socketId, elapsed > INACTIVITY_MS ? now : lastBattleT);

  const items = drops.map((d) => {
    const m = MATERIALS[d.materialId];
    const rarity = m?.family === 'catalyst' ? (m.rarityGate ?? 'rare') : tierRarity(m?.tier ?? 1);
    return { name: `${m?.name ?? d.materialId} ×${d.qty}`, icon: m?.icon ?? '📦', rarity };
  });

  return { battles, wins, losses, xpPerCharacter: totalXp, silver: totalSilver, items, intervalMinutes: intervalAt(stacks, now) };
}
