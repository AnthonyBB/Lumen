/**
 * PlayerProgressModel — persists a player's XP and computed level across
 * sessions.  The userId field uses the player's username, which is the
 * stable DB key used throughout this codebase (see InventoryManager).
 */

import mongoose, { Schema, Document } from 'mongoose'

export interface IPlayerProgress extends Document {
  userId: string
  xp: number
  level: number
  /** Cumulative correct learning answers — every 5th awards a Skill Shard. */
  correctAnswers: number
  /** Per-question correct-answer counts (questionId → count). Question ids are
   *  stable content hashes (see QuestionEngine), so counts survive restarts. */
  questionMastery: Record<string, number>
  /** Subcategories already mastered (every question correct ≥3×) and rewarded. */
  masteredSubcategories: string[]
  /** Skill ids purchased at Combat Training (see game/data/skillTrees.ts). */
  unlockedSkills: string[]
  /** Strategy ids purchased at the Strategy Hall (see game/data/combatStrategies.ts). */
  unlockedStrategies: string[]
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
    correctAnswers: {
      type: Number,
      default: 0,
      min: 0,
    },
    questionMastery: {
      type: Schema.Types.Mixed,
      default: {},
    },
    masteredSubcategories: {
      type: [String],
      default: [],
    },
    unlockedSkills: {
      type: [String],
      default: [],
    },
    unlockedStrategies: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true },
)

export const PlayerProgress = mongoose.model<IPlayerProgress>(
  'PlayerProgress',
  PlayerProgressSchema,
)
