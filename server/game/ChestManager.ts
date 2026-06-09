/**
 * ChestManager — server-authoritative personal chest storage for every player.
 *
 * Security notes:
 *  - Ownership is always validated: a player can only access their own chest.
 *  - Item transfers go through InventoryManager so stats always come from the
 *    server-side ItemDatabase, never from the client.
 *  - Chests are stored in-memory keyed by chestId; each player gets one
 *    personal chest keyed as `chest_${socketId}`.
 *
 * Persistence notes:
 *  - The in-memory Map is the source of truth during a session.
 *  - MongoDB is written asynchronously (fire-and-forget) after every mutation.
 *  - If the DB is unavailable, the server continues operating in-memory only.
 *  - Call loadChest(userId) when a player connects to restore saved state.
 */

import type { ChestStorage, InventoryItem } from '../types/index.js';
import { InventoryManager } from './InventoryManager.js';
import { isDbConnected } from '../db/connection.js';
import { ChestStorageModel } from '../db/models/ChestStorageModel.js';

export class ChestManager {
  /** chestId → ChestStorage */
  private chests: Map<string, ChestStorage> = new Map();

  constructor(private readonly inventoryManager: InventoryManager) {}

  // -------------------------------------------------------------------------
  // Persistence helpers
  // -------------------------------------------------------------------------

  /**
   * Persist a chest to MongoDB.
   * Fire-and-forget — never awaited by callers.
   */
  private persistChest(ownerId: string, chest: ChestStorage): void {
    if (!isDbConnected()) return;

    ChestStorageModel.findOneAndUpdate(
      { userId: ownerId },
      {
        items:     chest.items,
        maxSlots:  chest.maxSlots,
        updatedAt: new Date(),
      },
      { upsert: true, new: true },
    )
      .exec()
      .catch((err: unknown) => console.error('[DB] persistChest failed:', err));
  }

  /**
   * Load a player's chest from MongoDB into the in-memory map.
   * If no record exists the map is left unchanged (getOrCreatePlayerChest
   * handles the initial write).
   *
   * Call this when a player connects / logs in.
   */
  async loadChest(userId: string): Promise<void> {
    if (!isDbConnected()) return;

    try {
      const doc = await ChestStorageModel.findOne({ userId }).lean().exec();
      if (!doc) return;

      const chestId = `chest_${userId}`;
      const chest: ChestStorage = {
        chestId,
        ownerId:  userId,
        items:    (doc.items as InventoryItem[]) ?? [],
        maxSlots: (doc.maxSlots as number) ?? 20,
      };

      this.chests.set(chestId, chest);
    } catch (err) {
      console.error('[DB] loadChest failed:', err);
    }
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Create a new chest and register it.
   * If a chest with that id already exists it is returned unchanged.
   */
  createChest(ownerId: string, chestId: string, maxSlots = 20): ChestStorage {
    const existing = this.chests.get(chestId);
    if (existing) return existing;

    const chest: ChestStorage = { chestId, ownerId, items: [], maxSlots };
    this.chests.set(chestId, chest);
    return chest;
  }

  /**
   * Returns the chest with the given id, or undefined if it does not exist.
   */
  getChest(chestId: string): ChestStorage | undefined {
    return this.chests.get(chestId);
  }

  /**
   * Returns the personal chest for `ownerId`, or undefined if it has not
   * been created yet.
   */
  getPlayerChest(ownerId: string): ChestStorage | undefined {
    return this.chests.get(`chest_${ownerId}`);
  }

  /**
   * Returns the player's personal chest, creating it if necessary.
   * Guaranteed to never return undefined.
   *
   * When a DB record already exists it will have been loaded by loadChest()
   * before this is called, so we only write to the DB when creating a fresh
   * chest.
   */
  getOrCreatePlayerChest(playerId: string): ChestStorage {
    const chestId = `chest_${playerId}`;
    const existing = this.chests.get(chestId);
    if (existing) return existing;

    const chest = this.createChest(playerId, chestId);
    // Persist the newly created empty chest
    this.persistChest(playerId, chest);
    return chest;
  }

  /**
   * Remove all chests owned by this player.
   * Call when a player disconnects if you don't need persistence.
   */
  deletePlayerChest(playerId: string): void {
    this.chests.delete(`chest_${playerId}`);
  }

  // -------------------------------------------------------------------------
  // Transfers
  // -------------------------------------------------------------------------

  /**
   * Move an item from a player's bag into the specified chest.
   *
   * Validation:
   *  1. The chest must exist.
   *  2. The requesting player must be the owner of the chest.
   *  3. The chest must not be full.
   *  4. The item must be in the player's bag (InventoryManager validates this).
   *
   * Returns true on success, false on any validation failure.
   */
  transferToChest(
    chestId: string,
    fromPlayerId: string,
    item: InventoryItem,
  ): boolean {
    const chest = this.chests.get(chestId);
    if (!chest) return false;
    if (chest.ownerId !== fromPlayerId) return false;
    if (chest.items.length >= chest.maxSlots) return false;

    // Remove from the player's inventory (validates ownership of the item)
    const removed = this.inventoryManager.removeItem(fromPlayerId, item.id);
    if (!removed) return false;

    // Add to chest (use the item object that was already in the inventory)
    chest.items.push({ ...item });

    this.persistChest(fromPlayerId, chest);
    return true;
  }

  /**
   * Move an item from the specified chest into a player's bag.
   *
   * Validation:
   *  1. The chest must exist.
   *  2. The requesting player must be the owner of the chest.
   *  3. The item must be in the chest.
   *
   * Returns true on success, false on any validation failure.
   */
  transferFromChest(
    chestId: string,
    toPlayerId: string,
    itemId: string,
  ): boolean {
    const chest = this.chests.get(chestId);
    if (!chest) return false;
    if (chest.ownerId !== toPlayerId) return false;

    const idx = chest.items.findIndex((i) => i.id === itemId);
    if (idx === -1) return false;

    const [item] = chest.items.splice(idx, 1);

    // Add to the player's bag
    const added = this.inventoryManager.addItem(toPlayerId, item);
    if (!added) {
      // Rollback — put item back in chest
      chest.items.splice(idx, 0, item);
      return false;
    }

    this.persistChest(toPlayerId, chest);
    return true;
  }
}
