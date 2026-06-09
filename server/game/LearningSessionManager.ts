// Manages educational question sessions in the Learning Center. No combat concepts.

import { randomUUID } from 'crypto';
import type { Question, Subject, Difficulty } from '../types/index.js';
import type { QuestionEngine } from './QuestionEngine.js';
import type { PlayerManager } from './PlayerManager.js';
import { ANSWER_TIME_LIMIT_SECONDS } from './QuestionEngine.js';

/** XP awarded per correct answer, keyed by difficulty. */
const XP_BY_DIFFICULTY: Record<Difficulty, number> = {
  easy: 10,
  medium: 20,
  hard: 35,
};

/** Number of questions presented per learning session. */
const QUESTIONS_PER_SESSION = 5;

/** Number of answer attempts allowed per question. */
const ATTEMPTS_PER_QUESTION = 3;

/** Session inactivity timeout in milliseconds (10 minutes). */
const SESSION_TIMEOUT_MS = 10 * 60 * 1000;

export interface LearningSession {
  sessionId: string;
  playerId: string;           // socket.id
  subject: Subject;
  difficulty: Difficulty;
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

/** Strip the correctIndex before sending a question to the client. */
function toClientQuestion(q: Question): ClientLearningQuestion {
  return {
    id: q.id,
    subject: q.subject,
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
   * Start a new learning session for a player.
   * Ends any pre-existing session for that player.
   * Returns the new session and the first client-safe question (no correctIndex).
   */
  startSession(
    playerId: string,
    subject: Subject,
    difficulty: Difficulty,
  ): { session: LearningSession; firstQuestion: ClientLearningQuestion } | { error: string } {
    // End any pre-existing session for this player
    this.endPlayerSession(playerId);

    const player = this.playerManager.getPlayer(playerId);
    if (!player) return { error: 'Player not found. Have you joined yet?' };

    // Gather enough unique questions for the session
    const questions: Question[] = [];
    const seen = new Set<string>();
    let attempts = 0;
    while (questions.length < QUESTIONS_PER_SESSION && attempts < 50) {
      attempts++;
      const q = this.questionEngine.getQuestion(subject, difficulty);
      if (q && !seen.has(q.id)) {
        seen.add(q.id);
        questions.push(q);
      }
    }

    if (questions.length === 0) {
      return { error: `No questions available for subject "${subject}" at difficulty "${difficulty}".` };
    }

    const sessionId = randomUUID();
    const session: LearningSession = {
      sessionId,
      playerId,
      subject,
      difficulty,
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

    const validation = this.questionEngine.validateAnswer(questionId, answerIndex);
    if (!validation) return { error: 'Answer validation failed.' };

    const { correct, explanation } = validation;
    const xpThisAnswer = correct ? XP_BY_DIFFICULTY[session.difficulty] : 0;

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
