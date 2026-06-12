// ============================================================
// recipes.ts — crafting recipes (server source of truth).
//
// A recipe turns metal (+ an optional rarity catalyst) into a piece of gear by
// answering a short quiz (see docs/CRAFTING_DESIGN.md). Each crafting building
// owns a subject:
//   • The Forge  → weapons, gated by MATH
//   • The Armory → armor,   gated by SCIENCE
// The metal TIER sets the item-level band; the catalyst sets max RARITY; the
// quiz accuracy decides whether you actually reach it.
// ============================================================

import type { SkillClass, EquipSlot } from './equipmentGen.js';
import type { Subject } from '../../types/index.js';

export type CraftBuilding = 'forge' | 'armory';

export interface Recipe {
  /** Stable recipe id, e.g. 'forge_sword' / 'armory_helm'. */
  id: string;
  /** Display name of the gear family. */
  name: string;
  /** Which building crafts this (also picks the subject + UI). */
  building: CraftBuilding;
  /** Subject whose quiz gates the craft. */
  subject: Subject;
  /** Flavour topic shown in the UI (the live quiz uses the player's grade). */
  topicHint: string;
  /** Single emoji shown on the recipe card. */
  icon: string;
  /** Metal units consumed (at the chosen tier) per craft. */
  metalCost: number;
  /** Weapon recipes roll from this equipment class (slot = 'weapon'). */
  weaponClass?: SkillClass;
  /** Armor recipes roll from this equipment slot (any class). */
  armorSlot?: Exclude<EquipSlot, 'weapon'>;
}

export const RECIPES: Recipe[] = [
  // ── The Forge — weapons → Math ──────────────────────────────────────────
  { id: 'forge_sword',  name: 'Sword',     building: 'forge',  subject: 'math',    topicHint: 'Geometry',       icon: '🗡️', metalCost: 3, weaponClass: 'sword' },
  { id: 'forge_hammer', name: 'Warhammer', building: 'forge',  subject: 'math',    topicHint: 'Measurement',    icon: '🔨', metalCost: 3, weaponClass: 'hammer' },
  { id: 'forge_spear',  name: 'Spear',     building: 'forge',  subject: 'math',    topicHint: 'Fractions',      icon: '🔱', metalCost: 3, weaponClass: 'spear' },
  { id: 'forge_axe',    name: 'Axe',       building: 'forge',  subject: 'math',    topicHint: 'Multiplication', icon: '⚔️', metalCost: 3, weaponClass: 'axe' },
  { id: 'forge_staff',  name: 'Staff',     building: 'forge',  subject: 'math',    topicHint: 'Algebra',        icon: '🔮', metalCost: 3, weaponClass: 'fire_mage' },

  // ── The Armory — armor → Science ────────────────────────────────────────
  { id: 'armory_helm',     name: 'Helmet',    building: 'armory', subject: 'science', topicHint: 'Forces & Impact',  icon: '⛑️', metalCost: 3, armorSlot: 'helmet' },
  { id: 'armory_chest',    name: 'Chestplate', building: 'armory', subject: 'science', topicHint: 'Materials',        icon: '🛡️', metalCost: 4, armorSlot: 'chest' },
  { id: 'armory_legs',     name: 'Greaves',   building: 'armory', subject: 'science', topicHint: 'Energy',           icon: '👖', metalCost: 3, armorSlot: 'legs' },
  { id: 'armory_boots',    name: 'Boots',     building: 'armory', subject: 'science', topicHint: 'Anatomy & Fit',    icon: '🥾', metalCost: 2, armorSlot: 'boots' },
  { id: 'armory_gloves',   name: 'Gauntlets', building: 'armory', subject: 'science', topicHint: 'Anatomy & Fit',    icon: '🧤', metalCost: 2, armorSlot: 'gloves' },
];

export const RECIPE_MAP: Record<string, Recipe> = Object.fromEntries(
  RECIPES.map((r) => [r.id, r]),
);
