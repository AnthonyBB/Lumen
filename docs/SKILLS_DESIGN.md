# Lumen — Combat Skills & Spells Design

This document is the single source of truth for every combat skill in Lumen, what
it does, and how strong it is. It is reviewed by the designer before/while the
implementation in `src/game/data/skillTrees.ts` (+ the server mirror) and the
combat engine in `src/game/scenes/BattleScene.ts` are updated.

Combat is turn-based and resolves **client-side** in `BattleScene`. The server is
authoritative only for XP / loot / inventory and for validating which skills a
player owns. So the *effects* below are implemented in the BattleScene engine.

---

## Effect vocabulary

Every skill is built from one or more typed effects. `value` is the magnitude,
`duration` is in rounds, `chance` is 0–1.

| Effect       | What it does in combat |
|--------------|------------------------|
| `damage`     | Direct damage to one selected enemy. `value` = base damage (rolled ±15%). |
| `aoe`        | Hits **all** living enemies at once. Fires immediately — **no target selection**. `value` = base damage to each (rolled ±15%). `value: 0` = pure utility/heal carrier (e.g. Mass Heal). |
| `dot`        | Damage-over-time (burn / bleed / poison). Target takes `value` damage at the **start of each round** for `duration` rounds. Stacks refresh duration and add magnitude. |
| `pierce`     | Lowers the target's **defense** by `value` for `duration` rounds → they take more damage from every hit (yours and allies'). Armor break / sunder. |
| `stun`       | Target **skips its next attack**. Landing it is probabilistic: `base chance + (playerLevel − enemyLevel) × 6%`, clamped 10–95%. `chance` (if present) is a flat override floor. |
| `slow`       | Reduces the target's **speed** by `value` for `duration` rounds → it loses initiative and may act after you. |
| `sleep`      | Target **performs no action** (no attack) until it is hit. Each round it has a wake chance of `base + (enemyLevel − playerLevel) × 5%` (higher-level foes shrug it off sooner); any damage instantly wakes it. |
| `heal`       | Direct heal to the player. `value` = HP restored (rolled ±15%). |
| `hot`        | Heal-over-time. Player regenerates `value` HP at the start of each round for `duration` rounds. |
| `team_buff`  | Party buff. `value` = % boost to a stat (`stat`: `attack` \| `defense` \| `speed`) for `duration` rounds. (Solo party today → applies to you.) No direct damage/heal — the Bard's bread and butter. |
| `lifesteal`  | Heals the caster for `value`% of the damage dealt by the same skill. |
| `execute`    | Bonus damage vs low-HP targets: if the target is below 30% HP, deal `value`% extra; `chance` = chance to instantly finish a target already below 15% HP. |
| `shield`     | Grants the player a temporary absorb pool of `value` that soaks incoming damage for `duration` rounds. |

**Visible base damage:** the skill button shows the primary numeric magnitude.
Damage skills show their `damage`/`aoe`/`dot` range; pure heals show heal range;
buffs/DoT/CC surface their key number (e.g. "Slow -12 spd", "Bleed 45 over 3",
"Def -20") so the player understands relative power.

---

## Class themes (per the designer)

- **Fire Mage** — strong elemental damage + **burning DoTs**. Highest sustained burn.
- **Ice Mage** — **slow** (speed reduction), freezing, plus chilling DoTs and shields.
- **Lightning Mage** — **stuns** and chain/AoE bursts. Best single-target burst + lockdown.
- **Sword** — martial; balanced damage, lifesteal (Berserker), shields/buffs (Duelist).
- **Spear** — reach; **pierce/armor-break** + bleed (Lancer), shield+stun combos (Phalanx).
- **Axe** — brutal; **bleed DoTs + execute** (Reaper), **AoE cleaves** + self-buff (Berserker).
- **Hammer** — **AoE stuns + armor break** (Earthshaker), huge single hits + shields (Juggernaut).
- **Monk** — **debuffs (pierce/slow) but lower damage**; lifesteal combos, evasion buffs.
- **Paladin** — tanky/holy: smite + self-heal + **shields**, group buffs.
- **Assassin** — **bleeds/poison DoTs** + execute + stun from stealth.
- **Cleric** — heals + holy damage; **HoT**, mass heal, smite.
- **Shaman** — nature/mixed: multi-element DoTs, **pierce hexes**, slows, totem DoTs.
- **Bard** — **team buffs / HoT ONLY**. No direct damage, no direct heal. (A couple of weak
  pre-spec strikes exist at tier 1–2 to have something to do before buffs unlock, but the
  spec paths are pure support.)

