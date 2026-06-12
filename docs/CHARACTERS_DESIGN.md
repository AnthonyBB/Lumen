# Characters, Teams & Idle Campaigns — Design (Living Draft)

> Status: design in progress. This captures the decisions made so far for the
> multi-character expansion. It is NOT yet a build spec — several items are
> intentionally open (see §8). This is a long-term plan; nothing here ships in
> one pass. Build order is staged in §9.

## 0. Background (current state — what changes)

Today the game is **single-character**: `server/game/PlayerManager.ts` *is* one
character — its xp, level, attributes, equipped gear, and `unlockedSkillIds` all
belong to a single entity tied to the account. Combat (`BattleScene`) is solo
(one player vs. mobs). Skills are account-level and binary (owned / not owned),
divided into 13 **classes** (`fire_mage`, `ice_mage`, `lightning_mage`, `sword`,
`spear`, `axe`, `hammer`, `monk`, `paladin`, `assassin`, `cleric`, `shaman`,
`bard`). Strategies are account-level. Two shard currencies exist: **Skill
Shards** (skills) and **Combat Shards** (strategies).

The expansion turns the account into a **roster of many characters** that form
**teams of 4**, which run campaigns — eventually **idle / auto-battling** while
the player is offline. A player may end up with dozens to hundreds of characters.
Getting a new character should feel **exciting**.

## 1. Account → Character data model

Introduce **Account → Character[]**. The split:

| Per-character | Account-wide (shared) |
|---|---|
| class, level, xp, attribute points | inventory **bag** + crafting materials |
| equipped gear | silver |
| purchased skills + **skill ranks** | **Combat Shards** |
| **Skill Shards** (earned from its own battles) | **strategy unlocks** (the catalog) |
| **custom strategy config** (per-character loadout) | Adventure Rank · **Recruit Tokens** |

All DECIDED:
- **Inventory bag + crafting materials are shared** — makes crafting a bigger
  economy sink (it feeds the whole roster) and lets every recruit be immediately
  equippable.
- **Skill Shards are per-character** — each character earns and holds its own from
  its own battles (incl. idle), and spends them on its own skill ranks (§4). This
  scales naturally with idle teams and ties a character's power to its own fights.
- **Combat Shards are account-wide** — they buy **strategy unlocks** (the
  *catalog* of available strategies), shared across the whole roster. But **each
  character configures its own custom strategy** from that unlocked pool (§4), so
  the catalog is account-wide while the active loadout is per-character. Keeps
  shard cost flat while letting every unit act to its own plan.

Migration: an existing single-character account becomes that account's
Character #1.

## 2. Character acquisition (three tiers)

The acquisition curve does three different jobs, so it's three tiers.

**Class assignment rule (DECIDED):** characters earned through **progression**
(Tier 0 grants and Tier 2 mastery) have **static, fixed classes** — they're
designed, named units. Characters **bought with Recruit Tokens** (Tier 1) let the
**player choose the class**, so tokens are how you deliberately fill a comp gap.

**Tier 0 — your first team (frictionless, ~30 min).** Character 1 is the
existing starter. Characters 2–4 are *granted* (not bought) for clearing the
first three tutorial campaigns (or passing a starter quiz per subject). Each has a
**fixed, different class archetype** (frontliner / healer / damage / support) so
the player immediately learns why team composition matters, and reaches a full
team of 4 fast. Each arrives with a flashy reveal.

**Tier 1 — token recruitment (the repeatable path) — DECIDED.** A soft currency,
**Recruit Tokens**, earned from clearing campaigns and especially **mastering
curriculum topics/grades** (keeps learning central). Spend at a Recruitment Hall
(possibly folded into the existing Tavern) to recruit a new character, **choosing
its class** at purchase. Cost **escalates per character owned** (triangular curve)
so the "easy first 4" promise holds automatically and later recruits feel earned.
The exciting reveal can still come from a **server-rolled rarity / base
attributes** on the chosen class (sub-decision in §8) — "I bought a Fire Mage…
and it rolled *Epic*!" — so choice and excitement coexist.

**Tier 2 — mastery characters (rare, identity-defining).** Completing a
subject/grade band at an Adventure Rank unlocks a *specific, named* character with
a **static class** themed to that learning (e.g. master Fractions → a
fraction-themed mage). These are the "I earned this by learning" trophies and the
showcase units, distinct from the token-bought roster.

**Reveal:** reuse the [`LevelUpCelebration`](../src/components/LevelUpCelebration.tsx)
component as the template for a flashy "NEW CHARACTER!" reveal, driving the
rarity/class colors into the burst.

**Ethics guardrail (age-gated, education-first audience):** steer excitement
toward *mastery reveals and visible progress*, NOT loot-box psychology — no
real-money pulls, no near-miss animations, transparent odds.

