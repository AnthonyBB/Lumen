// ============================================================
// recipes.ts — crafting recipes (server source of truth).
//
// A recipe turns base materials (+ an optional rarity catalyst) into gear or a
// potion by answering a short quiz (see docs/CRAFTING_DESIGN.md). Each crafting
// building owns a subject and a base material:
//   • The Forge      → weapons, gated by MATH,    spends METAL
//   • The Armory     → armor,   gated by SCIENCE,  spends METAL
//   • The Alchemy Lab→ potions, gated by SCIENCE,  spends REAGENTS
// The material TIER sets potency/level; the catalyst sets max RARITY; the quiz
// accuracy decides whether you actually reach it.
// ============================================================

import type { SkillClass, EquipSlot } from './equipmentGen.js';
import type { Subject } from '../../types/index.js';

export type CraftBuilding = 'forge' | 'armory' | 'alchemy';

/** What a potion does when used (combat use is wired separately). */
export type PotionEffect = 'heal' | 'mana' | 'restore';

export interface Recipe {
  /** Stable recipe id, e.g. 'forge_sword' / 'armory_helm' / 'brew_healing'. */
  id: string;
  /** Display name of the crafted thing. */
  name: string;
  /** Which building crafts this (also picks the subject + base material + UI). */
  building: CraftBuilding;
  /** Subject whose quiz gates the craft. */
  subject: Subject;
  /** Flavour topic shown in the UI (the live quiz uses the player's grade). */
  topicHint: string;
  /** Single emoji shown on the recipe card / item. */
  icon: string;
  /** Base-material units consumed (at the chosen tier) per craft. */
  materialCost: number;
  /** Weapon recipes roll from this equipment class (slot = 'weapon'). */
  weaponClass?: SkillClass;
  /** Armor recipes roll from this equipment slot (any class). */
  armorSlot?: Exclude<EquipSlot, 'weapon'>;
  /** Potion recipes brew this effect instead of rolling gear. */
  potion?: PotionEffect;
}

export const RECIPES: Recipe[] = [
  // ── The Forge — weapons → Math (metal) ──────────────────────────────────
  { id: 'forge_sword',  name: 'Sword',     building: 'forge',  subject: 'math',    topicHint: 'Geometry',       icon: '🗡️', materialCost: 3, weaponClass: 'sword' },
  { id: 'forge_hammer', name: 'Warhammer', building: 'forge',  subject: 'math',    topicHint: 'Measurement',    icon: '🔨', materialCost: 3, weaponClass: 'hammer' },
  { id: 'forge_spear',  name: 'Spear',     building: 'forge',  subject: 'math',    topicHint: 'Fractions',      icon: '🔱', materialCost: 3, weaponClass: 'spear' },
  { id: 'forge_axe',    name: 'Axe',       building: 'forge',  subject: 'math',    topicHint: 'Multiplication', icon: '⚔️', materialCost: 3, weaponClass: 'axe' },
  { id: 'forge_staff',  name: 'Staff',     building: 'forge',  subject: 'math',    topicHint: 'Algebra',        icon: '🔮', materialCost: 3, weaponClass: 'fire_mage' },

  // ── The Armory — armor → Science (metal) ────────────────────────────────
  { id: 'armory_helm',     name: 'Helmet',     building: 'armory', subject: 'science', topicHint: 'Forces & Impact',  icon: '⛑️', materialCost: 3, armorSlot: 'helmet' },
  { id: 'armory_chest',    name: 'Chestplate', building: 'armory', subject: 'science', topicHint: 'Materials',        icon: '🛡️', materialCost: 4, armorSlot: 'chest' },
  { id: 'armory_legs',     name: 'Greaves',    building: 'armory', subject: 'science', topicHint: 'Energy',           icon: '👖', materialCost: 3, armorSlot: 'legs' },
  { id: 'armory_boots',    name: 'Boots',      building: 'armory', subject: 'science', topicHint: 'Anatomy & Fit',    icon: '🥾', materialCost: 2, armorSlot: 'boots' },
  { id: 'armory_gloves',   name: 'Gauntlets',  building: 'armory', subject: 'science', topicHint: 'Anatomy & Fit',    icon: '🧤', materialCost: 2, armorSlot: 'gloves' },

  // ── The Alchemy Lab — potions → Science (reagents) ──────────────────────
  { id: 'brew_healing', name: 'Healing Potion',      building: 'alchemy', subject: 'science', topicHint: 'Biology',        icon: '❤️', materialCost: 2, potion: 'heal' },
  { id: 'brew_mana',    name: 'Mana Potion',         building: 'alchemy', subject: 'science', topicHint: 'Chemistry',      icon: '🔷', materialCost: 2, potion: 'mana' },
  { id: 'brew_rejuv',   name: 'Rejuvenation Potion', building: 'alchemy', subject: 'science', topicHint: 'Biology & Chem', icon: '💧', materialCost: 3, potion: 'restore' },
];

export const RECIPE_MAP: Record<string, Recipe> = Object.fromEntries(
  RECIPES.map((r) => [r.id, r]),
);

/** The base-material ladder a building spends (metals vs reagents). */
export function isAlchemy(building: CraftBuilding): boolean {
  return building === 'alchemy';
}
