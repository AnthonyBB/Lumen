# Tutorial Experience — Design Doc

Status: **implemented** (catalysts confirmed; Level III gentle boss). Dev-skip
control (§11.4) not yet added.

A guided onboarding that drops a single low-difficulty **Tutorial Portal** near town,
runs the new player through three short campaign "levels," and bootstraps their
first team (3 recruit tokens) + first crafted gear. While the tutorial is in
progress every other portal is hidden; finishing all three reveals the world.

---

## 1. Verdict / rationale

Worth building. It teaches the core loop end-to-end — **clear a campaign → earn
materials → craft gear → recruit → build a team** — and its rewards (3 tokens)
are exactly what the rest of the game assumes you have (a full 4-member party
from the starting lone sword fighter). Guaranteed first win + hidden distractions
is low-risk onboarding.

## 2. Goals / non-goals

**Goals**
- Teach combat, the campaign loop, crafting at a building, and recruiting.
- Grant the **first 3 recruit tokens** (one per level) and enough materials to
  craft a first weapon/armor (and, if confirmed, a first potion).
- Funnel attention: only the Tutorial Portal is visible until it's done.
- One-time, server-authoritative, un-farmable.

**Non-goals**
- Not a re-playable content portal (each level clears once; then the portal is gone).
- Does not teach every system (Market, Strategy Hall, idle deployment come later).
- No new combat engine — reuses BiomeScene auto-walk + the existing battle scene.

## 3. Player-facing flow

1. New account spawns in town. **Only the Tutorial Portal is visible** (the 8
   biome gates are hidden). A townsperson / portal label nudges them in.
2. Entering opens a small menu showing **Level I / II / III**. Only the next
   uncompleted level is enterable; completed levels show a ✓ and are locked
   ("already cleared"); later levels are locked until the prior one is done.
3. Each level is a 3-encounter auto-walk campaign (existing BiomeScene), with
   **one enemy per encounter** and **no boss** (I & II; see §11 re III).
4. On clearing a level the player gets a fixed reward bundle (materials + 1 token)
   via the normal end-of-campaign reward screen.
5. After Level I they're prompted to spend a token at the Barracks and craft at
   the Forge/Armory (soft guidance, not enforced).
