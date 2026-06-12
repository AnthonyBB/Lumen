/**
 * RankStore — lightweight client-side snapshot of the player's CURRENT adventure
 * rank, mirroring StatsStore / InventoryStore.
 *
 * Why it exists: combat math and the crafting cost preview need the player's
 * current rank to scale numbers by M(currentRank) (see
 * docs/ADVENTURE_RANKS_DESIGN.md). The React HUD owns the rank picker, but the
 * Phaser scenes (CraftScene, BattleScene, BiomeScene) live outside React — this
 * shared singleton bridges the server-pushed rank to them.
 *
 * Security contract:
 *  - READ-ONLY from the game's perspective. It only ever updates when the server
 *    pushes `adventureRank:data`. Scaling here is DISPLAY/feel only; the server
 *    independently re-derives every persisted effect from its own rank record.
 */

export interface MinimalSocket {
  on(event: string, handler: (data: unknown) => void): void;
  emit(event: string, ...args: unknown[]): void;
}

type UpdateCallback = (rankId: string) => void;

class RankStoreClass {
  private rankId: string | null = null;
  private listeners: UpdateCallback[] = [];
  private socket: MinimalSocket | null = null;

  /**
   * Bind the store to a socket. Safe to call again with a NEW socket (e.g. after
   * a reconnect). Update listeners are kept; only the socket subscription is
   * rebound.
   */
  init(socket: MinimalSocket): void {
    if (this.socket === socket) return;
    this.socket = socket;

    socket.on('adventureRank:data', (data: unknown) => {
      const id = (data as { rankId?: string } | null)?.rankId;
      if (typeof id !== 'string') return;
      this.rankId = id;
      this.listeners.forEach((cb) => cb(id));
    });

    // Request the initial rank from the server.
    socket.emit('adventureRank:get');
  }

  /** Latest server-provided rank id, or null if not yet received. */
  get(): string | null {
    return this.rankId;
  }

  /**
   * Register a callback that fires whenever the server pushes a rank change.
   * Fires immediately if a rank is already known. Returns an unsubscribe fn.
   */
  onUpdate(cb: UpdateCallback): () => void {
    this.listeners.push(cb);
    if (this.rankId !== null) cb(this.rankId);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  /** Reset state — call if the player disconnects and reconnects. */
  reset(): void {
    this.rankId = null;
    this.socket = null;
    this.listeners = [];
  }
}

export const RankStore = new RankStoreClass();
