/**
 * Dev-only script: list unverified users and mark them verified.
 * Usage:  npx tsx scripts/verify-users.ts
 *         npx tsx scripts/verify-users.ts <email>   ← verify one specific account
 */
import 'dotenv/config'
import mongoose from 'mongoose'

const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/lumen'
await mongoose.connect(MONGODB_URI)

const db = mongoose.connection.db!
const col = db.collection('users')

const targetEmail = process.argv[2]?.toLowerCase()

if (targetEmail) {
  // Verify a specific email
  const result = await col.updateOne(
    { email: targetEmail },
    { $set: { emailVerified: true, emailVerifyToken: null, emailVerifyExpires: null } },
  )
  if (result.matchedCount === 0) {
    console.log(`No user found with email: ${targetEmail}`)
  } else {
    console.log(`✅  ${targetEmail} is now verified.`)
  }
} else {
  // List all users with their status
  const users = await col
    .find({}, { projection: { username: 1, email: 1, emailVerified: 1, ageGroup: 1, contentMode: 1, createdAt: 1 } })
    .toArray()

  if (users.length === 0) {
    console.log('No users in database.')
  } else {
    console.log('\nAll registered users:\n')
    for (const u of users) {
      const status = u.emailVerified ? '✅ verified' : '⏳ UNVERIFIED'
      console.log(`  ${status}  ${u.username} <${u.email}>  (${u.ageGroup})`)
    }
    console.log('\nTo verify an account run:')
    console.log('  npx tsx scripts/verify-users.ts <email>\n')
  }
}

await mongoose.disconnect()
process.exit(0)
