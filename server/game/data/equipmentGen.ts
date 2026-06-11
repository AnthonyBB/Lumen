// ============================================================
// equipmentGen.ts — deterministic procedural equipment generator
//
// Produces exactly 1000 equipment pieces aligned with the 13
// combat classes.  The generator is fully deterministic (seeded
// PRNG, fixed seed) so the client and server always agree on
// item ids, names, stats and XP requirements.
//
// IMPORTANT: this is the SERVER copy of src/game/data/equipmentGen.ts.
// The two files must stay in sync (same seed, same logic) so the
// client and server agree on item ids, stats and XP requirements.
// If you change ANY generation logic, constants or part lists in
// either file, make the identical change in the other.
// ============================================================

// SkillClass is duplicated here (instead of imported from src/game/data/skillTrees.ts)
// because the server tsconfig (rootDir: server/) cannot import client sources.
// MUST match the SkillClass union in src/game/data/skillTrees.ts exactly.
export type SkillClass =
  | 'fire_mage' | 'ice_mage' | 'lightning_mage'
  | 'sword' | 'spear' | 'axe' | 'hammer'
  | 'monk' | 'paladin' | 'assassin' | 'cleric' | 'shaman' | 'bard'

// ------------------------------------------------------------
// Public types
// ------------------------------------------------------------

export type EquipSlot =
  | 'weapon' | 'helmet' | 'chest' | 'legs'
  | 'boots' | 'gloves' | 'ring' | 'amulet'

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'

export type AttributeType =
  | 'constitution' | 'intelligence' | 'dexterity' | 'strength' | 'spirit'
  | 'damage_bonus'
  | 'healing_bonus'
  | 'mp_regen'
  | 'fire_damage' | 'ice_damage' | 'lightning_damage' | 'holy_damage' | 'nature_damage'
  | 'crit_chance'
  | 'dot_bonus'
  | 'aoe_bonus'
  | 'xp_bonus'
  | 'gold_find'
  | 'debuff_resist'

export interface ItemAttribute {
  type: AttributeType
  value: number
}

export interface EquipmentItem {
  id: string               // deterministic, e.g. 'eq_0042'
  name: string
  slot: EquipSlot
  classes: SkillClass[]    // which classes can equip
  rarity: Rarity
  attributes: ItemAttribute[]
  xpRequired: number       // XP the player must have earned to equip
  icon: string             // single emoji
  description: string      // one kid-friendly sentence
}

// ------------------------------------------------------------
// Seeded PRNG — mulberry32 (do not change the seed!)
// ------------------------------------------------------------

const SEED = 0x4c554d45 // 'LUME'

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ------------------------------------------------------------
// Static part lists
// ------------------------------------------------------------

const CLASSES: SkillClass[] = [
  'fire_mage', 'ice_mage', 'lightning_mage',
  'sword', 'spear', 'axe', 'hammer',
  'monk', 'paladin', 'assassin', 'cleric', 'shaman', 'bard',
]

const SLOTS: EquipSlot[] = [
  'weapon', 'helmet', 'chest', 'legs', 'boots', 'gloves', 'ring', 'amulet',
]

const CLASS_LABEL: Record<SkillClass, string> = {
  fire_mage: 'Fire Mage', ice_mage: 'Ice Mage', lightning_mage: 'Lightning Mage',
  sword: 'Swordfighter', spear: 'Spearmaster', axe: 'Axe Warrior', hammer: 'Hammer Guard',
  monk: 'Monk', paladin: 'Paladin', assassin: 'Assassin',
  cleric: 'Cleric', shaman: 'Shaman', bard: 'Bard',
}

/** Weapon nouns per class. */
const WEAPON_NOUNS: Record<SkillClass, string[]> = {
  fire_mage: ['Staff', 'Wand', 'Orb', 'Scepter'],
  ice_mage: ['Staff', 'Wand', 'Orb', 'Scepter'],
  lightning_mage: ['Staff', 'Wand', 'Orb', 'Rod'],
  sword: ['Blade', 'Longsword', 'Saber', 'Rapier'],
  spear: ['Spear', 'Lance', 'Pike', 'Trident'],
  axe: ['Axe', 'Battleaxe', 'Hatchet', 'Broadaxe'],
  hammer: ['Maul', 'Warhammer', 'Mallet', 'Sledge'],
  monk: ['Knuckles', 'Handwraps', 'Quarterstaff', 'Tonfa'],
  paladin: ['Greatsword', 'Warblade', 'Mace', 'Bastion Blade'],
  assassin: ['Dagger', 'Dirk', 'Stiletto', 'Twinblade'],
  cleric: ['Mace', 'Scepter', 'Rod', 'Censer'],
  shaman: ['Totem', 'Spirit Staff', 'Carved Rod', 'Drumstick Wand'],
  bard: ['Lute', 'Harp', 'Flute', 'Drum'],
}

