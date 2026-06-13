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
import { DIFFICULTIES, rollMaterials, TOKEN_DROP_CHANCE, type Difficulty } from '../loot.js';
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
  /** XP earned by each participating character (one entry per hero that fought,
   *  highest first). Heroes are exclusive to one team, so each appears once. */
  xpByCharacter: { name: string; xp: number }[];
  silver: number;
  items: { name: string; icon: string; rarity: string }[];
  /** Recruit Tokens dropped across all idle battles (flat per-win chance, uncapped). */
  tokensEarned: number;
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
 * Resolve all idle battles owed across EVERY team deployment. Each deployment
 * fights with its own team's members; XP is granted per-deployment to those
 * members, while silver + materials are pooled to the account. Advances each
 * deployment's resolve clock. Returns a combined summary, or null if nothing was
 * owed / no team is deployed. (TEAMS §5; CHARACTERS_DESIGN §6/§7.)
 */
export function resolveIdle(
  playerManager: PlayerManager,
  inventoryManager: InventoryManager,
  socketId: string,
): IdleSummary | null {
  const deployments = playerManager.getDeployments(socketId);
  if (deployments.length === 0) return null;

  const characters = playerManager.getCharacters(socketId);
  const teams = playerManager.getTeams(socketId);
  const stacks = playerManager.getHasteStacks(socketId);
  const currentRank = playerManager.getAdventureRank(socketId);
  const rankMult = rankMultiplier(currentRank);
  const now = Date.now();

  let totalBattles = 0, totalWins = 0, totalLosses = 0, totalSilver = 0, totalTokens = 0;
  const matTotals: Record<string, number> = {};
  const xpByChar = new Map<string, { name: string; xp: number }>();

  for (const d of deployments) {
    if (!(DIFFICULTIES as string[]).includes(d.difficulty)) continue;
    const difficulty = d.difficulty as Difficulty;
    const team = teams.find((t) => t.id === d.teamId);
    if (!team) continue;
    const allyChars = team.memberIds
      .map((id) => characters.find((c) => c.id === id))
      .filter((c): c is NonNullable<typeof c> => !!c);
    if (allyChars.length === 0) continue;

    const elapsed = now - d.lastResolvedAt;
    const end = Math.min(now, d.lastResolvedAt + INACTIVITY_MS);
    const encLevel = encounterLevel(difficulty);

    let t = d.lastResolvedAt;
    let lastBattleT = t;
    let battles = 0, wins = 0, losses = 0, xp = 0, silver = 0, tokens = 0;
    const mats: Record<string, number> = {};

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
      const { outcome } = resolveBattle({ allies, enemies, seed: (t >>> 0) || 1, rankMult });

      if (outcome.victory) {
        wins++;
        xp += Math.min(500, mobs.length * (10 + encLevel * 2));
        silver += mobs.length * Math.round(encLevel * 1.5);
        const { drops } = rollMaterials(encLevel, difficulty, false, rankMult);
        for (const dr of drops) mats[dr.materialId] = (mats[dr.materialId] ?? 0) + dr.qty;
        // Recruit Token: flat per-win chance, uncapped — idle is a token faucet
        // (the escalating recruit cost throttles, not the drop rate).
        if (rng() < TOKEN_DROP_CHANCE) tokens++;
      } else {
        losses++;
      }
    }

    if (battles === 0) continue;

    // Grant this deployment's XP to its own team members (tracked per-character
    // for the summary); advance its clock (skip the paused gap on a >14d absence).
    for (const ch of allyChars) {
      playerManager.addXpToCharacter(socketId, ch.id, xp);
      if (xp > 0) {
        const e = xpByChar.get(ch.id) ?? { name: ch.name, xp: 0 };
        e.xp += xp;
        xpByChar.set(ch.id, e);
      }
    }
    playerManager.setDeploymentResolvedAt(socketId, d.teamId, elapsed > INACTIVITY_MS ? now : lastBattleT);

    totalBattles += battles; totalWins += wins; totalLosses += losses; totalSilver += silver;
    totalTokens += tokens;
    for (const [id, q] of Object.entries(mats)) matTotals[id] = (matTotals[id] ?? 0) + q;
  }

  if (totalBattles === 0) return null;

  // Silver + materials + tokens are pooled to the account.
  if (totalSilver > 0) playerManager.addSilver(socketId, totalSilver);
  if (totalTokens > 0) playerManager.addRecruitTokens(socketId, totalTokens);
  const drops = Object.entries(matTotals).map(([materialId, qty]) => ({ materialId, qty }));
  if (drops.length) playerManager.grantMaterials(socketId, drops);

  const items = drops.map((d) => {
    const m = MATERIALS[d.materialId];
    const rarity = m?.family === 'catalyst' ? (m.rarityGate ?? 'rare') : tierRarity(m?.tier ?? 1);
    return { name: `${m?.name ?? d.materialId} ×${d.qty}`, icon: m?.icon ?? '📦', rarity };
  });

  return {
    battles: totalBattles, wins: totalWins, losses: totalLosses,
    xpByCharacter: [...xpByChar.values()].sort((a, b) => b.xp - a.xp),
    silver: totalSilver, items, tokensEarned: totalTokens,
    intervalMinutes: intervalAt(stacks, now),
  };
}

/**
 * PEEK: count the battles currently owed across all deployments WITHOUT resolving
 * them or mutating any clock. Drives the "spoils ready" badge on entering The
 * Garrison (TEAMS §5) — a one-shot check, no timer.
 */
export function peekBattlesOwed(
  playerManager: PlayerManager,
  socketId: string,
): number {
  const deployments = playerManager.getDeployments(socketId);
  if (deployments.length === 0) return 0;
  const teams = playerManager.getTeams(socketId);
  const stacks = playerManager.getHasteStacks(socketId);
  const now = Date.now();
  let owed = 0;
  for (const d of deployments) {
    const team = teams.find((t) => t.id === d.teamId);
    if (!team || team.memberIds.length === 0) continue;
    const end = Math.min(now, d.lastResolvedAt + INACTIVITY_MS);
    let t = d.lastResolvedAt, count = 0;
    while (count < MAX_IDLE_BATTLES) {
      const next = t + intervalAt(stacks, t) * MINUTE;
      if (next > end) break;
      t = next; count++;
    }
    owed += count;
  }
  return owed;
}