6. Clearing **Level III** plays a level-up-style **celebration** ("The realm
   opens to you!"), the Tutorial Portal **disappears**, and the **8 biome gates
   appear**.

## 4. The three levels

All levels are **rank `grade_1_3`** (M = 1) and difficulty band **novice**
(lowest). Mobs are bespoke tutorial mobs tuned for guaranteed/near-guaranteed
wins by a level-1 starter (see §8).

| Level | Encounters | Boss | Material reward (fixed) | Token | Teaches |
|---|---|---|---|---|---|
| **I** | 3 × 1 weak mob | none | metal ×(1 weapon **or** 1 armor's worth), **no catalyst** | +1 | combat + first craft |
| **II** | 3 × 1 tougher mob | none | metal ×(1 chest's worth) **+ 1 catalyst** | +1 | rarity via catalyst |
| **III** | 2 × 1 tougher mob, then a **gentle boss** | **yes (easy)** | **rich-vein** metal (≈2× a craft) **+ 2 catalysts** | +1 | bonus haul + first boss + finale |

The rarity material is the **catalyst** (confirmed). Level III's final encounter
is a **deliberately easy boss** — present so the player learns the boss beat, not
to challenge them.

**Concrete quantities (IMPLEMENTED)** — Copper is tier-1 metal; Glimmer Dust is
the lowest catalyst (uncommon gate). Recipe metal costs at grade_1_3: sword/helm/
greaves 3, **chestplate 4**, boots/gloves 2:
- Level I: `Copper ×3` (one weapon or a basic armor piece).
- Level II: `Copper ×4` + `Glimmer Dust ×1` (a Chestplate + a rarity bump).
- Level III: `Copper ×8` + `Glimmer Dust ×2` (the "plentiful node" haul — ~2 crafts).
- Each level also grants **+1 Recruit Token** (3 total).

Total across the tutorial: **3 recruit tokens** + enough metal for ~3 pieces of
gear + 3 catalysts. No reagents (unless §11 decides to teach potions).

## 5. State model (server-authoritative)

Add to `PlayerProgress` (Mongoose `PlayerProgressModel`) and the in-memory
`Player`:

```ts
tutorial: {
  levelsDone: number   // 0..3 — highest contiguous tutorial level cleared
}
```

- `tutorialActive = levelsDone < 3`.
- A level N is **completable** iff `N === levelsDone + 1` (strictly sequential)
  and `N <= 3`. Completing it sets `levelsDone = N` and grants level-N rewards
  **exactly once** (idempotent: re-sending a completed level is a no-op error).
- This is the **only** anti-farm gate: tokens/materials are fixed and tied to the
  monotonically increasing `levelsDone`, so replays can't mint extra tokens.

Default for **new** accounts: `levelsDone = 0`.

## 6. Portal visibility rules

Client needs the tutorial state. Two options; recommend **(a)**:
- (a) include `tutorial: { levelsDone, active }` in the existing `roster:data`
  push (WorldScene already listens to roster for the deployed-biome badge), **or**
- (b) a dedicated `tutorial:state` push.

`WorldScene`:
- If `tutorialActive`: render **only** the Tutorial Portal gate (near town, e.g.
  just off the central square), and **skip** building the 8 `biomeGates`
  (gates, colliders, glows, road spurs).
- If not active: current behavior (8 gates, no tutorial portal).
- On the transition `active → done` (Level III clear), the celebration plays and
  the scene rebuilds with the 8 gates (a `scene.restart()` or targeted rebuild
  on the next `roster:data`).

The Tutorial Portal's menu lists Levels I–III with lock/✓ state derived from
`levelsDone`.

## 7. Reward delivery (deterministic, one-time)

**Do not reuse** the generic `player:award_xp` campaign-reward branch (it rolls
random materials and grants +1 token + first-clear shards — wrong for a scripted
tutorial and would double-grant).

New server event: **`tutorial:complete_level { level }`**
1. `requireJoinedPlayer`.
2. Validate `level === levelsDone + 1` (else error, no-op).
3. Grant the **fixed** material bundle (`grantMaterials`) + `addRecruitTokens(1)`.
4. `levelsDone = level`; `persistProgress`.
5. `pushCurrency()`, `pushRoster()` (token balance), and push tutorial state.
6. Emit a `combat:loot`-shaped payload so the existing reward screen renders the
   fixed haul (materials + "Recruit Token ×1").
7. If `level === 3`: emit `tutorial:complete` so the client plays the finale
   celebration and reveals the portals.

XP for the tutorial fights still flows through the normal capped
`player:award_xp` path **but with `campaignComplete:false` and `difficulty`
omitted/flagged tutorial**, so it does **not** trigger the generic campaign
material/token/shard grant. (Alternatively gate the generic branch with
`!isTutorialBiome`.) The tutorial campaign id (e.g. biome name `"Tutorial"`) is
the discriminator.

## 8. Combat tuning (guaranteed win)

- Bespoke tutorial mob(s) in the encounter generator, e.g.:
  - L I mob: `maxHp ~12, attack ~2, defense 0, speed 8` — a level-1 sword starter
    one/two-shots it and survives easily (with the ×0.6 / rank-zoom balance, M=1).
  - L II mob: ~`maxHp 22, attack 4` (still a clear win, teaches taking some damage).
  - L III mobs (encounters 1–2): ~`maxHp 32, attack 6` (a real but winnable fight).
  - **L III boss (encounter 3): deliberately easy** — e.g. `maxHp ~70, attack ~7`,
    `boss: true`. Beatable by a still-solo level-1 starter (it just takes a few
    rounds); the point is to introduce the boss banner/encounter, not to gate.
- I & II: 3 encounters, **1 mob each, no boss**. III: 2 single-mob encounters
  then the gentle boss. No catalyst-gated mob mechanics. Reuses `BiomeScene`
  3-encounter auto-walk + the battle scene (the boss uses the existing `boss`
  flag → boss banner/health styling).
- Tutorial campaign uses its own short fixed path (a `CAMPAIGN_PATHS['Tutorial']`)
  with the exit past the encounters.

## 9. Completion celebration

Reuse the existing **`LevelUpCelebration`** component pattern (or a sibling
`TutorialCompleteCelebration`) triggered by `tutorial:complete`:
- Full-screen burst + "The realm opens to you!" / "New portals have appeared
  across the world." + a summary of what they earned (3 heroes' worth of tokens,
  first gear).
- On dismiss, the world shows the 8 portals.

## 10. Migration / existing accounts

`tutorial` will be absent on existing progress docs. On `loadProgress`, if absent:
- If the account shows **any** prior progress — `campaignsCompleted > 0` **or**
  `recruitTokens > 0` **or** roster size > 1 **or** active level > 1 — set
  `levelsDone = 3` (tutorial considered already done; their portals stay visible).
- Otherwise treat as fresh: `levelsDone = 0`.

(Active dev allows wipes, so this is belt-and-suspenders; it avoids hiding portals
from anyone mid-game.)

## 11. Open questions

1. ~~"Reagent" vs "catalyst"~~ — **RESOLVED: catalyst.** Reagents/potions are not
   part of the tutorial.
2. ~~Level III boss?~~ — **RESOLVED: yes, a deliberately easy boss** as the final
   encounter, to introduce the boss beat.
3. **Soft guidance between steps** (e.g. a townsperson prompting "spend your token
   at the Barracks") — in scope now or later? (Default: later.)
4. **Skip control** for testing (dev-only "skip tutorial") — nice-to-have.
   (Default: add it, dev-gated.)

## 12. Implementation checklist (once signed off)

- `PlayerProgressModel` + `Player`/`PlayerProgress`: add `tutorial.levelsDone`
  (+ load/persist/migration in `PlayerManager.loadProgress`).
- `PlayerManager`: getters/setters `getTutorial`, `completeTutorialLevel` (fixed
  reward bundles defined here, server-authoritative + idempotent).
- `handlers.ts`: `tutorial:get_state`, `tutorial:complete_level`; include tutorial
  state in `roster:data`; ensure the generic campaign-reward branch ignores the
  tutorial biome.
- Encounters/loot: bespoke tutorial mobs; tutorial campaign path
  (`CAMPAIGN_PATHS['Tutorial']`); fixed reward tables.
- `WorldScene`: tutorial portal gate + hide biome gates while active; rebuild on
  completion.
- Tutorial portal menu (Levels I–III with lock/✓).
- `tutorial:complete` celebration component + portal reveal.
- Typecheck both builds.

## 13. Security notes

- Completion, token grants, and material grants are **100% server-side** and
  gated on the monotonic `levelsDone` — the client only *requests* a level
  completion and *renders* the pushed reward. No reward quantity or token count
  is ever accepted from the client (consistent with CLAUDE.md anti-cheat rules).
