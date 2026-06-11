/**
 * MarketListingModel — persists player-created market listings so they survive
 * server restarts and are visible to every player.
 *
 * Security notes:
 *  - The price and item snapshot are computed/validated server-side when the
 *    listing is created (see MarketManager / handlers).  Clients never set them.
 *  - itemData is a snapshot of the listed item taken at listing time, so the
 *    buyer receives exactly what they saw regardless of later catalog changes.
 */

import mongoose, { Schema, model, type Model, type Document } from 'mongoose';

/** Snapshot of the listed item, embedded in the listing document. */
export interface MarketItemSnapshot {
  id: string;
  itemType: string;
  name: string;
  description?: string;
  icon: string;
  rarity: string;
  slot: string;
  /** Legacy {attack,defense,hp,xp}-style stats (may be empty for generated gear). */
  stats?: Record<string, number>;
  /** Generated-gear attribute bonuses (absent for legacy items). */
  attributes?: { type: string; value: number }[];
}

export interface IMarketListing extends Document {
  listingId: string;
  itemType: string;
  itemData: MarketItemSnapshot;
  slot: string;
  sellerUsername: string;
  price: number;
  createdAt: Date;
}

const marketItemSnapshotSchema = new Schema<MarketItemSnapshot>(
  {
    id: { type: String, required: true },
    itemType: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    icon: { type: String, default: '' },
    rarity: { type: String, default: 'common' },
    slot: { type: String, default: '' },
    stats: { type: Schema.Types.Mixed, default: () => ({}) },
    attributes: { type: [{ type: { type: String }, value: Number }], default: undefined },
  },
  { _id: false },
);

const marketListingSchema = new Schema<IMarketListing>(
  {
    listingId: { type: String, required: true, unique: true, index: true },
    itemType: { type: String, required: true },
    itemData: { type: marketItemSnapshotSchema, required: true },
    slot: { type: String, required: true, index: true },
    sellerUsername: { type: String, required: true, index: true },
    price: { type: Number, required: true, min: 0 },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: 'market_listings' },
);

// Re-use the compiled model on hot-reload (tsx watch) to avoid OverwriteModelError.
export const MarketListingModel: Model<IMarketListing> =
  (mongoose.models['MarketListing'] as Model<IMarketListing>) ??
  model<IMarketListing>('MarketListing', marketListingSchema);
