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
  EquipmentEquipPayload,
  EquipmentSlotKey,
  ChestTransferPayload,
  LearningStartPayload,
  LearningAnswerPayload,
  LearningEndPayload,
  ShopBuySkillPayload,
  ShopBuyStrategyPayload,
  ShopUnlocksPayload,
  Player,
  Subject,
  Difficulty,
} from '../types/index.js';
import { EQUIPMENT_MAP, type EquipSlot } from '../game/data/equipmentGen.js';
import { CURRICULUM, SUBCATEGORY_MAP } from '../game/data/curriculum.js';
import { SKILL_TREES, type CombatSkill } from '../game/data/skillTrees.js';
import { STRATEGIES, STRATEGY_PRESETS, type CombatStrategy, type StrategyPreset } from '../game/data/combatStrategies.js';

// ---------------------------------------------------------------------------
// Shop catalogs (server-authoritative — clients never supply prices or ids)
// ---------------------------------------------------------------------------

/** skillId → skill, across all 13 class trees. */
const SKILL_MAP: ReadonlyMap<string, CombatSkill> = new Map(
  SKILL_TREES.flatMap((tree) => tree.skills.map((s) => [s.id, s] as const)),
);

/** Skill price in Skill Shards, by tier. */
const SKILL_PRICE_BY_TIER: Record<1 | 2 | 3 | 4 | 5, number> = {
  1: 1, 2: 2, 3: 3, 4: 5, 5: 8,
};

/** strategyId → strategy. */
const STRATEGY_MAP: ReadonlyMap<string, CombatStrategy> = new Map(
  STRATEGIES.map((s) => [s.id, s] as const),
);

/** presetId → preset. */
const PRESET_MAP: ReadonlyMap<string, StrategyPreset> = new Map(
  STRATEGY_PRESETS.map((p) => [p.id, p] as const),
);

/** Combat Shard prices: individual strategy = 2, preset bundle = 8. */
const STRATEGY_PRICE = 2;
const PRESET_PRICE = 8;

/** All valid equipment slot names — used to reject unknown slot strings from clients. */
const VALID_SLOTS: ReadonlySet<EquipmentSlotKey> = new Set([
  'mainHand', 'offHand', 'helm', 'earring',
  'ring1', 'ring2', 'belt', 'shoes', 'gloves', 'necklace',
  'chest', 'legs',
]);

/**
 * Maps a generated-equipment slot (equipmentGen.ts) onto the player's
 * equipment record keys.  Rings always go to ring1 in this minimal flow.
 */
