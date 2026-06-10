/**
 * Shared helper for the per-subject question banks.
 *
 * Questions are authored in a compact tuple style via `makeQ(subject)` so the
 * bank files stay readable.  The returned objects are full server-side
 * questions minus the runtime id (assigned by QuestionEngine at startup).
 *
 * Each question is tagged with a curriculum TOPIC id (see data/curriculum.ts),
 * e.g. 'math_g3_t1'.  The grade is passed explicitly and should match the
 * grade embedded in the topic id.
 *
 * SECURITY: these files contain `correctIndex` and must NEVER be imported by
 * client code.  The client only ever receives `ClientQuestion` payloads.
 */

import type { Question, Subject, Difficulty } from '../../../types/index.js';

export type RawQuestion = Omit<Question, 'id'>;

type FourAnswers = [string, string, string, string];

export const makeQ =
  (subject: Subject) =>
  (
    topic: string,
    grade: number,
    difficulty: Difficulty,
    question: string,
    answers: FourAnswers,
    correctIndex: number,
    explanation: string,
  ): RawQuestion => ({
    subject,
    topic,
    grade,
    difficulty,
    question,
    answers,
    correctIndex,
    explanation,
  });
