// ============================================================
// combatStrategies.ts — combat strategy / preset catalog
//
// IMPORTANT: this is the SERVER copy of src/game/data/combatStrategies.ts.
// It is the authoritative catalog used to validate shop:buy_strategy
// purchases (strategy/preset existence and pricing).
// The two files must stay in sync: if you change ANY strategy or
// preset in either file, make the identical change in the other.
// (Same pattern as server/game/data/equipmentGen.ts.)
// ============================================================

export type ConditionType =
  | 'self_hp_below'
  | 'self_hp_above'
  | 'self_mp_below'
  | 'enemy_hp_below'
  | 'enemy_hp_above'
  | 'enemy_count_above'
  | 'turn_number_lte'
  | 'turn_number_gte'
  | 'ally_hp_below'
  | 'enemy_has_buff'
  | 'self_has_debuff'
  | 'random_chance'

export type ActionType =
  | 'use_skill'
  | 'use_best_heal'
  | 'use_strongest_attack'
  | 'use_aoe'
  | 'defend'

export interface StrategyCondition {
  type: ConditionType
  value: number
}

export interface CombatStrategy {
  id: string
  name: string
  description: string
  priority: number
  condition: StrategyCondition
  action: ActionType
  skillId?: string
  targetMode: 'lowest_hp' | 'highest_hp' | 'random' | 'self' | 'all'
}

export interface StrategyPreset {
  id: string
  name: string
  description: string
  icon: string
  strategies: string[]
}

