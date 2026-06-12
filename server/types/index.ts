/**
 * Shared TypeScript types for the Lumen multiplayer backend.
 * All game state is authoritative on the server — these types describe
 * what the server tracks internally and what it sends to clients.
 */

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------

export interface PlayerPosition {
  x: number;
  y: number;
}

/** Full player record stored on the server (never sent entirely to clients). */
/**
 * A single playable character in an account's roster (see
 * docs/CHARACTERS_DESIGN.md §1). Per-character state: level/xp/hp, its class,
 * its purchased skills, its Skill-Shard balance, its attribute allocation, and
 * its own strategy loadout. The account (Player) owns the shared bag, materials,
 * silver, Combat Shards, strategy *catalog*, learning progress, and rank.
 */
export interface Character {
  id: string;            // stable uuid (persisted)
  /** Display name for this character (distinct from the account username). */
  name: string;
  /** Class id (a skill class, e.g. 'sword', 'cleric'). Not yet
   *  restriction-enforced — skill class-locking lands with rankable skills. */
  class: string;
  level: number;
  xp: number;
  hp: number;
  maxHp: number;
  /** skillId → rank (1..MAX_SKILL_RANK) this character has purchased (persisted).
   *  Absent key = not owned. Ranks are bought with Skill Shards and gated by the
   *  character's level (see docs/CHARACTERS_DESIGN.md §4). */
  skillRanks: Record<string, number>;
  /** This character's ordered strategy loadout (persisted, owned-strategy ids
   *  only; first entry is checked first in combat). Built from the account-wide
   *  strategy catalog (Player.unlockedStrategies). */
  strategyLoadout: string[];
  /** This character's Skill Shard balance (persisted) — earned from its own
   *  battles, spent on its own skills. */
  skillShards: number;
  /** Points allocated per attribute for this character (persisted).
   *  Total earned = level*3; a base attribute = 5 + attributePoints[attr]. */
  attributePoints: Record<AttributeKey, number>;
}

export interface Player {
  id: string;           // socket ID
  username: string;     // account name
  zone: string;
  position: PlayerPosition;
  lastMessageAt: number; // unix ms — used for chat rate-limiting
  /** The account's roster of characters. Always has at least one. */
  characters: Character[];
  /** Which character is currently active (drives the town avatar and the
   *  Character/Equipment screens). */
  activeCharacterId: string;
  /** The campaign party — an ordered list of up to 4 owned character ids that
   *  fight together (see docs/CHARACTERS_DESIGN.md §5). Always has ≥1 entry. */
  party: string[];
  /** Current grade per subject (persisted, ACCOUNT-wide), 1..12, or 13
   *  (MASTERED_GRADE) when all 12 grades of a subject are complete. */
  subjectGrades: Record<Subject, number>;
  /** Adventure rank id (persisted, ACCOUNT-wide) — gates which curriculum grade
   *  band the player is served questions from. See game/data/adventureRanks.ts. */
  adventureRank: string;
  /** topicId → number of quiz passes (persisted, ACCOUNT-wide), 0..3. */
  topicPasses: Record<string, number>;
  /** Combat strategy ids unlocked with Combat Shards (persisted, ACCOUNT-wide
   *  catalog). Each character configures its own loadout from this catalog. */
  unlockedStrategies: string[];
  /** Combat Shard balance (persisted, ACCOUNT-wide) — buys strategy unlocks. */
  combatShards: number;
  /** Silver balance (persisted, ACCOUNT-wide). */
  silver: number;
  /** Crafting material counts (persisted, ACCOUNT-wide shared bag stash). */
  materials: Record<string, number>;
  /** How many campaigns this account has completed (persisted). */
  campaignsCompleted: number;
  /** Recruit Tokens (persisted, ACCOUNT-wide) — spent to recruit new characters. */
  recruitTokens: number;
  /** Study-to-Haste stacks (persisted, ACCOUNT-wide). Each passed study test adds
   *  one; they reduce the automated-battle interval and expire on rolling 3-day
   *  clocks (see docs/CHARACTERS_DESIGN.md §3). */
  hasteStacks: HasteStack[];
}

/** One Study-to-Haste stack: a timed interval reduction. */
export interface HasteStack {
  /** Unix ms when this stack expires (earned time + 3 days). */
  expiresAt: number;
  /** Minutes shaved off the automated-battle interval (score-scaled, ≤30). */
  minutes: number;
}

