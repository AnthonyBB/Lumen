/**
 * InventoryManager — server-authoritative inventory for every connected player.
 *
 * Security notes:
 *  - All mutations are initiated server-side or validated here before applying.
 *  - The client only sends an item instance id; the server confirms ownership
 *    (and the handler derives the slot from the server catalog) before
 *    touching any state.
 *  - Item stats never originate from the client.
 *
 * Persistence notes:
 *  - The in-memory Map is the source of truth during a session.
 *  - MongoDB is written asynchronously (fire-and-forget) after every mutation.
 *  - If the DB is unavailable, the server continues operating in-memory only.
 *  - Call loadInventory(userId) when a player connects to restore saved state.
 */

import type { PlayerInventory, InventoryItem, EquipmentSlotKey } from '../types/index.js';
import { getStarterItems, createItem } from './ItemDatabase.js';
import { isDbConnected } from '../db/connection.js';
import { PlayerInventoryModel } from '../db/models/PlayerInventoryModel.js';

export class InventoryManager {
  /** socketId / playerId → PlayerInventory */
  private inventories: Map<string, PlayerInventory> = new Map();

  /**
   * Maps socketId → username so persistInventory() can always write to the
   * correct MongoDB document (keyed by username, not ephemeral socket IDs).
   */
  private socketToUser: Map<string, string> = new Map();

  // -------------------------------------------------------------------------
  // Persistence helpers
  // -------------------------------------------------------------------------

  /**
   * Persist the in-memory inventory for `playerId` to MongoDB.
   * Fire-and-forget — never awaited by callers.
   *
   * Always writes using the stable username (not the ephemeral socket ID) so
   * the record survives disconnects and reconnects.
   */
  private persistInventory(playerId: string): void {
    if (!isDbConnected()) return;

    const inv = this.inventories.get(playerId);
    if (!inv) return;

    // Resolve the stable username; fall back to playerId if not mapped (e.g.
    // tests or legacy callers that pass a username directly).
    const dbUserId = this.socketToUser.get(playerId) ?? playerId;

    PlayerInventoryModel.findOneAndUpdate(
      { userId: dbUserId },
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
   * @param userId   The stable username used as the MongoDB document key.
   * @param socketId When provided, the loaded inventory is stored under this
   *                 key (the socket ID) so all subsequent in-memory lookups by
   *                 socket ID work correctly.  The userId→socketId mapping is
   *                 also recorded so persistInventory() can always write to the
   *                 correct document.
   *
   * Call this when a player connects / logs in.
   */
  async loadInventory(userId: string, socketId?: string): Promise<void> {
    if (!isDbConnected()) return;

    try {
      const doc = await PlayerInventoryModel.findOne({ userId }).lean().exec();
      if (!doc) return;

      const storeKey = socketId ?? userId;

      const inventory: PlayerInventory = {
        playerId:  storeKey,
        items:     (doc.items as InventoryItem[]) ?? [],
        equipment: (doc.equipment as PlayerInventory['equipment']) ?? {},
        gold:      (doc.gold as number) ?? 0,
      };

      this.inventories.set(storeKey, inventory);

      // Record the stable username so persistence always uses the right key
      if (socketId) this.socketToUser.set(socketId, userId);

      // ── Migration: legacy Shards of Knowledge → Skill Shards ──────────────
      // Converts any old shard_of_knowledge stack(s) into an equivalent
      // skill_shard stack (same total quantity), then persists the result.
      const legacyStacks = inventory.items.filter((i) => i.itemType === 'shard_of_knowledge');
      if (legacyStacks.length > 0) {
        const legacyQty = legacyStacks.reduce((sum, i) => sum + Math.max(1, i.quantity), 0);
        inventory.items = inventory.items.filter((i) => i.itemType !== 'shard_of_knowledge');

        const existing = inventory.items.find((i) => i.itemType === 'skill_shard');
        if (existing) {
          existing.quantity += legacyQty;
        } else {
          const migrated = createItem('skill_shard', legacyQty);
          if (migrated) inventory.items.push(migrated);
        }

        this.persistInventory(storeKey);
        console.log(`[inventory] Migrated ${legacyQty} Shard(s) of Knowledge → Skill Shards for ${userId}`);
      }
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
    this.socketToUser.delete(playerId);
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
   * Equip a *generated* equipment item (see server/game/data/equipmentGen.ts)
   * whose slot and XP requirement have ALREADY been validated by the caller
   * (the `equipment:equip` socket handler) against EQUIPMENT_MAP.
   *
   * This does not consult ItemDatabase — generated items are catalogued in
   * equipmentGen, not ItemDatabase.  Ownership is still verified here: the
   * item instance must exist in the player's bag.
   */
  equipGeneratedItem(playerId: string, itemId: string, slot: EquipmentSlotKey): boolean {
    const inv = this.inventories.get(playerId);
    if (!inv) return false;

    const itemIdx = inv.items.findIndex((i) => i.id === itemId);
    if (itemIdx === -1) return false;

    const item = inv.items[itemIdx];

    // Unequip current occupant back to bag
    if (inv.equipment[slot]) {
      inv.items.push(inv.equipment[slot]!);
    }

    inv.equipment[slot] = item;
    inv.items.splice(itemIdx, 1);

    this.persistInventory(playerId);
    return true;
  }

  // -------------------------------------------------------------------------
  // Special items
  // -------------------------------------------------------------------------

  /**
   * Award shard currency to the player.  Server-side callers only — shard
   * amounts are NEVER accepted from the client.
   * Stacks with any existing stack of the same type.
   */
  addCurrency(playerId: string, itemType: 'skill_shard' | 'combat_shard', amount = 1): void {
    if (amount <= 0) return;
    const inv = this.inventories.get(playerId);
    if (!inv) return;

    const existing = inv.items.find((i) => i.itemType === itemType);
    if (existing) {
      existing.quantity += amount;
    } else {
      const shard = createItem(itemType, amount);
      if (!shard) return;
      inv.items.push(shard);
    }

    this.persistInventory(playerId);
  }

  /** Count how many shards of a given currency type the player owns. */
  getCurrencyCount(playerId: string, itemType: 'skill_shard' | 'combat_shard'): number {
    const inv = this.inventories.get(playerId);
    if (!inv) return 0;
    return inv.items
      .filter((i) => i.itemType === itemType)
      .reduce((sum, i) => sum + i.quantity, 0);
  }

  /**
   * Spend shard currency.  Returns false (and changes nothing) if the player
   * does not have enough.  All balance checks happen here, server-side.
   */
  spendCurrency(playerId: string, itemType: 'skill_shard' | 'combat_shard', amount: number): boolean {
    if (amount <= 0) return false;
    const inv = this.inventories.get(playerId);
    if (!inv) return false;
    if (this.getCurrencyCount(playerId, itemType) < amount) return false;

    let remaining = amount;
    for (const item of inv.items) {
      if (item.itemType !== itemType || remaining <= 0) continue;
      const take = Math.min(item.quantity, remaining);
      item.quantity -= take;
      remaining -= take;
    }
    inv.items = inv.items.filter((i) => !(i.itemType === itemType && i.quantity <= 0));

    this.persistInventory(playerId);
    return true;
  }
}
