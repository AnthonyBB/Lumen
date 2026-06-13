import { useMemo, useState, type CSSProperties } from 'react'
import { SKILL_CLASSES } from '../game/data/skillTrees'
import { DIFFICULTIES, DIFFICULTY_ORDER } from '../game/data/mobs'
import { ATTR_ORDER, CLASS_ATTR_MAX, classBaseAttrs } from '../game/data/classStats'
import { Sfx } from '../game/systems/Sfx'

/**
 * The Garrison panel — two views behind the building's NPCs (docs/TEAMS_DESIGN.md):
 *  • Barracks (the Barracks Master): recruit new heroes + manage the collection
 *    (filter/sort/search, set the lead you play as).
 *  • Squad Builder (the Squad Captain): create/rename/delete teams, fill their
 *    2×2 slots, see role coverage, and pick the active campaign team.
 * Fed by the server's `roster:data`; every mutation goes through the socket and
 * the server re-pushes state (server-authoritative — docs/TEAMS_DESIGN.md §10).
 */

export interface RosterCharacter {
  id: string
  name: string
  class: string
  level: number
  xp: number
  /** Server-computed power rating (docs/TEAMS_DESIGN.md §6). */
  power: number
}

/** A saved squad (mirror of the server `Team`). */
export interface TeamData {
  id: string
  name: string
  crest: string
  color: string
  memberIds: string[]
  /** Sum of member power ratings (server-computed). */
  power: number
}

/** One team's idle deployment (mirror of the server `Deployment`). */
export interface DeploymentData {
  teamId: string
  biome: string
  difficulty: string
}

export interface RosterData {
  characters: RosterCharacter[]
  activeCharacterId: string
  party: string[]
  teams: TeamData[]
  /** Active idle deployments (TEAMS §5). */
  deployments: DeploymentData[]
  /** Current automated-battle interval (minutes), account-wide. */
  idleIntervalMinutes: number
  freeSlots: number
  recruitTokens: number
  /** Recruit-Token cost of the NEXT character (0 while free slots remain). */
  recruitCost: number
  maxRoster: number
}

const MAX_PARTY = 4

type View = 'barracks' | 'squads' | 'spoils'

/** Campaigns a team can be deployed to (mirrors BiomeScene's campaign list). */
const BIOMES = [
  'Desert', 'Pine Forest', 'Deciduous Forest', 'Swamp',
  'Snow', 'Grassland', 'Tropical Rainforest', 'Ocean',
]

