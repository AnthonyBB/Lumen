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
  Character,
  PublicPlayer,
  Subject,
  AttributeKey,
  StatRow,
  StatsUpdatePayload,
  EquipmentSlots,
} from '../types/index.js';
import { ATTRIBUTE_KEYS } from '../types/index.js';
import { randomUUID } from 'crypto';
import { PlayerProgress } from '../db/models/PlayerProgressModel.js';
import { MASTERED_GRADE, TOPICS_BY_SUBJECT_GRADE } from './data/curriculum.js';
import {
  type AdventureRankId,
  DEFAULT_RANK_ID,
  normaliseRankId,
  gradeBandForRank,
  effectiveRankMultiplier,
} from './data/adventureRanks.js';
import type { AttributeType } from './data/equipmentGen.js';

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

/** Max characters in a campaign party (see docs/CHARACTERS_DESIGN.md §5). */
export const MAX_PARTY_SIZE = 4;

// ── Skill ranks (see docs/CHARACTERS_DESIGN.md §4) ──────────────────────────
/** Highest rank a skill can reach. */
export const MAX_SKILL_RANK = 5;
/** Per-rank effect bonus: each rank above 1 adds this to flat magnitudes
 *  (rank 5 = 1.8× base). Applied client-side in combat. */
export const SKILL_RANK_BONUS = 0.2;
/** Character level required to buy a given rank: 1/4/7/10/13 for ranks 1..5. */
export function skillRankLevelGate(rank: number): number {
  return 1 + (Math.max(1, rank) - 1) * 3;
}
/** Skill-Shard cost to buy `rank` of a skill at the given tier price:
 *  tierPrice × rank (so higher ranks cost progressively more). */
export function skillRankCost(tierPrice: number, rank: number): number {
  return Math.max(1, tierPrice) * Math.max(1, rank);
}

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

/** Default class for a migrated / starter character until acquisition assigns
 *  one (skill class-locking is not yet enforced — see docs/CHARACTERS_DESIGN.md). */
const DEFAULT_CHARACTER_CLASS = 'sword';

/** Level-derived max HP (legacy single-character formula). */
function maxHpForLevel(level: number): number {
  return 100 + (Math.max(1, level) - 1) * 20;
}

/** Build a fresh level-1 character. */
function newCharacter(name: string, cls: string = DEFAULT_CHARACTER_CLASS): Character {
  return {
    id: randomUUID(),
    name,
    class: cls,
    level: 1,
    xp: 0,
    hp: 100,
    maxHp: 100,
    skillRanks: {},
    strategyLoadout: [],
    skillShards: 0,
    attributePoints: defaultAttributePoints(),
  };
}

/** Sanitise a persisted skill-ranks map (clamp ranks to 1..MAX_SKILL_RANK), and
 *  migrate a legacy `unlockedSkills` id array (every owned skill → rank 1). */
function normaliseSkillRanks(
  rawRanks: Record<string, unknown> | undefined,
  legacyUnlocked: string[] | undefined,
): Record<string, number> {
  const out: Record<string, number> = {};
  if (rawRanks && typeof rawRanks === 'object') {
    for (const [id, r] of Object.entries(rawRanks)) {
      const rank = Math.floor(Number(r));
      if (Number.isFinite(rank) && rank >= 1) out[id] = Math.min(MAX_SKILL_RANK, rank);
    }
  }
  if (Array.isArray(legacyUnlocked)) {
    for (const id of legacyUnlocked) if (typeof id === 'string' && !(id in out)) out[id] = 1;
  }
  return out;
}

/** Sanitise a persisted character record (clamp numbers, fill gaps, recompute
 *  level/HP from XP so the authoritative curve always wins). */