## 3. Study-to-Haste — the idle accelerator

The mechanic that keeps **learning as the throttle on idle** (so idle never
cannibalizes the educational core).

- **Default cadence (DECIDED):** 1 automated battle per team every **4 hours**.
- **Accelerator:** an **account-wide** "study session" — a short test — speeds up
  **all** active campaigns at once (must be account-wide; per-team does not scale
  to hundreds of characters).
- **Each passed test grants one −30 min stack (DECIDED).** Stacks reduce the
  interval down to a **1h floor — 6 stacks: 4h → 1h (DECIDED)** — preserving the
  ~6-tests cadence and the **4× throughput** ratio.
- **Rolling per-stack expiry (DECIDED):** each stack carries its **own 3-day
  timer**, not a shared batch timer. Batchers still get an "every-3-days"
  rhythm; players who spread tests out see stacks roll off **gradually** (no
  cliff). Allow **early top-off** — re-taking refreshes the oldest stack so a
  player can stay near the floor without waiting for a full reset. Cap: 6 stacks.
- **Test size (DECIDED):** **6 questions** per test. The realistic pattern is up
  to 6 tests in a sitting, so a full cycle is 6 × 6 ≈ 36 questions — a study
  session, not a slog. **Multi-subject**, weighted toward the player's weaker
  subjects.
- **Score-scaled reward:** a clean test grants the full stack; a weak pass grants
  a partial reduction — so mastery (not just clicking through) shortcuts the
  grind.
- **No-penalty, no-nag (protects the anti-daily goal):** teams always fight at
  the 4h baseline; haste only ever *speeds up*. A lapse loses nothing — no
  progress, no streak, no penalty. **No "expiring soon" notifications** (that's a
  daily in disguise); surface state only on open, e.g. *"Study Haste: 4/6 ·
  interval 2h · refresh anytime."*

## 4. Classes & skills

**Characters are locked to a single class (DECIDED).** The single-class
restriction is load-bearing — it's what makes **teams of 4** meaningful (bring a
cleric healer, a paladin tank, an assassin dps, a bard buffer). Build variety
comes from **collecting different characters**, not from one character doing
everything. Identity lives on the character; variety lives in the roster.

**Skills are rankable + level-gated (DECIDED) — this is the shard sink.** The
"max out shards too fast" problem comes from *binary* skills (~8 per tree = done
in 8 buys). Instead:
- Each skill ranks up (e.g. 1→5), each rank costing **Skill Shards**. A tree of 8
  skills × 5 ranks = ~40 investments, and per-character power scales with shard
  investment (good idle-power curve).
- **Each rank is gated behind the character's level** — you can't dump your whole
  shard pile into a fresh recruit; you rank up *as the character levels* through
  battles (incl. idle). This makes "max out too fast" mathematically impossible
  and creates the loop: idle battles → level → unlock next rank → spend shards →
  stronger → better idle.

**Shard economy (layered) — DECIDED:**
- **Skill Shards** are **per-character**: each character earns its own from its
  own battles (incl. idle) and spends them on its own skill *ranks* (level-gated).
  Deep; scales with per-character depth × roster size; never meaningfully maxes.
  A character's power is a function of *its* fights → a natural fit for idle teams.
- **Combat Shards** are **account-wide** and buy **strategy unlocks** — the
  *catalog* of strategies is shared across the roster (finite-ish — fine, a
  different cadence). But **each character configures its own custom strategy**
  from the unlocked options, so every unit acts to its own plan in party combat
  (assassin aggressive, cleric defensive, bard buffing). Catalog = account-wide;
  loadout = per-character. Each team's idle resolution (§6) reads each character's
  own configured strategy.
- **Roster as macro-sink:** every new character is a fresh empty tree. A
  "completed" character is a satisfying trophy, not a problem — shards move to the
  next recruit.

**Primary class only — DECIDED, final.** No splash / off-class skills and no
multi-classing. A character's entire kit is its one class tree; team variety
comes from the roster, not from blending classes. (Considered and declined: a
cross-class "splash" sink — not needed, since rankable level-gated skills already
provide a deep, scaling sink.)

**Improving skills with shards is the core per-character progression (DECIDED).**
Skill Shards are spent to rank up that character's skills (level-gated). This is
the primary thing a player saves shards *for*, and the per-character power growth
that feeds the idle-team loop. If shards ever still pile up late-game, the only
optional future sink to consider is a **prestige/ascension** on fully-maxed
characters — but the rank system should make that unnecessary.

## 5. Party combat (teams of 4)

`BattleScene` is solo today; teams of 4 require a **party-combat rewrite**: 4
allies + N enemies, shared initiative order, with each of the 4 allies acting to
**its own configured strategy** (§4). Upside: the existing skill kits *only fully
make sense in a party* — AoE, heals, and the Bard's team-buffs-only kit are dead
weight solo and essential at 4. This rewrite is what unlocks the depth already
built.

