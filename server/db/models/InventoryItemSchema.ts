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
    // Crafted/equippable gear + potion fields (mirror of InventoryItem). These
    // MUST be persisted — without them Mongoose strips the item's stats on save,
    // so reloaded gear loses its slot/damage/attributes/level gate. Mixed is used
    // for the nested shapes (attributes has a field literally named `type`, which
    // would clash with Mongoose's schema-type key). See server/types InventoryItem.
    potion:        { type: Schema.Types.Mixed },
    equipSlot:     { type: String },
    attributes:    { type: [Schema.Types.Mixed], default: undefined },
    xpRequired:    { type: Number },
    requiredLevel: { type: Number },
    baseDamage:    { type: Schema.Types.Mixed },
    baseDefense:   { type: Number },
    craftRank:     { type: String },
    recipeId:      { type: String },
    craftTier:     { type: Number },
  },
  { _id: false },
);
