import { Schema, model, Document, Types } from 'mongoose'

// ---------------------------------------------------------------------------
// InventoryItem sub-document (duplicated here to keep models self-contained)
// ---------------------------------------------------------------------------

const ItemStatsSchema = new Schema(
  {
    attack: { type: Number },
    defense: { type: Number },
    hp: { type: Number },
    xp: { type: Number },
  },
  { _id: false },
)

const InventoryItemSchema = new Schema(
  {
    id: { type: String, required: true },
    itemType: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    rarity: { type: String, required: true },
    stats: { type: ItemStatsSchema, default: () => ({}) },
    quantity: { type: Number, required: true, default: 1 },
    stackable: { type: Boolean, default: false },
    icon: { type: String, default: '' },
    slot: { type: String },
  },
  { _id: false },
)

// ---------------------------------------------------------------------------
// ChestStorage document
// ---------------------------------------------------------------------------

export interface IChestStorage extends Document {
  userId: Types.ObjectId
  items: unknown[]
  updatedAt: Date
}

const ChestStorageSchema = new Schema<IChestStorage>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    items: { type: [InventoryItemSchema], default: [] },
  },
  { timestamps: { createdAt: false, updatedAt: 'updatedAt' } },
)

export const ChestStorage = model<IChestStorage>('ChestStorage', ChestStorageSchema)
