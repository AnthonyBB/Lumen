/**
 * ItemDatabase — canonical definitions for every item in the game.
 *
 * Security notes:
 *  - Item stats are defined here on the server; the client never supplies them.
 *  - Item IDs (UUIDs) are assigned at runtime by InventoryManager, not hardcoded,
 *    so clients cannot predict or forge them.
 *  - This file is NEVER imported client-side.
 */

import type { InventoryItem, ItemRarity, EquipmentSlotKey, ItemStats } from '../types/index.js';
import { randomUUID } from 'crypto';

// ---------------------------------------------------------------------------
// Item template (no runtime UUID yet — IDs are stamped at creation time)
// ---------------------------------------------------------------------------

interface ItemTemplate {
  itemType: string;
  name: string;
  description: string;
  rarity: ItemRarity;
  /** Which equipment slot this item fits, if any. */
  slot?: EquipmentSlotKey;
  stats: ItemStats;
  stackable: boolean;
  icon: string;
}

// ---------------------------------------------------------------------------
// Master item catalogue
// ---------------------------------------------------------------------------

const ITEM_CATALOGUE: Record<string, ItemTemplate> = {
  worn_sword: {
    itemType: 'worn_sword',
    name: 'Worn Sword',
    description: 'A battered iron sword — trusty enough for a new adventurer.',
    rarity: 'common',
    slot: 'mainHand',
    stats: { attack: 5 },
    stackable: false,
    icon: '🗡️',
  },
  worn_shield: {
    itemType: 'worn_shield',
    name: 'Worn Shield',
    description: 'A dented wooden shield that has seen better days.',
    rarity: 'common',
    slot: 'offHand',
    stats: { defense: 5 },
    stackable: false,
    icon: '🛡️',
  },
  health_potion: {
    itemType: 'health_potion',
    name: 'Health Potion',
    description: 'Restores 30 HP when used.',
    rarity: 'common',
    stats: { hp: 30 },
    stackable: true,
    icon: '🧪',
  },
  leather_helm: {
    itemType: 'leather_helm',
    name: 'Leather Helm',
    description: 'A simple leather cap that offers modest head protection.',
    rarity: 'common',
    slot: 'helm',
    stats: { defense: 3 },
    stackable: false,
    icon: '🪖',
  },
  apprentice_ring: {
    itemType: 'apprentice_ring',
    name: "Apprentice's Ring",
    description: 'Boosts XP earned slightly — perfect for eager learners.',
    rarity: 'uncommon',
    slot: 'ring1',
    stats: { xp: 5 },
    stackable: false,
    icon: '💍',
  },
  silver_necklace: {
    itemType: 'silver_necklace',
    name: 'Silver Necklace',
    description: 'A finely crafted necklace that increases max HP.',
    rarity: 'uncommon',
    slot: 'necklace',
    stats: { hp: 15 },
    stackable: false,
    icon: '📿',
  },
  iron_belt: {
    itemType: 'iron_belt',
    name: 'Iron Belt',
    description: 'Reinforced with iron studs for extra resilience.',
    rarity: 'common',
    slot: 'belt',
    stats: { defense: 2 },
    stackable: false,
    icon: '🔩',
  },
  scholars_gloves: {
    itemType: 'scholars_gloves',
    name: "Scholar's Gloves",
    description: 'Enchanted gloves that grant bonus XP on correct answers.',
    rarity: 'rare',
    slot: 'gloves',
    stats: { xp: 10, attack: 2 },
    stackable: false,
    icon: '🧤',
  },
  winged_boots: {
    itemType: 'winged_boots',
    name: 'Winged Boots',
    description: 'Light boots rumoured to help the wearer think faster.',
    rarity: 'rare',
    slot: 'shoes',
    stats: { xp: 8, defense: 2 },
    stackable: false,
    icon: '👟',
  },
  shard_of_knowledge: {
    itemType: 'shard_of_knowledge',
    name: 'Shard of Knowledge',
    description: 'A crystallised fragment of wisdom earned by acing a lesson.',
    rarity: 'epic',
    stats: { xp: 50 },
    stackable: true,
    icon: '🔮',
  },
};

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/**
 * Instantiate an item from the catalogue, assigning a fresh UUID.
 * Returns null if the itemType is unknown.
 */
export function createItem(itemType: string, quantity = 1): InventoryItem | null {
  const template = ITEM_CATALOGUE[itemType];
  if (!template) return null;

  return {
    id: randomUUID(),
    itemType: template.itemType,
    name: template.name,
    description: template.description,
    rarity: template.rarity,
    stats: { ...template.stats },
    quantity: template.stackable ? quantity : 1,
    stackable: template.stackable,
    icon: template.icon,
  };
}

/**
 * Returns the equipment slot this item type fits, or undefined if it is
 * not equippable.
 */
export function getItemSlot(itemType: string): EquipmentSlotKey | undefined {
  return ITEM_CATALOGUE[itemType]?.slot;
}

/**
 * The two items every new player starts with.
 */
export function getStarterItems(): InventoryItem[] {
  const sword = createItem('worn_sword');
  const shield = createItem('worn_shield');
  // Both templates are hardcoded above so these can never be null.
  return [sword!, shield!];
}