const GENERIC_WEAPON_NOUNS = ['Blade', 'Staff', 'Mace', 'Dagger']

/** Armor / accessory nouns per slot. */
const ARMOR_NOUNS: Record<Exclude<EquipSlot, 'weapon'>, string[]> = {
  helmet: ['Helm', 'Cap', 'Hood', 'Circlet', 'Coif'],
  chest: ['Tunic', 'Robe', 'Chestplate', 'Vest', 'Hauberk'],
  legs: ['Leggings', 'Greaves', 'Trousers', 'Legwraps'],
  boots: ['Boots', 'Treads', 'Striders', 'Sandals'],
  gloves: ['Gloves', 'Gauntlets', 'Mitts', 'Handwraps'],
  ring: ['Ring', 'Band', 'Signet', 'Loop'],
  amulet: ['Amulet', 'Pendant', 'Charm', 'Talisman'],
}

/** Thematic prefixes per class (kid-friendly). */
const CLASS_PREFIXES: Record<SkillClass, string[]> = {
  fire_mage: ['Ember', 'Blazing', 'Cinder', 'Sunfire', 'Molten'],
  ice_mage: ['Frozen', 'Frosted', 'Glacial', 'Snowy', 'Crystal'],
  lightning_mage: ['Storm-touched', 'Thundering', 'Sparking', 'Charged', 'Skybolt'],
  sword: ['Keen', 'Polished', 'Valiant', 'Swift', 'Dueling'],
  spear: ['Piercing', 'Soaring', 'Falcon', 'Skyward', 'Windswept'],
  axe: ['Mighty', 'Rugged', 'Timberfell', 'Bold', 'Cleaving'],
  hammer: ['Heavy', 'Stonebreaker', 'Anvil-forged', 'Sturdy', 'Mountain'],
  monk: ['Serene', 'Tranquil', 'Tempered', 'Flowing', 'Steadfast'],
  paladin: ['Radiant', 'Gleaming', 'Blessed', 'Lightbound', 'Honorbound'],
  assassin: ['Shadowy', 'Silent', 'Moonlit', 'Veiled', 'Nightfall'],
  cleric: ['Holy', 'Sacred', 'Dawnlit', 'Merciful', 'Gentle'],
  shaman: ['Wild', 'Verdant', 'Spirit-bound', 'Mossy', 'Earthen'],
  bard: ['Melodic', 'Harmonious', 'Cheerful', 'Songweaver', 'Lyric'],
}

const GENERIC_PREFIXES = ["Sturdy", "Traveler's", "Adventurer's", 'Trusty', 'Well-made']

/** Extra adjective inserted for higher rarities. */
const RARITY_ADJ: Record<Rarity, string[]> = {
  common: [],
  uncommon: ['Fine'],
  rare: ['Superior', 'Runed'],
  epic: ['Ancient', 'Exalted'],
  legendary: ['Mythic', 'Eternal'],
}

/** Name suffixes per class. */
const CLASS_SUFFIXES: Record<SkillClass, string[]> = {
  fire_mage: ['of the Phoenix', 'of Burning Skies', 'of Bright Embers'],
  ice_mage: ['of the Glacier', "of Winter's Calm", 'of Soft Snowfall'],
  lightning_mage: ['of the Tempest', 'of Rolling Thunder', 'of Dancing Sparks'],
  sword: ['of the Duelist', 'of Keen Edges', 'of Valor'],
  spear: ['of the Falcon', 'of Long Reach', 'of the Skylance'],
  axe: ['of the Timberwolf', 'of Mighty Swings', 'of the Highlands'],
  hammer: ['of the Iron Wall', 'of the Mountain', 'of Solid Stone'],
  monk: ['of Clarity', 'of the Still Pond', 'of Inner Peace'],
  paladin: ['of the Dawn', 'of Honor', 'of the Guardian'],
  assassin: ['of Shadows', 'of the Night Breeze', 'of Quick Steps'],
  cleric: ['of Mercy', 'of Healing Light', 'of the Morning Star'],
  shaman: ['of the Grove', 'of Wild Spirits', 'of Deep Roots'],
  bard: ['of Sweet Songs', 'of the Encore', 'of Merry Tales'],
}

