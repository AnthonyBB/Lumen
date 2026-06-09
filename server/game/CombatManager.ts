// Manages turn-based PvP/PvE combat sessions. Not used for learning/classroom content.

/**
 * CombatManager — handles turn-based combat sessions.
 *
 * Security / anti-cheat notes:
 *  - All damage calculations happen server-side.
 *  - The `CombatSession` is keyed by a random UUID unknown to the client
 *    before combat starts, preventing session forgery.
 *  - HP values are stored in the session (mirrored from PlayerManager) and
 *    updated only here.
 *  - Question delivery and answer validation are handled externally (by the
 *    socket handler and QuestionEngine).  CombatManager only consumes the
 *    validated boolean result via processTurn().
 */

import { randomUUID } from 'crypto';
import type { CombatSession } from '../types/index.js';
import type { PlayerManager } from './PlayerManager.js';

/** Base damage dealt to the defender when the attacker answers correctly. */
const BASE_CORRECT_DAMAGE = 25;
/** Base damage taken by the attacker when they answer incorrectly. */
const BASE_WRONG_DAMAGE = 15;
/** XP awarded to the winner of a combat. */
const COMBAT_WIN_XP = 50;

export interface CombatTurnResult {
  damage: number;
  newAttackerHp: number;
  newDefenderHp: number;
  combatOver: boolean;
  /** Socket ID of the winner — present only when combatOver is true. */
  winner?: string;
  xpGained: number;
}

export class CombatManager {
  /** sessionId → CombatSession */
  private sessions: Map<string, CombatSession> = new Map();

  constructor(private playerManager: PlayerManager) {}

  // -------------------------------------------------------------------------
  // Damage helpers
  // -------------------------------------------------------------------------

  /**
   * Calculate damage for this turn.
   *  - Correct answer → attacker deals damage to the defender.
   *  - Incorrect answer → attacker takes backfire damage.
   */
  calculateDamage(isCorrect: boolean): number {
    return isCorrect ? BASE_CORRECT_DAMAGE : BASE_WRONG_DAMAGE;
  }

  // -------------------------------------------------------------------------
  // Session lifecycle
  // -------------------------------------------------------------------------

  /**
   * Start a new combat session between two participants.
   * Returns the session, or null if the attacker is unknown.
   */
  startCombat(attackerId: string, defenderId: string): CombatSession | null {
    const attacker = this.playerManager.getPlayer(attackerId);
    if (!attacker) return null;

    const defenderPlayer = this.playerManager.getPlayer(defenderId);
    const defenderHp = defenderPlayer ? defenderPlayer.hp : 100;
    const defenderMaxHp = defenderPlayer ? defenderPlayer.maxHp : 100;

    const sessionId = randomUUID();
    const session: CombatSession = {
      sessionId,
      attackerId,
      defenderId,
      turn: 'player',
      isActive: true,
      attackerHp: attacker.hp,
      defenderHp,
      attackerMaxHp: attacker.maxHp,
      defenderMaxHp,
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  // -------------------------------------------------------------------------
  // Turn processing
  // -------------------------------------------------------------------------

  /**
   * Process a combat turn given a pre-validated answer result.
   *
   * The caller (socket handler) is responsible for:
   *  1. Fetching the current question via QuestionEngine.
   *  2. Validating the player's answer via QuestionEngine.validateAnswer().
   *  3. Passing the boolean result and the explanation here does NOT happen —
   *     the handler holds those; this method only receives the boolean.
   *
   * Anti-cheat checks:
   *  - Session must exist and be active.
   *  - actingPlayerId must be the registered attacker.
   */
  processTurn(
    sessionId: string,
    actingPlayerId: string,
    answerCorrect: boolean,
  ): CombatTurnResult | { error: string } {
    const session = this.sessions.get(sessionId);
    if (!session) return { error: 'Combat session not found.' };
    if (!session.isActive) return { error: 'Combat session is already over.' };
    if (session.attackerId !== actingPlayerId) return { error: 'It is not your turn.' };

    const damage = this.calculateDamage(answerCorrect);

    if (answerCorrect) {
      session.defenderHp = Math.max(0, session.defenderHp - damage);
      const defenderPlayer = this.playerManager.getPlayer(session.defenderId);
      if (defenderPlayer) this.playerManager.applyDamage(session.defenderId, damage);
    } else {
      session.attackerHp = Math.max(0, session.attackerHp - damage);
      this.playerManager.applyDamage(session.attackerId, damage);
    }

    // Check for combat end
    if (session.defenderHp <= 0 || session.attackerHp <= 0) {
      session.isActive = false;
      const winner = session.defenderHp <= 0 ? session.attackerId : session.defenderId;
      const xpGained = winner === session.attackerId ? COMBAT_WIN_XP : 0;
      if (xpGained > 0) {
        this.playerManager.addXp(session.attackerId, xpGained);
      }
      return {
        damage,
        newAttackerHp: session.attackerHp,
        newDefenderHp: session.defenderHp,
        combatOver: true,
        winner,
        xpGained,
      };
    }

    return {
      damage,
      newAttackerHp: session.attackerHp,
      newDefenderHp: session.defenderHp,
      combatOver: false,
      xpGained: 0,
    };
  }

  // -------------------------------------------------------------------------
  // Lookups
  // -------------------------------------------------------------------------

  getCombatSession(sessionId: string): CombatSession | undefined {
    return this.sessions.get(sessionId);
  }

  /** Alias kept so existing callers (handlers, GameManager) need no update. */
  getSession(sessionId: string): CombatSession | undefined {
    return this.getCombatSession(sessionId);
  }

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  endCombat(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.isActive = false;
      this.sessions.delete(sessionId);
    }
  }

  /** End any active sessions for a disconnecting player. Returns ended session IDs. */
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
}
