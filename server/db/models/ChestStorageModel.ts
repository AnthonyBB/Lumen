/**
 * Mongoose model for persisting a player's personal chest storage.
 *
 * Fields:
 *  userId    — stable username / user ID (indexed, unique)
 *  items     — items stored in the chest
 *  maxSlots  — capacity cap (default 120 = 4 tabs × 30 slots)
 *  updatedAt — last write timestamp
 */

import mongoose, { Schema, model, type Model, type Document } from 'mongoose';
import { inventoryItemSchema } from './InventoryItemSchema.js';

interface ChestStorageDoc extends Document {
  userId:    string;
  items:     unknown[];
  maxSlots:  number;
  updatedAt: Date;
}

const chestStorageSchema = new Schema(
  {
    userId:    { type: String, required: true, index: true, unique: true },
    items:     { type: [inventoryItemSchema], default: [] },
    maxSlots:  { type: Number, default: 120 },
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: 'chest_storages' },
);

// Re-use existing compiled model if it exists (important for hot-reload / tsx watch)
export const ChestStorageModel: Model<ChestStorageDoc> =
  (mongoose.models['ChestStorage'] as Model<ChestStorageDoc>) ??
  model<ChestStorageDoc>('ChestStorage', chestStorageSchema);
