# Lumen — Crafting & Learning Design

> Status: **design / not yet built.** This is the agreed blueprint for reworking
> the learning loop around crafting, with autonomous (strategy-driven) combat.

## 1. The core idea

Combat is **autonomous** — the player builds strategies and the team fights on
its own. So the player's *active* engagement must live elsewhere, and **learning
is that engagement**. Answering questions is no longer a tollbooth that hands you
abstract XP; it is how you **craft the gear, brew the potions, learn the skills,
and earn the strategies** that your team then fights with.

> Your skill in this game is **knowledge**, not reflexes. That is on-theme for an
> educational RPG and it makes every correct answer feel purposeful, because you
> are forging *the specific thing you chose to build*.

### The loop

```
Campaign  ──►  Materials  ──►  Craft (answer questions)  ──►  Gear / Potions
   ▲                                                              │
   │                                                              ▼
Auto-battle harder campaigns  ◄──  Set strategies + loadout  ◄──  Equip
                                         ▲
                       Skills (Language) + Strategies (History)
```

Each step feeds the next. Campaigns give **only materials**; you turn materials
into power by *learning*; that power lets you take on harder campaigns.

## 2. Design principles (what makes this great vs. tedious)

1. **Meaningful choice, not a relabeled quiz.** You *chose* the recipe and
   *gathered* the materials; a craft bar visibly fills as you answer. You are
   building a thing you want.
2. **Quiz *quality* drives reward quality.** Don't just check completion. Higher
   accuracy / longer streaks → better stat rolls and a chance to bump rarity.
   Learning *well* (not just finishing) maps to better loot.
3. **Each subject has a clear purpose** (Section 6), so studying a topic is
   character-building, and specialists emerge.
4. **Three distinct learning modes** (Section 7) so it never feels like one quiz.
5. **Wrong answers teach.** Every miss shows a one-line explanation before retry.
6. **Adaptive difficulty / flow.** Questions sit at the player's edge (~75–85%
   success), scaled by the chosen material tier and the player's topic grade.
7. **Short sessions, visible payoff.** A craft is a focused burst, not a 20-Q
   slog, and ends with a tangible item.

## 3. The three crafting buildings

Each is a town building (like the Learning Center / Market) that opens its own
crafting scene. Each has a **primary subject** and its own material family.

| Building | Crafts | Primary subject | Base material family |
|---|---|---|---|
| **The Forge** | Weapons | Math | Metals |
| **The Armory** | Armor | Science (Physics) | Metals + Weave |
| **The Alchemy Lab** | Potions / consumables | Science (Chem/Bio) | Reagents |

Skills and strategies are **not** buildings — they are earned through learning
(Section 7): Skills via **Language**, Strategies via **History**. That gives all
four subjects a home.

## 4. Materials

Two axes drive every craft:

- **Base material → item LEVEL** (a tier ladder, e.g. copper→…→lumensteel).
- **Rarity catalyst (special material) → item RARITY** (rare+ needs a catalyst).

So: `base material (tier) + catalyst (for rare+) + crafting quiz → item`.

### 4a. Base material ladder — Metals (weapons & armor)

| Tier | Metal | Item level band | Drops from |
|---|---|---|---|
| 1 | **Copper** | 1–8 | Beginner |
| 2 | **Bronze** | 7–15 | Beginner / Easy |
| 3 | **Iron** | 14–22 | Easy |
| 4 | **Steel** | 20–30 | Medium |
| 5 | **Mithril** | 28–38 | Medium / Hard |
| 6 | **Adamant** | 36–46 | Hard |
| 7 | **Lumensteel** | 44–50 | Expert (capstone, thematic to *Lumen*) |

Higher tiers = higher item level **and** harder/higher-grade crafting questions.

### 4b. Base material ladder — Reagents (potions, parallel ladder)

| Tier | Reagent | Potion power band |
|---|---|---|
| 1 | **Mossleaf** | 1–8 |
| 2 | **Sunpetal** | 7–15 |
| 3 | **Frostroot** | 14–22 |
| 4 | **Emberbloom** | 20–30 |
| 5 | **Glimmercap** | 28–38 |
| 6 | **Dreamthistle** | 36–46 |
| 7 | **Lumenblossom** | 44–50 |

### 4c. Rarity catalysts — the "very special" materials (gate rare+ items)

