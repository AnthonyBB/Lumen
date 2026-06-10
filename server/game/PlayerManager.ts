/**
 * PlayerManager — tracks all connected players by socket ID.
 *
 * Security notes:
 *  - The server is the sole source of truth for level, xp, hp, and maxHp.
 *  - Clients never send these values; only the username is accepted at join time.
 *  - Duplicate username detection prevents impersonation within a session.
 */

import type { Player, PublicPlayer, Subject } from '../types/index.js';
import { PlayerProgress } from '../db/models/PlayerProgressModel.js';
import { MASTERED_GRADE, TOPICS_BY_SUBJECT_GRADE } from './data/curriculum.js';

/** Starting stats for a brand-new player joining the server. */
const INITIAL_STATS = {
  level: 1,
  xp: 0,
  hp: 100,
  maxHp: 100,
  zone: 'town',
  position: { x: 400, y: 300 },
};

const SUBJECTS: Subject[] = ['math', 'science', 'history', 'language'];

/** Default per-subject grade map: every subject starts at grade 1. */
function defaultSubjectGrades(): Record<Subject, number> {
  return { math: 1, science: 1, history: 1, language: 1 };
}

/** Sanitise a loaded subjectGrades map, clamping to 1..13 and filling gaps. */
function normaliseSubjectGrades(raw: Partial<Record<Subject, number>> | undefined): Record<Subject, number> {
  const out = defaultSubjectGrades();
  if (raw) {
    for (const s of SUBJECTS) {
      const g = raw[s];
      if (typeof g === 'number' && Number.isFinite(g)) {
        out[s] = Math.min(MASTERED_GRADE, Math.max(1, Math.floor(g)));
      }
    }
  }
  return out;
}

/** Pass count at which a topic counts as COMPLETE. */
export const TOPIC_PASSES_TO_COMPLETE = 3;

/** Shard awards granted once per grade completion. */
export const GRADE_COMPLETE_SKILL_SHARDS = 10;
export const GRADE_COMPLETE_COMBAT_SHARDS = 5;

export class PlayerManager {
  /** socketId → Player */
  private players: Map<string, Player> = new Map();

  /** Lower-cased username → socketId (for duplicate detection). */
  private usernameLookup: Map<string, string> = new Map();

  // -------------------------------------------------------------------------
  // Registration / removal
  // -------------------------------------------------------------------------

  /**
   * Register a new player.  Returns `null` and a reason string if the username
   * is already taken or invalid.
   */
  addPlayer(
    socketId: string,
    username: string,
  ): { player: Player; error: null } | { player: null; error: string } {
    const trimmed = username.trim();

    if (!trimmed || trimmed.length < 2 || trimmed.length > 20) {
      return { player: null, error: 'Username must be 2–20 characters.' };
    }

    // Allow only letters, numbers, underscores, and hyphens (child-safe)
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
      return {
        player: null,
        error: 'Username may only contain letters, numbers, _ and -.',
      };
    }

    const key = trimmed.toLowerCase();
    if (this.usernameLookup.has(key)) {
      return { player: null, error: 'That username is already taken.' };
    }

    const player: Player = {
      id: socketId,
      username: trimmed,
      ...INITIAL_STATS,
      position: { ...INITIAL_STATS.position },
      lastMessageAt: 0,
      subjectGrades: defaultSubjectGrades(),
      topicPasses: {},
      unlockedSkills: [],
      unlockedStrategies: [],
      strategyLoadout: [],
    };

    this.players.set(socketId, player);
    this.usernameLookup.set(key, socketId);

