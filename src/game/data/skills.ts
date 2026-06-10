/**
 * Player skill definitions.
 * All damage/heal values are rolled in [min, max] on use.
 * Skills with isHeal:true restore HP instead of dealing damage.
 * mpCost is reserved for a future MP system; currently unused.
 *
 * Only the basic Attack lives here — every other battle skill comes from a
 * purchased skill-tree entry (see skillTrees.ts), mapped onto this shape by
 * BattleScene.toBattleSkill().
 */

export interface Skill {
  id: string
  name: string
  icon: string
  description: string
  damageMin: number   // also used as healMin when isHeal = true
  damageMax: number
  isHeal: boolean
  /** Phaser hex color for button tint / animation flash */
  color: number
  mpCost: number
}

/** Everyone always has the basic weapon attack, purchased or not. */
export const BASIC_ATTACK: Skill = {
  id: 'attack',
  name: 'Attack',
  icon: '⚔️',
  description: 'Strike with your weapon',
  damageMin: 15, damageMax: 28,
  isHeal: false,
  color: 0x8a6a40,
  mpCost: 0,
}
