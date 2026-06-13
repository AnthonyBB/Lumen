# Teams, Roster & Deployment — Design (Living Draft)

> Status: design in progress. This is a focused redesign of **team building** —
> the building, NPCs, UI, and data model that let a player run **multiple teams**
> across **multiple campaigns** (the §6 idle vision in
> [CHARACTERS_DESIGN.md](CHARACTERS_DESIGN.md)). It supersedes the "one active
> party" placeholder from that doc's §5.7.1 / §8. Decisions are marked
> **DECIDED**, **REC** (my recommendation, pending confirmation), **ON HOLD**, or
> **OPEN**. Nothing here ships in one pass; build order is staged in §9.

## 0. The problem (why the current roster UI doesn't fit)

Today the account has exactly **one party**:

- `PlayerProgressModel.party: string[]` — a single ordered list of ≤4 character
  ids (`MAX_PARTY_SIZE = 4`).
- That one list is **overloaded**: it drives **live campaign combat**
  (`BiomeScene` → the party battle scenes) *and* the **single idle assignment**
  (`server/game/combat/idle.ts` reads `playerManager.getParty()`).
- The UI ([`RosterPanel.tsx`](../src/components/RosterPanel.tsx)) is a flat
  character list with a per-row "★ In party" toggle, plus a "Play as" (active
  character) action and an inline recruit form. It expresses *one* team.

But [CHARACTERS_DESIGN.md](CHARACTERS_DESIGN.md) §6 commits to the opposite end
state: *"many teams, many campaigns,"* *"hundreds of characters,"* multiple
squads auto-battling different campaigns while offline. A single overloaded
`party` array and a single-team toggle list **cannot represent that**. The roster
screen needs to stop being a one-party editor and become a proper roster / teams
/ deployment management experience — housed in its own building.

This doc designs that.

## 1. Core concepts + the building (three nouns, one new building, three NPCs)

The single biggest fix is to stop conflating three different things the current
UI smears together:

