import type { Question, Subject, Difficulty, QuestionSession } from './types'
import { QUESTIONS_BY_SUBJECT, QUESTIONS_BY_DIFFICULTY, ALL_QUESTIONS } from './questions/index'
import { QUESTIONS_PER_SESSION } from './constants'

/**
 * QuestionEngine manages question retrieval and session management.
 * All question selection is performed server-side (or in the engine layer)
 * so players cannot predict upcoming questions.
 */
export class QuestionEngine {
  /**
   * Get all questions for a given subject and difficulty.
   */
  getQuestions(subject: Subject, difficulty: Difficulty): Question[] {
    return QUESTIONS_BY_SUBJECT[subject].filter((q) => q.difficulty === difficulty)
  }

  /**
   * Get a single random question for a subject/difficulty,
   * optionally excluding recently seen question IDs.
   */
  getQuestion(
    subject: Subject,
    difficulty: Difficulty,
    excludeIds: string[] = [],
  ): Question | null {
    const pool = this.getQuestions(subject, difficulty).filter(
      (q) => !excludeIds.includes(q.id),
    )
    if (pool.length === 0) return null
    return pool[Math.floor(Math.random() * pool.length)]
  }

  /**
   * Start a new session: picks QUESTIONS_PER_SESSION questions, shuffled.
   */
  startSession(subject: Subject, difficulty: Difficulty): QuestionSession {
    const all = this.getQuestions(subject, difficulty)
    const shuffled = [...all].sort(() => Math.random() - 0.5)
    const questions = shuffled.slice(0, QUESTIONS_PER_SESSION)

    return {
      sessionId: `${subject}_${difficulty}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      subject,
      difficulty,
      questions,
      currentIndex: 0,
      score: 0,
      streak: 0,
      startedAt: Date.now(),
    }
  }

  /**
   * Return the next question in the session, or null if the session is complete.
   */
  nextQuestion(session: QuestionSession): Question | null {
    if (session.currentIndex >= session.questions.length) return null
    return session.questions[session.currentIndex]
  }

  /**
   * Return all questions that include the given tag.
   */
  getByTag(tag: string): Question[] {
    return ALL_QUESTIONS.filter((q) => q.tags?.includes(tag))
  }

  /**
   * Get a random question from ANY subject at a given difficulty.
   * Useful for combat encounters. Excludes recently seen IDs.
   */
  getRandomQuestion(difficulty: Difficulty, excludeIds: string[] = []): Question {
    const pool = QUESTIONS_BY_DIFFICULTY[difficulty].filter(
      (q) => !excludeIds.includes(q.id),
    )
    // If all questions have been excluded, fall back to the full difficulty pool
    const source = pool.length > 0 ? pool : QUESTIONS_BY_DIFFICULTY[difficulty]
    return source[Math.floor(Math.random() * source.length)]
  }

  /**
   * Count the number of questions matching the optional subject/difficulty filters.
   * If neither is specified, returns the total question count.
   */
  getQuestionCount(subject?: Subject, difficulty?: Difficulty): number {
    if (subject !== undefined && difficulty !== undefined) {
      return this.getQuestions(subject, difficulty).length
    }
    if (subject !== undefined) {
      return QUESTIONS_BY_SUBJECT[subject].length
    }
    if (difficulty !== undefined) {
      return QUESTIONS_BY_DIFFICULTY[difficulty].length
    }
    return ALL_QUESTIONS.length
  }
}
