// ============================================================
// resolver.ts — the deterministic, server-authoritative combat engine.
//
// One engine for BOTH live and idle combat (docs/CHARACTERS_DESIGN.md §5.2):
//   resolveBattle(input) -> { events, outcome }
// It is a PURE function of its input + seed — same input, same result — so live
// combat (client animates the event log) and idle batches always agree.
//
// This module operates on already-prepared CombatantInputs: stat derivation,
// equipment, skill-rank scaling and adventure-rank scaling are the CALLER's job
// (the 4.3 adapter). The resolver only runs the fight.
// ============================================================

import type { SkillEffect } from '../data/skillTrees.js';
import type { CombatStrategy, ConditionType } from '../data/combatStrategies.js';

// ── Inputs ───────────────────────────────────────────────────────────────────

/** An owned skill with its magnitudes ALREADY scaled (rank + adventure rank). */
export interface ResolverSkill {
  id: string;
  name: string;
  effects: SkillEffect[];
  mpCost: number;
}

/** A combatant entering the fight (stats already derived). */
export interface CombatantInput {
  id: string;
  name: string;
  side: 'ally' | 'enemy';
  maxHp: number;
  /** Physical attack power (folds into the basic attack). */
  attack: number;
  defense: number;
  speed: number;
  maxMana: number;
  /** Boosts the magnitude of this unit's heals (healing power stat). */
  healingPower: number;
  /** Basic-attack damage range (allies: from the weapon; enemies: derived). */
  basicAttack: { min: number; max: number };
  /** Owned skills (allies). Enemies usually have none. */
  skills: ResolverSkill[];
  /** Ordered strategy loadout (allies). Evaluated top-down. */
  strategy: CombatStrategy[];
  /** Campaign boss (enemies) — surfaced in the start snapshot for a special look. */
  boss?: boolean;
}

export interface BattleInput {
  allies: CombatantInput[];
  enemies: CombatantInput[];
  seed: number;
  /** M(currentRank) — scales the damage-mitigation constant so the ratio-based
   *  mitigation stays proportionate as all stats scale with rank (the "zoom").
   *  Defaults to 1 (grade_1_3 / unscaled). */
  rankMult?: number;
}

// ── Output ───────────────────────────────────────────────────────────────────

export interface UnitSnapshot {
  id: string; name: string; side: 'ally' | 'enemy'; hp: number; maxHp: number;
  boss?: boolean;
}

export type BattleEvent =
  | { t: 'start'; allies: UnitSnapshot[]; enemies: UnitSnapshot[] }
  | { t: 'round'; n: number }
  | { t: 'turn'; unitId: string }
  | { t: 'skip'; unitId: string; reason: 'stun' | 'sleep' }
  | { t: 'action'; unitId: string; skillId: string; name: string; targetIds: string[] }
  | { t: 'damage'; sourceId: string; targetId: string; amount: number; hp: number }
  | { t: 'heal'; sourceId: string; targetId: string; amount: number; hp: number }
  | { t: 'status'; targetId: string; status: string; rounds: number }
  | { t: 'defend'; unitId: string }
  | { t: 'death'; unitId: string }
  | { t: 'end'; victory: boolean };

export interface BattleOutcome {
  victory: boolean;
  rounds: number;
  /** Ally ids still alive at the end. */
  survivingAllyIds: string[];
}

// ── Internal runtime unit ──────────────────────────────────────────────────────

interface Unit extends CombatantInput {
  idx: number;          // stable tie-break for ordering
  hp: number;
  mana: number;
  shield: number;
  alive: boolean;
  dots: { perTurn: number; rounds: number; label: string }[];
  hots: { perTurn: number; rounds: number }[];
  defenseDown: number; defenseDownRounds: number;
  slowAmount: number; slowRounds: number;
  stunRounds: number;
  asleepRounds: number;
  buffAtkPct: number; buffDefPct: number; buffSpdPct: number; buffRounds: number;
  defending: boolean;
}

const MAX_ROUNDS = 60;

// ── Seeded RNG (mulberry32) ────────────────────────────────────────────────────

function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Resolver ───────────────────────────────────────────────────────────────────

