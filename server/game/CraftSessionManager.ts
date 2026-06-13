// ============================================================
// CraftSessionManager — server-authoritative weapon crafting.
//
// A craft is a short Math quiz that produces a weapon (see CRAFTING_DESIGN.md).
// Everything that matters is decided here, never on the client:
//   • the questions + their correct answers (client only ever sees answer text)
//   • whether the player owns the materials (re-checked at completion)
//   • the rolled item's class / tier / rarity (catalyst gates rarity; the quiz
//     score decides whether you actually reach it)
//
// Materials are consumed ONLY on completion: a passing quiz spends metal + any
// catalyst; a failing quiz spends the metal (wasted ore) but RETURNS the
// catalyst, so a rare catalyst is never burned on a botched craft.
// ============================================================

import { randomUUID } from 'crypto';
import type { QuestionEngine } from './QuestionEngine.js';
import type { PlayerManager } from './PlayerManager.js';
import type { InventoryManager } from './InventoryManager.js';
import type { Question, ClientQuestion, InventoryItem } from '../types/index.js';
import { RECIPE_MAP, isAlchemy, type Recipe } from './data/recipes.js';
import { METAL_BY_TIER, REAGENT_BY_TIER, MATERIALS, MAX_TIER } from './data/materials.js';
import {
  rankMultiplier, rankIndex, normaliseRankId, gradeBandForRank, ADVENTURE_RANKS, RANK_MAP,
} from './data/adventureRanks.js';
import {
  rollCraftedItem,
  RARITY_ORDER,
  type Rarity,
} from './data/equipmentGen.js';

export const CRAFT_QUESTION_COUNT = 5;
export const CRAFT_PASS_THRESHOLD = 3;

/** Potion name prefix by tier (1..7) — bigger tier, grander name. */
const QUALITY_WORD = ['Minor', 'Lesser', '', 'Greater', 'Major', 'Superior', 'Supreme'];

/** One-line potion descriptions, parameterised by potency. */
const POTION_DESC: Record<'heal' | 'mana' | 'restore', (p: number) => string> = {
  heal: (p) => `Restores ${p} HP when used.`,
  mana: (p) => `Restores ${p} MP when used.`,
  restore: (p) => `Restores ${p} HP and ${p} MP when used.`,
};

interface MaterialCost {
  materialId: string;
  qty: number;
}

/** A rank-UPGRADE in progress (raises an item's craftRank by one rank on a
 *  passing quiz). Present only on upgrade sessions; absent on normal crafts. */
interface UpgradeInfo {
  itemId: string;
  fromRank: string;
  targetRank: string;
  /** Material cost (the rank delta) — re-checked + consumed at completion. */
  cost: MaterialCost[];
  /** For the result screen. */
  itemName: string;
  itemIcon: string;
  itemRarity: Rarity;
}

interface CraftSession {
  sessionId: string;
  playerId: string;
  /** The recipe being crafted. Absent on upgrade sessions (which mutate an
   *  existing item rather than forging a new one). */
  recipe?: Recipe;
  tier: number;
  /** Catalyst material id chosen for this craft, or null for a common item. */
  catalystId: string | null;
  /** Shuffled questions with remapped correctIndex — kept server-side only. */
  questions: Question[];
  currentIndex: number;
  correctCount: number;
  isComplete: boolean;
  /** Set when this is a rank-upgrade session instead of a craft. */
  upgrade?: UpgradeInfo;
}

/** What a finished craft produced (sent to the client on completion). */
export interface CraftResult {
  /** True when the quiz passed and a weapon was forged. */
  success: boolean;
  score: number;
  total: number;
  /** Present only on success — the freshly forged item (already in the bag),
   *  including its rolled stats so the result screen can show them. */
  item?: {
    name: string;
    icon: string;
    rarity: Rarity;
    /** Rolled gear attributes (absent on potions). */
    attributes?: { type: string; value: number }[];
    /** Weapon base damage range / armor base defense (absent on potions). */
    baseDamage?: { min: number; max: number };
    baseDefense?: number;
    /** Potion effect (absent on gear). */
    potion?: { effect: 'heal' | 'mana' | 'restore'; power: number };
  };
  /** A short server message for the result screen. */
  message: string;
}

export interface CraftAnswerResult {
  correct: boolean;
  explanation: string;
  sessionComplete: boolean;
  nextQuestion?: ClientQuestion;
  /** Present only on the final answer. */
  craft?: CraftResult;
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

export class CraftSessionManager {
  private sessions: Map<string, CraftSession> = new Map();
  /** playerId → sessionId (one active craft per player at a time). */
  private byPlayer: Map<string, string> = new Map();

