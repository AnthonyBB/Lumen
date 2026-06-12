# Adventure Ranks — Power & Economy Scaling (Design + Implementation Spec)

> Status: design locked. This doc is written to be implemented directly. Where it
> says "exact formula" or "file", follow it literally; read the current code to
> match line-level details. The combat-engine and upgrade-flow stages (4 & 5) are
> the trickiest — go carefully and verify.

## 0. Background (already implemented — do NOT re-do)

- **5 adventure ranks** exist as data in `server/game/data/adventureRanks.ts`
  (`ADVENTURE_RANKS`, `RANK_MAP`, ids in order):
  `grade_1_3`, `grade_4_6`, `grade_7_8`, `grade_9_12`, `college`.
- Each player has a persisted `adventureRank` (string id) on `Player`
  (`server/types/index.ts`), `PlayerProgressModel`, and `PlayerManager`
  (`getAdventureRank`, `getRankGradeBand`, `setAdventureRank`).
- Players **freely choose any rank** (not age-gated; age only sets the initial
  default). A **rank picker** is live in `src/pages/GamePage.tsx` via the
  `adventureRank:get` / `adventureRank:set` socket events; the server pushes
  `adventureRank:data { rankId, ranks }`.
- **Questions are already filtered by the rank's grade band** (CraftSessionManager
  draws from the band; `learning:start` is band-gated). Do not change this.

This feature ADDS power + economy scaling on top of the above.

## 1. The core multiplier

Define a per-rank multiplier `M`. Rank index is the 0-based position in
`ADVENTURE_RANKS` (`grade_1_3` = 0 … `college` = 4).

```
M(rankId) = 1.2 ^ rankIndex(rankId)
```

So: `grade_1_3` ×1.0, `grade_4_6` ×1.2, `grade_7_8` ×1.44, `grade_9_12` ×1.728,
`college` ×2.0736.

**Add to `adventureRanks.ts`:**
- `rankIndex(rankId: string): number` — index in `ADVENTURE_RANKS` (default 0 if unknown).
- `rankMultiplier(rankId: string): number` — `1.2 ** rankIndex(rankId)`.
- `RANK_STEP = 1.2` constant (single tuning knob — keep it one place).

`M` is applied to FIVE things: rewards, craft cost, gear/potion power, mob
strength, and spell damage. Two different rank inputs are used — read carefully:

| What scales | Multiplier input | Why |
|---|---|---|
| Campaign rewards (materials, shards, XP) | `M(currentRank)` | loot tracks the rank you're playing |
| Craft material cost | `M(currentRank)` | crafting cost tracks the rank you craft at |
| **Gear power** (weapon base dmg, armor base def) | `M(min(craftRank, currentRank))` | low-rank gear stays weak when carried up; high-rank gear gives no edge when dropped down |
| **Potion power** (heal/mana restored) | `M(min(craftRank, currentRank))` | same rule as gear, applied at use time |
| **Mob strength** (HP, attack) | `M(currentRank)` | keeps each difficulty's challenge consistent per rank; forces rank-appropriate gear |
| **Spell/skill flat magnitudes** (damage, heal, DoT, shield, HoT) | `M(currentRank)` | spells are abilities, not crafted items — always "current" |

`min(craftRank, currentRank)` means: take the rank index of each, use the smaller
one, then `M` of that. Implement a helper `effectiveRankIndex(craftRankId, currentRankId) = Math.min(rankIndex(craftRankId), rankIndex(currentRankId))` and
`M` it.

**Percentage-based skill effects** (Bard `+20% attack` buffs, `slow %`, stun
land-chance, etc.) are **NOT** scaled — they're already relative.

## 2. Why each piece exists (anti-farm rationale — for context, not action)

The problem: rank is freely chosen, so a player could pick an easy (low) rank,
answer trivial questions, and gain power/loot cheaply, then exploit a high rank.

- **Reward ×M + cost ×M (same factor):** craft-rate is ~constant across ranks
  (you can craft just as many items at a low rank), but low-rank farming yields
  *thin* materials that don't stretch against high-rank craft costs → no incentive
  to farm low then switch.
- **Gear/potion power via `min(craftRank, currentRank)`:** a low-rank item is
  capped at its craft rank forever (carrying it up gives no high-rank power); a
  high-rank item is capped at your current rank (dropping down gives no edge).
