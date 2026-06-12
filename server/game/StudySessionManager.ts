// ============================================================
// StudySessionManager — the account-wide Study-to-Haste test.
//
// A short MULTI-SUBJECT quiz drawn from the player's adventure-rank grade band.
// Passing speeds up automated combat: the score scales a haste stack
// (docs/CHARACTERS_DESIGN.md §3). Server-authoritative — correct answers are
// kept here and never sent to the client until validation (same as crafting).
// ============================================================

import { randomUUID } from 'crypto';
import type { QuestionEngine } from './QuestionEngine.js';
import type { PlayerManager } from './PlayerManager.js';
import { HASTE_STEP_MIN } from './PlayerManager.js';
import type { Question, ClientQuestion, Subject } from '../types/index.js';

export const STUDY_QUESTION_COUNT = 6;
const SUBJECTS: Subject[] = ['math', 'science', 'history', 'language'];

interface StudySession {
  sessionId: string;
  playerId: string;
  questions: Question[];   // shuffled answers; correctIndex kept server-side
  currentIndex: number;
  correctCount: number;
  isComplete: boolean;
}

export interface StudyResult {
  score: number;
  total: number;
  /** Minutes shaved off the automated-battle interval by this test (0 = none). */
  hasteMinutes: number;
  message: string;
}

export interface StudyAnswerResult {
  correct: boolean;
  explanation: string;
  sessionComplete: boolean;
  nextQuestion?: ClientQuestion;
  result?: StudyResult;
}

/** Fisher–Yates shuffle of a question's 4 answers, remapping correctIndex. */
function shuffleAnswers(q: Question): Question {
  const order = [0, 1, 2, 3];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const answers = order.map((i) => q.answers[i]) as [string, string, string, string];
  return { ...q, answers, correctIndex: order.indexOf(q.correctIndex) };
}

export class StudySessionManager {
  private sessions = new Map<string, StudySession>();
  private byPlayer = new Map<string, string>();

  constructor(
    private readonly questionEngine: QuestionEngine,
    private readonly playerManager: PlayerManager,
  ) {}

  /** Begin a study test: STUDY_QUESTION_COUNT multi-subject questions from the
   *  player's rank band. */
  start(playerId: string): { session: StudySession; firstQuestion: ClientQuestion } | { error: string } {
    const band = this.playerManager.getRankGradeBand(playerId);

    // Pull a pool from every subject in the band, then assemble a multi-subject
    // set: round-robin across subjects so the test spans more than one subject
    // when content allows.
    const pools: Question[][] = SUBJECTS.map((s) =>
      this.questionEngine.getQuizQuestionsForBand(s, band.min, band.max, STUDY_QUESTION_COUNT));
    const picked: Question[] = [];
    let added = true;
    while (picked.length < STUDY_QUESTION_COUNT && added) {
      added = false;
      for (const pool of pools) {
        const q = pool.shift();
        if (q) { picked.push(q); added = true; }
        if (picked.length >= STUDY_QUESTION_COUNT) break;
      }
    }
    if (picked.length === 0) {
      return { error: 'No study questions are available right now. Try again later.' };
    }

    this.end(playerId); // one test at a time
    const session: StudySession = {
      sessionId: randomUUID(),
      playerId,
      questions: picked.map(shuffleAnswers),
      currentIndex: 0,
      correctCount: 0,
      isComplete: false,
    };
    this.sessions.set(session.sessionId, session);
    this.byPlayer.set(playerId, session.sessionId);
    return { session, firstQuestion: this.questionEngine.getClientQuestion(session.questions[0]) };
  }

  /** Submit an answer; on the final question, score the test and grant haste. */
  submitAnswer(sessionId: string, playerId: string, questionId: string, answerIndex: number):
    StudyAnswerResult | { error: string } {
    const session = this.sessions.get(sessionId);
    if (!session || session.playerId !== playerId) return { error: 'No active study test.' };
    if (session.isComplete) return { error: 'This test is already finished.' };

    const question = session.questions[session.currentIndex];
    if (!question || question.id !== questionId) return { error: 'That question is not the current one.' };

    const correct = answerIndex === question.correctIndex;
    if (correct) session.correctCount++;
    session.currentIndex++;

    if (session.currentIndex < session.questions.length) {
      return {
        correct,
        explanation: question.explanation,
        sessionComplete: false,
        nextQuestion: this.questionEngine.getClientQuestion(session.questions[session.currentIndex]),
      };
    }

    session.isComplete = true;
    this.sessions.delete(sessionId);
    this.byPlayer.delete(playerId);

    const total = session.questions.length;
    const score = session.correctCount;
    // Score-scaled haste: a clean test grants the full step, a weak pass less.
    const hasteMinutes = score > 0 ? Math.max(1, Math.round(HASTE_STEP_MIN * (score / total))) : 0;
    if (hasteMinutes > 0) this.playerManager.addHasteStack(playerId, hasteMinutes);

    const message = hasteMinutes > 0
      ? `You scored ${score}/${total} — your teams fight ${hasteMinutes} min faster for the next 3 days!`
      : `You scored ${score}/${total}. Keep studying to speed up your teams!`;

    return {
      correct,
      explanation: question.explanation,
      sessionComplete: true,
      result: { score, total, hasteMinutes, message },
    };
  }

  /** Drop a player's active test (e.g. on disconnect). */
  end(playerId: string): void {
    const id = this.byPlayer.get(playerId);
    if (id) this.sessions.delete(id);
    this.byPlayer.delete(playerId);
  }
}
