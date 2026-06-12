/**
 * PlayerManager — tracks all connected players by socket ID.
 *
 * Security notes:
 *  - The server is the sole source of truth for level, xp, hp, and maxHp.
 *  - Clients never send these values; only the username is accepted at join time.
 *  - Duplicate username detection prevents impersonation within a session.
 */

import type {
  Player,
  PublicPlayer,
  Subject,
  AttributeKey,
  StatRow,
  StatsUpdatePayload,
  EquipmentSlots,
} from '../types/index.js';
import { ATTRIBUTE_KEYS } from '../types/index.js';
import { PlayerProgress } from '../db/models/PlayerProgressModel.js';
import { MASTERED_GRADE, TOPICS_BY_SUBJECT_GRADE } from './data/curriculum.js';
import { EQUIPMENT_MAP, type AttributeType } from './data/equipmentGen.js';

/** Round to one decimal place (keeps percent-style stats readable). */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

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

// ---------------------------------------------------------------------------
// Character attributes
// ---------------------------------------------------------------------------

/** Base value of every attribute before any allocated points or gear. */
export const ATTRIBUTE_BASE = 5;

/** Allocation points granted per level. Total earned = level * this. */
export const POINTS_PER_LEVEL = 3;

/** Hard level cap. */
export const LEVEL_CAP = 50;

/**
 * Total XP required to REACH a given level (level 1 = 0 XP). The per-level cost
 * rises linearly — cost(L→L+1) = 250 + 150*(L-1) — so the curve gets steadily
 * steeper as you climb (a quadratic total). Compared with the old flat
 * 100-XP-per-level this is far slower and progressively harder:
 *   L2=250, L5=2050, L10=7000, L20=27500, L50=190000.
 */
export function xpForLevel(level: number): number {
  const L = Math.max(1, Math.floor(level));
  let total = 0;
  for (let l = 1; l < L; l++) total += 250 + 150 * (l - 1);
  return total;
}

/** Highest level whose XP threshold `xp` meets, capped at LEVEL_CAP. */
export function levelForXp(xp: number): number {
  let level = 1;
  while (level < LEVEL_CAP && xp >= xpForLevel(level + 1)) level++;
  return level;
}

/** A fresh attributePoints map with all five attributes at 0. */
function defaultAttributePoints(): Record<AttributeKey, number> {
  return { strength: 0, constitution: 0, dexterity: 0, intelligence: 0, spirit: 0 };
}

/** Sanitise a loaded attributePoints map (clamp to >=0 integers, fill gaps). */
function normaliseAttributePoints(
  raw: Partial<Record<string, number>> | undefined,
): Record<AttributeKey, number> {
  const out = defaultAttributePoints();
  if (raw) {
    for (const k of ATTRIBUTE_KEYS) {
      const v = raw[k];
      if (typeof v === 'number' && Number.isFinite(v)) out[k] = Math.max(0, Math.floor(v));
    }
  }
  return out;
}

/** Human-readable labels for stat rows pushed to the client. */
const ATTRIBUTE_LABELS: Record<AttributeKey, string> = {
  strength: 'Strength',
  constitution: 'Constitution',
  dexterity: 'Dexterity',
  intelligence: 'Intelligence',
  spirit: 'Spirit',
};

/** Pass count at which a topic counts as COMPLETE. */
export const TOPIC_PASSES_TO_COMPLETE = 3;