- **Mob ×M(currentRank) — the keystone:** a rank-appropriate-geared player has
  gear ×M and mobs ×M → they cancel, so each difficulty feels consistent at every
  rank. A player coasting on **low-rank gear at a high rank** has gear ×M(low) but
  mobs ×M(high) → they get out-scaled → they're *forced* to craft/upgrade
  rank-appropriate gear → which forces them to answer rank-appropriate questions.
  This is what makes the learning gate bite.
- **Spell ×M(currentRank):** keeps casters in pace with the scaled mobs. No stored
  rank (abilities, not items), so switching ranks auto-updates damage live.
- **Upgrade = rank-delta materials + target-rank quiz** (§5): lets you keep a
  favorite item without a material OR learning shortcut.

**Magnitude note:** `M` is a multiplier ON TOP of the existing material-**tier**
base stats (tier comes from campaign **difficulty**, the bigger power axis). Rank
scales you AND your foes together → **rank is the learning-level axis; tier/difficulty is the power-progression axis.** Range `M(college)/M(grade_1_3) ≈ 2.07×`. Keep `RANK_STEP = 1.2` as the single tuning knob.

## 3. Item data changes (`craftRank` tag)

Crafted gear AND potions must carry the rank they were crafted at.

- **Server `InventoryItem`** (`server/types/index.ts`): add `craftRank?: string`.
- **Client `ClientInventoryItem`** (`src/game/systems/InventoryStore.ts`): add `craftRank?: string`.
- **At craft time** (`CraftSessionManager` — both `forgeGear` and `brewPotion`):
  set `craftRank = playerManager.getAdventureRank(playerId)` on the produced item.
- **Potion stacking:** the potion's stable `itemType` must include the rank so
  potions of different ranks don't merge. Current shape is like
  `potion_heal_t3_rare`; change to `potion_heal_t3_rare_<rankId>`
  (e.g. `..._grade_4_6`).
- **Starter gear** (`ItemDatabase.getGeneratedStarterItems`): set `craftRank: 'grade_1_3'` (lowest).
- **Missing `craftRank` (legacy items):** treat as `grade_1_3` everywhere (default
  to the lowest rank so old items are weak — safe). This is active dev, so a wipe
  is also acceptable; default-to-lowest is the no-migration path.

## 4. Where each multiplier is applied (implementation targets)

### 4a. Gear power (server stats + client combat)
- **Defense (server):** `PlayerManager.computeStats` adds `item.baseDefense` to
  `gear.defense`. Change to `item.baseDefense * M(min(item.craftRank, player.adventureRank))`.
  (The server knows the player's rank.)
- **Weapon damage (client combat):** `BattleScene.makeBasicAttack()` reads the
  equipped weapon's `baseDamage` range. Multiply min & max by
  `M(min(weapon.craftRank, currentRank))`. The client must know `currentRank`
  (see §6).

### 4b. Potion power (client combat, use time)
- Wherever a potion is consumed in combat (currently potions aren't wired into
  combat yet — when they are, or in the inventory "use" path), the restored
  amount = `potion.power * M(min(item.craftRank, currentRank))`. For now, at
  minimum scale it at the point of effect.

### 4c. Mob strength (client combat)
- In the campaign's mob generation (`BiomeScene` builds mobs; `BattleScene`
  receives them — find where mob `hp`/`attack` are set), multiply `hp` and
  `attack` by `M(currentRank)` at spawn.

### 4d. Spell/skill damage (client combat)
- In `BattleScene` where a skill's effect magnitude is applied (damage rolls,
  heal amounts, DoT/bleed ticks, shield/HoT values — see the skills system added
  in `docs/SKILLS_DESIGN.md`), multiply the FLAT magnitudes by `M(currentRank)`.
  Do NOT scale percentage effects. Read `currentRank` live at cast time.

### 4e. Campaign rewards (server)
- `server/game/loot.ts` `rollMaterials`: multiply each drop's `qty` by
  `M(currentRank)` (round, min 1). Pass the rank in (add a param, or look it up).
  The caller in `server/socket/handlers.ts` (`player:award_xp` block) has the
  socket → use `playerManager.getAdventureRank(socket.id)`.
- Shards + XP in that same handler block: multiply the awarded amounts by
  `M(currentRank)` (round). (XP cap of 500 still applies AFTER scaling, or raise
  the cap — decide; simplest: scale then clamp.)

