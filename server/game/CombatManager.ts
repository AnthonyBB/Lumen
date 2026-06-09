/**
 * CombatManager — handles turn-based combat sessions.
 *
 * Security / anti-cheat notes:
 *  - All damage calculations happen server-side.
 *  - Each question has a 30-second server-enforced time limit.  If the client
 *    takes longer, `submitAnswer` treats it as incorrect and applies damage.
 *  - The `CombatSession` is keyed by a random UUID unknown to the client
 *    before combat starts, preventing session forgery.
 *  - HP values are stored in the session (mirrored from PlayerManager) and
 *    updated only here.
 */

import { randomUUID } from 'crypto';
import type { CombatSession, Subject, Difficulty } from '../types/index.js';
import type { QuestionEngine } from './QuestionEngine.js';
import type { PlayerManager } from './PlayerManager.js';
import { ANSWER_TIME_LIMIT_SECONDS } from './QuestionEngine.js';

/** Base damage dealt when a player answers correctly. */
const BASE_CORRECT_DAMAGE = 25;
/** Base damage taken when a player answers incorrectly. */
const BASE_WRONG_DAMAGE = 15;
/** XP awarded to the winner of a combat. */
const COMBAT_WIN_XP = 50;

export interface CombatEndResult {
  winnerId: string;
  xpGained: number;
  attackerHp: number;
  defenderHp: number;
}

export interface AnswerResult {
  correct: boolean;
  damage: number;
  explanation: string;
  attackerHp: number;
  defenderHp: number;
  combatEnd?: CombatEndResult;
  nextSessionQuestion?: ReturnType<QuestionEngine['getClientQuestion']>;
}

export class CombatManager {
  /** sessionId → CombatSession */
  private sessions: Map<string, CombatSession> = new Map();

  constructor(
    private questionEngine: QuestionEngine,
    private playerManager: PlayerManager,
  ) {}

  // -------------------------------------------------------------------------
  // Session lifecycle
  // -------------------------------------------------------------------------

  /**
   * Start a new combat session between two participants.
   * Returns the session and the first client-safe question.
   */
  startCombat(
    attackerId: string,
    defenderId: string,
    subject: Subject = 'math',
    difficulty: Difficulty = 'easy',
  ): {
    session: CombatSession;
    clientQuestion: ReturnType<QuestionEngine['getClientQuestion']>;
  } | null {
    const attacker = this.playerManager.getPlayer(attackerId);
    if (!attacker) return null;

    // For NPC defenders we use a fixed HP pool; for player defenders we read theirs.
    const defenderPlayer = this.playerManager.getPlayer(defenderId);
    const defenderHp = defenderPlayer ? defenderPlayer.hp : 100;
    const defenderMaxHp = defenderPlayer ? defenderPlayer.maxHp : 100;

    const firstQuestion = this.questionEngine.getQuestion(subject, difficulty);
    if (!firstQuestion) return null;

    const sessionId = randomUUID();
    const session: CombatSession = {
      sessionId,
      attackerId,
      defenderId,
      currentQuestion: firstQuestion,
      questionStartedAt: Date.now(),
      turn: 'player',
      isActive: true,
      attackerHp: attacker.hp,
      defenderHp,
      attackerMaxHp: attacker.maxHp,
      defenderMaxHp,
    };

    this.sessions.set(sessionId, session);

    return {
      session,
      clientQuestion: this.questionEngine.getClientQuestion(firstQuestion),
    };
  }

  // -------------------------------------------------------------------------
  // Answer processing
  // -------------------------------------------------------------------------

  /**
   * Process a player's answer for the given session.
   *
   * Anti-cheat checks:
   *  1. Session must exist and be active.
   *  2. The submitting socket must be the attacker for this session.
   *  3. The time limit must not have expired.
   */
  submitAnswer(
    sessionId: string,
    socketId: string,
    answerIndex: number,
    subject: Subject = 'math',
    difficulty: Difficulty = 'easy',
  ): AnswerResult | { error: string } {
    const session = this.sessions.get(sessionId);
    if (!session) return { error: 'Combat session not found.' };
    if (!session.isActive) return { error: 'Combat session is already over.' };
    if (session.attackerId !== socketId) return { error: 'It is not your turn.' };
    if (!session.currentQuestion) return { error: 'No active question for this session.' };

    // ── Time-limit enforcement ────────────────────────────────────────────
    const elapsed = (Date.now() - session.questionStartedAt) / 1000;
    const timedOut = elapsed > ANSWER_TIME_LIMIT_SECONDS;

    const validationResult = timedOut
      ? { correct: false, explanation: 'Time ran out! Try to answer faster next time.' }
      : this.questionEngine.validateAnswer(session.currentQuestion.id, answerIndex);

    if (!validationResult) return { error: 'Question validation failed.' };

    const { correct, explanation } = validationResult;

    // ── Damage calculation ────────────────────────────────────────────────
    let damage = 0;
    if (correct) {
      damage = BASE_CORRECT_DAMAGE;
      session.defenderHp = Math.max(0, session.defenderHp - damage);
    } else {
      damage = BASE_WRONG_DAMAGE;
      session.attackerHp = Math.max(0, session.attackerHp - damage);
    }

    // Sync HP back to PlayerManager for persistence
    if (correct) {
      const defenderPlayer = this.playerManager.getPlayer(session.defenderId);
      if (defenderPlayer) this.playerManager.applyDamage(session.defenderId, damage);
    } else {
      this.playerManager.applyDamage(session.attackerId, damage);
    }

    // ── Check for combat end ──────────────────────────────────────────────
    if (session.defenderHp <= 0 || session.attackerHp <= 0) {
      session.isActive = false;

      const winnerId =
        session.defenderHp <= 0 ? session.attackerId : session.defenderId;

      const xpGained = winnerId === session.attackerId ? COMBAT_WIN_XP : 0;
      if (xpGained > 0) {
        this.playerManager.addXp(session.attackerId, xpGained);
      }

      return {
        correct,
        damage,
        explanation,
        attackerHp: session.attackerHp,
        defenderHp: session.defenderHp,
        combatEnd: {
          winnerId,
          xpGained,
          attackerHp: session.attackerHp,
          defenderHp: session.defenderHp,
        },
      };
    }

    // ── Prepare next question ─────────────────────────────────────────────
    const nextQuestion = this.questionEngine.getQuestion(subject, difficulty);
    if (!nextQuestion) {
      // No more questions — end combat (attacker wins by default)
      session.isActive = false;
      return {
        correct,
        damage,
        explanation,
        attackerHp: session.attackerHp,
        defenderHp: session.defenderHp,
        combatEnd: {
          winnerId: session.attackerId,
          xpGained: COMBAT_WIN_XP,
          attackerHp: session.attackerHp,
          defenderHp: session.defenderHp,
        },
      };
    }

    session.currentQuestion = nextQuestion;
    session.questionStartedAt = Date.now();

    return {
      correct,
      damage,
      explanation,
      attackerHp: session.attackerHp,
      defenderHp: session.defenderHp,
      nextSessionQuestion: this.questionEngine.getClientQuestion(nextQuestion),
    };
  }

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  /** End any active sessions for a disconnecting player. */
  endSessionsForPlayer(socketId: string): string[] {
    const ended: string[] = [];
    for (const [id, session] of this.sessions) {
      if (
        session.isActive &&
        (session.attackerId === socketId || session.defenderId === socketId)
      ) {
        session.isActive = false;
        ended.push(id);
      }
    }
    return ended;
  }

  getSession(sessionId: string): CombatSession | undefined {
    return this.sessions.get(sessionId);
  }
}
