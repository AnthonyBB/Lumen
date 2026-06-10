/**
 * PlayerManager — tracks all connected players by socket ID.
 *
 * Security notes:
 *  - The server is the sole source of truth for level, xp, hp, and maxHp.
 *  - Clients never send these values; only the username is accepted at join time.
 *  - Duplicate username detection prevents impersonation within a session.
 */

import type { Player, PublicPlayer } from '../types/index.js';
import { PlayerProgress } from '../db/models/PlayerProgressModel.js';

/** Starting stats for a brand-new player joining the server. */
const INITIAL_STATS = {
  level: 1,
  xp: 0,
  hp: 100,
  maxHp: 100,
  zone: 'town',
  position: { x: 400, y: 300 },
};

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
      correctAnswers: 0,
      questionMastery: {},
      masteredSubcategories: [],
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

  getAllPlayers(): Player[] {
    return Array.from(this.players.values());
  }

  getPlayersInZone(zone: string): Player[] {
    return this.getAllPlayers().filter((p) => p.zone === zone);
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
    correctAnswers: number;
    questionMastery: Record<string, number>;
    masteredSubcategories: string[];
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
          correctAnswers: doc.correctAnswers ?? 0,
          questionMastery: doc.questionMastery ?? {},
          masteredSubcategories: doc.masteredSubcategories ?? [],
          unlockedSkills: doc.unlockedSkills ?? [],
          unlockedStrategies: doc.unlockedStrategies ?? [],
          strategyLoadout: doc.strategyLoadout ?? [],
        };
      }
    } catch (err) {
      console.error('[PlayerManager] loadProgress error:', err);
    }
    return {
      xp: 0, level: 1, correctAnswers: 0,
      questionMastery: {}, masteredSubcategories: [],
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
      correctAnswers?: number;
      questionMastery?: Record<string, number>;
      masteredSubcategories?: string[];
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
    player.correctAnswers = Math.max(0, progress.correctAnswers ?? 0);
    player.questionMastery = { ...(progress.questionMastery ?? {}) };
    player.masteredSubcategories = [...(progress.masteredSubcategories ?? [])];
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
        correctAnswers: player.correctAnswers,
        questionMastery: player.questionMastery,
        masteredSubcategories: player.masteredSubcategories,
        unlockedSkills: player.unlockedSkills,
        unlockedStrategies: player.unlockedStrategies,
        strategyLoadout: player.strategyLoadout,
      },
      { upsert: true, new: true },
    ).catch((err) => {
      console.error('[PlayerManager] persistProgress error:', err);
    });
  }

  /**
   * Record one correct learning answer (server-validated) and return how many
   * Skill Shards this crossing earns: 1 for every multiple of 5 cumulative
   * correct answers reached.
   */
  recordCorrectAnswer(socketId: string): number {
    const player = this.players.get(socketId);
    if (!player) return 0;
    player.correctAnswers += 1;
    return player.correctAnswers % 5 === 0 ? 1 : 0;
  }

  /**
   * Record one correct answer toward per-question mastery and report whether
   * this answer just completed the subcategory. A subcategory is complete
   * when EVERY question in it has been answered correctly at least
   * MASTERY_THRESHOLD times; the Combat Shard is awarded once per
   * subcategory (tracked in masteredSubcategories).
   */
  recordQuestionMastery(
    socketId: string,
    questionId: string,
    subcategory: string,
    subcategoryQuestionIds: string[],
  ): boolean {
    const player = this.players.get(socketId);
    if (!player) return false;

    player.questionMastery[questionId] = (player.questionMastery[questionId] ?? 0) + 1;

    if (player.masteredSubcategories.includes(subcategory)) return false;
    if (subcategoryQuestionIds.length === 0) return false;

    const mastered = subcategoryQuestionIds.every(
      (id) => (player.questionMastery[id] ?? 0) >= PlayerManager.MASTERY_THRESHOLD,
    );
    if (!mastered) return false;

    player.masteredSubcategories.push(subcategory);
    return true;
  }

  /** Correct answers required per question before a subcategory counts as complete. */
  static readonly MASTERY_THRESHOLD = 3;

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

  /** Apply damage to a player's HP (server-side only). */
  applyDamage(socketId: string, amount: number): number {
    const player = this.players.get(socketId);
    if (!player) return 0;
    player.hp = Math.max(0, player.hp - amount);
    return player.hp;
  }

  /** Restore HP to a player (server-side only). */
  restoreHp(socketId: string, amount: number): number {
    const player = this.players.get(socketId);
    if (!player) return 0;
    player.hp = Math.min(player.maxHp, player.hp + amount);
    return player.hp;
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
