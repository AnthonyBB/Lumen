/**
 * verifyEquipment.ts — sanity checks for the procedural equipment generator.
 * Run with: npx tsx scripts/verifyEquipment.ts
 */

import { ALL_EQUIPMENT, type EquipmentItem } from '../src/game/data/equipmentGen'
import { ALL_EQUIPMENT as SERVER_EQUIPMENT } from '../server/game/data/equipmentGen.js'

const FORBIDDEN = ['hp', 'attack', 'magic_power', 'defense', 'speed', 'luck', 'attack_power']
const ALLOWED = new Set([
  'constitution', 'intelligence', 'dexterity', 'strength', 'spirit',
  'damage_bonus', 'healing_bonus', 'mp_regen',
  'fire_damage', 'ice_damage', 'lightning_damage', 'holy_damage', 'nature_damage',
  'crit_chance', 'dot_bonus', 'aoe_bonus', 'xp_bonus', 'gold_find', 'debuff_resist',
])

const CLASSES = [
  'fire_mage', 'ice_mage', 'lightning_mage', 'sword', 'spear', 'axe', 'hammer',
  'monk', 'paladin', 'assassin', 'cleric', 'shaman', 'bard',
]
const SLOTS = ['weapon', 'helmet', 'chest', 'legs', 'boots', 'gloves', 'ring', 'amulet']
const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const

let failures = 0
function assert(cond: boolean, msg: string): void {
  if (!cond) { failures++; console.error('FAIL:', msg) }
}

const items: EquipmentItem[] = ALL_EQUIPMENT

// 1. exactly 1000 items
assert(items.length === 1000, `expected 1000 items, got ${items.length}`)

// 2. client/server copies produce identical data
assert(
  JSON.stringify(items) === JSON.stringify(SERVER_EQUIPMENT),
  'client and server generators produced DIFFERENT data',
)

// 3. ids stable + unique
items.forEach((it, i) => {
  assert(it.id === `eq_${String(i).padStart(4, '0')}`, `bad id at index ${i}: ${it.id}`)
})

// 4. attribute rules
for (const it of items) {
  assert(it.attributes.length <= 5, `${it.id} has ${it.attributes.length} attributes`)
  for (const a of it.attributes) {
    assert(ALLOWED.has(a.type), `${it.id} has disallowed attribute ${a.type}`)
    assert(!FORBIDDEN.includes(a.type), `${it.id} has forbidden attribute ${a.type}`)
    assert(a.value >= 1, `${it.id} attribute ${a.type} value < 1`)
  }
  assert(it.xpRequired >= 0, `${it.id} negative xpRequired`)
  assert(typeof it.description === 'string' && it.description.length > 0, `${it.id} missing description`)
}

// 5. class coverage: >= 60 themed items per class, every slot per class
const perClass: Record<string, number> = {}
const perClassSlot: Record<string, Set<string>> = {}
let genericCount = 0
for (const it of items) {
  if (it.classes.length === 1) {
    const c = it.classes[0]
    perClass[c] = (perClass[c] ?? 0) + 1
    ;(perClassSlot[c] ??= new Set()).add(it.slot)
  } else {
    genericCount++
  }
}
for (const c of CLASSES) {
  assert((perClass[c] ?? 0) >= 60, `class ${c} has only ${perClass[c] ?? 0} themed items`)
  for (const s of SLOTS) {
    assert(perClassSlot[c]?.has(s) ?? false, `class ${c} missing slot ${s}`)
  }
}

// 6. name uniqueness
const names = new Set(items.map((i) => i.name))
assert(names.size === items.length, `duplicate names: ${items.length - names.size}`)

// 7. xp bands sane
const xpByRarity: Record<string, number[]> = {}
for (const it of items) (xpByRarity[it.rarity] ??= []).push(it.xpRequired)
const legend = xpByRarity['legendary'] ?? []
assert(Math.min(...legend) >= 20000 && Math.max(...legend) <= 60000, 'legendary xp out of band')
const commons = xpByRarity['common'] ?? []
assert(Math.max(...commons) <= 200, 'common xp out of band')

// 8. determinism across runs (re-import not possible in one process; regenerate)
import { generateEquipment } from '../src/game/data/equipmentGen'
assert(
  JSON.stringify(generateEquipment()) === JSON.stringify(items),
  'generator is not deterministic across calls',
)

// ── Summary ──────────────────────────────────────────────────────────────────
console.log('\n=== Equipment generation summary ===')
console.log(`Total items: ${items.length}  (generic any-class: ${genericCount})`)

const rarityCount: Record<string, number> = {}
for (const it of items) rarityCount[it.rarity] = (rarityCount[it.rarity] ?? 0) + 1
console.log('\nRarity distribution:')
for (const r of RARITIES) {
  const n = rarityCount[r] ?? 0
  const xs = xpByRarity[r] ?? [0]
  console.log(
    `  ${r.padEnd(10)} ${String(n).padStart(4)}  (${((n / items.length) * 100).toFixed(1)}%)` +
    `  xpRequired ${Math.min(...xs)}–${Math.max(...xs)}`,
  )
}

console.log('\nItems per class:')
for (const c of CLASSES) console.log(`  ${c.padEnd(15)} ${perClass[c] ?? 0}`)

console.log('\nSample items:')
for (const idx of [0, 137, 500, 911]) {
  const it = items[idx]
  console.log(
    `  ${it.id} [${it.rarity}] ${it.icon} ${it.name} (${it.slot}, ${it.classes.length === 13 ? 'any' : it.classes[0]})` +
    ` xp=${it.xpRequired} attrs=${it.attributes.map((a) => `${a.type}:${a.value}`).join(', ') || 'none'}`,
  )
}
const firstLegendary = items.find((i) => i.rarity === 'legendary')!
console.log(
  `  ${firstLegendary.id} [legendary] ${firstLegendary.icon} ${firstLegendary.name}` +
  ` xp=${firstLegendary.xpRequired} attrs=${firstLegendary.attributes.map((a) => `${a.type}:${a.value}`).join(', ')}`,
)

if (failures > 0) {
  console.error(`\n${failures} check(s) FAILED`)
  process.exit(1)
}
console.log('\nAll checks passed.')
