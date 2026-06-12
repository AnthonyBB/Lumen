# Project Context

I am creating a fantasy themed 2d multiplayer RPG video game that is browser based. It's an educational game that allows the player to gain certain skills, spells, gear, items, and abilities by answering educational questions. It will also involve a system of turn based fighting that allows the player to conquer different areas and receive crafting materials and other necessary items for progression. This needs to be secure to prevent player hacking.

# About Me

I am a highly educated game designer and software engineer with an interest in making learning fun. I am also a detail oriented graphics designer who pays close attention to all details when creating the look and feel for the game. I do my best to model the game after the design examples provided and review graphics closely to ensure they match the designs.

# Rules

- Educational questions that could be considered inappropriate for younger audiences should be limited by a user provided age verification.
- All inventory, skills, stats, xp, and any other item that can be persisted on the server side, should be stored on the server-side to prevent client-side manipulation. It's imperitive that the game prevents cheating.
- Before we ship anything to be hosted on an external server, I need you to remind me to remove any dev/no-password logic.

# Tech Stack

- **Client:** React 18 + TypeScript + Vite, with the game itself in **Phaser 3**. Dev server on `:5173`.
- **Server:** Express + **Socket.io** + **MongoDB** (Mongoose) on `:3001`. Auth is JWT + bcrypt with email verification.
- The client reaches the backend via `API_BASE` in `src/config.ts` (`http://localhost:3001`).
- Two separate TypeScript builds — **always typecheck both** after a change:
  - Client: `npx tsc -p tsconfig.json --noEmit` (has `noUnusedLocals`/`noUnusedParameters`).
  - Server: `npx tsc -p server/tsconfig.json --noEmit`.

# Architecture & Security (anti-cheat)

The server is **authoritative for everything that can be cheated** — XP, level, stats, inventory, equipment, crafting materials, shards, silver, loot, and quiz answers. The client only _requests_ mutations and _renders_ what the server pushes.

- A question's `correctIndex` is **never sent to the client** before validation; quizzes are scored server-side.
- Crafted gear is **rolled server-side** and the item carries its own `attributes`/`equipSlot`/`xpRequired` on the persisted instance — those fields are the authoritative stat source and the client never sets them.
- Combat resolves client-side for animation but the server caps/validates the reported XP/silver and rolls all drops; clients can't choose loot.
- Client singletons `StatsStore` / `InventoryStore` (`src/game/systems/`) are **read-only snapshots** of server pushes (`stats:update`, `inventory:updated`). Nothing on the client computes persisted state.
- Client copies of game data (e.g. `src/game/data/materials.ts`, `recipes.ts`) are **display-only mirrors**; the server `server/game/data/` versions are the source of truth — keep ids/costs in sync.

# Core Game Systems

- **Crafting** (the acquisition path for gear): three walk-in buildings, each with an NPC you talk to (press E) to open the craft screen. Forge → **Math** → weapons; Armory → **Science** → armor; Alchemy Lab → **Science** → potions. Metal/reagent **tier** sets item level/potency, a **catalyst** sets max **rarity**, and **quiz accuracy** decides whether you reach it (and nudges the stat rolls). Items are rolled at craft time (`server/game/CraftSessionManager.ts` + `rollCraftedItem` in `equipmentGen.ts`) — there is no fixed item catalog.
- **Materials** drop from campaigns (never finished gear): two tier-1–7 ladders — metals (weapons/armor) and reagents (potions) — plus rarity-gating catalysts.
- **Combat is autonomous / strategy-driven — NO questions during combat.** Tactics come from `combatStrategies` / the Strategy loadout.
- **Currencies:** silver (Market), **Skill Shards** + **Combat Shards** (drop from clearing campaigns; spent at Combat Training for skills and the Strategy Hall for strategies), and crafting materials.
- **Learning:** `LearningSessionManager` + `QuestionEngine` over a subject/grade `curriculum`. Questions are age-gated by the account's `ageGroup` + `contentMode`.
- **Campaigns** (formerly "biomes"): `BiomeScene` auto-walks a path through 3 encounters, each launching `BattleScene`.

# Project Structure

- `server/socket/handlers.ts` — all gameplay socket events (the server's main surface).
- `server/game/` — authoritative managers (`PlayerManager`, `InventoryManager`, `CraftSessionManager`, `MarketManager`, `LearningSessionManager`, `QuestionEngine`, `loot`).
- `server/game/data/` — game data: `equipmentGen` (the roller), `materials`, `recipes`, `curriculum`, `skillTrees`, `combatStrategies`.
- `server/db/models/` — Mongoose models; `server/routes/auth.ts` — auth.
- `src/game/scenes/` — Phaser scenes (`WorldScene`, `BiomeScene`, `BattleScene`, `CraftScene`, `CraftBuildingScene`, `EquipmentScene`, `MarketScene`, `SkillShopScene`, `StrategyScene`, …).
- `src/game/systems/` — client snapshot stores. `src/game/data/` — display mirrors. `src/hooks/useAuth.ts` — auth/session.

# Conventions & Gotchas

- **Emoji:** my Windows 10 machine lacks emoji newer than ~2015 (they render as empty boxes). Use older emoji or drawn Phaser textures for in-game glyphs.
- **Verifying changes:** the game is login-gated, so default to typechecking. A dev-only, hard-gated login bypass exists for local testing (`DEV_AUTH_BYPASS` / `DEV_SKIP_EMAIL_VERIFICATION`, plus `npm run verify-user`) — see the Rules reminder about stripping dev/no-password logic before shipping.
- **Phaser scene patterns:** scenes render in their config-list order; an overlay launched over a _paused_ parent must `bringToTop` (or it draws underneath and looks frozen), and must `resume` the scene that launched it on close (`parentScene`), not always `WorldScene`.
- **Git:** only commit when I ask; branch off `master`; end commit messages with the `Co-Authored-By: Claude` trailer.