export const STRATEGIES: CombatStrategy[] = [
  // ── Critical survival ──────────────────────────────────────────────────────
  {
    id: 'emergency_heal',
    name: 'Emergency Heal',
    description: 'When HP drops below 25%, immediately use the strongest available heal on self.',
    priority: 1,
    condition: { type: 'self_hp_below', value: 25 },
    action: 'use_best_heal',
    targetMode: 'self',
  },
  {
    id: 'critical_heal',
    name: 'Critical Heal',
    description: 'When HP drops below 15%, use a powerful healing skill regardless of cost.',
    priority: 1,
    condition: { type: 'self_hp_below', value: 15 },
    action: 'use_skill',
    skillId: 'greater_heal',
    targetMode: 'self',
  },
  {
    id: 'debuff_counter',
    name: 'Debuff Counter',
    description: 'If afflicted with a debuff, immediately cleanse it before taking another action.',
    priority: 2,
    condition: { type: 'self_has_debuff', value: 1 },
    action: 'use_skill',
    skillId: 'cleanse',
    targetMode: 'self',
  },
  {
    id: 'support_heal',
    name: 'Support Heal',
    description: 'If any ally\'s HP falls below 40%, heal the most wounded ally.',
    priority: 2,
    condition: { type: 'ally_hp_below', value: 40 },
    action: 'use_best_heal',
    targetMode: 'lowest_hp',
  },
  {
    id: 'ally_critical_rescue',
    name: 'Ally Critical Rescue',
    description: 'If any ally is below 20% HP, rush a heal to save them immediately.',
    priority: 1,
    condition: { type: 'ally_hp_below', value: 20 },
    action: 'use_skill',
    skillId: 'emergency_remedy',
    targetMode: 'lowest_hp',
  },

  // ── Finishing moves ────────────────────────────────────────────────────────
  {
    id: 'finish_them',
    name: 'Finish Them',
    description: 'When an enemy is below 20% HP, strike the weakest target with the strongest attack.',
    priority: 3,
    condition: { type: 'enemy_hp_below', value: 20 },
    action: 'use_strongest_attack',
    targetMode: 'lowest_hp',
  },

  // ── Crowd control / AoE ────────────────────────────────────────────────────
  {
    id: 'group_threat',
    name: 'Group Threat',
    description: 'When facing more than 2 enemies, use an AoE attack to damage all of them.',
    priority: 4,
    condition: { type: 'enemy_count_above', value: 2 },
    action: 'use_aoe',
    targetMode: 'all',
  },
  {
    id: 'overwhelming_numbers',
    name: 'Overwhelming Numbers',
    description: 'When outnumbered by 4 or more enemies, unleash a wide-area devastation spell.',
    priority: 3,
    condition: { type: 'enemy_count_above', value: 4 },
    action: 'use_skill',
    skillId: 'meteor_shower',
    targetMode: 'all',
  },
  {
    id: 'crowd_control',
    name: 'Crowd Control',
    description: 'When 3 or more enemies remain, apply a stun or slow to the highest-threat target.',
    priority: 4,
    condition: { type: 'enemy_count_above', value: 3 },
    action: 'use_skill',
    skillId: 'mass_stun',
    targetMode: 'highest_hp',
  },

  // ── Opening moves ──────────────────────────────────────────────────────────
  {
    id: 'opener_fireball',
    name: 'Opener Fireball',
    description: 'On the first turn, immediately launch a fireball to gain momentum.',
    priority: 5,
    condition: { type: 'turn_number_lte', value: 1 },
    action: 'use_skill',
    skillId: 'fireball',
    targetMode: 'highest_hp',
  },
  {
    id: 'opening_buff',
    name: 'Opening Buff',
    description: 'On turn 1, apply a combat buff to gain an early advantage.',
    priority: 5,
    condition: { type: 'turn_number_lte', value: 1 },
    action: 'use_skill',
    skillId: 'battle_cry',
    targetMode: 'self',
  },
  {
    id: 'early_poison',
    name: 'Early Poison',
    description: 'Within the first 2 turns, apply a damage-over-time poison to the strongest enemy.',
    priority: 6,
    condition: { type: 'turn_number_lte', value: 2 },
    action: 'use_skill',
    skillId: 'venom_strike',
    targetMode: 'highest_hp',
  },
  {
    id: 'late_game_burst',
    name: 'Late Game Burst',
    description: 'After 10 turns, assume buffs are stacked and unleash a devastating burst combo.',
    priority: 5,
    condition: { type: 'turn_number_gte', value: 10 },
    action: 'use_skill',
    skillId: 'overload_burst',
    targetMode: 'highest_hp',
  },

  // ── Resource management ────────────────────────────────────────────────────
  {
    id: 'mp_conservation',
    name: 'MP Conservation',
    description: 'When MP falls below 30%, defend instead of wasting resources on weak spells.',
    priority: 6,
    condition: { type: 'self_mp_below', value: 30 },
    action: 'defend',
    targetMode: 'self',
  },
  {
    id: 'mp_critical_defend',
    name: 'MP Critical Defend',
    description: 'When nearly out of MP (below 10%), take a defensive stance to conserve energy.',
    priority: 5,
    condition: { type: 'self_mp_below', value: 10 },
    action: 'defend',
    targetMode: 'self',
  },
  {
    id: 'high_hp_pressure',
    name: 'High HP Pressure',
    description: 'When HP is above 75%, press the attack aggressively without worry.',
    priority: 7,
    condition: { type: 'self_hp_above', value: 75 },
    action: 'use_strongest_attack',
    targetMode: 'lowest_hp',
  },
  {
    id: 'comfortable_heal',
    name: 'Comfortable Heal',
    description: 'When HP is above 60% but an ally is wounded, heal the ally instead of attacking.',
    priority: 6,
    condition: { type: 'self_hp_above', value: 60 },
    action: 'use_best_heal',
    targetMode: 'lowest_hp',
  },

  // ── Enemy-targeting ────────────────────────────────────────────────────────
  {
    id: 'focus_wounded',
    name: 'Focus Wounded',
    description: 'When an enemy is wounded (below 50%), keep piling on damage to bring them down.',
    priority: 5,
    condition: { type: 'enemy_hp_below', value: 50 },
    action: 'use_strongest_attack',
    targetMode: 'lowest_hp',
  },
  {
    id: 'debuff_strip',
    name: 'Debuff Strip',
    description: 'When an enemy has a buff active, use a dispel skill to remove their advantage.',
    priority: 4,
    condition: { type: 'enemy_has_buff', value: 1 },
    action: 'use_skill',
    skillId: 'dispel',
    targetMode: 'highest_hp',
  },
  {
    id: 'high_threat_focus',
    name: 'High Threat Focus',
    description: 'Target the enemy with the most HP — eliminate the biggest threat first.',
    priority: 7,
    condition: { type: 'enemy_hp_above', value: 70 },
    action: 'use_strongest_attack',
    targetMode: 'highest_hp',
  },
  {
    id: 'lightning_strike',
    name: 'Lightning Strike',
    description: 'Use a rapid lightning skill on a high-HP enemy to chip their health quickly.',
    priority: 6,
    condition: { type: 'enemy_hp_above', value: 80 },
    action: 'use_skill',
    skillId: 'chain_lightning',
    targetMode: 'highest_hp',
  },

  // ── Defensive stances ──────────────────────────────────────────────────────
  {
    id: 'defensive_posture',
    name: 'Defensive Posture',
    description: 'When HP is between 30–50%, take a cautious stance and reduce incoming damage.',
    priority: 5,
    condition: { type: 'self_hp_below', value: 50 },
    action: 'defend',
    targetMode: 'self',
  },
  {
    id: 'iron_will',
    name: 'Iron Will',
    description: 'Defend when greatly outnumbered to survive long enough for allies to act.',
    priority: 4,
    condition: { type: 'enemy_count_above', value: 5 },
    action: 'defend',
    targetMode: 'self',
  },

  // ── Gamble / chaos ─────────────────────────────────────────────────────────
  {
    id: 'wild_card',
    name: 'Wild Card',
    description: 'A 20% chance of using a random powerful ability for unpredictable combat.',
    priority: 8,
    condition: { type: 'random_chance', value: 20 },
    action: 'use_skill',
    skillId: 'chaos_bolt',
    targetMode: 'random',
  },
  {
    id: 'lucky_strike',
    name: 'Lucky Strike',
    description: '35% chance to land a critical lucky blow on a random enemy.',
    priority: 9,
    condition: { type: 'random_chance', value: 35 },
    action: 'use_strongest_attack',
    targetMode: 'random',
  },
  {
    id: 'opportunist',
    name: 'Opportunist',
    description: '50% chance to use an AoE attack on any turn, keeping enemies guessing.',
    priority: 9,
    condition: { type: 'random_chance', value: 50 },
    action: 'use_aoe',
    targetMode: 'all',
  },

  // ── Berserker / all-in ─────────────────────────────────────────────────────
  {
    id: 'berserker_rage',
    name: 'Berserker Rage',
    description: 'Always use the strongest available attack — health is irrelevant.',
    priority: 10,
    condition: { type: 'self_hp_above', value: 0 },
    action: 'use_strongest_attack',
    targetMode: 'random',
  },
  {
    id: 'relentless_assault',
    name: 'Relentless Assault',
    description: 'Never stop attacking. Focus the highest-HP enemy with relentless aggression.',
    priority: 8,
    condition: { type: 'self_hp_above', value: 0 },
    action: 'use_strongest_attack',
    targetMode: 'highest_hp',
  },

  // ── Late-game sustain ──────────────────────────────────────────────────────
  {
    id: 'sustained_pressure',
    name: 'Sustained Pressure',
    description: 'After turn 5, maintain steady damage output on the lowest-HP enemy.',
    priority: 7,
    condition: { type: 'turn_number_gte', value: 5 },
    action: 'use_strongest_attack',
    targetMode: 'lowest_hp',
  },
  {
    id: 'endurance_heal',
    name: 'Endurance Heal',
    description: 'After turn 8 with HP below 60%, heal to stay in the fight for the long haul.',
    priority: 4,
    condition: { type: 'self_hp_below', value: 60 },
    action: 'use_best_heal',
    targetMode: 'self',
  },
]