Most skills have a **unique** effect mix. A few are deliberately "same effect,
bigger number, more mana" upgrades (noted as *(stronger X)*).

---

## Per-class skill list

Legend: `T#` tier · `MP` mana · base numbers are pre-roll. DoT shows total over its
duration in parentheses where helpful.

### Fire Mage — burn DoT specialist
| Skill | T | MP | Base | Effect |
|-------|---|----|------|--------|
| Ember Shot | 1 | 3 | 15 dmg | Direct fire damage. |
| Fire Touch | 1 | 5 | 12 dmg + burn 9/3 | Hit + burn DoT (9/round, 3 rounds). |
| Flame Burst | 2 | 8 | 35 dmg | Stronger direct hit. |
| Scorching Ray | 2 | 10 | 40 dmg + burn 12/2 | Hit + burn. |
| Fire Mastery | 3 | 15 | 55 dmg + burn 15/3 | Heavy hit + lingering burn (gateway). |
| Wildfire (A) | 3 | 14 | 30 aoe + burn 10/3 | AoE that ignites every enemy. |
| Superheated Strike (B) | 3 | 14 | 70 dmg | Big single hit. |
| Eruption (A) | 4 | 20 | 48 aoe + burn 20/3 | AoE + strong burn on all. |
| Infernal Spread (A) | 4 | 18 | 40 aoe + burn 16/3 | AoE burn (cheaper, *stronger spread*). |
| Char (B) | 4 | 22 | 95 dmg + pierce 18/2 | Huge hit that melts armor (pierce). |
| Brand (B) | 4 | 20 | 70 dmg + burn 18/3 | Hit + sustained burn. |
| Cataclysm (A) | 5 | 38 | 85 aoe + burn 30/3 | Ultimate AoE inferno. |
| Phoenix Wrath (B) | 5 | 35 | 150 dmg + execute 50 | Execute strike, bonus vs low HP. |

### Ice Mage — slow specialist
| Skill | T | MP | Base | Effect |
|-------|---|----|------|--------|
| Frost Bolt | 1 | 3 | 14 dmg | Direct frost hit. |
| Chill Touch | 1 | 4 | 10 dmg + slow 6/2 | Hit + slow. |
| Ice Lance | 2 | 8 | 38 dmg | Stronger hit. |
| Frost Nova | 2 | 11 | 18 aoe + slow 8/2 | AoE + slow all. |
| Ice Mastery | 3 | 15 | 50 dmg + slow 10/2 | Hit + slow (gateway). |
| Freeze (A) | 3 | 16 | 45 dmg + stun 2 | Freeze solid (stun 2 rounds). |
| Sleet Storm (B) | 3 | 15 | 24 aoe + dot 14/3 + slow 8/2 | AoE chill DoT + slow. |
| Glacial Wall (A) | 4 | 18 | shield 80/3 | Defensive ice shield. |
| Shatter (A) | 4 | 20 | 105 dmg + stun 1 (0.5) | Big hit, may re-stun. |
| Arctic Gale (B) | 4 | 22 | 40 aoe + dot 16/3 + slow 14/2 | AoE DoT + heavy slow. |
| Ice Age (B) | 4 | 20 | 32 aoe + slow 16/3 | AoE deep slow. |
| Absolute Zero (A) | 5 | 40 | 70 aoe + stun 2 + shield 60/2 | Freeze all + shield. |
| Eternal Winter (B) | 5 | 38 | 72 aoe + dot 28/3 + slow 22/3 | Ultimate AoE chill. |

