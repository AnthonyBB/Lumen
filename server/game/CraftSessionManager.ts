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
import { TOPICS_BY_SUBJECT_GRADE } from './data/curriculum.js';
import { RECIPE_MAP, type Recipe } from './data/recipes.js';
import { METAL_BY_TIER, MATERIALS, MAX_TIER } from './data/materials.js';
import {
  EQUIPMENT_MAP,
  RARITY_ORDER,
  type EquipmentItem,
  type Rarity,
} from './data/equipmentGen.js';

export const CRAFT_QUESTION_COUNT = 5;
export const CRAFT_PASS_THRESHOLD = 3;

interface MaterialCost {
  materialId: string;
  qty: number;
}

interface CraftSession {
  sessionId: string;
  playerId: string;
  recipe: Recipe;
  tier: number;
  /** Catalyst material id chosen for this craft, or null for a common item. */
  catalystId: string | null;
  /** Shuffled questions with remapped correctIndex — kept server-side only. */
  questions: Question[];
  currentIndex: number;
  correctCount: number;
  isComplete: boolean;
}

/** What a finished craft produced (sent to the client on completion). */
export interface CraftResult {
  /** True when the quiz passed and a weapon was forged. */
  success: boolean;
  score: number;
  total: number;
  /** Present only on success — the freshly forged item (already in the bag). */
  item?: { name: string; icon: string; rarity: Rarity };
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

  /** Metal (+ optional catalyst) a recipe/tier/catalyst combination costs. */
  private costFor(recipe: Recipe, tier: number, catalystId: string | null): MaterialCost[] {
    const costs: MaterialCost[] = [{ materialId: METAL_BY_TIER[tier], qty: recipe.metalCost }];
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

    const costs = this.costFor(recipe, tier, catalystId);
    if (!this.playerManager.hasMaterials(playerId, costs)) {
      return { error: 'You do not have the materials for this craft.' };
    }

    // Quiz drawn from the player's CURRENT grade in the recipe's subject so the
    // craft difficulty always tracks the learner (adaptive). Fall back down the
    // grades if the current grade's topics have no authored questions yet.
    const grade = player.subjectGrades[recipe.subject];
    const questions = this.pickQuestions(recipe, grade);
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

  /** Gather up to CRAFT_QUESTION_COUNT questions for a subject at/under a grade. */
  private pickQuestions(recipe: Recipe, grade: number): Question[] {
    for (let g = grade; g >= 1; g--) {
      const topics = TOPICS_BY_SUBJECT_GRADE[recipe.subject]?.[g] ?? [];
      // Shuffle the grade's topics so repeated crafts vary their subject matter.
      const order = [...topics].sort(() => Math.random() - 0.5);
      for (const topic of order) {
        const qs = this.questionEngine.getQuizQuestions(topic.id, CRAFT_QUESTION_COUNT);
        if (qs.length >= CRAFT_QUESTION_COUNT) return qs;
      }
    }
    return [];
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
    const craft = this.finishCraft(session);
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

    if (!passed) {
      // Failed quiz: the metal is wasted, but the catalyst is preserved.
      this.playerManager.consumeMaterials(playerId, [
        { materialId: METAL_BY_TIER[tier], qty: recipe.metalCost },
      ]);
      this.playerManager.persistProgress(playerId);
      return {
        success: false,
        score,
        total,
        message: `The forge sputtered — you needed ${CRAFT_PASS_THRESHOLD}/${total}. The ore was lost, but your catalyst is safe. Keep studying!`,
      };
    }

    // Passed: spend everything. Re-check first (state may have changed mid-quiz).
    const costs = this.costFor(recipe, tier, catalystId);
    if (!this.playerManager.consumeMaterials(playerId, costs)) {
      return { success: false, score, total, message: 'Your materials ran out before the craft finished.' };
    }

    const catalystRarity = catalystId ? MATERIALS[catalystId]?.rarityGate ?? 'common' : 'common';
    const accuracy = score / total;
    const rolled = this.rollItem(recipe, tier, catalystRarity, accuracy);
    if (!rolled) {
      return { success: false, score, total, message: 'No matching item could be crafted. Materials refunded.' };
    }

    const item: InventoryItem = {
      id: randomUUID(),
      itemType: rolled.id, // eq_NNNN — EQUIPMENT_MAP key for equip/stat lookups
      name: rolled.name,
      description: rolled.description,
      rarity: rolled.rarity,
      stats: {},
      quantity: 1,
      stackable: false,
      icon: rolled.icon,
    };
    this.inventoryManager.addItem(playerId, item);
    this.playerManager.persistProgress(playerId);

    return {
      success: true,
      score,
      total,
      item: { name: rolled.name, icon: rolled.icon, rarity: rolled.rarity },
      message: accuracy >= 0.8
        ? `Masterwork! You crafted a ${rolled.rarity} ${rolled.name}.`
        : `You crafted a ${rolled.rarity} ${rolled.name}. A cleaner quiz would temper a finer piece.`,
    };
  }

  /**
   * Pick an item from EQUIPMENT_MAP matching the recipe (a weapon of its class,
   * or armor of its slot) at the achieved rarity. The catalyst sets the MAX
   * rarity; quiz accuracy can downgrade it. Within the matching pool the metal
   * TIER selects the item-level band (by xpRequired).
   */
  private rollItem(
    recipe: Recipe,
    tier: number,
    maxRarity: Rarity,
    accuracy: number,
  ): EquipmentItem | null {
    const steps = accuracy >= 0.8 ? 0 : accuracy >= 0.6 ? 1 : 2;
    const targetIdx = Math.max(0, RARITY_ORDER.indexOf(maxRarity) - steps);

    // Weapon recipes match a class on the 'weapon' slot; armor recipes match the
    // recipe's slot (any class).
    const matches = (it: EquipmentItem): boolean =>
      recipe.weaponClass
        ? it.slot === 'weapon' && it.classes.includes(recipe.weaponClass)
        : it.slot === recipe.armorSlot;

    // Try the achieved rarity, then fall back to the nearest lower rarity in stock.
    for (let i = targetIdx; i >= 0; i--) {
      const pool = Object.values(EQUIPMENT_MAP).filter(
        (it) => matches(it) && it.rarity === RARITY_ORDER[i],
      );
      if (pool.length === 0) continue;
      pool.sort((a, b) => a.xpRequired - b.xpRequired);
      // Map tier 1..MAX_TIER onto the sorted pool so higher tier = higher level.
      const band = Math.floor(((tier - 1) / (MAX_TIER - 1)) * (pool.length - 1));
      return pool[Math.min(pool.length - 1, Math.max(0, band))];
    }
    return null;
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
