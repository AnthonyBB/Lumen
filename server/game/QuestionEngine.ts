// Shared question bank — LearningSessionManager draws sessions from it, and
// answer validation for any flow happens here.

/**
 * QuestionEngine — manages the question bank and answer validation.
 *
 * Security notes:
 *  - The correct answer index is NEVER included in the `ClientQuestion` payload
 *    returned by `getClientQuestion()`.  Validation is always server-side via
 *    `validateAnswer()`.
 *  - Questions are keyed by a content hash so clients cannot predict or
 *    enumerate answers by position.
 */

import { createHash } from 'crypto';
import type { Question, ClientQuestion, Subject } from '../types/index.js';
import { MATH_QUESTIONS } from './data/questions/math.js';
import { SCIENCE_QUESTIONS } from './data/questions/science.js';
import { HISTORY_QUESTIONS } from './data/questions/history.js';
import { LANGUAGE_QUESTIONS } from './data/questions/language.js';

/** Seconds a player has to submit an answer (enforced server-side too). */
export const ANSWER_TIME_LIMIT_SECONDS = 30;

/** Number of questions drawn for one quiz. */
export const QUIZ_QUESTION_COUNT = 5;

// ---------------------------------------------------------------------------
// Question bank — split into per-subject files under data/questions/.
// Every question is tagged with a curriculum TOPIC id (see data/curriculum.ts).
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
  /** All questions keyed by their assigned content-hash id. */
  private questions: Map<string, Question> = new Map();

  /** topicId → question ids belonging to that topic (built once at startup). */
  private byTopic: Map<string, string[]> = new Map();

  /** `<subject>|<grade>` → question ids (built once at startup) — used for
   *  rank-band filtering, which spans grades rather than a single topic. */
  private bySubjectGrade: Map<string, string[]> = new Map();

  constructor() {
    // Assign STABLE content-derived ids so they survive server restarts. A hash
    // is non-sequential, so clients cannot enumerate the bank by position.
    for (const raw of RAW_QUESTIONS) {
      let id = 'q_' + createHash('sha1')
        .update(`${raw.subject}|${raw.topic}|${raw.question}`)
        .digest('hex')
        .slice(0, 16);
      // Collision guard (duplicate question text within a topic)
      while (this.questions.has(id)) id += 'x';
      const question = { ...raw, id } as Question;
      this.questions.set(id, question);

      const list = this.byTopic.get(question.topic);
      if (list) list.push(id);
      else this.byTopic.set(question.topic, [id]);

      const sgKey = `${question.subject}|${question.grade}`;
      const sgList = this.bySubjectGrade.get(sgKey);
      if (sgList) sgList.push(id);
      else this.bySubjectGrade.set(sgKey, [id]);
    }
  }

  /**
   * Return up to `count` UNIQUE random questions for a subject drawn from ANY
   * grade within the inclusive band [minGrade..maxGrade]. Used to serve quizzes
   * filtered by a player's Adventure Rank (the band spans several grades).
   *
   * Pooling across the whole band (rather than one topic) means a quiz varies
   * its subject matter and never returns empty just because one topic is thin.
   */
  getQuizQuestionsForBand(
    subject: Subject,
    minGrade: number,
    maxGrade: number,
    count = QUIZ_QUESTION_COUNT,
  ): Question[] {
    const ids: string[] = [];
    for (let g = minGrade; g <= maxGrade; g++) {
      const list = this.bySubjectGrade.get(`${subject}|${g}`);
      if (list) ids.push(...list);
    }
    if (ids.length === 0) return [];

    // Fisher–Yates shuffle a copy so each quiz gets a fresh selection/order.
    const shuffled = [...ids];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled
      .slice(0, Math.min(count, shuffled.length))
      .map((id) => this.questions.get(id)!)
      .filter((q): q is Question => q !== undefined);
  }

  // -------------------------------------------------------------------------
  // Retrieval
  // -------------------------------------------------------------------------

  /**
   * Return up to `count` UNIQUE random questions drawn from ONE topic.
   * If a topic holds fewer than `count` questions, every available question is
   * returned (so a quiz still works while a topic is being expanded to 20+).
   */
  getQuizQuestions(topicId: string, count = QUIZ_QUESTION_COUNT): Question[] {
    const ids = this.byTopic.get(topicId);
    if (!ids || ids.length === 0) return [];

    // Fisher–Yates shuffle a copy so each quiz gets a fresh order/selection.
    const shuffled = [...ids];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled
      .slice(0, Math.min(count, shuffled.length))
      .map((id) => this.questions.get(id)!)
      .filter((q): q is Question => q !== undefined);
  }

  /** Number of questions currently authored for a topic. */
  getTopicQuestionCount(topicId: string): number {
    return this.byTopic.get(topicId)?.length ?? 0;
  }

  /**
   * Return the safe client-facing version of a question (no correct answer).
   */
  getClientQuestion(question: Question): ClientQuestion {
    return {
      id: question.id,
      subject: question.subject,
      grade: question.grade,
      topic: question.topic,
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