const EQUIP_SLOT_TO_KEY: Record<EquipSlot, EquipmentSlotKey> = {
  weapon: 'mainHand',
  helmet: 'helm',
  chest: 'chest',
  legs: 'legs',
  boots: 'shoes',
  gloves: 'gloves',
  ring: 'ring1',
  amulet: 'necklace',
};

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
    // Pass socket.id so the in-memory record is keyed by socket ID — all
    // subsequent handler calls use socket.id for lookups and addShard() will
    // find the correct inventory.  The userId→socketId mapping is recorded
    // inside loadInventory so persistInventory() still writes to the correct
    // MongoDB document (keyed by username).
    await inventoryManager.loadInventory(userId, socket.id);
    await chestManager.loadChest(userId);
    const savedProgress = await playerManager.loadProgress(userId);

    const result = game.playerJoin(socket.id, payload.username);

    if ('error' in result) {
      socket.emit('error', { message: result.error });
      return;
    }

    const { player, zonePlayers } = result;

    // Restore persisted XP / level / shard-progress / shop unlocks
    playerManager.applyProgress(socket.id, savedProgress);

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
  // Emitted by BattleScene / BiomeScene after exploration combat.
  // The XP amount is capped server-side to limit inflated payloads.
  //
  // NOTE: shard awarding was REMOVED from this client-reported path.  All
  // shard currency (skill_shard / combat_shard) is now awarded exclusively
  // by the server-validated learning session flow (see learning:answer).
  // Learning XP also no longer flows through here — ClassroomScene uses
  // server learning sessions, which award XP via LearningSessionManager.
  socket.on('player:award_xp', async (payload: { xp: unknown }) => {
    if (!isSafeNumber(payload?.xp, 0, 500)) {
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

    // Optional subcategory — must be a known curriculum id belonging to the
    // requested subject.  Unknown ids are rejected (never trusted blindly).
    let subcategory: string | undefined;
    if (payload.subcategory !== undefined) {
      if (typeof payload.subcategory !== 'string') {
        socket.emit('error', { message: 'Invalid subcategory.' });
        return;
      }
      const subcat = SUBCATEGORY_MAP[payload.subcategory];
      if (!subcat || subcat.subject !== payload.subject) {
        socket.emit('error', { message: 'Unknown subcategory for that subject.' });
        return;
      }
      subcategory = subcat.id;
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
      subcategory,
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
      `[learning] ${socket.id} started session ${session.sessionId} ` +
      `(${payload.subject}/${subcategory ?? 'any'}/${payload.difficulty})`,
    );
  });

  // ── curriculum:get ───────────────────────────────────────────────────────
  //
  // Returns the K-12 subject → subcategory taxonomy so clients can render the
  // subcategory picker.  Safe to send: contains no questions or answers.
  socket.on('curriculum:get', () => {
    socket.emit('curriculum:data', { curriculum: CURRICULUM });
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

    // Capture the session BEFORE submitting — we need its subcategory for
    // the Combat Shard award after completion.
    const session = learningSessionManager.getSession(payload.sessionId);

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

    // ── Server-authoritative shard awards ────────────────────────────────────
    // 🔷 Skill Shard: 1 per 5 cumulative correct answers (persisted per user).
    // 🔶 Combat Shard: completing a subcategory session with a perfect score.
    let skillShardsAwarded = 0;
    let combatShardAwarded = false;

    if (correct) {
      skillShardsAwarded = playerManager.recordCorrectAnswer(socket.id);
      if (skillShardsAwarded > 0) {
        inventoryManager.addCurrency(socket.id, 'skill_shard', skillShardsAwarded);
        console.log(`[learning] ${socket.id} reached a 5-correct milestone — skill shard awarded`);
      }
    }

    if (sessionComplete && perfectScore && session?.subcategory) {
      combatShardAwarded = true;
      inventoryManager.addCurrency(socket.id, 'combat_shard', 1);
      console.log(`[learning] ${socket.id} completed subcategory "${session.subcategory}" — combat shard awarded`);
    }

    // Persist XP / level / cumulative-correct progress on every correct
    // answer and at session end (XP is added inside LearningSessionManager).
    if (correct || sessionComplete) {
      playerManager.persistProgress(socket.id);
    }

    socket.emit('learning:answer_result', {
      correct,
      attemptsLeft,
      explanation,
      xpEarned,
      sessionComplete,
      perfectScore,
      nextQuestion,
      skillShardsAwarded,
      combatShardAwarded,
    });

    // Push the updated inventory whenever shard currency changed
    if (skillShardsAwarded > 0 || combatShardAwarded) {
      const inventory = inventoryManager.getInventory(socket.id);
      if (inventory) socket.emit('inventory:updated', inventory);
    }

    // Let the HUD refresh XP / level after the session wraps up
    if (sessionComplete) {
      const player = playerManager.getPlayer(socket.id);
      if (player) {
        socket.emit('player:xp_updated', {
          newXp: player.xp,
          newLevel: player.level,
          leveledUp: false,
          xpAwarded: 0,
        });
      }
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

  // ── equipment:equip ──────────────────────────────────────────────────────
  //
  // Equips a *generated* equipment item (catalogued in
  // server/game/data/equipmentGen.ts).  Server-authoritative validation —
  // the client sends only the bag-item instance id:
  //  1. The player must exist and own the item (it must be in their bag).
  //  2. The item's itemType must be a known generated-equipment id (eq_NNNN).
  //  3. XP GATE: the player's server-tracked XP must be >= the item's
  //     xpRequired.  Clients cannot bypass this — XP lives in PlayerManager /
  //     PlayerProgress (MongoDB) and is never accepted from the client.
  //  4. The destination slot is derived server-side from the catalog, never
  //     taken from the payload.
  socket.on('equipment:equip', (payload: EquipmentEquipPayload) => {
    if (typeof payload?.itemId !== 'string') {
      socket.emit('error', { message: 'Invalid equipment payload.' });
      return;
    }

    const player = playerManager.getPlayer(socket.id);
    if (!player) {
      socket.emit('error', { message: 'You must join before equipping items.' });
      return;
    }

    const inv = inventoryManager.getInventory(socket.id);
    if (!inv) {
      socket.emit('error', { message: 'Inventory not found.' });
      return;
    }

    // Ownership: the instance must be in the player's bag
    const bagItem = inv.items.find((i) => i.id === payload.itemId);
    if (!bagItem) {
      socket.emit('error', { message: 'You do not own that item.' });
      return;
    }

    // Catalog lookup: itemType is the stable generated-equipment id
    const catalogItem = EQUIPMENT_MAP[bagItem.itemType];
    if (!catalogItem) {
      socket.emit('error', { message: 'That item is not equippable gear.' });
      return;
    }

    // XP gate — enforced server-side; player.xp is server-authoritative
    if (player.xp < catalogItem.xpRequired) {
      socket.emit('error', {
        message: `You need ${catalogItem.xpRequired} XP to equip ${catalogItem.name} (you have ${player.xp}). Keep learning!`,
      });
      return;
    }

    const slotKey = EQUIP_SLOT_TO_KEY[catalogItem.slot];
    const success = inventoryManager.equipGeneratedItem(socket.id, payload.itemId, slotKey);
    if (!success) {
      socket.emit('error', { message: 'Could not equip that item.' });
      return;
    }

    const inventory = inventoryManager.getInventory(socket.id)!;
    socket.emit('inventory:updated', inventory);
    console.log(
      `[equip] ${player.username} equipped ${catalogItem.name} (${catalogItem.id}) in ${slotKey}`,
    );
  });

  // NOTE: the old `inventory:add_shard` handler was removed.  Shards are now
  // spendable currency, so a client-triggered "give me a shard" event would be
  // a direct economy exploit.  All shard awards happen in learning:answer.

  // ── Shop helpers ─────────────────────────────────────────────────────────

  /** Build the unlock/balance snapshot sent to shop UIs. */
  const buildUnlocksPayload = (player: Player): ShopUnlocksPayload => ({
    unlockedSkills: [...player.unlockedSkills],
    unlockedStrategies: [...player.unlockedStrategies],
    skillShards: inventoryManager.getCurrencyCount(socket.id, 'skill_shard'),
    combatShards: inventoryManager.getCurrencyCount(socket.id, 'combat_shard'),
  });

  // ── shop:get_unlocks ─────────────────────────────────────────────────────
  //
  // Returns the player's purchased skills/strategies and shard balances so
  // the shop scenes can render owned / affordable states.  Read-only.
  socket.on('shop:get_unlocks', () => {
    const player = playerManager.getPlayer(socket.id);
    if (!player) {
      socket.emit('error', { message: 'You must join before visiting shops.' });
      return;
    }
    socket.emit('shop:unlocks', buildUnlocksPayload(player));
  });

  // ── shop:buy_skill ───────────────────────────────────────────────────────
  //
  // Buys a combat skill with Skill Shards.  Server-authoritative validation:
  //  1. The player must exist (joined).
  //  2. skillId must exist in the server-side skill catalog (skillTrees.ts).
  //  3. The skill must not already be owned.
  //  4. ALL prerequisite skills (requires[]) must already be unlocked.
  //  5. The player must afford the tier price (T1=1, T2=2, T3=3, T4=5, T5=8);
  //     the balance lives in the server inventory and is deducted here.
  socket.on('shop:buy_skill', (payload: ShopBuySkillPayload) => {
    if (typeof payload?.skillId !== 'string') {
      socket.emit('error', { message: 'Invalid skill purchase payload.' });
      return;
    }

    const player = playerManager.getPlayer(socket.id);
    if (!player) {
      socket.emit('error', { message: 'You must join before buying skills.' });
      return;
    }

    const skill = SKILL_MAP.get(payload.skillId);
    if (!skill) {
      socket.emit('error', { message: 'Unknown skill.' });
      return;
    }

    if (player.unlockedSkills.includes(skill.id)) {
      socket.emit('error', { message: 'You already know that skill.' });
      return;
    }

    const missingPrereq = skill.requires.find((req) => !player.unlockedSkills.includes(req));
    if (missingPrereq) {
      const prereq = SKILL_MAP.get(missingPrereq);
      socket.emit('error', {
        message: `You must learn ${prereq?.name ?? missingPrereq} first.`,
      });
      return;
    }

    const price = SKILL_PRICE_BY_TIER[skill.tier];
    if (!inventoryManager.spendCurrency(socket.id, 'skill_shard', price)) {
      socket.emit('error', {
        message: `Not enough Skill Shards — ${skill.name} costs ${price} 🔷. Answer more questions to earn shards!`,
      });
      return;
    }

    playerManager.unlockSkill(socket.id, skill.id);
    playerManager.persistProgress(socket.id);

    socket.emit('shop:skill_purchased', {
      skillId: skill.id,
      ...buildUnlocksPayload(player),
    });
    const inventory = inventoryManager.getInventory(socket.id);
    if (inventory) socket.emit('inventory:updated', inventory);

    console.log(`[shop] ${player.username} bought skill ${skill.id} for ${price} skill shard(s)`);
  });

  // ── shop:buy_strategy ────────────────────────────────────────────────────
  //
  // Buys a combat strategy (2 🔶) or a whole preset bundle (8 🔶) with Combat
  // Shards.  Server-authoritative validation:
  //  1. The player must exist (joined).
  //  2. strategyId must be a known strategy OR preset id (combatStrategies.ts).
  //  3. It must not already be fully owned.
  //  4. The player must afford the price; the balance is deducted here.
  socket.on('shop:buy_strategy', (payload: ShopBuyStrategyPayload) => {
    if (typeof payload?.strategyId !== 'string') {
      socket.emit('error', { message: 'Invalid strategy purchase payload.' });
      return;
    }

    const player = playerManager.getPlayer(socket.id);
    if (!player) {
      socket.emit('error', { message: 'You must join before buying strategies.' });
      return;
    }

    // Resolve to the list of strategy ids this purchase unlocks + its price
    let toUnlock: string[];
    let price: number;
    let label: string;

    const preset = PRESET_MAP.get(payload.strategyId);
    const strategy = STRATEGY_MAP.get(payload.strategyId);

    if (preset) {
      toUnlock = preset.strategies.filter((id) => !player.unlockedStrategies.includes(id));
      price = PRESET_PRICE;
      label = `${preset.name} preset`;
      if (toUnlock.length === 0) {
        socket.emit('error', { message: 'You already own every strategy in that preset.' });
        return;
      }
    } else if (strategy) {
      if (player.unlockedStrategies.includes(strategy.id)) {
        socket.emit('error', { message: 'You already know that strategy.' });
        return;
      }
      toUnlock = [strategy.id];
      price = STRATEGY_PRICE;
      label = strategy.name;
    } else {
      socket.emit('error', { message: 'Unknown strategy.' });
      return;
    }

    if (!inventoryManager.spendCurrency(socket.id, 'combat_shard', price)) {
      socket.emit('error', {
        message: `Not enough Combat Shards — ${label} costs ${price} 🔶. Complete learning topics to earn shards!`,
      });
      return;
    }

    playerManager.unlockStrategies(socket.id, toUnlock);
    playerManager.persistProgress(socket.id);

    socket.emit('shop:strategy_purchased', {
      strategyId: payload.strategyId,
      ...buildUnlocksPayload(player),
    });
    const inventory = inventoryManager.getInventory(socket.id);
    if (inventory) socket.emit('inventory:updated', inventory);

    console.log(`[shop] ${player.username} bought ${label} for ${price} combat shard(s)`);
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
