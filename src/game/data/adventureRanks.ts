/**
 * Adventure-rank scaling — CLIENT mirror (see docs/ADVENTURE_RANKS_DESIGN.md).
 *
 * Display/combat-math only. The server (server/game/data/adventureRanks.ts) is
 * the source of truth for persisted effects; this mirror lets the client scale
 * combat numbers (weapon damage, mob strength, spell damage, potion power) by
 * the player's rank. Keep RANK_STEP and the rank-id ORDER in sync with the server.
 */

/** Rank ids in ascending order (grade_1_3 = 0 … college = 4). */
export const RANK_ORDER = [
  'grade_1_3', 'grade_4_6', 'grade_7_8', 'grade_9_12', 'college',
] as const

/** Per-rank power/economy multiplier step — keep equal to the server's RANK_STEP. */
export const RANK_STEP = 1.2

/** Display names per rank id (mirror of the server's ADVENTURE_RANKS names). */
export const RANK_NAMES: Record<string, string> = {
  grade_1_3: 'Grade 1-3', grade_4_6: 'Grade 4-6', grade_7_8: 'Grade 7-8',
  grade_9_12: 'Grade 9-12', college: 'College',
}

/** The next rank up, or null if already at the top (college). */
export function nextRankId(rankId: string | null | undefined): string | null {
  const i = rankIndex(rankId)
  return i >= RANK_ORDER.length - 1 ? null : RANK_ORDER[i + 1]
}

/** 0-based position of a rank in RANK_ORDER (unknown → 0). */
export function rankIndex(rankId: string | null | undefined): number {
  const i = RANK_ORDER.indexOf(rankId as typeof RANK_ORDER[number])
  return i === -1 ? 0 : i
}

/** Scaling multiplier M for a rank: RANK_STEP ** rankIndex. */
export function rankMultiplier(rankId: string | null | undefined): number {
  return RANK_STEP ** rankIndex(rankId)
}

/**
 * Gear/potion multiplier — uses the LOWER of the item's craft rank and the
 * player's current rank: M(min(craftRank, currentRank)).
 */
export function effectiveRankMultiplier(
  craftRankId: string | null | undefined,
  currentRankId: string | null | undefined,
): number {
  return RANK_STEP ** Math.min(rankIndex(craftRankId), rankIndex(currentRankId))
}