export function resolveBattle(input: BattleInput): { events: BattleEvent[]; outcome: BattleOutcome } {
  const rng = makeRng(input.seed || 1);
  const events: BattleEvent[] = [];
  let idx = 0;
  const toUnit = (c: CombatantInput): Unit => ({
    ...c,
    idx: idx++,
    hp: c.maxHp,
    mana: c.maxMana,
    shield: 0,
    alive: true,
    dots: [], hots: [],
    defenseDown: 0, defenseDownRounds: 0,
    slowAmount: 0, slowRounds: 0,
    stunRounds: 0, asleepRounds: 0,
    buffAtkPct: 0, buffDefPct: 0, buffSpdPct: 0, buffRounds: 0,
    defending: false,
  });

  const allies = input.allies.map(toUnit);
  const enemies = input.enemies.map(toUnit);
  const all = [...allies, ...enemies];
  const snap = (u: Unit): UnitSnapshot => ({ id: u.id, name: u.name, side: u.side, hp: u.hp, maxHp: u.maxHp, boss: u.boss });

  const livingAllies = () => allies.filter((u) => u.alive);
  const livingEnemies = () => enemies.filter((u) => u.alive);
  const enemiesOf = (u: Unit) => (u.side === 'ally' ? livingEnemies() : livingAllies());
  const alliesOf = (u: Unit) => (u.side === 'ally' ? livingAllies() : livingEnemies());

  events.push({ t: 'start', allies: allies.map(snap), enemies: enemies.map(snap) });

  const effSpeed = (u: Unit) => Math.max(1, Math.round(u.speed * (1 + u.buffSpdPct / 100) - u.slowAmount));
  const effDefense = (u: Unit) => Math.max(0, u.defense * (1 + u.buffDefPct / 100) - u.defenseDown);
  // Mitigation constant scales with rank so the ratio stays proportionate as all
  // stats scale ×M (a rank-appropriate fight is identical at every rank).
  const mitig = 100 * (input.rankMult ?? 1);

  /** Deal `amount` to a unit, applying shield + defending, emitting events. */
  const dealDamage = (src: Unit, tgt: Unit, raw: number) => {
    if (!tgt.alive) return 0;
    // Ratio mitigation (must mirror PartyManualBattleScene.damageUnit): defence
    // gives diminishing returns instead of a flat subtraction, so high-defence
    // (level-scaled) targets still take meaningful hits — never floored to 1. The
    // mitig constant is the tuning knob (higher = defence matters less); it scales
    // with rank so mitigation stays proportionate as stats grow ×M.
    let dmg = Math.max(1, Math.round(raw * mitig / (mitig + effDefense(tgt))));
    if (tgt.defending) dmg = Math.max(1, Math.round(dmg * 0.5));
    if (tgt.shield > 0) {
      const absorbed = Math.min(tgt.shield, dmg);
      tgt.shield -= absorbed; dmg -= absorbed;
    }
    if (tgt.asleepRounds > 0) tgt.asleepRounds = 0; // any hit wakes a sleeper
    tgt.hp = Math.max(0, tgt.hp - dmg);
    events.push({ t: 'damage', sourceId: src.id, targetId: tgt.id, amount: dmg, hp: tgt.hp });
    if (tgt.hp <= 0 && tgt.alive) { tgt.alive = false; events.push({ t: 'death', unitId: tgt.id }); }
    return dmg;
  };

  const healUnit = (src: Unit, tgt: Unit, raw: number) => {
    if (!tgt.alive) return;
    const amount = Math.max(1, Math.round(raw + src.healingPower * 0.5));
    tgt.hp = Math.min(tgt.maxHp, tgt.hp + amount);
    events.push({ t: 'heal', sourceId: src.id, targetId: tgt.id, amount, hp: tgt.hp });
  };

  // ── Round loop ──────────────────────────────────────────────────────────────
  let round = 0;
  while (livingAllies().length > 0 && livingEnemies().length > 0 && round < MAX_ROUNDS) {
    round++;
    events.push({ t: 'round', n: round });

    // Start of round: DoT/HoT ticks + clear last round's "defending".
    for (const u of all) {
      if (!u.alive) continue;
      u.defending = false;
      for (const d of u.dots) {
        if (d.rounds <= 0) continue;
        u.hp = Math.max(0, u.hp - d.perTurn);
        events.push({ t: 'damage', sourceId: u.id, targetId: u.id, amount: d.perTurn, hp: u.hp });
        d.rounds--;
        if (u.hp <= 0 && u.alive) { u.alive = false; events.push({ t: 'death', unitId: u.id }); }
      }
      for (const h of u.hots) {
        if (h.rounds <= 0 || !u.alive) continue;
        u.hp = Math.min(u.maxHp, u.hp + h.perTurn);
        events.push({ t: 'heal', sourceId: u.id, targetId: u.id, amount: h.perTurn, hp: u.hp });
        h.rounds--;
      }
      u.dots = u.dots.filter((d) => d.rounds > 0);
      u.hots = u.hots.filter((h) => h.rounds > 0);
    }

    // Initiative: fastest first; stable tie-break by spawn index.
    const order = all.filter((u) => u.alive)
      .sort((a, b) => effSpeed(b) - effSpeed(a) || a.idx - b.idx);

    for (const u of order) {
      if (!u.alive || livingAllies().length === 0 || livingEnemies().length === 0) break;
      u.mana = Math.min(u.maxMana, u.mana + 2); // small per-turn regen

      if (u.stunRounds > 0) { events.push({ t: 'skip', unitId: u.id, reason: 'stun' }); continue; }
      if (u.asleepRounds > 0) { events.push({ t: 'skip', unitId: u.id, reason: 'sleep' }); continue; }

      events.push({ t: 'turn', unitId: u.id });
      if (u.side === 'ally') allyTurn(u); else enemyTurn(u);
    }

    // End of round: decay timed statuses.
    for (const u of all) {
      if (u.defenseDownRounds > 0 && --u.defenseDownRounds === 0) u.defenseDown = 0;
      if (u.slowRounds > 0 && --u.slowRounds === 0) u.slowAmount = 0;
      if (u.stunRounds > 0) u.stunRounds--;
      if (u.buffRounds > 0 && --u.buffRounds === 0) { u.buffAtkPct = 0; u.buffDefPct = 0; u.buffSpdPct = 0; }
    }
  }

  const victory = livingEnemies().length === 0 && livingAllies().length > 0;
  events.push({ t: 'end', victory });
  return {
    events,
    outcome: { victory, rounds: round, survivingAllyIds: livingAllies().map((u) => u.id) },
  };

  // ── Turn logic ────────────────────────────────────────────────────────────

  function allyTurn(u: Unit) {
    const decision = chooseAction(u);
    if (decision.action === 'defend') { u.defending = true; events.push({ t: 'defend', unitId: u.id }); return; }
    const { skill, targets, isBasic } = decision;
    if (targets.length === 0) return;
    events.push({
      t: 'action', unitId: u.id,
      skillId: isBasic ? 'basic_attack' : skill!.id,
      name: isBasic ? 'Attack' : skill!.name,
      targetIds: targets.map((t) => t.id),
    });
    if (isBasic) {
      const dmg = Math.round(between(u.basicAttack.min, u.basicAttack.max) * (1 + u.buffAtkPct / 100));
      dealDamage(u, targets[0], dmg);
    } else {
      castSkill(u, skill!, targets);
      u.mana = Math.max(0, u.mana - skill!.mpCost);
    }
  }

  function enemyTurn(u: Unit) {
    const targets = livingAllies();
    if (targets.length === 0) return;
    // Simple AI: hit the lowest-HP ally with a basic attack.
    const tgt = lowestHp(targets);
    events.push({ t: 'action', unitId: u.id, skillId: 'basic_attack', name: 'Attack', targetIds: [tgt.id] });
    const dmg = Math.round(between(u.basicAttack.min, u.basicAttack.max) * (1 + u.buffAtkPct / 100));
    dealDamage(u, tgt, dmg);
  }

  // ── Strategy → action ─────────────────────────────────────────────────────

  function chooseAction(u: Unit): {
    action: 'skill' | 'defend';
    skill?: ResolverSkill;
    targets: Unit[];
    isBasic?: boolean;
  } {
    for (const rule of u.strategy) {
      if (!conditionMet(u, rule.condition.type, rule.condition.value)) continue;
      const resolved = resolveRuleAction(u, rule);
      if (resolved) return resolved;
    }
    // Default: strongest attack at the lowest-HP enemy (or basic attack).
    return strongestAttack(u, 'lowest_hp') ?? basicAttack(u, 'lowest_hp');
  }

  function resolveRuleAction(u: Unit, rule: CombatStrategy) {
    switch (rule.action) {
      case 'defend':
        return { action: 'defend' as const, targets: [] };
      case 'use_best_heal': {
        const skill = bestHealSkill(u);
        if (!skill) return null;
        const targets = healTargets(u, rule.targetMode);
        return targets.length ? { action: 'skill' as const, skill, targets } : null;
      }
      case 'use_aoe': {
        const skill = u.skills.find((s) => s.effects.some((e) => e.type === 'aoe') && u.mana >= s.mpCost);
        if (!skill) return null;
        const targets = enemiesOf(u);
        return targets.length ? { action: 'skill' as const, skill, targets } : null;
      }
      case 'use_strongest_attack':
        return strongestAttack(u, rule.targetMode);
      case 'use_skill': {
        const skill = rule.skillId ? u.skills.find((s) => s.id === rule.skillId && u.mana >= s.mpCost) : undefined;
        if (!skill) return null;
        const targets = skillTargets(u, skill, rule.targetMode);
        return targets.length ? { action: 'skill' as const, skill, targets } : null;
      }
      default:
        return null;
    }
  }

  function conditionMet(u: Unit, type: ConditionType, value: number): boolean {
    const hpPct = (x: Unit) => (x.hp / x.maxHp) * 100;
    switch (type) {
      case 'self_hp_below':   return hpPct(u) < value;
      case 'self_hp_above':   return hpPct(u) > value;
      case 'self_mp_below':   return u.maxMana > 0 && (u.mana / u.maxMana) * 100 < value;
      case 'enemy_hp_below':  return enemiesOf(u).some((e) => hpPct(e) < value);
      case 'enemy_hp_above':  return enemiesOf(u).some((e) => hpPct(e) > value);
      case 'enemy_count_above': return enemiesOf(u).length > value;
      case 'turn_number_lte': return round <= value;
      case 'turn_number_gte': return round >= value;
      case 'ally_hp_below':   return alliesOf(u).some((a) => hpPct(a) < value);
      case 'self_has_debuff': return u.defenseDown > 0 || u.slowAmount > 0 || u.stunRounds > 0 || u.dots.length > 0;
      case 'enemy_has_buff':  return false; // enemies don't carry buffs in this model
      case 'random_chance':   return rng() * 100 < value;
      default:                return false;
    }
  }

  // ── Action builders ────────────────────────────────────────────────────────

  function strongestAttack(u: Unit, mode: CombatStrategy['targetMode']) {
    // Highest single-target damage skill we can afford, else the basic attack.
    let best: ResolverSkill | undefined;
    let bestVal = 0;
    for (const s of u.skills) {
      if (u.mana < s.mpCost) continue;
      const dmg = s.effects.filter((e) => e.type === 'damage' || e.type === 'aoe')
        .reduce((m, e) => m + e.value, 0);
      if (dmg > bestVal) { bestVal = dmg; best = s; }
    }
    if (best) {
      const targets = skillTargets(u, best, mode);
      if (targets.length) return { action: 'skill' as const, skill: best, targets };
    }
    return basicAttack(u, mode);
  }

  function basicAttack(u: Unit, mode: CombatStrategy['targetMode']) {
    const tgt = pickEnemy(u, mode);
    return { action: 'skill' as const, isBasic: true, targets: tgt ? [tgt] : [] };
  }

  function bestHealSkill(u: Unit): ResolverSkill | undefined {
    let best: ResolverSkill | undefined; let bestVal = 0;
    for (const s of u.skills) {
      if (u.mana < s.mpCost) continue;
      const heal = s.effects.filter((e) => e.type === 'heal').reduce((m, e) => m + e.value, 0);
      if (heal > bestVal) { bestVal = heal; best = s; }
    }
    return best;
  }

  function skillTargets(u: Unit, skill: ResolverSkill, mode: CombatStrategy['targetMode']): Unit[] {
    const hasAoe = skill.effects.some((e) => e.type === 'aoe' || e.aoe);
    const isHeal = skill.effects.some((e) => e.type === 'heal' || e.type === 'hot' || e.type === 'team_buff' || e.type === 'shield');
    if (hasAoe) return enemiesOf(u);
    if (isHeal) return healTargets(u, mode);
    const tgt = pickEnemy(u, mode);
    return tgt ? [tgt] : [];
  }

  function healTargets(u: Unit, mode: CombatStrategy['targetMode']): Unit[] {
    if (mode === 'self') return [u];
    if (mode === 'all') return alliesOf(u);
    const wounded = alliesOf(u).slice().sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);
    return wounded.length ? [wounded[0]] : [u];
  }

  function pickEnemy(u: Unit, mode: CombatStrategy['targetMode']): Unit | undefined {
    const foes = enemiesOf(u);
    if (foes.length === 0) return undefined;
    switch (mode) {
      case 'highest_hp': return foes.reduce((a, b) => (b.hp > a.hp ? b : a));
      case 'random':     return foes[Math.floor(rng() * foes.length)];
      case 'lowest_hp':
      default:           return lowestHp(foes);
    }
  }

  function lowestHp(units: Unit[]): Unit {
    return units.reduce((a, b) => (b.hp < a.hp ? b : a));
  }

  function between(min: number, max: number): number {
    return Math.round(min + rng() * Math.max(0, max - min));
  }

  // ── Skill effect application ────────────────────────────────────────────────

  function castSkill(u: Unit, skill: ResolverSkill, targets: Unit[]) {
    const isAoe = skill.effects.some((e) => e.type === 'aoe' || e.aoe);
    for (const e of skill.effects) {
      applyEffect(u, skill, e, targets, isAoe);
    }
  }

  function applyEffect(src: Unit, skill: ResolverSkill, e: SkillEffect, targets: Unit[], isAoe: boolean) {
    switch (e.type) {
      case 'damage':
      case 'aoe': {
        let totalDmg = 0;
        for (const tgt of targets) {
          let v = Math.round(between(Math.round(e.value * 0.85), Math.round(e.value * 1.15)) * (1 + src.buffAtkPct / 100));
          // Execute: bonus / finisher vs low-HP targets.
          const exe = skill.effects.find((x) => x.type === 'execute');
          if (exe) {
            const pct = tgt.hp / tgt.maxHp;
            if (pct <= 0.30) v = Math.round(v * (1 + exe.value / 100));
            if (pct <= 0.15 && rng() < (exe.chance ?? 0)) v = tgt.hp; // instant kill
          }
          totalDmg += dealDamage(src, tgt, v);
        }
        const ls = skill.effects.find((x) => x.type === 'lifesteal');
        if (ls && totalDmg > 0) healUnit(src, src, Math.round((totalDmg * ls.value) / 100));
        break;
      }
      case 'heal':
        for (const t of targets) healUnit(src, t, e.value);
        break;
      case 'hot':
        src.hots.push({ perTurn: e.value, rounds: e.duration ?? 3 });
        emitStatus(src, 'hot', e.duration ?? 3);
        break;
      case 'shield':
        src.shield += e.value;
        emitStatus(src, 'shield', e.duration ?? 2);
        break;
      case 'team_buff': {
        const rounds = e.duration ?? 3;
        for (const a of alliesOf(src)) {
          if (e.stat === 'defense') a.buffDefPct += e.value;
          else if (e.stat === 'speed') a.buffSpdPct += e.value;
          else a.buffAtkPct += e.value;
          a.buffRounds = Math.max(a.buffRounds, rounds);
          emitStatus(a, `buff_${e.stat ?? 'attack'}`, rounds);
        }
        break;
      }
      case 'dot':
      case 'bleed':
      case 'poison':
        for (const t of targets) {
          t.dots.push({ perTurn: e.value, rounds: e.duration ?? 3, label: e.type });
          emitStatus(t, e.type, e.duration ?? 3);
        }
        break;
      case 'pierce':
        for (const t of targets) {
          t.defenseDown = Math.max(t.defenseDown, e.value);
          t.defenseDownRounds = Math.max(t.defenseDownRounds, e.duration ?? 2);
          emitStatus(t, 'pierce', e.duration ?? 2);
        }
        break;
      case 'slow':
        for (const t of targets) {
          t.slowAmount = Math.max(t.slowAmount, e.value);
          t.slowRounds = Math.max(t.slowRounds, e.duration ?? 2);
          emitStatus(t, 'slow', e.duration ?? 2);
        }
        break;
      case 'stun':
        for (const t of targets) {
          if (rng() < (e.chance ?? 0.9)) { t.stunRounds = Math.max(t.stunRounds, e.duration ?? 1); emitStatus(t, 'stun', e.duration ?? 1); }
        }
        break;
      case 'sleep':
        for (const t of targets) {
          if (rng() < (e.chance ?? 0.7)) { t.asleepRounds = Math.max(t.asleepRounds, e.duration ?? 99); emitStatus(t, 'sleep', e.duration ?? 99); }
        }
        break;
      case 'execute':
      case 'lifesteal':
        break; // handled alongside damage above
    }
    void isAoe;
  }

  function emitStatus(u: Unit, status: string, rounds: number) {
    events.push({ t: 'status', targetId: u.id, status, rounds });
  }
}
