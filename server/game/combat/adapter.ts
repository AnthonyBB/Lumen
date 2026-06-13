// ============================================================
// adapter.ts — bridges roster data into the combat resolver.
//
// Turns a party Character (+ its equipment) and campaign mobs into the resolver's
// CombatantInputs: derives stats, scales each skill's magnitudes by its rank AND
// the account's adventure rank, derives the weapon basic attack, and resolves the
// character's strategy loadout. Mob HP/attack scale by M(currentRank) to match
// the live combat scaling. Pure — used by both live and idle resolution.
// ============================================================

import type { Character, EquipmentSlots, InventoryItem } from '../../types/index.js';
import { deriveCombatStats, SKILL_RANK_BONUS } from '../PlayerManager.js';
import { rankMultiplier, effectiveRankMultiplier, DEFAULT_RANK_ID } from '../data/adventureRanks.js';
import { SKILL_TREES, type CombatSkill, type EffectType } from '../data/skillTrees.js';
import { STRATEGIES, type CombatStrategy } from '../data/combatStrategies.js';
import type { CombatantInput, ResolverSkill } from './resolver.js';

const SKILL_MAP: ReadonlyMap<string, CombatSkill> = new Map(
  SKILL_TREES.flatMap((tree) => tree.skills.map((s) => [s.id, s] as const)),
);
const STRATEGY_MAP: ReadonlyMap<string, CombatStrategy> = new Map(
  STRATEGIES.map((s) => [s.id, s] as const),
);

/** Effect types whose flat magnitude scales with skill rank + adventure rank
 *  (mirror of the client BattleScene's SCALED_EFFECT_TYPES). */
const SCALED_EFFECT_TYPES = new Set<EffectType>([
  'damage', 'aoe', 'heal', 'dot', 'bleed', 'poison', 'shield', 'hot',
]);

/** Combat power multiplier for a skill at `rank` (rank 0/1 = 1×). */
function skillRankMultiplier(rank: number): number {
  return 1 + Math.max(0, rank - 1) * SKILL_RANK_BONUS;
}

/** Build a rank- + adventure-scaled resolver skill, or null if unknown. */
function buildResolverSkill(skillId: string, rank: number, currentRank: string): ResolverSkill | null {
  const cs = SKILL_MAP.get(skillId);
  if (!cs) return null;
  const mult = rankMultiplier(currentRank) * skillRankMultiplier(rank);
  const effects = cs.effects.map((e) =>
    SCALED_EFFECT_TYPES.has(e.type) ? { ...e, value: Math.max(1, Math.round(e.value * mult)) } : e);
  return { id: cs.id, name: cs.name, effects, mpCost: cs.mpCost };
}

/** Weapon basic-attack range, scaled by M(min(weaponCraftRank, currentRank)). */
function weaponBasicAttack(weapon: InventoryItem | undefined, currentRank: string): { min: number; max: number } {
  const bd = weapon?.baseDamage;
  if (!bd) return { min: 5, max: 9 }; // bare-fists default
  const m = effectiveRankMultiplier(weapon?.craftRank ?? DEFAULT_RANK_ID, currentRank);
  return { min: Math.max(1, Math.round(bd.min * m)), max: Math.max(2, Math.round(bd.max * m)) };
}

function resolveStrategies(ids: string[]): CombatStrategy[] {
  return ids.map((id) => STRATEGY_MAP.get(id)).filter((s): s is CombatStrategy => !!s);
}

/** Build an ALLY combatant from a roster character + its equipment. */
export function buildAllyCombatant(
  character: Character,
  equipment: EquipmentSlots,
  currentRank: string,
): CombatantInput {
  const stats = deriveCombatStats(character, equipment, currentRank);
  const skills: ResolverSkill[] = [];
  for (const [id, rank] of Object.entries(character.skillRanks)) {
    if (rank >= 1) {
      const s = buildResolverSkill(id, rank, currentRank);
      if (s) skills.push(s);
    }
  }
  return {
    id: character.id,
    name: character.name,
    side: 'ally',
    maxHp: stats.maxHp,
    attack: stats.attack,
    defense: stats.defense,
    speed: stats.speed,
    maxMana: stats.maxMana,
    healingPower: stats.healing,
    basicAttack: weaponBasicAttack(equipment.mainHand, currentRank),
    skills,
    strategy: resolveStrategies(character.strategyLoadout),
  };
}

/** A campaign mob as the server knows it (pre-rank-scaling). */
export interface MobInput {
  id: string;
  name: string;
  maxHp: number;
  attack: number;
  defense?: number;
  speed?: number;
  boss?: boolean;
}

/** Build an ENEMY combatant from a mob, scaling HP/attack by M(currentRank). */
export function buildEnemyCombatant(mob: MobInput, currentRank: string): CombatantInput {
  const m = rankMultiplier(currentRank);
  const hp = Math.max(1, Math.round(mob.maxHp * m));
  const atk = Math.max(1, Math.round(mob.attack * m));
  return {
    id: mob.id,
    name: mob.name,
    side: 'enemy',
    maxHp: hp,
    attack: atk,
    defense: mob.defense ?? 0,
    speed: mob.speed ?? 10,
    maxMana: 0,
    healingPower: 0,
    basicAttack: { min: atk, max: Math.round(atk * 1.25) },
    skills: [],
    strategy: [],
    boss: mob.boss,
  };
}
