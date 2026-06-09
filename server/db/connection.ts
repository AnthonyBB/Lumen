import mongoose from 'mongoose'

let dbConnected = false

/**
 * Connects to MongoDB.  Failures are non-fatal — the game continues using
 * in-memory state, but data will not persist across restarts.
 */
export async function connectDB(): Promise<void> {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/lumen'
  try {
    await mongoose.connect(uri)
    dbConnected = true
    console.log('[MongoDB] Connected to', uri)
  } catch (err) {
    console.error('[MongoDB] Connection failed:', err)
    console.warn('[MongoDB] Running without persistence — data will be lost on restart')
  }
}

/**
 * Returns true when mongoose currently holds an open connection to MongoDB.
 * Use this in other modules to decide whether to persist or fall back to
 * in-memory storage.
 */
export function isDbConnected(): boolean {
  return dbConnected && mongoose.connection.readyState === 1
}