const GENERIC_SUFFIXES = ['of the Wanderer', 'of Good Fortune', 'of the Open Road']

/** Prefix adjectives tied to a bonus type — the item's STRONGEST bonus picks one
 *  so the name reflects what the gear actually does. */
const ATTR_PREFIX: Record<AttributeType, string[]> = {
  strength:         ['Mighty', 'Powerful', 'Brawny', 'Forceful'],
  constitution:     ['Sturdy', 'Hardy', 'Stalwart', 'Rugged'],
  dexterity:        ['Nimble', 'Swift', 'Agile', 'Deft'],
  intelligence:     ['Clever', 'Scholarly', 'Wise', 'Bright'],
  spirit:           ['Soulful', 'Spirited', 'Serene', 'Blessed'],
  damage_bonus:     ['Vicious', 'Brutal', 'Fierce', 'Savage'],
  healing_bonus:    ['Soothing', 'Mending', 'Gentle', 'Caring'],
  mp_regen:         ['Channeling', 'Flowing', 'Mystic', 'Focused'],
  fire_damage:      ['Blazing', 'Molten', 'Fiery', 'Smoldering'],
  ice_damage:       ['Frosted', 'Glacial', 'Frozen', 'Icy'],
  lightning_damage: ['Sparking', 'Thundering', 'Charged', 'Stormy'],
  holy_damage:      ['Holy', 'Radiant', 'Hallowed', 'Shining'],
  nature_damage:    ['Verdant', 'Thorned', 'Wild', 'Leafy'],
  crit_chance:      ['Keen', 'Precise', 'Sharp', 'Deadly'],
  dot_bonus:        ['Withering', 'Venomous', 'Searing', 'Lingering'],
  aoe_bonus:        ['Sweeping', 'Booming', 'Wide', 'Thunderous'],
  xp_bonus:         ['Enlightened', "Learner's", 'Studious', 'Insightful'],
  gold_find:        ['Gilded', 'Lucky', 'Prosperous', 'Golden'],
  debuff_resist:    ['Warding', 'Guarded', 'Resolute', 'Steady'],
}

/** Suffixes tied to a bonus type — the item's SECOND bonus picks one. */
const ATTR_SUFFIX: Record<AttributeType, string[]> = {
  strength:         ['of the Bear', 'of Raw Might', 'of the Ox'],
  constitution:     ['of the Tortoise', 'of Endurance', 'of Stout Heart'],
  dexterity:        ['of the Fox', 'of Quick Hands', 'of Nimble Steps'],
  intelligence:     ['of the Owl', 'of Keen Wit', 'of Bright Minds'],
  spirit:           ['of the Spirit', 'of Inner Light', 'of Calm Souls'],
  damage_bonus:     ['of Hard Hits', 'of the Warrior', 'of Striking'],
  healing_bonus:    ['of Mending', 'of Healing Light', 'of Kind Care'],
  mp_regen:         ['of Flowing Mana', 'of the Wellspring', 'of Steady Focus'],
  fire_damage:      ['of the Phoenix', 'of Burning Skies', 'of Bright Embers'],
  ice_damage:       ['of the Glacier', 'of Soft Snowfall', "of Winter's Bite"],
  lightning_damage: ['of Rolling Thunder', 'of Dancing Sparks', 'of the Tempest'],
  holy_damage:      ['of the Dawn', 'of Holy Light', 'of the Sun'],
  nature_damage:    ['of the Grove', 'of Deep Roots', 'of Wild Vines'],
  crit_chance:      ['of Sharp Eyes', 'of the Bullseye', 'of Lucky Strikes'],
  dot_bonus:        ['of Slow Burns', 'of Creeping Harm', 'of Lasting Sting'],
  aoe_bonus:        ['of Wide Blasts', 'of the Whirlwind', 'of Sweeping Force'],
  xp_bonus:         ['of Learning', 'of Bright Ideas', 'of the Scholar'],
  gold_find:        ['of Riches', 'of Good Fortune', 'of the Merchant'],
  debuff_resist:    ['of Warding', 'of Steady Nerves', 'of the Bulwark'],
}