### Lightning Mage — stun specialist
| Skill | T | MP | Base | Effect |
|-------|---|----|------|--------|
| Spark | 1 | 3 | 16 dmg | Direct shock. |
| Static Shock | 1 | 4 | 20 dmg + stun 1 (0.25) | Hit, small stun chance. |
| Lightning Bolt | 2 | 9 | 40 dmg | Stronger hit. |
| Ball Lightning | 2 | 12 | 30 aoe | AoE burst. |
| Storm Mastery | 3 | 15 | 55 dmg + stun 1 (0.3) | Hit + stun (gateway). |
| Chain Lightning (A) | 3 | 16 | 40 aoe | Arcs to all enemies (AoE). |
| Thunderclap (B) | 3 | 16 | 72 dmg + stun 1 (0.5) | Big hit, likely stun. |
| Tempest (A) | 4 | 20 | 54 aoe + slow 12/2 | AoE + slow. |
| Overload (A) | 4 | 22 | 60 aoe + stun 1 (0.4) | AoE that may stun all. |
| Megabolt (B) | 4 | 22 | 115 dmg | Massive single hit. |
| Stun Surge (B) | 4 | 20 | 90 dmg + stun 2 | Hit + reliable 2-round stun. |
| Storm of Ages (A) | 5 | 40 | 90 aoe + stun 1 (0.5) | Ultimate AoE + mass stun. |
| Godstrike (B) | 5 | 38 | 180 dmg + stun 2 | Biggest single hit + stun. |

### Sword — balanced martial
| Skill | T | MP | Base | Effect |
|-------|---|----|------|--------|
| Slash | 1 | 0 | 18 dmg | Free strike. |
| Quick Strike | 1 | 3 | 24 dmg | Two fast hits. |
| Power Slash | 2 | 7 | 42 dmg | Heavy hit. |
| Blade Dance | 2 | 9 | 30 dmg + team_buff atk 10/2 | Hit + attack buff. |
| Sword Mastery | 3 | 14 | 62 dmg | Strong hit (gateway). |
| Parry (A) | 3 | 12 | shield 50/2 + team_buff def 20/2 | Defensive stance. |
| Riposte (A) | 4 | 18 | 95 dmg + team_buff atk 15/2 | Counter strike + buff. |
| Perfect Guard (A) | 4 | 20 | shield 70/2 + team_buff def 25/3 | Big shield + def. |
| Duel Mastery (A) | 5 | 35 | 160 dmg + shield 80/2 | Ultimate combo. |
| Frenzy (B) | 3 | 13 | 65 dmg + team_buff atk 20/3 | Rage hit + attack buff. |
| Bloodlust (B) | 4 | 19 | 88 dmg + lifesteal 30 | Hit, heals 30% of dmg. |
| Savage Blow (B) | 4 | 22 | 105 dmg + pierce 20/2 | Armor-ignoring hit. |
| Berserker Rage (B) | 5 | 36 | 170 dmg + lifesteal 50 | Ultimate lifesteal hit. |

### Spear — pierce / armor-break + bleed
| Skill | T | MP | Base | Effect |
|-------|---|----|------|--------|
| Thrust | 1 | 0 | 17 dmg | Free thrust. |
| Pierce | 1 | 3 | 14 dmg + pierce 8/2 | Hit + armor reduction. |
| Long Reach | 2 | 7 | 38 dmg | Stronger hit. |
| Sweeping Strike | 2 | 10 | 21 aoe + pierce 8/1 | AoE + brief armor break. |
| Spear Mastery | 3 | 14 | 58 dmg + pierce 12/2 | Hit + pierce (gateway). |
| Armor Break (A) | 3 | 15 | 52 dmg + pierce 22/3 | Heavy armor sunder. |
| Bleeding Lance (A) | 4 | 19 | 72 dmg + bleed 15/3 | Hit + bleed DoT. |
| Skewer (A) | 4 | 22 | 85 dmg + stun 1 + pierce 18/2 | Pin + stun + pierce. |
| Dragon Pierce (A) | 5 | 37 | 155 dmg + bleed 25/3 + pierce 30/3 | Ultimate pierce/bleed. |
| Shield Bash (B) | 3 | 14 | 40 dmg + stun 1 | Hit + stun. |
| Phalanx Stance (B) | 4 | 20 | shield 90/3 + team_buff def 15/3 | Defensive stance. |
| Counter Thrust (B) | 4 | 20 | 100 dmg + stun 1 (0.6) | Big hit, likely stun. |
| Fortress Breaker (B) | 5 | 36 | 145 dmg + shield 80/3 + stun 2 | Ultimate tank-breaker. |

