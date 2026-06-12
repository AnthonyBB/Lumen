// ============================================================
// equipmentGen.ts — equipment display types (client).
//
// Gear is no longer a fixed catalog. Items are ROLLED at craft time on the
// server (see server/game/data/equipmentGen.ts → rollCraftedItem) and carry
// their own attributes/slot on the persisted instance. The client only needs
// the shared types + the attribute list for the market filter; it never
// generates or looks up items by id anymore.
// ============================================================

export type EquipSlot =
  | 'weapon' | 'helmet' | 'chest' | 'legs'
  | 'boots' | 'gloves' | 'ring' | 'amulet'

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'

export type AttributeType =
  | 'constitution' | 'intelligence' | 'dexterity' | 'strength' | 'spirit'
  | 'damage_bonus'
  | 'healing_bonus'
  | 'mp_regen'
  | 'hp_regen'
  | 'fire_damage' | 'ice_damage' | 'lightning_damage' | 'holy_damage' | 'nature_damage'
  | 'crit_chance'
  | 'dot_bonus'
  | 'aoe_bonus'
  | 'gold_find'
  | 'debuff_resist'

/** All gear attribute/bonus types, in display order. Single source of truth for
 *  the market's attribute filter (client UI + server validation). */
export const ATTRIBUTE_TYPES: AttributeType[] = [
  'constitution', 'intelligence', 'dexterity', 'strength', 'spirit',
  'damage_bonus', 'healing_bonus', 'mp_regen', 'hp_regen',
  'fire_damage', 'ice_damage', 'lightning_damage', 'holy_damage', 'nature_damage',
  'crit_chance', 'dot_bonus', 'aoe_bonus', 'gold_find', 'debuff_resist',
]

export interface ItemAttribute {
  type: AttributeType
  value: number
}
