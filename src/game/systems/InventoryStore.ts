/**
 * InventoryStore — lightweight client-side snapshot of the player's inventory.
 *
 * Security contract:
 *  - This store is READ-ONLY from the game's perspective.
 *  - Its contents are only ever updated when the server pushes `inventory:data`
 *    or `inventory:updated`.  Nothing here mutates data directly.
 *  - Never send item stats back to the server; always request mutations via
 *    the appropriate socket events (equipment:equip, equipment:unequip,
 *    chest:transfer, etc.) and wait for the server to push the result.
 */

// ---------------------------------------------------------------------------
// Minimal socket interface — avoids a socket.io-client peer dependency
// ---------------------------------------------------------------------------

/** Minimal interface for the socket object passed to InventoryStore.init(). */
export interface MinimalSocket {
  on(event: string, handler: (data: unknown) => void): void;
  emit(event: string, ...args: unknown[]): void;
}

// ---------------------------------------------------------------------------
// Minimal client-side types (mirrors server/types/index.ts without server deps)
// ---------------------------------------------------------------------------

export interface ClientItemStats {
  attack?: number;
  defense?: number;
  hp?: number;
  xp?: number;
}

export type ClientItemRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface ClientInventoryItem {
  id: string;
  itemType: string;
  name: string;
  description: string;
  rarity: ClientItemRarity;
  stats: ClientItemStats;
  quantity: number;
  stackable: boolean;
  icon: string;
}

export interface ClientEquipmentSlots {
  mainHand?: ClientInventoryItem;
  offHand?: ClientInventoryItem;
  helm?: ClientInventoryItem;
  earring?: ClientInventoryItem;
  ring1?: ClientInventoryItem;
  ring2?: ClientInventoryItem;
  belt?: ClientInventoryItem;
  shoes?: ClientInventoryItem;
  gloves?: ClientInventoryItem;
  necklace?: ClientInventoryItem;
}

export interface ClientPlayerInventory {
  playerId: string;
  items: ClientInventoryItem[];
  equipment: ClientEquipmentSlots;
  gold: number;
}

// ---------------------------------------------------------------------------
// Store singleton
// ---------------------------------------------------------------------------

type UpdateCallback = (inventory: ClientPlayerInventory) => void;

class InventoryStoreClass {
  private snapshot: ClientPlayerInventory | null = null;
  private listeners: UpdateCallback[] = [];
  private socket: MinimalSocket | null = null;

  /**
   * Bind the store to a socket. Safe to call again with a NEW socket (e.g.
   * after a reconnect or a React effect re-run) — update listeners registered
   * via onUpdate() are kept; only the socket subscription is rebound. The old
   * socket's handlers die with its disconnection.
   */
  init(socket: MinimalSocket): void {
    if (this.socket === socket) return;
    this.socket = socket;

    const handleUpdate = (data: unknown) => {
      // Trust the server — cast to our client type
      this.snapshot = data as ClientPlayerInventory;
      this.listeners.forEach((cb) => cb(this.snapshot!));
    };

    socket.on('inventory:data', handleUpdate);
    socket.on('inventory:updated', handleUpdate);

    // Request the initial snapshot from the server
    socket.emit('inventory:get');
  }

  /** Returns the latest server-provided inventory snapshot, or null if not yet received. */
  get(): ClientPlayerInventory | null {
    return this.snapshot;
  }

  /**
   * Register a callback that fires whenever the server pushes an inventory update.
   * Returns an unsubscribe function.
   */
  onUpdate(cb: UpdateCallback): () => void {
    this.listeners.push(cb);
    // Fire immediately if we already have a snapshot
    if (this.snapshot) cb(this.snapshot);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  /** Reset state — call if the player disconnects and reconnects. */
  reset(): void {
    this.snapshot = null;
    this.socket = null;
    this.listeners = [];
  }
}

export const InventoryStore = new InventoryStoreClass();
