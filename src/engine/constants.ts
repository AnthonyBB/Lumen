export const DIFFICULTY_CONFIG = {
  easy:   { xpMultiplier: 1.0, timeLimit: 30, baseXP: 10 },
  medium: { xpMultiplier: 1.5, timeLimit: 25, baseXP: 20 },
  hard:   { xpMultiplier: 2.5, timeLimit: 20, baseXP: 35 },
} as const

export const TIME_BONUS_THRESHOLD = 0.5  // answer in first 50% of time for bonus
export const TIME_BONUS_XP = 5
export const STREAK_BONUS_XP = 3         // per question in streak
export const MAX_STREAK_BONUS = 30
export const QUESTIONS_PER_SESSION = 10
