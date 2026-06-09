# Question Engine

The Question Engine powers all educational content in Lumen. It manages a bank of 240 questions across 4 subjects and 3 difficulty levels, handles session management, and computes XP rewards.

---

## Directory Structure

```
src/engine/
  types.ts          — TypeScript interfaces and type aliases
  constants.ts      — XP values, time limits, difficulty multipliers
  QuestionEngine.ts — Core engine class for retrieving questions and sessions
  Validator.ts      — Answer validation and scoring logic
  questions/
    math.ts         — 60 math questions (20 easy, 20 medium, 20 hard)
    science.ts      — 60 science questions
    history.ts      — 60 history questions
    language.ts     — 60 language arts questions
    index.ts        — Unified exports and lookup maps
```

---

## Key Types

| Type | Description |
|------|-------------|
| `Subject` | `'math' \| 'science' \| 'history' \| 'language'` |
| `Difficulty` | `'easy' \| 'medium' \| 'hard'` |
| `Question` | A single multiple-choice question with 4 answers, XP reward, and explanation |
| `QuestionResult` | The outcome of a single answered question, including XP earned |
| `QuestionSession` | An active play session with shuffled questions |

---

## Using QuestionEngine

```ts
import { QuestionEngine } from './QuestionEngine'

const engine = new QuestionEngine()

// Start a 10-question session
const session = engine.startSession('math', 'easy')

// Get the first question
const question = engine.nextQuestion(session)

// Get a random combat question (any subject)
const combatQ = engine.getRandomQuestion('hard')

// Count questions
engine.getQuestionCount()              // 240
engine.getQuestionCount('math')        // 60
engine.getQuestionCount('math', 'easy') // 20
```

---

## Using Validator

```ts
import { Validator } from './Validator'

const validator = new Validator()

// Validate an answer
// answerTimestamp: milliseconds elapsed since session.startedAt
const result = validator.validate(question, selectedIndex, answerTimestamp, currentStreak)

// result.correct      — whether the answer was right
// result.xpEarned     — total XP including bonuses
// result.explanation  — explanation to display to the player

// Check if the session is done
if (validator.isSessionComplete(session)) { ... }

// Final summary after all questions
const summary = validator.getSessionSummary(session, results)
// summary.grade     — 'S' | 'A' | 'B' | 'C' | 'F'
// summary.accuracy  — 0 to 1
// summary.totalXP
```

---

## XP Calculation

| Component | Amount |
|-----------|--------|
| Base XP (easy) | 10 XP |
| Base XP (medium) | 20 XP |
| Base XP (hard) | 35 XP |
| Time bonus (answer in first 50% of time limit) | +5 XP |
| Streak bonus | +3 XP per consecutive correct answer (max 30 XP) |

---

## Adding New Questions

1. Open the appropriate subject file in `src/engine/questions/`.
2. Add a new `Question` object to the array.
3. Follow the ID format: `{subject}_{difficulty}_{3-digit-number}` — e.g. `math_hard_021`.
4. Ensure the question has:
   - Exactly 4 answers
   - A valid `correctIndex` (0–3)
   - A meaningful `explanation` that teaches the concept
   - Appropriate `xpReward` and `timeLimit` from the difficulty constants
   - Age-appropriate content (safe for children 7+)
5. No other files need to be modified — the index auto-combines all questions.

---

## Question Difficulty Guidelines

| Difficulty | Time Limit | Base XP | Target Audience |
|------------|-----------|---------|-----------------|
| Easy | 30 seconds | 10 XP | Ages 7–9, foundational concepts |
| Medium | 25 seconds | 20 XP | Ages 9–12, intermediate concepts |
| Hard | 20 seconds | 35 XP | Ages 12+, advanced concepts |
