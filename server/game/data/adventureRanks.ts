/**
 * Adventure Ranks — grade-band tiers that gate which curriculum grades a player
 * is served questions from.
 *
 * A player has ONE adventure rank (server-authoritative, persisted). Its grade
 * band [minGrade..maxGrade] determines the pool of curriculum grades any quiz
 * (crafting, classroom) may draw from. The client cannot pick its own band —
 * all filtering happens on the server keyed off each Question's `grade`.
 *
 * NOTE on "College": there is no college-specific curriculum authored yet
 * (the question bank only covers grades 1-12). College is therefore mapped to
 * the TOP of the authored range (grade 12) so a College player still receives
 * the most advanced questions that exist. When real college content is added,
 * extend `maxGrade` for the 'college' rank and author questions tagged with a
 * grade above 12.
 */

import { MIN_GRADE, MAX_GRADE } from './curriculum.js';

/** Stable rank ids (persisted). */
export type AdventureRankId =
  | 'grade_1_3'
  | 'grade_4_6'
  | 'grade_7_8'
  | 'grade_9_12'
  | 'college';

export interface AdventureRank {
  id: AdventureRankId;
  /** Display name shown to the player. */
  name: string;
  /** Inclusive lowest curriculum grade this rank draws questions from. */
  minGrade: number;
  /** Inclusive highest curriculum grade this rank draws questions from. */
  maxGrade: number;
  /** One-line description for any future rank-picker UI. */
  description: string;
}

/**
 * The 5 adventure ranks, in ascending order. College maps onto the top of the
 * authored grade range (12) until college-specific content exists.
 */
export const ADVENTURE_RANKS: AdventureRank[] = [
  { id: 'grade_1_3', name: 'Grade 1-3', minGrade: 1, maxGrade: 3, description: 'Early adventurers: grades 1 through 3.' },
  { id: 'grade_4_6', name: 'Grade 4-6', minGrade: 4, maxGrade: 6, description: 'Apprentice adventurers: grades 4 through 6.' },
  { id: 'grade_7_8', name: 'Grade 7-8', minGrade: 7, maxGrade: 8, description: 'Seasoned adventurers: grades 7 and 8.' },
  { id: 'grade_9_12', name: 'Grade 9-12', minGrade: 9, maxGrade: 12, description: 'Veteran adventurers: grades 9 through 12.' },
  // College: no dedicated curriculum yet — draws from the top authored grade (12).
  { id: 'college', name: 'College', minGrade: 12, maxGrade: MAX_GRADE, description: 'Scholars: the most advanced questions available (college content coming soon).' },
];

/** Fast lookup: rank id -> AdventureRank. */
export const RANK_MAP: Record<string, AdventureRank> = Object.fromEntries(
  ADVENTURE_RANKS.map((r) => [r.id, r]),
);

/** The default rank used when none can be derived. */
export const DEFAULT_RANK_ID: AdventureRankId = 'grade_1_3';

/** Coerce an arbitrary value to a valid rank id, falling back to the default. */
export function normaliseRankId(raw: unknown): AdventureRankId {
  return typeof raw === 'string' && raw in RANK_MAP ? (raw as AdventureRankId) : DEFAULT_RANK_ID;
}

/** The grade band [min, max] for a rank id (clamped to the authored range). */
export function gradeBandForRank(rankId: AdventureRankId): { min: number; max: number } {
  const rank = RANK_MAP[rankId] ?? RANK_MAP[DEFAULT_RANK_ID];
  return {
    min: Math.max(MIN_GRADE, rank.minGrade),
    max: Math.min(MAX_GRADE, rank.maxGrade),
  };
}

/**
 * Derive a sensible DEFAULT adventure rank from a player's age. This is only a
 * starting point — a typical schooling age maps to a US grade level via
 * (age - 6), so age 6 -> grade 1. Ages 18+ default to College.
 *
 * Used at registration/join when the player has no persisted rank yet.
 */
export function defaultRankForAge(age: number): AdventureRankId {
  if (!Number.isFinite(age)) return DEFAULT_RANK_ID;
  if (age >= 18) return 'college';
  // Approximate US grade for a schooling-age child.
  const grade = Math.min(MAX_GRADE, Math.max(MIN_GRADE, Math.floor(age) - 5));
  return rankForGrade(grade);
}

/** The rank whose band CONTAINS the given grade (defaults if none match). */
export function rankForGrade(grade: number): AdventureRankId {
  for (const r of ADVENTURE_RANKS) {
    if (r.id === 'college') continue; // college overlaps grade 12; prefer grade_9_12
    if (grade >= r.minGrade && grade <= r.maxGrade) return r.id;
  }
  return DEFAULT_RANK_ID;
}

/** Compute whole-years age from a date of birth. */
export function ageFromDateOfBirth(dob: Date): number {
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}