/** Icon per class weapon. */
const WEAPON_ICON: Record<SkillClass, string> = {
  fire_mage: '🪄', ice_mage: '🪄', lightning_mage: '🪄',
  sword: '🗡️', spear: '🔱', axe: '🪓', hammer: '🔨',
  monk: '🥋', paladin: '⚔️', assassin: '🗡️',
  cleric: '✨', shaman: '🌿', bard: '🪕',
}

const SLOT_ICON: Record<Exclude<EquipSlot, 'weapon'>, string> = {
  helmet: '🪖', chest: '🛡️', legs: '👖',
  boots: '👢', gloves: '🧤', ring: '💍', amulet: '📿',
}

/** Flavour theme word used in descriptions. */
const CLASS_THEME: Record<SkillClass, string> = {
  fire_mage: 'crackling flame', ice_mage: 'gentle frost', lightning_mage: 'rumbling thunder',
  sword: 'skilled swordplay', spear: 'long reach', axe: 'mighty chops', hammer: 'sturdy strength',
  monk: 'calm focus', paladin: 'shining honor', assassin: 'quiet footsteps',
  cleric: 'kind healing', shaman: 'wild nature', bard: 'merry music',
}

// ------------------------------------------------------------
// Attribute pools & value tables
// ------------------------------------------------------------

type WeightedAttr = [AttributeType, number]

/** Per-class weighted attribute pools — items roll from these. */
const CLASS_ATTR_POOL: Record<SkillClass, WeightedAttr[]> = {
  fire_mage: [
    ['intelligence', 3], ['spirit', 2], ['fire_damage', 3], ['damage_bonus', 2],
    ['dot_bonus', 2], ['aoe_bonus', 1], ['crit_chance', 1], ['mp_regen', 1],
  ],
  ice_mage: [
    ['intelligence', 3], ['spirit', 2], ['ice_damage', 3], ['damage_bonus', 2],
    ['debuff_resist', 1], ['aoe_bonus', 1], ['mp_regen', 1], ['constitution', 1],
  ],
  lightning_mage: [
    ['intelligence', 3], ['dexterity', 2], ['lightning_damage', 3], ['damage_bonus', 2],
    ['crit_chance', 2], ['aoe_bonus', 1], ['mp_regen', 1],
  ],
  sword: [
    ['strength', 3], ['dexterity', 2], ['crit_chance', 2], ['damage_bonus', 2],
    ['constitution', 1], ['debuff_resist', 1],
  ],
  spear: [
    ['dexterity', 3], ['strength', 2], ['damage_bonus', 2], ['crit_chance', 1],
    ['aoe_bonus', 1], ['constitution', 1],
  ],
  axe: [
    ['strength', 3], ['constitution', 2], ['damage_bonus', 2], ['crit_chance', 1],
    ['dot_bonus', 1], ['gold_find', 1],
  ],
  hammer: [
    ['strength', 3], ['constitution', 3], ['damage_bonus', 2], ['debuff_resist', 1],
    ['aoe_bonus', 1],
  ],
  monk: [
    ['dexterity', 3], ['spirit', 2], ['constitution', 1], ['crit_chance', 2],
    ['damage_bonus', 1], ['debuff_resist', 1], ['mp_regen', 1],
  ],
  paladin: [
    ['strength', 2], ['constitution', 2], ['spirit', 2], ['holy_damage', 2],
    ['healing_bonus', 1], ['debuff_resist', 1], ['damage_bonus', 1],
  ],
  assassin: [
    ['dexterity', 3], ['crit_chance', 3], ['damage_bonus', 2], ['dot_bonus', 1],
    ['gold_find', 1], ['strength', 1],
  ],
  cleric: [
    ['spirit', 3], ['intelligence', 2], ['healing_bonus', 3], ['holy_damage', 1],
    ['mp_regen', 2], ['debuff_resist', 1],
  ],
  shaman: [
    ['spirit', 2], ['intelligence', 2], ['nature_damage', 3], ['healing_bonus', 2],
    ['dot_bonus', 1], ['mp_regen', 1], ['constitution', 1],
  ],
  bard: [
    ['spirit', 2], ['dexterity', 1], ['xp_bonus', 3], ['debuff_resist', 2],
    ['healing_bonus', 1], ['gold_find', 2], ['mp_regen', 1],
  ],
}