  constructor(
    private readonly questionEngine: QuestionEngine,
    private readonly playerManager: PlayerManager,
    private readonly inventoryManager: InventoryManager,
  ) {}

  /** The base material (metal or reagent) a recipe spends at a given tier. */
  private baseMaterial(recipe: Recipe, tier: number): string {
    return isAlchemy(recipe.building) ? REAGENT_BY_TIER[tier] : METAL_BY_TIER[tier];
  }

  /**
   * Base-material quantity a recipe costs at the player's current rank. Crafting
   * cost scales with M(currentRank) so a higher-rank player spends more per craft
   * — aligning material sinks with the richer rewards they earn (anti-farming;
   * see docs/ADVENTURE_RANKS_DESIGN.md §1). The catalyst is always a single unit.
   */
  private baseQtyFor(recipe: Recipe, craftRank: string): number {
    return Math.ceil(recipe.materialCost * rankMultiplier(craftRank));
  }

  /** Base material (+ optional catalyst) a recipe/tier/catalyst combination costs. */
  private costFor(recipe: Recipe, tier: number, catalystId: string | null, craftRank: string): MaterialCost[] {
    const costs: MaterialCost[] = [{ materialId: this.baseMaterial(recipe, tier), qty: this.baseQtyFor(recipe, craftRank) }];
    if (catalystId) costs.push({ materialId: catalystId, qty: 1 });
    return costs;
  }

  /**
   * Begin a craft. Validates the recipe, tier, catalyst and that the player can
   * afford the materials (NOT consumed yet — consumed on completion). Picks a
   * quiz from the player's current grade in the recipe's subject.
   */
  startCraft(
    playerId: string,
    recipeId: string,
    tier: number,
    catalystId: string | null,
  ): { session: CraftSession; firstQuestion: ClientQuestion } | { error: string } {
    const recipe = RECIPE_MAP[recipeId];
    if (!recipe) return { error: 'Unknown recipe.' };
    if (!Number.isInteger(tier) || tier < 1 || tier > MAX_TIER) {
      return { error: 'Invalid material tier.' };
    }
    if (catalystId !== null) {
      const cat = MATERIALS[catalystId];
      if (!cat || cat.family !== 'catalyst') return { error: 'That is not a valid catalyst.' };
    }

    const player = this.playerManager.getPlayer(playerId);
    if (!player) return { error: 'You must join before crafting.' };

    const costs = this.costFor(recipe, tier, catalystId, this.playerManager.getAdventureRank(playerId));
    if (!this.playerManager.hasMaterials(playerId, costs)) {
      return { error: 'You do not have the materials for this craft.' };
    }

    // Quiz drawn from the player's ADVENTURE RANK grade band in the recipe's
    // subject (server-authoritative — the client cannot widen its band). The
    // band spans several grades, so questions vary across the whole band rather
    // than being pinned to the (currently frozen) per-subject grade.
    const band = this.playerManager.getRankGradeBand(playerId);
    const questions = this.pickQuestions(recipe.subject, band);
    if (questions.length === 0) {
      return { error: 'No crafting trials are available right now. Try another weapon.' };
    }

    // One craft at a time — drop any prior unfinished craft for this player.
    this.endPlayerSession(playerId);

    const session: CraftSession = {
      sessionId: randomUUID(),
      playerId,
      recipe,
      tier,
      catalystId,
      questions: questions.map(shuffleAnswers),
      currentIndex: 0,
      correctCount: 0,
      isComplete: false,
    };
    this.sessions.set(session.sessionId, session);
    this.byPlayer.set(playerId, session.sessionId);

    return {
      session,
      firstQuestion: this.questionEngine.getClientQuestion(session.questions[0]),
    };
  }

  /**
   * Gather up to CRAFT_QUESTION_COUNT questions for a subject drawn from the
   * player's adventure-rank grade band. Falls back to a NARROWER pool only as a
   * graceful degradation when the band itself has too few authored questions:
   *  1. the full band (preferred),
   *  2. the band's top grade alone,
   *  3. any single in-band grade that has questions.
   * A craft still serves a (possibly shorter) quiz rather than failing outright.
   */
  private pickQuestions(subject: Recipe['subject'], band: { min: number; max: number }): Question[] {
    // Preferred: pooled across the whole rank band.
    const pooled = this.questionEngine.getQuizQuestionsForBand(subject, band.min, band.max, CRAFT_QUESTION_COUNT);
    if (pooled.length >= CRAFT_QUESTION_COUNT) return pooled;

    // Degrade gracefully: try in-band grades top-down for any non-empty pool.
    for (let g = band.max; g >= band.min; g--) {
      const qs = this.questionEngine.getQuizQuestionsForBand(subject, g, g, CRAFT_QUESTION_COUNT);
      if (qs.length > 0) return qs;
    }
    // Last resort — whatever the band yielded (may be 0).
    return pooled;
  }

