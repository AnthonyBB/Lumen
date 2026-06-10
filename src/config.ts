/**
 * Shared client configuration.
 *
 * API_BASE is the origin of the Lumen backend (Express + Socket.io).
 * All fetch() calls and the socket connection use this single constant so the
 * server address only ever needs to change in one place.
 */
export const API_BASE = 'http://localhost:3001'