const GENERIC_ATTR_POOL: WeightedAttr[] = [
  ['constitution', 2], ['strength', 1], ['dexterity', 1], ['intelligence', 1],
  ['spirit', 1], ['xp_bonus', 1], ['gold_find', 1], ['debuff_resist', 1],
]

/** Base value range (at common rarity) per attribute type. */
const ATTR_BASE: Record<AttributeType, [number, number]> = {
  constitution: [1, 3], intelligence: [1, 3], dexterity: [1, 3],
  strength: [1, 3], spirit: [1, 3],
  damage_bonus: [2, 4], healing_bonus: [2, 4],
  mp_regen: [1, 2],
  fire_damage: [2, 5], ice_damage: [2, 5], lightning_damage: [2, 5],
  holy_damage: [2, 5], nature_damage: [2, 5],
  crit_chance: [1, 2],
  dot_bonus: [2, 4], aoe_bonus: [2, 4],
  xp_bonus: [1, 2], gold_find: [1, 2],
  debuff_resist: [1, 3],
}

/** Hard caps for percent-style attributes (kept small per design). */
const ATTR_CAP: Partial<Record<AttributeType, number>> = {
  crit_chance: 8,
  xp_bonus: 10,
  gold_find: 10,
  debuff_resist: 25,
}

/** Relative power weight of each attribute (for XP-requirement budgeting). */
const ATTR_POWER_WEIGHT: Record<AttributeType, number> = {
  constitution: 2, intelligence: 2, dexterity: 2, strength: 2, spirit: 2,
  damage_bonus: 1.5, healing_bonus: 1.5,
  mp_regen: 4,
  fire_damage: 1.6, ice_damage: 1.6, lightning_damage: 1.6,
  holy_damage: 1.6, nature_damage: 1.6,
  crit_chance: 6,
  dot_bonus: 1.5, aoe_bonus: 1.5,
  xp_bonus: 5, gold_find: 4,
  debuff_resist: 2,
}

// ------------------------------------------------------------
// Rarity tables
// ------------------------------------------------------------

const RARITY_ORDER: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary']

/** Cumulative roll thresholds: 40 / 30 / 18 / 9 / 3. */
const RARITY_THRESHOLDS: [Rarity, number][] = [
  ['common', 0.40], ['uncommon', 0.70], ['rare', 0.88], ['epic', 0.97], ['legendary', 1.0],
]

const RARITY_ATTR_COUNT: Record<Rarity, [number, number]> = {
  common: [0, 1], uncommon: [1, 2], rare: [2, 3], epic: [3, 4], legendary: [4, 5],
}

/** Attribute value multiplier per rarity. */
const RARITY_VALUE_MULT: Record<Rarity, number> = {
  common: 1, uncommon: 1.6, rare: 2.5, epic: 4, legendary: 6,
}

/** Power-score multiplier per rarity. */
const RARITY_POWER_MULT: Record<Rarity, number> = {
  common: 1, uncommon: 1.3, rare: 1.7, epic: 2.2, legendary: 2.8,
}

/** XP-requirement band per rarity (commons free-ish, legendaries 20k–60k). */
const RARITY_XP_BAND: Record<Rarity, [number, number]> = {
  common: [0, 200],
  uncommon: [200, 1500],
  rare: [1500, 8000],
  epic: [8000, 20000],
  legendary: [20000, 60000],
}

// ------------------------------------------------------------
// Generation helpers
// ------------------------------------------------------------

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)]
}

function rollInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1))
}

function rollRarity(rng: () => number): Rarity {
  const r = rng()
  for (const [rarity, threshold] of RARITY_THRESHOLDS) {
    if (r < threshold) return rarity
  }
  return 'legendary'
}