// ---------------------------------------------------------------------------
// Character stats (attributes + derived combat stats)
// ---------------------------------------------------------------------------

/** The five character attributes the player can raise with allocation points. */
export type AttributeKey =
  | 'strength'
  | 'constitution'
  | 'dexterity'
  | 'intelligence'
  | 'spirit';

export const ATTRIBUTE_KEYS: readonly AttributeKey[] = [
  'strength', 'constitution', 'dexterity', 'intelligence', 'spirit',
];

/** One attribute row in a stats push: base value + gear bonus + total. */
export interface StatRow {
  key: string;
  label: string;
  base: number;
  gear: number;
  total: number;
  /** Present + true when the value is a percentage (e.g. crit chance). */
  isPercent?: boolean;
}

/** Server → client `stats:update` payload. */
export interface StatsUpdatePayload {
  attributes: StatRow[];
  derived: StatRow[];
  unspentPoints: number;
  level: number;
}

/** Client → server `character:allocate` payload. */
export interface CharacterAllocatePayload {
  attribute: AttributeKey;
}

/** Safe subset of a player that can be broadcast to other clients. */
export interface PublicPlayer {
  id: string;
  username: string;
  level: number;
  hp: number;
  maxHp: number;
  zone: string;
  position: PlayerPosition;
}

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

export type Subject = 'math' | 'science' | 'history' | 'language';
export type Difficulty = 'easy' | 'medium' | 'hard';

/** Full question record — stored server-side only. */
export interface Question {
  id: string;
  subject: Subject;
  /** Grade 1–12 this question belongs to (matches its topic's grade). */
  grade: number;
  /** Curriculum topic id, e.g. 'math_g3_t1' — see game/data/curriculum.ts */
  topic: string;
  question: string;
  /** Exactly 4 answer choices. */
  answers: [string, string, string, string];
  /** Index 0–3 of the correct answer — NEVER sent to the client before validation. */
  correctIndex: number;
  explanation: string;
  difficulty: Difficulty;
}

/** Safe subset sent to the client when a question is presented. */
export interface ClientQuestion {
  id: string;
  subject: Subject;
  /** Grade 1–12 — safe to expose. */
  grade: number;
  /** Curriculum topic id — safe to expose (contains no answer data). */
  topic: string;
  question: string;
  answers: [string, string, string, string];
  difficulty: Difficulty;
  timeLimit: number;    // seconds the client has to answer
}

// ---------------------------------------------------------------------------
// Learning — classroom/education sessions live in LearningSessionManager,
// which defines its own LearningSession / ClientLearningQuestion types.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Game room / zone
// ---------------------------------------------------------------------------

export interface Zone {
  id: string;
  players: Set<string>; // socket IDs
}

// ---------------------------------------------------------------------------
// Socket event payloads — Client → Server
// ---------------------------------------------------------------------------

export interface PlayerJoinPayload {
  username: string;
}

export interface PlayerMovePayload {
  x: number;
  y: number;
  zone: string;
}

export interface ChatMessagePayload {
  message: string;
}

// ── Learning event payloads (Client → Server) ──────────────────────────────

export interface LearningStartPayload {
  /** Curriculum topic id (e.g. 'math_g3_t1'). Validated server-side; its grade
   *  must equal the player's current grade for that subject. */
  topicId: string;
}

export interface LearningAnswerPayload {
  sessionId: string;
  questionId: string;
  answerIndex: number;
}

export interface LearningEndPayload {
  sessionId: string;
}

// ── Crafting event payloads (Client → Server) ──────────────────────────────

/** Payload for `craft:start` — begin a Forge weapon craft. */
export interface CraftStartPayload {
  /** Recipe id (see server/game/data/recipes.ts). */
  recipeId: string;
  /** Metal tier to spend (1..7) — sets the item-level band. */
  tier: number;
  /** Catalyst material id to spend, or null for a common item. */
  catalystId: string | null;
}

/** Payload for `craft:answer` — answer the current craft-quiz question. */
export interface CraftAnswerPayload {
  sessionId: string;
  questionId: string;
  answerIndex: number;
}

// ── Shop event payloads (Client → Server) ──────────────────────────────────

/** Payload for `shop:buy_skill` — only the skill id; everything else is validated server-side. */
export interface ShopBuySkillPayload {
  skillId: string;
}

