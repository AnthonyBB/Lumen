/**
 * PlayerProgressModel — persists a player's XP and computed level across
 * sessions.  The userId field uses the player's username, which is the
 * stable DB key used throughout this codebase (see InventoryManager).
 */

import mongoose, { Schema, Document } from 'mongoose'
import type { Subject, Character } from '../../types/index.js'

export interface IPlayerProgress extends Document {
  userId: string
  xp: number
  level: number
  /** Current grade per subject (1..12, or 13 = mastered). Subjects progress
   *  independently. Defaults to grade 1 for every subject. */
  subjectGrades: Record<Subject, number>
  /** Adventure rank id — gates the curriculum grade band served to this player.
   *  See server/game/data/adventureRanks.ts. */
  adventureRank: string
  /** topicId → number of quiz passes (0..3). Topic ids are stable
   *  (`<subject>_g<grade>_t<n>`), so counts survive restarts. */
  topicPasses: Record<string, number>
  /** Skill ids purchased at Combat Training (see game/data/skillTrees.ts). */
  unlockedSkills: string[]
  /** Strategy ids purchased at the Strategy Hall (see game/data/combatStrategies.ts). */
  unlockedStrategies: string[]
  /** Ordered strategy loadout arranged at the Teacher (max 10, owned ids only). */
  strategyLoadout: string[]
  /** Skill Shard balance — a tracked currency, NOT an inventory item. */
  skillShards: number
  /** Combat Shard balance — a tracked currency, NOT an inventory item. */
  combatShards: number
  /** Silver balance — money for buying/selling items at the Market. */
  silver: number
  /** Crafting material counts (material id → quantity). */
  materials: Record<string, number>
  /** Campaigns completed (drives the one-time first-campaign shard bonus). */
  campaignsCompleted: number
  /** Allocated points per character attribute (strength/constitution/... ).
   *  Total earned = level*3; base attribute = 5 + allocated. */
  attributePoints: Record<string, number>
  /** Multi-character roster (see docs/CHARACTERS_DESIGN.md §1). Per-character
   *  state; legacy flat fields above are kept for migration/rollback. */
  characters: Character[]
  /** Which roster character is active. */
  activeCharacterId: string
  /** Recruit Tokens — spent to recruit new characters. */
  recruitTokens: number
}

const PlayerProgressSchema = new Schema<IPlayerProgress>(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    xp: {
      type: Number,
      default: 0,
      min: 0,
    },
    level: {
      type: Number,
      default: 1,
      min: 1,
      max: 50,
    },
    subjectGrades: {
      type: Schema.Types.Mixed,
      default: () => ({ math: 1, science: 1, history: 1, language: 1 }),
    },
    adventureRank: {
      type: String,
      default: 'grade_1_3',
    },
    topicPasses: {
      type: Schema.Types.Mixed,
      default: {},
    },
    unlockedSkills: {
      type: [String],
      default: [],
    },
    unlockedStrategies: {
      type: [String],
      default: [],
    },
    strategyLoadout: {
      type: [String],
      default: [],
    },
    skillShards: {
      type: Number,
      default: 0,
      min: 0,
    },
    combatShards: {
      type: Number,
      default: 0,
      min: 0,
    },
    silver: {
      type: Number,
      default: 0,
      min: 0,
    },
    materials: {
      type: Schema.Types.Mixed,
      default: () => ({}),
    },
    campaignsCompleted: {
      type: Number,
      default: 0,
      min: 0,
    },
    attributePoints: {
      type: Schema.Types.Mixed,
      default: () => ({}),
    },
    // ── Multi-character roster (see docs/CHARACTERS_DESIGN.md §1) ──────────────
    // Per-character state lives here; legacy flat fields above are retained for
    // backward-compat / migration. Accounts saved before the roster existed are
    // migrated into a single character on load.
    characters: {
      type: Schema.Types.Mixed,
      default: () => [],
    },
    activeCharacterId: {
      type: String,
      default: '',
    },
    recruitTokens: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true },
)

export const PlayerProgress = mongoose.model<IPlayerProgress>(
  'PlayerProgress',
  PlayerProgressSchema,
)
