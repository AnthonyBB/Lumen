// Display-only mirror of server/game/data/classStats.ts — keep ids/values in
// sync. The server is authoritative for actual stats; this drives the recruiter
// preview (base attribute profile per class). See docs/CHARACTERS_DESIGN.md.

export type AttrKey = 'strength' | 'constitution' | 'dexterity' | 'intelligence' | 'spirit'

/** Display order + short labels for the five attributes. */
export const ATTR_ORDER: { key: AttrKey; short: string }[] = [
  { key: 'strength', short: 'STR' },
  { key: 'constitution', short: 'CON' },
  { key: 'dexterity', short: 'DEX' },
  { key: 'intelligence', short: 'INT' },
  { key: 'spirit', short: 'SPI' },
]

/** Highest base value any class puts in one attribute — for bar scaling. */
export const CLASS_ATTR_MAX = 10

const FALLBACK: Record<AttrKey, number> = {
  strength: 5, constitution: 5, dexterity: 5, intelligence: 5, spirit: 5,
}

export const CLASS_BASE_ATTRS: Record<string, Record<AttrKey, number>> = {
  sword:          { strength: 8, constitution: 7, dexterity: 5, intelligence: 2, spirit: 3 },
  spear:          { strength: 7, constitution: 6, dexterity: 7, intelligence: 2, spirit: 3 },
  axe:            { strength: 9, constitution: 6, dexterity: 4, intelligence: 2, spirit: 4 },
  hammer:         { strength: 8, constitution: 8, dexterity: 3, intelligence: 2, spirit: 4 },
  paladin:        { strength: 6, constitution: 9, dexterity: 3, intelligence: 3, spirit: 4 },
  monk:           { strength: 6, constitution: 5, dexterity: 8, intelligence: 2, spirit: 4 },
  assassin:       { strength: 6, constitution: 3, dexterity: 10, intelligence: 3, spirit: 3 },
  bard:           { strength: 4, constitution: 5, dexterity: 6, intelligence: 4, spirit: 6 },
  fire_mage:      { strength: 3, constitution: 4, dexterity: 4, intelligence: 10, spirit: 4 },
  ice_mage:       { strength: 3, constitution: 5, dexterity: 4, intelligence: 9, spirit: 4 },
  lightning_mage: { strength: 3, constitution: 4, dexterity: 5, intelligence: 9, spirit: 4 },
  cleric:         { strength: 2, constitution: 5, dexterity: 3, intelligence: 6, spirit: 9 },
  shaman:         { strength: 3, constitution: 5, dexterity: 4, intelligence: 6, spirit: 7 },
}

export function classBaseAttrs(cls: string): Record<AttrKey, number> {
  return CLASS_BASE_ATTRS[cls] ?? FALLBACK
}
