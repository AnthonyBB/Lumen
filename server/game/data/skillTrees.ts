// ============================================================
// skillTrees.ts — 13-class combat skill tree definitions
//
// IMPORTANT: this is the SERVER copy of src/game/data/skillTrees.ts.
// It is the authoritative catalog used to validate shop:buy_skill
// purchases (skill existence, tier pricing, prerequisites).
// The two files must stay in sync: if you change ANY skill (id,
// tier, path, requires, effects) in either file, make the identical
// change in the other.  (Same pattern as server/game/data/equipmentGen.ts.)
// ============================================================

export type SkillClass =
  | 'fire_mage' | 'ice_mage' | 'lightning_mage'
  | 'sword' | 'spear' | 'axe' | 'hammer'
  | 'monk' | 'paladin' | 'assassin' | 'cleric' | 'shaman' | 'bard'

export type EffectType =
  // damage delivery
  | 'damage'      // single-target direct damage
  | 'aoe'         // hits ALL enemies, fires with no target selection
  // damage-over-time flavors (all tick at start of round for `duration`)
  | 'dot'         // generic / burn
  | 'bleed'       // martial bleed (functionally a dot, separate label)
  | 'poison'      // assassin/shaman poison (functionally a dot, separate label)
  // crowd control / debuffs on the enemy
  | 'pierce'      // lowers target defense by `value` for `duration` rounds
  | 'stun'        // target skips its next attack (level-scaled land chance)
  | 'slow'        // lowers target speed by `value` for `duration` rounds
  | 'sleep'       // target takes no action until hit (level-scaled wake chance)
  // player / party support
  | 'heal'        // direct heal
  | 'hot'         // heal-over-time for the player
  | 'team_buff'   // party stat buff (see `stat`)
  | 'lifesteal'   // heal caster for `value`% of this skill's damage
  | 'execute'     // bonus/finisher damage vs low-HP targets
  | 'shield'      // temporary damage-absorb pool for the player

/** Stat a team_buff boosts (percentage). */
export type BuffStat = 'attack' | 'defense' | 'speed'

export interface SkillEffect {
  type: EffectType
  value: number
  duration?: number   // rounds (dot/pierce/slow/buff/stun/sleep/shield/hot)
  chance?: number     // 0–1 probability (stun/execute override floor)
  /** For team_buff: which stat it boosts. */
  stat?: BuffStat
  /** When true on a pierce/slow/stun/sleep effect, it applies to ALL enemies
   *  (used by Bard debuff songs and a few utility AoEs). */
  aoe?: boolean
}

export interface CombatSkill {
  id: string
  name: string
  icon: string        // single emoji
  description: string
  tier: 1 | 2 | 3 | 4 | 5
  path: 'core' | 'path_a' | 'path_b'
  requires: string[]  // prerequisite skill ids
  effects: SkillEffect[]
  mpCost: number
  cooldown: number    // turns (0 = no cooldown)
  class: SkillClass
}

export interface SkillTreeDef {
  class: SkillClass
  label: string
  icon: string
  description: string
  skills: CombatSkill[]
}

