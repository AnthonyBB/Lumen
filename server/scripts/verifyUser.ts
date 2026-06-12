/**
 * verifyUser.ts — dev utility to mark an account's email as verified directly
 * in the database, without the email round-trip.
 *
 * Usage:
 *   npx tsx server/scripts/verifyUser.ts <email>
 *
 * Connects to the same MongoDB the server uses (MONGODB_URI from .env, else
 * localhost). This only flips `emailVerified` on ONE named account — it does not
 * touch the running server or weaken auth for anyone else. Intended for local
 * development / testing only.
 */
import 'dotenv/config'
import mongoose from 'mongoose'
import { connectDB, isDbConnected } from '../db/connection.js'
import { User } from '../db/models/User.js'

async function main(): Promise<void> {
  const email = process.argv[2]?.toLowerCase()
  if (!email) {
    console.error('Usage: npx tsx server/scripts/verifyUser.ts <email>')
    process.exit(1)
  }

  await connectDB()
  if (!isDbConnected()) {
    console.error('[verifyUser] Could not connect to MongoDB — is it running?')
    process.exit(1)
  }

  const user = await User.findOne({ email })
  if (!user) {
    console.error(`[verifyUser] No account found for ${email}`)
    await mongoose.disconnect()
    process.exit(1)
  }

  if (user.emailVerified) {
    console.log(`[verifyUser] ${email} is already verified — nothing to do.`)
  } else {
    user.emailVerified = true
    user.emailVerifyToken = null
    user.emailVerifyExpires = null
    await user.save()
    console.log(`[verifyUser] ✓ ${email} is now verified. You can log in.`)
  }

  await mongoose.disconnect()
  process.exit(0)
}

main().catch((err) => {
  console.error('[verifyUser] Error:', err)
  process.exit(1)
})
