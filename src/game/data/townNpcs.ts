// ============================================================
// townNpcs.ts — friendly townsfolk who teach the player how the
// game works. Each NPC stands near the building they talk about
// and offers a few pages of kid-friendly guidance.
//
// Positions are world coordinates near each NPC's building in the
// spread-out town (buildings: Learning Center 895,1010 ·
// Tavern 1395,870 · Combat Training 1780,1150 · Market 935,1575 ·
// Combat Strategy 1715,1610 · well/plaza ~1280,1280). Each guide
// stands on the plaza-facing side of the building they describe.
// ============================================================

export interface NpcDef {
  id: string
  name: string
  x: number
  y: number
  /** Character spritesheet key (loaded in BootScene from NPC_SHEETS). */
  sprite: string
  /** Dialogue pages, shown one at a time. */
  lines: string[]
}

/**
 * NPC character spritesheets (market-square NPC pack). Citizens have a 12-frame,
 * 4-direction idle sheet (row 0 = down, the facing used for standing townsfolk).
 * The single-row "others" (lute player, drink trader) loop their whole strip in
 * place and are used as tavern patrons. All cells are 32px.
 */
export interface NpcSheet {
  key: string
  path: string
  frame: number
  cols: number
  /** Row to idle on for multi-direction sheets; omit for single-row strips. */
  idleRow?: number
  /** Frames in the idle loop (defaults to `cols`). */
  idleFrames?: number
  idleFps?: number
}

export const NPC_SHEETS: NpcSheet[] = [
  { key: 'npc_citizen1', path: '/assets/craftpix/npcs/citizen1_idle.png', frame: 32, cols: 12, idleRow: 0, idleFrames: 12, idleFps: 4 },
  { key: 'npc_citizen2', path: '/assets/craftpix/npcs/citizen2_idle.png', frame: 32, cols: 12, idleRow: 0, idleFrames: 12, idleFps: 4 },
  { key: 'npc_citizen3', path: '/assets/craftpix/npcs/citizen3_idle.png', frame: 32, cols: 12, idleRow: 0, idleFrames: 12, idleFps: 4 },
  { key: 'npc_citizen4', path: '/assets/craftpix/npcs/citizen4_idle.png', frame: 32, cols: 12, idleRow: 0, idleFrames: 12, idleFps: 4 },
  { key: 'npc_citizen5', path: '/assets/craftpix/npcs/citizen5_idle.png', frame: 32, cols: 12, idleRow: 0, idleFrames: 12, idleFps: 4 },
  { key: 'npc_lute',     path: '/assets/craftpix/npcs/lute.png',          frame: 32, cols: 6,  idleFrames: 6,  idleFps: 5 },
  { key: 'npc_drinks',   path: '/assets/craftpix/npcs/trader_drinks.png', frame: 32, cols: 12, idleFrames: 12, idleFps: 5 },
]

export const TOWN_NPCS: NpcDef[] = [
  {
    id: 'mayor',
    name: 'Mayor Aldric',
    x: 1280, y: 1410,
    sprite: 'npc_citizen1',
    lines: [
      'Welcome to Lumen, young adventurer! This is the town square — your home base.',
      'Visit the buildings around you to learn skills and gear up, then step through a glowing gate to adventure into the biomes.',
      'Press  C  to see your Character sheet and  I  to open your Equipment. Now go — destiny awaits!',
    ],
  },
  {
    id: 'scholar',
    name: 'Mira the Scholar',
    x: 1035, y: 1190,
    sprite: 'npc_citizen2',
    lines: [
      'Never stop learning! Head into the Learning Center and answer questions to grow.',
      'Each quiz you complete earns you a Skill Shard 🔷. Take those to the Combat Training hall to learn new skills and spells for battle.',
      'Master an entire topic and you\'ll earn a Combat Shard 🔶. Spend those at the Combat Strategy Hall to learn clever battle strategies.',
      'The more you study, the more shards you earn — and the stronger your hero becomes. Knowledge is power here, quite literally!',
    ],
  },
  {
    id: 'knight',
    name: 'Sir Gareth',
    x: 1610, y: 1360,
    sprite: 'npc_citizen3',
    lines: [
      'Ready for battle? Spend your Skill Shards 🔷 here at Combat Training to learn attacks, spells and heals.',
      'In a fight, whoever has the higher Speed strikes first — so watch your stats! Equip better gear to boost them.',
      'Defeat your foes and you\'ll earn XP and silver, and sometimes they\'ll drop equipment for you to claim. Clear a whole biome for a bigger reward!',
    ],
  },
  {
    id: 'merchant',
    name: 'Goodwife Tilda',
    x: 1095, y: 1600,
    sprite: 'npc_citizen4',
    lines: [
      'Coin makes the world turn, dearie! You earn silver by defeating monsters or selling gear you don\'t need.',
      'At the Market you can sell items to the shop, or list them for other players to buy. Browse the tabs for weapons, armor and trinkets.',
      'Sold something by mistake? Don\'t fret — the Market Vendor holds it so you can buy it right back.',
    ],
  },
  {
    id: 'strategist',
    name: 'Tactician Vex',
    x: 1575, y: 1640,
    sprite: 'npc_citizen5',
    lines: [
      'A clever plan wins the day! Strategies tell your hero how to fight smartly when a battle gets tough.',
      'To learn them you need Combat Shards 🔶 — and those come from mastering your lessons at the Learning Center.',
      'Bring your Combat Shards to the Strategy Hall behind me, and I\'ll teach you tactics for every kind of foe.',
    ],
  },
]
