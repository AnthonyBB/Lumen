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
 *  - Answer time limits are enforced inside the respective managers.
 *  - Combat and learning flows are completely separate: combat events go to
 *    CombatManager; learning events go to LearningSessionManager.
 */

import type { Server, Socket } from 'socket.io';
import type { GameManager } from '../game/GameManager.js';
import type {
  PlayerJoinPayload,
  PlayerMovePayload,
  CombatStartPayload,
  CombatAnswerPayload,
  ChatMessagePayload,
  InventoryEquipPayload,
  InventoryUnequipPayload,
  EquipmentSlotKey,
  ChestTransferPayload,
  LearningStartPayload,
  LearningAnswerPayload,
  LearningEndPayload,
  Subject,
  Difficulty,
} from '../types/index.js';
/** All valid equipment slot names — used to reject unknown slot strings from clients. */
const VALID_SLOTS: ReadonlySet<EquipmentSlotKey> = new Set([
  'mainHand', 'offHand', 'helm', 'earring',
  'ring1', 'ring2', 'belt', 'shoes', 'gloves', 'necklace',
]);

const VALID_SUBJECTS: ReadonlySet<Subject> = new Set(['math', 'science', 'history', 'language']);
const VALID_DIFFICULTIES: ReadonlySet<Difficulty> = new Set(['easy', 'medium', 'hard']);

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