export const STRATEGY_PRESETS: StrategyPreset[] = [
  {
    id: 'aggressive',
    name: 'Aggressive',
    description: 'Open with a powerful burst, then hunt down weakened enemies. Maximise damage output at the cost of survivability.',
    icon: '⚔️',
    strategies: [
      'opener_fireball',
      'opening_buff',
      'early_poison',
      'finish_them',
      'focus_wounded',
      'group_threat',
      'high_threat_focus',
      'late_game_burst',
      'sustained_pressure',
    ],
  },
  {
    id: 'defensive',
    name: 'Defensive',
    description: 'Survival comes first. Heal aggressively, defend when threatened, and strike only when safe to do so.',
    icon: '🛡️',
    strategies: [
      'emergency_heal',
      'critical_heal',
      'debuff_counter',
      'ally_critical_rescue',
      'support_heal',
      'mp_critical_defend',
      'mp_conservation',
      'defensive_posture',
      'iron_will',
      'finish_them',
    ],
  },
  {
    id: 'balanced',
    name: 'Balanced',
    description: 'A flexible mix of offense and defense. React to threats intelligently while maintaining consistent damage output.',
    icon: '⚖️',
    strategies: [
      'emergency_heal',
      'debuff_counter',
      'support_heal',
      'opener_fireball',
      'finish_them',
      'group_threat',
      'mp_conservation',
      'focus_wounded',
      'debuff_strip',
      'sustained_pressure',
    ],
  },
  {
    id: 'support',
    name: 'Support',
    description: 'Dedicated to keeping allies alive. Prioritise healing and cleansing, using buffs to amplify the team.',
    icon: '💚',
    strategies: [
      'ally_critical_rescue',
      'support_heal',
      'emergency_heal',
      'critical_heal',
      'debuff_counter',
      'comfortable_heal',
      'opening_buff',
      'debuff_strip',
      'endurance_heal',
      'mp_conservation',
    ],
  },
  {
    id: 'berserker',
    name: 'Berserker',
    description: 'Ignore all defensive instincts. Attack with maximum force every turn — glory or death.',
    icon: '🔥',
    strategies: [
      'berserker_rage',
      'opener_fireball',
      'relentless_assault',
      'overwhelming_numbers',
      'late_game_burst',
      'lightning_strike',
      'lucky_strike',
      'wild_card',
      'opportunist',
    ],
  },
]
