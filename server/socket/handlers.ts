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
  CraftStartPayload,
  CraftAnswerPayload,
  ShopBuySkillPayload,
  ShopBuyStrategyPayload,
  StrategySetLoadoutPayload,
  ShopUnlocksPayload,
  Player,
  Subject,
  CharacterAllocatePayload,
  AttributeKey,
  InventoryItem,
  ItemRarity,
} from '../types/index.js';
import { ATTRIBUTE_KEYS } from '../types/index.js';
import { ATTRIBUTE_TYPES, type EquipSlot } from '../game/data/equipmentGen.js';
import { rollMaterials, DIFFICULTIES, type Difficulty } from '../game/loot.js';
import { resolveBattle } from '../game/combat/resolver.js';
import { buildAllyCombatant, buildEnemyCombatant, type MobInput } from '../game/combat/adapter.js';
import { resolveIdle } from '../game/combat/idle.js';
import { MATERIALS } from '../game/data/materials.js';
import { getItemSlot, createItem } from '../game/ItemDatabase.js';
import {
  marketPrice,
  buildItemSnapshot,
  type MarketListing,
} from '../game/MarketManager.js';
import { PlayerProgress } from '../db/models/PlayerProgressModel.js';
import { User } from '../db/models/User.js';
import {
  ageFromDateOfBirth,
  defaultRankForAge,
  ADVENTURE_RANKS,
  RANK_MAP,
  rankMultiplier,
} from '../game/data/adventureRanks.js';
import { randomUUID } from 'crypto';
import { GRADE_TOPICS, TOPIC_MAP } from '../game/data/curriculum.js';
import {
  QUIZ_COMPLETE_SKILL_SHARDS,
  GRADE_COMPLETE_SKILL_SHARDS,
  GRADE_COMPLETE_COMBAT_SHARDS,
  MAX_SKILL_RANK,
  skillRankLevelGate,
  skillRankCost,
} from '../game/PlayerManager.js';
import { QUIZ_PASS_THRESHOLD } from '../game/LearningSessionManager.js';
import { SKILL_TREES, SKILL_CLASSES, type CombatSkill, type SkillClass } from '../game/data/skillTrees.js';
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

/** Free starting team size — the first team of 4 is frictionless; beyond that
 *  costs Recruit Tokens. See CHARACTERS_DESIGN.md §2. */
const FREE_ROSTER_SIZE = 4;
/** Generous hard cap on roster size (bounds abuse). */
const MAX_ROSTER = 50;
/** Recruit-Token cost of the NEXT character given the current roster size: free
 *  up to FREE_ROSTER_SIZE, then escalating 1, 2, 3, … (triangular). */
const recruitCostFor = (ownedCount: number): number =>
  ownedCount < FREE_ROSTER_SIZE ? 0 : ownedCount - FREE_ROSTER_SIZE + 1;

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
 * Very lightweight chat sanitiser — strips HTML, control characters, and
 * collapses whitespace, then trims and length-caps.
 *
 * NOTE: real profanity / moderation filtering is OUT OF SCOPE for this pass.
 * This is a kids'/educational game (see CLAUDE.md); a production deployment
 * should add a dedicated moderation pipeline (e.g. `sanitize-html` + a profanity
 * service) before exposing free-form chat broadly.
 */
