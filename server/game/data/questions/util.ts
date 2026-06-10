/**
 * Shared helper for the per-subject question banks.
 *
 * Questions are authored in a compact tuple style via `makeQ(subject)` so the
 * bank files stay readable.  The returned objects are full server-side
 * questions minus the runtime UUID (assigned by QuestionEngine at startup).
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
    subcategory: string,
    gradeLevel: number,
    difficulty: Difficulty,
    question: string,
    answers: FourAnswers,
    correctIndex: number,
    explanation: string,
  ): RawQuestion => ({
    subject,
    subcategory,
    gradeLevel,
    difficulty,
    question,
    answers,
    correctIndex,
    explanation,
  });