These are the rare, exciting drops. **Common items need no catalyst**; every step
up requires a rarer catalyst, and the top ones come *only* from the hardest
campaigns — mirroring the loot-rarity gates already in `loot.ts`.

| Item rarity | Catalyst | Drops from |
|---|---|---|
| Common | *(none)* | — |
| Uncommon | **Glimmer Dust** | any campaign (uncommon roll) |
| Rare | **Arcane Shard** | Medium+ (rare) |
| Epic | **Astral Core** | Hard+ (very rare) |
| Legendary | **Lumen Heart** | Expert only (extremely rare) |

> Optional later depth: **domain components** (a weapon's grip/core, armor's
> weave/lining, a potion's solvent) for recipe variety. Not required for v1.

### 4d. Materials as a resource

Materials are a stackable resource (counts per material id), persisted like
silver/shards. They are **server-authoritative** — granted by the server on
campaign completion, spent only via a validated craft.

## 5. Campaign rewards = materials only

`loot.ts` changes from dropping finished items to dropping **materials**:

- **Base material tier** scales with biome difficulty + enemy level (beginner →
  copper/mossleaf … expert → lumensteel/lumenblossom).
- **Catalysts** drop on the existing rarity roll (so the rarity gates already
  built map straight onto catalysts: legendary roll → Lumen Heart, etc.).
- Quantity scales with campaign size/difficulty.

Result: loot becomes *"ingredients for what I'll build"* instead of *"another
random helmet."*

## 6. Subject & topic mapping (specific topics → specific items)

Each building has a primary subject, and **specific item types map to specific
topics**, so studying a topic unlocks the ability to craft a thing.

### The Forge — Weapons → **Math**
| Weapon | Topic |
|---|---|
| Sword | Geometry (angles, edges) |
| Hammer | Measurement / units (mass, force) |
| Spear | Fractions / ratios (reach, balance) |
| Axe | Multiplication / area |
| Bow / Staff | Algebra (trajectories) |

### The Armory — Armor → **Science (Physics cluster)**
| Armor | Topic |
|---|---|
| Helmet | Forces / impact |
| Chest | Materials / chemistry of alloys |
| Shield | Energy |
| Boots / Gloves / Belt | Biology / anatomy (fit) |

### The Alchemy Lab — Potions → **Science (Chem/Bio cluster)**
| Potion | Topic |
|---|---|
| Healing | Biology (the body) |
| Mana | Chemistry (reactions) |
| Buff / utility | Mixed Chem/Bio |

### Cross-cutting subjects
- **Language → Skills** (incantations / spell-words; see 7b).
- **History → Strategies** (battle tactics / lore; see 7c).

This gives every subject a payoff: Math forges weapons, Science forges armor &
potions, Language teaches skills, History earns strategies. A player weak in a
subject feels it in that part of their build — encouraging well-rounded study
while letting specialization shape a character.

## 7. Three learning modes (deliberately different)

### 7a. Crafting = **Workshop Session**
At a building, pick a recipe and spend materials. A **continuous quiz** on the
item's topic(s) runs while a craft-progress bar fills.
- **Accuracy + streak → output quality** (stat rolls within the rarity band, and
  a chance to upgrade one rarity step on a strong run).
- Question grade scales with the **material tier**.
- A wrong answer slows progress (and, on rare+ crafts, risks consuming an extra
  catalyst) — gentle stakes, never a hard fail.
- *Feel:* focused, repeatable practice with a tangible, chosen output.

### 7b. Skills = **Mastery Trial**
To unlock a skill (or skill tier), pass a one-shot **Language** exam at the
required grade. Pass → unlock; fail → retry later (short cooldown or small cost).
Higher skill tiers require higher-grade mastery.
- *Feel:* a gated test, higher stakes, a real sense of achievement.

### 7c. Strategies = **Mastery Milestones**
Strategies unlock **passively** as you hit **History** topic-mastery milestones
(the server already tracks `topicPasses` / `subjectGrades`). E.g. master N
History topics → unlock a strategy slot or a new tactic.
- *Feel:* cumulative; rewards breadth and consistency over time; no extra grind.

> Keeping these three flavors distinct (repeated practice / pass-fail trial /
> cumulative milestones) is the main defense against quiz-fatigue.

## 8. How it meshes with what already exists

- **`equipmentGen` (1000 generated items)** becomes the crafting **output pool**:
  a craft resolves to a generated item of the chosen (slot, class, level-band,
  rarity), with rolls scaled by quiz quality. The whole generated-stat system is
  reused — crafting just changes *how you acquire* items (active, chosen) instead
  of random drops.
- **`loot.ts`** → drops materials (Section 5) instead of items; existing rarity
  gates become catalyst gates.
- **`MarketManager` / Market** → now trades **materials** and crafted items;
  materials become the economy's backbone (and a money sink/source).
- **Strategies** (`combatStrategies`, `StrategyScene`, `unlockedStrategies`) →
  unlock via History mastery (Section 7c), optionally alongside combat-shards.
- **Skills** (`skillTrees`, SkillShop, `unlockedSkills`) → unlock via Language
  trials (Section 7b), optionally alongside skill-shards.
- **Learning** (`LearningSessionManager`, `QuestionEngine`, `topicPasses`,
  `subjectGrades`) → already server-authoritative; powers all three modes and
  decides which materials/items/skills you can make.
- **Buildings** → add Forge / Armory / Alchemy Lab to `WorldScene` (like the
  Learning Center / Market), each opening a crafting scene.

### Server-authoritative crafting (anti-cheat)
A craft runs as a **server learning session** (reusing `LearningSessionManager`):
the client requests "start craft: recipe R"; the server verifies the player owns
the materials and is allowed the recipe, serves questions, scores answers itself,
then on completion **spends the materials and rolls the item server-side**. The
client never decides the outcome. (Same principle for skill trials / strategy
milestones.)

## 9. Data model sketch

```ts
// Material catalog (static)
interface Material {
  id: string            // 'metal_steel', 'reagent_emberbloom', 'cat_arcane_shard'
  name: string
  family: 'metal' | 'reagent' | 'catalyst' | 'component'
  tier?: number         // 1–7 for base materials
  rarityGate?: Rarity   // for catalysts
  icon: string
}

// Recipe (static)
interface Recipe {
  id: string
  building: 'forge' | 'armory' | 'alchemy'
  output: { slot?: EquipSlot; kind: 'weapon'|'armor'|'potion'; class?: SkillClass }
  subject: Subject
  topic: string
  inputs: { materialId: string; qty: number }[]   // base material; catalyst added for rare+
}

// Persistence (PlayerProgress additions)
materials: Record<string, number>   // material id → count
// crafted gear → existing bag/equipment; potions → consumable inventory
```

## 10. Potions in autonomous combat (open design)

Since the team fights on its own, consumables need an **auto-use** model. Options
to decide:
- Assign potions to the **strategy loadout** with trigger thresholds (e.g.
  "drink a healing potion when HP < 40%").
- Pre-battle **prep slots** consumed automatically during the fight.

This is where the player's cleverness shows in auto-combat — and it's all driven
by crafted (learned) potions.

## 11. Implementation phases

1. **Materials as a resource** — material catalog + per-player material inventory
   + persistence; `loot.ts` drops materials instead of items.
2. **First building (The Forge)** — building in town, crafting scene, and a
   server craft-session: pick recipe → quiz → roll a generated weapon with
   quality scaled by answers.
3. **The Armory + The Alchemy Lab** — armor crafting; potions + the consumable /
   auto-use system (Section 10).
4. **Skills via Language trials; Strategies via History milestones** (Section 7).
5. **Market + catalysts** — trade materials; wire rarity catalysts and special
   "Lumen Heart"-tier crafting.
6. **Cross-cutting polish** — wrong-answers-teach + adaptive difficulty in the
   question engine (improves the whole game, not just crafting).

Recommended first slice for a demo: **Phase 1 + the Forge** (Phase 2) — a
complete vertical slice of the new loop (campaign mats → craft a weapon by
answering math questions → equip).

## 12. Open decisions for Anthony

1. **Potion auto-use** model (Section 10) — loadout triggers vs. prep slots?
2. **Skills/Strategies:** fully learning-gated, or **hybrid** with the existing
   shard costs? (Hybrid recommended for a gentle on-ramp.)
3. **Exact tier ↔ level bands** (Section 4) — tune the numbers.
4. **Recipe count at launch** per building (how many weapons/armor/potions in v1).
5. **Catalyst drop rates** — how rare should Lumen Hearts feel?