### Axe — bleed + execute / AoE cleave
| Skill | T | MP | Base | Effect |
|-------|---|----|------|--------|
| Chop | 1 | 0 | 20 dmg | Free chop. |
| Cleave | 1 | 4 | 12 aoe | Small AoE. |
| Heavy Blow | 2 | 8 | 44 dmg | Heavy hit. |
| War Cry | 2 | 10 | 25 dmg + team_buff atk 18/3 | Hit + attack buff. |
| Axe Mastery | 3 | 15 | 64 dmg | Strong hit (gateway). |
| Grim Slash (A) | 3 | 14 | 55 dmg + bleed 12/3 | Hit + bleed. |
| Harvest (A) | 4 | 20 | 90 dmg + execute 40 (0.35) | Reaper execute. |
| Death Blow (A) | 4 | 22 | 80 dmg + bleed 20/3 + execute 50 (0.25) | Bleed + execute. |
| Grim Reaper (A) | 5 | 38 | 165 dmg + bleed 30/3 + execute 70 (0.5) | Ultimate execute. |
| Feral Cleave (B) | 3 | 14 | 38 aoe + team_buff atk 12/2 | AoE + buff. |
| Enrage (B) | 4 | 19 | 36 aoe + team_buff atk 40/3 | AoE + big rage buff. |
| Spinning Axe (B) | 4 | 22 | 60 aoe | Strong AoE (*stronger cleave*). |
| Whirlwind (B) | 5 | 36 | 84 aoe + bleed 12/3 + team_buff atk 45/3 | Ultimate AoE + buff. |

### Hammer — AoE stun + armor break / juggernaut
| Skill | T | MP | Base | Effect |
|-------|---|----|------|--------|
| Smash | 1 | 0 | 22 dmg | Free smash. |
| Ground Pound | 1 | 4 | 13 aoe + pierce 6/1 | AoE + brief armor break. |
| Overhead Crush | 2 | 8 | 46 dmg | Heavy hit. |
| Concussive Blow | 2 | 11 | 35 dmg + stun 1 (0.35) | Hit + stun chance. |
| Hammer Mastery | 3 | 15 | 65 dmg | Strong hit (gateway). |
| Seismic Slam (A) | 3 | 16 | 39 aoe + stun 1 (0.45) | AoE that may stun all. |
| Armor Crush (A) | 4 | 20 | 80 dmg + pierce 30/3 | Heavy armor sunder. |
| Earthquake (A) | 4 | 22 | 54 aoe + stun 2 | AoE + reliable mass stun. |
| Worldbreaker (A) | 5 | 38 | 84 aoe + stun 2 + pierce 35/3 | Ultimate AoE stun/sunder. |
| Juggernaut Charge (B) | 3 | 15 | 70 dmg + stun 1 (0.4) | Charge hit + stun. |
| Iron Shell (B) | 4 | 20 | shield 100/3 + team_buff def 20/3 | Big shield. |
| Titan Blow (B) | 4 | 24 | 118 dmg | Massive single hit. |
| Unstoppable (B) | 5 | 37 | 175 dmg + shield 100/3 | Ultimate hit + shield. |

### Monk — debuffs, lower damage, lifesteal/evasion
| Skill | T | MP | Base | Effect |
|-------|---|----|------|--------|
| Jab | 1 | 0 | 13 dmg | Free jab. |
| Combo Strike | 1 | 3 | 22 dmg | Flurry of hits. |
| Focus Strike | 2 | 7 | 30 dmg + pierce 8/2 | Hit + minor pierce. |
| Ki Blast | 2 | 10 | 38 dmg | Ki burst. |
| Inner Mastery | 3 | 14 | 48 dmg + slow 10/2 | Hit + slow (gateway). |
| Iron Fist (A) | 3 | 14 | 52 dmg + lifesteal 20 | Hit + lifesteal. |
| Dragon Punch (A) | 4 | 19 | 70 dmg + stun 1 + lifesteal 30 | Stun + lifesteal. |
| Soul Drain (A) | 4 | 22 | 60 dmg + lifesteal 50 | Big lifesteal. |
| Thousand Fists (A) | 5 | 36 | 130 dmg + lifesteal 60 | Ultimate lifesteal flurry. |
| Wind Step (B) | 3 | 13 | 40 dmg + team_buff speed 25/3 | Hit + speed buff. |
| Phantom Strike (B) | 4 | 20 | 55 aoe + slow 12/2 | AoE + slow. |
| Evasive Strike (B) | 4 | 20 | 65 dmg + shield 40/2 | Hit + self-shield. |
| Hurricane Kick (B) | 5 | 37 | 78 aoe + slow 16/2 + team_buff speed 30/3 | Ultimate AoE + slow + speed. |