export const SKILL_TREES: SkillTreeDef[] = [

  // ============================================================
  // FIRE MAGE 🔥 — burn DoT specialist
  // Core → Inferno (Path A, AoE burns) | Pyromancer (Path B, focused burst)
  // ============================================================
  {
    class: 'fire_mage',
    label: 'Fire Mage',
    icon: '🔥',
    description: 'Masters of flame who wield burning destruction. Path A: Inferno — mass burns and AoE eruptions. Path B: Pyromancer — focused scorching and execute strikes.',
    skills: [
      {
        id: 'fm_ember_shot', name: 'Ember Shot', icon: '🔥',
        description: 'Hurl a small bolt of fire at a single enemy.',
        tier: 1, path: 'core', requires: [],
        effects: [{ type: 'damage', value: 15 }],
        mpCost: 3, cooldown: 0, class: 'fire_mage',
      },
      {
        id: 'fm_fire_touch', name: 'Fire Touch', icon: '✋',
        description: 'Ignite your hands and strike, leaving a burn that deals 9 damage/round for 3 rounds.',
        tier: 1, path: 'core', requires: ['fm_ember_shot'],
        effects: [{ type: 'damage', value: 12 }, { type: 'dot', value: 9, duration: 3 }],
        mpCost: 5, cooldown: 0, class: 'fire_mage',
      },
      {
        id: 'fm_flame_burst', name: 'Flame Burst', icon: '💥',
        description: 'Release a burst of flame dealing solid fire damage.',
        tier: 2, path: 'core', requires: ['fm_fire_touch'],
        effects: [{ type: 'damage', value: 35 }],
        mpCost: 8, cooldown: 0, class: 'fire_mage',
      },
      {
        id: 'fm_scorching_ray', name: 'Scorching Ray', icon: '☀️',
        description: 'A concentrated ray of heat: solid damage plus a burn (12/round, 2 rounds).',
        tier: 2, path: 'core', requires: ['fm_flame_burst'],
        effects: [{ type: 'damage', value: 40 }, { type: 'dot', value: 12, duration: 2 }],
        mpCost: 10, cooldown: 1, class: 'fire_mage',
      },
      {
        id: 'fm_fire_mastery', name: 'Fire Mastery', icon: '🌋',
        description: 'Unlock deeper fire magic: a heavy hit and a lingering burn (15/round, 3 rounds).',
        tier: 3, path: 'core', requires: ['fm_scorching_ray'],
        effects: [{ type: 'damage', value: 55 }, { type: 'dot', value: 15, duration: 3 }],
        mpCost: 15, cooldown: 1, class: 'fire_mage',
      },
      // Path A — Inferno
      {
        id: 'fm_wildfire', name: 'Wildfire', icon: '🌾',
        description: 'Spread fire across ALL enemies, igniting each with a burn (10/round, 3 rounds).',
        tier: 3, path: 'path_a', requires: ['fm_fire_mastery'],
        effects: [{ type: 'aoe', value: 30 }, { type: 'dot', value: 10, duration: 3 }],
        mpCost: 14, cooldown: 1, class: 'fire_mage',
      },
      // Path B — Pyromancer
      {
        id: 'fm_superheated', name: 'Superheated Strike', icon: '🔴',
        description: 'Concentrate extreme heat into a single devastating strike.',
        tier: 3, path: 'path_b', requires: ['fm_fire_mastery'],
        effects: [{ type: 'damage', value: 70 }],
        mpCost: 14, cooldown: 1, class: 'fire_mage',
      },
      // Tier 4 Path A
      {
        id: 'fm_eruption', name: 'Eruption', icon: '🌋',
        description: 'Volcanic eruptions beneath all enemies: AoE damage and a strong burn (20/round, 3 rounds).',
        tier: 4, path: 'path_a', requires: ['fm_wildfire'],
        effects: [{ type: 'aoe', value: 48 }, { type: 'dot', value: 20, duration: 3 }],
        mpCost: 20, cooldown: 2, class: 'fire_mage',
      },
      {
        id: 'fm_infernal_spread', name: 'Infernal Spread', icon: '🔥',
        description: 'Cheaper AoE that spreads a fiercer burn (16/round, 3 rounds) to all foes.',
        tier: 4, path: 'path_a', requires: ['fm_wildfire'],
        effects: [{ type: 'aoe', value: 40 }, { type: 'dot', value: 16, duration: 3 }],
        mpCost: 18, cooldown: 1, class: 'fire_mage',
      },
      // Tier 4 Path B
      {
        id: 'fm_char', name: 'Char', icon: '⚫',
        description: 'Reduce a target to ash — a huge hit that melts armor (defense -18 for 2 rounds).',
        tier: 4, path: 'path_b', requires: ['fm_superheated'],
        effects: [{ type: 'damage', value: 95 }, { type: 'pierce', value: 18, duration: 2 }],
        mpCost: 22, cooldown: 2, class: 'fire_mage',
      },
      {
        id: 'fm_brand', name: 'Brand', icon: '🔖',
        description: 'Sear a brand into the enemy: heavy damage plus a sustained burn (18/round, 3 rounds).',
        tier: 4, path: 'path_b', requires: ['fm_superheated'],
        effects: [{ type: 'damage', value: 70 }, { type: 'dot', value: 18, duration: 3 }],
        mpCost: 20, cooldown: 1, class: 'fire_mage',
      },
      // Tier 5
      {
        id: 'fm_cataclysm', name: 'Cataclysm', icon: '💀',
        description: 'Rain fire on all enemies in a catastrophic eruption with a raging burn (30/round, 3 rounds).',
        tier: 5, path: 'path_a', requires: ['fm_eruption', 'fm_infernal_spread'],
        effects: [{ type: 'aoe', value: 85 }, { type: 'dot', value: 30, duration: 3 }],
        mpCost: 38, cooldown: 4, class: 'fire_mage',
      },
      {
        id: 'fm_phoenix_wrath', name: 'Phoenix Wrath', icon: '🦅',
        description: 'Channel phoenix fire into an execute strike — massive damage, bonus below 30% HP.',
        tier: 5, path: 'path_b', requires: ['fm_char', 'fm_brand'],
        effects: [{ type: 'damage', value: 150 }, { type: 'execute', value: 50, chance: 0.5 }],
        mpCost: 35, cooldown: 4, class: 'fire_mage',
      },
    ],
  },

  // ============================================================
  // ICE MAGE ❄️ — slow specialist
  // ============================================================
  {
    class: 'ice_mage',
    label: 'Ice Mage',
    icon: '❄️',
    description: 'Cold sorcerers who harness ice and frost. Path A: Glacial — freezes, stuns, and damage shields. Path B: Blizzard — AoE slows and chilling DoTs.',
    skills: [
      {
        id: 'im_frost_bolt', name: 'Frost Bolt', icon: '❄️',
        description: 'Launch a shard of ice at an enemy.',
        tier: 1, path: 'core', requires: [],
        effects: [{ type: 'damage', value: 14 }],
        mpCost: 3, cooldown: 0, class: 'ice_mage',
      },
      {
        id: 'im_chill_touch', name: 'Chill Touch', icon: '🖐️',
        description: 'Drain warmth: light damage and a slow (speed -6 for 2 rounds).',
        tier: 1, path: 'core', requires: ['im_frost_bolt'],
        effects: [{ type: 'damage', value: 10 }, { type: 'slow', value: 6, duration: 2 }],
        mpCost: 4, cooldown: 0, class: 'ice_mage',
      },
      {
        id: 'im_ice_lance', name: 'Ice Lance', icon: '🗡️',
        description: 'Hurl a long lance of ice that pierces deep.',
        tier: 2, path: 'core', requires: ['im_chill_touch'],
        effects: [{ type: 'damage', value: 38 }],
        mpCost: 8, cooldown: 0, class: 'ice_mage',
      },
      {
        id: 'im_frost_nova', name: 'Frost Nova', icon: '💠',
        description: 'Explode with frost, hitting all enemies and slowing them (speed -8 for 2 rounds).',
        tier: 2, path: 'core', requires: ['im_ice_lance'],
        effects: [{ type: 'aoe', value: 18 }, { type: 'slow', value: 8, duration: 2 }],
        mpCost: 11, cooldown: 1, class: 'ice_mage',
      },
      {
        id: 'im_ice_mastery', name: 'Ice Mastery', icon: '🧊',
        description: 'Mastery over ice: a strong hit and a deepening slow (speed -10 for 2 rounds).',
        tier: 3, path: 'core', requires: ['im_frost_nova'],
        effects: [{ type: 'damage', value: 50 }, { type: 'slow', value: 10, duration: 2 }],
        mpCost: 15, cooldown: 1, class: 'ice_mage',
      },
      // Path A — Glacial
      {
        id: 'im_freeze', name: 'Freeze', icon: '🧊',
        description: 'Encase an enemy in solid ice, stunning them for 2 rounds.',
        tier: 3, path: 'path_a', requires: ['im_ice_mastery'],
        effects: [{ type: 'damage', value: 45 }, { type: 'stun', value: 0, duration: 2 }],
        mpCost: 16, cooldown: 1, class: 'ice_mage',
      },
      // Path B — Blizzard
      {
        id: 'im_sleet_storm', name: 'Sleet Storm', icon: '🌨️',
        description: 'A storm of sleet: AoE damage, a chilling DoT (14/round, 3 rounds) and a slow.',
        tier: 3, path: 'path_b', requires: ['im_ice_mastery'],
        effects: [{ type: 'aoe', value: 24 }, { type: 'dot', value: 14, duration: 3 }, { type: 'slow', value: 8, duration: 2 }],
        mpCost: 15, cooldown: 1, class: 'ice_mage',
      },
      // Tier 4 Path A
      {
        id: 'im_glacial_wall', name: 'Glacial Wall', icon: '🏔️',
        description: 'Erect a wall of ice, absorbing up to 80 damage for 3 rounds.',
        tier: 4, path: 'path_a', requires: ['im_freeze'],
        effects: [{ type: 'shield', value: 80, duration: 3 }],
        mpCost: 18, cooldown: 2, class: 'ice_mage',
      },
      {
        id: 'im_shatter', name: 'Shatter', icon: '💎',
        description: 'Shatter a frozen enemy for massive damage, with a chance to re-stun (1 round).',
        tier: 4, path: 'path_a', requires: ['im_freeze'],
        effects: [{ type: 'damage', value: 105 }, { type: 'stun', value: 0, duration: 1, chance: 0.5 }],
        mpCost: 20, cooldown: 2, class: 'ice_mage',
      },
      // Tier 4 Path B
      {
        id: 'im_arctic_gale', name: 'Arctic Gale', icon: '🌬️',
        description: 'A freezing gale sweeps all foes: AoE damage, DoT (16/round, 3 rounds) and a heavy slow (-14 for 2 rounds).',
        tier: 4, path: 'path_b', requires: ['im_sleet_storm'],
        effects: [{ type: 'aoe', value: 40 }, { type: 'dot', value: 16, duration: 3 }, { type: 'slow', value: 14, duration: 2 }],
        mpCost: 22, cooldown: 2, class: 'ice_mage',
      },
      {
        id: 'im_ice_age', name: 'Ice Age', icon: '❄️',
        description: 'Plunge temperatures, gripping all foes in a deep slow (speed -16 for 3 rounds).',
        tier: 4, path: 'path_b', requires: ['im_sleet_storm'],
        effects: [{ type: 'aoe', value: 32 }, { type: 'slow', value: 16, duration: 3 }],
        mpCost: 20, cooldown: 1, class: 'ice_mage',
      },
      // Tier 5
      {
        id: 'im_absolute_zero', name: 'Absolute Zero', icon: '🥶',
        description: 'Freeze all enemies solid (stun 2 rounds) and shield yourself (60 for 2 rounds).',
        tier: 5, path: 'path_a', requires: ['im_glacial_wall', 'im_shatter'],
        effects: [{ type: 'aoe', value: 70 }, { type: 'stun', value: 0, duration: 2 }, { type: 'shield', value: 60, duration: 2 }],
        mpCost: 40, cooldown: 4, class: 'ice_mage',
      },
      {
        id: 'im_eternal_winter', name: 'Eternal Winter', icon: '🌨️',
        description: 'An unending blizzard: huge AoE, a brutal DoT (28/round, 3 rounds) and a crippling slow (-22 for 3 rounds).',
        tier: 5, path: 'path_b', requires: ['im_arctic_gale', 'im_ice_age'],
        effects: [{ type: 'aoe', value: 72 }, { type: 'dot', value: 28, duration: 3 }, { type: 'slow', value: 22, duration: 3 }],
        mpCost: 38, cooldown: 4, class: 'ice_mage',
      },
    ],
  },

  // ============================================================
  // LIGHTNING MAGE ⚡ — stun specialist
  // ============================================================
  {
    class: 'lightning_mage',
    label: 'Lightning Mage',
    icon: '⚡',
    description: 'Crackling mages who command lightning. Path A: Storm — chain lightning and wide AoE blasts. Path B: Thunderstrike — earth-shattering single-target hits and stuns.',
    skills: [
      {
        id: 'lm_spark', name: 'Spark', icon: '✨',
        description: 'Release a small spark of electricity at an enemy.',
        tier: 1, path: 'core', requires: [],
        effects: [{ type: 'damage', value: 16 }],
        mpCost: 3, cooldown: 0, class: 'lightning_mage',
      },
      {
        id: 'lm_static_shock', name: 'Static Shock', icon: '⚡',
        description: 'Discharge static into a foe with a small chance to stun (1 round).',
        tier: 1, path: 'core', requires: ['lm_spark'],
        effects: [{ type: 'damage', value: 20 }, { type: 'stun', value: 0, duration: 1, chance: 0.25 }],
        mpCost: 4, cooldown: 0, class: 'lightning_mage',
      },
      {
        id: 'lm_lightning_bolt', name: 'Lightning Bolt', icon: '🌩️',
        description: 'Strike with a powerful bolt of lightning.',
        tier: 2, path: 'core', requires: ['lm_static_shock'],
        effects: [{ type: 'damage', value: 40 }],
        mpCost: 9, cooldown: 0, class: 'lightning_mage',
      },
      {
        id: 'lm_ball_lightning', name: 'Ball Lightning', icon: '🔵',
        description: 'A hovering orb of lightning that explodes across all enemies.',
        tier: 2, path: 'core', requires: ['lm_lightning_bolt'],
        effects: [{ type: 'aoe', value: 30 }],
        mpCost: 12, cooldown: 1, class: 'lightning_mage',
      },
      {
        id: 'lm_storm_mastery', name: 'Storm Mastery', icon: '🌪️',
        description: 'Master the storm: a strong hit with a chance to stun (1 round).',
        tier: 3, path: 'core', requires: ['lm_ball_lightning'],
        effects: [{ type: 'damage', value: 55 }, { type: 'stun', value: 0, duration: 1, chance: 0.3 }],
        mpCost: 15, cooldown: 1, class: 'lightning_mage',
      },
      // Path A — Storm
      {
        id: 'lm_chain_lightning', name: 'Chain Lightning', icon: '🔗',
        description: 'Lightning arcs between every enemy, dealing AoE damage.',
        tier: 3, path: 'path_a', requires: ['lm_storm_mastery'],
        effects: [{ type: 'aoe', value: 40 }],
        mpCost: 16, cooldown: 1, class: 'lightning_mage',
      },
      // Path B — Thunderstrike
      {
        id: 'lm_thunderclap', name: 'Thunderclap', icon: '💢',
        description: 'A focused clap of thunder with a strong chance to stun (1 round).',
        tier: 3, path: 'path_b', requires: ['lm_storm_mastery'],
        effects: [{ type: 'damage', value: 72 }, { type: 'stun', value: 0, duration: 1, chance: 0.5 }],
        mpCost: 16, cooldown: 1, class: 'lightning_mage',
      },
      // Tier 4 Path A
      {
        id: 'lm_tempest', name: 'Tempest', icon: '🌀',
        description: 'A raging tempest across all enemies, slowing them (speed -12 for 2 rounds).',
        tier: 4, path: 'path_a', requires: ['lm_chain_lightning'],
        effects: [{ type: 'aoe', value: 54 }, { type: 'slow', value: 12, duration: 2 }],
        mpCost: 20, cooldown: 2, class: 'lightning_mage',
      },
      {
        id: 'lm_overload', name: 'Overload', icon: '⚡',
        description: 'Overload the storm: AoE damage with a chance to stun every enemy (1 round).',
        tier: 4, path: 'path_a', requires: ['lm_chain_lightning'],
        effects: [{ type: 'aoe', value: 60 }, { type: 'stun', value: 0, duration: 1, chance: 0.4 }],
        mpCost: 22, cooldown: 2, class: 'lightning_mage',
      },
      // Tier 4 Path B
      {
        id: 'lm_megabolt', name: 'Megabolt', icon: '🌩️',
        description: 'Charge up and release a massive single bolt.',
        tier: 4, path: 'path_b', requires: ['lm_thunderclap'],
        effects: [{ type: 'damage', value: 115 }],
        mpCost: 22, cooldown: 2, class: 'lightning_mage',
      },
      {
        id: 'lm_stun_surge', name: 'Stun Surge', icon: '💫',
        description: 'Surge electricity through a foe, reliably stunning them for 2 rounds.',
        tier: 4, path: 'path_b', requires: ['lm_thunderclap'],
        effects: [{ type: 'damage', value: 90 }, { type: 'stun', value: 0, duration: 2 }],
        mpCost: 20, cooldown: 2, class: 'lightning_mage',
      },
      // Tier 5
      {
        id: 'lm_storm_of_ages', name: 'Storm of Ages', icon: '🌪️',
        description: 'A legendary storm that devastates all enemies with a chance to stun each (1 round).',
        tier: 5, path: 'path_a', requires: ['lm_tempest', 'lm_overload'],
        effects: [{ type: 'aoe', value: 90 }, { type: 'stun', value: 0, duration: 1, chance: 0.5 }],
        mpCost: 40, cooldown: 4, class: 'lightning_mage',
      },
      {
        id: 'lm_godstrike', name: 'Godstrike', icon: '⚡',
        description: 'A divine bolt of pure lightning — the biggest single hit, stunning for 2 rounds.',
        tier: 5, path: 'path_b', requires: ['lm_megabolt', 'lm_stun_surge'],
        effects: [{ type: 'damage', value: 180 }, { type: 'stun', value: 0, duration: 2 }],
        mpCost: 38, cooldown: 4, class: 'lightning_mage',
      },
    ],
  },

  // ============================================================
  // SWORD FIGHTER ⚔️ — balanced martial
  // ============================================================
  {
    class: 'sword',
    label: 'Sword Fighter',
    icon: '⚔️',
    description: 'Skilled warriors who master the blade. Path A: Duelist — parry shields and counter buffs. Path B: Berserker — raw high damage and lifesteal.',
    skills: [
      {
        id: 'sw_slash', name: 'Slash', icon: '⚔️',
        description: 'A basic slashing attack.',
        tier: 1, path: 'core', requires: [],
        effects: [{ type: 'damage', value: 18 }],
        mpCost: 0, cooldown: 0, class: 'sword',
      },
      {
        id: 'sw_quick_strike', name: 'Quick Strike', icon: '💨',
        description: 'A fast flurry that strikes twice.',
        tier: 1, path: 'core', requires: ['sw_slash'],
        effects: [{ type: 'damage', value: 24 }],
        mpCost: 3, cooldown: 0, class: 'sword',
      },
      {
        id: 'sw_power_slash', name: 'Power Slash', icon: '🗡️',
        description: 'A powerful overhead slash dealing heavy damage.',
        tier: 2, path: 'core', requires: ['sw_quick_strike'],
        effects: [{ type: 'damage', value: 42 }],
        mpCost: 7, cooldown: 0, class: 'sword',
      },
      {
        id: 'sw_blade_dance', name: 'Blade Dance', icon: '💃',
        description: 'Dance with your blade, striking and raising the party\'s attack (+10% for 2 rounds).',
        tier: 2, path: 'core', requires: ['sw_power_slash'],
        effects: [{ type: 'damage', value: 30 }, { type: 'team_buff', value: 10, duration: 2, stat: 'attack' }],
        mpCost: 9, cooldown: 1, class: 'sword',
      },
      {
        id: 'sw_sword_mastery', name: 'Sword Mastery', icon: '⚔️',
        description: 'Deep mastery of the sword — a clean, powerful strike.',
        tier: 3, path: 'core', requires: ['sw_blade_dance'],
        effects: [{ type: 'damage', value: 62 }],
        mpCost: 14, cooldown: 1, class: 'sword',
      },
      // Path A — Duelist
      {
        id: 'sw_parry', name: 'Parry', icon: '🛡️',
        description: 'Deflect attacks: shield (50 for 2 rounds) and raise party defense (+20% for 2 rounds).',
        tier: 3, path: 'path_a', requires: ['sw_sword_mastery'],
        effects: [{ type: 'shield', value: 50, duration: 2 }, { type: 'team_buff', value: 20, duration: 2, stat: 'defense' }],
        mpCost: 12, cooldown: 1, class: 'sword',
      },
      {
        id: 'sw_riposte', name: 'Riposte', icon: '🔁',
        description: 'A lethal counter-strike that also sharpens the party\'s attack (+15% for 2 rounds).',
        tier: 4, path: 'path_a', requires: ['sw_parry'],
        effects: [{ type: 'damage', value: 95 }, { type: 'team_buff', value: 15, duration: 2, stat: 'attack' }],
        mpCost: 18, cooldown: 2, class: 'sword',
      },
      {
        id: 'sw_perfect_guard', name: 'Perfect Guard', icon: '🔰',
        description: 'Perfect defensive form: big shield (70 for 2 rounds) and party defense (+25% for 3 rounds).',
        tier: 4, path: 'path_a', requires: ['sw_parry'],
        effects: [{ type: 'shield', value: 70, duration: 2 }, { type: 'team_buff', value: 25, duration: 3, stat: 'defense' }],
        mpCost: 20, cooldown: 2, class: 'sword',
      },
      {
        id: 'sw_duel_mastery', name: 'Duel Mastery', icon: '🏆',
        description: 'The ultimate duelist technique — a massive strike behind a shield (80 for 2 rounds).',
        tier: 5, path: 'path_a', requires: ['sw_riposte', 'sw_perfect_guard'],
        effects: [{ type: 'damage', value: 160 }, { type: 'shield', value: 80, duration: 2 }],
        mpCost: 35, cooldown: 4, class: 'sword',
      },
      // Path B — Berserker
      {
        id: 'sw_frenzy', name: 'Frenzy', icon: '😡',
        description: 'Enter a frenzy: heavy damage and a party attack boost (+20% for 3 rounds).',
        tier: 3, path: 'path_b', requires: ['sw_sword_mastery'],
        effects: [{ type: 'damage', value: 65 }, { type: 'team_buff', value: 20, duration: 3, stat: 'attack' }],
        mpCost: 13, cooldown: 1, class: 'sword',
      },
      {
        id: 'sw_bloodlust', name: 'Bloodlust', icon: '🩸',
        description: 'Strikes siphon life — heal yourself for 30% of the damage dealt.',
        tier: 4, path: 'path_b', requires: ['sw_frenzy'],
        effects: [{ type: 'damage', value: 88 }, { type: 'lifesteal', value: 30 }],
        mpCost: 19, cooldown: 2, class: 'sword',
      },
      {
        id: 'sw_savage_blow', name: 'Savage Blow', icon: '💥',
        description: 'An unhinged strike that shreds armor (defense -20 for 2 rounds).',
        tier: 4, path: 'path_b', requires: ['sw_frenzy'],
        effects: [{ type: 'damage', value: 105 }, { type: 'pierce', value: 20, duration: 2 }],
        mpCost: 22, cooldown: 2, class: 'sword',
      },
      {
        id: 'sw_berserker_rage', name: 'Berserker Rage', icon: '🔥',
        description: 'An unstoppable rage — massive damage that heals you for 50% of it.',
        tier: 5, path: 'path_b', requires: ['sw_bloodlust', 'sw_savage_blow'],
        effects: [{ type: 'damage', value: 170 }, { type: 'lifesteal', value: 50 }],
        mpCost: 36, cooldown: 4, class: 'sword',
      },
    ],
  },

  // ============================================================
  // SPEAR FIGHTER 🏹 — pierce / armor-break + bleed
  // ============================================================
  {
    class: 'spear',
    label: 'Spear Fighter',
    icon: '🏹',
    description: 'Disciplined fighters with long reach. Path A: Lancer — pierce DoTs and armor breaks. Path B: Phalanx — shield-and-spear defensive stun combos.',
    skills: [
      {
        id: 'sp_thrust', name: 'Thrust', icon: '🏹',
        description: 'A basic spear thrust.',
        tier: 1, path: 'core', requires: [],
        effects: [{ type: 'damage', value: 17 }],
        mpCost: 0, cooldown: 0, class: 'spear',
      },
      {
        id: 'sp_pierce', name: 'Pierce', icon: '🔱',
        description: 'Pierce through armor, lowering enemy defense by 8 for 2 rounds.',
        tier: 1, path: 'core', requires: ['sp_thrust'],
        effects: [{ type: 'damage', value: 14 }, { type: 'pierce', value: 8, duration: 2 }],
        mpCost: 3, cooldown: 0, class: 'spear',
      },
      {
        id: 'sp_long_reach', name: 'Long Reach', icon: '📏',
        description: 'Strike from extended range, increasing hit power.',
        tier: 2, path: 'core', requires: ['sp_pierce'],
        effects: [{ type: 'damage', value: 38 }],
        mpCost: 7, cooldown: 0, class: 'spear',
      },
      {
        id: 'sp_sweeping_strike', name: 'Sweeping Strike', icon: '🌀',
        description: 'Sweep the spear across all foes, briefly breaking armor (defense -8 for 1 round).',
        tier: 2, path: 'core', requires: ['sp_long_reach'],
        effects: [{ type: 'aoe', value: 21 }, { type: 'pierce', value: 8, duration: 1, aoe: true }],
        mpCost: 10, cooldown: 1, class: 'spear',
      },
      {
        id: 'sp_spear_mastery', name: 'Spear Mastery', icon: '🏆',
        description: 'Master the spear: a strong thrust that lowers defense by 12 for 2 rounds.',
        tier: 3, path: 'core', requires: ['sp_sweeping_strike'],
        effects: [{ type: 'damage', value: 58 }, { type: 'pierce', value: 12, duration: 2 }],
        mpCost: 14, cooldown: 1, class: 'spear',
      },
      // Path A — Lancer
      {
        id: 'sp_armor_break', name: 'Armor Break', icon: '💢',
        description: 'A powerful strike that shatters armor (defense -22 for 3 rounds).',
        tier: 3, path: 'path_a', requires: ['sp_spear_mastery'],
        effects: [{ type: 'damage', value: 52 }, { type: 'pierce', value: 22, duration: 3 }],
        mpCost: 15, cooldown: 1, class: 'spear',
      },
      {
        id: 'sp_bleeding_lance', name: 'Bleeding Lance', icon: '🩸',
        description: 'Drive the lance deep, causing a bleed (15/round for 3 rounds).',
        tier: 4, path: 'path_a', requires: ['sp_armor_break'],
        effects: [{ type: 'damage', value: 72 }, { type: 'bleed', value: 15, duration: 3 }],
        mpCost: 19, cooldown: 2, class: 'spear',
      },
      {
        id: 'sp_skewer', name: 'Skewer', icon: '🔧',
        description: 'Pin the enemy: damage, a stun (1 round) and armor break (defense -18 for 2 rounds).',
        tier: 4, path: 'path_a', requires: ['sp_armor_break'],
        effects: [{ type: 'damage', value: 85 }, { type: 'stun', value: 0, duration: 1 }, { type: 'pierce', value: 18, duration: 2 }],
        mpCost: 22, cooldown: 2, class: 'spear',
      },
      {
        id: 'sp_dragon_pierce', name: 'Dragon Pierce', icon: '🐉',
        description: 'A legendary lancer strike — bleed (25/round, 3 rounds) and deep armor break (-30 for 3 rounds).',
        tier: 5, path: 'path_a', requires: ['sp_bleeding_lance', 'sp_skewer'],
        effects: [{ type: 'damage', value: 155 }, { type: 'bleed', value: 25, duration: 3 }, { type: 'pierce', value: 30, duration: 3 }],
        mpCost: 37, cooldown: 4, class: 'spear',
      },
      // Path B — Phalanx
      {
        id: 'sp_shield_bash', name: 'Shield Bash', icon: '🛡️',
        description: 'Strike with your shield to stun an enemy for 1 round.',
        tier: 3, path: 'path_b', requires: ['sp_spear_mastery'],
        effects: [{ type: 'damage', value: 40 }, { type: 'stun', value: 0, duration: 1 }],
        mpCost: 14, cooldown: 1, class: 'spear',
      },
      {
        id: 'sp_phalanx_stance', name: 'Phalanx Stance', icon: '🔰',
        description: 'Lock into a phalanx: strong shield (90 for 3 rounds) and party defense (+15% for 3 rounds).',
        tier: 4, path: 'path_b', requires: ['sp_shield_bash'],
        effects: [{ type: 'shield', value: 90, duration: 3 }, { type: 'team_buff', value: 15, duration: 3, stat: 'defense' }],
        mpCost: 20, cooldown: 2, class: 'spear',
      },
      {
        id: 'sp_counter_thrust', name: 'Counter Thrust', icon: '🔄',
        description: 'A powerful counter with a strong chance to stun (1 round).',
        tier: 4, path: 'path_b', requires: ['sp_shield_bash'],
        effects: [{ type: 'damage', value: 100 }, { type: 'stun', value: 0, duration: 1, chance: 0.6 }],
        mpCost: 20, cooldown: 2, class: 'spear',
      },
      {
        id: 'sp_fortress_breaker', name: 'Fortress Breaker', icon: '🏰',
        description: 'Phalanx mastery — a huge hit, a shield (80 for 3 rounds) and a 2-round stun.',
        tier: 5, path: 'path_b', requires: ['sp_phalanx_stance', 'sp_counter_thrust'],
        effects: [{ type: 'damage', value: 145 }, { type: 'shield', value: 80, duration: 3 }, { type: 'stun', value: 0, duration: 2 }],
        mpCost: 36, cooldown: 4, class: 'spear',
      },
    ],
  },

  // ============================================================
  // AXE FIGHTER 🪓 — bleed + execute / AoE cleave
  // ============================================================
  {
    class: 'axe',
    label: 'Axe Fighter',
    icon: '🪓',
    description: 'Brutal axe wielders with devastating power. Path A: Reaper — execute strikes and bleed DoTs. Path B: Berserker Axe — AoE cleaves and enrage buffs.',
    skills: [
      {
        id: 'ax_chop', name: 'Chop', icon: '🪓',
        description: 'A basic axe chop.',
        tier: 1, path: 'core', requires: [],
        effects: [{ type: 'damage', value: 20 }],
        mpCost: 0, cooldown: 0, class: 'axe',
      },
      {
        id: 'ax_cleave', name: 'Cleave', icon: '💥',
        description: 'Swing wide to hit all nearby foes.',
        tier: 1, path: 'core', requires: ['ax_chop'],
        effects: [{ type: 'aoe', value: 12 }],
        mpCost: 4, cooldown: 0, class: 'axe',
      },
      {
        id: 'ax_heavy_blow', name: 'Heavy Blow', icon: '🔨',
        description: 'Wind up for a heavy two-handed blow.',
        tier: 2, path: 'core', requires: ['ax_cleave'],
        effects: [{ type: 'damage', value: 44 }],
        mpCost: 8, cooldown: 0, class: 'axe',
      },
      {
        id: 'ax_war_cry', name: 'War Cry', icon: '📣',
        description: 'A war cry that strikes and boosts party attack (+18% for 3 rounds).',
        tier: 2, path: 'core', requires: ['ax_heavy_blow'],
        effects: [{ type: 'damage', value: 25 }, { type: 'team_buff', value: 18, duration: 3, stat: 'attack' }],
        mpCost: 10, cooldown: 1, class: 'axe',
      },
      {
        id: 'ax_axe_mastery', name: 'Axe Mastery', icon: '🏆',
        description: 'Master the axe — a fearsome heavy strike.',
        tier: 3, path: 'core', requires: ['ax_war_cry'],
        effects: [{ type: 'damage', value: 64 }],
        mpCost: 15, cooldown: 1, class: 'axe',
      },
      // Path A — Reaper
      {
        id: 'ax_grim_slash', name: 'Grim Slash', icon: '💀',
        description: 'A grim slash that opens a bleeding wound (12/round for 3 rounds).',
        tier: 3, path: 'path_a', requires: ['ax_axe_mastery'],
        effects: [{ type: 'damage', value: 55 }, { type: 'bleed', value: 12, duration: 3 }],
        mpCost: 14, cooldown: 1, class: 'axe',
      },
      {
        id: 'ax_harvest', name: 'Harvest', icon: '🌾',
        description: 'Reap an enemy — bonus damage below 30% HP, can finish weakened foes.',
        tier: 4, path: 'path_a', requires: ['ax_grim_slash'],
        effects: [{ type: 'damage', value: 90 }, { type: 'execute', value: 40, chance: 0.35 }],
        mpCost: 20, cooldown: 2, class: 'axe',
      },
      {
        id: 'ax_death_blow', name: 'Death Blow', icon: '☠️',
        description: 'A lethal strike with a bleed (20/round, 3 rounds) and execute on low-HP foes.',
        tier: 4, path: 'path_a', requires: ['ax_grim_slash'],
        effects: [{ type: 'damage', value: 80 }, { type: 'bleed', value: 20, duration: 3 }, { type: 'execute', value: 50, chance: 0.25 }],
        mpCost: 22, cooldown: 2, class: 'axe',
      },
      {
        id: 'ax_grim_reaper', name: 'Grim Reaper', icon: '💀',
        description: 'Become the Reaper — massive damage, a heavy bleed (30/round, 3 rounds) and a strong execute.',
        tier: 5, path: 'path_a', requires: ['ax_harvest', 'ax_death_blow'],
        effects: [{ type: 'damage', value: 165 }, { type: 'bleed', value: 30, duration: 3 }, { type: 'execute', value: 70, chance: 0.5 }],
        mpCost: 38, cooldown: 4, class: 'axe',
      },
      // Path B — Berserker Axe
      {
        id: 'ax_feral_cleave', name: 'Feral Cleave', icon: '🌀',
        description: 'A feral cleave hitting all foes and boosting party attack (+12% for 2 rounds).',
        tier: 3, path: 'path_b', requires: ['ax_axe_mastery'],
        effects: [{ type: 'aoe', value: 38 }, { type: 'team_buff', value: 12, duration: 2, stat: 'attack' }],
        mpCost: 14, cooldown: 1, class: 'axe',
      },
      {
        id: 'ax_enrage', name: 'Enrage', icon: '😤',
        description: 'Enter a rage: AoE damage and a big party attack boost (+40% for 3 rounds).',
        tier: 4, path: 'path_b', requires: ['ax_feral_cleave'],
        effects: [{ type: 'aoe', value: 36 }, { type: 'team_buff', value: 40, duration: 3, stat: 'attack' }],
        mpCost: 19, cooldown: 2, class: 'axe',
      },
      {
        id: 'ax_spinning_axe', name: 'Spinning Axe', icon: '🔄',
        description: 'Spin with axes raised, hitting all enemies hard (stronger cleave).',
        tier: 4, path: 'path_b', requires: ['ax_feral_cleave'],
        effects: [{ type: 'aoe', value: 60 }],
        mpCost: 22, cooldown: 2, class: 'axe',
      },
      {
        id: 'ax_whirlwind', name: 'Whirlwind', icon: '🌪️',
        description: 'A living whirlwind: huge AoE, a bleed (12/round, 3 rounds) and a party attack boost (+45% for 3 rounds).',
        tier: 5, path: 'path_b', requires: ['ax_enrage', 'ax_spinning_axe'],
        effects: [{ type: 'aoe', value: 84 }, { type: 'bleed', value: 12, duration: 3 }, { type: 'team_buff', value: 45, duration: 3, stat: 'attack' }],
        mpCost: 36, cooldown: 4, class: 'axe',
      },
    ],
  },

  // ============================================================
  // HAMMER FIGHTER 🔨 — AoE stun + armor break / juggernaut
  // ============================================================
  {
    class: 'hammer',
    label: 'Hammer Fighter',
    icon: '🔨',
    description: 'Powerhouses who wield massive hammers. Path A: Earthshaker — AoE stuns and armor breaks. Path B: Juggernaut — devastating single hits and damage shields.',
    skills: [
      {
        id: 'hm_smash', name: 'Smash', icon: '🔨',
        description: 'A crushing hammer smash.',
        tier: 1, path: 'core', requires: [],
        effects: [{ type: 'damage', value: 22 }],
        mpCost: 0, cooldown: 0, class: 'hammer',
      },
      {
        id: 'hm_ground_pound', name: 'Ground Pound', icon: '💥',
        description: 'Slam the ground, hitting all foes and briefly breaking armor (defense -6 for 1 round).',
        tier: 1, path: 'core', requires: ['hm_smash'],
        effects: [{ type: 'aoe', value: 13 }, { type: 'pierce', value: 6, duration: 1, aoe: true }],
        mpCost: 4, cooldown: 0, class: 'hammer',
      },
      {
        id: 'hm_overhead_crush', name: 'Overhead Crush', icon: '⬇️',
        description: 'Crush down with full two-handed force.',
        tier: 2, path: 'core', requires: ['hm_ground_pound'],
        effects: [{ type: 'damage', value: 46 }],
        mpCost: 8, cooldown: 0, class: 'hammer',
      },
      {
        id: 'hm_concussive_blow', name: 'Concussive Blow', icon: '🌀',
        description: 'Strike hard enough to stagger, with a chance to stun (1 round).',
        tier: 2, path: 'core', requires: ['hm_overhead_crush'],
        effects: [{ type: 'damage', value: 35 }, { type: 'stun', value: 0, duration: 1, chance: 0.35 }],
        mpCost: 11, cooldown: 1, class: 'hammer',
      },
      {
        id: 'hm_hammer_mastery', name: 'Hammer Mastery', icon: '🏆',
        description: 'Channel the full power of the hammer.',
        tier: 3, path: 'core', requires: ['hm_concussive_blow'],
        effects: [{ type: 'damage', value: 65 }],
        mpCost: 15, cooldown: 1, class: 'hammer',
      },
      // Path A — Earthshaker
      {
        id: 'hm_seismic_slam', name: 'Seismic Slam', icon: '🌍',
        description: 'A shockwave through all enemies with a chance to stun each (1 round).',
        tier: 3, path: 'path_a', requires: ['hm_hammer_mastery'],
        effects: [{ type: 'aoe', value: 39 }, { type: 'stun', value: 0, duration: 1, chance: 0.45 }],
        mpCost: 16, cooldown: 1, class: 'hammer',
      },
      {
        id: 'hm_armor_crush', name: 'Armor Crush', icon: '🛡️',
        description: 'Smash through armor, leaving the foe vulnerable (defense -30 for 3 rounds).',
        tier: 4, path: 'path_a', requires: ['hm_seismic_slam'],
        effects: [{ type: 'damage', value: 80 }, { type: 'pierce', value: 30, duration: 3 }],
        mpCost: 20, cooldown: 2, class: 'hammer',
      },
      {
        id: 'hm_earthquake', name: 'Earthquake', icon: '🌋',
        description: 'A localized earthquake that reliably stuns all foes for 2 rounds.',
        tier: 4, path: 'path_a', requires: ['hm_seismic_slam'],
        effects: [{ type: 'aoe', value: 54 }, { type: 'stun', value: 0, duration: 2 }],
        mpCost: 22, cooldown: 2, class: 'hammer',
      },
      {
        id: 'hm_worldbreaker', name: 'Worldbreaker', icon: '💀',
        description: 'Shake the world: huge AoE, a 2-round stun and deep armor break (defense -35 for 3 rounds).',
        tier: 5, path: 'path_a', requires: ['hm_armor_crush', 'hm_earthquake'],
        effects: [{ type: 'aoe', value: 84 }, { type: 'stun', value: 0, duration: 2 }, { type: 'pierce', value: 35, duration: 3 }],
        mpCost: 38, cooldown: 4, class: 'hammer',
      },
      // Path B — Juggernaut
      {
        id: 'hm_juggernaut_charge', name: 'Juggernaut Charge', icon: '🚂',
        description: 'Charge forward, smashing the enemy with a chance to stun (1 round).',
        tier: 3, path: 'path_b', requires: ['hm_hammer_mastery'],
        effects: [{ type: 'damage', value: 70 }, { type: 'stun', value: 0, duration: 1, chance: 0.4 }],
        mpCost: 15, cooldown: 1, class: 'hammer',
      },
      {
        id: 'hm_iron_shell', name: 'Iron Shell', icon: '🐢',
        description: 'Harden into an iron shell: shield (100 for 3 rounds) and party defense (+20% for 3 rounds).',
        tier: 4, path: 'path_b', requires: ['hm_juggernaut_charge'],
        effects: [{ type: 'shield', value: 100, duration: 3 }, { type: 'team_buff', value: 20, duration: 3, stat: 'defense' }],
        mpCost: 20, cooldown: 2, class: 'hammer',
      },
      {
        id: 'hm_titan_blow', name: 'Titan Blow', icon: '🗿',
        description: 'Strike with the force of a titan in a single massive blow.',
        tier: 4, path: 'path_b', requires: ['hm_juggernaut_charge'],
        effects: [{ type: 'damage', value: 118 }],
        mpCost: 24, cooldown: 2, class: 'hammer',
      },
      {
        id: 'hm_unstoppable', name: 'Unstoppable', icon: '💪',
        description: 'Truly unstoppable — massive damage behind an impenetrable shield (100 for 3 rounds).',
        tier: 5, path: 'path_b', requires: ['hm_iron_shell', 'hm_titan_blow'],
        effects: [{ type: 'damage', value: 175 }, { type: 'shield', value: 100, duration: 3 }],
        mpCost: 37, cooldown: 4, class: 'hammer',
      },
    ],
  },

  // ============================================================
  // MONK 👊 — debuffs, lower damage, lifesteal/evasion
  // ============================================================
  {
    class: 'monk',
    label: 'Monk',
    icon: '👊',
    description: 'Disciplined martial artists who weaken foes through technique. Path A: Iron Fist — lifesteal combos and stuns. Path B: Wind Step — speed buffs and slowing chains.',
    skills: [
      {
        id: 'mk_jab', name: 'Jab', icon: '👊',
        description: 'A fast jab punch.',
        tier: 1, path: 'core', requires: [],
        effects: [{ type: 'damage', value: 13 }],
        mpCost: 0, cooldown: 0, class: 'monk',
      },
      {
        id: 'mk_combo_strike', name: 'Combo Strike', icon: '🥊',
        description: 'A quick flurry of strikes.',
        tier: 1, path: 'core', requires: ['mk_jab'],
        effects: [{ type: 'damage', value: 22 }],
        mpCost: 3, cooldown: 0, class: 'monk',
      },
      {
        id: 'mk_focus_strike', name: 'Focus Strike', icon: '🎯',
        description: 'A focused blow that finds a gap in armor (defense -8 for 2 rounds).',
        tier: 2, path: 'core', requires: ['mk_combo_strike'],
        effects: [{ type: 'damage', value: 30 }, { type: 'pierce', value: 8, duration: 2 }],
        mpCost: 7, cooldown: 0, class: 'monk',
      },
      {
        id: 'mk_ki_blast', name: 'Ki Blast', icon: '✨',
        description: 'Release stored ki energy in a blast.',
        tier: 2, path: 'core', requires: ['mk_focus_strike'],
        effects: [{ type: 'damage', value: 38 }],
        mpCost: 10, cooldown: 1, class: 'monk',
      },
      {
        id: 'mk_inner_mastery', name: 'Inner Mastery', icon: '☯️',
        description: 'Inner mastery: a measured strike that slows the foe (speed -10 for 2 rounds).',
        tier: 3, path: 'core', requires: ['mk_ki_blast'],
        effects: [{ type: 'damage', value: 48 }, { type: 'slow', value: 10, duration: 2 }],
        mpCost: 14, cooldown: 1, class: 'monk',
      },
      // Path A — Iron Fist
      {
        id: 'mk_iron_fist', name: 'Iron Fist', icon: '🦾',
        description: 'An iron-hard fist that drains vitality — heal for 20% of damage dealt.',
        tier: 3, path: 'path_a', requires: ['mk_inner_mastery'],
        effects: [{ type: 'damage', value: 52 }, { type: 'lifesteal', value: 20 }],
        mpCost: 14, cooldown: 1, class: 'monk',
      },
      {
        id: 'mk_dragon_punch', name: 'Dragon Punch', icon: '🐉',
        description: 'A rising punch that stuns (1 round) and heals for 30% of damage dealt.',
        tier: 4, path: 'path_a', requires: ['mk_iron_fist'],
        effects: [{ type: 'damage', value: 70 }, { type: 'stun', value: 0, duration: 1 }, { type: 'lifesteal', value: 30 }],
        mpCost: 19, cooldown: 2, class: 'monk',
      },
      {
        id: 'mk_soul_drain', name: 'Soul Drain', icon: '💜',
        description: 'Drain the enemy\'s life force, healing for 50% of damage dealt.',
        tier: 4, path: 'path_a', requires: ['mk_iron_fist'],
        effects: [{ type: 'damage', value: 60 }, { type: 'lifesteal', value: 50 }],
        mpCost: 22, cooldown: 2, class: 'monk',
      },
      {
        id: 'mk_thousand_fists', name: 'Thousand Fists', icon: '👐',
        description: 'A blinding flurry — strong damage that heals you for 60% of it.',
        tier: 5, path: 'path_a', requires: ['mk_dragon_punch', 'mk_soul_drain'],
        effects: [{ type: 'damage', value: 130 }, { type: 'lifesteal', value: 60 }],
        mpCost: 36, cooldown: 4, class: 'monk',
      },
      // Path B — Wind Step
      {
        id: 'mk_wind_step', name: 'Wind Step', icon: '💨',
        description: 'Move with the wind: a strike that boosts party speed (+25% for 3 rounds).',
        tier: 3, path: 'path_b', requires: ['mk_inner_mastery'],
        effects: [{ type: 'damage', value: 40 }, { type: 'team_buff', value: 25, duration: 3, stat: 'speed' }],
        mpCost: 13, cooldown: 1, class: 'monk',
      },
      {
        id: 'mk_phantom_strike', name: 'Phantom Strike', icon: '👻',
        description: 'Strike all foes like a phantom, slowing them (speed -12 for 2 rounds).',
        tier: 4, path: 'path_b', requires: ['mk_wind_step'],
        effects: [{ type: 'aoe', value: 55 }, { type: 'slow', value: 12, duration: 2 }],
        mpCost: 20, cooldown: 2, class: 'monk',
      },
      {
        id: 'mk_evasive_strike', name: 'Evasive Strike', icon: '🌬️',
        description: 'Dodge and counter, gaining a small shield (40 for 2 rounds).',
        tier: 4, path: 'path_b', requires: ['mk_wind_step'],
        effects: [{ type: 'damage', value: 65 }, { type: 'shield', value: 40, duration: 2 }],
        mpCost: 20, cooldown: 2, class: 'monk',
      },
      {
        id: 'mk_hurricane_kick', name: 'Hurricane Kick', icon: '🌪️',
        description: 'A hurricane of kicks: AoE damage, slow (speed -16 for 2 rounds) and party speed (+30% for 3 rounds).',
        tier: 5, path: 'path_b', requires: ['mk_phantom_strike', 'mk_evasive_strike'],
        effects: [{ type: 'aoe', value: 78 }, { type: 'slow', value: 16, duration: 2 }, { type: 'team_buff', value: 30, duration: 3, stat: 'speed' }],
        mpCost: 37, cooldown: 4, class: 'monk',
      },
    ],
  },

  // ============================================================
  // PALADIN 🛡️ — tanky holy
  // ============================================================
  {
    class: 'paladin',
    label: 'Paladin',
    icon: '🛡️',
    description: 'Holy warriors combining faith and steel. Path A: Holy Warrior — smite damage with healing and divine shields. Path B: Crusader — AoE holy attacks and group buffs.',
    skills: [
      {
        id: 'pl_holy_strike', name: 'Holy Strike', icon: '✨',
        description: 'Imbue your weapon with holy light and strike.',
        tier: 1, path: 'core', requires: [],
        effects: [{ type: 'damage', value: 17 }],
        mpCost: 2, cooldown: 0, class: 'paladin',
      },
      {
        id: 'pl_minor_heal', name: 'Minor Heal', icon: '💚',
        description: 'Restore a small amount of health.',
        tier: 1, path: 'core', requires: ['pl_holy_strike'],
        effects: [{ type: 'heal', value: 15 }],
        mpCost: 4, cooldown: 0, class: 'paladin',
      },
      {
        id: 'pl_consecrate', name: 'Consecrate', icon: '🌟',
        description: 'Consecrated ground deals holy damage and heals you a little.',
        tier: 2, path: 'core', requires: ['pl_minor_heal'],
        effects: [{ type: 'damage', value: 32 }, { type: 'heal', value: 16 }],
        mpCost: 9, cooldown: 0, class: 'paladin',
      },
      {
        id: 'pl_divine_favor', name: 'Divine Favor', icon: '🙏',
        description: 'Call on divine favor: heal and raise party defense (+15% for 3 rounds).',
        tier: 2, path: 'core', requires: ['pl_consecrate'],
        effects: [{ type: 'heal', value: 20 }, { type: 'team_buff', value: 15, duration: 3, stat: 'defense' }],
        mpCost: 11, cooldown: 1, class: 'paladin',
      },
      {
        id: 'pl_holy_mastery', name: 'Holy Mastery', icon: '☀️',
        description: 'Mastery of holy power: a strong smite that heals you.',
        tier: 3, path: 'core', requires: ['pl_divine_favor'],
        effects: [{ type: 'damage', value: 55 }, { type: 'heal', value: 30 }],
        mpCost: 15, cooldown: 1, class: 'paladin',
      },
      // Path A — Holy Warrior
      {
        id: 'pl_smite', name: 'Smite', icon: '⚡',
        description: 'A powerful smiting strike that heals you.',
        tier: 3, path: 'path_a', requires: ['pl_holy_mastery'],
        effects: [{ type: 'damage', value: 65 }, { type: 'heal', value: 25 }],
        mpCost: 16, cooldown: 1, class: 'paladin',
      },
      {
        id: 'pl_divine_shield', name: 'Divine Shield', icon: '🛡️',
        description: 'A divine shield absorbing up to 120 damage for 2 rounds, plus a heal.',
        tier: 4, path: 'path_a', requires: ['pl_smite'],
        effects: [{ type: 'shield', value: 120, duration: 2 }, { type: 'heal', value: 40 }],
        mpCost: 20, cooldown: 2, class: 'paladin',
      },
      {
        id: 'pl_holy_wrath', name: 'Holy Wrath', icon: '😇',
        description: 'Unleash holy wrath — a devastating strike that heals you.',
        tier: 4, path: 'path_a', requires: ['pl_smite'],
        effects: [{ type: 'damage', value: 110 }, { type: 'heal', value: 45 }],
        mpCost: 23, cooldown: 2, class: 'paladin',
      },
      {
        id: 'pl_avatar_of_light', name: 'Avatar of Light', icon: '🌞',
        description: 'Become an Avatar of Light — devastating damage, a big heal and a shield (80 for 3 rounds).',
        tier: 5, path: 'path_a', requires: ['pl_divine_shield', 'pl_holy_wrath'],
        effects: [{ type: 'damage', value: 165 }, { type: 'heal', value: 90 }, { type: 'shield', value: 80, duration: 3 }],
        mpCost: 40, cooldown: 4, class: 'paladin',
      },
      // Path B — Crusader
      {
        id: 'pl_holy_nova', name: 'Holy Nova', icon: '💫',
        description: 'A nova of holy light hitting all enemies and healing you.',
        tier: 3, path: 'path_b', requires: ['pl_holy_mastery'],
        effects: [{ type: 'aoe', value: 33 }, { type: 'heal', value: 20 }],
        mpCost: 15, cooldown: 1, class: 'paladin',
      },
      {
        id: 'pl_crusader_aura', name: 'Crusader Aura', icon: '✝️',
        description: 'An aura that heals and buffs party attack (+25% for 3 rounds).',
        tier: 4, path: 'path_b', requires: ['pl_holy_nova'],
        effects: [{ type: 'heal', value: 30 }, { type: 'team_buff', value: 25, duration: 3, stat: 'attack' }],
        mpCost: 20, cooldown: 2, class: 'paladin',
      },
      {
        id: 'pl_holy_judgment', name: 'Holy Judgment', icon: '⚖️',
        description: 'Holy judgment on all foes, breaking their armor (defense -20 for 2 rounds).',
        tier: 4, path: 'path_b', requires: ['pl_holy_nova'],
        effects: [{ type: 'aoe', value: 60 }, { type: 'pierce', value: 20, duration: 2, aoe: true }],
        mpCost: 22, cooldown: 2, class: 'paladin',
      },
      {
        id: 'pl_crusade', name: 'Crusade', icon: '🏰',
        description: 'A holy crusade — smite all foes, heal, and massively buff party attack (+40% for 3 rounds).',
        tier: 5, path: 'path_b', requires: ['pl_crusader_aura', 'pl_holy_judgment'],
        effects: [{ type: 'aoe', value: 90 }, { type: 'heal', value: 60 }, { type: 'team_buff', value: 40, duration: 3, stat: 'attack' }],
        mpCost: 38, cooldown: 4, class: 'paladin',
      },
    ],
  },

  // ============================================================
  // ASSASSIN 🗡️ — bleed/poison + execute + stun
  // ============================================================
  {
    class: 'assassin',
    label: 'Assassin',
    icon: '🗡️',
    description: 'Swift killers who strike from the shadows. Path A: Shadow — stun and execute from stealth. Path B: Venomancer — poison DoTs and stacking debuffs.',
    skills: [
      {
        id: 'as_backstab', name: 'Backstab', icon: '🗡️',
        description: 'Strike from behind for increased damage.',
        tier: 1, path: 'core', requires: [],
        effects: [{ type: 'damage', value: 22 }],
        mpCost: 2, cooldown: 0, class: 'assassin',
      },
      {
        id: 'as_quick_stab', name: 'Quick Stab', icon: '⚡',
        description: 'Two rapid stabs in quick succession.',
        tier: 1, path: 'core', requires: ['as_backstab'],
        effects: [{ type: 'damage', value: 26 }],
        mpCost: 3, cooldown: 0, class: 'assassin',
      },
      {
        id: 'as_cripple', name: 'Cripple', icon: '🦵',
        description: 'Cripple a leg, slowing the enemy (speed -12 for 2 rounds).',
        tier: 2, path: 'core', requires: ['as_quick_stab'],
        effects: [{ type: 'damage', value: 30 }, { type: 'slow', value: 12, duration: 2 }],
        mpCost: 8, cooldown: 0, class: 'assassin',
      },
      {
        id: 'as_shadow_step', name: 'Shadow Step', icon: '👣',
        description: 'Step through shadows: a strike and a party attack boost (+20% for 2 rounds).',
        tier: 2, path: 'core', requires: ['as_cripple'],
        effects: [{ type: 'damage', value: 28 }, { type: 'team_buff', value: 20, duration: 2, stat: 'attack' }],
        mpCost: 10, cooldown: 1, class: 'assassin',
      },
      {
        id: 'as_shadow_mastery', name: 'Shadow Mastery', icon: '🌑',
        description: 'Master the shadows: a deadly strike that opens a bleed (10/round, 2 rounds).',
        tier: 3, path: 'core', requires: ['as_shadow_step'],
        effects: [{ type: 'damage', value: 58 }, { type: 'bleed', value: 10, duration: 2 }],
        mpCost: 14, cooldown: 1, class: 'assassin',
      },
      // Path A — Shadow
      {
        id: 'as_garrote', name: 'Garrote', icon: '😶',
        description: 'Choke the enemy, stunning them for 2 rounds.',
        tier: 3, path: 'path_a', requires: ['as_shadow_mastery'],
        effects: [{ type: 'damage', value: 48 }, { type: 'stun', value: 0, duration: 2 }],
        mpCost: 15, cooldown: 1, class: 'assassin',
      },
      {
        id: 'as_shadow_vanish', name: 'Shadow Vanish', icon: '🌫️',
        description: 'Vanish then strike with force, boosting party attack (+35% for 2 rounds).',
        tier: 4, path: 'path_a', requires: ['as_garrote'],
        effects: [{ type: 'damage', value: 90 }, { type: 'team_buff', value: 35, duration: 2, stat: 'attack' }],
        mpCost: 20, cooldown: 2, class: 'assassin',
      },
      {
        id: 'as_marked_for_death', name: 'Marked for Death', icon: '🎯',
        description: 'Mark an enemy — your hit executes low-HP foes (bonus below 30%, finishes below 15%).',
        tier: 4, path: 'path_a', requires: ['as_garrote'],
        effects: [{ type: 'damage', value: 80 }, { type: 'execute', value: 60, chance: 0.6 }],
        mpCost: 22, cooldown: 2, class: 'assassin',
      },
      {
        id: 'as_death_from_shadows', name: 'Death From Shadows', icon: '💀',
        description: 'Emerge from darkness for an assassination — execute and a 2-round stun.',
        tier: 5, path: 'path_a', requires: ['as_shadow_vanish', 'as_marked_for_death'],
        effects: [{ type: 'damage', value: 170 }, { type: 'execute', value: 80, chance: 0.5 }, { type: 'stun', value: 0, duration: 2 }],
        mpCost: 38, cooldown: 4, class: 'assassin',
      },
      // Path B — Venomancer
      {
        id: 'as_envenom', name: 'Envenom', icon: '🐍',
        description: 'Coat your blade in venom, poisoning the enemy (18/round for 3 rounds).',
        tier: 3, path: 'path_b', requires: ['as_shadow_mastery'],
        effects: [{ type: 'damage', value: 42 }, { type: 'poison', value: 18, duration: 3 }],
        mpCost: 14, cooldown: 1, class: 'assassin',
      },
      {
        id: 'as_toxic_cloud', name: 'Toxic Cloud', icon: '☁️',
        description: 'A toxic cloud poisoning all foes (20/round for 3 rounds).',
        tier: 4, path: 'path_b', requires: ['as_envenom'],
        effects: [{ type: 'aoe', value: 30 }, { type: 'poison', value: 20, duration: 3 }],
        mpCost: 21, cooldown: 2, class: 'assassin',
      },
      {
        id: 'as_crippling_poison', name: 'Crippling Poison', icon: '🧪',
        description: 'A crippling poison (28/round, 3 rounds) that also slows (speed -16 for 3 rounds).',
        tier: 4, path: 'path_b', requires: ['as_envenom'],
        effects: [{ type: 'poison', value: 28, duration: 3 }, { type: 'slow', value: 16, duration: 3 }],
        mpCost: 20, cooldown: 2, class: 'assassin',
      },
      {
        id: 'as_death_venom', name: 'Death Venom', icon: '💀',
        description: 'A lethal dose: damage, heavy poison (45/round, 3 rounds) and armor break (defense -20 for 3 rounds).',
        tier: 5, path: 'path_b', requires: ['as_toxic_cloud', 'as_crippling_poison'],
        effects: [{ type: 'damage', value: 100 }, { type: 'poison', value: 45, duration: 3 }, { type: 'pierce', value: 20, duration: 3 }],
        mpCost: 37, cooldown: 4, class: 'assassin',
      },
    ],
  },

  // ============================================================
  // CLERIC ✝️ — heals + holy + HoT
  // ============================================================
  {
    class: 'cleric',
    label: 'Cleric',
    icon: '✝️',
    description: 'Holy healers with surprising combat prowess. Path A: Battle Cleric — smite damage and healing. Path B: High Priest — mass healing and heal-over-time.',
    skills: [
      {
        id: 'cl_mace_strike', name: 'Mace Strike', icon: '🪄',
        description: 'Strike with your holy mace.',
        tier: 1, path: 'core', requires: [],
        effects: [{ type: 'damage', value: 14 }],
        mpCost: 1, cooldown: 0, class: 'cleric',
      },
      {
        id: 'cl_heal', name: 'Heal', icon: '💚',
        description: 'Restore health to yourself.',
        tier: 1, path: 'core', requires: ['cl_mace_strike'],
        effects: [{ type: 'heal', value: 18 }],
        mpCost: 4, cooldown: 0, class: 'cleric',
      },
      {
        id: 'cl_holy_light', name: 'Holy Light', icon: '🌟',
        description: 'Holy light damages a foe and heals you.',
        tier: 2, path: 'core', requires: ['cl_heal'],
        effects: [{ type: 'damage', value: 30 }, { type: 'heal', value: 18 }],
        mpCost: 9, cooldown: 0, class: 'cleric',
      },
      {
        id: 'cl_bless', name: 'Bless', icon: '🙏',
        description: 'Bless the party: heal and raise attack (+15% for 3 rounds).',
        tier: 2, path: 'core', requires: ['cl_holy_light'],
        effects: [{ type: 'heal', value: 22 }, { type: 'team_buff', value: 15, duration: 3, stat: 'attack' }],
        mpCost: 11, cooldown: 1, class: 'cleric',
      },
      {
        id: 'cl_divine_mastery', name: 'Divine Mastery', icon: '✝️',
        description: 'Master divine magic: a smite that heals strongly.',
        tier: 3, path: 'core', requires: ['cl_bless'],
        effects: [{ type: 'damage', value: 50 }, { type: 'heal', value: 35 }],
        mpCost: 15, cooldown: 1, class: 'cleric',
      },
      // Path A — Battle Cleric
      {
        id: 'cl_righteous_smite', name: 'Righteous Smite', icon: '⚡',
        description: 'Smite with righteous fury and heal yourself.',
        tier: 3, path: 'path_a', requires: ['cl_divine_mastery'],
        effects: [{ type: 'damage', value: 65 }, { type: 'heal', value: 22 }],
        mpCost: 16, cooldown: 1, class: 'cleric',
      },
      {
        id: 'cl_holy_fervor', name: 'Holy Fervor', icon: '🔥',
        description: 'A fervent strike that heals and boosts party attack (+28% for 3 rounds).',
        tier: 4, path: 'path_a', requires: ['cl_righteous_smite'],
        effects: [{ type: 'damage', value: 55 }, { type: 'heal', value: 45 }, { type: 'team_buff', value: 28, duration: 3, stat: 'attack' }],
        mpCost: 20, cooldown: 2, class: 'cleric',
      },
      {
        id: 'cl_judgment', name: 'Judgment', icon: '⚖️',
        description: 'Deliver divine judgment with a powerful strike and a heal.',
        tier: 4, path: 'path_a', requires: ['cl_righteous_smite'],
        effects: [{ type: 'damage', value: 108 }, { type: 'heal', value: 38 }],
        mpCost: 22, cooldown: 2, class: 'cleric',
      },
      {
        id: 'cl_divine_intervention', name: 'Divine Intervention', icon: '👼',
        description: 'Call for divine intervention — massive holy damage and a huge heal.',
        tier: 5, path: 'path_a', requires: ['cl_holy_fervor', 'cl_judgment'],
        effects: [{ type: 'damage', value: 150 }, { type: 'heal', value: 100 }],
        mpCost: 40, cooldown: 4, class: 'cleric',
      },
      // Path B — High Priest
      {
        id: 'cl_greater_heal', name: 'Greater Heal', icon: '💖',
        description: 'Restore a large amount of health.',
        tier: 3, path: 'path_b', requires: ['cl_divine_mastery'],
        effects: [{ type: 'heal', value: 60 }],
        mpCost: 16, cooldown: 1, class: 'cleric',
      },
      {
        id: 'cl_mass_heal', name: 'Mass Heal', icon: '💚',
        description: 'A wave of holy energy: a heal plus regeneration (12 HP/round for 3 rounds).',
        tier: 4, path: 'path_b', requires: ['cl_greater_heal'],
        effects: [{ type: 'heal', value: 48 }, { type: 'hot', value: 12, duration: 3 }],
        mpCost: 22, cooldown: 2, class: 'cleric',
      },
      {
        id: 'cl_resurrection_light', name: 'Resurrection Light', icon: '💫',
        description: 'Bathe in resurrection light: a heal and strong regeneration (18 HP/round for 4 rounds).',
        tier: 4, path: 'path_b', requires: ['cl_greater_heal'],
        effects: [{ type: 'heal', value: 55 }, { type: 'hot', value: 18, duration: 4 }],
        mpCost: 22, cooldown: 2, class: 'cleric',
      },
      {
        id: 'cl_miracle', name: 'Miracle', icon: '🌈',
        description: 'A miracle — a huge heal, regeneration (20/round, 4 rounds) and party defense (+30% for 4 rounds).',
        tier: 5, path: 'path_b', requires: ['cl_mass_heal', 'cl_resurrection_light'],
        effects: [{ type: 'heal', value: 120 }, { type: 'hot', value: 20, duration: 4 }, { type: 'team_buff', value: 30, duration: 4, stat: 'defense' }],
        mpCost: 40, cooldown: 4, class: 'cleric',
      },
    ],
  },

  // ============================================================
  // SHAMAN 🌿 — nature/mixed DoT + hex pierce + slow
  // ============================================================
  {
    class: 'shaman',
    label: 'Shaman',
    icon: '🌿',
    description: 'Spiritual conduits to nature and the spirit world. Path A: Elementalist — multi-element DoTs and slows. Path B: Hexer — stacking pierce curses and poison.',
    skills: [
      {
        id: 'sh_spirit_bolt', name: 'Spirit Bolt', icon: '✨',
        description: 'Channel spirit energy into a bolt.',
        tier: 1, path: 'core', requires: [],
        effects: [{ type: 'damage', value: 15 }],
        mpCost: 3, cooldown: 0, class: 'shaman',
      },
      {
        id: 'sh_earth_shock', name: 'Earth Shock', icon: '🌍',
        description: 'Shock an enemy and briefly slow them (speed -7 for 1 round).',
        tier: 1, path: 'core', requires: ['sh_spirit_bolt'],
        effects: [{ type: 'damage', value: 16 }, { type: 'slow', value: 7, duration: 1 }],
        mpCost: 4, cooldown: 0, class: 'shaman',
      },
      {
        id: 'sh_flame_totem', name: 'Flame Totem', icon: '🗿',
        description: 'A flame totem scorches the enemy with a burn (14/round for 3 rounds).',
        tier: 2, path: 'core', requires: ['sh_earth_shock'],
        effects: [{ type: 'damage', value: 20 }, { type: 'dot', value: 14, duration: 3 }],
        mpCost: 10, cooldown: 1, class: 'shaman',
      },
      {
        id: 'sh_storm_call', name: 'Storm Call', icon: '⛈️',
        description: 'Call a storm on all foes, slowing them (speed -8 for 2 rounds).',
        tier: 2, path: 'core', requires: ['sh_flame_totem'],
        effects: [{ type: 'aoe', value: 24 }, { type: 'slow', value: 8, duration: 2 }],
        mpCost: 11, cooldown: 1, class: 'shaman',
      },
      {
        id: 'sh_elemental_mastery', name: 'Elemental Mastery', icon: '🌿',
        description: 'Master the elements: a strong hit that slows (speed -10 for 2 rounds).',
        tier: 3, path: 'core', requires: ['sh_storm_call'],
        effects: [{ type: 'damage', value: 56 }, { type: 'slow', value: 10, duration: 2 }],
        mpCost: 15, cooldown: 1, class: 'shaman',
      },
      // Path A — Elementalist
      {
        id: 'sh_multi_element', name: 'Multi-Element Blast', icon: '🌈',
        description: 'Fire, ice and lightning at once: a burn (14/round, 3 rounds) and a slow (-10 for 2 rounds).',
        tier: 3, path: 'path_a', requires: ['sh_elemental_mastery'],
        effects: [{ type: 'damage', value: 55 }, { type: 'dot', value: 14, duration: 3 }, { type: 'slow', value: 10, duration: 2 }],
        mpCost: 16, cooldown: 1, class: 'shaman',
      },
      {
        id: 'sh_spirit_wolf', name: 'Spirit Wolf', icon: '🐺',
        description: 'A spirit wolf mauls the enemy, leaving a bleed (18/round for 3 rounds).',
        tier: 4, path: 'path_a', requires: ['sh_multi_element'],
        effects: [{ type: 'damage', value: 55 }, { type: 'bleed', value: 18, duration: 3 }],
        mpCost: 22, cooldown: 2, class: 'shaman',
      },
      {
        id: 'sh_elemental_fury', name: 'Elemental Fury', icon: '🌀',
        description: 'A furious elemental AoE leaving a burn on all foes (16/round for 3 rounds).',
        tier: 4, path: 'path_a', requires: ['sh_multi_element'],
        effects: [{ type: 'aoe', value: 54 }, { type: 'dot', value: 16, duration: 3 }],
        mpCost: 22, cooldown: 2, class: 'shaman',
      },
      {
        id: 'sh_elemental_apocalypse', name: 'Elemental Apocalypse', icon: '💥',
        description: 'All elements ravage every foe: huge AoE, a burn (30/round, 3 rounds) and a slow (-18 for 3 rounds).',
        tier: 5, path: 'path_a', requires: ['sh_spirit_wolf', 'sh_elemental_fury'],
        effects: [{ type: 'aoe', value: 84 }, { type: 'dot', value: 30, duration: 3 }, { type: 'slow', value: 18, duration: 3 }],
        mpCost: 40, cooldown: 4, class: 'shaman',
      },
      // Path B — Hexer
      {
        id: 'sh_hex', name: 'Hex', icon: '🔮',
        description: 'A weakening hex that breaks armor (defense -22 for 3 rounds).',
        tier: 3, path: 'path_b', requires: ['sh_elemental_mastery'],
        effects: [{ type: 'damage', value: 42 }, { type: 'pierce', value: 22, duration: 3 }],
        mpCost: 14, cooldown: 1, class: 'shaman',
      },
      {
        id: 'sh_stacking_curse', name: 'Stacking Curse', icon: '📿',
        description: 'A curse: poison (24/round, 3 rounds) and armor break (defense -18 for 4 rounds).',
        tier: 4, path: 'path_b', requires: ['sh_hex'],
        effects: [{ type: 'poison', value: 24, duration: 3 }, { type: 'pierce', value: 18, duration: 4 }],
        mpCost: 20, cooldown: 2, class: 'shaman',
      },
      {
        id: 'sh_voodoo_strike', name: 'Voodoo Strike', icon: '🪆',
        description: 'A voodoo strike that breaks armor (defense -28 for 3 rounds) with a chance to stun (1 round).',
        tier: 4, path: 'path_b', requires: ['sh_hex'],
        effects: [{ type: 'damage', value: 78 }, { type: 'pierce', value: 28, duration: 3 }, { type: 'stun', value: 0, duration: 1, chance: 0.35 }],
        mpCost: 22, cooldown: 2, class: 'shaman',
      },
      {
        id: 'sh_ancient_curse', name: 'Ancient Curse', icon: '💀',
        description: 'An ancient curse: damage, heavy poison (30/round, 3 rounds) and a devastating armor break (-50 for 4 rounds).',
        tier: 5, path: 'path_b', requires: ['sh_stacking_curse', 'sh_voodoo_strike'],
        effects: [{ type: 'damage', value: 130 }, { type: 'poison', value: 30, duration: 3 }, { type: 'pierce', value: 50, duration: 4 }],
        mpCost: 38, cooldown: 4, class: 'shaman',
      },
    ],
  },

  // ============================================================
  // BARD 🎵 — team buffs / HoT ONLY (no direct damage past T2, no direct heal)
  // Path A: Virtuoso (party buffs + HoT) | Path B: Trickster (enemy debuff songs)
  // ============================================================
  {
    class: 'bard',
    label: 'Bard',
    icon: '🎵',
    description: 'Musical warriors who empower the party with song. Path A: Virtuoso — powerful party buffs and heal-over-time. Path B: Trickster — debuff songs that weaken every foe.',
    skills: [
      {
        id: 'bd_ballad', name: 'Battle Ballad', icon: '🎵',
        description: 'A rousing ballad: a light strike and a small party attack buff (+5% for 2 rounds).',
        tier: 1, path: 'core', requires: [],
        effects: [{ type: 'damage', value: 13 }, { type: 'team_buff', value: 5, duration: 2, stat: 'attack' }],
        mpCost: 2, cooldown: 0, class: 'bard',
      },
      {
        id: 'bd_dissonance', name: 'Dissonance', icon: '🎸',
        description: 'A discordant note: a light strike that briefly rattles armor (defense -6 for 1 round).',
        tier: 1, path: 'core', requires: ['bd_ballad'],
        effects: [{ type: 'damage', value: 16 }, { type: 'pierce', value: 6, duration: 1 }],
        mpCost: 4, cooldown: 0, class: 'bard',
      },
      {
        id: 'bd_war_song', name: 'War Song', icon: '🥁',
        description: 'Drums of war boost party attack (+16% for 3 rounds).',
        tier: 2, path: 'core', requires: ['bd_dissonance'],
        effects: [{ type: 'team_buff', value: 16, duration: 3, stat: 'attack' }],
        mpCost: 8, cooldown: 0, class: 'bard',
      },
      {
        id: 'bd_sonic_wave', name: 'Sonic Wave', icon: '〰️',
        description: 'A protective resonance: party defense (+12% for 2 rounds) and speed (+8% for 2 rounds).',
        tier: 2, path: 'core', requires: ['bd_war_song'],
        effects: [{ type: 'team_buff', value: 12, duration: 2, stat: 'defense' }, { type: 'team_buff', value: 8, duration: 2, stat: 'speed' }],
        mpCost: 11, cooldown: 1, class: 'bard',
      },
      {
        id: 'bd_song_mastery', name: 'Song Mastery', icon: '🎼',
        description: 'Master the art of song: party attack (+14%) and defense (+14%) for 3 rounds.',
        tier: 3, path: 'core', requires: ['bd_sonic_wave'],
        effects: [{ type: 'team_buff', value: 14, duration: 3, stat: 'attack' }, { type: 'team_buff', value: 14, duration: 3, stat: 'defense' }],
        mpCost: 15, cooldown: 1, class: 'bard',
      },
      // Path A — Virtuoso (buffs + HoT)
      {
        id: 'bd_inspire', name: 'Inspire', icon: '⭐',
        description: 'A soaring melody: party attack (+24% for 3 rounds) and regeneration (10 HP/round for 3 rounds).',
        tier: 3, path: 'path_a', requires: ['bd_song_mastery'],
        effects: [{ type: 'team_buff', value: 24, duration: 3, stat: 'attack' }, { type: 'hot', value: 10, duration: 3 }],
        mpCost: 14, cooldown: 1, class: 'bard',
      },
      {
        id: 'bd_anthem', name: 'Anthem of Victory', icon: '🎺',
        description: 'An anthem buffing party attack (+28%) and defense (+18%) for 3 rounds.',
        tier: 4, path: 'path_a', requires: ['bd_inspire'],
        effects: [{ type: 'team_buff', value: 28, duration: 3, stat: 'attack' }, { type: 'team_buff', value: 18, duration: 3, stat: 'defense' }],
        mpCost: 20, cooldown: 2, class: 'bard',
      },
      {
        id: 'bd_power_chord', name: 'Power Chord', icon: '🎸',
        description: 'A driving chord: party attack (+35%) and speed (+20%) for 3 rounds.',
        tier: 4, path: 'path_a', requires: ['bd_inspire'],
        effects: [{ type: 'team_buff', value: 35, duration: 3, stat: 'attack' }, { type: 'team_buff', value: 20, duration: 3, stat: 'speed' }],
        mpCost: 23, cooldown: 2, class: 'bard',
      },
      {
        id: 'bd_magnum_opus', name: 'Magnum Opus', icon: '🎹',
        description: 'A masterpiece: party attack (+42%) and defense (+30%) for 4 rounds, plus regeneration (18 HP/round for 4 rounds).',
        tier: 5, path: 'path_a', requires: ['bd_anthem', 'bd_power_chord'],
        effects: [{ type: 'team_buff', value: 42, duration: 4, stat: 'attack' }, { type: 'team_buff', value: 30, duration: 4, stat: 'defense' }, { type: 'hot', value: 18, duration: 4 }],
        mpCost: 40, cooldown: 4, class: 'bard',
      },
      // Path B — Trickster (enemy debuff songs, no direct damage)
      {
        id: 'bd_mock', name: 'Mock', icon: '🤣',
        description: 'A mocking tune weakens a foe: armor break (defense -20 for 3 rounds) and slow (speed -10 for 2 rounds).',
        tier: 3, path: 'path_b', requires: ['bd_song_mastery'],
        effects: [{ type: 'pierce', value: 20, duration: 3 }, { type: 'slow', value: 10, duration: 2 }],
        mpCost: 14, cooldown: 1, class: 'bard',
      },
      {
        id: 'bd_chain_taunt', name: 'Chain Taunt', icon: '🔗',
        description: 'A taunt that chains across all foes, breaking their armor (defense -22 for 3 rounds).',
        tier: 4, path: 'path_b', requires: ['bd_mock'],
        effects: [{ type: 'pierce', value: 22, duration: 3, aoe: true }],
        mpCost: 20, cooldown: 2, class: 'bard',
      },
      {
        id: 'bd_discord', name: 'Discord', icon: '💔',
        description: 'A song of discord slows all foes (speed -16 for 3 rounds) and breaks armor (defense -12 for 3 rounds).',
        tier: 4, path: 'path_b', requires: ['bd_mock'],
        effects: [{ type: 'slow', value: 16, duration: 3, aoe: true }, { type: 'pierce', value: 12, duration: 3, aoe: true }],
        mpCost: 22, cooldown: 2, class: 'bard',
      },
      {
        id: 'bd_cacophony', name: 'Cacophony', icon: '📢',
        description: 'A catastrophic cacophony: stun all foes (2 rounds) and shatter their armor (defense -30 for 3 rounds).',
        tier: 5, path: 'path_b', requires: ['bd_chain_taunt', 'bd_discord'],
        effects: [{ type: 'stun', value: 0, duration: 2, aoe: true }, { type: 'pierce', value: 30, duration: 3, aoe: true }],
        mpCost: 38, cooldown: 4, class: 'bard',
      },
    ],
  },
]

export const SKILL_MAP: Record<string, CombatSkill> = Object.fromEntries(
  SKILL_TREES.flatMap(t => t.skills).map(s => [s.id, s])
)
