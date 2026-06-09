/**
 * Lumen — Multiplayer Backend
 * Express + Socket.io server
 *
 * Port  : 3001
 * CORS  : http://localhost:5173  (Vite dev server)
 *
 * Security posture:
 *  - The server is authoritative for all game state (HP, XP, level, scores).
 *  - Clients never send authoritative values — only intent (move, answer, chat).
 *  - See individual manager files for per-feature security notes.
 */

import 'dotenv/config'
import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import { GameManager } from './game/GameManager.js'
import { registerHandlers } from './socket/handlers.js'
import { connectDB } from './db/connection.js'
import authRouter from './routes/auth.js'
import { verifyToken } from './middleware/auth.js'

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173'

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express()

app.use(
  cors({
    origin: CLIENT_ORIGIN,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  }),
)

// Explicitly handle preflight OPTIONS requests for all routes
app.options('*', cors({
  origin: CLIENT_ORIGIN,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}))

app.use(express.json())

/** Health check */
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

/** Auth routes */
app.use('/api/auth', authRouter)

// ---------------------------------------------------------------------------
// HTTP + Socket.io server
// ---------------------------------------------------------------------------

const httpServer = createServer(app)

const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_ORIGIN,
    methods: ['GET', 'POST'],
  },
})

// ---------------------------------------------------------------------------
// Players Online tracking (authenticated users only)
// ---------------------------------------------------------------------------

const onlinePlayers = new Set<string>()

function getOnlineCount(): number {
  return onlinePlayers.size
}

// ---------------------------------------------------------------------------
// Socket.io authentication middleware
// ---------------------------------------------------------------------------

io.use((socket, next) => {
  const token = socket.handshake.auth?.token as string | undefined

  if (!token) {
    socket.data.userId = null
    socket.data.username = 'Guest_' + socket.id.slice(0, 6)
    socket.data.ageGroup = 'child'
    socket.data.authenticated = false
    return next()
  }

  try {
    const payload = verifyToken(token)
    socket.data.userId = payload.userId
    socket.data.username = payload.username
    socket.data.ageGroup = payload.ageGroup
    socket.data.contentMode = payload.contentMode ?? null
    socket.data.authenticated = true
    return next()
  } catch {
    return next(new Error('Invalid token'))
  }
})

// ---------------------------------------------------------------------------
// Game state (singleton per process)
// ---------------------------------------------------------------------------

const game = new GameManager()

// ---------------------------------------------------------------------------
// Socket.io connection entry point
// ---------------------------------------------------------------------------

io.on('connection', (socket) => {
  console.log(
    `[connect] ${socket.id} (${socket.data.authenticated ? socket.data.username : 'guest'}) — total: ${io.engine.clientsCount}`,
  )

  if (socket.data.authenticated && socket.data.userId) {
    onlinePlayers.add(socket.data.userId as string)
    io.emit('players:online', getOnlineCount())
  }

  registerHandlers(io, socket, game, onlinePlayers)

  socket.on('disconnect', () => {
    if (socket.data.authenticated && socket.data.userId) {
      onlinePlayers.delete(socket.data.userId as string)
      io.emit('players:online', getOnlineCount())
    }
  })
})

// ---------------------------------------------------------------------------
// Start — connect DB then listen
// ---------------------------------------------------------------------------

connectDB().then(() => {
  httpServer.listen(PORT, () => {
    console.log(`🌟 Lumen server running on http://localhost:${PORT}`)
    console.log(`   CORS origin: ${CLIENT_ORIGIN}`)
    console.log(`   Health check: http://localhost:${PORT}/health`)
  })
})
