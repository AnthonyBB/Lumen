// Manages educational quiz sessions in the Learning Center. No combat concepts.
//
// A session is a 5-question quiz drawn from ONE curriculum topic. The player
// gets a few attempts per question; a question counts toward the score if
// answered correctly within its attempts. A quiz PASSES at >= 4/5 correct.
// Grade-progression rewards (shards / grade advance) are computed by the
// socket handler from the completed session — never here.

import { randomUUID } from 'crypto';
import type { Question, Subject, Difficulty } from '../types/index.js';
import type { QuestionEngine } from './QuestionEngine.js';
import type { PlayerManager } from './PlayerManager.js';
import { ANSWER_TIME_LIMIT_SECONDS, QUIZ_QUESTION_COUNT } from './QuestionEngine.js';

/** XP awarded per correct answer, keyed by difficulty. */
const XP_BY_DIFFICULTY: Record<Difficulty, number> = {
  easy: 10,
  medium: 20,
  hard: 35,
};

/** Number of answer attempts allowed per question. */
const ATTEMPTS_PER_QUESTION = 3;

/** Correct answers (out of QUIZ_QUESTION_COUNT) required to PASS a quiz. */
export const QUIZ_PASS_THRESHOLD = 4;

/** Session inactivity timeout in milliseconds (10 minutes). */
const SESSION_TIMEOUT_MS = 10 * 60 * 1000;

export interface LearningSession {
  sessionId: string;
  playerId: string;           // socket.id
  topicId: string;            // curriculum topic id (see data/curriculum.ts)
  subject: Subject;
  grade: number;
  questions: Question[];      // full server-side questions (with correctIndex)
  currentIndex: number;
  attemptsLeft: number;       // attempts remaining for current question
  correctCount: number;
  xpEarned: number;
  results: { questionId: string; correct: boolean; attempts: number }[];
  startedAt: number;
  timeoutHandle?: ReturnType<typeof setTimeout>;
  isComplete: boolean;
}

/** Client-safe question shape — correctIndex intentionally omitted. */
export interface ClientLearningQuestion {
  id: string;
  subject: Subject;
  grade: number;
  topic: string;
  question: string;
  answers: [string, string, string, string];
  difficulty: Difficulty;
  timeLimit: number;
}

export interface AnswerSubmitResult {
  correct: boolean;
  attemptsLeft: number;
  explanation: string;
  xpEarned: number;
  sessionComplete: boolean;
  perfectScore: boolean;
  nextQuestion?: ClientLearningQuestion;
}

/**
 * Return a copy of the question with its 4 answers shuffled and correctIndex
 * remapped to the new position. Authored questions cluster the correct answer
 * at a few positions (often index 1); shuffling per session makes the correct
 * position uniformly random. The shuffled correctIndex stays server-side — the
 * client still only ever receives the answer strings, never the index.
 */
function shuffleAnswers(q: Question): Question {
  const order = [0, 1, 2, 3];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const answers = order.map((i) => q.answers[i]) as [string, string, string, string];
  return { ...q, answers, correctIndex: order.indexOf(q.correctIndex) };
}

/** Strip the correctIndex before sending a question to the client. */
function toClientQuestion(q: Question): ClientLearningQuestion {
  return {
    id: q.id,
    subject: q.subject,
    grade: q.grade,
    topic: q.topic,
    question: q.question,
    answers: q.answers,
    difficulty: q.difficulty,
    timeLimit: ANSWER_TIME_LIMIT_SECONDS,
  };
}

export class LearningSessionManager {
  /** sessionId → LearningSession */
  private sessions: Map<string, LearningSession> = new Map();
  /** playerId → sessionId (one active session per player at a time) */
  private playerSessionIndex: Map<string, string> = new Map();

  constructor(
    private questionEngine: QuestionEngine,
    private playerManager: PlayerManager,
  ) {}

  // -------------------------------------------------------------------------
  // Session lifecycle
  // -------------------------------------------------------------------------

  /**
   * Start a new quiz session for a player on a single topic.
   * Ends any pre-existing session for that player.
   * Returns the new session and the first client-safe question (no correctIndex).
   *
   * Topic validity / grade-gating is enforced by the caller (socket handler).
   */
  startSession(
    playerId: string,
    topicId: string,
    subject: Subject,
    grade: number,
  ): { session: LearningSession; firstQuestion: ClientLearningQuestion } | { error: string } {
    // End any pre-existing session for this player
    this.endPlayerSession(playerId);

    const player = this.playerManager.getPlayer(playerId);
    if (!player) return { error: 'Player not found. Have you joined yet?' };

    // Shuffle each question's answers per session so the correct position is
    // random regardless of how the question was authored.
    const questions: Question[] = this.questionEngine
      .getQuizQuestions(topicId, QUIZ_QUESTION_COUNT)
      .map(shuffleAnswers);
    if (questions.length === 0) {
      return { error: `No questions available for topic "${topicId}".` };
    }

    const sessionId = randomUUID();
    const session: LearningSession = {
      sessionId,
      playerId,
      topicId,
      subject,
      grade,
      questions,
      currentIndex: 0,
      attemptsLeft: ATTEMPTS_PER_QUESTION,
      correctCount: 0,
      xpEarned: 0,
      results: [],
      startedAt: Date.now(),
      isComplete: false,
    };

    // Auto-expire idle sessions
    session.timeoutHandle = setTimeout(() => {
      this.endSession(sessionId);
    }, SESSION_TIMEOUT_MS);

    this.sessions.set(sessionId, session);
    this.playerSessionIndex.set(playerId, sessionId);

    return {
      session,
      firstQuestion: toClientQuestion(questions[0]),
    };
  }