  /**
   * Submit an answer for the active craft. Validates server-side, advances, and
   * on the final question consumes materials + forges the weapon.
   */
  submitAnswer(
    sessionId: string,
    playerId: string,
    questionId: string,
    answerIndex: number,
  ): CraftAnswerResult | { error: string } {
    const session = this.sessions.get(sessionId);
    if (!session || session.playerId !== playerId) return { error: 'No active craft.' };
    if (session.isComplete) return { error: 'This craft is already finished.' };

    const question = session.questions[session.currentIndex];
    if (!question || question.id !== questionId) {
      return { error: 'That question is not the current one.' };
    }

    const correct = answerIndex === question.correctIndex;
    if (correct) session.correctCount++;
    session.currentIndex++;

    const sessionComplete = session.currentIndex >= session.questions.length;
    if (!sessionComplete) {
      return {
        correct,
        explanation: question.explanation,
        sessionComplete: false,
        nextQuestion: this.questionEngine.getClientQuestion(session.questions[session.currentIndex]),
      };
    }

    session.isComplete = true;
    const craft = session.upgrade ? this.finishUpgrade(session) : this.finishCraft(session);
    this.sessions.delete(sessionId);
    this.byPlayer.delete(playerId);

    return { correct, explanation: question.explanation, sessionComplete: true, craft };
  }

  /** Consume materials and forge (or fail) the weapon. */
  private finishCraft(session: CraftSession): CraftResult {
    const total = session.questions.length;
    const score = session.correctCount;
    const passed = score >= CRAFT_PASS_THRESHOLD;
    const { recipe, tier, catalystId, playerId } = session;
    if (!recipe) return { success: false, score, total, message: 'Nothing could be crafted.' };

    const accuracy = score / total;
    const catalystRarity = catalystId ? MATERIALS[catalystId]?.rarityGate ?? 'common' : 'common';
    const craftRank = this.playerManager.getAdventureRank(playerId);

    if (!passed) {
      // Failed quiz: the base material is wasted, but the catalyst is preserved.
      this.playerManager.consumeMaterials(playerId, [
        { materialId: this.baseMaterial(recipe, tier), qty: this.baseQtyFor(recipe, craftRank) },
      ]);
      this.playerManager.persistProgress(playerId);
      return {
        success: false,
        score,
        total,
        message: `The craft failed — you needed ${CRAFT_PASS_THRESHOLD}/${total}. The base materials were lost, but your catalyst is safe. Keep studying!`,
      };
    }

    // Passed: spend everything. Re-check first (state may have changed mid-quiz).
    const costs = this.costFor(recipe, tier, catalystId, craftRank);
    if (!this.playerManager.consumeMaterials(playerId, costs)) {
      return { success: false, score, total, message: 'Your materials ran out before the craft finished.' };
    }

    const item = recipe.potion
      ? this.brewPotion(recipe, tier, catalystRarity, accuracy, craftRank)
      : this.forgeGear(recipe, tier, catalystRarity, accuracy);
    if (!item) {
      return { success: false, score, total, message: 'Nothing could be crafted from these materials.' };
    }

    // Tag the item with the rank it was crafted at — its power scales by
    // M(min(craftRank, currentRank)).
    item.inv.craftRank = craftRank;
    this.inventoryManager.addItem(playerId, item.inv);
    this.playerManager.persistProgress(playerId);

    return {
      success: true,
      score,
      total,
      item: {
        name: item.label,
        icon: item.inv.icon,
        rarity: item.inv.rarity,
        attributes: item.inv.attributes,
        baseDamage: item.inv.baseDamage,
        baseDefense: item.inv.baseDefense,
        potion: item.inv.potion,
      },
      message: accuracy >= 0.8
        ? `Masterwork! ${item.success}`
        : `${item.success} A cleaner quiz would yield an even finer result.`,
    };
  }