function normaliseCharacter(
  raw: (Partial<Character> & { unlockedSkills?: string[] }) | undefined,
  fallbackName: string,
): Character {
  const xp = Math.max(0, Math.floor(raw?.xp ?? 0));
  const level = levelForXp(xp);
  return {
    id: typeof raw?.id === 'string' && raw.id ? raw.id : randomUUID(),
    name: typeof raw?.name === 'string' && raw.name ? raw.name : fallbackName,
    class: typeof raw?.class === 'string' && raw.class ? raw.class : DEFAULT_CHARACTER_CLASS,
    level,
    xp,
    maxHp: maxHpForLevel(level),
    hp: maxHpForLevel(level),
    skillRanks: normaliseSkillRanks(
      raw?.skillRanks as Record<string, unknown> | undefined,
      raw?.unlockedSkills,
    ),
    strategyLoadout: Array.isArray(raw?.strategyLoadout) ? [...raw!.strategyLoadout] : [],
    skillShards: Math.max(0, Math.floor(raw?.skillShards ?? 0)),
    attributePoints: normaliseAttributePoints(raw?.attributePoints),
  };
}

/** Migrate a legacy single-character progress doc (flat xp/level/skills/… on the
 *  account) into a one-element roster. See docs/CHARACTERS_DESIGN.md §1. */
function migrateFlatToCharacter(doc: {
  xp?: number; unlockedSkills?: string[]; strategyLoadout?: string[];
  skillShards?: number; attributePoints?: Record<string, number>;
}, name: string): Character {
  return normaliseCharacter({
    name,
    class: DEFAULT_CHARACTER_CLASS,
    xp: doc.xp,
    unlockedSkills: doc.unlockedSkills,
    strategyLoadout: doc.strategyLoadout,
    skillShards: doc.skillShards,
    attributePoints: doc.attributePoints as Record<AttributeKey, number> | undefined,
  }, name);
}

/** Clean a campaign party: keep only owned ids, in order, deduped, capped at
 *  MAX_PARTY_SIZE; fall back to the active (or first) character if empty. */
function sanitiseParty(ids: unknown, characters: Character[], activeId: string): string[] {
  const owned = new Set(characters.map((c) => c.id));
  const seen = new Set<string>();
  const out: string[] = [];
  if (Array.isArray(ids)) {
    for (const id of ids) {
      if (typeof id === 'string' && owned.has(id) && !seen.has(id)) {
        seen.add(id);
        out.push(id);
        if (out.length >= MAX_PARTY_SIZE) break;
      }
    }
  }
  if (out.length === 0) {
    out.push(owned.has(activeId) ? activeId : (characters[0]?.id ?? ''));
  }
  return out.filter((id) => id);
}

/** Gear contributions folded out of a character's equipped slots. */
export interface GearFold {
  attrGear: Record<AttributeKey, number>;
  gear: {
    hp: number; attack: number; defense: number;
    damage_bonus: number; magic_damage: number; healing_bonus: number;
    crit_chance: number; mp_regen: number; hp_regen: number;
  };
}

/** Fold equipped gear into attribute + derived-stat bonuses. Base defense scales
 *  by M(min(craftRank, currentRank)); affixes are flat. Pure — shared by
 *  computeStats (UI) and the combat resolver adapter. */
export function foldEquipment(equipment: EquipmentSlots, currentRank: string): GearFold {
  const attrGear: Record<AttributeKey, number> = defaultAttributePoints();
  const gear = {
    hp: 0, attack: 0, defense: 0,
    damage_bonus: 0, magic_damage: 0, healing_bonus: 0, crit_chance: 0,
    mp_regen: 0, hp_regen: 0,
  };
  for (const item of Object.values(equipment)) {
    if (!item) continue;
    if (typeof item.baseDefense === 'number') {
      gear.defense += item.baseDefense * effectiveRankMultiplier(item.craftRank ?? DEFAULT_RANK_ID, currentRank);
    }
    if (item.attributes && item.attributes.length) {
      for (const a of item.attributes) {
        const t = a.type as AttributeType;
        if ((ATTRIBUTE_KEYS as readonly string[]).includes(t)) {
          attrGear[t as AttributeKey] += a.value;
        } else if (t === 'damage_bonus') gear.damage_bonus += a.value;
        else if (t === 'healing_bonus') gear.healing_bonus += a.value;
        else if (t === 'crit_chance') gear.crit_chance += a.value;
        else if (t === 'mp_regen') gear.mp_regen += a.value;
        else if (t === 'hp_regen') gear.hp_regen += a.value;
        else if (t === 'fire_damage' || t === 'ice_damage' || t === 'lightning_damage' ||
                 t === 'holy_damage' || t === 'nature_damage') gear.magic_damage += a.value;
      }
    } else {
      const s = item.stats ?? {};
      if (typeof s.hp === 'number') gear.hp += s.hp;
      if (typeof s.attack === 'number') gear.attack += s.attack;
      if (typeof s.defense === 'number') gear.defense += s.defense;
    }
  }
  return { attrGear, gear };
}

