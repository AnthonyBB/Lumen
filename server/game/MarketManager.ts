/**
 * MarketManager — server-authoritative player market.
 *
 * Security notes:
 *  - Prices are computed here (marketPrice) from the SERVER catalog, never
 *    accepted from the client.
 *  - Listings persist in MongoDB (MarketListingModel) so they survive restarts
 *    and are visible to every player.  An in-memory cache mirrors the DB for
 *    fast reads; every mutation writes through to MongoDB.
 *  - The item snapshot stored on a listing is taken at listing time so a buyer
 *    always receives exactly what they saw.
 */

import { randomUUID } from 'crypto';
import type { InventoryItem } from '../types/index.js';
import {
  MarketListingModel,
  type IMarketListing,
  type MarketItemSnapshot,
} from '../db/models/MarketListingModel.js';
import { isDbConnected } from '../db/connection.js';

// ---------------------------------------------------------------------------
// Price formula — the single source of truth (see project spec)
// ---------------------------------------------------------------------------

const RARITY_VALUE: Record<string, number> = {
  common: 10,
  uncommon: 25,
  rare: 60,
  epic: 140,
  legendary: 320,
};

/**
 * Compute the BASE silver value of an item from the SERVER catalog.
 *  - Generated gear (EQUIPMENT_MAP):
 *      base = RARITY_VALUE[rarity] + sum(|attr.value|)*3 + floor(xpRequired/20)
 *  - Legacy gear (ItemDatabase stats):
 *      base = 10 + sum(values of stats)*5
 *
 * Selling to the system pays `base`; listing to players sets the price to 2*base.
 */
export function marketPrice(item: InventoryItem): number {
  // Crafted gear carries its rolled attributes on the instance.
  if (item.attributes && item.attributes.length) {
    const rarityValue = RARITY_VALUE[item.rarity] ?? RARITY_VALUE.common;
    const attrSum = item.attributes.reduce((s, a) => s + Math.abs(a.value), 0);
    return rarityValue + attrSum * 3 + Math.floor((item.xpRequired ?? 0) / 20);
  }
  // Non-gear (e.g. potions) — sum any numeric stat values.
  const statSum = Object.values(item.stats ?? {}).reduce(
    (s, v) => s + (typeof v === 'number' ? v : 0),
    0,
  );
  return 10 + statSum * 5;
}

// ---------------------------------------------------------------------------
// Public listing shape (what the socket layer sends to clients)
// ---------------------------------------------------------------------------

export interface MarketListing {
  listingId: string;
  itemType: string;
  itemData: MarketItemSnapshot;
  slot: string;
  sellerUsername: string;
  price: number;
  createdAt: number;
}

/** Build the snapshot stored on a listing from a bag item + server catalog. */
export function buildItemSnapshot(item: InventoryItem): MarketItemSnapshot {
  return {
    id: item.id,
    itemType: item.itemType,
    name: item.name,
    description: item.description,
    icon: item.icon,
    rarity: item.rarity,
    slot: item.equipSlot ?? legacySlotFor(item) ?? '',
    stats: { ...(item.stats ?? {}) },
    attributes: item.attributes?.map((a) => ({ type: a.type, value: a.value })),
  };
}

/**
 * Best-effort slot for a legacy item from its stats — only used for snapshot
 * display/filtering.  Legacy items lack a generated EquipSlot, so we map their
 * stat focus onto one of the 8 market tabs heuristically; if no clear match,
 * fall back to 'weapon'.  (Generated gear, the bulk of the catalog, always has
 * an exact slot.)
 */
function legacySlotFor(item: InventoryItem): string | null {
  const s = item.stats ?? {};
  if (typeof s.attack === 'number' && s.attack > 0) return 'weapon';
  if (typeof s.defense === 'number' && s.defense > 0) return 'chest';
  return 'amulet';
}

function toMarketListing(doc: IMarketListing): MarketListing {
  return {
    listingId: doc.listingId,
    itemType: doc.itemType,
    itemData: doc.itemData,
    slot: doc.slot,
    sellerUsername: doc.sellerUsername,
    price: doc.price,
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.getTime() : Date.now(),
  };
}

// ---------------------------------------------------------------------------
// MarketManager
// ---------------------------------------------------------------------------

export class MarketManager {
  /** In-memory mirror of all active listings, keyed by listingId. */
  private listings: Map<string, MarketListing> = new Map();

  /** Load every persisted listing into the in-memory cache (call at startup). */
  async load(): Promise<void> {
    if (!isDbConnected()) return;
    try {
      const docs = await MarketListingModel.find().lean<IMarketListing[]>().exec();
      this.listings.clear();
      for (const doc of docs) this.listings.set(doc.listingId, toMarketListing(doc));
      console.log(`[market] loaded ${this.listings.size} active listing(s)`);
    } catch (err) {
      console.error('[market] load failed:', err);
    }
  }

  /**
   * Create a listing for `itemSnapshot` owned by `sellerUsername` at `price`
   * silver.  Persists to MongoDB and returns the created listing.
   */
  createListing(
    sellerUsername: string,
    itemSnapshot: MarketItemSnapshot,
    price: number,
  ): MarketListing {
    const listing: MarketListing = {
      listingId: randomUUID(),
      itemType: itemSnapshot.itemType,
      itemData: itemSnapshot,
      slot: itemSnapshot.slot,
      sellerUsername,
      price,
      createdAt: Date.now(),
    };
    this.listings.set(listing.listingId, listing);

    if (isDbConnected()) {
      MarketListingModel.create({
        listingId: listing.listingId,
        itemType: listing.itemType,
        itemData: listing.itemData,
        slot: listing.slot,
        sellerUsername: listing.sellerUsername,
        price: listing.price,
        createdAt: new Date(listing.createdAt),
      }).catch((err) => console.error('[market] createListing persist failed:', err));
    }

    return listing;
  }

  /** A single listing by id (or null). */
  getListing(listingId: string): MarketListing | null {
    return this.listings.get(listingId) ?? null;
  }

  /**
   * All active listings, optionally filtered by slot and/or search.  Search is
   * parsed by the socket layer (name vs attribute filter); this method accepts a
   * predicate so the parsing stays in one place.
   */
  getListings(filter?: {
    slot?: string;
    predicate?: (l: MarketListing) => boolean;
  }): MarketListing[] {
    let out = Array.from(this.listings.values());
    if (filter?.slot) out = out.filter((l) => l.slot === filter.slot);
    if (filter?.predicate) out = out.filter(filter.predicate);
    // Newest first.
    return out.sort((a, b) => b.createdAt - a.createdAt);
  }

  /** All active listings created by `username`. */
  listingsBySeller(username: string): MarketListing[] {
    return Array.from(this.listings.values())
      .filter((l) => l.sellerUsername === username)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  /** Remove a listing from the cache and MongoDB.  Returns true if it existed. */
  removeListing(listingId: string): boolean {
    const existed = this.listings.delete(listingId);
    if (existed && isDbConnected()) {
      MarketListingModel.deleteOne({ listingId }).catch((err) =>
        console.error('[market] removeListing persist failed:', err),
      );
    }
    return existed;
  }
}
