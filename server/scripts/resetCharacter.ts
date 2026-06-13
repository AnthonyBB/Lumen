/**
 * resetCharacter.ts — DESTRUCTIVE dev utility. Completely resets one account's
 * GAME state (roster, level/XP, tokens, tutorial, bag, equipment, chest) back to
 * a brand-new start, WITHOUT touching the login account (User doc) so the player
 * can still sign in with the same email/password.
 *
 * Usage:
 *   npx tsx server/scripts/resetCharacter.ts <email>
 *
 * Deletes the PlayerProgress, PlayerInventory and ChestStorage documents for the
 * account's username; the server regenerates fresh defaults on next join.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB, isDbConnected } from '../db/connection.js';
import { User } from '../db/models/User.js';
import { PlayerProgress } from '../db/models/PlayerProgressModel.js';
import { PlayerInventoryModel } from '../db/models/PlayerInventoryModel.js';
import { ChestStorageModel } from '../db/models/ChestStorageModel.js';

async function main(): Promise<void> {
  const email = process.argv[2]?.toLowerCase();
  if (!email) {
    console.error('Usage: npx tsx server/scripts/resetCharacter.ts <email>');
    process.exit(1);
  }
  await connectDB();
  if (!isDbConnected()) { console.error('[reset] Could not connect to MongoDB.'); process.exit(1); }

  const user = await User.findOne({ email }).lean();
  if (!user) { console.error(`[reset] No account for ${email}`); await mongoose.disconnect(); process.exit(1); }
  const userId = user.username;
  console.log(`[reset] Account ${email} → username "${userId}" (login is KEPT)`);

  const prog = await PlayerProgress.deleteOne({ userId });
  const inv = await PlayerInventoryModel.deleteOne({ userId });
  const chest = await ChestStorageModel.deleteOne({ userId });

  console.log(`[reset] PlayerProgress deleted: ${prog.deletedCount}`);
  console.log(`[reset] PlayerInventory deleted: ${inv.deletedCount}`);
  console.log(`[reset] ChestStorage deleted: ${chest.deletedCount}`);
  console.log('[reset] Done — the account will start fresh on next join.');

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => { console.error('[reset] Error:', err); process.exit(1); });