/** Skill shards granted for completing any quiz (effort reward, every test). */
export const QUIZ_COMPLETE_SKILL_SHARDS = 1;

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
      skillShards: 0,
      combatShards: 0,
      silver: 0,
      materials: {},
      attributePoints: defaultAttributePoints(),
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

  /**
   * Find the socket id of an ONLINE player by username (case-insensitive), or
   * null if they are not currently connected.  Used to credit an online seller's
   * in-memory balance at the Market.
   */
  getSocketIdByUsername(username: string): string | null {
    return this.usernameLookup.get(username.toLowerCase()) ?? null;
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
    // Progressive curve — each level costs more XP than the last (see xpForLevel).
    player.level = levelForXp(player.xp);

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
    skillShards: number;
    combatShards: number;
    silver: number;
    materials: Record<string, number>;
    attributePoints: Record<AttributeKey, number>;
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
          skillShards: Math.max(0, doc.skillShards ?? 0),
          combatShards: Math.max(0, doc.combatShards ?? 0),
          silver: Math.max(0, doc.silver ?? 0),
          materials: { ...((doc.materials as Record<string, number>) ?? {}) },
          attributePoints: normaliseAttributePoints(doc.attributePoints),
        };
      }
    } catch (err) {
      console.error('[PlayerManager] loadProgress error:', err);
    }
    return {
      xp: 0, level: 1,
      subjectGrades: defaultSubjectGrades(), topicPasses: {},
      unlockedSkills: [], unlockedStrategies: [], strategyLoadout: [],
      skillShards: 0, combatShards: 0, silver: 0, materials: {},
      attributePoints: defaultAttributePoints(),
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
      skillShards?: number;
      combatShards?: number;
      silver?: number;
      materials?: Record<string, number>;
      attributePoints?: Record<AttributeKey, number>;
    },
  ): void {
    const player = this.players.get(socketId);
    if (!player) return;
    player.xp = Math.max(0, progress.xp);
    // Derive level from XP so the (new, steeper) curve is always authoritative.
    player.level = levelForXp(player.xp);
    player.maxHp = 100 + (player.level - 1) * 20;
    player.hp = player.maxHp;
    player.attributePoints = this.clampAllocatedToCap(
      normaliseAttributePoints(progress.attributePoints),
      player.level,
    );
    player.subjectGrades = normaliseSubjectGrades(progress.subjectGrades);
    player.topicPasses = { ...(progress.topicPasses ?? {}) };
    player.unlockedSkills = [...(progress.unlockedSkills ?? [])];
    player.unlockedStrategies = [...(progress.unlockedStrategies ?? [])];
    // Defensive: only keep loadout entries the player actually owns.
    player.strategyLoadout = (progress.strategyLoadout ?? []).filter((id) =>
      player.unlockedStrategies.includes(id),
    );
    player.skillShards = Math.max(0, Math.floor(progress.skillShards ?? 0));
    player.combatShards = Math.max(0, Math.floor(progress.combatShards ?? 0));
    player.silver = Math.max(0, Math.floor(progress.silver ?? 0));
    player.materials = { ...(progress.materials ?? {}) };
  }

  // -------------------------------------------------------------------------
  // Crafting materials
  // -------------------------------------------------------------------------

  /** Current material counts for a player (material id → quantity). */
  getMaterials(socketId: string): Record<string, number> {
    return this.players.get(socketId)?.materials ?? {};
  }

  /** Add material drops to a player's stash. Returns false if unknown player. */
  grantMaterials(socketId: string, drops: { materialId: string; qty: number }[]): boolean {
    const player = this.players.get(socketId);
    if (!player) return false;
    for (const d of drops) {
      if (d.qty <= 0) continue;
      player.materials[d.materialId] = (player.materials[d.materialId] ?? 0) + Math.floor(d.qty);
    }
    return true;
  }

  /** True when the player owns at least `qty` of every listed material. */
  hasMaterials(socketId: string, costs: { materialId: string; qty: number }[]): boolean {
    const owned = this.players.get(socketId)?.materials;
    if (!owned) return false;
    // Sum required per id first, so duplicate entries are handled correctly.
    const need: Record<string, number> = {};
    for (const c of costs) need[c.materialId] = (need[c.materialId] ?? 0) + Math.max(0, Math.floor(c.qty));
    return Object.entries(need).every(([id, q]) => (owned[id] ?? 0) >= q);
  }

  /**
   * Atomically remove material costs from a player's stash. Returns false (and
   * changes nothing) unless every cost can be fully paid — callers rely on this
   * all-or-nothing behaviour so a craft never half-consumes ingredients.
   */
  consumeMaterials(socketId: string, costs: { materialId: string; qty: number }[]): boolean {
    const player = this.players.get(socketId);
    if (!player || !this.hasMaterials(socketId, costs)) return false;
    for (const c of costs) {
      const q = Math.max(0, Math.floor(c.qty));
      if (q <= 0) continue;
      const left = (player.materials[c.materialId] ?? 0) - q;
      if (left > 0) player.materials[c.materialId] = left;
      else delete player.materials[c.materialId];
    }
    return true;
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
        skillShards: player.skillShards,
        combatShards: player.combatShards,
        silver: player.silver,
        materials: player.materials,
        attributePoints: player.attributePoints,
      },
      { upsert: true, new: true },
    ).catch((err) => {
      console.error('[PlayerManager] persistProgress error:', err);
    });
  }

  // -------------------------------------------------------------------------
  // Shard currencies (skill / combat) — tracked balances, NOT inventory items.
  // -------------------------------------------------------------------------

  getSkillShards(socketId: string): number {
    return this.players.get(socketId)?.skillShards ?? 0;
  }

  getCombatShards(socketId: string): number {
    return this.players.get(socketId)?.combatShards ?? 0;
  }

  /** Add to a shard balance (server-side callers only). Persists. */
  addShards(socketId: string, kind: 'skill' | 'combat', amount: number): void {
    if (amount <= 0) return;
    const player = this.players.get(socketId);
    if (!player) return;
    if (kind === 'skill') player.skillShards += amount;
    else player.combatShards += amount;
    this.persistProgress(socketId);
  }

  /**
   * Spend from a shard balance. Returns false and changes nothing if the
   * player can't afford it — the only place balances are checked, server-side.
   */
  spendShards(socketId: string, kind: 'skill' | 'combat', amount: number): boolean {
    if (amount <= 0) return false;
    const player = this.players.get(socketId);
    if (!player) return false;
    const balance = kind === 'skill' ? player.skillShards : player.combatShards;
    if (balance < amount) return false;
    if (kind === 'skill') player.skillShards -= amount;
    else player.combatShards -= amount;
    this.persistProgress(socketId);
    return true;
  }

  // -------------------------------------------------------------------------
  // Silver currency — money for buying/selling items at the Market.
  // -------------------------------------------------------------------------

  getSilver(socketId: string): number {
    return this.players.get(socketId)?.silver ?? 0;
  }

  /** Add silver (server-side callers only). Persists. */
  addSilver(socketId: string, amount: number): void {
    if (amount <= 0) return;
    const player = this.players.get(socketId);
    if (!player) return;
    player.silver += amount;
    this.persistProgress(socketId);
  }

  /** Spend silver. Returns false and changes nothing if the player can't
   *  afford it — the only balance check, server-side. */
  spendSilver(socketId: string, amount: number): boolean {
    if (amount <= 0) return false;
    const player = this.players.get(socketId);
    if (!player) return false;
    if (player.silver < amount) return false;
    player.silver -= amount;
    this.persistProgress(socketId);
    return true;
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
  // Character attributes / allocation
  // -------------------------------------------------------------------------

  /** Total allocation points the player has earned (level * POINTS_PER_LEVEL). */
  getTotalPoints(socketId: string): number {
    const player = this.players.get(socketId);
    if (!player) return 0;
    return player.level * POINTS_PER_LEVEL;
  }

  /** Sum of all points the player has spent across attributes. */
  private getSpentPoints(player: Player): number {
    return ATTRIBUTE_KEYS.reduce((s, k) => s + (player.attributePoints[k] ?? 0), 0);
  }

  /** Points the player has earned but not yet allocated (never negative). */
  getUnspentPoints(socketId: string): number {
    const player = this.players.get(socketId);
    if (!player) return 0;
    return Math.max(0, player.level * POINTS_PER_LEVEL - this.getSpentPoints(player));
  }

  /**
   * Defensive clamp: if a loaded allocation exceeds what `level` permits (e.g.
   * the formula changed), proportionally trim from the largest attributes so
   * the total never exceeds level*POINTS_PER_LEVEL.
   */
  private clampAllocatedToCap(
    points: Record<AttributeKey, number>,
    level: number,
  ): Record<AttributeKey, number> {
    const cap = Math.max(0, level) * POINTS_PER_LEVEL;
    let total = ATTRIBUTE_KEYS.reduce((s, k) => s + points[k], 0);
    if (total <= cap) return points;
    // Trim from the largest attribute repeatedly until within cap.
    const out = { ...points };
    while (total > cap) {
      let largest: AttributeKey = ATTRIBUTE_KEYS[0];
      for (const k of ATTRIBUTE_KEYS) if (out[k] > out[largest]) largest = k;
      if (out[largest] <= 0) break;
      out[largest] -= 1;
      total -= 1;
    }
    return out;
  }

  /**
   * Allocate one point into `attribute` if the player has an unspent point.
   * Server-authoritative — returns false (changing nothing) when the player is
   * unknown, the attribute is invalid, or there are no unspent points.
   * Persistence and stat recompute are the caller's responsibility.
   */
  allocatePoint(socketId: string, attribute: AttributeKey): boolean {
    const player = this.players.get(socketId);
    if (!player) return false;
    if (!ATTRIBUTE_KEYS.includes(attribute)) return false;
    if (this.getUnspentPoints(socketId) <= 0) return false;
    player.attributePoints[attribute] = (player.attributePoints[attribute] ?? 0) + 1;
    return true;
  }

  /** A player's BASE attribute value = ATTRIBUTE_BASE + allocated points. */
  private baseAttribute(player: Player, attr: AttributeKey): number {
    return ATTRIBUTE_BASE + (player.attributePoints[attr] ?? 0);
  }

  /**
   * Compute the full attribute + derived-stat breakdown for a player, folding
   * in their equipped gear.  Generated items (EQUIPMENT_MAP) contribute to
   * attributes and to derived bonuses depending on their attribute type;
   * legacy ItemDatabase items contribute their {attack,defense,hp} stats
   * directly to the matching derived stat.
   *
   * Returns the `stats:update` payload AND the derived maxHp so the caller can
   * apply it to combat HP.
   */
  computeStats(
    socketId: string,
    equipment: EquipmentSlots,
  ): { payload: StatsUpdatePayload; maxHp: number; maxMana: number; manaRegen: number; healthRegen: number } | null {
    const player = this.players.get(socketId);
    if (!player) return null;

    // ── Gear contributions ──────────────────────────────────────────────────
    const attrGear: Record<AttributeKey, number> = defaultAttributePoints();
    // Direct derived-stat gear bonuses.
    const gear = {
      hp: 0, attack: 0, defense: 0,
      damage_bonus: 0, magic_damage: 0, healing_bonus: 0, crit_chance: 0,
      mp_regen: 0, hp_regen: 0,
    };

    for (const item of Object.values(equipment)) {
      if (!item) continue;
      const generated = EQUIPMENT_MAP[item.itemType];
      if (generated) {
        for (const a of generated.attributes) {
          const t = a.type as AttributeType;
          if ((ATTRIBUTE_KEYS as readonly string[]).includes(t)) {
            attrGear[t as AttributeKey] += a.value;
          } else if (t === 'damage_bonus') {
            gear.damage_bonus += a.value;
          } else if (t === 'healing_bonus') {
            gear.healing_bonus += a.value;
          } else if (t === 'crit_chance') {
            gear.crit_chance += a.value;
          } else if (t === 'mp_regen') {
            gear.mp_regen += a.value;
          } else if (t === 'hp_regen') {
            gear.hp_regen += a.value;
          } else if (
            t === 'fire_damage' || t === 'ice_damage' || t === 'lightning_damage' ||
            t === 'holy_damage' || t === 'nature_damage'
          ) {
            gear.magic_damage += a.value;
          }
          // Remaining types (gold_find, dot/aoe, debuff_resist) are flavour
          // bonuses not surfaced as core stats here.
        }
      } else {
        // Legacy ItemDatabase item — apply its raw stats directly.
        const s = item.stats ?? {};
        if (typeof s.hp === 'number') gear.hp += s.hp;
        if (typeof s.attack === 'number') gear.attack += s.attack;
        if (typeof s.defense === 'number') gear.defense += s.defense;
      }
    }

    // ── Attributes (base from allocation + gear) ────────────────────────────
    const attributes: StatRow[] = ATTRIBUTE_KEYS.map((k) => {
      const base = this.baseAttribute(player, k);
      const g = attrGear[k];
      return { key: k, label: ATTRIBUTE_LABELS[k], base, gear: g, total: base + g };
    });

    // TOTAL attribute values (base + gear) drive the derived formulas.
    const tot = (k: AttributeKey) => this.baseAttribute(player, k) + attrGear[k];
    const STR = tot('strength');
    const CON = tot('constitution');
    const DEX = tot('dexterity');
    const INT = tot('intelligence');
    const SPI = tot('spirit');
    // Base-only attribute values (gear excluded) for the "base" derived column.
    const bSTR = this.baseAttribute(player, 'strength');
    const bCON = this.baseAttribute(player, 'constitution');
    const bDEX = this.baseAttribute(player, 'dexterity');
    const bINT = this.baseAttribute(player, 'intelligence');
    const bSPI = this.baseAttribute(player, 'spirit');

    /** Build a derived row; total uses gear-inclusive attrs + gear direct bonus. */
    const derivedRow = (
      key: string, label: string,
      baseVal: number, totalVal: number,
      isPercent?: boolean,
    ): StatRow => {
      const gearBonus = round1(totalVal - baseVal);
      return {
        key, label,
        base: round1(baseVal),
        gear: gearBonus,
        total: round1(totalVal),
        ...(isPercent ? { isPercent: true } : {}),
      };
    };

    const derived: StatRow[] = [
      // Max HP = 50 + CON*10 + gear hp
      derivedRow('maxHp', 'Max HP',
        50 + bCON * 10,
        50 + CON * 10 + gear.hp),
      // Attack Power = 5 + STR*2 + gear attack + gear damage_bonus
      derivedRow('attack', 'Attack Power',
        5 + bSTR * 2,
        5 + STR * 2 + gear.attack + gear.damage_bonus),
      // Magic Power = 5 + INT*2 + gear magic-school damage + gear damage_bonus
      derivedRow('magic', 'Magic Power',
        5 + bINT * 2,
        5 + INT * 2 + gear.magic_damage + gear.damage_bonus),
      // Defense = STR*2 + gear defense (scales off Strength)
      derivedRow('defense', 'Defense',
        bSTR * 2,
        STR * 2 + gear.defense),
      // Speed = 10 + DEX*2
      derivedRow('speed', 'Speed',
        10 + bDEX * 2,
        10 + DEX * 2),
      // Healing Power = SPI*2 + gear healing_bonus
      derivedRow('healing', 'Healing Power',
        bSPI * 2,
        SPI * 2 + gear.healing_bonus),
      // Crit Chance % = DEX*0.5 + gear crit_chance
      derivedRow('crit', 'Crit Chance',
        bDEX * 0.5,
        DEX * 0.5 + gear.crit_chance,
        true),
      // Mana (max) = 20 + SPI*8 — scales off Spirit
      derivedRow('mana', 'Mana',
        20 + bSPI * 8,
        20 + SPI * 8),
      // Mana Regen / turn = 2 + SPI*0.5 + gear mp_regen — scales off Spirit
      derivedRow('manaRegen', 'Mana Regen',
        2 + bSPI * 0.5,
        2 + SPI * 0.5 + gear.mp_regen),
      // Health Regen / battle = 3 + CON + gear hp_regen — scales off Constitution
      derivedRow('healthRegen', 'Health Regen',
        3 + bCON * 1,
        3 + CON * 1 + gear.hp_regen),
    ];

    const maxHp = 50 + CON * 10 + gear.hp;
    const maxMana = Math.round(20 + SPI * 8);
    const manaRegen = round1(2 + SPI * 0.5 + gear.mp_regen);
    const healthRegen = round1(3 + CON * 1 + gear.hp_regen);

    return {
      payload: {
        attributes,
        derived,
        unspentPoints: this.getUnspentPoints(socketId),
        level: player.level,
      },
      maxHp,
      maxMana,
      manaRegen,
      healthRegen,
    };
  }

  /**
   * Recompute the player's derived Max HP from their attributes + gear and
   * apply it as the real combat maxHp, clamping current hp to the new max.
   * Returns the stats payload so the caller can push `stats:update`.
   */
  applyDerivedStats(
    socketId: string,
    equipment: EquipmentSlots,
  ): StatsUpdatePayload | null {
    const player = this.players.get(socketId);
    if (!player) return null;
    const result = this.computeStats(socketId, equipment);
    if (!result) return null;
    player.maxHp = result.maxHp;
    if (player.hp > player.maxHp) player.hp = player.maxHp;
    return result.payload;
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
