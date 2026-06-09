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

import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { GameManager } from './game/GameManager.js';
import { registerHandlers } from './socket/handlers.js';
import { connectDB } from './db/connection.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express();

app.use(
  cors({
    origin: CLIENT_ORIGIN,
    methods: ['GET', 'POST'],
  }),
);

app.use(express.json());

/** Health check — used by load balancers / monitoring. */
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// HTTP + Socket.io server
// ---------------------------------------------------------------------------

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_ORIGIN,
    methods: ['GET', 'POST'],
  },
});

// ---------------------------------------------------------------------------
// Game state (singleton per process)
// ---------------------------------------------------------------------------

const game = new GameManager();

// ---------------------------------------------------------------------------
// Socket.io connection entry point
// ---------------------------------------------------------------------------

io.on('connection', (socket) => {
  console.log(`[connect] ${socket.id} — total: ${io.engine.clientsCount}`);
  registerHandlers(io, socket, game);
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

// Connect to MongoDB before accepting connections (non-blocking on failure)
connectDB().then(() => {
  httpServer.listen(PORT, () => {
    console.log(`🌟 Lumen server running on http://localhost:${PORT}`);
    console.log(`   CORS origin: ${CLIENT_ORIGIN}`);
    console.log(`   Health check: http://localhost:${PORT}/health`);
  });
});
