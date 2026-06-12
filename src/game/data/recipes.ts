// ============================================================
// recipes.ts — client mirror of the crafting recipes.
//
// Display-only: the server (server/game/data/recipes.ts) owns the actual craft
// (class/slot mapping, item rolling, material spend). Keep ids/costs in sync.
// ============================================================

export type CraftBuilding = 'forge' | 'armory'

export interface Recipe {
  id: string
  name: string
  building: CraftBuilding
  /** Flavour topic shown on the card (live quiz uses the player's grade). */
  topicHint: string
  icon: string
  /** Metal units consumed (at the chosen tier) per craft. */
  metalCost: number
}

export const RECIPES: Recipe[] = [
  // The Forge — weapons → Math
  { id: 'forge_sword',  name: 'Sword',      building: 'forge',  topicHint: 'Geometry',       icon: '🗡️', metalCost: 3 },
  { id: 'forge_hammer', name: 'Warhammer',  building: 'forge',  topicHint: 'Measurement',    icon: '🔨', metalCost: 3 },
  { id: 'forge_spear',  name: 'Spear',      building: 'forge',  topicHint: 'Fractions',      icon: '🔱', metalCost: 3 },
  { id: 'forge_axe',    name: 'Axe',        building: 'forge',  topicHint: 'Multiplication', icon: '⚔️', metalCost: 3 },
  { id: 'forge_staff',  name: 'Staff',      building: 'forge',  topicHint: 'Algebra',        icon: '🔮', metalCost: 3 },

  // The Armory — armor → Science
  { id: 'armory_helm',   name: 'Helmet',     building: 'armory', topicHint: 'Forces & Impact', icon: '⛑️', metalCost: 3 },
  { id: 'armory_chest',  name: 'Chestplate', building: 'armory', topicHint: 'Materials',       icon: '🛡️', metalCost: 4 },
  { id: 'armory_legs',   name: 'Greaves',    building: 'armory', topicHint: 'Energy',          icon: '👖', metalCost: 3 },
  { id: 'armory_boots',  name: 'Boots',      building: 'armory', topicHint: 'Anatomy & Fit',   icon: '🥾', metalCost: 2 },
  { id: 'armory_gloves', name: 'Gauntlets',  building: 'armory', topicHint: 'Anatomy & Fit',   icon: '🧤', metalCost: 2 },
]

/** Recipes for one building. */
export function recipesFor(building: CraftBuilding): Recipe[] {
  return RECIPES.filter((r) => r.building === building)
}
