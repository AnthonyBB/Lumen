// ============================================================
// recipes.ts — client mirror of the Forge weapon recipes.
//
// Display-only: the server (server/game/data/recipes.ts) owns the actual craft
// (class mapping, item rolling, material spend). Keep ids/costs in sync.
// ============================================================

export interface WeaponRecipe {
  id: string
  name: string
  /** Flavour topic shown on the card (live quiz uses the player's grade). */
  topicHint: string
  icon: string
  /** Metal units consumed (at the chosen tier) per craft. */
  metalCost: number
}

export const WEAPON_RECIPES: WeaponRecipe[] = [
  { id: 'forge_sword',  name: 'Sword',     topicHint: 'Geometry',       icon: '🗡️', metalCost: 3 },
  { id: 'forge_hammer', name: 'Warhammer', topicHint: 'Measurement',    icon: '🔨', metalCost: 3 },
  { id: 'forge_spear',  name: 'Spear',     topicHint: 'Fractions',      icon: '🔱', metalCost: 3 },
  { id: 'forge_axe',    name: 'Axe',       topicHint: 'Multiplication', icon: '⚔️', metalCost: 3 },
  { id: 'forge_staff',  name: 'Staff',     topicHint: 'Algebra',        icon: '🔮', metalCost: 3 },
]
