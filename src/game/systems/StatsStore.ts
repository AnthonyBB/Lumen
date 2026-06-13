/**
 * StatsStore — lightweight client-side snapshot of the player's character
 * stats (attributes + derived combat stats), mirroring InventoryStore.
 *
 * Security contract:
 *  - READ-ONLY from the game's perspective.  Its contents only ever update
 *    when the server pushes `stats:update`.  Nothing here computes stats.
 *  - To change stats, request a mutation (`character:allocate`,
 *    `equipment:equip`, ...) and wait for the server to push the new snapshot.
 */

// ---------------------------------------------------------------------------
// Minimal socket interface — avoids a socket.io-client peer dependency
// ---------------------------------------------------------------------------

export interface MinimalSocket {
  on(event: string, handler: (data: unknown) => void): void;
  off?(event: string, handler: (data: unknown) => void): void;
  emit(event: string, ...args: unknown[]): void;
}

// ---------------------------------------------------------------------------
// Client-side stat types (mirror server/types StatRow / StatsUpdatePayload)
// ---------------------------------------------------------------------------

export interface ClientStatRow {
  key: string;
  label: string;
  base: number;
  gear: number;
  total: number;
  isPercent?: boolean;
}

export interface ClientStats {
  attributes: ClientStatRow[];
  derived: ClientStatRow[];
  unspentPoints: number;
  level: number;
  /** Total accumulated XP for the active character. */
  xp: number;
  /** XP earned INTO the current level (0 .. xpForNextLevel). */
  xpIntoLevel: number;
  /** XP span of the current level (current→next threshold). 0 at LEVEL_CAP. */
  xpForNextLevel: number;
}

// ---------------------------------------------------------------------------
// Store singleton
// ---------------------------------------------------------------------------

type UpdateCallback = (stats: ClientStats) => void;

class StatsStoreClass {
  private snapshot: ClientStats | null = null;
  private listeners: UpdateCallback[] = [];
  private socket: MinimalSocket | null = null;

  /**
   * Bind the store to a socket. Safe to call again with a NEW socket (e.g.
   * after a reconnect). Update listeners are kept; only the socket subscription
   * is rebound.
   */
  init(socket: MinimalSocket): void {
    if (this.socket === socket) return;
    this.socket = socket;

    socket.on('stats:update', (data: unknown) => {
      this.snapshot = data as ClientStats;
      this.listeners.forEach((cb) => cb(this.snapshot!));
    });

    // Request the initial snapshot from the server.
    socket.emit('stats:get');
  }

  /** Latest server-provided stats snapshot, or null if not yet received. */
  get(): ClientStats | null {
    return this.snapshot;
  }

  /**
   * Register a callback that fires whenever the server pushes a stats update.
   * Fires immediately if a snapshot already exists.  Returns an unsubscribe fn.
   */
  onUpdate(cb: UpdateCallback): () => void {
    this.listeners.push(cb);
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

export const StatsStore = new StatsStoreClass();