/**
 * Payload for `shop:buy_strategy` — an individual strategy id (2 Combat
 * Shards).  Preset ids are rejected: presets unlock automatically once every
 * rule in them is owned.
 */
export interface ShopBuyStrategyPayload {
  strategyId: string;
}

/**
 * Payload for `strategy:set_loadout` — the player's desired strategy order
 * (top = checked first). Validated server-side: ≤10 ids, all known, all
 * owned, no duplicates.
 */
export interface StrategySetLoadoutPayload {
  strategyIds: string[];
}

// ---------------------------------------------------------------------------
// Socket event payloads — Server → Client
// ---------------------------------------------------------------------------

export interface PlayerJoinedPayload {
  player: PublicPlayer;
  zonePlayers: PublicPlayer[];
}

export interface PlayerMovedPayload {
  playerId: string;
  x: number;
  y: number;
}

// ── Learning event payloads (Server → Client) ──────────────────────────────

/** Sent after a learning session is successfully started. */
export interface LearningSessionStartedPayload {
  sessionId: string;
  /** First question — correctIndex intentionally omitted. */
  firstQuestion: ClientQuestion;
}

/** Sent after each answer submission (mid-quiz — no reward fields). */
export interface LearningAnswerResultPayload {
  correct: boolean;
  attemptsLeft: number;
  explanation: string;
  xpEarned: number;
  sessionComplete: boolean;
  perfectScore: boolean;
  /** Next question to present — correctIndex intentionally omitted. Present unless session is complete. */
  nextQuestion?: ClientQuestion;
}

/**
 * Sent once when a quiz session completes (emitted as `learning:complete`).
 * All reward facts are computed server-side; the client only renders them.
 */
export interface LearningCompletePayload {
  topicId: string;
  /** Number correct out of the 5-question quiz. */
  score: number;
  /** True when score ≥ 4 (the pass threshold). */
  passed: boolean;
  /** This topic's pass count AFTER applying this result (0..3). */
  topicPasses: number;
  /** True when this pass completed BOTH topics of the subject's current grade. */
  gradeCompleted: boolean;
  /** The subject's grade AFTER any advancement (unchanged unless gradeCompleted). */
  newGrade: number;
  /** Skill Shards awarded by this completion (10 on grade completion, else 0). */
  skillShardsAwarded: number;
  /** Combat Shards awarded by this completion (5 on grade completion, else 0). */
  combatShardAwarded: number;
}

/** Sent in response to `shop:get_unlocks` and after successful purchases. */
export interface ShopUnlocksPayload {
  /** Owned skill ids (rank ≥ 1) — derived from skillRanks for older clients. */
  unlockedSkills: string[];
  /** skillId → current rank (1..MAX_SKILL_RANK). The authoritative per-character
   *  skill state (see docs/CHARACTERS_DESIGN.md §4). */
  skillRanks: Record<string, number>;
  unlockedStrategies: string[];
  skillShards: number;
  combatShards: number;
  /** Ordered strategy loadout saved at the Teacher (top = checked first). */
  strategyLoadout: string[];
  /** Current grade per subject (1..12, or 13 = mastered). */
  subjectGrades: Record<Subject, number>;
  /** topicId → pass count (0..3) so the classroom can render progress. */
  topicPasses: Record<string, number>;
}

// ---------------------------------------------------------------------------

export interface ZonePlayersPayload {
  players: PublicPlayer[];
}

export interface ChatBroadcastPayload {
  playerId: string;
  username: string;
  message: string;
}

export interface ErrorPayload {
  message: string;
}

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

import type { ItemAttribute, EquipSlot } from '../game/data/equipmentGen.js';

export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export type EquipmentSlotKey =
  | 'mainHand'
  | 'offHand'
  | 'helm'
  | 'earring'
  | 'ring1'
  | 'ring2'
  | 'belt'
  | 'shoes'
  | 'gloves'
  | 'necklace'
  | 'chest'   // body armor (generated equipment system)
  | 'legs';   // leg armor (generated equipment system)

export interface ItemStats {
  attack?: number;
  defense?: number;
  hp?: number;
  xp?: number;
}