### Paladin — tanky holy
| Skill | T | MP | Base | Effect |
|-------|---|----|------|--------|
| Holy Strike | 1 | 2 | 17 dmg | Holy hit. |
| Minor Heal | 1 | 4 | 15 heal | Self-heal. |
| Consecrate | 2 | 9 | 32 dmg + heal 16 | Hit + small heal. |
| Divine Favor | 2 | 11 | heal 20 + team_buff def 15/3 | Heal + def buff. |
| Holy Mastery | 3 | 15 | 55 dmg + heal 30 | Hit + heal (gateway). |
| Smite (A) | 3 | 16 | 65 dmg + heal 25 | Smite + heal. |
| Divine Shield (A) | 4 | 20 | shield 120/2 + heal 40 | Big shield + heal. |
| Holy Wrath (A) | 4 | 23 | 110 dmg + heal 45 | Big hit + heal. |
| Avatar of Light (A) | 5 | 40 | 165 dmg + heal 90 + shield 80/3 | Ultimate. |
| Holy Nova (B) | 3 | 15 | 33 aoe + heal 20 | AoE + heal. |
| Crusader Aura (B) | 4 | 20 | heal 30 + team_buff atk 25/3 | Group buff. |
| Holy Judgment (B) | 4 | 22 | 60 aoe + pierce 20/2 | AoE + armor break. |
| Crusade (B) | 5 | 38 | 90 aoe + heal 60 + team_buff atk 40/3 | Ultimate group. |

### Assassin — bleed/poison + execute + stun
| Skill | T | MP | Base | Effect |
|-------|---|----|------|--------|
| Backstab | 1 | 2 | 22 dmg | Strong opener. |
| Quick Stab | 1 | 3 | 26 dmg | Two stabs. |
| Cripple | 2 | 8 | 30 dmg + slow 12/2 | Hit + slow. |
| Shadow Step | 2 | 10 | 28 dmg + team_buff atk 20/2 | Hit + attack buff. |
| Shadow Mastery | 3 | 14 | 58 dmg + bleed 10/2 | Hit + bleed (gateway). |
| Garrote (A) | 3 | 15 | 48 dmg + stun 2 | Choke stun. |
| Shadow Vanish (A) | 4 | 20 | 90 dmg + team_buff atk 35/2 | Burst + buff. |
| Marked for Death (A) | 4 | 22 | 80 dmg + execute 60 (0.6) | Execute mark. |
| Death From Shadows (A) | 5 | 38 | 170 dmg + execute 80 (0.5) + stun 2 | Ultimate assassinate. |
| Envenom (B) | 3 | 14 | 42 dmg + poison 18/3 | Hit + poison DoT. |
| Toxic Cloud (B) | 4 | 21 | 30 aoe + poison 20/3 | AoE poison. |
| Crippling Poison (B) | 4 | 20 | poison 28/3 + slow 16/3 | Heavy poison + slow. |
| Death Venom (B) | 5 | 37 | 100 dmg + poison 45/3 + pierce 20/3 | Ultimate poison. |

### Cleric — heals + holy + HoT
| Skill | T | MP | Base | Effect |
|-------|---|----|------|--------|
| Mace Strike | 1 | 1 | 14 dmg | Holy hit. |
| Heal | 1 | 4 | 18 heal | Self-heal. |
| Holy Light | 2 | 9 | 30 dmg + heal 18 | Hit + heal. |
| Bless | 2 | 11 | heal 22 + team_buff atk 15/3 | Heal + buff. |
| Divine Mastery | 3 | 15 | 50 dmg + heal 35 | Hit + heal (gateway). |
| Righteous Smite (A) | 3 | 16 | 65 dmg + heal 22 | Smite + heal. |
| Holy Fervor (A) | 4 | 20 | 55 dmg + heal 45 + team_buff atk 28/3 | Hit + heal + buff. |
| Judgment (A) | 4 | 22 | 108 dmg + heal 38 | Big hit + heal. |
| Divine Intervention (A) | 5 | 40 | 150 dmg + heal 100 | Ultimate. |
| Greater Heal (B) | 3 | 16 | 60 heal | Big heal. |
| Mass Heal (B) | 4 | 22 | heal 48 + hot 12/3 | Heal + HoT. |
| Resurrection Light (B) | 4 | 22 | heal 55 + hot 18/4 | Heal + strong HoT. |
| Miracle (B) | 5 | 40 | heal 120 + hot 20/4 + team_buff def 30/4 | Ultimate heal. |

