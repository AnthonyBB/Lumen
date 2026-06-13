export type Subject = 'math' | 'science' | 'history' | 'language' | 'geography' | 'technology' | 'arts' | 'health'
export type Difficulty = 'easy' | 'medium' | 'hard'

export interface Question {
  id: string                  // e.g. "math_easy_001"
  subject: Subject
  difficulty: Difficulty
  question: string
  answers: [string, string, string, string]  // exactly 4 choices
  correctIndex: 0 | 1 | 2 | 3
  explanation: string         // shown after answering — teaches the concept
  hint?: string               // optional hint if player uses a hint item
  tags?: string[]             // e.g. ["addition", "multiplication"]
  xpReward: number            // base XP for correct answer
  timeLimit: number           // seconds allowed to answer
}

export interface QuestionResult {
  questionId: string
  correct: boolean
  selectedIndex: number
  correctIndex: number
  explanation: string
  xpEarned: number
  timeBonus: number           // extra XP for answering quickly
  streak: number              // current correct streak
}

export interface QuestionSession {
  sessionId: string
  subject: Subject
  difficulty: Difficulty
  questions: Question[]       // shuffled subset for this session
  currentIndex: number
  score: number
  streak: number
  startedAt: number           // timestamp
}