export function registerHandlers(
  io: Server,
  socket: Socket,
  game: GameManager,
  onlinePlayers: Set<string>,
): void {
  // ── players:get_online ────────────────────────────────────────────────────
  socket.on('players:get_online', () => {
    socket.emit('players:online', onlinePlayers.size)
  })
  const {
    playerManager,
    questionEngine,
    combatManager,
    learningSessionManager,
    inventoryManager,
    chestManager,
  } = game;

  // ── player:join ──────────────────────────────────────────────────────────
  socket.on('player:join', async (payload: PlayerJoinPayload) => {
    if (typeof payload?.username !== 'string') {
      socket.emit('error', { message: 'Invalid join payload.' });
      return;
    }

    // Load persisted inventory, chest, and XP progress from MongoDB before
    // creating the in-memory player record.
    // Uses the username as the stable userId for DB lookups.
    const userId = payload.username;
    await inventoryManager.loadInventory(userId);
    await chestManager.loadChest(userId);
    const savedProgress = await playerManager.loadProgress(userId);

    const result = game.playerJoin(socket.id, payload.username);

    if ('error' in result) {
      socket.emit('error', { message: result.error });
      return;
    }

    const { player, zonePlayers } = result;

    // Restore persisted XP / level now that the player record exists
    playerManager.applyProgress(socket.id, savedProgress.xp, savedProgress.level);

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
    const difficulty: Difficulty = player.level <= 2 ? 'easy' : player.level <= 5 ? 'medium' : 'hard';
    const subjects = ['math', 'science', 'history', 'language'] as const;
    const subject: Subject = subjects[Math.floor(Math.random() * subjects.length)];

    // CombatManager creates the session; QuestionEngine fetches the first question.
    const session = combatManager.startCombat(socket.id, payload.targetId);
    if (!session) {
      socket.emit('error', { message: 'Could not start combat session.' });
      return;
    }

    const firstQuestion = questionEngine.getQuestion(subject, difficulty);
    if (!firstQuestion) {
      combatManager.endCombat(session.sessionId);
      socket.emit('error', { message: 'No questions available for this combat.' });
      return;
    }

    const clientQuestion = questionEngine.getClientQuestion(firstQuestion);

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
      typeof payload?.questionId !== 'string' ||
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

    // ── Step 1: Validate the answer via QuestionEngine (time-limit enforced here) ──
    const session = combatManager.getSession(payload.sessionId);
    if (!session) {
      socket.emit('error', { message: 'Combat session not found.' });
      return;
    }

    const validation = questionEngine.validateAnswer(payload.questionId, payload.answerIndex);
    if (!validation) {
      socket.emit('error', { message: 'Question not found or validation failed.' });
      return;
    }

    const { correct, explanation } = validation;

    // ── Step 2: Advance combat state with the validated result ──────────────
    const turnResult = combatManager.processTurn(payload.sessionId, socket.id, correct);
    if ('error' in turnResult) {
      socket.emit('error', { message: turnResult.error });
      return;
    }

    const { damage, newAttackerHp, newDefenderHp, combatOver, winner, xpGained } = turnResult;

    // ── Step 3: Fetch next question for the attacker (if combat continues) ──
    let nextClientQuestion: ReturnType<typeof questionEngine.getClientQuestion> | undefined;
    if (!combatOver) {
      const difficulty: Difficulty = player.level <= 2 ? 'easy' : player.level <= 5 ? 'medium' : 'hard';
      const subjects = ['math', 'science', 'history', 'language'] as const;
      const subject: Subject = subjects[Math.floor(Math.random() * subjects.length)];
      const nextQ = questionEngine.getQuestion(subject, difficulty);
      if (nextQ) nextClientQuestion = questionEngine.getClientQuestion(nextQ);
    }

    const responsePayload = {
      correct,
      damage,
      explanation,
      updatedHp: { attackerHp: newAttackerHp, defenderHp: newDefenderHp },
      ...(combatOver
        ? { combatEnd: { winnerId: winner!, xpGained } }
        : {}),
      ...(nextClientQuestion ? { nextQuestion: nextClientQuestion } : {}),
    };

    socket.emit('combat:result', responsePayload);

    // If a second player was involved, notify them too
    if (session.defenderId !== socket.id) {
      const defenderSocket = io.sockets.sockets.get(session.defenderId);
      if (defenderSocket) {
        defenderSocket.emit('combat:result', responsePayload);
      }
    }
  });

  // ── player:award_xp ─────────────────────────────────────────────────────
  //
  // Emitted by ClassroomScene after a learning session completes.
  // The client reports how much XP was earned and whether a perfect score
  // warrants a Shard of Knowledge.  The server caps the XP to a safe
  // maximum (5 questions × 35 XP = 175) to prevent inflated payloads.
  socket.on('player:award_xp', async (payload: { xp: unknown; awardShard: unknown }) => {
    if (!isSafeNumber(payload?.xp, 0, 175) || typeof payload?.awardShard !== 'boolean') {
      socket.emit('error', { message: 'Invalid award_xp payload.' });
      return;
    }

    const player = playerManager.getPlayer(socket.id);
    if (!player) {
      socket.emit('error', { message: 'You must join before earning XP.' });
      return;
    }

    const xpAmount = Math.floor(payload.xp as number); // ensure integer
    const { newXp, newLevel, leveledUp } = playerManager.addXp(socket.id, xpAmount);
    playerManager.persistProgress(socket.id);

    if (payload.awardShard) {
      inventoryManager.addShard(socket.id);
      const inventory = inventoryManager.getInventory(socket.id);
      if (inventory) {
        socket.emit('inventory:updated', inventory);
      }
      console.log(`[award_xp] ${player.username} awarded a Shard of Knowledge`);
    }

    socket.emit('player:xp_updated', {
      newXp,
      newLevel,
      leveledUp,
      xpAwarded: xpAmount,
    });

    console.log(
      `[award_xp] ${player.username} +${xpAmount} XP → ${newXp} XP (Lv ${newLevel})` +
      (leveledUp ? ' *** LEVEL UP ***' : ''),
    );
  });

  // ── learning:start ───────────────────────────────────────────────────────
  socket.on('learning:start', (payload: LearningStartPayload) => {
    if (
      typeof payload?.subject !== 'string' ||
      !VALID_SUBJECTS.has(payload.subject as Subject) ||
      typeof payload?.difficulty !== 'string' ||
      !VALID_DIFFICULTIES.has(payload.difficulty as Difficulty)
    ) {
      socket.emit('error', { message: 'Invalid learning start payload. Provide a valid subject and difficulty.' });
      return;
    }

    // Content-mode gating: child mode (user-chosen or defaulting from ageGroup)
    // may only access easy/medium difficulty questions.
    const contentMode = (socket.data.contentMode as string | null) ??
      ((socket.data.ageGroup as string) === 'child' ? 'child' : 'adolescent');
    if (contentMode === 'child' && payload.difficulty === 'hard') {
      socket.emit('error', { message: 'Hard difficulty requires Adolescent+ content mode.' });
      return;
    }

    const player = playerManager.getPlayer(socket.id);
    if (!player) {
      socket.emit('error', { message: 'You must join before starting a learning session.' });
      return;
    }

    const result = learningSessionManager.startSession(
      socket.id,
      payload.subject as Subject,
      payload.difficulty as Difficulty,
    );

    if ('error' in result) {
      socket.emit('error', { message: result.error });
      return;
    }

    const { session, firstQuestion } = result;

    socket.emit('learning:session_started', {
      sessionId: session.sessionId,
      firstQuestion,
    });

    console.log(
      `[learning] ${socket.id} started session ${session.sessionId} (${payload.subject}/${payload.difficulty})`,
    );
  });

  // ── learning:answer ──────────────────────────────────────────────────────
  socket.on('learning:answer', (payload: LearningAnswerPayload) => {
    if (
      typeof payload?.sessionId !== 'string' ||
      typeof payload?.questionId !== 'string' ||
      !isSafeNumber(payload?.answerIndex, 0, 3)
    ) {
      socket.emit('error', { message: 'Invalid learning answer payload.' });
      return;
    }

    const result = learningSessionManager.submitAnswer(
      payload.sessionId,
      socket.id,
      payload.questionId,
      payload.answerIndex,
    );

    if ('error' in result) {
      socket.emit('error', { message: result.error });
      return;
    }

    const { correct, attemptsLeft, explanation, xpEarned, sessionComplete, perfectScore, nextQuestion } = result;

    socket.emit('learning:answer_result', {
      correct,
      attemptsLeft,
      explanation,
      xpEarned,
      sessionComplete,
      perfectScore,
      nextQuestion,
    });

    // Award a Knowledge Shard for a perfect score
    if (perfectScore) {
      inventoryManager.addShard(socket.id);
      const inventory = inventoryManager.getInventory(socket.id);
      if (inventory) {
        socket.emit('inventory:updated', inventory);
      }
      console.log(`[learning] ${socket.id} achieved perfect score — shard awarded`);
    }
  });

  // ── learning:end ─────────────────────────────────────────────────────────
  socket.on('learning:end', (payload: LearningEndPayload) => {
    if (typeof payload?.sessionId !== 'string') {
      socket.emit('error', { message: 'Invalid learning end payload.' });
      return;
    }

    const session = learningSessionManager.getSession(payload.sessionId);
    if (!session || session.playerId !== socket.id) {
      socket.emit('error', { message: 'Learning session not found or not owned by you.' });
      return;
    }

    learningSessionManager.endSession(payload.sessionId);
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

  // ── inventory:get ────────────────────────────────────────────────────────
  socket.on('inventory:get', () => {
    const inventory = inventoryManager.getInventory(socket.id);
    if (!inventory) {
      socket.emit('error', { message: 'Inventory not found. Have you joined yet?' });
      return;
    }
    // Safe to send: stats come from the server; correctIndex is never in inventory data.
    socket.emit('inventory:data', inventory);
  });

  // ── inventory:equip ──────────────────────────────────────────────────────
  socket.on('inventory:equip', (payload: InventoryEquipPayload) => {
    if (
      typeof payload?.itemId !== 'string' ||
      typeof payload?.slot !== 'string' ||
      !VALID_SLOTS.has(payload.slot as EquipmentSlotKey)
    ) {
      socket.emit('error', { message: 'Invalid equip payload.' });
      return;
    }

    const success = inventoryManager.equipItem(socket.id, payload.itemId, payload.slot as EquipmentSlotKey);
    if (!success) {
      socket.emit('error', { message: 'Cannot equip that item in that slot.' });
      return;
    }

    const inventory = inventoryManager.getInventory(socket.id)!;
    socket.emit('inventory:updated', inventory);
  });

  // ── inventory:unequip ────────────────────────────────────────────────────
  socket.on('inventory:unequip', (payload: InventoryUnequipPayload) => {
    if (
      typeof payload?.slot !== 'string' ||
      !VALID_SLOTS.has(payload.slot as EquipmentSlotKey)
    ) {
      socket.emit('error', { message: 'Invalid unequip payload.' });
      return;
    }

    const success = inventoryManager.unequipItem(socket.id, payload.slot as EquipmentSlotKey);
    if (!success) {
      socket.emit('error', { message: 'Nothing equipped in that slot.' });
      return;
    }

    const inventory = inventoryManager.getInventory(socket.id)!;
    socket.emit('inventory:updated', inventory);
  });

  // ── inventory:add_shard ──────────────────────────────────────────────────
  socket.on('inventory:add_shard', () => {
    const player = playerManager.getPlayer(socket.id);
    if (!player) {
      socket.emit('error', { message: 'You must join before collecting shards.' });
      return;
    }

    inventoryManager.addShard(socket.id);

    const inventory = inventoryManager.getInventory(socket.id)!;
    socket.emit('inventory:updated', inventory);
  });

  // ── chest:open ───────────────────────────────────────────────────────────
  socket.on('chest:open', (payload: { chestId: string }) => {
    if (typeof payload?.chestId !== 'string') {
      socket.emit('error', { message: 'Invalid chest open payload.' });
      return;
    }

    const inventory = inventoryManager.getInventory(socket.id);
    if (!inventory) {
      socket.emit('error', { message: 'You must join before opening a chest.' });
      return;
    }

    // Each player has one personal chest — get or create it
    const chest = chestManager.getOrCreatePlayerChest(socket.id);

    socket.emit('chest:data', { chest, inventory });
  });

  // ── chest:transfer ───────────────────────────────────────────────────────
  socket.on('chest:transfer', (payload: ChestTransferPayload) => {
    if (
      typeof payload?.chestId !== 'string' ||
      typeof payload?.itemId  !== 'string' ||
      (payload?.direction !== 'to_chest' && payload?.direction !== 'from_chest')
    ) {
      socket.emit('error', { message: 'Invalid chest transfer payload.' });
      return;
    }

    const chest = chestManager.getChest(payload.chestId);
    if (!chest) {
      socket.emit('error', { message: 'Chest not found.' });
      return;
    }

    // Ownership check
    if (chest.ownerId !== socket.id) {
      socket.emit('error', { message: 'You do not own this chest.' });
      return;
    }

    let success = false;

    if (payload.direction === 'to_chest') {
      // Find the item in the player's inventory to pass the full object
      const inv = inventoryManager.getInventory(socket.id);
      if (!inv) {
        socket.emit('error', { message: 'Inventory not found.' });
        return;
      }
      const item = inv.items.find((i) => i.id === payload.itemId);
      if (!item) {
        socket.emit('error', { message: 'Item not found in your inventory.' });
        return;
      }
      success = chestManager.transferToChest(payload.chestId, socket.id, item);
    } else {
      success = chestManager.transferFromChest(payload.chestId, socket.id, payload.itemId);
    }

    if (!success) {
      socket.emit('error', { message: 'Transfer failed. Check chest capacity or item ownership.' });
      return;
    }

    const updatedInventory = inventoryManager.getInventory(socket.id)!;
    const updatedChest = chestManager.getChest(payload.chestId)!;
    socket.emit('chest:updated', { chest: updatedChest, inventory: updatedInventory });
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