/** A character's raw derived combat stats (no UI rows). Pure — used by the combat
 *  resolver adapter for ANY roster member, not just the active one. */
export interface DerivedCombatStats {
  maxHp: number; attack: number; magic: number; defense: number;
  speed: number; healing: number; maxMana: number;
}
export function deriveCombatStats(
  character: Character, equipment: EquipmentSlots, currentRank: string,
): DerivedCombatStats {
  const { attrGear, gear } = foldEquipment(equipment, currentRank);
  const A = (k: AttributeKey) => ATTRIBUTE_BASE + (character.attributePoints[k] ?? 0) + attrGear[k];
  const STR = A('strength'), CON = A('constitution'), DEX = A('dexterity');
  const INT = A('intelligence'), SPI = A('spirit');
  return {
    maxHp: Math.round(50 + CON * 10 + gear.hp),
    attack: Math.round(5 + STR * 2 + gear.attack + gear.damage_bonus),
    magic: Math.round(5 + INT * 2 + gear.magic_damage + gear.damage_bonus),
    defense: Math.round(STR * 2 + gear.defense),
    speed: Math.round(10 + DEX * 2),
    healing: Math.round(SPI * 2 + gear.healing_bonus),
    maxMana: Math.round(20 + SPI * 8),
  };
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

/** Shape returned by loadProgress / consumed by applyProgress — an account's
 *  roster plus its account-wide state. */
export interface LoadedProgress {
  characters: Character[];
  activeCharacterId: string;
  party: string[];
  subjectGrades: Record<Subject, number>;
  adventureRank: AdventureRankId;
  /** True when a rank was already persisted (so join should NOT overwrite it
   *  with an age-derived default). */
  rankPersisted: boolean;
  topicPasses: Record<string, number>;
  unlockedStrategies: string[];
  combatShards: number;
  silver: number;
  materials: Record<string, number>;
  campaignsCompleted: number;
  recruitTokens: number;
}

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

    const starter = newCharacter(trimmed);
    const player: Player = {
      id: socketId,
      username: trimmed,
      zone: INITIAL_STATS.zone,
      position: { ...INITIAL_STATS.position },
      lastMessageAt: 0,
      characters: [starter],
      activeCharacterId: starter.id,
      party: [starter.id],
      subjectGrades: defaultSubjectGrades(),
      adventureRank: DEFAULT_RANK_ID,
      topicPasses: {},
      unlockedStrategies: [],
      combatShards: 0,
      silver: 0,
      materials: {},
      campaignsCompleted: 0,
      recruitTokens: 0,
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
  // Active character (the roster member current operations target)
  // -------------------------------------------------------------------------

  /** The active character of an account (falls back to the first if the active
   *  id is stale; guarantees a character since the roster is never empty). */
  private active(player: Player): Character {
    return player.characters.find((c) => c.id === player.activeCharacterId)
      ?? player.characters[0];
  }

  /** The active character for a socket, or undefined if the player is unknown. */
  private activeOf(socketId: string): Character | undefined {
    const player = this.players.get(socketId);
    return player ? this.active(player) : undefined;
  }

  /** All characters in an account's roster. */
  getCharacters(socketId: string): Character[] {
    return this.players.get(socketId)?.characters ?? [];
  }

  /** The active character (public read). */
  getActiveCharacter(socketId: string): Character | undefined {
    return this.activeOf(socketId);
  }

  /** Switch which character is active. Returns false if the id isn't owned. */
  setActiveCharacter(socketId: string, characterId: string): boolean {
    const player = this.players.get(socketId);
    if (!player || !player.characters.some((c) => c.id === characterId)) return false;
    player.activeCharacterId = characterId;
    return true;
  }

  /** The campaign party (ordered owned character ids, always ≥1). */
  getParty(socketId: string): string[] {
    const player = this.players.get(socketId);
    if (!player) return [];
    return sanitiseParty(player.party, player.characters, player.activeCharacterId);
  }

  /** Replace the campaign party (ordered ids). Owned ids only, deduped, capped at
   *  MAX_PARTY_SIZE, never empty. Returns false only for an unknown player. */
  setParty(socketId: string, ids: string[]): boolean {
    const player = this.players.get(socketId);
    if (!player) return false;
    player.party = sanitiseParty(ids, player.characters, player.activeCharacterId);
    return true;
  }

  /**
   * Add a new character to the roster (caller validates the class + any
   * acquisition cost/cap). Returns the created character, or an error for a bad
   * name. Does NOT change the active character.
   */
  createCharacter(socketId: string, name: string, cls: string):
    { character: Character } | { error: string } {
    const player = this.players.get(socketId);
    if (!player) return { error: 'You must join before recruiting.' };
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 20) {
      return { error: 'Character name must be 2–20 characters.' };
    }
    if (!/^[a-zA-Z0-9 _-]+$/.test(trimmed)) {
      return { error: 'Name may only contain letters, numbers, spaces, _ and -.' };
    }
    const character = newCharacter(trimmed, cls);
    player.characters.push(character);
    return { character };
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

  /** Apply XP to a specific character, calculating level-ups server-side. */
  private applyXp(ch: Character, amount: number): { newXp: number; newLevel: number; leveledUp: boolean } {
    ch.xp += Math.max(0, amount);
    const oldLevel = ch.level;
    // Progressive curve — each level costs more XP than the last (see xpForLevel).
    ch.level = levelForXp(ch.xp);
    if (ch.level > oldLevel) {
      ch.maxHp = maxHpForLevel(ch.level);
      ch.hp = ch.maxHp; // restore full HP on level-up
    }
    return { newXp: ch.xp, newLevel: ch.level, leveledUp: ch.level > oldLevel };
  }

  /** Apply XP gain to the ACTIVE character. */
  addXp(socketId: string, amount: number): { newXp: number; newLevel: number; leveledUp: boolean } {
    const ch = this.activeOf(socketId);
    if (!ch) return { newXp: 0, newLevel: 1, leveledUp: false };
    return this.applyXp(ch, amount);
  }

  /** Apply XP to a SPECIFIC roster character (party combat — each ally levels
   *  individually). Returns null if the character isn't owned. */
  addXpToCharacter(socketId: string, characterId: string, amount: number):
    { newXp: number; newLevel: number; leveledUp: boolean } | null {
    const player = this.players.get(socketId);
    const ch = player?.characters.find((c) => c.id === characterId);
    if (!ch) return null;
    return this.applyXp(ch, amount);
  }

  // -------------------------------------------------------------------------
  // Progress persistence (MongoDB)
  // -------------------------------------------------------------------------

  /**
   * Load saved XP and level from MongoDB for a given userId (= username).
   * Returns default values if no record exists yet.
   */
  async loadProgress(userId: string): Promise<LoadedProgress> {
    try {
      const doc = await PlayerProgress.findOne({ userId }).lean();
      if (doc) {
        // Roster: use the stored characters if present, else MIGRATE the legacy
        // flat fields into a single-character roster (see docs §1).
        const stored = (doc as { characters?: Partial<Character>[] }).characters;
        const characters: Character[] =
          Array.isArray(stored) && stored.length > 0
            ? stored.map((c) => normaliseCharacter(c, userId))
            : [migrateFlatToCharacter(doc, userId)];
        const storedActive = (doc as { activeCharacterId?: string }).activeCharacterId;
        const activeCharacterId =
          typeof storedActive === 'string' && characters.some((c) => c.id === storedActive)
            ? storedActive
            : characters[0].id;
        return {
          characters,
          activeCharacterId,
          party: sanitiseParty(
            (doc as { party?: string[] }).party, characters, activeCharacterId,
          ),
          subjectGrades: normaliseSubjectGrades(doc.subjectGrades),
          adventureRank: normaliseRankId(doc.adventureRank),
          rankPersisted: typeof doc.adventureRank === 'string',
          topicPasses: doc.topicPasses ?? {},
          unlockedStrategies: doc.unlockedStrategies ?? [],
          combatShards: Math.max(0, doc.combatShards ?? 0),
          silver: Math.max(0, doc.silver ?? 0),
          materials: { ...((doc.materials as Record<string, number>) ?? {}) },
          campaignsCompleted: Math.max(0, doc.campaignsCompleted ?? 0),
          recruitTokens: Math.max(0, (doc as { recruitTokens?: number }).recruitTokens ?? 0),
        };
      }
    } catch (err) {
      console.error('[PlayerManager] loadProgress error:', err);
    }
    const starter = newCharacter(userId);
    return {
      characters: [starter],
      activeCharacterId: starter.id,
      party: [starter.id],
      subjectGrades: defaultSubjectGrades(), adventureRank: DEFAULT_RANK_ID, rankPersisted: false,
      topicPasses: {}, unlockedStrategies: [], combatShards: 0, silver: 0, materials: {},
      campaignsCompleted: 0, recruitTokens: 0,
    };
  }

  /**
   * Apply previously-loaded progress to a player who has already been
   * registered with addPlayer().
   */
  applyProgress(socketId: string, progress: LoadedProgress): void {
    const player = this.players.get(socketId);
    if (!player) return;

    // Account-wide state.
    player.subjectGrades = normaliseSubjectGrades(progress.subjectGrades);
    player.adventureRank = normaliseRankId(progress.adventureRank);
    player.topicPasses = { ...(progress.topicPasses ?? {}) };
    player.unlockedStrategies = [...(progress.unlockedStrategies ?? [])];
    player.combatShards = Math.max(0, Math.floor(progress.combatShards ?? 0));
    player.silver = Math.max(0, Math.floor(progress.silver ?? 0));
    player.materials = { ...(progress.materials ?? {}) };
    player.campaignsCompleted = Math.max(0, Math.floor(progress.campaignsCompleted ?? 0));
    player.recruitTokens = Math.max(0, Math.floor(progress.recruitTokens ?? 0));

    // Roster — finalise each character: clamp its allocation to its level cap and
    // keep only strategy-loadout entries that are in the account's catalog.
    player.characters = (progress.characters.length > 0
      ? progress.characters
      : [newCharacter(player.username)]
    ).map((c) => ({
      ...c,
      attributePoints: this.clampAllocatedToCap(c.attributePoints, c.level),
      strategyLoadout: c.strategyLoadout.filter((id) => player.unlockedStrategies.includes(id)),
    }));
    player.activeCharacterId =
      player.characters.some((c) => c.id === progress.activeCharacterId)
        ? progress.activeCharacterId
        : player.characters[0].id;
    player.party = sanitiseParty(progress.party, player.characters, player.activeCharacterId);
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

    const activeChar = this.active(player);
    PlayerProgress.findOneAndUpdate(
      { userId: player.username },
      {
        // Roster (the new source of truth for per-character state).
        characters: player.characters,
        activeCharacterId: player.activeCharacterId,
        party: player.party,
        // Account-wide.
        subjectGrades: player.subjectGrades,
        adventureRank: player.adventureRank,
        topicPasses: player.topicPasses,
        unlockedStrategies: player.unlockedStrategies,
        combatShards: player.combatShards,
        silver: player.silver,
        materials: player.materials,
        campaignsCompleted: player.campaignsCompleted,
        recruitTokens: player.recruitTokens,
        // Legacy mirror of the active character's level/xp — kept so older code
        // paths / dashboards reading the flat fields still see sane values.
        xp: activeChar.xp,
        level: activeChar.level,
      },
      { upsert: true, new: true },
    ).catch((err) => {
      console.error('[PlayerManager] persistProgress error:', err);
    });
  }

  // -------------------------------------------------------------------------
  // Shard currencies (skill / combat) — tracked balances, NOT inventory items.
  // -------------------------------------------------------------------------

  /** Total campaigns this player has completed (persisted). */
  getCampaignsCompleted(socketId: string): number {
    return this.players.get(socketId)?.campaignsCompleted ?? 0;
  }

  /** Record a campaign completion. Returns the new total. Persists. */
  recordCampaignCompletion(socketId: string): number {
    const player = this.players.get(socketId);
    if (!player) return 0;
    player.campaignsCompleted += 1;
    this.persistProgress(socketId);
    return player.campaignsCompleted;
  }

  /** Skill Shards belong to the ACTIVE character; Combat Shards to the account. */
  getSkillShards(socketId: string): number {
    return this.activeOf(socketId)?.skillShards ?? 0;
  }

  getCombatShards(socketId: string): number {
    return this.players.get(socketId)?.combatShards ?? 0;
  }

  /** Add to a shard balance (server-side callers only). Persists. */
  addShards(socketId: string, kind: 'skill' | 'combat', amount: number): void {
    if (amount <= 0) return;
    const player = this.players.get(socketId);
    if (!player) return;
    if (kind === 'skill') this.active(player).skillShards += amount;
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
    const ch = this.active(player);
    const balance = kind === 'skill' ? ch.skillShards : player.combatShards;
    if (balance < amount) return false;
    if (kind === 'skill') ch.skillShards -= amount;
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

  // ── Recruit Tokens — spent to recruit characters beyond the free team (§2) ──
  getRecruitTokens(socketId: string): number {
    return this.players.get(socketId)?.recruitTokens ?? 0;
  }

  /** Add Recruit Tokens (server-side callers only). Persists. */
  addRecruitTokens(socketId: string, amount: number): void {
    if (amount <= 0) return;
    const player = this.players.get(socketId);
    if (!player) return;
    player.recruitTokens += Math.floor(amount);
    this.persistProgress(socketId);
  }

  /** Spend Recruit Tokens. Returns false (unchanged) if the player can't afford it. */
  spendRecruitTokens(socketId: string, amount: number): boolean {
    if (amount <= 0) return true;
    const player = this.players.get(socketId);
    if (!player || player.recruitTokens < amount) return false;
    player.recruitTokens -= amount;
    this.persistProgress(socketId);
    return true;
  }

  /** The player's adventure rank id (defaults if unknown). */
  getAdventureRank(socketId: string): AdventureRankId {
    return normaliseRankId(this.players.get(socketId)?.adventureRank);
  }

  /** The grade band [min, max] the player's rank draws questions from. */
  getRankGradeBand(socketId: string): { min: number; max: number } {
    return gradeBandForRank(this.getAdventureRank(socketId));
  }

  /** Set the player's adventure rank (server-validated id). Persists. */
  setAdventureRank(socketId: string, rankId: string): boolean {
    const player = this.players.get(socketId);
    if (!player) return false;
    player.adventureRank = normaliseRankId(rankId);
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

  /** The active character's skillId → rank map. */
  getSkillRanks(socketId: string): Record<string, number> {
    return this.activeOf(socketId)?.skillRanks ?? {};
  }

  /** The active character's rank in a skill (0 = not owned). */
  getSkillRank(socketId: string, skillId: string): number {
    return this.activeOf(socketId)?.skillRanks[skillId] ?? 0;
  }

  /** Owned skill ids (rank ≥ 1) for the active character. */
  getUnlockedSkills(socketId: string): string[] {
    const ranks = this.activeOf(socketId)?.skillRanks ?? {};
    return Object.keys(ranks).filter((id) => ranks[id] >= 1);
  }

  /** Whether the active character owns a given skill (rank ≥ 1). */
  hasSkill(socketId: string, skillId: string): boolean {
    return this.getSkillRank(socketId, skillId) >= 1;
  }

  /** Set the active character's rank in a skill (clamped to MAX_SKILL_RANK). */
  setSkillRank(socketId: string, skillId: string, rank: number): void {
    const ch = this.activeOf(socketId);
    if (!ch) return;
    ch.skillRanks[skillId] = Math.max(0, Math.min(MAX_SKILL_RANK, Math.floor(rank)));
  }

  /** Add purchased strategy ids to the player's unlocks (idempotent). */
  unlockStrategies(socketId: string, strategyIds: string[]): void {
    const player = this.players.get(socketId);
    if (!player) return;
    for (const id of strategyIds) {
      if (!player.unlockedStrategies.includes(id)) player.unlockedStrategies.push(id);
    }
  }

  /** Replace the ACTIVE character's ordered strategy loadout (caller validates
   *  ids against the account catalog). */
  setStrategyLoadout(socketId: string, strategyIds: string[]): void {
    const ch = this.activeOf(socketId);
    if (!ch) return;
    ch.strategyLoadout = [...strategyIds];
  }

  /** The active character's strategy loadout. */
  getStrategyLoadout(socketId: string): string[] {
    return this.activeOf(socketId)?.strategyLoadout ?? [];
  }

  /** Record the timestamp of the last chat message for rate-limiting. */
  updateLastMessageAt(socketId: string, ts: number): void {
    const player = this.players.get(socketId);
    if (player) player.lastMessageAt = ts;
  }

  // -------------------------------------------------------------------------
  // Character attributes / allocation
  // -------------------------------------------------------------------------

  /** Total allocation points the active character has earned (level * POINTS_PER_LEVEL). */
  getTotalPoints(socketId: string): number {
    const ch = this.activeOf(socketId);
    return ch ? ch.level * POINTS_PER_LEVEL : 0;
  }

  /** Sum of all points a character has spent across attributes. */
  private getSpentPoints(ch: Character): number {
    return ATTRIBUTE_KEYS.reduce((s, k) => s + (ch.attributePoints[k] ?? 0), 0);
  }

  /** Points the active character has earned but not yet allocated (never negative). */
  getUnspentPoints(socketId: string): number {
    const ch = this.activeOf(socketId);
    if (!ch) return 0;
    return Math.max(0, ch.level * POINTS_PER_LEVEL - this.getSpentPoints(ch));
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
    const ch = this.activeOf(socketId);
    if (!ch) return false;
    if (!ATTRIBUTE_KEYS.includes(attribute)) return false;
    if (this.getUnspentPoints(socketId) <= 0) return false;
    ch.attributePoints[attribute] = (ch.attributePoints[attribute] ?? 0) + 1;
    return true;
  }

  /** A character's BASE attribute value = ATTRIBUTE_BASE + allocated points. */
  private baseAttribute(ch: Character, attr: AttributeKey): number {
    return ATTRIBUTE_BASE + (ch.attributePoints[attr] ?? 0);
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
    // Attributes/level come from the ACTIVE character; rank is account-wide.
    const ch = this.active(player);

    // ── Gear contributions (rank-scaled base defense + affixes) ───────────────
    const currentRank = normaliseRankId(player.adventureRank);
    const { attrGear, gear } = foldEquipment(equipment, currentRank);

    // ── Attributes (base from allocation + gear) ────────────────────────────
    const attributes: StatRow[] = ATTRIBUTE_KEYS.map((k) => {
      const base = this.baseAttribute(ch, k);
      const g = attrGear[k];
      return { key: k, label: ATTRIBUTE_LABELS[k], base, gear: g, total: base + g };
    });

    // TOTAL attribute values (base + gear) drive the derived formulas.
    const tot = (k: AttributeKey) => this.baseAttribute(ch, k) + attrGear[k];
    const STR = tot('strength');
    const CON = tot('constitution');
    const DEX = tot('dexterity');
    const INT = tot('intelligence');
    const SPI = tot('spirit');
    // Base-only attribute values (gear excluded) for the "base" derived column.
    const bSTR = this.baseAttribute(ch, 'strength');
    const bCON = this.baseAttribute(ch, 'constitution');
    const bDEX = this.baseAttribute(ch, 'dexterity');
    const bINT = this.baseAttribute(ch, 'intelligence');
    const bSPI = this.baseAttribute(ch, 'spirit');

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
        level: ch.level,
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
    const ch = this.active(player);
    ch.maxHp = result.maxHp;
    if (ch.hp > ch.maxHp) ch.hp = ch.maxHp;
    return result.payload;
  }

  // -------------------------------------------------------------------------
  // Serialisation helpers
  // -------------------------------------------------------------------------

  /** Convert internal player to the safe public representation. */
  toPublic(player: Player): PublicPlayer {
    const ch = this.active(player);
    return {
      id: player.id,
      username: player.username,
      level: ch.level,
      hp: ch.hp,
      maxHp: ch.maxHp,
      zone: player.zone,
      position: { ...player.position },
    };
  }
}
