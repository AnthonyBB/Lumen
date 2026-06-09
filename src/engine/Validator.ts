import type { Question, QuestionResult, QuestionSession } from './types'
import {
  TIME_BONUS_THRESHOLD,
  TIME_BONUS_XP,
  STREAK_BONUS_XP,
  MAX_STREAK_BONUS,
} from './constants'

/**
 * Validator handles answer checking, XP calculation, and session summaries.
 */
export class Validator {
  /**
   * Validate a player's answer and compute XP earned including bonuses.
   *
   * @param question         The question being answered.
   * @param selectedIndex    The answer index chosen by the player (0–3).
   * @param answerTimestamp  Milliseconds elapsed since the session started.
   * @param currentStreak    The player's current correct-answer streak before this answer.
   */
  validate(
    question: Question,
    selectedIndex: number,
    answerTimestamp: number,
    currentStreak: number,
  ): QuestionResult {
    const correct = selectedIndex === question.correctIndex

    // ── XP calculation ──────────────────────────────────────────────────────
    let xpEarned = 0
    let timeBonus = 0
    let newStreak = 0

    if (correct) {
      xpEarned = question.xpReward

      // Time bonus: awarded for answering in the first 50 % of the time limit
      const timeLimitMs = question.timeLimit * 1000
      if (answerTimestamp <= timeLimitMs * TIME_BONUS_THRESHOLD) {
        timeBonus = TIME_BONUS_XP
        xpEarned += timeBonus
      }

      // Streak bonus (capped)
      newStreak = currentStreak + 1
      const streakBonus = Math.min(newStreak * STREAK_BONUS_XP, MAX_STREAK_BONUS)
      xpEarned += streakBonus
    }

    return {
      questionId: question.id,
      correct,
      selectedIndex,
      correctIndex: question.correctIndex,
      explanation: question.explanation,
      xpEarned,
      timeBonus,
      streak: newStreak,
    }
  }

  /**
   * Returns true when the session has no more questions left.
   */
  isSessionComplete(session: QuestionSession): boolean {
    return session.currentIndex >= session.questions.length
  }

  /**
   * Compute a final summary after all questions in a session have been answered.
   */
  getSessionSummary(
    session: QuestionSession,
    results: QuestionResult[],
  ): {
    totalXP: number
    accuracy: number
    averageTime: number
    bestStreak: number
    grade: 'S' | 'A' | 'B' | 'C' | 'F'
  } {
    if (results.length === 0) {
      return { totalXP: 0, accuracy: 0, averageTime: 0, bestStreak: 0, grade: 'F' }
    }

    const totalXP = results.reduce((sum, r) => sum + r.xpEarned, 0)
    const correctCount = results.filter((r) => r.correct).length
    const accuracy = correctCount / results.length

    // averageTime: derived from answerTimestamp stored in results if available.
    // Since QuestionResult does not store the timestamp, we approximate using
    // the total elapsed session time divided by the number of answers.
    const elapsedSeconds = (Date.now() - session.startedAt) / 1000
    const averageTime = elapsedSeconds / results.length

    // Best streak: walk through the results and find the longest run
    let bestStreak = 0
    let currentStreak = 0
    for (const r of results) {
      if (r.correct) {
        currentStreak++
        if (currentStreak > bestStreak) bestStreak = currentStreak
      } else {
        currentStreak = 0
      }
    }

    // Grade based on accuracy
    let grade: 'S' | 'A' | 'B' | 'C' | 'F'
    if (accuracy >= 0.95) {
      grade = 'S'
    } else if (accuracy >= 0.8) {
      grade = 'A'
    } else if (accuracy >= 0.65) {
      grade = 'B'
    } else if (accuracy >= 0.5) {
      grade = 'C'
    } else {
      grade = 'F'
    }

    return { totalXP, accuracy, averageTime, bestStreak, grade }
  }
}
