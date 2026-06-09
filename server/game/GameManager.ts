/**
 * GameManager — coordinates zones/rooms and delegates to specialist managers.
 *
 * The server is authoritative: this class never accepts HP, XP, or level
 * values from the client.  All mutations go through PlayerManager and
 * CombatManager which enforce game rules.
 */

import type { Zone, PublicPlayer } from '../types/index.js';
import { PlayerManager } from './PlayerManager.js';
import { QuestionEngine } from './QuestionEngine.js';
import { CombatManager } from './CombatManager.js';
import { InventoryManager } from './InventoryManager.js';

/** Known zones in the game world. */
const STARTING_ZONES: string[] = ['town', 'forest', 'dungeon', 'academy'];

export class GameManager {
  public readonly playerManager: PlayerManager;
  public readonly questionEngine: QuestionEngine;
  public readonly combatManager: CombatManager;
  public readonly inventoryManager: InventoryManager;

  /** zoneId → Zone */
  private zones: Map<string, Zone> = new Map();

  constructor() {
    this.playerManager = new PlayerManager();
    this.questionEngine = new QuestionEngine();
    this.combatManager = new CombatManager(this.questionEngine, this.playerManager);
    this.inventoryManager = new InventoryManager();

    // Initialise all known zones
    for (const id of STARTING_ZONES) {
      this.zones.set(id, { id, players: new Set() });
    }
  }

  // -------------------------------------------------------------------------
  // Player join / leave
  // -------------------------------------------------------------------------

  /**
   * Register a new player and place them in the default zone.
   * Returns the created public player and the list of others in the same zone,
   * or an error string if the join was rejected.
   */
  playerJoin(
    socketId: string,
    username: string,
  ): { player: PublicPlayer; zonePlayers: PublicPlayer[] } | { error: string } {
    const result = this.playerManager.addPlayer(socketId, username);
    if (result.error) return { error: result.error };

    const player = result.player!;
    this.addToZone(socketId, player.zone);

    // Create a server-authoritative inventory pre-loaded with starter items
    this.inventoryManager.createInventory(socketId);

    // Build zone player list (excluding the new joiner)
    const zonePlayers = this.getZonePlayers(player.zone).filter(
      (p) => p.id !== socketId,
    );

    return {
      player: this.playerManager.toPublic(player),
      zonePlayers,
    };
  }

  /**
   * Remove a disconnecting player from all data structures.
   * Returns the zone they were in so the server can notify remaining players.
   */
  playerLeave(socketId: string): { zone: string } | null {
    const player = this.playerManager.getPlayer(socketId);
    if (!player) return null;

    const zone = player.zone;
    this.removeFromZone(socketId, zone);
    this.playerManager.removePlayer(socketId);

    // Clean up any active combat sessions
    this.combatManager.endSessionsForPlayer(socketId);

    // Release inventory memory
    this.inventoryManager.deleteInventory(socketId);

    return { zone };
  }

  // -------------------------------------------------------------------------
  // Movement
  // -------------------------------------------------------------------------

  /**
   * Update a player's position.  Zone transitions are handled here.
   * Returns false if the player is unknown.
   */
  movePlayer(
    socketId: string,
    x: number,
    y: number,
    newZone: string,
  ): { oldZone: string; newZone: string } | null {
    const player = this.playerManager.getPlayer(socketId);
    if (!player) return null;

    const oldZone = player.zone;

    // Only do zone-list bookkeeping if the zone actually changed
    if (oldZone !== newZone && this.zones.has(newZone)) {
      this.removeFromZone(socketId, oldZone);
      this.addToZone(socketId, newZone);
    }

    this.playerManager.updatePosition(socketId, x, y, newZone);
    return { oldZone, newZone };
  }

  // -------------------------------------------------------------------------
  // Zone helpers
  // -------------------------------------------------------------------------

  getZonePlayers(zoneId: string): PublicPlayer[] {
    const zone = this.zones.get(zoneId);
    if (!zone) return [];

    return Array.from(zone.players)
      .map((id) => this.playerManager.getPlayer(id))
      .filter(Boolean)
      .map((p) => this.playerManager.toPublic(p!));
  }

  private addToZone(socketId: string, zoneId: string): void {
    if (!this.zones.has(zoneId)) {
      // Dynamically create unknown zones (future-proofing)
      this.zones.set(zoneId, { id: zoneId, players: new Set() });
    }
    this.zones.get(zoneId)!.players.add(socketId);
  }

  private removeFromZone(socketId: string, zoneId: string): void {
    this.zones.get(zoneId)?.players.delete(socketId);
  }
}