export interface InventoryItem {
  /** UUID — assigned server-side, never guessable by the client. */
  id: string;
  /** Stable item-type identifier (e.g. "worn_sword"). */
  itemType: string;
  name: string;
  description: string;
  rarity: ItemRarity;
  stats: ItemStats;
  quantity: number;
  stackable: boolean;
  /** Client-facing icon key / emoji. */
  icon: string;
  /** Present on brewed potions (Alchemy Lab): what the potion does + how much.
   *  `restore` affects both HP and MP. Combat auto-use is wired separately. */
  potion?: { effect: 'heal' | 'mana' | 'restore'; power: number };
  /** Present on crafted/equippable gear (rolled at craft time, server-side):
   *  where it equips, its rolled attributes, and the XP needed to equip it.
   *  These are the authoritative source for stats — the client never sets them. */
  equipSlot?: EquipSlot;
  attributes?: ItemAttribute[];
  xpRequired?: number;
  /** Weapons: level-scaled base damage range (drives the basic attack). */
  baseDamage?: { min: number; max: number };
  /** Armor: level-scaled base defense (adds to the Defense stat). */
  baseDefense?: number;
  /** Adventure rank this gear/potion was crafted at (e.g. 'grade_4_6'). Its
   *  power scales by M(min(craftRank, currentRank)). Missing → treated as the
   *  lowest rank. See game/data/adventureRanks.ts. */
  craftRank?: string;
  /** Crafted gear: the recipe id and material tier it was forged from. Used by
   *  the rank-upgrade flow to price the upgrade (recipe base cost × rank delta,
   *  spent in the item's material tier). Absent on starter/legacy gear. */
  recipeId?: string;
  craftTier?: number;
  /** Absolute position (0-based) when stored in a chest, so the chest can hold
   *  items at specific tab/slot positions rather than packed from the start.
   *  Unset for bag items. */
  chestSlot?: number;
}

export interface EquipmentSlots {
  mainHand?: InventoryItem;
  offHand?: InventoryItem;
  helm?: InventoryItem;
  earring?: InventoryItem;
  ring1?: InventoryItem;
  ring2?: InventoryItem;
  belt?: InventoryItem;
  shoes?: InventoryItem;
  gloves?: InventoryItem;
  necklace?: InventoryItem;
  chest?: InventoryItem;
  legs?: InventoryItem;
}

export interface PlayerInventory {
  playerId: string;
  /** The shared, ACCOUNT-wide item bag. */
  items: InventoryItem[];
  /** Equipment per character (characterId → equipped slots). The bag is shared
   *  across the roster; equipment is per-character (see docs/CHARACTERS_DESIGN.md §1). */
  equipmentByCharacter: Record<string, EquipmentSlots>;
  /** Flat equipment loaded from a pre-roster save, migrated into the active
   *  character's slots on first access then cleared. */
  legacyEquipment?: EquipmentSlots;
  gold: number;
}

/** The client-facing inventory projection (a single character's equipment plus
 *  the shared bag) — what `inventory:data` / `inventory:updated` carry. */
export interface InventorySnapshot {
  playerId: string;
  items: InventoryItem[];
  equipment: EquipmentSlots;
  gold: number;
}

// ---------------------------------------------------------------------------
// Socket event payloads — Inventory (Client → Server)
// ---------------------------------------------------------------------------

/**
 * Payload for `equipment:equip` — equips a generated equipment item
 * (see server/game/data/equipmentGen.ts).  Only the bag-item instance id is
 * accepted; the slot, stats and XP requirement are looked up server-side.
 */
export interface EquipmentEquipPayload {
  itemId: string;
}

/**
 * Payload for `equipment:unequip` — moves the item in the named slot back to
 * the player's bag.  The slot name is validated server-side against the known
 * EquipmentSlotKey set; the item itself never comes from the client.
 */
export interface EquipmentUnequipPayload {
  slot: EquipmentSlotKey;
}

// ---------------------------------------------------------------------------
// Chest Storage
// ---------------------------------------------------------------------------

export interface ChestStorage {
  chestId: string;        // e.g. 'chest_world_001'
  ownerId: string;        // socketId of player who owns this chest
  items: InventoryItem[]; // items stored inside
  maxSlots: number;       // default 120 = 4 tabs × 30 slots
}

export interface ChestTransferPayload {
  chestId: string;
  itemId: string;
  direction: 'to_chest' | 'from_chest';
  /** For 'to_chest': the absolute chest slot (0-based) to place the item in. */
  toSlot?: number;
}
