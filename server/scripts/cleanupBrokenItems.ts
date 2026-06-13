/**
 * cleanupBrokenItems.ts — remove gear items that lost their stats to the old
 * inventory-schema bug (no equipSlot/baseDamage/attributes/etc. persisted).
 *
 * Usage:
 *   npx tsx server/scripts/cleanupBrokenItems.ts <email>
 *
 * Connects to the same MongoDB the server uses. For the named account it scans
 * the bag (PlayerInventory.items) and the chest (ChestStorage.items) and DELETES
 * any item that is no longer usable — i.e. has no equipSlot, no baseDamage/
 * baseDefense, no attributes, no potion effect, and no legacy {attack/defense/hp}
 * stats. Usable items (real gear, potions, legacy gear) are kept. Equipped gear
 * is stored as Mixed and was never stripped, so it is left untouched.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB, isDbConnected } from '../db/connection.js';
import { User } from '../db/models/User.js';
import { PlayerInventoryModel } from '../db/models/PlayerInventoryModel.js';
import { ChestStorageModel } from '../db/models/ChestStorageModel.js';

type Item = Record<string, unknown>;

/** True when an item still has something that makes it usable. */
function isUsable(it: Item): boolean {
  const stats = (it.stats ?? {}) as Record<string, unknown>;
  const attrs = it.attributes;
  return (
    !!it.equipSlot ||
    !!it.baseDamage ||
    typeof it.baseDefense === 'number' ||
    (Array.isArray(attrs) && attrs.length > 0) ||
    !!it.potion ||
    ['attack', 'defense', 'hp'].some((k) => typeof stats[k] === 'number' && stats[k] !== 0)
  );
}

async function main(): Promise<void> {
  const email = process.argv[2]?.toLowerCase();
  if (!email) {
    console.error('Usage: npx tsx server/scripts/cleanupBrokenItems.ts <email>');
    process.exit(1);
  }
  await connectDB();
  if (!isDbConnected()) { console.error('[cleanup] Could not connect to MongoDB.'); process.exit(1); }

  const user = await User.findOne({ email }).lean();
  if (!user) { console.error(`[cleanup] No account for ${email}`); await mongoose.disconnect(); process.exit(1); }
  const userId = user.username;
  console.log(`[cleanup] Account ${email} → username "${userId}"`);

  // Bag
  const inv = await PlayerInventoryModel.findOne({ userId }).lean();
  if (inv) {
    const items = (inv.items ?? []) as Item[];
    const keep = items.filter(isUsable);
    const drop = items.filter((it) => !isUsable(it));
    console.log(`[cleanup] Bag: ${items.length} → keeping ${keep.length}, deleting ${drop.length}`);
    for (const d of drop) console.log(`           - ${d.name ?? d.itemType}`);
    if (drop.length) await PlayerInventoryModel.updateOne({ userId }, { $set: { items: keep } });
  } else {
    console.log('[cleanup] No bag document.');
  }

  // Chest
  const chest = await ChestStorageModel.findOne({ userId }).lean();
  if (chest) {
    const items = (chest.items ?? []) as Item[];
    const keep = items.filter(isUsable);
    const drop = items.filter((it) => !isUsable(it));
    console.log(`[cleanup] Chest: ${items.length} → keeping ${keep.length}, deleting ${drop.length}`);
    for (const d of drop) console.log(`           - ${d.name ?? d.itemType}`);
    if (drop.length) await ChestStorageModel.updateOne({ userId }, { $set: { items: keep } });
  } else {
    console.log('[cleanup] No chest document.');
  }

  console.log('[cleanup] Done.');
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => { console.error('[cleanup] Error:', err); process.exit(1); });