## 6. Idle / auto-battle (long-term)

Assign teams to campaigns; they fight while the player is offline.
- **Server-authoritative + time-gated** (mandatory): the "next battle" timestamp
  and all rewards are computed **server-side**, never trusted from the client. The
  Study-to-Haste interval (§3) drives the cadence.
- This is what makes "hundreds of characters" sensible (many teams, many
  campaigns).
- Keep learning in the loop even here — §3 is the primary mechanism; unlocking
  new campaigns/characters/skill-ranks always routes back through quizzes.

**Resolution model — lazy compute-on-access (DECIDED).** Do NOT run a wall-clock
background job that actively simulates every team's fight — it burns compute on
offline players nobody is watching and needs cron/worker infra. Instead:
- Store per-team `{ campaign, roster, lastResolvedAt }` + account `lastLoginAt`.
  When the value is *needed* (login, or opening the campaigns screen), compute how
  many battle intervals elapsed, resolve that batch, advance the timestamp, grant
  batched rewards, and show a summary. Only costs CPU when someone looks.
- **Abstracted resolver, not the Phaser engine on the server.** Idle fights use a
  **statistical** resolver — team power (stats + skill ranks + each character's
  strategy) vs. encounter power → *seeded* win/loss + rewards. Nobody's watching,
  so skip the turn-by-turn loop; this is also what makes batching hundreds of
  fights cheap. (Distinct from live combat, which stays the client `BattleScene`
  with the server capping rewards.)
- **The interval varies across the offline window** (Study-Haste stacks expire on
  rolling 3-day clocks), so it's NOT `elapsed / interval`. Walk the timeline
  forward using the stack timestamps, recomputing the interval per step.
- **Inactivity stop — 2 weeks (DECIDED).** Only credit battles in the window
  `lastResolvedAt → min(now, lastLoginAt + 14 days)`. So automated combat runs for
  up to 2 weeks after the last login, then **pauses**, and resumes instantly on
  the next login. This bounds the catch-up batch + reward spike (≈84 battles max
  at the 4h baseline over 14 days), gently nudges return, and — being well past
  the 3-day haste window — never reintroduces login pressure. Frame it as *"your
  teams are resting — log in to send them back out,"* never as a penalty or a
  streak-break (a pause loses nothing).
- **Optional live tick (polish only):** for players *currently online*, a light
  socket push can resolve + show battles live, driven by the same lazy
  computation — never the source of truth. No "found loot while away" push
  notifications (that recreates the daily-nag §3 avoids).

## 7. Anti-cheat boundary

Server-authoritative (must be enforced server-side): roster membership, character
stats/level/xp, skill ranks, equipment, shard/token balances, recruit rolls,
acquisition gating, the Study-Haste interval + test scoring, and all idle reward
computation. Client only *requests* and *renders*.

## 8. Open questions (not yet decided)

Resolved since the first draft: inventory **shared** (§1); classes **static for
progression rewards, player-chosen for token buys** (§2); Skill Shards
**per-character**, Combat Shards **account-wide** (§1/§4); strategy **catalog
account-wide, config per-character** (§4); Recruit Tokens are the Tier-1 currency
(§1/§2); idle = **lazy compute-on-access** with a **2-week inactivity stop** (§6);
cadence = **4h default, −30 min/test, 1h floor (6 stacks), 6 questions/test,
3-day rolling stacks** (§3).

Still open:
- **Do token buys roll rarity / base attributes on the chosen class?** (Leaning
  yes — keeps the reveal exciting while honoring class choice — but could be fully
  deterministic instead.)
- Exact numbers: skill rank count + per-rank costs, level gates, recruit cost
  curve, Tier-1 token earn rates, rarity-roll odds (if used).
- Whether a team's strategy is chosen per-team / per-campaign assignment.

## 9. Suggested build order (stages)

Each stage is independently shippable; later stages are long-term.

1. **Data model** — Account → Character[]; move level/xp/attributes/equipment/
   skills to the character; keep bag/materials/silver/shards/strategies/rank
   account-wide. Migrate existing accounts → Character #1.
2. **Roster UI** — view/select characters; equip per character from the shared
   bag.
3. **Rankable, level-gated skills** — convert skills from binary to ranks; wire
   Skill Shard costs + level gates. (Can precede teams.)
4. **Party combat** — the teams-of-4 BattleScene rewrite + strategy-driven ally
   turns.
5. **Acquisition** — Tier 0 grants, Tier 1 recruitment, Tier 2 rolls/mastery +
   the reveal.
6. **Study-to-Haste** — account-wide test, rolling −15m stacks, server interval.
7. **Idle / auto-battle** — server-side time-gated team battles + reward-on-login.

Typecheck client and server after each stage. Do not commit unless asked.
