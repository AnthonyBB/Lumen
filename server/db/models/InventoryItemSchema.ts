/**
 * Reusable Mongoose sub-document schema that mirrors the InventoryItem type.
 * Used by both PlayerInventoryModel and ChestStorageModel.
 */

import { Schema } from 'mongoose';

export const inventoryItemSchema = new Schema(
  {
    id:          { type: String, required: true },
    itemType:    { type: String, required: true },
    name:        { type: String, required: true },
    description: { type: String, default: '' },
    rarity:      { type: String, required: true },
    stats: {
      attack:  { type: Number },
      defense: { type: Number },
      hp:      { type: Number },
      xp:      { type: Number },
    },
    quantity:  { type: Number, required: true, default: 1 },
    stackable: { type: Boolean, required: true, default: false },
    icon:      { type: String, default: '' },
    slot:      { type: String },
    chestSlot: { type: Number },
  },
  { _id: false },
);
