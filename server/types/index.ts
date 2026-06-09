/**
 * Shared TypeScript types for the Lumen multiplayer backend.
 * All game state is authoritative on the server — these types describe
 * what the server tracks internally and what it sends to clients.
 */

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------

export interface PlayerPosition {
  x: number;
  y: number;
}

/** Full player record stored on the server (never sent entirely to clients). */
export interface Player {
  id: string;           // socket ID
  username: string;
  level: number;
  xp: number;
  hp: number;
  maxHp: number;
  zone: string;
  position: PlayerPosition;
  lastMessageAt: number; // unix ms — used for chat rate-limiting
}

/** Safe subset of a player that can be broadcast to other clients. */
export interface PublicPlayer {
  id: string;
  username: string;
  level: number;
  hp: number;
  maxHp: number;
  zone: string;
  position: PlayerPosition;
}

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

export type Subject = 'math' | 'science' | 'history' | 'language';
export type Difficulty = 'easy' | 'medium' | 'hard';

/** Full question record — stored server-side only. */
export interface Question {
  id: string;
  subject: Subject;
  question: string;
  /** Exactly 4 answer choices. */
  answers: [string, string, string, string];
  /** Index 0–3 of the correct answer — NEVER sent to the client before validation. */
  correctIndex: number;
  explanation: string;
  gradeLevel: number;   // recommended grade (e.g. 2 = 2nd grade)
  difficulty: Difficulty;
}

/** Safe subset sent to the client when a question is presented. */
export interface ClientQuestion {
  id: string;
  subject: Subject;
  question: string;
  answers: [string, string, string, string];
  difficulty: Difficulty;
  timeLimit: number;    // seconds the client has to answer
}

// ---------------------------------------------------------------------------
// Combat
// ---------------------------------------------------------------------------

export type CombatTurn = 'player' | 'enemy';

export interface CombatSession {
  sessionId: string;
  attackerId: string;   // socket ID of the player
  defenderId: string;   // could be an NPC id or another player's socket ID
  currentQuestion: Question | null;
  questionStartedAt: number; // unix ms — for enforcing time limits
  turn: CombatTurn;
  isActive: boolean;
  attackerHp: number;
  defenderHp: number;
  attackerMaxHp: number;
  defenderMaxHp: number;
}

// ---------------------------------------------------------------------------
// Game room / zone
// ---------------------------------------------------------------------------

export interface Zone {
  id: string;
  players: Set<string>; // socket IDs
}

// ---------------------------------------------------------------------------
// Socket event payloads — Client → Server
// ---------------------------------------------------------------------------

export interface PlayerJoinPayload {
  username: string;
}

export interface PlayerMovePayload {
  x: number;
  y: number;
  zone: string;
}

export interface CombatStartPayload {
  targetId: string;
}

export interface CombatAnswerPayload {
  sessionId: string;
  answerIndex: number;
}

export interface ChatMessagePayload {
  message: string;
}

// ---------------------------------------------------------------------------
// Socket event payloads — Server → Client
// ---------------------------------------------------------------------------

export interface PlayerJoinedPayload {
  player: PublicPlayer;
  zonePlayers: PublicPlayer[];
}

export interface PlayerMovedPayload {
  playerId: string;
  x: number;
  y: number;
}

export interface CombatStartedPayload {
  sessionId: string;
  question: ClientQuestion; // correct answer intentionally omitted
}

export interface CombatResultPayload {
  correct: boolean;
  damage: number;
  explanation: string;
  updatedHp: { attackerHp: number; defenderHp: number };
  nextQuestion?: ClientQuestion;
  combatEnd?: {
    winnerId: string;
    xpGained: number;
  };
}

export interface ZonePlayersPayload {
  players: PublicPlayer[];
}

export interface ChatBroadcastPayload {
  playerId: string;
  username: string;
  message: string;
}

export interface ErrorPayload {
  message: string;
}