### 4f. Craft material cost (server)
- `CraftSessionManager.costFor`: multiply each cost `qty` by `M(currentRank)`
  (`Math.ceil`). This affects both the affordability check and what's consumed.

## 5. Upgrade flow (gear only — biggest new piece)

Lets a player raise an item's `craftRank` by ONE rank, so a favorite item can keep
pace without re-crafting.

- **Cost (materials) = the rank delta:**
  `ceil(recipeBaseMaterialCost * (M(targetRank) - M(itemCraftRank)))` of the item's
  base material family/tier. Net effect: craft-at-low + upgrade-up costs the SAME
  total materials as crafting at the high rank directly (deltas telescope across
  one-rank steps).
- **Plus a target-rank quiz:** reuse the `CraftSessionManager` quiz flow but draw
  questions from the *target* rank's grade band. Pass → upgrade succeeds; fail →
  no upgrade (and, like a failed craft, the base materials are lost but not the
  delta-only catalysts — match existing craft fail behavior).
- **On success:** set `item.craftRank = nextRank`. Do NOT change tier, rarity, or
  affixes — only the rank cap.
- **No upgrade for potions** — you just brew fresh ones at your current rank.
- **College is the top rank** — items already at `college` cannot be upgraded.
- Recommended surface: an "upgrade" option at the relevant crafting building
  (Forge for weapons, Armory for armor), or a small new station. Server handler
  e.g. `item:upgrade { itemId }` → starts an upgrade quiz session; reuse the craft
  session/answer plumbing. Keep it **server-authoritative** (validate ownership,
  materials, rank, and the quiz result server-side; the client never sets
  `craftRank`).

## 6. Getting `currentRank` to the client combat code

Combat runs client-side. The client already receives `adventureRank:data { rankId }`
in `GamePage`. Make the current rank readable from the Phaser scenes:
- Simplest: a tiny client store (like `StatsStore`/`InventoryStore`) or stash it on
  `window.__lumenRank` / the Phaser `registry` when `adventureRank:data` arrives,
  and read it in `BattleScene`/`BiomeScene`. Update it whenever the rank changes.
- Mirror `rankMultiplier`/`rankIndex` into a small client module
  (`src/game/data/adventureRanks.ts`) so the client can compute `M` (display-only;
  the server stays authoritative for persisted effects). Keep the `RANK_STEP` and
  rank id order in sync with the server copy.

## 7. Anti-cheat boundary

- **Server-authoritative** (must be enforced on the server): `craftRank` set at
  craft/upgrade time, reward scaling, craft cost scaling, the upgrade
  materials+quiz, and the Defense stat scaling.
- **Client-side** (acceptable, consistent with the existing model — combat
  resolves on the client and the server caps reported XP/silver/loot): weapon
  damage, potion heal amount, mob strength, and spell damage scaling. These are
  local combat math; they don't touch persisted state directly.

## 8. Suggested build order (stages)

1. **Helper:** `rankIndex`, `rankMultiplier`, `RANK_STEP`, `effectiveRankIndex` in
   `adventureRanks.ts` (+ a client mirror). Typecheck.
2. **Item tag:** add `craftRank` to server+client item types; set it at craft time
   (gear + potions); potion `itemType` includes rank; starter gear = `grade_1_3`;
   default missing → `grade_1_3`. Typecheck.
3. **Economy:** reward scaling (`loot.ts` + shards/XP in handler) and craft cost
   scaling (`CraftSessionManager.costFor`). Typecheck.
4. **Gear/potion/mob/spell power:** defense (server `computeStats`), weapon damage
   + potion + mob + spell magnitudes (client `BattleScene`/`BiomeScene`), using the
   `min(craftRank, currentRank)` rule for gear/potions and `currentRank` for mobs/
   spells. Wire `currentRank` to the client (§6). Typecheck.
5. **Upgrade flow:** server handler + quiz session (reuse craft plumbing) + a UI
   entry point. Typecheck.

After each stage: `npx tsc -p tsconfig.json --noEmit` (client) and
`npx tsc -p server/tsconfig.json --noEmit` (server). Do not commit unless asked.

## 9. Open / tunable

- `RANK_STEP` (1.2). Single knob; raise to make rank matter more vs tier.
- XP reward scaling vs the 500 cap (scale-then-clamp, or raise the cap).
- Whether potions ever need an upgrade path (currently: no).
- College content: still maps to grade 12 in the question bank; unrelated to this
  scaling but noted.