/** Pick a weighted attribute type, excluding already-chosen types. */
function pickAttrType(
  rng: () => number,
  pool: WeightedAttr[],
  taken: Set<AttributeType>,
): AttributeType | null {
  const candidates = pool.filter(([t]) => !taken.has(t))
  if (candidates.length === 0) return null
  const total = candidates.reduce((s, [, w]) => s + w, 0)
  let roll = rng() * total
  for (const [type, weight] of candidates) {
    roll -= weight
    if (roll <= 0) return type
  }
  return candidates[candidates.length - 1][0]
}

function rollAttributes(rng: () => number, pool: WeightedAttr[], rarity: Rarity): ItemAttribute[] {
  const [minN, maxN] = RARITY_ATTR_COUNT[rarity]
  const count = rollInt(rng, minN, maxN)
  const taken = new Set<AttributeType>()
  const attrs: ItemAttribute[] = []

  for (let i = 0; i < count; i++) {
    const type = pickAttrType(rng, pool, taken)
    if (!type) break
    taken.add(type)

    const [lo, hi] = ATTR_BASE[type]
    let value = Math.round(rollInt(rng, lo, hi) * RARITY_VALUE_MULT[rarity])
    const cap = ATTR_CAP[type]
    if (cap !== undefined) value = Math.min(value, cap)
    value = Math.max(1, value)

    attrs.push({ type, value })
  }
  return attrs
}

function computeXpRequired(attrs: ItemAttribute[], rarity: Rarity): number {
  const power =
    attrs.reduce((sum, a) => sum + a.value * ATTR_POWER_WEIGHT[a.type], 0) *
    RARITY_POWER_MULT[rarity]
  const raw = Math.round(Math.pow(power, 1.5) * 10)
  const [lo, hi] = RARITY_XP_BAND[rarity]
  return Math.min(hi, Math.max(lo, raw))
}

/** Order an item's attributes by power (value × weight), strongest first.
 *  Pure & deterministic (ties broken by roll order) so the client and server
 *  agree — used to align the name's prefix/suffix with the item's top bonuses. */
function rankAttrs(attrs: ItemAttribute[]): ItemAttribute[] {
  return attrs
    .map((a, i) => ({ a, i, p: a.value * ATTR_POWER_WEIGHT[a.type] }))
    .sort((x, y) => y.p - x.p || x.i - y.i)
    .map((e) => e.a)
}

function buildName(
  rng: () => number,
  slot: EquipSlot,
  rarity: Rarity,
  cls: SkillClass | null,
  attributes: ItemAttribute[],
): string {
  const noun =
    slot === 'weapon'
      ? pick(rng, cls ? WEAPON_NOUNS[cls] : GENERIC_WEAPON_NOUNS)
      : pick(rng, ARMOR_NOUNS[slot])

  // The prefix names the item's STRONGEST bonus and the suffix names its second,
  // so the wording matches the actual stats. Items with no bonuses (some commons
  // roll zero attributes) fall back to class/generic flavour. RNG usage is
  // unchanged from the old logic — one pick for the prefix, one for the suffix —
  // so the deterministic catalog (ids, stats, XP) is untouched; only names change.
  const ranked = rankAttrs(attributes)
  const primary = ranked[0]?.type ?? null
  const secondary = ranked[1]?.type ?? null

  const prefixPool = primary ? ATTR_PREFIX[primary] : (cls ? CLASS_PREFIXES[cls] : GENERIC_PREFIXES)
  const prefix = pick(rng, prefixPool)

  const parts: string[] = []
  const rarityAdjs = RARITY_ADJ[rarity]
  if (rarityAdjs.length > 0 && rng() < 0.6) parts.push(pick(rng, rarityAdjs))
  parts.push(prefix, noun)

  let name = parts.join(' ')

  // rare+ items often get a suffix
  const suffixChance = rarity === 'rare' ? 0.5 : rarity === 'epic' ? 0.75 : rarity === 'legendary' ? 0.95 : 0.15
  if (rng() < suffixChance) {
    const suffixType = secondary ?? primary
    const suffixPool = suffixType ? ATTR_SUFFIX[suffixType] : (cls ? CLASS_SUFFIXES[cls] : GENERIC_SUFFIXES)
    name += ' ' + pick(rng, suffixPool)
  }
  return name
}

