// ============================================================
// classStats.ts — per-class BASE attribute profiles.
//
// Every class starts from a themed spread of the five attributes that sums to
// the same budget (25) as the old flat 5×5 — so classes feel distinct without
// being unbalanced. Players still earn level*POINTS_PER_LEVEL points to allocate
// on top of these bases. This is the authoritative source; the client mirrors it
// (src/game/data/classStats.ts) for the recruiter display only.
// ============================================================

import type { AttributeKey } from '../../types/index.js';

/** Total base budget per class (matches the legacy 5 per attribute × 5). */
export const CLASS_BASE_BUDGET = 25;

/** classId → base value per attribute (sums to CLASS_BASE_BUDGET). */
export const CLASS_BASE_ATTRS: Record<string, Record<AttributeKey, number>> = {
  // Melee damage — Strength/Constitution leaning.
  sword:          { strength: 8, constitution: 7, dexterity: 5, intelligence: 2, spirit: 3 },
  spear:          { strength: 7, constitution: 6, dexterity: 7, intelligence: 2, spirit: 3 },
  axe:            { strength: 9, constitution: 6, dexterity: 4, intelligence: 2, spirit: 4 },
  // Tanks — Constitution/Strength leaning.
  hammer:         { strength: 8, constitution: 8, dexterity: 3, intelligence: 2, spirit: 4 },
  paladin:        { strength: 6, constitution: 9, dexterity: 3, intelligence: 3, spirit: 4 },
  // Agile / hybrid.
  monk:           { strength: 6, constitution: 5, dexterity: 8, intelligence: 2, spirit: 4 },
  assassin:       { strength: 6, constitution: 3, dexterity: 10, intelligence: 3, spirit: 3 },
  bard:           { strength: 4, constitution: 5, dexterity: 6, intelligence: 4, spirit: 6 },
  // Casters — Intelligence leaning.
  fire_mage:      { strength: 3, constitution: 4, dexterity: 4, intelligence: 10, spirit: 4 },
  ice_mage:       { strength: 3, constitution: 5, dexterity: 4, intelligence: 9, spirit: 4 },
  lightning_mage: { strength: 3, constitution: 4, dexterity: 5, intelligence: 9, spirit: 4 },
  // Healers / support — Spirit leaning.
  cleric:         { strength: 2, constitution: 5, dexterity: 3, intelligence: 6, spirit: 9 },
  shaman:         { strength: 3, constitution: 5, dexterity: 4, intelligence: 6, spirit: 7 },
};

/** Flat fallback (5 each) for any class without a profile — preserves the old
 *  behaviour and keeps the budget intact. */
const FALLBACK: Record<AttributeKey, number> = {
  strength: 5, constitution: 5, dexterity: 5, intelligence: 5, spirit: 5,
};

/** Base value of a single attribute for a class at level 1 (before gear). */
export function classBaseAttr(cls: string, attr: AttributeKey): number {
  return CLASS_BASE_ATTRS[cls]?.[attr] ?? FALLBACK[attr];
}

/** Attribute points gained per level — auto-distributed by the class's profile,
 *  NOT assignable by the player (docs/CHARACTERS_DESIGN.md). */
export const ATTR_POINTS_PER_LEVEL = 5;

/**
 * A class's attribute value at a given level. The whole class profile scales up
 * proportionally with level: each level adds ATTR_POINTS_PER_LEVEL total points,
 * spread by the class's base ratios (the profile sums to CLASS_BASE_BUDGET). So a
 * level-6 hero has roughly double its level-1 profile, keeping its class identity.
 */
export function classScaledAttr(cls: string, attr: AttributeKey, level: number): number {
  const lv = Math.max(1, Math.floor(level));
  const growth = ((lv - 1) * ATTR_POINTS_PER_LEVEL) / CLASS_BASE_BUDGET;
  return Math.round(classBaseAttr(cls, attr) * (1 + growth));
}