function fmtInterval(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ''}` : `${m}m`
}

type Role = 'tank' | 'heal' | 'dps' | 'support'

/** Primary role per class — drives the team role-coverage pips (display only). */
const ROLE_BY_CLASS: Record<string, Role> = {
  fire_mage: 'dps', ice_mage: 'dps', lightning_mage: 'dps',
  sword: 'dps', spear: 'dps', axe: 'dps',
  hammer: 'tank', monk: 'dps', paladin: 'tank',
  assassin: 'dps', cleric: 'heal', shaman: 'support', bard: 'support',
}

const ROLES: { key: Role; label: string; color: string }[] = [
  { key: 'tank', label: 'Tank', color: '#6fb7ff' },
  { key: 'heal', label: 'Heal', color: '#5fd38d' },
  { key: 'dps', label: 'DPS', color: '#ff7a5c' },
  { key: 'support', label: 'Sup', color: '#c89bff' },
]

interface Props {
  roster: RosterData
  /** Which single view this NPC exposes (Barracks Master / Squad Captain / Field Marshal). */
  view: View
  onSetActive: (characterId: string) => void
  onCreate: (name: string, cls: string) => void
  onCreateTeam: () => void
  onDeleteTeam: (teamId: string) => void
  onRenameTeam: (teamId: string, name: string) => void
  onSetTeamMembers: (teamId: string, memberIds: string[]) => void
  onSetActiveTeam: (teamId: string) => void
  onDeploy: (teamId: string, biome: string, difficulty: string) => void
  onRecall: (teamId: string) => void
  onClose: () => void
  /** Open the Barracks straight on the recruit form. */
  startRecruiting?: boolean
}

/** 'fire_mage' → 'Fire Mage' */
export function classLabel(cls: string): string {
  return cls.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

/** Header title per view — each Garrison NPC shows only its own. */
const VIEW_TITLE: Record<View, string> = {
  barracks: 'Barracks',
  squads: 'Squads',
  spoils: 'War Spoils',
}

export default function RosterPanel(props: Props) {
  const { roster, view, onClose } = props

  const charById = useMemo(() => {
    const m = new Map<string, RosterCharacter>()
    for (const c of roster.characters) m.set(c.id, c)
    return m
  }, [roster.characters])

  // charId → the team it belongs to (exclusive membership — at most one).
  const teamOfChar = useMemo(() => {
    const m = new Map<string, TeamData>()
    for (const t of roster.teams) for (const id of t.memberIds) m.set(id, t)
    return m
  }, [roster.teams])

  return (
    <div
      className="fixed inset-0 z-[55] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-lumen-gold/30 bg-lumen-dark shadow-2xl shadow-purple-900/40"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — locked to this NPC's single view (no cross-navigation). */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <h2 className="font-display text-lg text-lumen-gold">{VIEW_TITLE[view]}</h2>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 text-gray-400 hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {view === 'barracks' ? (
          <BarracksView {...props} teamOfChar={teamOfChar} />
        ) : view === 'squads' ? (
          <SquadView {...props} charById={charById} teamOfChar={teamOfChar} />
        ) : (
          <SpoilsView {...props} />
        )}
      </div>
    </div>
  )
}

// ── Class recruit picker (sprites reuse the NPC citizen sheets for now) ─────────

/** Per-class hero art (decision 1b). Drop a PNG per class under public/assets and
 *  map classId → url here; the recruiter then shows it instead of the citizen
 *  fallback below — no other code changes needed. e.g.:
 *    sword: '/assets/heroes/sword.png'
 *  Until populated, each class reuses a recolored citizen NPC sprite. */
const CLASS_PORTRAIT: Record<string, string> = {
  // TODO(art): add the 13 commissioned per-class hero sprites.
}

/** Inline style showing a class's hero art — the commissioned portrait if mapped
 *  in CLASS_PORTRAIT, else a recolored first idle frame from a citizen sheet
 *  (12-col, 32px; see townNpcs.ts). */
function classSpriteStyle(cls: string, size: number): CSSProperties {
  const portrait = CLASS_PORTRAIT[cls]
  if (portrait) {
    return {
      width: size, height: size,
      backgroundImage: `url(${portrait})`,
      backgroundRepeat: 'no-repeat',
      backgroundPosition: 'center',
      backgroundSize: 'contain',
      imageRendering: 'pixelated',
    }
  }
  const idx = Math.max(0, (SKILL_CLASSES as readonly string[]).indexOf(cls))
  const sheet = (idx % 5) + 1
  const scale = size / 32
  return {
    width: size, height: size,
    backgroundImage: `url(/assets/craftpix/npcs/citizen${sheet}_idle.png)`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: '0 0',
    backgroundSize: `${384 * scale}px auto`,
    imageRendering: 'pixelated',
    filter: `hue-rotate(${(idx * 47) % 360}deg)`,
  }
}

function roleOf(cls: string): { label: string; color: string } {
  const def = ROLES.find((x) => x.key === ROLE_BY_CLASS[cls])
  return { label: def?.label ?? '—', color: def?.color ?? '#9aa0c0' }
}

function ClassCard({ cls, selected, onSelect }: { cls: string; selected: boolean; onSelect: () => void }) {
  const { label, color } = roleOf(cls)
  return (
    <button
      onClick={onSelect}
      className="flex flex-col items-center rounded-lg border px-1 py-2 transition-colors"
      style={{
        borderColor: selected ? color : 'rgba(255,255,255,0.1)',
        background: selected ? `${color}22` : 'rgba(255,255,255,0.04)',
      }}
    >
      <span style={classSpriteStyle(cls, 40)} aria-hidden />
      <span className="mt-1 text-center text-[11px] leading-tight text-white">{classLabel(cls)}</span>
      <span className="text-[9px] font-semibold" style={{ color }}>{label}</span>
    </button>
  )
}

function ClassStatDetail({ cls }: { cls: string }) {
  const attrs = classBaseAttrs(cls)
  const { color } = roleOf(cls)
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-2.5">
      <p className="mb-1.5 text-xs text-gray-300">
        {classLabel(cls)} <span className="text-gray-500">· starting attributes</span>
      </p>
      <div className="space-y-1">
        {ATTR_ORDER.map(({ key, short }) => (
          <div key={key} className="flex items-center gap-2">
            <span className="w-8 text-[10px] text-gray-400">{short}</span>
            <div className="h-2 flex-1 overflow-hidden rounded bg-white/10">
              <div className="h-full rounded" style={{ width: `${(attrs[key] / CLASS_ATTR_MAX) * 100}%`, background: color }} />
            </div>
            <span className="w-5 text-right text-[10px] text-gray-300">{attrs[key]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Barracks: recruit + manage the collection ──────────────────────────────────

function BarracksView({
  roster, onSetActive, onCreate, startRecruiting, teamOfChar,
}: Props & { teamOfChar: Map<string, TeamData> }) {
  const [recruiting, setRecruiting] = useState(!!startRecruiting)
  const [name, setName] = useState('')
  const [cls, setCls] = useState<string>('sword')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<string>('all') // all | unassigned | <class>
  const [sort, setSort] = useState<'level' | 'name'>('level')

  const atMaxRoster = roster.characters.length >= roster.maxRoster
  const recruitCost = roster.recruitCost
  const canAfford = recruitCost === 0 || roster.recruitTokens >= recruitCost
  const canRecruit = !atMaxRoster && canAfford

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = roster.characters.filter((c) => {
      if (q && !c.name.toLowerCase().includes(q)) return false
      if (filter === 'unassigned') return !teamOfChar.has(c.id)
      if (filter !== 'all') return c.class === filter
      return true
    })
    list = [...list].sort((a, b) =>
      sort === 'name' ? a.name.localeCompare(b.name) : b.level - a.level || a.name.localeCompare(b.name),
    )
    return list
  }, [roster.characters, search, filter, sort, teamOfChar])

  const submit = () => {
    if (name.trim().length < 2) return
    onCreate(name.trim(), cls)
    Sfx.play('recruit')
    setName('')
    setRecruiting(false)
  }

  return (
    <div className="p-4">
      <p className="mb-3 text-xs text-gray-400">
        {roster.characters.length}/{roster.maxRoster} heroes · 🎟️{' '}
        <span className="text-lumen-gold">{roster.recruitTokens}</span> tokens · ★ marks who you play as
      </p>

      {/* Filter / sort / search */}
      <div className="mb-3 flex flex-wrap gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name…"
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-lumen-dark/60 px-3 py-1.5 text-sm text-white focus:border-lumen-gold/50 focus:outline-none"
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded-lg border border-white/10 bg-lumen-dark/60 px-2 py-1.5 text-sm text-white focus:outline-none"
        >
          <option value="all" className="bg-lumen-dark">All</option>
          <option value="unassigned" className="bg-lumen-dark">Unassigned</option>
          {SKILL_CLASSES.map((k) => (
            <option key={k} value={k} className="bg-lumen-dark">{classLabel(k)}</option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as 'level' | 'name')}
          className="rounded-lg border border-white/10 bg-lumen-dark/60 px-2 py-1.5 text-sm text-white focus:outline-none"
        >
          <option value="level" className="bg-lumen-dark">Level</option>
          <option value="name" className="bg-lumen-dark">Name</option>
        </select>
      </div>

      {/* Collection */}
      <div className="max-h-[42vh] space-y-2 overflow-y-auto">
        {shown.map((c) => {
          const active = c.id === roster.activeCharacterId
          const team = teamOfChar.get(c.id)
          return (
            <div
              key={c.id}
              className={`flex items-center justify-between rounded-xl border px-4 py-2.5 ${
                active ? 'border-lumen-gold/70 bg-lumen-gold/10' : 'border-white/10 bg-white/5'
              }`}
            >
              <div className="min-w-0">
                <p className="truncate font-display text-base text-white">
                  {active && <span className="mr-1 text-lumen-gold" title="Lead (the hero you play as)">★</span>}
                  {c.name}
                </p>
                <p className="text-xs text-gray-400">
                  {classLabel(c.class)} · Lv {c.level} · ⚡{c.power} ·{' '}
                  <span style={{ color: team ? team.color : undefined }}>
                    {team ? team.name : 'Unassigned'}
                  </span>
                </p>
              </div>
              {active ? (
                <span className="text-xs font-semibold text-lumen-gold">Playing</span>
              ) : (
                <button
                  onClick={() => onSetActive(c.id)}
                  className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-gray-200 hover:bg-white/10"
                >
                  Play as
                </button>
              )}
            </div>
          )
        })}
        {shown.length === 0 && (
          <p className="py-6 text-center text-sm text-gray-500">No heroes match your filters.</p>
        )}
      </div>

      {/* Recruit (folded in from the old Mercenary Guild) */}
      <div className="mt-4 border-t border-white/10 pt-4">
        {!recruiting ? (
          <button
            onClick={() => setRecruiting(true)}
            disabled={!canRecruit}
            className="w-full rounded-xl border border-lumen-gold/40 px-4 py-2.5 font-display text-lumen-gold hover:bg-lumen-gold/15 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {atMaxRoster
              ? 'Roster full'
              : recruitCost === 0
              ? `＋ Recruit a hero (${roster.freeSlots} free ${roster.freeSlots === 1 ? 'slot' : 'slots'})`
              : canAfford
              ? `＋ Recruit a hero (🎟️ ${recruitCost})`
              : `Need 🎟️ ${recruitCost} to recruit (you have ${roster.recruitTokens}) — clear campaigns to earn more`}
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-gray-400">Choose a class — each starts with a different stat profile.</p>
            <div className="grid max-h-[30vh] grid-cols-3 gap-2 overflow-y-auto pr-1">
              {SKILL_CLASSES.map((k) => (
                <ClassCard key={k} cls={k} selected={cls === k} onSelect={() => setCls(k)} />
              ))}
            </div>
            <ClassStatDetail cls={cls} />
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`Name your ${classLabel(cls)}`}
              maxLength={20}
              className="w-full rounded-lg border border-white/10 bg-lumen-dark/60 px-3 py-2 text-white focus:border-lumen-gold/50 focus:outline-none"
            />
            <div className="flex gap-2">
              <button
                onClick={submit}
                disabled={name.trim().length < 2 || !canRecruit}
                className="flex-1 rounded-lg bg-lumen-gold/90 px-4 py-2 font-display font-bold text-lumen-dark hover:bg-lumen-gold disabled:opacity-40"
              >
                {recruitCost > 0 ? `Recruit (🎟️ ${recruitCost})` : 'Recruit'}
              </button>
              <button
                onClick={() => setRecruiting(false)}
                className="rounded-lg border border-white/10 px-4 py-2 text-gray-300 hover:bg-white/10"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Squad Builder: create/edit teams ────────────────────────────────────────────

function SquadView({
  roster, onCreateTeam, onDeleteTeam, onRenameTeam, onSetTeamMembers, onSetActiveTeam,
  charById, teamOfChar,
}: Props & { charById: Map<string, RosterCharacter>; teamOfChar: Map<string, TeamData> }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)

  const MAX_TEAMS = 12
  const atMaxTeams = roster.teams.length >= MAX_TEAMS
  const activeId = roster.teams[0]?.id
  // Selected squad to edit — falls back to the active team if the selection is
  // stale (e.g. after a delete).
  const selected = roster.teams.find((t) => t.id === selectedId) ?? roster.teams[0]

  const rolesCovered = (team: TeamData): Set<Role> => {
    const s = new Set<Role>()
    for (const id of team.memberIds) {
      const r = ROLE_BY_CLASS[charById.get(id)?.class ?? '']
      if (r) s.add(r)
    }
    return s
  }
  const select = (id: string) => { setSelectedId(id); setRenaming(false); setPickerOpen(false) }
  const addMember = (team: TeamData, charId: string) => {
    if (team.memberIds.length >= MAX_PARTY || team.memberIds.includes(charId)) return
    onSetTeamMembers(team.id, [...team.memberIds, charId])
    setPickerOpen(false)
  }
  const removeMember = (team: TeamData, charId: string) => {
    onSetTeamMembers(team.id, team.memberIds.filter((id) => id !== charId))
  }
  const commitRename = () => {
    if (selected && renameValue.trim().length >= 1) onRenameTeam(selected.id, renameValue.trim())
    setRenaming(false)
  }

  const slots: (string | null)[] = selected ? [0, 1, 2, 3].map((i) => selected.memberIds[i] ?? null) : []

  return (
    <div className="p-4">
      <p className="mb-1 text-xs text-gray-400">
        Tap a squad to edit it · a hero is on at most one team · the <span className="text-lumen-gold">Active</span> team fights your campaigns
      </p>
      <p className="mb-3 text-[11px] text-gray-500">
        Heroes come from your roster — recruit more at the <span className="text-gray-300">Barracks Master</span>, then add them to any squad here.
      </p>

      {/* Squad tiles — a compact grid that scales (no long scrolling list). */}
      <div className="grid max-h-[26vh] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
        {roster.teams.map((team) => {
          const isActive = team.id === activeId
          const isSel = selected?.id === team.id
          const covered = rolesCovered(team)
          return (
            <button
              key={team.id}
              onClick={() => select(team.id)}
              className="rounded-lg border px-2 py-2 text-left transition-colors"
              style={{
                borderColor: isSel ? team.color : 'rgba(255,255,255,0.1)',
                background: isSel ? `${team.color}1a` : 'rgba(255,255,255,0.04)',
              }}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="min-w-0 truncate text-sm text-white">
                  <span style={{ color: team.color }}>◆</span> {team.name}
                </span>
                {isActive && <span className="shrink-0 text-[9px] font-semibold text-lumen-gold">ACTIVE</span>}
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-[10px] text-gray-400">{team.memberIds.length}/{MAX_PARTY} · ⚡{team.power}</span>
                <span className="flex gap-0.5">
                  {ROLES.map((r) => (
                    <span key={r.key} className="h-1.5 w-1.5 rounded-full"
                      style={{ background: covered.has(r.key) ? r.color : '#33333f' }} />
                  ))}
                </span>
              </div>
            </button>
          )
        })}
        <button
          onClick={() => { if (!atMaxTeams) { onCreateTeam(); Sfx.play('click') } }}
          disabled={atMaxTeams}
          className="flex items-center justify-center rounded-lg border border-dashed border-lumen-gold/40 px-2 py-2 text-sm text-lumen-gold hover:bg-lumen-gold/10 disabled:opacity-40"
        >
          ＋ New
        </button>
      </div>

      {/* Selected squad editor */}
      {selected && (
        <div
          className="mt-3 rounded-xl border px-3 py-3"
          style={{ borderColor: selected.id === activeId ? selected.color : 'rgba(255,255,255,0.12)' }}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            {renaming ? (
              <input
                autoFocus
                value={renameValue}
                maxLength={24}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => { if (e.key === 'Enter') commitRename() }}
                className="min-w-0 flex-1 rounded border border-white/15 bg-lumen-dark/60 px-2 py-1 text-sm text-white focus:outline-none"
              />
            ) : (
              <button
                onClick={() => { setRenaming(true); setRenameValue(selected.name) }}
                className="min-w-0 truncate text-left font-display text-base text-white hover:text-lumen-gold"
                title="Rename team"
              >
                <span style={{ color: selected.color }}>◆</span> {selected.name}
              </button>
            )}
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-xs text-gray-400" title="Team power (sum of members)">⚡{selected.power}</span>
              {selected.id === activeId ? (
                <span className="rounded bg-lumen-gold/15 px-2 py-0.5 text-xs font-semibold text-lumen-gold">Active</span>
              ) : (
                <button
                  onClick={() => onSetActiveTeam(selected.id)}
                  className="rounded border border-white/15 px-2 py-0.5 text-xs text-gray-200 hover:bg-white/10"
                >
                  Set active
                </button>
              )}
              <button
                onClick={() => onDeleteTeam(selected.id)}
                disabled={roster.teams.length <= 1}
                title="Delete team"
                className="rounded px-2 py-0.5 text-xs text-gray-500 hover:bg-white/10 hover:text-red-400 disabled:opacity-30"
              >
                Delete
              </button>
            </div>
          </div>

          {/* Role coverage pips */}
          <div className="mb-2 flex gap-1.5">
            {ROLES.map((r) => {
              const lit = rolesCovered(selected).has(r.key)
              return (
                <span
                  key={r.key}
                  className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                  style={{
                    color: lit ? r.color : '#5b5b6b',
                    border: `1px solid ${lit ? r.color : '#33333f'}`,
                    backgroundColor: lit ? `${r.color}22` : 'transparent',
                  }}
                >
                  {r.label}
                </span>
              )
            })}
          </div>

          {/* 2×2 slots */}
          <div className="grid grid-cols-2 gap-2">
            {slots.map((id, i) => {
              if (id) {
                const c = charById.get(id)
                return (
                  <div key={i} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-2.5 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-white">{c?.name ?? '—'}</p>
                      <p className="text-[10px] text-gray-400">{c ? `${classLabel(c.class)} · Lv ${c.level}` : ''}</p>
                    </div>
                    <button
                      onClick={() => removeMember(selected, id)}
                      title="Remove from team"
                      className="ml-1 shrink-0 rounded px-1.5 text-gray-500 hover:bg-white/10 hover:text-red-400"
                    >
                      ✕
                    </button>
                  </div>
                )
              }
              return (
                <button
                  key={i}
                  onClick={() => setPickerOpen((v) => !v)}
                  className="rounded-lg border border-dashed border-white/15 px-2.5 py-2 text-sm text-gray-500 hover:border-lumen-gold/40 hover:text-lumen-gold"
                >
                  ＋ Add
                </button>
              )
            })}
          </div>

          {/* Member picker */}
          {pickerOpen && (
            <div className="mt-2 rounded-lg border border-white/10 bg-lumen-dark/60 p-2">
              <div className="mb-1 flex items-center justify-between">
                <p className="text-xs text-gray-400">Add a hero</p>
                <button onClick={() => setPickerOpen(false)} className="text-xs text-gray-500 hover:text-white">close</button>
              </div>
              <div className="max-h-32 space-y-1 overflow-y-auto">
                {roster.characters
                  .filter((c) => !selected.memberIds.includes(c.id))
                  .map((c) => {
                    const other = teamOfChar.get(c.id)
                    return (
                      <button
                        key={c.id}
                        onClick={() => addMember(selected, c.id)}
                        className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm text-gray-200 hover:bg-white/10"
                      >
                        <span className="truncate">{c.name} <span className="text-[10px] text-gray-500">· {classLabel(c.class)} Lv {c.level}</span></span>
                        {other && (
                          <span className="ml-2 shrink-0 text-[10px]" style={{ color: other.color }}>
                            on {other.name} — moves
                          </span>
                        )}
                      </button>
                    )
                  })}
                {roster.characters.filter((c) => !selected.memberIds.includes(c.id)).length === 0 && (
                  <p className="px-2 py-1.5 text-xs text-gray-500">No other heroes to add.</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── War Spoils Table: deploy teams to campaigns (idle) ──────────────────────────

function SpoilsView({ roster, onDeploy, onRecall }: Props) {
  const deployByTeam = useMemo(() => {
    const m = new Map<string, DeploymentData>()
    for (const d of roster.deployments) m.set(d.teamId, d)
    return m
  }, [roster.deployments])

  // Per-team campaign/difficulty selection (defaults to its deployment, else first).
  const [picks, setPicks] = useState<Record<string, { biome: string; difficulty: string }>>({})
  const pickFor = (teamId: string) =>
    picks[teamId] ?? (() => {
      const d = deployByTeam.get(teamId)
      return { biome: d?.biome ?? BIOMES[0], difficulty: d?.difficulty ?? DIFFICULTY_ORDER[0] }
    })()
  const setPick = (teamId: string, patch: Partial<{ biome: string; difficulty: string }>) =>
    setPicks((p) => ({ ...p, [teamId]: { ...pickFor(teamId), ...patch } }))

  const diffLabel = (d: string) => DIFFICULTIES[d as keyof typeof DIFFICULTIES]?.label ?? d

  return (
    <div className="p-4">
      <p className="mb-3 text-xs text-gray-400">
        Deployed teams auto-battle while you're away · spoils are credited when you open this table or log in ·
        a battle every <span className="text-lumen-gold">{fmtInterval(roster.idleIntervalMinutes)}</span> (study to go faster)
      </p>

      <div className="max-h-[52vh] space-y-3 overflow-y-auto">
        {roster.teams.map((team) => {
          const dep = deployByTeam.get(team.id)
          const pick = pickFor(team.id)
          const empty = team.memberIds.length === 0
          return (
            <div
              key={team.id}
              className="rounded-xl border px-3 py-3"
              style={{ borderColor: dep ? team.color : 'rgba(255,255,255,0.1)' }}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="min-w-0 truncate font-display text-base text-white">
                  <span style={{ color: team.color }}>◆</span> {team.name}
                  <span className="ml-2 text-xs text-gray-500">{team.memberIds.length}/{MAX_PARTY}</span>
                </p>
                {dep ? (
                  <span className="shrink-0 rounded bg-lumen-gold/15 px-2 py-0.5 text-xs font-semibold text-lumen-gold">
                    Deployed
                  </span>
                ) : (
                  <span className="shrink-0 text-xs text-gray-500">Home</span>
                )}
              </div>

              {dep && (
                <p className="mb-2 text-sm text-gray-200">
                  On campaign: <span className="text-lumen-gold">{dep.biome} · {diffLabel(dep.difficulty)}</span>
                </p>
              )}

              {empty ? (
                <p className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-gray-400">
                  Add heroes to this team in the Squads tab before deploying.
                </p>
              ) : (
                <div className="flex flex-wrap items-end gap-2">
                  <select
                    value={pick.biome}
                    onChange={(e) => setPick(team.id, { biome: e.target.value })}
                    className="min-w-0 flex-1 rounded-lg border border-white/10 bg-lumen-dark/60 px-2 py-1.5 text-sm text-white focus:outline-none"
                  >
                    {BIOMES.map((b) => <option key={b} value={b} className="bg-lumen-dark">{b}</option>)}
                  </select>
                  <select
                    value={pick.difficulty}
                    onChange={(e) => setPick(team.id, { difficulty: e.target.value })}
                    className="rounded-lg border border-white/10 bg-lumen-dark/60 px-2 py-1.5 text-sm text-white focus:outline-none"
                  >
                    {DIFFICULTY_ORDER.map((d) => (
                      <option key={d} value={d} className="bg-lumen-dark">{DIFFICULTIES[d].label}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => { onDeploy(team.id, pick.biome, pick.difficulty); Sfx.play('click') }}
                    className="rounded-lg bg-lumen-gold/90 px-3 py-1.5 text-sm font-display font-bold text-lumen-dark hover:bg-lumen-gold"
                  >
                    {dep ? 'Redeploy' : 'Deploy'}
                  </button>
                  {dep && (
                    <button
                      onClick={() => { onRecall(team.id); Sfx.play('click') }}
                      className="rounded-lg border border-red-500/50 px-3 py-1.5 text-sm text-red-300 hover:bg-red-500/15"
                    >
                      Recall
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <p className="mt-3 text-[11px] text-gray-500">
        Higher difficulty = bigger spoils, but the team must be strong enough to win. Each team can hold one campaign.
      </p>
    </div>
  )
}