function sanitiseChat(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, '')          // strip HTML tags
    .replace(/&[a-z]+;/gi, '')        // strip HTML entities
    .replace(/[\x00-\x1F\x7F]/g, ' ') // drop control chars (incl. newlines/tabs)
    .replace(/[^\x20-\x7E]/g, '')     // keep only printable ASCII
    .replace(/\s+/g, ' ')             // collapse runs of whitespace
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
    craftSessionManager,
    studySessionManager,
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

  /** The active character's id (the roster member current ops target). */
  const activeCharId = (): string => playerManager.getActiveCharacter(socket.id)?.id ?? '';

  /** The active character's inventory snapshot (shared bag + its equipment). */
  const activeSnapshot = () => inventoryManager.getSnapshot(socket.id, activeCharId());

  /** Push the player's current inventory so HUD counters refresh. */
  const pushInventoryUpdate = (): void => {
    const snapshot = activeSnapshot();
    if (snapshot) socket.emit('inventory:updated', snapshot);
  };

  /**
   * Recompute the player's derived stats from their attributes + equipped gear,
   * apply the derived Max HP to their real combat HP, and push `stats:update`.
   * Server-authoritative — the client only renders this; it never sends stats.
   */
  const pushStats = (): void => {
    const equipment = inventoryManager.equipmentFor(socket.id, activeCharId());
    const payload = playerManager.applyDerivedStats(socket.id, equipment);
    if (payload) socket.emit('stats:update', payload);
  };

  /** Push the player's shard balances so the HUD currency counters refresh.
   *  Shards are a tracked currency (PlayerManager), not inventory items. */
  const pushCurrency = (): void => {
    socket.emit('currency:update', {
      skillShards: playerManager.getSkillShards(socket.id),
      combatShards: playerManager.getCombatShards(socket.id),
      silver: playerManager.getSilver(socket.id),
    });
  };

  /** Push the idle deployment status. */
  const pushIdle = (): void => {
    const idle = playerManager.getIdle(socket.id);
    socket.emit('idle:status', {
      assigned: !!idle,
      biome: idle?.biome ?? null,
      difficulty: idle?.difficulty ?? null,
      intervalMinutes: playerManager.getHaste(socket.id).intervalMinutes,
    });
  };

  /** Credit any idle battles owed since the last access, push the summary, and
   *  refresh the affected state. Safe to call on login and on idle screen open. */
  const settleIdle = (): void => {
    const summary = resolveIdle(playerManager, inventoryManager, socket.id);
    if (summary && summary.battles > 0) {
      socket.emit('idle:summary', summary);
      pushStats();
      pushCurrency();
      pushInventoryUpdate();
    }
  };

  // ── players:get_online ────────────────────────────────────────────────────
  socket.on('players:get_online', () => {
    socket.emit('players:online', onlinePlayers.size)
  })

  // ── currency:get — HUD requests current shard balances ────────────────────
  socket.on('currency:get', () => {
    pushCurrency();
  })

  // ── Adventure rank — the grade band the player is served questions from ────
  //
  // The player may freely choose any rank (it is NOT age-gated — only the
  // initial default is derived from age). Server-authoritative: the chosen rank
  // gates which curriculum grades the player's quizzes draw from.
  const pushAdventureRank = (): void => {
    socket.emit('adventureRank:data', {
      rankId: playerManager.getAdventureRank(socket.id),
      ranks: ADVENTURE_RANKS.map((r) => ({
        id: r.id, name: r.name, minGrade: r.minGrade, maxGrade: r.maxGrade,
      })),
    });
  };
  socket.on('adventureRank:get', () => {
    if (!requireJoinedPlayer('You must join before viewing your rank.')) return;
    pushAdventureRank();
  });
  socket.on('adventureRank:set', (payload: { rankId?: unknown }) => {
    if (typeof payload?.rankId !== 'string' || !RANK_MAP[payload.rankId]) {
      socket.emit('error', { message: 'Unknown adventure rank.' });
      return;
    }
    if (!requireJoinedPlayer('You must join before setting your rank.')) return;
    playerManager.setAdventureRank(socket.id, payload.rankId);
    pushAdventureRank();
  });

  // ── Roster (multi-character) ──────────────────────────────────────────────
  //
  // The account owns a roster of characters; one is active (drives the
  // Character/Equipment screens, solo combat, and the town avatar). Switching
  // active re-pushes the per-character views. Creating is FREE up to the
  // starting team of FREE_ROSTER_SIZE; beyond that needs recruitment (Recruit
  // Tokens — a later stage). See docs/CHARACTERS_DESIGN.md §2.
  const buildRoster = () => ({
    characters: playerManager.getCharacters(socket.id).map((c) => ({
      id: c.id, name: c.name, class: c.class, level: c.level, xp: c.xp,
    })),
    activeCharacterId: playerManager.getActiveCharacter(socket.id)?.id ?? '',
    party: playerManager.getParty(socket.id),
    freeSlots: Math.max(0, FREE_ROSTER_SIZE - playerManager.getCharacters(socket.id).length),
    recruitTokens: playerManager.getRecruitTokens(socket.id),
    recruitCost: recruitCostFor(playerManager.getCharacters(socket.id).length),
    maxRoster: MAX_ROSTER,
  });
  const pushRoster = (): void => { socket.emit('roster:data', buildRoster()); };

  socket.on('roster:get', () => {
    if (!requireJoinedPlayer('You must join before viewing your roster.')) return;
    pushRoster();
  });

  socket.on('roster:set_active', (payload: { characterId?: unknown }) => {
    if (typeof payload?.characterId !== 'string') {
      socket.emit('error', { message: 'Invalid character id.' });
      return;
    }
    if (!requireJoinedPlayer('You must join first.')) return;
    if (!playerManager.setActiveCharacter(socket.id, payload.characterId)) {
      socket.emit('error', { message: 'That character is not in your roster.' });
      return;
    }
    playerManager.persistProgress(socket.id);
    // Refresh everything that is per-character for the newly active character.
    pushRoster();
    pushStats();
    pushInventoryUpdate();
    pushCurrency(); // Skill Shards are per-character
  });

  socket.on('party:set', (payload: { party?: unknown }) => {
    if (!Array.isArray(payload?.party) || !payload.party.every((id) => typeof id === 'string')) {
      socket.emit('error', { message: 'Invalid party payload.' });
      return;
    }
    if (!requireJoinedPlayer('You must join first.')) return;
    playerManager.setParty(socket.id, payload.party as string[]);
    playerManager.persistProgress(socket.id);
    pushRoster();
  });

  socket.on('roster:create', (payload: { name?: unknown; class?: unknown }) => {
    if (typeof payload?.name !== 'string' || typeof payload?.class !== 'string') {
      socket.emit('error', { message: 'Invalid character payload.' });
      return;
    }
    const player = requireJoinedPlayer('You must join before recruiting.');
    if (!player) return;
    if (!SKILL_CLASSES.includes(payload.class as SkillClass)) {
      socket.emit('error', { message: 'Unknown class.' });
      return;
    }
    const owned = playerManager.getCharacters(socket.id).length;
    if (owned >= MAX_ROSTER) {
      socket.emit('error', { message: 'Your roster is full.' });
      return;
    }
    // The first FREE_ROSTER_SIZE are free; beyond that costs Recruit Tokens.
    const cost = recruitCostFor(owned);
    if (cost > 0 && !playerManager.spendRecruitTokens(socket.id, cost)) {
      socket.emit('error', {
        message: `Recruiting costs ${cost} Recruit Token${cost !== 1 ? 's' : ''} — clear campaigns to earn more!`,
      });
      return;
    }
    const res = playerManager.createCharacter(socket.id, payload.name, payload.class);
    if ('error' in res) {
      // Refund the tokens if creation failed for a bad name, etc.
      if (cost > 0) playerManager.addRecruitTokens(socket.id, cost);
      socket.emit('error', { message: res.error });
      return;
    }
    playerManager.persistProgress(socket.id);
    pushRoster();
    console.log(`[roster] ${player.username} recruited ${res.character.name} (${res.character.class})${cost > 0 ? ` for ${cost} token(s)` : ''}`);
  });

  // ── Study-to-Haste — the account-wide test that speeds up idle combat (§3) ──
  const pushHaste = (): void => { socket.emit('haste:data', playerManager.getHaste(socket.id)); };

  socket.on('haste:get', () => {
    if (!requireJoinedPlayer('You must join first.')) return;
    pushHaste();
  });

  socket.on('study:start', () => {
    if (!requireJoinedPlayer('You must join before studying.')) return;
    const res = studySessionManager.start(socket.id);
    if ('error' in res) { socket.emit('error', { message: res.error }); return; }
    socket.emit('study:started', { sessionId: res.session.sessionId, firstQuestion: res.firstQuestion });
  });

  socket.on('study:answer', (payload: { sessionId?: unknown; questionId?: unknown; answerIndex?: unknown }) => {
    if (typeof payload?.sessionId !== 'string' || typeof payload?.questionId !== 'string' ||
        !isSafeNumber(payload?.answerIndex, 0, 3)) {
      socket.emit('error', { message: 'Invalid study answer payload.' });
      return;
    }
    const result = studySessionManager.submitAnswer(
      payload.sessionId, socket.id, payload.questionId, Math.floor(payload.answerIndex as number),
    );
    if ('error' in result) { socket.emit('error', { message: result.error }); return; }
    socket.emit('study:answer_result', result);
    if (result.sessionComplete) pushHaste(); // a passed test changed the interval
  });

  // ── Idle / auto-battle (§6/§7) ─────────────────────────────────────────────
  socket.on('idle:get', () => {
    if (!requireJoinedPlayer('You must join first.')) return;
    settleIdle();
    pushIdle();
  });

  socket.on('idle:assign', (payload: { biome?: unknown; difficulty?: unknown }) => {
    if (typeof payload?.difficulty !== 'string' || !(DIFFICULTIES as string[]).includes(payload.difficulty)) {
      socket.emit('error', { message: 'Unknown campaign difficulty.' });
      return;
    }
    if (!requireJoinedPlayer('You must join first.')) return;
    settleIdle(); // credit the prior deployment before redeploying
    const biome = typeof payload?.biome === 'string' ? payload.biome.slice(0, 32) : 'Campaign';
    playerManager.assignIdle(socket.id, biome, payload.difficulty);
    pushIdle();
  });

  socket.on('idle:clear', () => {
    if (!requireJoinedPlayer('You must join first.')) return;
    settleIdle();
    playerManager.clearIdle(socket.id);
    pushIdle();
  });

  // ── stats:get — Character / Equipment screens request the stat breakdown ──
  //
  // Read-only.  Recomputes attributes + derived combat stats from the player's
  // allocation and equipped gear (all server-side) and pushes `stats:update`.
  socket.on('stats:get', () => {
    const player = playerManager.getPlayer(socket.id);
    if (!player) return;
    pushStats();
  })

  // ── character:allocate — spend one allocation point into an attribute ─────
  //
  // Server-authoritative validation:
  //  1. The player must exist (joined).
  //  2. `attribute` must be one of the five known attributes.
  //  3. The player must have an unspent point (level*3 − sum(allocated) > 0).
  // On success the point is recorded, persisted, and the recomputed stats
  // (with the new derived Max HP) are pushed.
  socket.on('character:allocate', (payload: CharacterAllocatePayload) => {
    const player = requireJoinedPlayer('You must join before allocating points.');
    if (!player) return;

    const attribute = payload?.attribute;
    if (typeof attribute !== 'string' || !(ATTRIBUTE_KEYS as readonly string[]).includes(attribute)) {
      socket.emit('error', { message: 'Invalid attribute.' });
      return;
    }

    if (!playerManager.allocatePoint(socket.id, attribute as AttributeKey)) {
      socket.emit('error', { message: 'You have no unspent points to allocate.' });
      return;
    }

    playerManager.persistProgress(socket.id);
    pushStats();
    console.log(`[allocate] ${player.username} put a point into ${attribute}`);
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

    // Adventure Rank: if the player has never had a rank persisted, derive a
    // sensible DEFAULT from their account age (server-authoritative) and persist
    // it. Existing ranks are left untouched.
    if (!savedProgress.rankPersisted) {
      try {
        const account = await User.findOne({ username }).lean();
        if (account?.dateOfBirth) {
          const rankId = defaultRankForAge(ageFromDateOfBirth(new Date(account.dateOfBirth)));
          playerManager.setAdventureRank(socket.id, rankId);
        } else {
          // No DOB on file — keep the default rank but persist it so this branch
          // does not re-run every join.
          playerManager.setAdventureRank(socket.id, playerManager.getAdventureRank(socket.id));
        }
      } catch (err) {
        console.error('[join] adventure-rank default error:', err);
      }
    }

    // Join the Socket.io room for this zone
    socket.join(player.zone);

    // Tell the joining player about themselves and the current zone
    socket.emit('player:joined', { player, zonePlayers });

    // Migrate any shards that were stored as bag items (older builds) into the
    // tracked shard balances, then drop them from the bag.
    const drained = inventoryManager.drainShardItems(socket.id);
    if (drained.skill > 0) playerManager.addShards(socket.id, 'skill', drained.skill);
    if (drained.combat > 0) playerManager.addShards(socket.id, 'combat', drained.combat);
    if (drained.skill > 0 || drained.combat > 0) {
      console.log(`[migrate] folded bag shards into balances for ${username}: +${drained.skill} skill, +${drained.combat} combat`);
    }

    // Push the freshly-loaded inventory + shard balances so HUD counters render
    // immediately — the client's get requests can race this async join handler.
    const joinInventory = activeSnapshot();
    if (joinInventory) socket.emit('inventory:data', joinInventory);
    pushCurrency();
    // Derive Max HP from attributes + gear and push the stats breakdown so the
    // Character / Equipment screens render the moment the player joins.
    pushStats();

    // Credit any idle battles the deployed team fought while the player was away,
    // and push the current deployment status.
    settleIdle();
    pushIdle();

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
  socket.on('player:award_xp', async (payload: {
    xp: unknown; silver?: unknown; difficulty?: unknown; level?: unknown; campaignComplete?: unknown;
  }) => {
    if (!isSafeNumber(payload?.xp, 0, 500)) {
      socket.emit('error', { message: 'Invalid award_xp payload.' });
      return;
    }
    // Silver from combat is client-reported (combat resolves client-side) and
    // capped server-side, mirroring the XP cap — a generous ceiling that still
    // blocks absurd payloads. Optional: absent on non-combat XP awards.
    const silverAmount = isSafeNumber(payload?.silver, 0, 5000)
      ? Math.floor(payload.silver as number)
      : 0;

    const player = requireJoinedPlayer('You must join before earning XP.');
    if (!player) return;

    const xpAmount = Math.floor(payload.xp as number); // ensure integer
    const { newXp, newLevel, leveledUp } = playerManager.addXp(socket.id, xpAmount);
    if (silverAmount > 0) playerManager.addSilver(socket.id, silverAmount);
    playerManager.persistProgress(socket.id);

    socket.emit('player:xp_updated', {
      newXp,
      newLevel,
      leveledUp,
      xpAwarded: xpAmount,
    });
    if (silverAmount > 0) pushCurrency();

    console.log(
      `[award_xp] ${player.username} +${xpAmount} XP, +${silverAmount} silver → ${newXp} XP (Lv ${newLevel})` +
      (leveledUp ? ' *** LEVEL UP ***' : ''),
    );

    // ── Combat loot drops (server-authoritative) ──────────────────────────────
    // Only when this award reports a battle outcome (difficulty present). The
    // server rolls the drop and adds the item(s) to the bag — the client never
    // chooses loot. `combat:loot` is always emitted (possibly empty) so the
    // client's one-shot listener resolves and the loot toast can render.
    const diff: Difficulty | null =
      typeof payload?.difficulty === 'string' && (DIFFICULTIES as string[]).includes(payload.difficulty)
        ? (payload.difficulty as Difficulty)
        : null;
    if (diff) {
      const dropLevel = isSafeNumber(payload?.level, 1, 100) ? Math.floor(payload.level as number) : 1;
      const campaignComplete = payload?.campaignComplete === true;
      // Campaigns reward MATERIALS only (turned into gear at the crafting
      // buildings) — never finished items. Server-authoritative. The haul scales
      // with the player's current rank (M(currentRank)) to match the steeper
      // craft costs at that rank (see docs/ADVENTURE_RANKS_DESIGN.md §1).
      const rankMult = rankMultiplier(playerManager.getAdventureRank(socket.id));
      const { drops, richVein } = rollMaterials(dropLevel, diff, campaignComplete, rankMult);
      if (drops.length) {
        playerManager.grantMaterials(socket.id, drops);
        playerManager.persistProgress(socket.id);
        console.log(
          `[loot] ${player.username} ${campaignComplete ? '(campaign) ' : ''}${richVein ? '*RICH VEIN* ' : ''}materials: ` +
          drops.map((d) => `${MATERIALS[d.materialId]?.name ?? d.materialId} x${d.qty}`).join(', '),
        );
      }
      // Reuse the existing reward-chip shape: name carries the quantity, and the
      // chip rarity colours catalysts by their gate / base mats by tier.
      const tierRarity = (t: number): string =>
        t >= 7 ? 'legendary' : t >= 6 ? 'epic' : t >= 5 ? 'rare' : t >= 3 ? 'uncommon' : 'common';
      const items = drops.map((d) => {
        const m = MATERIALS[d.materialId];
        const rarity = m?.family === 'catalyst' ? (m.rarityGate ?? 'rare') : tierRarity(m?.tier ?? 1);
        return { name: `${m?.name ?? d.materialId} ×${d.qty}`, icon: m?.icon ?? '📦', rarity };
      });

      // Highlights for the end-screen special effect: did a special catalyst drop,
      // and at what rarity? (drives a celebratory FX on the reward screen).
      const catalystDrop = drops.find((d) => MATERIALS[d.materialId]?.family === 'catalyst');
      const catalystRarity = catalystDrop ? (MATERIALS[catalystDrop.materialId]?.rarityGate ?? null) : null;

      // ── Shard rewards (campaign completion only) ────────────────────────────
      // Shards used to come from the Learning Center; now they drop from clearing
      // campaigns. The first campaign ever grants a guaranteed 2 skill + 1 combat
      // so a new player can start buying skills/strategies; after that they're a
      // rare random drop (combat rarer than skill, both nudged up by difficulty).
      if (campaignComplete) {
        const firstEver = playerManager.getCampaignsCompleted(socket.id) === 0;
        let skillAward = 0;
        let combatAward = 0;
        if (firstEver) {
          skillAward = 2;
          combatAward = 1;
        } else {
          const di = Math.max(0, (DIFFICULTIES as string[]).indexOf(diff)); // 0..4
          // Shard drops scale with the player's current rank (rewards track the
          // rank you play — see docs/ADVENTURE_RANKS_DESIGN.md §1/§4e). The
          // first-ever onboarding grant above stays fixed.
          if (Math.random() < 0.12 + di * 0.03) skillAward = Math.round(rankMult);  // ~12%–24%
          if (Math.random() < 0.04 + di * 0.015) combatAward = Math.round(rankMult); // ~4%–10%
        }
        if (skillAward > 0) playerManager.addShards(socket.id, 'skill', skillAward);
        if (combatAward > 0) playerManager.addShards(socket.id, 'combat', combatAward);

        // Recruit Tokens — every campaign clear grants 1 (the steady source for
        // recruiting characters beyond the free team; see CHARACTERS_DESIGN.md §2).
        const tokenAward = 1;
        playerManager.addRecruitTokens(socket.id, tokenAward);
        items.push({ name: `Recruit Token ×${tokenAward}`, icon: '🎟️', rarity: 'rare' });

        playerManager.recordCampaignCompletion(socket.id);

        if (skillAward > 0) items.push({ name: `Skill Shard ×${skillAward}`, icon: '🔷', rarity: 'rare' });
        if (combatAward > 0) items.push({ name: `Combat Shard ×${combatAward}`, icon: '🔶', rarity: 'epic' });
        pushCurrency(); // refresh the HUD currency counters
        pushRoster(); // refresh the roster panel's token balance
        console.log(`[campaign] ${player.username} cleared a campaign: +${tokenAward} token, +${skillAward} skill, +${combatAward} combat${firstEver ? ' (first clear bonus)' : ''}`);
      }

      socket.emit('combat:loot', { campaignComplete, items, richVein, catalystRarity });
    }
  });

  // ── campaign:resolve — autonomous party combat (server-authoritative) ──────
  //
  // The client sends the encounter (the campaign's mobs); the SERVER builds the
  // party from the roster, runs the deterministic resolver, grants per-character
  // rewards, and returns the event log for the client to ANIMATE. The client
  // never decides the outcome or the rewards (docs/CHARACTERS_DESIGN.md §5).
  socket.on('campaign:resolve', (payload: {
    difficulty?: unknown; level?: unknown; campaignComplete?: unknown; mobs?: unknown;
  }) => {
    const player = requireJoinedPlayer('You must join before fighting.');
    if (!player) return;

    const diff: Difficulty | null =
      typeof payload?.difficulty === 'string' && (DIFFICULTIES as string[]).includes(payload.difficulty)
        ? (payload.difficulty as Difficulty) : null;
    if (!diff) { socket.emit('error', { message: 'Unknown campaign difficulty.' }); return; }

    if (!Array.isArray(payload?.mobs) || payload.mobs.length === 0 || payload.mobs.length > 8) {
      socket.emit('error', { message: 'Invalid encounter.' }); return;
    }
    const rawMobs = payload.mobs as Record<string, unknown>[];
    const num = (v: unknown, lo: number, hi: number, dflt: number) =>
      isSafeNumber(v, lo, hi) ? Math.floor(v as number) : dflt;
    const mobs: MobInput[] = rawMobs.map((m, i) => ({
      id: `e${i}`,
      name: typeof m?.name === 'string' ? m.name.slice(0, 24) : 'Enemy',
      maxHp: num(m?.maxHp, 1, 100000, 30),
      attack: num(m?.attack, 1, 5000, 5),
      defense: num(m?.defense, 0, 5000, 0),
      speed: num(m?.speed, 1, 1000, 10),
    }));
    const mobLevels = rawMobs.map((m) => num(m?.level, 1, 100, 1));
    const campaignComplete = payload?.campaignComplete === true;

    const currentRank = playerManager.getAdventureRank(socket.id);

    // Build the party (server-authoritative — from the roster + per-char gear).
    const characters = playerManager.getCharacters(socket.id);
    const allies = playerManager.getParty(socket.id)
      .map((id) => {
        const ch = characters.find((c) => c.id === id);
        if (!ch) return null;
        return buildAllyCombatant(ch, inventoryManager.equipmentFor(socket.id, id), currentRank);
      })
      .filter((c): c is NonNullable<typeof c> => !!c);
    if (allies.length === 0) { socket.emit('error', { message: 'Your party is empty.' }); return; }

    const enemies = mobs.map((m) => buildEnemyCombatant(m, currentRank));
    const seed = (Math.random() * 0xffffffff) >>> 0;
    const { events, outcome } = resolveBattle({ allies, enemies, seed });

    const levelUps: { id: string; newLevel: number }[] = [];
    const rewards = { xpPerCharacter: 0, silver: 0, items: [] as { name: string; icon: string; rarity: string }[] };

    if (outcome.victory) {
      // Per-character XP — every ally in the team levels individually.
      const encounterXp = Math.min(500, mobLevels.reduce((s, lvl) => s + (10 + lvl * 2), 0));
      rewards.xpPerCharacter = encounterXp;
      const activeId = playerManager.getActiveCharacter(socket.id)?.id;
      for (const ally of allies) {
        const res = playerManager.addXpToCharacter(socket.id, ally.id, encounterXp);
        if (res?.leveledUp) {
          levelUps.push({ id: ally.id, newLevel: res.newLevel });
          // Reuse the existing celebration when it's the active character.
          if (ally.id === activeId) {
            socket.emit('player:xp_updated', { newXp: res.newXp, newLevel: res.newLevel, leveledUp: true, xpAwarded: encounterXp });
          }
        }
      }

      // Account-wide rewards: silver + materials (+ campaign shard bonus).
      const repLevel = Math.max(1, ...mobLevels);
      const silver = Math.min(5000, mobLevels.reduce((s, lvl) => s + Math.round(lvl * 1.5), 0));
      if (silver > 0) playerManager.addSilver(socket.id, silver);
      rewards.silver = silver;

      const rankMult = rankMultiplier(currentRank);
      const { drops } = rollMaterials(repLevel, diff, campaignComplete, rankMult);
      if (drops.length) playerManager.grantMaterials(socket.id, drops);
      const tierRarity = (t: number): string =>
        t >= 7 ? 'legendary' : t >= 6 ? 'epic' : t >= 5 ? 'rare' : t >= 3 ? 'uncommon' : 'common';
      rewards.items = drops.map((d) => {
        const mat = MATERIALS[d.materialId];
        const rarity = mat?.family === 'catalyst' ? (mat.rarityGate ?? 'rare') : tierRarity(mat?.tier ?? 1);
        return { name: `${mat?.name ?? d.materialId} ×${d.qty}`, icon: mat?.icon ?? '📦', rarity };
      });

      if (campaignComplete) {
        const firstEver = playerManager.getCampaignsCompleted(socket.id) === 0;
        let skillAward = 0, combatAward = 0;
        if (firstEver) { skillAward = 2; combatAward = 1; }
        else {
          const di = Math.max(0, (DIFFICULTIES as string[]).indexOf(diff));
          if (Math.random() < 0.12 + di * 0.03) skillAward = Math.round(rankMult);
          if (Math.random() < 0.04 + di * 0.015) combatAward = Math.round(rankMult);
        }
        if (skillAward > 0) { playerManager.addShards(socket.id, 'skill', skillAward); rewards.items.push({ name: `Skill Shard ×${skillAward}`, icon: '🔷', rarity: 'rare' }); }
        if (combatAward > 0) { playerManager.addShards(socket.id, 'combat', combatAward); rewards.items.push({ name: `Combat Shard ×${combatAward}`, icon: '🔶', rarity: 'epic' }); }
        playerManager.recordCampaignCompletion(socket.id);
      }

      playerManager.persistProgress(socket.id);
      pushStats(); pushCurrency(); pushInventoryUpdate();
    }

    socket.emit('campaign:resolved', {
      events, victory: outcome.victory, rounds: outcome.rounds, levelUps, rewards,
    });
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

    // Adventure Rank gate (server-authoritative) — the topic's grade must fall
    // within the player's rank grade band. The client cannot widen its band.
    const band = playerManager.getRankGradeBand(socket.id);
    if (topic.grade < band.min || topic.grade > band.max) {
      socket.emit('error', {
        message: `That topic is grade ${topic.grade}, outside your adventure rank's grade band (${band.min}-${band.max}).`,
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
    playerManager.addShards(socket.id, 'skill', QUIZ_COMPLETE_SKILL_SHARDS);

    if (passed && completedSession) {
      const { topicId, subject } = completedSession;
      topicPasses = playerManager.recordTopicPass(socket.id, topicId);

      // Did this pass complete BOTH topics of the subject's current grade?
      if (playerManager.isCurrentGradeComplete(socket.id, subject)) {
        gradeCompleted = true;
        skillShardsAwarded += GRADE_COMPLETE_SKILL_SHARDS;
        combatShardAwarded = GRADE_COMPLETE_COMBAT_SHARDS;
        playerManager.addShards(socket.id, 'skill', GRADE_COMPLETE_SKILL_SHARDS);
        playerManager.addShards(socket.id, 'combat', combatShardAwarded);
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

    // Refresh the HUD shard counters (a quiz always awards at least 1 skill shard).
    pushCurrency();

    // Let the HUD refresh XP / level after the quiz wraps up.
    const activeChar = playerManager.getActiveCharacter(socket.id);
    if (activeChar) {
      socket.emit('player:xp_updated', {
        newXp: activeChar.xp,
        newLevel: activeChar.level,
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

  // ── materials:get ────────────────────────────────────────────────────────
  //
  // Returns the player's crafting-material stash (id → qty). Safe to send: the
  // client only displays it; all spending is validated server-side at craft.
  const pushMaterials = (): void => {
    socket.emit('materials:data', { materials: playerManager.getMaterials(socket.id) });
  };
  socket.on('materials:get', () => {
    if (!requireJoinedPlayer('You must join before viewing materials.')) return;
    pushMaterials();
  });

  // ── craft:start ──────────────────────────────────────────────────────────
  //
  // Begin a Forge weapon craft: a short Math quiz that produces a weapon.
  // Server-authoritative — the recipe, tier, catalyst and material ownership are
  // all validated here; the client only ever receives answer text, never the
  // correct index, and never the rolled item until materials are spent.
  socket.on('craft:start', (payload: CraftStartPayload) => {
    if (
      typeof payload?.recipeId !== 'string' ||
      !isSafeNumber(payload?.tier, 1, 7) ||
      !(payload?.catalystId === null || typeof payload?.catalystId === 'string')
    ) {
      socket.emit('error', { message: 'Invalid craft start payload.' });
      return;
    }

    const player = requireJoinedPlayer('You must join before crafting.');
    if (!player) return;

    const result = craftSessionManager.startCraft(
      socket.id,
      payload.recipeId,
      payload.tier,
      payload.catalystId,
    );
    if ('error' in result) {
      socket.emit('error', { message: result.error });
      return;
    }

    socket.emit('craft:session_started', {
      sessionId: result.session.sessionId,
      recipeId: result.session.recipe?.id,
      firstQuestion: result.firstQuestion,
    });
  });

  // ── item:upgrade ───────────────────────────────────────────────────────────
  //
  // Begin a RANK upgrade for an owned gear item: a target-rank quiz that, on a
  // pass, raises the item's craftRank by one rank. Reuses the craft quiz plumbing
  // (the client answers via `craft:answer`). Server-authoritative — ownership,
  // material cost, rank ceiling, and the result are all validated here; the
  // client never sets craftRank.
  socket.on('item:upgrade', (payload: { itemId?: unknown }) => {
    if (typeof payload?.itemId !== 'string') {
      socket.emit('error', { message: 'Invalid upgrade payload.' });
      return;
    }
    const player = requireJoinedPlayer('You must join before upgrading.');
    if (!player) return;

    const result = craftSessionManager.startUpgrade(socket.id, payload.itemId);
    if ('error' in result) {
      socket.emit('error', { message: result.error });
      return;
    }
    socket.emit('craft:session_started', {
      sessionId: result.session.sessionId,
      firstQuestion: result.firstQuestion,
    });
  });

  // ── craft:answer ─────────────────────────────────────────────────────────
  socket.on('craft:answer', (payload: CraftAnswerPayload) => {
    if (
      typeof payload?.sessionId !== 'string' ||
      typeof payload?.questionId !== 'string' ||
      !isSafeNumber(payload?.answerIndex, 0, 3)
    ) {
      socket.emit('error', { message: 'Invalid craft answer payload.' });
      return;
    }

    const result = craftSessionManager.submitAnswer(
      payload.sessionId,
      socket.id,
      payload.questionId,
      payload.answerIndex,
    );
    if ('error' in result) {
      socket.emit('error', { message: result.error });
      return;
    }

    socket.emit('craft:answer_result', result);

    // A finished craft/upgrade mutated the bag + material stash — refresh the
    // client. An upgrade can change an equipped item's scaled defense, so push
    // stats too.
    if (result.sessionComplete) {
      pushInventoryUpdate();
      pushMaterials();
      pushStats();
    }
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

    // Broadcast to the zone the player is in. SECURITY: the username comes from
    // the server-side joined player (never a client-claimed name), and zone
    // scoping means tavern chat only reaches sockets in the 'tavern' zone —
    // town players never see it, and vice-versa.
    io.to(player.zone).emit('chat:message', {
      playerId: socket.id,
      username: player.username,
      message: sanitised,
      ts: now,
    });
  });

  // ── inventory:get ────────────────────────────────────────────────────────
  socket.on('inventory:get', () => {
    const snapshot = activeSnapshot();
    if (!snapshot) {
      socket.emit('error', { message: 'Inventory not found. Have you joined yet?' });
      return;
    }
    // Safe to send: stats come from the server; correctIndex is never in inventory data.
    socket.emit('inventory:data', snapshot);
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

    // Resolve the destination slot + name, supporting BOTH item models:
    //  • Crafted gear — carries its own equipSlot + tier-derived XP gate on the
    //    instance (rolled server-side at craft time; see CraftSessionManager).
    //  • Legacy ItemDatabase gear (worn_sword, etc.) — its catalogue slot, no
    //    XP gate.  Its {attack,defense,hp} stats fold into derived stats during
    //    stat computation (see PlayerManager.computeStats).
    let slotKey: EquipmentSlotKey;
    let label: string;

    if (bagItem.equipSlot) {
      // XP gate — enforced server-side against the ACTIVE character's XP.
      const need = bagItem.xpRequired ?? 0;
      const charXp = playerManager.getActiveCharacter(socket.id)?.xp ?? 0;
      if (charXp < need) {
        socket.emit('error', {
          message: `You need ${need} XP to equip ${bagItem.name} (you have ${charXp}). Keep adventuring!`,
        });
        return;
      }
      slotKey = EQUIP_SLOT_TO_KEY[bagItem.equipSlot];
      label = bagItem.name;
    } else {
      const legacySlot = getItemSlot(bagItem.itemType);
      if (!legacySlot) {
        socket.emit('error', { message: 'That item is not equippable gear.' });
        return;
      }
      slotKey = legacySlot;
      label = bagItem.name;
    }

    const success = inventoryManager.equipGeneratedItem(socket.id, activeCharId(), payload.itemId, slotKey);
    if (!success) {
      socket.emit('error', { message: 'Could not equip that item.' });
      return;
    }

    pushInventoryUpdate();
    // Recompute derived stats (Max HP can change) and push the breakdown.
    pushStats();
    console.log(
      `[equip] ${player.username} equipped ${label} in ${slotKey}`,
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

    if (!inventoryManager.unequipItem(socket.id, activeCharId(), payload.slot)) {
      socket.emit('error', { message: 'That slot is empty.' });
      return;
    }

    pushInventoryUpdate();
    // Recompute derived stats (Max HP can drop) and push the breakdown.
    pushStats();
    console.log(`[equip] ${player.username} unequipped slot ${payload.slot}`);
  });

  // NOTE: the old `inventory:add_shard` handler was removed.  Shards are now
  // spendable currency, so a client-triggered "give me a shard" event would be
  // a direct economy exploit.  All shard awards happen in learning:answer.

  // ── Shop helpers ─────────────────────────────────────────────────────────

  /** Build the unlock/balance snapshot sent to shop UIs. Skills + the strategy
   *  loadout are per the ACTIVE character; strategy catalog + learning are account-wide. */
  const buildUnlocksPayload = (player: Player): ShopUnlocksPayload => ({
    unlockedSkills: playerManager.getUnlockedSkills(socket.id),
    skillRanks: playerManager.getSkillRanks(socket.id),
    unlockedStrategies: [...player.unlockedStrategies],
    skillShards: playerManager.getSkillShards(socket.id),
    combatShards: playerManager.getCombatShards(socket.id),
    strategyLoadout: playerManager.getStrategyLoadout(socket.id),
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

    // Buying advances the skill by ONE rank (rank 0 = unowned → 1 = first
    // unlock). Ranks are gated by the active character's level and cost more per
    // rank (see docs/CHARACTERS_DESIGN.md §4).
    const currentRank = playerManager.getSkillRank(socket.id, skill.id);
    const nextRank = currentRank + 1;
    if (nextRank > MAX_SKILL_RANK) {
      socket.emit('error', { message: `${skill.name} is already at max rank (${MAX_SKILL_RANK}).` });
      return;
    }

    // Prerequisites are only required to FIRST unlock a skill (rank 0 → 1).
    if (currentRank === 0) {
      const ownedSkills = playerManager.getUnlockedSkills(socket.id);
      const missingPrereq = skill.requires.find((req) => !ownedSkills.includes(req));
      if (missingPrereq) {
        const prereq = SKILL_MAP.get(missingPrereq);
        socket.emit('error', { message: `You must learn ${prereq?.name ?? missingPrereq} first.` });
        return;
      }
    }

    // Level gate for this rank.
    const charLevel = playerManager.getActiveCharacter(socket.id)?.level ?? 1;
    const reqLevel = skillRankLevelGate(nextRank);
    if (charLevel < reqLevel) {
      socket.emit('error', {
        message: `${skill.name} rank ${nextRank} needs character level ${reqLevel} (you are ${charLevel}).`,
      });
      return;
    }

    const price = skillRankCost(SKILL_PRICE_BY_TIER[skill.tier], nextRank);
    if (!playerManager.spendShards(socket.id, 'skill', price)) {
      socket.emit('error', {
        message: `Not enough Skill Shards — rank ${nextRank} of ${skill.name} costs ${price} 🔷. Earn more by answering questions!`,
      });
      return;
    }

    playerManager.setSkillRank(socket.id, skill.id, nextRank);
    playerManager.persistProgress(socket.id);

    socket.emit('shop:skill_purchased', {
      skillId: skill.id,
      ...buildUnlocksPayload(player),
    });
    pushCurrency();

    console.log(`[shop] ${player.username} bought ${skill.id} rank ${nextRank} for ${price} skill shard(s)`);
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

    if (!playerManager.spendShards(socket.id, 'combat', price)) {
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
    pushCurrency();

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

    const inventory = activeSnapshot();
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
      const toSlot = typeof payload.toSlot === 'number' ? payload.toSlot : undefined;
      success = chestManager.transferToChest(payload.chestId, socket.id, item, toSlot);
    } else {
      success = chestManager.transferFromChest(payload.chestId, socket.id, payload.itemId);
    }

    if (!success) {
      socket.emit('error', { message: 'Transfer failed. Check chest capacity or item ownership.' });
      return;
    }

    const updatedInventory = activeSnapshot()!;
    const updatedChest = chestManager.getChest(payload.chestId)!;
    socket.emit('chest:updated', { chest: updatedChest, inventory: updatedInventory });
  });

  // ── item:delete ──────────────────────────────────────────────────────────
  //
  // Permanently discard an item. Server-authoritative: the item is removed from
  // the player's OWN bag (no chestId) or their OWN chest (chestId given), then
  // the refreshed state is pushed back. The whole stack is removed.
  socket.on('item:delete', (payload: { itemId?: unknown; chestId?: unknown }) => {
    if (typeof payload?.itemId !== 'string') {
      socket.emit('error', { message: 'Invalid delete payload.' });
      return;
    }
    if (!requireJoinedPlayer('You must join before deleting items.')) return;

    if (typeof payload.chestId === 'string') {
      const chest = chestManager.getChest(payload.chestId);
      if (!chest || chest.ownerId !== socket.id) {
        socket.emit('error', { message: 'Chest not found or not yours.' });
        return;
      }
      if (!chestManager.deleteFromChest(payload.chestId, socket.id, payload.itemId)) {
        socket.emit('error', { message: 'That item is not in the chest.' });
        return;
      }
      socket.emit('chest:updated', {
        chest: chestManager.getChest(payload.chestId)!,
        inventory: activeSnapshot()!,
      });
    } else {
      if (!inventoryManager.deleteItem(socket.id, payload.itemId)) {
        socket.emit('error', { message: 'That item is not in your bag.' });
        return;
      }
      pushInventoryUpdate();
    }
  });

  // ── Market ─────────────────────────────────────────────────────────────────
  //
  // Player-driven market.  Everything is server-authoritative: prices come from
  // marketPrice() (server catalog), balances from PlayerManager, ownership from
  // the server inventory, and listings persist in MongoDB (MarketManager).  The
  // client only sends item-instance ids / listing ids and renders pushed state.

  const { marketManager } = game;

  /** The 8 market tabs (== generated EquipSlot values). */
  const MARKET_SLOTS: ReadonlySet<string> = new Set([
    'weapon', 'helmet', 'chest', 'legs', 'boots', 'gloves', 'ring', 'amulet',
  ]);

  // Valid attribute-filter values (the generated-gear attribute/bonus types).
  const MARKET_ATTRIBUTES: ReadonlySet<string> = new Set(ATTRIBUTE_TYPES);

  // Synthetic seller for items sold to the system. Items sold this way stay on
  // the market (priced like a player listing, 2× base) so they — and any other
  // player — can buy them back. The space makes it impossible to collide with a
  // real username, and the buy handler's offline-credit ($inc, upsert:false) is
  // a safe no-op for this seller, so the rebuy silver leaves the economy.
  const MARKET_VENDOR = 'Market Vendor';

  /**
   * Parse a search string into either a NAME substring match or an ATTRIBUTE
   * filter.  An attribute filter looks like `<attrName> <op> <value>` where
   *   op ∈ > < >= <= =,  value may have a leading '+',  attrName is one of the
   *   generated-gear attribute / bonus types (case-insensitive, spaces→'_').
   * Anything that does not match that grammar is treated as a name substring.
   */
  const buildSearchPredicate = (
    rawSearch: string,
  ): ((l: MarketListing) => boolean) | undefined => {
    const search = rawSearch.trim();
    if (!search) return undefined;

    const m = search.match(/^([a-zA-Z][a-zA-Z _]*?)\s*(>=|<=|=|>|<)\s*\+?(-?\d+(?:\.\d+)?)$/);
    if (m) {
      const attrName = m[1].trim().toLowerCase().replace(/\s+/g, '_');
      const op = m[2];
      const value = parseFloat(m[3]);
      const cmp = (a: number): boolean => {
        switch (op) {
          case '>': return a > value;
          case '<': return a < value;
          case '>=': return a >= value;
          case '<=': return a <= value;
          case '=': return a === value;
          default: return false;
        }
      };
      return (l) => {
        const attrs = l.itemData.attributes ?? [];
        // Match the named attribute; a listing satisfies the filter if it has
        // that attribute AND its value satisfies the comparison.
        return attrs.some((a) => a.type.toLowerCase() === attrName && cmp(a.value));
      };
    }

    // Plain name substring match (case-insensitive).
    const needle = search.toLowerCase();
    return (l) => l.itemData.name.toLowerCase().includes(needle);
  };

  /**
   * Rehydrate a fresh bag InventoryItem from a listing snapshot.  A NEW UUID is
   * stamped (the snapshot id belonged to the seller's instance).  Generated
   * gear keeps its eq_NNNN itemType so EQUIPMENT_MAP lookups (equip/stats) work;
   * legacy items are rebuilt from the ItemDatabase template when possible so the
   * canonical stats are restored, falling back to the snapshot.
   */
  const itemFromSnapshot = (data: MarketListing['itemData']): InventoryItem => {
    const legacy = createItem(data.itemType);
    if (legacy) {
      legacy.id = randomUUID();
      return legacy;
    }
    return {
      id: randomUUID(),
      itemType: data.itemType,
      name: data.name,
      description: data.description ?? '',
      rarity: data.rarity as ItemRarity,
      stats: { ...(data.stats ?? {}) },
      quantity: 1,
      stackable: false,
      icon: data.icon,
    };
  };

  /** Push the player's own active listings as a `market:listings`. */
  const pushMyListings = (username: string): void => {
    socket.emit('market:listings', { listings: marketManager.listingsBySeller(username) });
  };

  // ── market:get_listings ──────────────────────────────────────────────────
  socket.on(
    'market:get_listings',
    (payload: { slot?: unknown; search?: unknown; attribute?: unknown }) => {
      const player = requireJoinedPlayer('You must join before browsing the market.');
      if (!player) return;

      // slot omitted / unknown (e.g. the "All" tab) → no slot filter.
      const slot =
        typeof payload?.slot === 'string' && MARKET_SLOTS.has(payload.slot)
          ? payload.slot
          : undefined;
      const search = typeof payload?.search === 'string' ? payload.search : '';
      const attribute =
        typeof payload?.attribute === 'string' && MARKET_ATTRIBUTES.has(payload.attribute)
          ? payload.attribute
          : undefined;

      // Compose the search predicate with the attribute-presence filter; a
      // listing must satisfy BOTH to appear.
      const searchPred = buildSearchPredicate(search);
      const attrPred = attribute
        ? (l: MarketListing) => (l.itemData.attributes ?? []).some((a) => a.type === attribute)
        : undefined;
      const parts = [searchPred, attrPred].filter(
        (p): p is (l: MarketListing) => boolean => !!p,
      );
      const predicate = parts.length ? (l: MarketListing) => parts.every((p) => p(l)) : undefined;

      socket.emit('market:listings', {
        listings: marketManager.getListings({ slot, predicate }),
      });
    },
  );

  // ── market:my_listings ─────────────────────────────────────────────────────
  socket.on('market:my_listings', () => {
    const player = requireJoinedPlayer('You must join before viewing your listings.');
    if (!player) return;
    pushMyListings(player.username);
  });

  // ── market:list — list a bag item for other players (2× base) ──────────────
  socket.on('market:list', (payload: { itemInstanceId?: unknown }) => {
    if (typeof payload?.itemInstanceId !== 'string') {
      socket.emit('error', { message: 'Invalid market list payload.' });
      return;
    }
    const player = requireJoinedPlayer('You must join before selling items.');
    if (!player) return;

    const inv = inventoryManager.getInventory(socket.id);
    const bagItem = inv?.items.find((i) => i.id === payload.itemInstanceId);
    if (!inv || !bagItem) {
      socket.emit('error', { message: 'You do not own that item.' });
      return;
    }

    const price = 2 * marketPrice(bagItem);
    const snapshot = buildItemSnapshot(bagItem);

    // Remove from the bag FIRST so a player can never list the same instance
    // twice; only then create the listing.
    if (!inventoryManager.removeItem(socket.id, bagItem.id)) {
      socket.emit('error', { message: 'Could not list that item.' });
      return;
    }
    const listing = marketManager.createListing(player.username, snapshot, price);

    pushInventoryUpdate();
    socket.emit('market:listed', { listing });
    console.log(`[market] ${player.username} listed ${snapshot.name} for ${price} silver`);
  });

  // ── market:sell_to_system — instant sell for base silver ───────────────────
  socket.on('market:sell_to_system', (payload: { itemInstanceId?: unknown }) => {
    if (typeof payload?.itemInstanceId !== 'string') {
      socket.emit('error', { message: 'Invalid sell payload.' });
      return;
    }
    const player = requireJoinedPlayer('You must join before selling items.');
    if (!player) return;

    const inv = inventoryManager.getInventory(socket.id);
    const bagItem = inv?.items.find((i) => i.id === payload.itemInstanceId);
    if (!inv || !bagItem) {
      socket.emit('error', { message: 'You do not own that item.' });
      return;
    }

    const base = marketPrice(bagItem);
    const snapshot = buildItemSnapshot(bagItem);
    if (!inventoryManager.removeItem(socket.id, bagItem.id)) {
      socket.emit('error', { message: 'Could not sell that item.' });
      return;
    }
    playerManager.addSilver(socket.id, base);
    // Keep the item on the market under the vendor so it can be bought back.
    const vendorListing = marketManager.createListing(MARKET_VENDOR, snapshot, 2 * base);

    pushInventoryUpdate();
    pushCurrency();
    socket.emit('market:sold', { silver: base, listing: vendorListing });
    console.log(`[market] ${player.username} sold ${bagItem.name} to the system for ${base} silver (relisted at ${2 * base})`);
  });

  // ── market:buy — buy another player's listing ──────────────────────────────
  //
  // Server-authoritative validation, in order:
  //  1. The listing must still exist.
  //  2. The buyer must NOT be the seller (can't buy your own listing).
  //  3. The buyer must have enough silver (getSilver >= price).
  // Then, atomically from the buyer's view:
  //  • spendSilver(buyer, price)  — fails closed if balance changed.
  //  • add the rehydrated item to the buyer's bag.
  //  • credit the seller `price` silver — works even if the seller is OFFLINE
  //    (PlayerProgress $inc); if online, also update their in-memory balance and
  //    push their currency.
  //  • delete the listing (cache + DB).
  socket.on('market:buy', async (payload: { listingId?: unknown }) => {
    if (typeof payload?.listingId !== 'string') {
      socket.emit('error', { message: 'Invalid buy payload.' });
      return;
    }
    const player = requireJoinedPlayer('You must join before buying items.');
    if (!player) return;

    const listing = marketManager.getListing(payload.listingId);
    if (!listing) {
      socket.emit('error', { message: 'That listing is no longer available.' });
      return;
    }
    if (listing.sellerUsername === player.username) {
      socket.emit('error', { message: 'You cannot buy your own listing.' });
      return;
    }
    if (playerManager.getSilver(socket.id) < listing.price) {
      socket.emit('error', {
        message: `Not enough silver — that costs ${listing.price} 🪙.`,
      });
      return;
    }

    // Take the silver first; spendSilver fails closed if the balance is short.
    if (!playerManager.spendSilver(socket.id, listing.price)) {
      socket.emit('error', { message: 'Not enough silver.' });
      return;
    }

    // Hand the item to the buyer.
    const newItem = itemFromSnapshot(listing.itemData);
    inventoryManager.addItem(socket.id, newItem);

    // Credit the seller — even if offline.
    const sellerOnlineSocketId = playerManager.getSocketIdByUsername(listing.sellerUsername);
    if (sellerOnlineSocketId) {
      playerManager.addSilver(sellerOnlineSocketId, listing.price);
      io.to(sellerOnlineSocketId).emit('currency:update', {
        skillShards: playerManager.getSkillShards(sellerOnlineSocketId),
        combatShards: playerManager.getCombatShards(sellerOnlineSocketId),
        silver: playerManager.getSilver(sellerOnlineSocketId),
      });
    } else {
      // Offline seller — credit directly in MongoDB. addSilver already persists
      // for online sellers (it writes the in-memory balance through), so we only
      // do the raw $inc when the seller is NOT online to avoid double-crediting.
      PlayerProgress.findOneAndUpdate(
        { userId: listing.sellerUsername },
        { $inc: { silver: listing.price } },
        { upsert: false },
      ).catch((err) => console.error('[market] offline seller credit failed:', err));
    }

    // Remove the listing now the trade is done.
    marketManager.removeListing(listing.listingId);

    pushInventoryUpdate();
    pushCurrency();
    socket.emit('market:bought', { listingId: listing.listingId, item: newItem });
    console.log(
      `[market] ${player.username} bought ${listing.itemData.name} from ${listing.sellerUsername} for ${listing.price} silver`,
    );
  });

  // ── market:cancel — pull your own listing and reclaim the item ─────────────
  socket.on('market:cancel', (payload: { listingId?: unknown }) => {
    if (typeof payload?.listingId !== 'string') {
      socket.emit('error', { message: 'Invalid cancel payload.' });
      return;
    }
    const player = requireJoinedPlayer('You must join before cancelling listings.');
    if (!player) return;

    const listing = marketManager.getListing(payload.listingId);
    if (!listing) {
      socket.emit('error', { message: 'That listing no longer exists.' });
      return;
    }
    if (listing.sellerUsername !== player.username) {
      socket.emit('error', { message: 'You can only cancel your own listings.' });
      return;
    }

    // Return the item to the bag, then drop the listing.
    const returned = itemFromSnapshot(listing.itemData);
    inventoryManager.addItem(socket.id, returned);
    marketManager.removeListing(listing.listingId);

    pushInventoryUpdate();
    socket.emit('market:cancelled', { listingId: listing.listingId });
    console.log(`[market] ${player.username} cancelled listing for ${listing.itemData.name}`);
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
