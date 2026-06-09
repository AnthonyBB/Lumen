import mongoose from 'mongoose'

let dbConnected = false

export async function connectDB(): Promise<void> {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/lumen'
  try {
    await mongoose.connect(uri)
    dbConnected = true
    console.log('[MongoDB] Connected')
  } catch (err) {
    console.error('[MongoDB] Failed:', err)
  }
}

export const isDbConnected = () => dbConnected && mongoose.connection.readyState === 1