### Shaman — nature/mixed DoT + hex pierce + slow
| Skill | T | MP | Base | Effect |
|-------|---|----|------|--------|
| Spirit Bolt | 1 | 3 | 15 dmg | Spirit hit. |
| Earth Shock | 1 | 4 | 16 dmg + slow 7/1 | Hit + slow. |
| Flame Totem | 2 | 10 | 20 dmg + burn 14/3 | Hit + burn (totem). |
| Storm Call | 2 | 11 | 24 aoe + slow 8/2 | AoE + slow. |
| Elemental Mastery | 3 | 15 | 56 dmg + slow 10/2 | Hit + slow (gateway). |
| Multi-Element Blast (A) | 3 | 16 | 55 dmg + burn 14/3 + slow 10/2 | Mixed-element hit. |
| Spirit Wolf (A) | 4 | 22 | 55 dmg + bleed 18/3 | Spirit-wolf maul (bleed). |
| Elemental Fury (A) | 4 | 22 | 54 aoe + burn 16/3 | AoE elemental DoT. |
| Elemental Apocalypse (A) | 5 | 40 | 84 aoe + burn 30/3 + slow 18/3 | Ultimate AoE. |
| Hex (B) | 3 | 14 | 42 dmg + pierce 22/3 | Weakening hex (pierce). |
| Stacking Curse (B) | 4 | 20 | poison 24/3 + pierce 18/4 | Curse DoT + pierce. |
| Voodoo Strike (B) | 4 | 22 | 78 dmg + pierce 28/3 + stun 1 (0.35) | Hit + pierce + stun. |
| Ancient Curse (B) | 5 | 38 | 130 dmg + poison 30/3 + pierce 50/4 | Ultimate curse. |

### Bard — team buffs / HoT ONLY (no direct damage past tier 2, no direct heal)
The two tier-1/2 strikes keep a tiny attached buff so there's *something* to do
before specs unlock; from Song Mastery onward the kit is pure support.
| Skill | T | MP | Base | Effect |
|-------|---|----|------|--------|
| Battle Ballad | 1 | 2 | 13 dmg + team_buff atk 5/2 | Light strike + buff. |
| Dissonance | 1 | 4 | 16 dmg + pierce 6/1 | Light strike + brief pierce. |
| War Song | 2 | 8 | team_buff atk 16/3 | Pure attack buff. |
| Sonic Wave | 2 | 11 | team_buff def 12/2 + team_buff speed 8/2 | Defense + speed buff. |
| Song Mastery | 3 | 15 | team_buff atk 14/3 + team_buff def 14/3 | Dual buff (gateway). |
| Inspire (A) | 3 | 14 | team_buff atk 24/3 + hot 10/3 | Big atk buff + HoT. |
| Anthem of Victory (A) | 4 | 20 | team_buff atk 28/3 + team_buff def 18/3 | Atk + def anthem. |
| Power Chord (A) | 4 | 23 | team_buff atk 35/3 + team_buff speed 20/3 | Atk + speed anthem. |
| Magnum Opus (A) | 5 | 40 | team_buff atk 42/4 + team_buff def 30/4 + hot 18/4 | Ultimate all-stat anthem + HoT. |
| Mock (B) | 3 | 14 | pierce 20/3 + slow 10/2 | Debuff song (enemy weaken). |
| Chain Taunt (B) | 4 | 20 | pierce 22/3 (aoe) | AoE armor-break taunt. |
| Discord (B) | 4 | 22 | slow 16/3 (aoe) + pierce 12/3 (aoe) | AoE slow + pierce. |
| Cacophony (B) | 5 | 38 | stun 2 (aoe) + pierce 30/3 (aoe) | Ultimate AoE stun + sunder. |

> Note: Bard "debuff songs" (Path B) use `aoe`-flagged `pierce`/`slow`/`stun` so they hit
> every enemy without dealing direct damage — they weaken foes rather than harm them
> directly, staying true to the "buffs, not damage" identity.

---

## Engine behavior to playtest
- A fully **slept / stunned** enemy group must still let the turn loop continue (player keeps acting; battle doesn't soft-lock).
- **DoT killing the last enemy** at start of round → victory should trigger correctly.
- **AoE** skills fire with no target prompt (like heals).
- **Pierce** lowering defense should visibly increase subsequent damage.
- **Slow** should be able to flip initiative so a slowed fast enemy acts after you.
- **Sleep** waking on hit, and the level-scaled wake/stun chances feeling fair.
