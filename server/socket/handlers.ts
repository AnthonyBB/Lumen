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
 */

import type { Server, Socket } from 'socket.io';
import type { GameManager } from '../game/GameManager.js';
import type {
  PlayerJoinPayload,
  PlayerMovePayload,
  ChatMessagePayload,
  EquipmentEquipPayload,
  EquipmentUnequipPayload,
  EquipmentSlotKey,
  ChestTransferPayload,
  LearningStartPayload,
  LearningAnswerPayload,
  LearningEndPayload,
  ShopBuySkillPayload,
  ShopBuyStrategyPayload,
  StrategySetLoadoutPayload,
  ShopUnlocksPayload,
  Player,
  Subject,
} from '../types/index.js';
import { EQUIPMENT_MAP, type EquipSlot } from '../game/data/equipmentGen.js';
import { GRADE_TOPICS, TOPIC_MAP } from '../game/data/curriculum.js';
import {
  QUIZ_COMPLETE_SKILL_SHARDS,
  GRADE_COMPLETE_SKILL_SHARDS,
  GRADE_COMPLETE_COMBAT_SHARDS,
} from '../game/PlayerManager.js';
import { QUIZ_PASS_THRESHOLD } from '../game/LearningSessionManager.js';
import { SKILL_TREES, type CombatSkill } from '../game/data/skillTrees.js';
import { STRATEGIES, type CombatStrategy } from '../game/data/combatStrategies.js';

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

/** Combat Shard price per individual strategy (presets are not purchasable —
 *  they unlock automatically once every rule in them is owned). */
const STRATEGY_PRICE = 2;

