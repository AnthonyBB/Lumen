// ============================================================
// recipes.ts — Forge weapon recipes (server source of truth).
//
// The Forge crafts WEAPONS from metal (+ an optional rarity catalyst) by
// answering a short Math quiz (see docs/CRAFTING_DESIGN.md):
//   • which weapon you forge  → a recipe (maps to an equipment class)
//   • the item LEVEL band      → the metal TIER you spend
//   • the max RARITY           → the catalyst you spend (none = common)
//   • whether you reach it     → your quiz accuracy
//
// Each recipe is themed around a Math topic; the live quiz draws from the
// player's CURRENT math grade so difficulty always tracks the learner.
// ============================================================

import type { SkillClass } from './equipmentGen.js';
import type { Subject } from '../../types/index.js';

export interface WeaponRecipe {
  /** Stable recipe id, e.g. 'forge_sword'. */
  id: string;
  /** Display name of the weapon family. */
  name: string;
  /** Equipment class the rolled weapon is drawn from (EQUIPMENT_MAP.classes). */
  weaponClass: SkillClass;
  /** Subject whose quiz gates the craft (the Forge is Math). */
  subject: Subject;
  /** Flavour topic shown in the UI (the live quiz uses the player's grade). */
  topicHint: string;
  /** Single emoji shown on the recipe card. */
  icon: string;
  /** Metal units consumed (at the chosen tier) per craft. */
  metalCost: number;
}

export const WEAPON_RECIPES: WeaponRecipe[] = [
  { id: 'forge_sword',  name: 'Sword',     weaponClass: 'sword',     subject: 'math', topicHint: 'Geometry',       icon: '🗡️', metalCost: 3 },
  { id: 'forge_hammer', name: 'Warhammer', weaponClass: 'hammer',    subject: 'math', topicHint: 'Measurement',    icon: '🔨', metalCost: 3 },
  { id: 'forge_spear',  name: 'Spear',     weaponClass: 'spear',     subject: 'math', topicHint: 'Fractions',      icon: '🔱', metalCost: 3 },
  { id: 'forge_axe',    name: 'Axe',       weaponClass: 'axe',       subject: 'math', topicHint: 'Multiplication', icon: '⚔️', metalCost: 3 },
  { id: 'forge_staff',  name: 'Staff',     weaponClass: 'fire_mage', subject: 'math', topicHint: 'Algebra',        icon: '🔮', metalCost: 3 },
];

export const RECIPE_MAP: Record<string, WeaponRecipe> = Object.fromEntries(
  WEAPON_RECIPES.map((r) => [r.id, r]),
);