    return { player, error: null };
  }

  /** Remove a player when they disconnect. */
  removePlayer(socketId: string): Player | undefined {
    const player = this.players.get(socketId);
    if (player) {
      this.usernameLookup.delete(player.username.toLowerCase());
      this.players.delete(socketId);
    }
    return player;
  }

  // -------------------------------------------------------------------------
  // Lookups
  // -------------------------------------------------------------------------

  getPlayer(socketId: string): Player | undefined {
    return this.players.get(socketId);
  }

  // -------------------------------------------------------------------------
  // Mutations (server-authoritative)
  // -------------------------------------------------------------------------

  /** Update a player's position and zone after server validates the move. */
  updatePosition(socketId: string, x: number, y: number, zone: string): boolean {
    const player = this.players.get(socketId);
    if (!player) return false;

    player.position.x = x;
    player.position.y = y;
    player.zone = zone;
    return true;
  }

  /** Apply XP gain, calculating level-ups server-side. */
  addXp(socketId: string, amount: number): { newXp: number; newLevel: number; leveledUp: boolean } {
    const player = this.players.get(socketId);
    if (!player) return { newXp: 0, newLevel: 1, leveledUp: false };

    player.xp += amount;

    const oldLevel = player.level;
    // Simple level formula: level = floor(xp / 100) + 1, capped at 50
    player.level = Math.min(50, Math.floor(player.xp / 100) + 1);

    if (player.level > oldLevel) {
      // Restore full HP on level-up and increase max HP
      player.maxHp = 100 + (player.level - 1) * 20;
      player.hp = player.maxHp;
    }

    return {
      newXp: player.xp,
      newLevel: player.level,
      leveledUp: player.level > oldLevel,
    };
  }

  // -------------------------------------------------------------------------
  // Progress persistence (MongoDB)
  // -------------------------------------------------------------------------

  /**
   * Load saved XP and level from MongoDB for a given userId (= username).
   * Returns default values if no record exists yet.
   */
  async loadProgress(userId: string): Promise<{
    xp: number;
    level: number;
    subjectGrades: Record<Subject, number>;
    topicPasses: Record<string, number>;
    unlockedSkills: string[];
    unlockedStrategies: string[];
    strategyLoadout: string[];
  }> {
    try {
      const doc = await PlayerProgress.findOne({ userId }).lean();
      if (doc) {
        return {
          xp: doc.xp,
          level: doc.level,
          subjectGrades: normaliseSubjectGrades(doc.subjectGrades),
          topicPasses: doc.topicPasses ?? {},
          unlockedSkills: doc.unlockedSkills ?? [],
          unlockedStrategies: doc.unlockedStrategies ?? [],
          strategyLoadout: doc.strategyLoadout ?? [],
        };
      }
    } catch (err) {
      console.error('[PlayerManager] loadProgress error:', err);
    }
    return {
      xp: 0, level: 1,
      subjectGrades: defaultSubjectGrades(), topicPasses: {},
      unlockedSkills: [], unlockedStrategies: [], strategyLoadout: [],
    };
  }

  /**
   * Apply previously-loaded progress to a player who has already been
   * registered with addPlayer().
   */
  applyProgress(
    socketId: string,
    progress: {
      xp: number;
      level: number;
      subjectGrades?: Record<Subject, number>;
      topicPasses?: Record<string, number>;
      unlockedSkills?: string[];
      unlockedStrategies?: string[];
      strategyLoadout?: string[];
    },
  ): void {
    const player = this.players.get(socketId);
    if (!player) return;
    player.xp = Math.max(0, progress.xp);
    player.level = Math.min(50, Math.max(1, progress.level));
    player.maxHp = 100 + (player.level - 1) * 20;
    player.hp = player.maxHp;
    player.subjectGrades = normaliseSubjectGrades(progress.subjectGrades);
    player.topicPasses = { ...(progress.topicPasses ?? {}) };
    player.unlockedSkills = [...(progress.unlockedSkills ?? [])];
    player.unlockedStrategies = [...(progress.unlockedStrategies ?? [])];
    // Defensive: only keep loadout entries the player actually owns.
    player.strategyLoadout = (progress.strategyLoadout ?? []).filter((id) =>
      player.unlockedStrategies.includes(id),
    );
  }

  /**
   * Fire-and-forget write of the player's current progress to MongoDB.
   * Uses the player's username as the stable userId key.
   */
  persistProgress(socketId: string): void {
    const player = this.players.get(socketId);
    if (!player) return;

    PlayerProgress.findOneAndUpdate(
      { userId: player.username },
      {
        xp: player.xp,
        level: player.level,
        subjectGrades: player.subjectGrades,
        topicPasses: player.topicPasses,
        unlockedSkills: player.unlockedSkills,
        unlockedStrategies: player.unlockedStrategies,
        strategyLoadout: player.strategyLoadout,
      },
      { upsert: true, new: true },
    ).catch((err) => {
      console.error('[PlayerManager] persistProgress error:', err);
    });
  }

  /** Current grade for a subject (1..12, or 13 = mastered). */
  getSubjectGrade(socketId: string, subject: Subject): number {
    return this.players.get(socketId)?.subjectGrades[subject] ?? 1;
  }

  /** Pass count for a topic (0..3). */
  getTopicPasses(socketId: string, topicId: string): number {
    return this.players.get(socketId)?.topicPasses[topicId] ?? 0;
  }

  /**
   * Record a quiz PASS for a topic, capping the pass count at
   * TOPIC_PASSES_TO_COMPLETE. Returns the new pass count (unchanged if it was
   * already at the cap). Caller is responsible for grade-completion checks.
   */
  recordTopicPass(socketId: string, topicId: string): number {
    const player = this.players.get(socketId);
    if (!player) return 0;
    const current = player.topicPasses[topicId] ?? 0;
    const next = Math.min(TOPIC_PASSES_TO_COMPLETE, current + 1);
    player.topicPasses[topicId] = next;
    return next;
  }

  /** True when a topic has reached the completion pass count. */
  isTopicComplete(socketId: string, topicId: string): boolean {
    return this.getTopicPasses(socketId, topicId) >= TOPIC_PASSES_TO_COMPLETE;
  }

  /**
   * Check whether BOTH topics of the player's CURRENT grade in a subject are
   * complete (3 passes each). Returns the list of those topic ids and whether
   * the grade is complete.
   */
  isCurrentGradeComplete(socketId: string, subject: Subject): boolean {
    const player = this.players.get(socketId);
    if (!player) return false;
    const grade = player.subjectGrades[subject];
    const topics = TOPICS_BY_SUBJECT_GRADE[subject]?.[grade];
    if (!topics || topics.length === 0) return false;
    return topics.every((t) => (player.topicPasses[t.id] ?? 0) >= TOPIC_PASSES_TO_COMPLETE);
  }

  /**
   * Advance a subject to the next grade (grade 12 → 13 = mastered). Returns the
   * new grade. No-op if already at the mastered sentinel.
   */
  advanceSubjectGrade(socketId: string, subject: Subject): number {
    const player = this.players.get(socketId);
    if (!player) return MASTERED_GRADE;
    const current = player.subjectGrades[subject];
    if (current >= MASTERED_GRADE) return current;
    player.subjectGrades[subject] = Math.min(MASTERED_GRADE, current + 1);
    return player.subjectGrades[subject];
  }

  /** Add a purchased skill id to the player's unlocks (idempotent). */
  unlockSkill(socketId: string, skillId: string): void {
    const player = this.players.get(socketId);
    if (!player) return;
    if (!player.unlockedSkills.includes(skillId)) player.unlockedSkills.push(skillId);
  }

  /** Add purchased strategy ids to the player's unlocks (idempotent). */
  unlockStrategies(socketId: string, strategyIds: string[]): void {
    const player = this.players.get(socketId);
    if (!player) return;
    for (const id of strategyIds) {
      if (!player.unlockedStrategies.includes(id)) player.unlockedStrategies.push(id);
    }
  }

  /** Replace the player's ordered strategy loadout (caller validates ids). */
  setStrategyLoadout(socketId: string, strategyIds: string[]): void {
    const player = this.players.get(socketId);
    if (!player) return;
    player.strategyLoadout = [...strategyIds];
  }

  /** Record the timestamp of the last chat message for rate-limiting. */
  updateLastMessageAt(socketId: string, ts: number): void {
    const player = this.players.get(socketId);
    if (player) player.lastMessageAt = ts;
  }

  // -------------------------------------------------------------------------
  // Serialisation helpers
  // -------------------------------------------------------------------------

  /** Convert internal player to the safe public representation. */
  toPublic(player: Player): PublicPlayer {
    return {
      id: player.id,
      username: player.username,
      level: player.level,
      hp: player.hp,
      maxHp: player.maxHp,
      zone: player.zone,
      position: { ...player.position },
    };
  }
}