  /**
   * Forge a weapon/armor item by ROLLING it at craft time (server-side). The
   * catalyst sets the MAX rarity; quiz accuracy can downgrade it and also nudges
   * the stat magnitudes within the band. The rolled attributes/slot/xpRequired
   * live on the item instance — they are the authoritative stat source.
   */
  private forgeGear(recipe: Recipe, tier: number, maxRarity: Rarity, accuracy: number):
    { inv: InventoryItem; label: string; success: string } | null {
    const steps = accuracy >= 0.8 ? 0 : accuracy >= 0.6 ? 1 : 2;
    const rarity = RARITY_ORDER[Math.max(0, RARITY_ORDER.indexOf(maxRarity) - steps)];
    const slot = recipe.weaponClass ? 'weapon' : recipe.armorSlot;
    if (!slot) return null;

    const rolled = rollCraftedItem({
      slot,
      cls: recipe.weaponClass ?? null,
      rarity,
      tier,
      quizQuality: accuracy,
    });
    return {
      inv: {
        id: randomUUID(),
        itemType: `gear_${slot}`, // descriptive; gear is non-stackable so it need not be unique
        name: rolled.name,
        description: rolled.description,
        rarity: rolled.rarity,
        stats: {},
        quantity: 1,
        stackable: false,
        icon: rolled.icon,
        equipSlot: rolled.slot,
        attributes: rolled.attributes,
        xpRequired: rolled.xpRequired,
        requiredLevel: rolled.requiredLevel,
        baseDamage: rolled.baseDamage,
        baseDefense: rolled.baseDefense,
        recipeId: recipe.id,
        craftTier: tier,
      },
      label: rolled.name,
      success: `You crafted a ${rolled.rarity} ${rolled.name}.`,
    };
  }

  /**
   * Brew a stackable potion. Reagent TIER sets base potency; the catalyst (via
   * achieved rarity) multiplies it. Identical potions stack by itemType. Combat
   * auto-use is wired separately (folded into the Strategy loadout).
   */
  private brewPotion(recipe: Recipe, tier: number, maxRarity: Rarity, accuracy: number, craftRank: string):
    { inv: InventoryItem; label: string; success: string } | null {
    const effect = recipe.potion!;
    // Accuracy can downgrade the achieved rarity below the catalyst's gate.
    const steps = accuracy >= 0.8 ? 0 : accuracy >= 0.6 ? 1 : 2;
    const rarity = RARITY_ORDER[Math.max(0, RARITY_ORDER.indexOf(maxRarity) - steps)];
    const rarityMult = 1 + RARITY_ORDER.indexOf(rarity) * 0.5; // common 1× … legendary 3×
    const power = Math.round(25 * tier * rarityMult);
    const qty = 2 + (accuracy >= 0.8 ? 1 : 0); // a clean brew yields an extra dose

    const prefix = QUALITY_WORD[Math.min(QUALITY_WORD.length - 1, tier - 1)];
    const name = `${prefix} ${recipe.name}`.trim();
    return {
      inv: {
        id: randomUUID(),
        // Stable type so identical potions stack in the bag. Rank is part of the
        // key so potions of different craft ranks (different scaled power) don't
        // merge into one stack.
        itemType: `potion_${effect}_t${tier}_${rarity}_${craftRank}`,
        name,
        description: POTION_DESC[effect](power),
        rarity,
        stats: {},
        quantity: qty,
        stackable: true,
        icon: recipe.icon,
        potion: { effect, power },
      },
      label: name,
      success: `You brewed ${qty}× ${rarity} ${name} (restores ${power}).`,
    };
  }

  // ── Rank upgrade (gear only) ───────────────────────────────────────────────

  /**
   * Material cost to raise `item` from `fromRank` to `targetRank`: the recipe's
   * base cost times the rank-multiplier DELTA, spent in the item's material tier.
   * Because the deltas telescope across single steps, crafting low + upgrading up
   * costs the same total materials as crafting at the high rank directly.
   * Gear is always forged from metal (only potions use reagent, and potions are
   * not upgradeable).
   */
  private upgradeCostFor(item: InventoryItem, fromRank: string, targetRank: string): MaterialCost[] {
    const recipe = item.recipeId ? RECIPE_MAP[item.recipeId] : undefined;
    const baseCost = recipe?.materialCost ?? 3;
    const tier = Math.max(1, Math.min(MAX_TIER, item.craftTier ?? 1));
    const delta = rankMultiplier(targetRank) - rankMultiplier(fromRank);
    const qty = Math.max(1, Math.ceil(baseCost * delta));
    return [{ materialId: METAL_BY_TIER[tier], qty }];
  }

