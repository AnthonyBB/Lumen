// ============================================================
// townNpcs.ts — friendly townsfolk who teach the player how the
// game works. Each NPC stands near the building they talk about
// and offers a few pages of kid-friendly guidance.
//
// Positions are world coordinates near each NPC's building in the
// spread-out town (buildings: Armory 895,1010 · Tavern 1395,870 ·
// Combat Training 1780,1150 · Market 935,1575 · Combat Strategy
// 1715,1610 · The Forge 1290,1700 · Alchemy Lab 620,1640 ·
// well/plaza ~1280,1280). Each guide stands in front of the
// building they describe.
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
    id: 'guide_forge',
    name: 'Apprentice Finn',
    x: 1410, y: 1800,
    sprite: 'npc_citizen2',
    lines: [
      'This is the Forge! Step inside and Brann the Blacksmith will help you craft weapons by answering Math questions.',
      'Bring metal you gathered on your adventures, pick a weapon, then choose a metal tier — higher tiers forge mightier weapons.',
      'Add a sparkling catalyst to aim for a rarer weapon. The better you answer the quiz, the finer the blade you\'ll make!',
    ],
  },
  {
    id: 'guide_armory',
    name: 'Squire Bryn',
    x: 1020, y: 1120,
    sprite: 'npc_citizen3',
    lines: [
      'Welcome to the Armory! Inside, Sera the Armorer forges armor — and here the questions are all about Science.',
      'Spend metal to craft helmets, chestplates, greaves and more. The metal\'s tier decides how sturdy the armor turns out.',
      'A catalyst unlocks rarer armor, but you must answer enough questions correctly to claim it. Study hard and stay protected!',
    ],
  },
  {
    id: 'guide_alchemy',
    name: 'Herbalist Posy',
    x: 745, y: 1745,
    sprite: 'npc_citizen5',
    lines: [
      'Step into the Alchemy Lab! Mira the Alchemist brews potions, and you\'ll answer Science questions to help her.',
      'Potions use reagents — the leaves and blooms you gather — instead of metal. Higher-tier reagents brew stronger potions.',
      'Brew Healing, Mana or Rejuvenation potions to carry into battle. Answer perfectly and you\'ll even bottle an extra dose!',
    ],
  },
  {
    id: 'knight',
    name: 'Sir Gareth',
    x: 1610, y: 1360,
    sprite: 'npc_citizen3',
    lines: [
      'Ready for battle? Spend your Skill Shards 🔷 here at Combat Training to learn attacks, spells and heals. Earn shards by clearing campaigns out in the biomes!',
      'In a fight, whoever has the higher Speed strikes first — so watch your stats! Equip better gear to boost them.',
      'Defeat your foes and you\'ll earn XP and silver, and sometimes they\'ll drop equipment for you to claim. Clear a whole campaign for a bigger reward!',
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
      'To learn them you need Combat Shards 🔶 — those are rare, and they drop when you clear a whole campaign out in the biomes.',
      'Bring your Combat Shards to the Strategy Hall behind me, and I\'ll teach you tactics for every kind of foe.',
    ],
  },
]
