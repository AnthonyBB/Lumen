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

import type { SkillEffect } from './skillTrees'

/** How a skill is aimed when the player picks it. */
export type SkillTargeting =
  | 'single'  // pick one enemy
  | 'aoe'     // hits every enemy, fires immediately (no target prompt)
  | 'self'    // heal / buff / shield on the player, fires immediately

export interface Skill {
  id: string
  name: string
  icon: string
  description: string
  damageMin: number   // also used as healMin when isHeal = true (primary visible magnitude)
  damageMax: number
  isHeal: boolean
  /** Phaser hex color for button tint / animation flash */
  color: number
  mpCost: number
  /** Aiming mode — drives whether BattleScene enters target_select. */
  targeting: SkillTargeting
  /** Full effect list from the skill tree (empty for the basic Attack). The
   *  battle engine reads this to apply DoT, pierce, stun, slow, buffs, etc. */
  effects: SkillEffect[]
  /** Short label under the button summarising the primary magnitude
   *  (e.g. "35 dmg", "Heal 60", "Slow -12", "Buff +25% atk"). */
  powerLabel: string
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
  targeting: 'single',
  effects: [],
  powerLabel: '',
}