/** Maximum number of rules in a player's ordered strategy loadout. */
const MAX_LOADOUT_SIZE = 10;

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
  const {
    playerManager,
    learningSessionManager,
    inventoryManager,
    chestManager,
  } = game;

  // ── Shared per-socket helpers ─────────────────────────────────────────────

  /**
   * Look up the joined player for this socket.  When the player has not
   * joined yet, emits the given error message and returns null so the caller
   * can bail out.  The validation itself is unchanged — only the boilerplate
   * lives here.
   */
  const requireJoinedPlayer = (notJoinedMessage: string): Player | null => {
    const player = playerManager.getPlayer(socket.id);
    if (!player) {
      socket.emit('error', { message: notJoinedMessage });
      return null;
    }
    return player;
  };

  /** Push the player's current inventory so HUD counters refresh. */
  const pushInventoryUpdate = (): void => {
    const inventory = inventoryManager.getInventory(socket.id);
    if (inventory) socket.emit('inventory:updated', inventory);
  };

  // ── players:get_online ────────────────────────────────────────────────────
  socket.on('players:get_online', () => {
    socket.emit('players:online', onlinePlayers.size)
  })

  // ── zone:get ──────────────────────────────────────────────────────────────
  // Current zone roster on demand. WorldScene is created after the join ack
  // already fired, so it asks for the occupant list once it is ready to
  // render remote players.
  socket.on('zone:get', () => {
    const player = playerManager.getPlayer(socket.id);
    if (!player) return;
    socket.emit('zone:players', { players: game.getZonePlayers(player.zone) });
  })

  // ── player:join ──────────────────────────────────────────────────────────
  socket.on('player:join', async (_payload: PlayerJoinPayload) => {
    // SECURITY: identity comes from the verified JWT (socket.data, set by the
    // auth middleware) — NEVER from the payload. Trusting a client-supplied
    // username here would let anyone join as another player and load (and
    // spend) that player's inventory and progress.
    if (!socket.data.authenticated || typeof socket.data.username !== 'string') {
      socket.emit('error', { message: 'You must be logged in to join the game.' });
      return;
    }
    const username = socket.data.username as string;

    // Load persisted inventory, chest, and XP progress from MongoDB before
    // creating the in-memory player record.
    // Uses the username as the stable userId for DB lookups.
    const userId = username;
    // Pass socket.id so the in-memory record is keyed by socket ID — all
    // subsequent handler calls use socket.id for lookups and addShard() will
    // find the correct inventory.  The userId→socketId mapping is recorded
    // inside loadInventory so persistInventory() still writes to the correct
    // MongoDB document (keyed by username).
    await inventoryManager.loadInventory(userId, socket.id);
    await chestManager.loadChest(userId);
    const savedProgress = await playerManager.loadProgress(userId);

    const result = game.playerJoin(socket.id, username);

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

    // Push the freshly-loaded inventory so HUD counters render immediately —
    // the client's inventory:get can race ahead of this async join handler.
    const joinInventory = inventoryManager.getInventory(socket.id);
    if (joinInventory) socket.emit('inventory:data', joinInventory);

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

  // NOTE: the old `combat:start` / `combat:answer` handlers were removed.
  // BattleScene resolves exploration combat client-side and reports only the
  // XP via `player:award_xp` below; no client emits the combat events anymore.

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

    const player = requireJoinedPlayer('You must join before earning XP.');
    if (!player) return;

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
  //
  // Starts a 5-question quiz for a single curriculum topic.  Server-authoritative
  // validation:
  //  1. topicId must be a known curriculum topic (curriculum.ts catalog).
  //  2. The topic's grade MUST equal the player's CURRENT grade in that
  //     subject — players cannot skip ahead or replay completed grades.
  socket.on('learning:start', (payload: LearningStartPayload) => {
    if (typeof payload?.topicId !== 'string') {
      socket.emit('error', { message: 'Invalid learning start payload. Provide a topicId.' });
      return;
    }

    const topic = TOPIC_MAP[payload.topicId];
    if (!topic) {
      socket.emit('error', { message: 'Unknown topic.' });
      return;
    }

    const player = requireJoinedPlayer('You must join before starting a learning session.');
    if (!player) return;

    // Grade gate — the topic must be at the player's current grade for the subject.
    const currentGrade = player.subjectGrades[topic.subject];
    if (topic.grade !== currentGrade) {
      socket.emit('error', {
        message: `That topic is grade ${topic.grade}, but your current ${topic.subject} grade is ${currentGrade}.`,
      });
      return;
    }

    const result = learningSessionManager.startSession(
      socket.id,
      topic.id,
      topic.subject,
      topic.grade,
    );

    if ('error' in result) {
      socket.emit('error', { message: result.error });
      return;
    }

    const { session, firstQuestion } = result;

    socket.emit('learning:session_started', {
      sessionId: session.sessionId,
      topicId: topic.id,
      firstQuestion,
    });

    console.log(
      `[learning] ${socket.id} started quiz ${session.sessionId} (${topic.id} · grade ${topic.grade})`,
    );
  });

  // ── curriculum:get ───────────────────────────────────────────────────────
  //
  // Returns the grade-level topic catalog so clients can render the classroom.
  // Safe to send: contains no questions or answers.
  socket.on('curriculum:get', () => {
    socket.emit('curriculum:data', { topics: GRADE_TOPICS });
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

    // Capture the session BEFORE submitting — we need its topic/subject/grade
    // for the grade-progression rewards once the quiz completes.
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

    // Mid-quiz answer result (no reward fields — rewards are computed once on
    // completion and delivered via the separate `learning:complete` event).
    socket.emit('learning:answer_result', {
      correct,
      attemptsLeft,
      explanation,
      xpEarned,
      sessionComplete,
      perfectScore,
      nextQuestion,
    });

    // Persist XP / level on every correct answer (XP is added inside
    // LearningSessionManager) so progress is never lost mid-quiz.
    if (correct) {
      playerManager.persistProgress(socket.id);
    }

    if (!sessionComplete) return;

    // ── Quiz complete — server-authoritative grade-progression rewards ───────
    const completedSession = learningSessionManager.getSession(payload.sessionId) ?? session;
    const score = completedSession ? completedSession.correctCount : 0;
    const passed = score >= QUIZ_PASS_THRESHOLD;

    let topicPasses = completedSession
      ? playerManager.getTopicPasses(socket.id, completedSession.topicId)
      : 0;
    let gradeCompleted = false;
    let combatShardAwarded = 0;
    let newGrade = completedSession
      ? playerManager.getSubjectGrade(socket.id, completedSession.subject)
      : 1;

    // Every completed quiz earns 1 skill shard (effort reward), regardless of
    // pass/fail. Grade completion adds the larger bonus below.
    let skillShardsAwarded = QUIZ_COMPLETE_SKILL_SHARDS;
    inventoryManager.addCurrency(socket.id, 'skill_shard', QUIZ_COMPLETE_SKILL_SHARDS);

    if (passed && completedSession) {
      const { topicId, subject } = completedSession;
      topicPasses = playerManager.recordTopicPass(socket.id, topicId);

      // Did this pass complete BOTH topics of the subject's current grade?
      if (playerManager.isCurrentGradeComplete(socket.id, subject)) {
        gradeCompleted = true;
        skillShardsAwarded += GRADE_COMPLETE_SKILL_SHARDS;
        combatShardAwarded = GRADE_COMPLETE_COMBAT_SHARDS;
        inventoryManager.addCurrency(socket.id, 'skill_shard', GRADE_COMPLETE_SKILL_SHARDS);
        inventoryManager.addCurrency(socket.id, 'combat_shard', combatShardAwarded);
        newGrade = playerManager.advanceSubjectGrade(socket.id, subject);
        console.log(
          `[learning] ${socket.id} completed grade in ${subject} → grade ${newGrade} ` +
          `(+${GRADE_COMPLETE_SKILL_SHARDS} skill, +${combatShardAwarded} combat shards)`,
        );
      }
      playerManager.persistProgress(socket.id);
    }

    // Final XP / level persist (handles the case the last answer was wrong).
    playerManager.persistProgress(socket.id);

    socket.emit('learning:complete', {
      topicId: completedSession?.topicId ?? '',
      score,
      passed,
      topicPasses,
      gradeCompleted,
      newGrade,
      skillShardsAwarded,
      combatShardAwarded,
    });

    // Refresh inventory HUD counters when shards changed.
    if (skillShardsAwarded > 0 || combatShardAwarded > 0) {
      pushInventoryUpdate();
    }

    // Let the HUD refresh XP / level after the quiz wraps up.
    const player = playerManager.getPlayer(socket.id);
    if (player) {
      socket.emit('player:xp_updated', {
        newXp: player.xp,
        newLevel: player.level,
        leveledUp: false,
        xpAwarded: 0,
      });
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

    const player = requireJoinedPlayer('You must join before chatting.');
    if (!player) return;

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

  // NOTE: the legacy `inventory:equip` / `inventory:unequip` handlers were
  // removed.  Equipping happens via `equipment:equip` and unequipping via
  // `equipment:unequip` below; EquipmentScene renders only the server-pushed
  // inventory state.

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

    const player = requireJoinedPlayer('You must join before equipping items.');
    if (!player) return;

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

    pushInventoryUpdate();
    console.log(
      `[equip] ${player.username} equipped ${catalogItem.name} (${catalogItem.id}) in ${slotKey}`,
    );
  });

  // ── equipment:unequip ────────────────────────────────────────────────────
  //
  // Moves the item in the named slot back into the player's bag.  The client
  // sends only a slot name, which is validated against the known slot keys;
  // the item itself always comes from server state.
  socket.on('equipment:unequip', (payload: EquipmentUnequipPayload) => {
    const VALID_SLOTS: EquipmentSlotKey[] = [
      'mainHand', 'offHand', 'helm', 'earring', 'ring1', 'ring2',
      'belt', 'shoes', 'gloves', 'necklace', 'chest', 'legs',
    ];
    if (typeof payload?.slot !== 'string' || !VALID_SLOTS.includes(payload.slot)) {
      socket.emit('error', { message: 'Invalid unequip payload.' });
      return;
    }

    const player = requireJoinedPlayer('You must join before unequipping items.');
    if (!player) return;

    if (!inventoryManager.unequipItem(socket.id, payload.slot)) {
      socket.emit('error', { message: 'That slot is empty.' });
      return;
    }

    pushInventoryUpdate();
    console.log(`[equip] ${player.username} unequipped slot ${payload.slot}`);
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
    strategyLoadout: [...player.strategyLoadout],
    subjectGrades: { ...player.subjectGrades },
    topicPasses: { ...player.topicPasses },
  });

  // ── shop:get_unlocks ─────────────────────────────────────────────────────
  //
  // Returns the player's purchased skills/strategies and shard balances so
  // the shop scenes can render owned / affordable states.  Read-only.
  socket.on('shop:get_unlocks', () => {
    const player = requireJoinedPlayer('You must join before visiting shops.');
    if (!player) return;
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

    const player = requireJoinedPlayer('You must join before buying skills.');
    if (!player) return;

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
    pushInventoryUpdate();

    console.log(`[shop] ${player.username} bought skill ${skill.id} for ${price} skill shard(s)`);
  });

  // ── shop:buy_strategy ────────────────────────────────────────────────────
  //
  // Buys a single combat strategy (2 🔶) with Combat Shards. Preset bundles
  // are NOT purchasable — a preset unlocks by owning every rule in it, and
  // accepting preset ids here would let a crafted client buy 10 rules at a
  // discount the UI no longer offers.  Server-authoritative validation:
  //  1. The player must exist (joined).
  //  2. strategyId must be a known individual strategy (combatStrategies.ts).
  //  3. It must not already be owned.
  //  4. The player must afford the price; the balance is deducted here.
  socket.on('shop:buy_strategy', (payload: ShopBuyStrategyPayload) => {
    if (typeof payload?.strategyId !== 'string') {
      socket.emit('error', { message: 'Invalid strategy purchase payload.' });
      return;
    }

    const player = requireJoinedPlayer('You must join before buying strategies.');
    if (!player) return;

    const strategy = STRATEGY_MAP.get(payload.strategyId);
    if (!strategy) {
      socket.emit('error', { message: 'Unknown strategy.' });
      return;
    }
    if (player.unlockedStrategies.includes(strategy.id)) {
      socket.emit('error', { message: 'You already know that strategy.' });
      return;
    }
    const toUnlock = [strategy.id];
    const price = STRATEGY_PRICE;
    const label = strategy.name;

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
    pushInventoryUpdate();

    console.log(`[shop] ${player.username} bought ${label} for ${price} combat shard(s)`);
  });

  // ── strategy:set_loadout ─────────────────────────────────────────────────
  //
  // Saves the player's ordered strategy loadout (arranged at the Teacher).
  // Server-authoritative validation — a crafted client cannot equip
  // strategies it never bought:
  //  1. The player must exist (joined).
  //  2. strategyIds must be an array of ≤ MAX_LOADOUT_SIZE strings.
  //  3. Every id must be a known strategy (combatStrategies.ts catalog).
  //  4. Every id must already be owned (player.unlockedStrategies).
  //  5. No duplicate ids.
  socket.on('strategy:set_loadout', (payload: StrategySetLoadoutPayload) => {
    const player = requireJoinedPlayer('You must join before arranging strategies.');
    if (!player) return;

    const ids = payload?.strategyIds;
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) {
      socket.emit('error', { message: 'Invalid strategy loadout payload.' });
      return;
    }
    if (ids.length > MAX_LOADOUT_SIZE) {
      socket.emit('error', {
        message: `A strategy loadout can hold at most ${MAX_LOADOUT_SIZE} rules.`,
      });
      return;
    }
    if (new Set(ids).size !== ids.length) {
      socket.emit('error', { message: 'A strategy loadout cannot contain duplicates.' });
      return;
    }
    for (const id of ids) {
      if (!STRATEGY_MAP.has(id)) {
        socket.emit('error', { message: 'Unknown strategy in loadout.' });
        return;
      }
      if (!player.unlockedStrategies.includes(id)) {
        socket.emit('error', { message: 'You can only equip strategies you own.' });
        return;
      }
    }

    playerManager.setStrategyLoadout(socket.id, ids);
    playerManager.persistProgress(socket.id);

    socket.emit('strategy:loadout_saved', { strategyLoadout: [...ids] });
    console.log(`[strategy] ${player.username} saved loadout (${ids.length} rule(s))`);
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
