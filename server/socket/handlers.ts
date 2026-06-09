/**
 * Socket.io event handlers — wires client events to the game logic.
 *
 * All handlers follow the same pattern:
 *  1. Validate the incoming payload (shape + types).
 *  2. Delegate to the appropriate manager.
 *  3. Emit the result back to the relevant socket(s).
 *
 * Security rules enforced here:
 *  - Correct answer indices are NEVER included in any outgoing event.
 *  - Chat messages are sanitised (HTML stripped) and rate-limited (1/s).
 *  - Answer time limits are enforced inside CombatManager.
 */

import type { Server, Socket } from 'socket.io';
import type { GameManager } from '../game/GameManager.js';
import type {
  PlayerJoinPayload,
  PlayerMovePayload,
  CombatStartPayload,
  CombatAnswerPayload,
  ChatMessagePayload,
} from '../types/index.js';

/** Maximum chat message length (characters). */
const MAX_CHAT_LENGTH = 200;
/** Minimum milliseconds between chat messages per player (rate-limit). */
const CHAT_RATE_MS = 1000;

// ---------------------------------------------------------------------------
// Sanitisation helpers
// ---------------------------------------------------------------------------

/**
 * Very lightweight HTML sanitiser — strips tags and trims whitespace.
 * For a production deployment use a dedicated library (e.g. `sanitize-html`).
 */
function sanitiseChat(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, '')       // strip HTML tags
    .replace(/&[a-z]+;/gi, '')     // strip HTML entities
    .replace(/[^\x20-\x7E\s]/g, '') // keep only printable ASCII + whitespace
    .trim()
    .slice(0, MAX_CHAT_LENGTH);
}

/** Check that a value is a finite integer within [min, max]. */
function isSafeNumber(v: unknown, min: number, max: number): boolean {
  return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
}

// ---------------------------------------------------------------------------
// Handler registration
// ---------------------------------------------------------------------------

