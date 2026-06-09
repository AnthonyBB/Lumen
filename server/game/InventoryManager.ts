/**
 * InventoryManager — server-authoritative inventory for every connected player.
 *
 * Security notes:
 *  - All mutations are initiated server-side or validated here before applying.
 *  - The client only sends itemId + slot; the server confirms ownership and
 *    slot compatibility before touching any state.
 *  - Item stats never originate from the client.
 */

import type { PlayerInventory, InventoryItem, EquipmentSlotKey } from '../types/index.js';
import { getStarterItems, createItem, getItemSlot } from './ItemDatabase.js';

export class InventoryManager {
  /** socketId / playerId → PlayerInventory */
  private inventories: Map<string, PlayerInventory> = new Map();

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Create a fresh inventory pre-loaded with starter items.
   * Called automatically when a player joins.
   */
  createInventory(playerId: string): PlayerInventory {
    const inventory: PlayerInventory = {
      playerId,
      items: getStarterItems(),
      equipment: {},
      gold: 0,
    };
    this.inventories.set(playerId, inventory);
    return inventory;
  }

  /** Remove inventory when a player disconnects. */
  deleteInventory(playerId: string): void {
    this.inventories.delete(playerId);
  }

  // -------------------------------------------------------------------------
  // Retrieval
  // -------------------------------------------------------------------------

  getInventory(playerId: string): PlayerInventory | null {
    return this.inventories.get(playerId) ?? null;
  }

  // -------------------------------------------------------------------------
  // Item bag mutations
  // -------------------------------------------------------------------------

  /**
   * Add an item to a player's bag.
   * If the item is stackable and a stack already exists, increments quantity.
   * Returns false if the player is unknown.
   */
  addItem(playerId: string, item: InventoryItem): boolean {
    const inv = this.inventories.get(playerId);
    if (!inv) return false;

    if (item.stackable) {
      const existing = inv.items.find((i) => i.itemType === item.itemType);
      if (existing) {
        existing.quantity += item.quantity;
        return true;
      }
    }

    inv.items.push({ ...item });
    return true;
  }

  /**
   * Remove an item from a player's bag by item instance UUID.
   * For stackable items, decrements by 1; removes the stack when it hits 0.
   * Returns false if the player or item is not found.
   */
  removeItem(playerId: string, itemId: string): boolean {
    const inv = this.inventories.get(playerId);
    if (!inv) return false;

    const idx = inv.items.findIndex((i) => i.id === itemId);
    if (idx === -1) return false;

    const item = inv.items[idx];
    if (item.stackable && item.quantity > 1) {
      item.quantity--;
    } else {
      inv.items.splice(idx, 1);
    }
    return true;
  }

  // -------------------------------------------------------------------------
  // Equipment
  // -------------------------------------------------------------------------

  /**
   * Move an item from the player's bag into an equipment slot.
   *
   * Validation:
   *  1. Player and item must exist in server state.
   *  2. The requested slot must match the item's defined slot in ItemDatabase.
   *  3. If the slot is already occupied, the equipped item is unequipped first
   *     (returned to the bag).
   */
  equipItem(playerId: string, itemId: string, slot: EquipmentSlotKey): boolean {
    const inv = this.inventories.get(playerId);
    if (!inv) return false;

    const itemIdx = inv.items.findIndex((i) => i.id === itemId);
    if (itemIdx === -1) return false;

    const item = inv.items[itemIdx];

    // Verify the item is allowed in the requested slot
    const allowedSlot = getItemSlot(item.itemType);
    if (allowedSlot !== slot) return false;

    // Unequip current occupant back to bag
    if (inv.equipment[slot]) {
      inv.items.push(inv.equipment[slot]!);
    }

    // Move from bag to slot
    inv.equipment[slot] = item;
    inv.items.splice(itemIdx, 1);
    return true;
  }

  /**
   * Move the item in an equipment slot back into the player's bag.
   * Returns false if the player is unknown or the slot is already empty.
   */
  unequipItem(playerId: string, slot: EquipmentSlotKey): boolean {
    const inv = this.inventories.get(playerId);
    if (!inv) return false;

    const item = inv.equipment[slot];
    if (!item) return false;

    inv.items.push(item);
    delete inv.equipment[slot];
    return true;
  }

  // -------------------------------------------------------------------------
  // Special items
  // -------------------------------------------------------------------------

  /**
   * Award a Shard of Knowledge to the player (e.g. after a perfect lesson).
   * Stacks with any existing shard stack.
   */
  addShard(playerId: string): void {
    const inv = this.inventories.get(playerId);
    if (!inv) return;

    const shard = createItem('shard_of_knowledge');
    if (!shard) return;

    const existing = inv.items.find((i) => i.itemType === 'shard_of_knowledge');
    if (existing) {
      existing.quantity++;
    } else {
      inv.items.push(shard);
    }
  }
}