| Concept | What it is | Lives where |
|---|---|---|
| **Character** | One owned hero (class, level, gear, skill ranks). | `characters: Character[]` (exists today) |
| **Team** | A *named, saved* ordered group of ≤4 characters, with a crest/color. A reusable squad. | **NEW** `teams: Team[]` |
| **Deployment** | A team **assigned to a campaign** for idle auto-battle, with its own timer + pending rewards. | **NEW** `deployments[]` (generalises today's single `idle`) |

**DECIDED — these live in a dedicated walk-in building with three NPCs** (the same
"walk in, stand by an NPC, press **E**" pattern as the crafting buildings; see
CLAUDE.md → Core Game Systems). One building, three stations:

| NPC | Opens | Job |
|---|---|---|
| **Barracks Master** | the Barracks view (§3) | **recruit new heroes (tokens)** + browse/inspect/equip/rank owned heroes, pick the **lead** (§7) |
| **Squad Captain** | the Teams view (§4) | create/edit named teams of ≤4 (§2 exclusive) |
| **Field Marshal** | the War Spoils Table (§5) | deploy teams to campaigns for idle; collect the spoils |

**The Mercenary Guild is merged into this building — DECIDED.** Recruitment
(spending Recruit Tokens to acquire a new hero, choosing its class) folds into the
**Barracks** NPC, alongside managing the heroes you already own. There is **no
separate recruitment building**: the standalone Mercenary Guild is **absorbed**
(retired or repurposed for flavour). One place to recruit, equip, and organise
heroes. (See §3 for why "acquire" and "manage" sensibly live under one NPC — the
distinction was thin.)

- **DECIDED — names:** the building is **The Garrison**; its NPCs are the
  **Barracks Master**, **Squad Captain**, and **Field Marshal** (a Master →
  Captain → Marshal rank ladder mapping to recruit/manage → build → deploy). The
  Field Marshal presides over the **War Spoils Table** — where you send teams on
  campaigns and collect their loot (named to signal both the war and the spoils).
- Building **placement** in the world is a Stage-2 detail (proposed: in town,
  near the campaign portals) — not blocking the data work.

## 2. Team membership model — **DECIDED: exclusive**

A character belongs to **at most one team** at a time. Teams *partition* (a subset
of) the roster; there is no overlap.

Why exclusive:
- **Simplest mental model.** "Lumen is in Team Bravo" — one truthful answer, no
  per-screen conflict states.
- **No two-places-at-once confusion** in the idle layer.
- **Reinforces the macro-sink.** [CHARACTERS_DESIGN.md](CHARACTERS_DESIGN.md) §4
  wants the roster itself to be the long-term sink ("collect more characters").
  Forcing breadth — you need 8 distinct heroes for 2 full teams — pulls directly
  in that direction and makes each recruit matter.

In the Squad Builder, assigning a hero already on another team prompts *"Move Kit
from Team Alpha to Team Bravo?"* and moves them (exclusive).

## 3. Surface A — Barracks (acquire + manage heroes)

The home for everything about an **individual hero** — both getting new ones and
looking after the ones you have. (Previously two ideas — a "Mercenary Guild" for
*acquiring* and a "Barracks" for *managing* — now **merged** here per §1, because
the distinction was thin: both are per-hero, token spend and gear/skill spend are
adjacent activities, and one screen is more discoverable than two buildings.)

**Recruit (the old Mercenary Guild job):**
- Spend **Recruit Tokens** to add a new hero, **choosing its class** (the existing
  `startRecruiting` flow moves here). Cost escalates per character owned.
- Heroes are *not* learning-gated for now (tokens only); the Tier-2
  master-a-subject path in [CHARACTERS_DESIGN.md](CHARACTERS_DESIGN.md) §2 stays
  deferred.

**Manage (the collection):**
- **Grid of hero cards**: class icon, name, level, power rating (§6), a small
  **team badge** ("Bravo" / "—" if unassigned), a **deployed/resting** indicator,
  and a **★ Lead** marker on whoever you play as.
- **Filter / sort / search** (load-bearing at scale): search by name; filter by
  class, role (tank/heal/dps/support), **Unassigned only**, **Deployed only**;
  sort by power, level, recently recruited, class.
- **Inspect** a hero → equip gear, rank skills (the existing per-character
  screens), and **Set as lead** (§7).

The Barracks answers "who can I get, who do I own, how strong are they, who am I
playing as" — not "who fights together" (that's the Squad Builder, §4).

## 4. Surface B — Squad Builder / Teams (saved squads)

The home for **team** building. A scrollable list of saved teams + a **+ New
Team** affordance.

**Each team card shows, at a glance:**
- **Crest + color + name** (identity; reused to tag deployments on the War Spoils Table
  and the portal menu §5). Editable.
- A **2×2 slot grid** of its ≤4 members (portrait/class icon; empty slots are
  tap-to-fill).
- **Role-coverage pips** — four archetype lamps **Tank · Heal · DPS · Support**,
  lit when the comp covers that role, dim when missing. Teaches composition the
  way [CHARACTERS_DESIGN.md](CHARACTERS_DESIGN.md) §2 intends and flags a
  glass-cannon team at a glance.
- **Power rating** (§6) for quick team-vs-team comparison.
- **Status**: *Idle* / *Deployed to Pine Forest* / *Resting (ready to recall)*.

**Team builder** (open a team → edit): the 2×2 slots on one side, a **roster
drawer** (the Barracks grid, filtered to assignable heroes) on the other. Tap a
hero to fill the next open slot; tap a member to bench them.

**Slot order — DECIDED: cosmetic.** A team's slot order carries **no** combat
meaning. Turn order in battle is determined purely by each character's **Speed**
(consistent with [CHARACTERS_DESIGN.md](CHARACTERS_DESIGN.md) §5.3 — "initiative
order by Speed"). Slots are just where portraits sit on the card.

**How many teams — DECIDED: not gated.** Team slots are **never earned** and not
behind learning or any progression. Teams are effectively **unlimited**,
naturally bounded by exclusive membership and roster size (you can only field as
many teams as you have heroes to fill them). A high constant cap (e.g.
`MAX_TEAMS = 12`) may exist purely for UI/storage sanity — **not** as a
progression gate.

**Characters — DECIDED (for now): not learning-gated.** Heroes are acquired via
Recruit Tokens at the **Barracks** (§3; tokens drop from clearing campaigns). The
Tier-2 "master a subject → earn a themed character" path in
[CHARACTERS_DESIGN.md](CHARACTERS_DESIGN.md) §2 is **deferred** — no character
currently requires learning to claim.

## 5. Surface C — The War Spoils Table / Deployments (the idle layer)

The Field Marshal's station, named to signal both the campaigning (war) and the
loot (spoils). Generalises today's single `idle` assignment into **one deployment
per active campaign**. This is the surface for
[CHARACTERS_DESIGN.md](CHARACTERS_DESIGN.md) §6.

- A board of campaigns; each shows its assigned **team crest**, the **idle
  timer** (next battle, driven by the Study-Haste interval §3 of the other doc),
  **pending spoils** to collect, and a **Resting** badge after the 2-week
  inactivity stop.
- **Assign**: pick an *idle* (undeployed) team → send to a campaign.
- **Recall**: pull a team home; collect owed spoils.

**Resolution is open-to-credit — DECIDED.** No live tick, no background timer.
Idle battles resolve **lazily on access** (login, and when the player opens the
War Spoils Table), exactly as [CHARACTERS_DESIGN.md](CHARACTERS_DESIGN.md) §6
specifies. Being logged in is not special: the wall-clock interval runs off
`lastResolvedAt` regardless, and elapsed battles are credited in a batch the next
time the player looks. (The "optional live tick" in §6 is explicitly **not** built.)

**Rewards-ready indicator on entry — DECIDED (no timer).** When the player walks
into The Garrison, do a single **peek**: compute whether the deployed team(s)
have idle battles owed since `lastResolvedAt` (≥ 1 interval elapsed) **without
crediting**, and if so badge the War Spoils Table / Field Marshal with a "Spoils
ready" glow. One-shot check on entry — no polling, no timer. Talking to the Field
Marshal then settles + credits the batch. Needs a server-side **peek** that
returns `battlesOwed` without mutating `lastResolvedAt`.

**Deployment does NOT block play — DECIDED.** Assigning a team to a campaign for
idle is a *background* activity. It never prevents the player from running **any**
campaign on demand, manually or with a strategy — including a campaign that
currently has an idle team on it, and including with heroes who are on a deployed
team. Idle is an abstraction running in the background; foreground play is always
available. (We do not model "a hero can't be in two places at once" — that
realism isn't worth the friction.)

**Portal / campaign-select UI shows assignments — DECIDED.** When the player
opens a portal / the campaign-select menu (`openBiomeMenu` in `WorldScene`), each
campaign that has an idle team deployed shows that **team's crest + name** (e.g.
a small badge: *"⚔ Bravo deployed"*). It's purely informational — the campaign
remains fully selectable for a manual or strategy run.

**Lock semantics — DECIDED.** Editing a deployed team or moving a member out
simply **recalls** that deployment (idle stops, owed rewards are settled) —
rather than hard-locking the team from edits. No hard locks anywhere.

**Live vs idle share one resolver** ([CHARACTERS_DESIGN.md](CHARACTERS_DESIGN.md)
§5.2) — a "Run now / Watch" on a deployment launches the live animated fight with
that team; the campaign map's idle resolution is the headless run of the same
engine. This doc only changes *cardinality* (one → many) and the assignment UI,
not the lazy, server-authoritative resolution model.

## 6. Power rating (shared by §3/§4/§5)

A single, transparent number so players can compare heroes and teams without
mental math. Computed **server-side** (anti-cheat, §10) from authoritative state:

```
charPower  = f(level, equipped-gear stats, skill-rank investment)
teamPower   = Σ charPower over members  (+ small synergy bonus for role coverage?)
```

Exact formula is **OPEN** (tune alongside enemy scaling), but it must be derived
only from server-held values and pushed to the client for display — the client
never computes persisted power.

## 7. The lead character (decoupled)

The solo learning screens (Classroom quizzes, crafting) operate as a single
character today via `activeCharacterId`.

- **DECIDED:** a single account-wide **lead character**, **fully decoupled from
  teams**. Learning is a personal activity; it shouldn't be entangled with combat
  team membership. The lead can be deployed or benched — irrelevant, since solo
  screens don't fight.
- **DECIDED:** the **default lead is a Sword fighter** (the starter class).
- This removes the current confusing overlap where "active" and "in party" were
  two separate toggles on the same row competing for meaning.

**ON HOLD — overworld model swap.** The idea that swapping the lead also changes
the **walking sprite** in the overworld is **deferred** (your call). It needs a
**class → character sprite** mapping (idle + walk animations per class) that may
not exist as art yet. Until we revisit: the lead stays a data pointer used by the
solo screens (exactly as `activeCharacterId` is today) and the overworld model is
unchanged. When we pick this back up, track per-class sprite availability in
[GRAPHICS.md](GRAPHICS.md) and plan a fallback (shared base model, optionally
class-tinted, or the Sword model).

## 8. Data model & migration

**New / changed persisted state** (`PlayerProgressModel`):

```ts
interface Team {
  id: string
  name: string
  crest: string        // icon key
  color: string        // hex / palette id
  memberIds: string[]  // ordered, ≤4, owned ids, exclusive (§2)
}

teams: Team[]                 // REPLACES the single `party: string[]`
// deployments REPLACES the single `idle` object:
deployments: {
  teamId: string
  biome: string
  difficulty: string
  lastResolvedAt: number
}[]
// activeCharacterId stays as-is for now — the `leadCharacterId` rename and the
// overworld model swap are ON HOLD (§7).
// No `teamSlots` field — team count is not gated (§4).
```

**Migration (single party → teams):** an existing account's `party` becomes
**Team #1** ("Main Squad", default crest/color). Its single `idle` (if any)
becomes that team's deployment. (`activeCharacterId` is left as-is — the rename to
`leadCharacterId` is deferred with §7; new accounts default the lead to a Sword
fighter.) Keep the old fields readable for one release for rollback safety, then
drop.

**Sanitisation** (server): `sanitiseTeams()` — owned ids only, deduped *within*
and (per exclusive membership §2) *across* teams, each capped at `MAX_PARTY_SIZE`;
empty teams allowed (a drafted but unfilled team), but a *deployed* team must be
non-empty.

## 9. Build order (stages — each independently shippable)

1. **Data model + migration** — add `teams[]`, `deployments[]`; migrate
   `party`/`idle`; `sanitiseTeams()`. Server re-pushes a new `roster:data` shape.
   (`activeCharacterId`/lead rename deferred, §7.) *(No behaviour change yet — one
   migrated team behaves like today's party.)*
2. **The building + 3 NPCs** — add the walk-in building with **Barracks**, Squad
   Builder, and War Spoils Table NPCs (press-E pattern). **Merge the Mercenary Guild's
   recruitment into the Barracks NPC** and retire/repurpose the standalone Guild.
   Route each NPC to its view.
3. **Barracks + Squad Builder UI** — fold the recruit flow into the Barracks and
   rebuild `RosterPanel` into the two views (§3/§4): filter/sort/search
   collection, saved-team cards with role pips + power, the team builder with the
   roster drawer. Live campaign launch now picks **which team** to send. *(This
   fixes the UI mismatch you flagged.)*
4. **Power rating** — server-side compute + push (§6); show on cards.
5. **War Spoils Table + multi-deployment** — generalise `idle` → `deployments[]`;
   the assignment UI (§5); **open-to-credit** resolution; a server **peek**
   (`battlesOwed`, no mutation) driving a **"spoils ready" badge** when the player
   enters The Garrison; **portal menu badges** showing deployed teams (non-
   blocking). Reuses the existing lazy idle resolver per deployment. Payoff stage
   realising §6 of the other doc.

**Deferred (revisit later):** overworld lead **model swap** (§7, ON HOLD).

Typecheck client (`npx tsc -p tsconfig.json --noEmit`) and server
(`npx tsc -p server/tsconfig.json --noEmit`) after each stage. Don't commit
unless asked.

## 10. Anti-cheat boundary

Unchanged in principle from [CHARACTERS_DESIGN.md](CHARACTERS_DESIGN.md) §7, plus:
team membership, deployment assignment, idle timers, recruit token spend, and
**power rating** are all **server-authoritative**. The client only *requests* team
edits / deployments / recruits / lead changes and *renders* the pushed state. The
portal badge is display-only and never gates which campaign the player may enter.

## 11. Open questions

- **§6 power formula:** exact weighting; whether role coverage grants a real
  combat synergy bonus or is display-only.
- **Crest/color source:** fixed palette + icon set, or earned/unlocked cosmetics?
- **§1 placement:** exact spot for The Garrison in the world (Stage-2 detail).

Resolved since last revision: the deployment surface is the **War Spoils Table**
(§5, renamed from "War Table"); idle resolution is **open-to-credit** with a
no-timer **"spoils ready" peek** on entering The Garrison (§5). Earlier:
building/NPC **names** (§1); **slot order** (§4 — cosmetic, by Speed); lock
semantics (§5 — no hard locks); recruitment merged into the Barracks (§1/§3).
**Deferred:** overworld lead model swap (§7); the §6 "live tick".