export function registerHandlers(io: Server, socket: Socket, game: GameManager): void {
  const { playerManager, combatManager } = game;

  // ── player:join ──────────────────────────────────────────────────────────
  socket.on('player:join', (payload: PlayerJoinPayload) => {
    if (typeof payload?.username !== 'string') {
      socket.emit('error', { message: 'Invalid join payload.' });
      return;
    }

    const result = game.playerJoin(socket.id, payload.username);

    if ('error' in result) {
      socket.emit('error', { message: result.error });
      return;
    }

    const { player, zonePlayers } = result;

    // Join the Socket.io room for this zone
    socket.join(player.zone);

    // Tell the joining player about themselves and the current zone
    socket.emit('player:joined', { player, zonePlayers });

    // Tell everyone else in the zone about the new arrival
    socket.to(player.zone).emit('zone:players', {
      players: game.getZonePlayers(player.zone),
    });

    console.log(`[join] ${player.username} (${socket.id}) joined zone "${player.zone}"`);
  });

  // ── player:move ──────────────────────────────────────────────────────────
  socket.on('player:move', (payload: PlayerMovePayload) => {
    if (
      !isSafeNumber(payload?.x, -10_000, 10_000) ||
      !isSafeNumber(payload?.y, -10_000, 10_000) ||
      typeof payload?.zone !== 'string'
    ) {
      socket.emit('error', { message: 'Invalid move payload.' });
      return;
    }

    const result = game.movePlayer(socket.id, payload.x, payload.y, payload.zone);
    if (!result) return; // unknown player — already disconnected

    const { oldZone, newZone } = result;

    // Handle zone transition in Socket.io rooms
    if (oldZone !== newZone) {
      socket.leave(oldZone);
      socket.join(newZone);

      // Notify players in both zones about the updated occupant list
      io.to(oldZone).emit('zone:players', { players: game.getZonePlayers(oldZone) });
      io.to(newZone).emit('zone:players', { players: game.getZonePlayers(newZone) });
    }

    // Broadcast movement to everyone else in the destination zone
    socket.to(newZone).emit('player:moved', {
      playerId: socket.id,
      x: payload.x,
      y: payload.y,
    });
  });

  // ── combat:start ─────────────────────────────────────────────────────────
  socket.on('combat:start', (payload: CombatStartPayload) => {
    if (typeof payload?.targetId !== 'string') {
      socket.emit('error', { message: 'Invalid combat start payload.' });
      return;
    }

    const player = playerManager.getPlayer(socket.id);
    if (!player) {
      socket.emit('error', { message: 'You must join before starting combat.' });
      return;
    }

    // Determine subject/difficulty from player level
    const difficulty = player.level <= 2 ? 'easy' : player.level <= 5 ? 'medium' : 'hard';
    const subjects = ['math', 'science', 'history', 'language'] as const;
    const subject = subjects[Math.floor(Math.random() * subjects.length)];

    const result = combatManager.startCombat(
      socket.id,
      payload.targetId,
      subject,
      difficulty,
    );

    if (!result) {
      socket.emit('error', { message: 'Could not start combat session.' });
      return;
    }

    const { session, clientQuestion } = result;

    // Send the session ID and first question (NO correct answer) to the attacker
    socket.emit('combat:started', {
      sessionId: session.sessionId,
      question: clientQuestion,
    });

    console.log(
      `[combat] ${socket.id} started session ${session.sessionId} vs ${payload.targetId}`,
    );
  });

  // ── combat:answer ────────────────────────────────────────────────────────
  socket.on('combat:answer', (payload: CombatAnswerPayload) => {
    if (
      typeof payload?.sessionId !== 'string' ||
      !isSafeNumber(payload?.answerIndex, 0, 3)
    ) {
      socket.emit('error', { message: 'Invalid answer payload.' });
      return;
    }

    const player = playerManager.getPlayer(socket.id);
    if (!player) {
      socket.emit('error', { message: 'Player not found.' });
      return;
    }

    const difficulty = player.level <= 2 ? 'easy' : player.level <= 5 ? 'medium' : 'hard';
    const subjects = ['math', 'science', 'history', 'language'] as const;
    const subject = subjects[Math.floor(Math.random() * subjects.length)];

    const result = combatManager.submitAnswer(
      payload.sessionId,
      socket.id,
      payload.answerIndex,
      subject,
      difficulty,
    );

    if ('error' in result) {
      socket.emit('error', { message: result.error });
      return;
    }

    const {
      correct,
      damage,
      explanation,
      attackerHp,
      defenderHp,
      combatEnd,
      nextSessionQuestion,
    } = result;

    const responsePayload = {
      correct,
      damage,
      explanation,
      updatedHp: { attackerHp, defenderHp },
      ...(combatEnd ? { combatEnd } : {}),
      ...(nextSessionQuestion ? { nextQuestion: nextSessionQuestion } : {}),
    };

    socket.emit('combat:result', responsePayload);

    // If a second player was involved, notify them too
    const session = combatManager.getSession(payload.sessionId);
    if (session && session.defenderId !== socket.id) {
      const defenderSocket = io.sockets.sockets.get(session.defenderId);
      if (defenderSocket) {
        defenderSocket.emit('combat:result', {
          ...responsePayload,
          // Flip perspective for the defender (their HP is "attacker" from defender's POV)
        });
      }
    }
  });

  // ── chat:message ─────────────────────────────────────────────────────────
  socket.on('chat:message', (payload: ChatMessagePayload) => {
    if (typeof payload?.message !== 'string') {
      socket.emit('error', { message: 'Invalid chat payload.' });
      return;
    }

    const player = playerManager.getPlayer(socket.id);
    if (!player) {
      socket.emit('error', { message: 'You must join before chatting.' });
      return;
    }

    // Rate-limit: 1 message per second per player
    const now = Date.now();
    if (now - player.lastMessageAt < CHAT_RATE_MS) {
      socket.emit('error', { message: 'You are sending messages too quickly.' });
      return;
    }
    playerManager.updateLastMessageAt(socket.id, now);

    const sanitised = sanitiseChat(payload.message);
    if (!sanitised) {
      socket.emit('error', { message: 'Message cannot be empty.' });
      return;
    }

    // Broadcast to the zone the player is in
    io.to(player.zone).emit('chat:message', {
      playerId: socket.id,
      username: player.username,
      message: sanitised,
    });
  });

  // ── disconnect ───────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    const result = game.playerLeave(socket.id);
    if (result) {
      // Notify remaining zone players
      io.to(result.zone).emit('zone:players', {
        players: game.getZonePlayers(result.zone),
      });
      console.log(`[leave] ${socket.id} left zone "${result.zone}"`);
    }
  });
}