  /**
   * Begin a rank upgrade for an owned gear item. Validates ownership, that the
   * item is upgradeable gear (not a potion, not already at the top rank), and
   * that the player can afford the delta materials (NOT consumed until the quiz
   * passes). The quiz is drawn from the TARGET rank's grade band — you must
   * answer rank-appropriate questions to earn the higher rank.
   */
  startUpgrade(
    playerId: string,
    itemId: string,
  ): { session: CraftSession; firstQuestion: ClientQuestion } | { error: string } {
    const player = this.playerManager.getPlayer(playerId);
    if (!player) return { error: 'You must join before upgrading.' };

    const item = this.inventoryManager.findItem(playerId, itemId);
    if (!item) return { error: 'You do not own that item.' };
    if (item.potion || !item.equipSlot) {
      return { error: 'Only weapons and armor can be upgraded.' };
    }

    const fromRank = normaliseRankId(item.craftRank);
    const fi = rankIndex(fromRank);
    if (fi >= ADVENTURE_RANKS.length - 1) {
      return { error: 'This item is already at the highest rank.' };
    }
    const targetRank = ADVENTURE_RANKS[fi + 1].id;

    const cost = this.upgradeCostFor(item, fromRank, targetRank);
    if (!this.playerManager.hasMaterials(playerId, cost)) {
      const need = cost.map((c) => `${c.qty}× ${MATERIALS[c.materialId]?.name ?? c.materialId}`).join(', ');
      return { error: `You need ${need} to upgrade this item.` };
    }

    // Quiz from the TARGET rank's band, in the item's original subject.
    const recipe = item.recipeId ? RECIPE_MAP[item.recipeId] : undefined;
    const subject = recipe?.subject ?? 'math';
    const band = gradeBandForRank(targetRank);
    const questions = this.pickQuestions(subject, band);
    if (questions.length === 0) {
      return { error: 'No upgrade trials are available right now. Try again later.' };
    }

    this.endPlayerSession(playerId);
    const session: CraftSession = {
      sessionId: randomUUID(),
      playerId,
      tier: item.craftTier ?? 1,
      catalystId: null,
      questions: questions.map(shuffleAnswers),
      currentIndex: 0,
      correctCount: 0,
      isComplete: false,
      upgrade: {
        itemId, fromRank, targetRank, cost,
        itemName: item.name, itemIcon: item.icon, itemRarity: item.rarity,
      },
    };
    this.sessions.set(session.sessionId, session);
    this.byPlayer.set(playerId, session.sessionId);

    return {
      session,
      firstQuestion: this.questionEngine.getClientQuestion(session.questions[0]),
    };
  }

  /** Consume the delta materials and apply (or fail) the rank upgrade. */
  private finishUpgrade(session: CraftSession): CraftResult {
    const total = session.questions.length;
    const score = session.correctCount;
    const passed = score >= CRAFT_PASS_THRESHOLD;
    const { playerId, upgrade } = session;
    if (!upgrade) return { success: false, score, total, message: 'Nothing to upgrade.' };

    if (!passed) {
      // Failed quiz: the materials are lost (matches a failed craft).
      this.playerManager.consumeMaterials(playerId, upgrade.cost);
      this.playerManager.persistProgress(playerId);
      return {
        success: false,
        score,
        total,
        message: `The upgrade failed — you needed ${CRAFT_PASS_THRESHOLD}/${total}. The materials were lost. Keep studying!`,
      };
    }

    // Passed: re-check materials (state may have changed mid-quiz), then apply.
    if (!this.playerManager.consumeMaterials(playerId, upgrade.cost)) {
      return { success: false, score, total, message: 'Your materials ran out before the upgrade finished.' };
    }
    if (!this.inventoryManager.setItemCraftRank(playerId, upgrade.itemId, upgrade.targetRank)) {
      return { success: false, score, total, message: 'That item could not be found to upgrade.' };
    }
    this.playerManager.persistProgress(playerId);

    return {
      success: true,
      score,
      total,
      item: { name: upgrade.itemName, icon: upgrade.itemIcon, rarity: upgrade.itemRarity },
      message: `Upgrade complete! ${upgrade.itemName} is now rank ${RANK_MAP[upgrade.targetRank]?.name ?? upgrade.targetRank}.`,
    };
  }

  getSession(sessionId: string): CraftSession | undefined {
    return this.sessions.get(sessionId);
  }

  /** Drop a player's active craft (e.g. on disconnect). */
  endPlayerSession(playerId: string): void {
    const id = this.byPlayer.get(playerId);
    if (id) this.sessions.delete(id);
    this.byPlayer.delete(playerId);
  }
}