const SLOT_WORD: Record<EquipSlot, string> = {
  weapon: 'weapon', helmet: 'helmet', chest: 'armor', legs: 'leg armor',
  boots: 'boots', gloves: 'gloves', ring: 'ring', amulet: 'amulet',
}

function buildDescription(
  rng: () => number,
  slot: EquipSlot,
  rarity: Rarity,
  cls: SkillClass | null,
): string {
  const slotWord = SLOT_WORD[slot]
  if (!cls) {
    const generic = [
      `A dependable ${slotWord} that any brave adventurer can use.`,
      `This trusty ${slotWord} has traveled many roads and is ready for more.`,
      `A well-made ${slotWord} that fits heroes of every calling.`,
      `Adventurers everywhere prize this ${rarity} ${slotWord}.`,
    ]
    return pick(rng, generic)
  }
  const label = CLASS_LABEL[cls]
  const theme = CLASS_THEME[cls]
  const templates = [
    `A ${rarity} ${slotWord} humming with ${theme}, treasured by every ${label}.`,
    `This ${slotWord} was crafted for ${label}s who love ${theme}.`,
    `Wearing this ${slotWord}, a ${label} feels the power of ${theme} grow stronger.`,
    `A favorite ${slotWord} among ${label}s, said to carry a spark of ${theme}.`,
    `Forged for ${label}s, this ${slotWord} glows softly with ${theme}.`,
  ]
  return pick(rng, templates)
}

/** Roman numeral helper for de-duplicating colliding names. */
function toRoman(n: number): string {
  const numerals: [number, string][] = [
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ]
  let out = ''
  for (const [v, s] of numerals) {
    while (n >= v) { out += s; n -= v }
  }
  return out
}

// ------------------------------------------------------------
// Main generator
// ------------------------------------------------------------

const ITEMS_PER_CLASS = 70   // 13 × 70 = 910 themed items
const GENERIC_COUNT = 90     // + 90 any-class items = 1000

export function generateEquipment(): EquipmentItem[] {
  const rng = mulberry32(SEED)
  const items: EquipmentItem[] = []
  const nameCounts = new Map<string, number>()
  let index = 0

  // Round-robin slots within each class block guarantees every slot
  // appears for every class (70 items / 8 slots ≥ 8 each).
  function buildItem(cls: SkillClass | null, slot: EquipSlot): EquipmentItem {
    const rarity = rollRarity(rng)
    const pool = cls ? CLASS_ATTR_POOL[cls] : GENERIC_ATTR_POOL
    const attributes = rollAttributes(rng, pool, rarity)
    const xpRequired = computeXpRequired(attributes, rarity)

    let name = buildName(rng, slot, rarity, cls, attributes)
    const seen = nameCounts.get(name) ?? 0
    nameCounts.set(name, seen + 1)
    if (seen > 0) name = `${name} ${toRoman(seen + 1)}`

    const icon = slot === 'weapon'
      ? (cls ? WEAPON_ICON[cls] : '🗡️')
      : SLOT_ICON[slot]

    const item: EquipmentItem = {
      id: `eq_${String(index).padStart(4, '0')}`,
      name,
      slot,
      classes: cls ? [cls] : [...CLASSES],
      rarity,
      attributes,
      xpRequired,
      icon,
      description: buildDescription(rng, slot, rarity, cls),
    }
    index++
    return item
  }

  // 910 class-themed items, slots round-robin per class
  for (const cls of CLASSES) {
    for (let i = 0; i < ITEMS_PER_CLASS; i++) {
      items.push(buildItem(cls, SLOTS[i % SLOTS.length]))
    }
  }

  // 90 generic any-class items
  for (let i = 0; i < GENERIC_COUNT; i++) {
    items.push(buildItem(null, SLOTS[i % SLOTS.length]))
  }

  return items
}

export const ALL_EQUIPMENT: EquipmentItem[] = generateEquipment()

export const EQUIPMENT_MAP: Record<string, EquipmentItem> = Object.fromEntries(
  ALL_EQUIPMENT.map((item) => [item.id, item]),
)

export { RARITY_ORDER, CLASSES as EQUIPMENT_CLASSES, SLOTS as EQUIPMENT_SLOTS }
