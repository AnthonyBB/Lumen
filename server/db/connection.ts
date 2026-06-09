import mongoose from 'mongoose';

let dbConnected = false;

export async function connectDB(): Promise<void> {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/lumen';
  try {
    await mongoose.connect(uri);
    dbConnected = true;
    console.log('[MongoDB] Connected to', uri);
  } catch (err) {
    console.error('[MongoDB] Connection failed — running in-memory:', err);
  }
}

export function isDbConnected(): boolean {
  return dbConnected && mongoose.connection.readyState === 1;
}
