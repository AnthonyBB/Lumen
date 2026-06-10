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
export interface Player {
  id: string;           // socket ID
  username: string;
  level: number;
  xp: number;
  hp: number;
  maxHp: number;
  zone: string;
  position: PlayerPosition;
  lastMessageAt: number; // unix ms — used for chat rate-limiting
  /** Cumulative correct learning answers (persisted) — every 5th awards a Skill Shard. */
  correctAnswers: number;
  /** Per-question correct-answer counts (persisted) — drives subcategory mastery. */
  questionMastery: Record<string, number>;
  /** Subcategories already mastered & rewarded with a Combat Shard (persisted). */
  masteredSubcategories: string[];
  /** Skill ids purchased with Skill Shards (persisted). */
  unlockedSkills: string[];
  /** Combat strategy ids purchased with Combat Shards (persisted). */
  unlockedStrategies: string[];
  /** Ordered strategy loadout arranged at the Teacher (persisted, max 10,
   *  owned ids only — first entry is checked first in combat). */
  strategyLoadout: string[];
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
  /** Curriculum subcategory id, e.g. 'math_fractions' — see game/data/curriculum.ts */
  subcategory: string;
  question: string;
  /** Exactly 4 answer choices. */
  answers: [string, string, string, string];
  /** Index 0–3 of the correct answer — NEVER sent to the client before validation. */
  correctIndex: number;
  explanation: string;
  gradeLevel: number;   // recommended grade (e.g. 2 = 2nd grade)
  difficulty: Difficulty;
}

/** Safe subset sent to the client when a question is presented. */
export interface ClientQuestion {
  id: string;
  subject: Subject;
  /** Curriculum subcategory id — safe to expose (contains no answer data). */
  subcategory: string;
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
  subject: Subject;
  difficulty: Difficulty;
  /** Optional curriculum subcategory id (e.g. 'math_fractions'). Validated server-side. */
  subcategory?: string;
}

export interface LearningAnswerPayload {
  sessionId: string;
  questionId: string;
  answerIndex: number;
}

export interface LearningEndPayload {
  sessionId: string;
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

/** Sent after each answer submission. */
export interface LearningAnswerResultPayload {
  correct: boolean;
  attemptsLeft: number;
  explanation: string;
  xpEarned: number;
  sessionComplete: boolean;
  perfectScore: boolean;
  /** Next question to present — correctIndex intentionally omitted. Present unless session is complete. */
  nextQuestion?: ClientQuestion;
  /** Number of Skill Shards awarded by this answer (cumulative-correct milestones of 5). */
  skillShardsAwarded: number;
  /** True when this answer completed MASTERY of a subcategory — every question
   *  in it answered correctly at least 3 times (1 Combat Shard, once per topic). */
  combatShardAwarded: boolean;
}

/** Sent in response to `shop:get_unlocks` and after successful purchases. */
export interface ShopUnlocksPayload {
  unlockedSkills: string[];
  unlockedStrategies: string[];
  skillShards: number;
  combatShards: number;
  /** Ordered strategy loadout saved at the Teacher (top = checked first). */
  strategyLoadout: string[];
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

// ---------------------------------------------------------------------------
// Chest Storage
// ---------------------------------------------------------------------------

export interface ChestStorage {
  chestId: string;        // e.g. 'chest_world_001'
  ownerId: string;        // socketId of player who owns this chest
  items: InventoryItem[]; // items stored inside
  maxSlots: number;       // default 20
}

export interface ChestTransferPayload {
  chestId: string;
  itemId: string;
  direction: 'to_chest' | 'from_chest';
}
