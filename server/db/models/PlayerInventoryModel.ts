/**
 * Mongoose model for persisting a player's inventory across server restarts.
 *
 * Fields:
 *  userId       — stable username / user ID (indexed, unique)
 *  items        — bag contents
 *  equipment    — keyed by EquipmentSlotKey, each value is an InventoryItem or absent
 *  gold         — currency amount
 *  updatedAt    — last write timestamp
 */

import mongoose, { Schema, model, type Model, type Document } from 'mongoose';
import { inventoryItemSchema } from './InventoryItemSchema.js';

interface PlayerInventoryDoc extends Document {
  userId:    string;
  items:     unknown[];
  /** Legacy flat equipment (pre-roster saves). Migrated into
   *  `equipmentByCharacter` on first access. */
  equipment: Record<string, unknown>;
  /** Per-character equipment: characterId → equipped slots. */
  equipmentByCharacter: Record<string, unknown>;
  gold:      number;
  updatedAt: Date;
}

const equipmentSlotsSchema = new Schema(
  {
    mainHand:  { type: inventoryItemSchema, default: undefined },
    offHand:   { type: inventoryItemSchema, default: undefined },
    helm:      { type: inventoryItemSchema, default: undefined },
    earring:   { type: inventoryItemSchema, default: undefined },
    ring1:     { type: inventoryItemSchema, default: undefined },
    ring2:     { type: inventoryItemSchema, default: undefined },
    belt:      { type: inventoryItemSchema, default: undefined },
    shoes:     { type: inventoryItemSchema, default: undefined },
    gloves:    { type: inventoryItemSchema, default: undefined },
    necklace:  { type: inventoryItemSchema, default: undefined },
    chest:     { type: inventoryItemSchema, default: undefined },
    legs:      { type: inventoryItemSchema, default: undefined },
  },
  { _id: false },
);

const playerInventorySchema = new Schema(
  {
    userId:    { type: String, required: true, index: true, unique: true },
    items:     { type: [inventoryItemSchema], default: [] },
    equipment: { type: equipmentSlotsSchema, default: () => ({}) },
    // characterId → equipped slots (the roster model; see CHARACTERS_DESIGN.md §1).
    equipmentByCharacter: { type: Schema.Types.Mixed, default: () => ({}) },
    gold:      { type: Number, default: 0 },
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: 'player_inventories' },
);

// Re-use existing compiled model if it exists (important for hot-reload / tsx watch)
export const PlayerInventoryModel: Model<PlayerInventoryDoc> =
  (mongoose.models['PlayerInventory'] as Model<PlayerInventoryDoc>) ??
  model<PlayerInventoryDoc>('PlayerInventory', playerInventorySchema);
