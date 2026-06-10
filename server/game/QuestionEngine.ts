// Shared question bank used by both LearningSessionManager and CombatManager (for combat questions).

/**
 * QuestionEngine — manages the question bank and answer validation.
 *
 * Security notes:
 *  - The correct answer index is NEVER included in the `ClientQuestion` payload
 *    returned by `getClientQuestion()`.  Validation is always server-side via
 *    `validateAnswer()`.
 *  - Questions are keyed by UUID so clients cannot predict or enumerate answers
 *    by position.
 */

import { randomUUID } from 'crypto';
import type { Question, Subject, Difficulty, ClientQuestion } from '../types/index.js';
import { MATH_QUESTIONS } from './data/questions/math.js';
import { SCIENCE_QUESTIONS } from './data/questions/science.js';
import { HISTORY_QUESTIONS } from './data/questions/history.js';
import { LANGUAGE_QUESTIONS } from './data/questions/language.js';

/** Seconds a player has to submit an answer (enforced server-side too). */
export const ANSWER_TIME_LIMIT_SECONDS = 30;

// ---------------------------------------------------------------------------
// Question bank — split into per-subject files under data/questions/.
// Every question is tagged with a curriculum subcategory (see data/curriculum.ts).
// ---------------------------------------------------------------------------

const RAW_QUESTIONS: Omit<Question, 'id'>[] = [
  ...MATH_QUESTIONS,
  ...SCIENCE_QUESTIONS,
  ...HISTORY_QUESTIONS,
  ...LANGUAGE_QUESTIONS,
];

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export class QuestionEngine {
  /** All questions keyed by their assigned UUID. */
  private questions: Map<string, Question> = new Map();

  constructor() {
    // Assign stable UUIDs to every question at startup
    for (const raw of RAW_QUESTIONS) {
      const id = randomUUID();
      this.questions.set(id, { ...raw, id } as Question);
    }
  }

  // -------------------------------------------------------------------------
  // Retrieval
  // -------------------------------------------------------------------------

  /**
   * Return a random question matching the given subject, difficulty, and
   * (optionally) curriculum subcategory.
   *
   * Fallback chain (so a session never silently fails):
   *  1. subject + subcategory + difficulty
   *  2. subject + subcategory (any difficulty)
   *  3. subject + difficulty
   *  4. subject (any)
   */
  getQuestion(subject: Subject, difficulty: Difficulty, subcategory?: string): Question | null {
    const all = Array.from(this.questions.values());
    const bySubject = all.filter((q) => q.subject === subject);

    const pools: Question[][] = [];
    if (subcategory) {
      const bySubcat = bySubject.filter((q) => q.subcategory === subcategory);
      pools.push(bySubcat.filter((q) => q.difficulty === difficulty));
      pools.push(bySubcat);
    }
    pools.push(bySubject.filter((q) => q.difficulty === difficulty));
    pools.push(bySubject);

    for (const pool of pools) {
      if (pool.length > 0) return pool[Math.floor(Math.random() * pool.length)];
    }
    return null;
  }

  /**
   * Return the safe client-facing version of a question (no correct answer).
   */
  getClientQuestion(question: Question): ClientQuestion {
    return {
      id: question.id,
      subject: question.subject,
      subcategory: question.subcategory,
      question: question.question,
      answers: question.answers,
      difficulty: question.difficulty,
      timeLimit: ANSWER_TIME_LIMIT_SECONDS,
    };
  }

  /**
   * Look up a question by ID (used during answer validation).
   */
  getQuestionById(id: string): Question | undefined {
    return this.questions.get(id);
  }

  // -------------------------------------------------------------------------
  // Server-side validation
  // -------------------------------------------------------------------------

  /**
   * Validate a player's answer.  Returns whether they were correct along with
   * the explanation text.  The correct index is never sent to the client
   * through this path — only the boolean result and explanation.
   */
  validateAnswer(
    questionId: string,
    answerIndex: number,
  ): { correct: boolean; explanation: string } | null {
    const question = this.questions.get(questionId);
    if (!question) return null;

    const correct = answerIndex === question.correctIndex;
    return { correct, explanation: question.explanation };
  }
}
