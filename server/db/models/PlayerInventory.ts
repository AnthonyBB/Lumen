import { Schema, model, Document, Types } from 'mongoose'

// ---------------------------------------------------------------------------
// InventoryItem sub-document — mirrors server/types/index.ts InventoryItem
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
    id: { type: String, required: true },          // UUID assigned server-side
    itemType: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    rarity: { type: String, required: true },
    stats: { type: ItemStatsSchema, default: () => ({}) },
    quantity: { type: Number, required: true, default: 1 },
    stackable: { type: Boolean, default: false },
    icon: { type: String, default: '' },
    slot: { type: String },                        // optional equipment slot hint
  },
  { _id: false },
)

// ---------------------------------------------------------------------------
// EquipmentSlots sub-document
// ---------------------------------------------------------------------------

const EquipmentSlotsSchema = new Schema(
  {
    mainHand: { type: InventoryItemSchema },
    offHand: { type: InventoryItemSchema },
    helm: { type: InventoryItemSchema },
    earring: { type: InventoryItemSchema },
    ring1: { type: InventoryItemSchema },
    ring2: { type: InventoryItemSchema },
    belt: { type: InventoryItemSchema },
    shoes: { type: InventoryItemSchema },
    gloves: { type: InventoryItemSchema },
    necklace: { type: InventoryItemSchema },
  },
  { _id: false },
)

// ---------------------------------------------------------------------------
// PlayerInventory document
// ---------------------------------------------------------------------------

export interface IPlayerInventory extends Document {
  userId: Types.ObjectId
  items: unknown[]
  equippedSlots: unknown
  shards: number
  updatedAt: Date
}

const PlayerInventorySchema = new Schema<IPlayerInventory>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    items: { type: [InventoryItemSchema], default: [] },
    equippedSlots: { type: EquipmentSlotsSchema, default: () => ({}) },
    shards: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: false, updatedAt: 'updatedAt' } },
)

export const PlayerInventory = model<IPlayerInventory>('PlayerInventory', PlayerInventorySchema)
