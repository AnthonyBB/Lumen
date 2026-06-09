/**
 * InventoryManager — server-authoritative inventory for every connected player.
 *
 * Security notes:
 *  - All mutations are initiated server-side or validated here before applying.
 *  - The client only sends itemId + slot; the server confirms ownership and
 *    slot compatibility before touching any state.
 *  - Item stats never originate from the client.
 *
 * Persistence notes:
 *  - The in-memory Map is the source of truth during a session.
 *  - MongoDB is written asynchronously (fire-and-forget) after every mutation.
 *  - If the DB is unavailable, the server continues operating in-memory only.
 *  - Call loadInventory(userId) when a player connects to restore saved state.
 */

import type { PlayerInventory, InventoryItem, EquipmentSlotKey } from '../types/index.js';
import { getStarterItems, createItem, getItemSlot } from './ItemDatabase.js';
import { isDbConnected } from '../db/connection.js';
import { PlayerInventoryModel } from '../db/models/PlayerInventoryModel.js';

export class InventoryManager {
  /** socketId / playerId → PlayerInventory */
  private inventories: Map<string, PlayerInventory> = new Map();

  // -------------------------------------------------------------------------
  // Persistence helpers
  // -------------------------------------------------------------------------

  /**
   * Persist the in-memory inventory for `playerId` to MongoDB.
   * Fire-and-forget — never awaited by callers.
   */
  private persistInventory(playerId: string): void {
    if (!isDbConnected()) return;

    const inv = this.inventories.get(playerId);
    if (!inv) return;

    PlayerInventoryModel.findOneAndUpdate(
      { userId: playerId },
      {
        items:     inv.items,
        equipment: inv.equipment,
        gold:      inv.gold,
        updatedAt: new Date(),
      },
      { upsert: true, new: true },
    )
      .exec()
      .catch((err: unknown) => console.error('[DB] persistInventory failed:', err));
  }

  /**
   * Load a player's inventory from MongoDB into the in-memory map.
   * If no record exists the map is left unchanged (createInventory handles
   * the initial write).
   *
   * Call this when a player connects / logs in.
   */
  async loadInventory(userId: string): Promise<void> {
    if (!isDbConnected()) return;

    try {
      const doc = await PlayerInventoryModel.findOne({ userId }).lean().exec();
      if (!doc) return;

      const inventory: PlayerInventory = {
        playerId:  userId,
        items:     (doc.items as InventoryItem[]) ?? [],
        equipment: (doc.equipment as PlayerInventory['equipment']) ?? {},
        gold:      (doc.gold as number) ?? 0,
      };

      this.inventories.set(userId, inventory);
    } catch (err) {
      console.error('[DB] loadInventory failed:', err);
    }
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Return an existing inventory (loaded from DB or created this session), or
   * create a fresh one pre-loaded with starter items.
   *
   * When a DB record already exists it will have been loaded by loadInventory()
   * before this is called, so we only create a brand-new inventory when one is
   * truly absent.
   */
  createInventory(playerId: string): PlayerInventory {
    const existing = this.inventories.get(playerId);
    if (existing) return existing;

    const inventory: PlayerInventory = {
      playerId,
      items:     getStarterItems(),
      equipment: {},
      gold:      0,
    };
    this.inventories.set(playerId, inventory);

    // Persist to DB only if there is no existing record (upsert is idempotent)
    this.persistInventory(playerId);

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
        this.persistInventory(playerId);
        return true;
      }
    }

    inv.items.push({ ...item });
    this.persistInventory(playerId);
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

    this.persistInventory(playerId);
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

    this.persistInventory(playerId);
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

    this.persistInventory(playerId);
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

    this.persistInventory(playerId);
  }
}
