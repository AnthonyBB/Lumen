/**
 * Player skill definitions.
 * All damage/heal values are rolled in [min, max] on use.
 * Skills with isHeal:true restore HP instead of dealing damage.
 * mpCost is reserved for a future MP system; currently unused.
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

export const PLAYER_SKILLS: Skill[] = [
  {
    id: 'attack',
    name: 'Attack',
    icon: '⚔️',
    description: 'Strike with your weapon',
    damageMin: 15, damageMax: 28,
    isHeal: false,
    color: 0x8a6a40,
    mpCost: 0,
  },
  {
    id: 'fireball',
    name: 'Fireball',
    icon: '🔥',
    description: 'Hurl a blazing ball of fire',
    damageMin: 28, damageMax: 45,
    isHeal: false,
    color: 0xff4400,
    mpCost: 12,
  },
  {
    id: 'ice_shard',
    name: 'Ice Shard',
    icon: '❄️',
    description: 'Launch a piercing shard of ice',
    damageMin: 20, damageMax: 34,
    isHeal: false,
    color: 0x44aaff,
    mpCost: 10,
  },
  {
    id: 'lightning',
    name: 'Lightning',
    icon: '⚡',
    description: 'Strike with chain lightning',
    damageMin: 32, damageMax: 55,
    isHeal: false,
    color: 0xffee00,
    mpCost: 18,
  },
  {
    id: 'heal',
    name: 'Heal',
    icon: '💚',
    description: 'Restore your own health',
    damageMin: 22, damageMax: 40,
    isHeal: true,
    color: 0x44ff88,
    mpCost: 14,
  },
]
