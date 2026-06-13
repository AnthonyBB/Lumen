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

import type {
  PlayerInventory, InventorySnapshot, InventoryItem, EquipmentSlotKey, EquipmentSlots,
} from '../types/index.js';
import { getStarterItems, getGeneratedStarterItems } from './ItemDatabase.js';
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
        items:                inv.items,
        equipmentByCharacter: inv.equipmentByCharacter,
        // Keep any not-yet-migrated flat equipment so a logout before first
        // access doesn't lose gear.
        equipment:            inv.legacyEquipment ?? {},
        gold:                 inv.gold,
        updatedAt:            new Date(),
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
    // Record the stable username FIRST — before any early return — so that
    // persistInventory() writes under the username even for a brand-new player
    // whose document doesn't exist yet (and for the createInventory() that
    // follows). Without this, a new player's inventory (and any shards earned)
    // would persist under the ephemeral socket id and be lost on reconnect.
    if (socketId) this.socketToUser.set(socketId, userId);

    if (!isDbConnected()) return;

    try {
      const doc = await PlayerInventoryModel.findOne({ userId }).lean().exec();
      if (!doc) return;

      const storeKey = socketId ?? userId;

      // Legacy purge: items from the old fixed catalog (itemType `eq_NNNN`) no
      // longer have a stats source now that gear is rolled at craft time, so we
      // drop them from the bag and any equipped slots on load.
      const isLegacyGear = (it?: InventoryItem | null): boolean =>
        !!it && it.itemType.startsWith('eq_');

      const items = ((doc.items as InventoryItem[]) ?? []).filter((it) => !isLegacyGear(it));

      /** Drop legacy `eq_` gear out of a slot map. */
      const cleanSlots = (raw: Record<string, unknown> | undefined): EquipmentSlots => {
        const out: EquipmentSlots = {};
        for (const [slot, it] of Object.entries(raw ?? {})) {
          if (!isLegacyGear(it as InventoryItem)) {
            (out as Record<string, InventoryItem | undefined>)[slot] = it as InventoryItem;
          }
        }
        return out;
      };

      // Per-character equipment if the save already has it; otherwise stash the
      // old flat equipment as `legacyEquipment` to migrate on first access.
      const storedByChar = (doc as { equipmentByCharacter?: Record<string, Record<string, unknown>> })
        .equipmentByCharacter;
      const equipmentByCharacter: Record<string, EquipmentSlots> = {};
      let legacyEquipment: EquipmentSlots | undefined;
      if (storedByChar && Object.keys(storedByChar).length > 0) {
        for (const [charId, slots] of Object.entries(storedByChar)) {
          equipmentByCharacter[charId] = cleanSlots(slots);
        }
      } else {
        const flat = cleanSlots(doc.equipment as Record<string, unknown> | undefined);
        if (Object.keys(flat).length > 0) legacyEquipment = flat;
      }

      const inventory: PlayerInventory = {
        playerId:  storeKey,
        items,
        equipmentByCharacter,
        legacyEquipment,
        gold:      (doc.gold as number) ?? 0,
      };

      this.inventories.set(storeKey, inventory);
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
      // Legacy starter weapons/armor PLUS ~3 generated attribute-bearing pieces
      // so the new attribute-bonus system is demonstrable on first join.  This
      // is the first-join-only path, so the generated grant never duplicates.
      items:     [...getStarterItems(), ...getGeneratedStarterItems()],
      equipmentByCharacter: {},
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

  /**
   * The equipped slots for a specific character. The first access for a player
   * MIGRATES any pre-roster flat equipment into this character's slots (the
   * active character on join), then clears the legacy field. Returns a live,
   * mutable reference owned by the inventory.
   */
  equipmentFor(playerId: string, characterId: string): EquipmentSlots {
    const inv = this.inventories.get(playerId);
    if (!inv || !characterId) return {};
    let slots = inv.equipmentByCharacter[characterId];
    if (!slots) {
      // Migrate legacy flat equipment onto the first character that asks for it.
      slots = inv.legacyEquipment ?? {};
      inv.equipmentByCharacter[characterId] = slots;
      if (inv.legacyEquipment) {
        inv.legacyEquipment = undefined;
        this.persistInventory(playerId);
      }
    }
    return slots;
  }

  /**
   * The client-facing snapshot for one character: the shared bag + that
   * character's equipped gear. This is what `inventory:data` / `inventory:updated`
   * carry (the client only ever sees the active character's equipment).
   */
  getSnapshot(playerId: string, characterId: string): InventorySnapshot | null {
    const inv = this.inventories.get(playerId);
    if (!inv) return null;
    return {
      playerId: inv.playerId,
      items: inv.items,
      equipment: this.equipmentFor(playerId, characterId),
      gold: inv.gold,
    };
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

  /**
   * Permanently delete an item from a player's bag (the WHOLE stack), e.g. when
   * the player chooses to discard it. Returns false if not found.
   */
  deleteItem(playerId: string, itemId: string): boolean {
    const inv = this.inventories.get(playerId);
    if (!inv) return false;
    const idx = inv.items.findIndex((i) => i.id === itemId);
    if (idx === -1) return false;
    inv.items.splice(idx, 1);
    this.persistInventory(playerId);
    return true;
  }

  /**
   * Find an owned item by instance id, searching the bag AND equipped slots.
   * Returns the live item reference (or null) — used by the upgrade flow to
   * read/mutate an item in place. Server-side only.
   */
  findItem(playerId: string, itemId: string): InventoryItem | null {
    const inv = this.inventories.get(playerId);
    if (!inv) return null;
    const bagItem = inv.items.find((i) => i.id === itemId);
    if (bagItem) return bagItem;
    // Item ids are globally unique, so search every character's slots (and any
    // not-yet-migrated legacy equipment).
    const slotMaps = [...Object.values(inv.equipmentByCharacter)];
    if (inv.legacyEquipment) slotMaps.push(inv.legacyEquipment);
    for (const slots of slotMaps) {
      for (const slot of Object.keys(slots) as EquipmentSlotKey[]) {
        const it = slots[slot];
        if (it && it.id === itemId) return it;
      }
    }
    return null;
  }

  /**
   * Set the craft rank on an owned item (the rank-upgrade flow). Searches the
   * bag and equipped slots, mutates in place, persists, and returns true on
   * success. Server-authoritative — the client never sets craftRank.
   */
  setItemCraftRank(playerId: string, itemId: string, craftRank: string): boolean {
    const item = this.findItem(playerId, itemId);
    if (!item) return false;
    item.craftRank = craftRank;
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
  equipGeneratedItem(
    playerId: string,
    characterId: string,
    itemId: string,
    slot: EquipmentSlotKey,
  ): boolean {
    const inv = this.inventories.get(playerId);
    if (!inv || !characterId) return false;

    const itemIdx = inv.items.findIndex((i) => i.id === itemId);
    if (itemIdx === -1) return false;

    const item = inv.items[itemIdx];
    const equipment = this.equipmentFor(playerId, characterId);

    // Unequip current occupant back to the shared bag.
    if (equipment[slot]) {
      inv.items.push(equipment[slot]!);
    }

    equipment[slot] = item;
    inv.items.splice(itemIdx, 1);

    this.persistInventory(playerId);
    return true;
  }

  /**
   * Unequip the item in `slot` back into the player's bag.
   * Returns false if the player is unknown or the slot is already empty.
   * The caller (the `equipment:unequip` socket handler) validates that `slot`
   * is a known EquipmentSlotKey before calling.
   */
  unequipItem(playerId: string, characterId: string, slot: EquipmentSlotKey): boolean {
    const inv = this.inventories.get(playerId);
    if (!inv || !characterId) return false;

    const equipment = this.equipmentFor(playerId, characterId);
    const item = equipment[slot];
    if (!item) return false;

    inv.items.push(item);
    delete equipment[slot];

    this.persistInventory(playerId);
    return true;
  }

  // -------------------------------------------------------------------------
  // Legacy shard migration
  // -------------------------------------------------------------------------

  /**
   * One-time migration: shards used to live as bag items. Remove any
   * skill_shard / combat_shard / shard_of_knowledge stacks from the bag and
   * return their totals so the caller can fold them into the player's tracked
   * shard balances (PlayerManager). shard_of_knowledge counts as skill shards
   * (its older meaning). Persists the cleaned inventory.
   */
  drainShardItems(playerId: string): { skill: number; combat: number } {
    const inv = this.inventories.get(playerId);
    if (!inv) return { skill: 0, combat: 0 };

    const sum = (type: string) =>
      inv.items.filter((i) => i.itemType === type).reduce((s, i) => s + Math.max(1, i.quantity), 0);

    const skill = sum('skill_shard') + sum('shard_of_knowledge');
    const combat = sum('combat_shard');

    if (skill > 0 || combat > 0) {
      inv.items = inv.items.filter(
        (i) => i.itemType !== 'skill_shard' && i.itemType !== 'combat_shard' && i.itemType !== 'shard_of_knowledge',
      );
      this.persistInventory(playerId);
    }
    return { skill, combat };
  }
}
