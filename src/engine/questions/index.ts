import type { Question, Subject, Difficulty } from '../types'
import { MATH_QUESTIONS } from './math'
import { SCIENCE_QUESTIONS } from './science'
import { HISTORY_QUESTIONS } from './history'
import { LANGUAGE_QUESTIONS } from './language'

export { MATH_QUESTIONS } from './math'
export { SCIENCE_QUESTIONS } from './science'
export { HISTORY_QUESTIONS } from './history'
export { LANGUAGE_QUESTIONS } from './language'

/** All 240 questions combined */
export const ALL_QUESTIONS: Question[] = [
  ...MATH_QUESTIONS,
  ...SCIENCE_QUESTIONS,
  ...HISTORY_QUESTIONS,
  ...LANGUAGE_QUESTIONS,
]

/** Lookup: QUESTIONS_BY_SUBJECT['math'] => Question[] */
export const QUESTIONS_BY_SUBJECT: Record<Subject, Question[]> = {
  math: MATH_QUESTIONS,
  science: SCIENCE_QUESTIONS,
  history: HISTORY_QUESTIONS,
  language: LANGUAGE_QUESTIONS,
}

/** Lookup: QUESTIONS_BY_DIFFICULTY['easy'] => Question[] */
export const QUESTIONS_BY_DIFFICULTY: Record<Difficulty, Question[]> = {
  easy: ALL_QUESTIONS.filter((q) => q.difficulty === 'easy'),
  medium: ALL_QUESTIONS.filter((q) => q.difficulty === 'medium'),
  hard: ALL_QUESTIONS.filter((q) => q.difficulty === 'hard'),
}
