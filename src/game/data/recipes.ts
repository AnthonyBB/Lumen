// ============================================================
// recipes.ts — client mirror of the crafting recipes.
//
// Display-only: the server (server/game/data/recipes.ts) owns the actual craft
// (class/slot mapping, item rolling, material spend). Keep ids/costs in sync.
// ============================================================

export type CraftBuilding = 'forge' | 'armory' | 'alchemy'

export interface Recipe {
  id: string
  name: string
  building: CraftBuilding
  /** Flavour topic shown on the card (live quiz uses the player's grade). */
  topicHint: string
  icon: string
  /** Base-material units consumed (at the chosen tier) per craft. */
  materialCost: number
}

export const RECIPES: Recipe[] = [
  // The Forge — weapons → Math (spends metal)
  { id: 'forge_sword',  name: 'Sword',      building: 'forge',  topicHint: 'Geometry',       icon: '🗡️', materialCost: 3 },
  { id: 'forge_hammer', name: 'Warhammer',  building: 'forge',  topicHint: 'Measurement',    icon: '🔨', materialCost: 3 },
  { id: 'forge_spear',  name: 'Spear',      building: 'forge',  topicHint: 'Fractions',      icon: '🔱', materialCost: 3 },
  { id: 'forge_axe',    name: 'Axe',        building: 'forge',  topicHint: 'Multiplication', icon: '⚔️', materialCost: 3 },
  { id: 'forge_staff',  name: 'Staff',      building: 'forge',  topicHint: 'Algebra',        icon: '🔮', materialCost: 3 },

  // The Armory — armor → Science (spends metal)
  { id: 'armory_helm',   name: 'Helmet',     building: 'armory', topicHint: 'Forces & Impact', icon: '⛑️', materialCost: 3 },
  { id: 'armory_chest',  name: 'Chestplate', building: 'armory', topicHint: 'Materials',       icon: '🛡️', materialCost: 4 },
  { id: 'armory_legs',   name: 'Greaves',    building: 'armory', topicHint: 'Energy',          icon: '👖', materialCost: 3 },
  { id: 'armory_boots',  name: 'Boots',      building: 'armory', topicHint: 'Anatomy & Fit',   icon: '🥾', materialCost: 2 },
  { id: 'armory_gloves', name: 'Gauntlets',  building: 'armory', topicHint: 'Anatomy & Fit',   icon: '🧤', materialCost: 2 },

  // The Alchemy Lab — potions → Science (spends reagents)
  { id: 'brew_healing', name: 'Healing Potion',      building: 'alchemy', topicHint: 'Biology',         icon: '❤️', materialCost: 2 },
  { id: 'brew_mana',    name: 'Mana Potion',         building: 'alchemy', topicHint: 'Chemistry',       icon: '🔷', materialCost: 2 },
  { id: 'brew_rejuv',   name: 'Rejuvenation Potion', building: 'alchemy', topicHint: 'Biology & Chem',  icon: '💧', materialCost: 3 },
]

/** Recipes for one building. */
export function recipesFor(building: CraftBuilding): Recipe[] {
  return RECIPES.filter((r) => r.building === building)
}
