/**
 * diagAccount.ts — READ-ONLY diagnostic for "I lost my characters/inventory".
 *
 * Usage:
 *   npx tsx server/scripts/diagAccount.ts <email>
 *
 * Connects to the same MongoDB the server uses (MONGODB_URI from .env, else
 * localhost/lumen). It only READS — it never writes or deletes anything. It
 * reports whether the account exists, what username it maps to, and whether
 * progress/inventory documents exist under that username; then lists every
 * username that DOES have saved progress (to spot a key mismatch).
 */
import 'dotenv/config'
import mongoose from 'mongoose'
import { connectDB, isDbConnected } from '../db/connection.js'
import { User } from '../db/models/User.js'
import { PlayerProgress } from '../db/models/PlayerProgressModel.js'
import { PlayerInventoryModel } from '../db/models/PlayerInventoryModel.js'

async function main(): Promise<void> {
  const email = process.argv[2]?.toLowerCase()
  if (!email) {
    console.error('Usage: npx tsx server/scripts/diagAccount.ts <email>')
    process.exit(1)
  }

  console.log('[diag] MONGODB_URI =', process.env.MONGODB_URI || 'mongodb://localhost:27017/lumen (default)')
  await connectDB()
  if (!isDbConnected()) {
    console.error('[diag] Could NOT connect to MongoDB. If the server runs the same way, it is NOT persisting — that explains the data loss.')
    process.exit(1)
  }

  const user = await User.findOne({ email }).lean()
  if (!user) {
    console.log(`[diag] No User found for ${email}.`)
  } else {
    console.log(`[diag] User: username="${user.username}"  emailVerified=${user.emailVerified}  created=${user.createdAt}`)
    const prog = await PlayerProgress.findOne({ userId: user.username }).lean()
    if (!prog) {
      console.log(`[diag] NO PlayerProgress under userId="${user.username}".`)
    } else {
      const chars = (prog as { characters?: { name: string; level: number }[] }).characters ?? []
      console.log(`[diag] PlayerProgress: ${chars.length} character(s): ` +
        chars.map((c) => `${c.name}(L${c.level})`).join(', '))
      console.log(`[diag]   recruitTokens=${(prog as { recruitTokens?: number }).recruitTokens ?? 0}` +
        `  tutorialLevelsDone=${(prog as { tutorialLevelsDone?: number }).tutorialLevelsDone ?? '(absent)'}`)
    }
    const inv = await PlayerInventoryModel.findOne({ userId: user.username }).lean()
    const items = (inv as { items?: unknown[] } | null)?.items ?? []
    console.log(`[diag] PlayerInventory: ${inv ? `${items.length} item(s)` : 'NONE'}`)
  }

  // What usernames DO have saved progress? (helps spot a key mismatch.)
  const allProg = await PlayerProgress.find({}, { userId: 1 }).lean()
  console.log(`[diag] PlayerProgress docs in DB (${allProg.length}):`,
    allProg.map((p) => (p as { userId?: string }).userId).join(', ') || '(none)')

  await mongoose.disconnect()
  process.exit(0)
}

main().catch((err) => {
  console.error('[diag] Error:', err)
  process.exit(1)
})