  // -------------------------------------------------------------------------
  // Answer processing
  // -------------------------------------------------------------------------

  /**
   * Process a player's answer for the active question in a session.
   *
   * Anti-cheat checks:
   *  1. Session must exist and not be complete.
   *  2. Submitting socket must own the session.
   *  3. questionId must match the current question (prevents replay attacks).
   *  4. answerIndex must be 0–3.
   *  5. The correctIndex is never sent to the client; validation is server-side.
   */
  submitAnswer(
    sessionId: string,
    playerId: string,
    questionId: string,
    answerIndex: number,
  ): AnswerSubmitResult | { error: string } {
    const session = this.sessions.get(sessionId);
    if (!session) return { error: 'Learning session not found.' };
    if (session.isComplete) return { error: 'This learning session is already complete.' };
    if (session.playerId !== playerId) return { error: 'You do not own this session.' };
    if (answerIndex < 0 || answerIndex > 3) return { error: 'Invalid answer index.' };

    const currentQuestion = session.questions[session.currentIndex];
    if (!currentQuestion) return { error: 'No active question for this session.' };
    if (currentQuestion.id !== questionId) {
      return { error: 'Question ID mismatch. Please wait for the current question.' };
    }

    // Validate against the session's SHUFFLED correctIndex (the answers were
    // reordered per session in startSession, so the engine's original-order
    // index no longer applies).
    const correct = answerIndex === currentQuestion.correctIndex;
    const explanation = currentQuestion.explanation;
    const xpThisAnswer = correct ? XP_BY_DIFFICULTY[currentQuestion.difficulty] : 0;

    if (correct) {
      // Award XP immediately
      session.xpEarned += xpThisAnswer;
      this.playerManager.addXp(playerId, xpThisAnswer);

      // Record result and advance to next question
      session.results.push({
        questionId: currentQuestion.id,
        correct: true,
        attempts: ATTEMPTS_PER_QUESTION - session.attemptsLeft + 1,
      });
      session.correctCount++;
      session.currentIndex++;
      session.attemptsLeft = ATTEMPTS_PER_QUESTION;
    } else {
      session.attemptsLeft--;

      if (session.attemptsLeft <= 0) {
        // Out of attempts — record failure and advance
        session.results.push({
          questionId: currentQuestion.id,
          correct: false,
          attempts: ATTEMPTS_PER_QUESTION,
        });
        session.currentIndex++;
        session.attemptsLeft = ATTEMPTS_PER_QUESTION;
      }
      // Otherwise: attemptsLeft decremented — player gets another try at the same question
    }

    const sessionComplete = session.currentIndex >= session.questions.length;
    const perfectScore = sessionComplete && session.correctCount === session.questions.length;

    if (sessionComplete) {
      session.isComplete = true;
      this._clearTimeout(session);
    }

    // Determine what question the client should see next
    let nextQuestion: ClientLearningQuestion | undefined;
    if (!sessionComplete) {
      const nextQ = session.questions[session.currentIndex];
      if (nextQ) nextQuestion = toClientQuestion(nextQ);
    }

    return {
      correct,
      attemptsLeft: session.attemptsLeft,
      explanation,
      xpEarned: xpThisAnswer,
      sessionComplete,
      perfectScore,
      nextQuestion,
    };
  }

  // -------------------------------------------------------------------------
  // Lookups
  // -------------------------------------------------------------------------

  getSession(sessionId: string): LearningSession | undefined {
    return this.sessions.get(sessionId);
  }

  getPlayerSession(playerId: string): LearningSession | undefined {
    const sessionId = this.playerSessionIndex.get(playerId);
    return sessionId ? this.sessions.get(sessionId) : undefined;
  }

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  endSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    this._clearTimeout(session);
    this.playerSessionIndex.delete(session.playerId);
    this.sessions.delete(sessionId);
  }

  /** End any active learning session for a disconnecting player. */
  endPlayerSession(playerId: string): void {
    const sessionId = this.playerSessionIndex.get(playerId);
    if (sessionId) this.endSession(sessionId);
  }

  private _clearTimeout(session: LearningSession): void {
    if (session.timeoutHandle !== undefined) {
      clearTimeout(session.timeoutHandle);
      session.timeoutHandle = undefined;
    }
  }
}
