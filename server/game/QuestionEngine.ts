/**
 * QuestionEngine — manages the question bank and answer validation.
 *
 * Security notes:
 *  - The correct answer index is NEVER included in the `ClientQuestion` payload
 *    returned by `getClientQuestion()`.  Validation is always server-side via
 *    `validateAnswer()`.
 *  - Questions are keyed by UUID so clients cannot predict or enumerate answers
 *    by position.
 */

import { randomUUID } from 'crypto';
import type { Question, Subject, Difficulty, ClientQuestion } from '../types/index.js';

/** Seconds a player has to submit an answer (enforced server-side too). */
export const ANSWER_TIME_LIMIT_SECONDS = 30;

// ---------------------------------------------------------------------------
// Question bank
// ---------------------------------------------------------------------------

const RAW_QUESTIONS: Omit<Question, 'id'>[] = [
  // ── Math ──────────────────────────────────────────────────────────────────
  {
    subject: 'math',
    question: 'What is 7 × 8?',
    answers: ['54', '56', '63', '48'],
    correctIndex: 1,
    explanation: '7 × 8 = 56. You can think of it as 7 × 4 × 2 = 28 × 2 = 56.',
    gradeLevel: 3,
    difficulty: 'easy',
  },
  {
    subject: 'math',
    question: 'What is 144 ÷ 12?',
    answers: ['11', '13', '12', '10'],
    correctIndex: 2,
    explanation: '144 ÷ 12 = 12. The 12 times table: 12 × 12 = 144.',
    gradeLevel: 4,
    difficulty: 'easy',
  },
  {
    subject: 'math',
    question: 'What is the value of 2³ (2 to the power of 3)?',
    answers: ['6', '9', '8', '12'],
    correctIndex: 2,
    explanation: '2³ means 2 × 2 × 2 = 4 × 2 = 8.',
    gradeLevel: 5,
    difficulty: 'medium',
  },
  {
    subject: 'math',
    question: 'If a rectangle has a length of 9 and a width of 5, what is its area?',
    answers: ['28', '40', '45', '50'],
    correctIndex: 2,
    explanation: 'Area of a rectangle = length × width = 9 × 5 = 45.',
    gradeLevel: 4,
    difficulty: 'medium',
  },
  {
    subject: 'math',
    question: 'What is 15% of 200?',
    answers: ['25', '30', '35', '40'],
    correctIndex: 1,
    explanation: '15% of 200 = 0.15 × 200 = 30.',
    gradeLevel: 6,
    difficulty: 'medium',
  },
  {
    subject: 'math',
    question: 'Solve for x: 3x + 6 = 21',
    answers: ['3', '4', '5', '6'],
    correctIndex: 2,
    explanation: '3x = 21 − 6 = 15, so x = 15 ÷ 3 = 5.',
    gradeLevel: 7,
    difficulty: 'hard',
  },
  {
    subject: 'math',
    question: 'What is the square root of 169?',
    answers: ['11', '12', '13', '14'],
    correctIndex: 2,
    explanation: '13 × 13 = 169, so √169 = 13.',
    gradeLevel: 6,
    difficulty: 'hard',
  },

  // ── Science ───────────────────────────────────────────────────────────────
  {
    subject: 'science',
    question: 'What planet is closest to the Sun?',
    answers: ['Venus', 'Earth', 'Mars', 'Mercury'],
    correctIndex: 3,
    explanation: 'Mercury is the closest planet to the Sun in our solar system.',
    gradeLevel: 3,
    difficulty: 'easy',
  },
  {
    subject: 'science',
    question: 'What gas do plants absorb from the air during photosynthesis?',
    answers: ['Oxygen', 'Nitrogen', 'Carbon Dioxide', 'Hydrogen'],
    correctIndex: 2,
    explanation:
      'Plants take in carbon dioxide (CO₂) and use sunlight to convert it into glucose and oxygen.',
    gradeLevel: 4,
    difficulty: 'easy',
  },
  {
    subject: 'science',
    question: 'How many bones are in an adult human body?',
    answers: ['196', '206', '216', '226'],
    correctIndex: 1,
    explanation: 'An adult human body has 206 bones. Babies are born with about 270.',
    gradeLevel: 5,
    difficulty: 'medium',
  },
  {
    subject: 'science',
    question: 'What is the chemical symbol for water?',
    answers: ['WO', 'HO', 'H₂O', 'W₂O'],
    correctIndex: 2,
    explanation: 'Water is made of two hydrogen atoms and one oxygen atom: H₂O.',
    gradeLevel: 4,
    difficulty: 'easy',
  },
  {
    subject: 'science',
    question: 'Which layer of the Earth is the thickest?',
    answers: ['Crust', 'Outer Core', 'Inner Core', 'Mantle'],
    correctIndex: 3,
    explanation: 'The mantle is about 2,900 km thick — the thickest layer of the Earth.',
    gradeLevel: 6,
    difficulty: 'medium',
  },
  {
    subject: 'science',
    question: 'What force keeps planets in orbit around the Sun?',
    answers: ['Magnetism', 'Gravity', 'Friction', 'Electricity'],
    correctIndex: 1,
    explanation: 'Gravity is the attractive force between objects with mass that keeps planets orbiting the Sun.',
    gradeLevel: 5,
    difficulty: 'medium',
  },
  {
    subject: 'science',
    question: 'What is the powerhouse of the cell?',
    answers: ['Nucleus', 'Ribosome', 'Mitochondria', 'Vacuole'],
    correctIndex: 2,
    explanation: 'Mitochondria produce ATP energy through cellular respiration, earning the nickname "powerhouse of the cell".',
    gradeLevel: 7,
    difficulty: 'hard',
  },

  // ── History ───────────────────────────────────────────────────────────────
  {
    subject: 'history',
    question: 'In which year did World War II end?',
    answers: ['1943', '1944', '1945', '1946'],
    correctIndex: 2,
    explanation: 'World War II ended in 1945: Germany surrendered in May and Japan in September.',
    gradeLevel: 5,
    difficulty: 'easy',
  },
  {
    subject: 'history',
    question: 'Who was the first President of the United States?',
    answers: ['Thomas Jefferson', 'John Adams', 'Benjamin Franklin', 'George Washington'],
    correctIndex: 3,
    explanation: 'George Washington became the first U.S. President in 1789.',
    gradeLevel: 3,
    difficulty: 'easy',
  },
  {
    subject: 'history',
    question: 'Which ancient wonder was located in Alexandria, Egypt?',
    answers: ['Colossus of Rhodes', 'Great Pyramid', 'Lighthouse of Alexandria', 'Hanging Gardens'],
    correctIndex: 2,
    explanation: 'The Lighthouse of Alexandria (Pharos) guided ships and was one of the Seven Wonders of the Ancient World.',
    gradeLevel: 5,
    difficulty: 'medium',
  },
  {
    subject: 'history',
    question: 'What year did Christopher Columbus first reach the Americas?',
    answers: ['1488', '1492', '1498', '1502'],
    correctIndex: 1,
    explanation: 'Columbus reached the Bahamas on October 12, 1492, during his first voyage.',
    gradeLevel: 4,
    difficulty: 'easy',
  },
  {
    subject: 'history',
    question: 'Which empire built the Colosseum in Rome?',
    answers: ['Greek', 'Ottoman', 'Roman', 'Byzantine'],
    correctIndex: 2,
    explanation: 'The Roman Empire built the Colosseum between AD 70 and 80 under Emperor Vespasian.',
    gradeLevel: 5,
    difficulty: 'medium',
  },
  {
    subject: 'history',
    question: 'What document declared American independence in 1776?',
    answers: ['The Constitution', 'The Magna Carta', 'The Bill of Rights', 'The Declaration of Independence'],
    correctIndex: 3,
    explanation: 'The Declaration of Independence, adopted on July 4, 1776, declared the 13 colonies free from British rule.',
    gradeLevel: 4,
    difficulty: 'medium',
  },
  {
    subject: 'history',
    question: 'What ancient civilization built the pyramids at Giza?',
    answers: ['Mesopotamians', 'Ancient Egyptians', 'Mayans', 'Romans'],
    correctIndex: 1,
    explanation: 'The Ancient Egyptians built the Giza pyramids around 2500 BC as tombs for their pharaohs.',
    gradeLevel: 4,
    difficulty: 'hard',
  },

  // ── Language ──────────────────────────────────────────────────────────────
  {
    subject: 'language',
    question: 'What is a synonym for "happy"?',
    answers: ['Sad', 'Joyful', 'Angry', 'Tired'],
    correctIndex: 1,
    explanation: '"Joyful" means feeling great happiness — it is a synonym for "happy".',
    gradeLevel: 2,
    difficulty: 'easy',
  },
  {
    subject: 'language',
    question: 'Which sentence uses correct punctuation?',
    answers: [
      'She went to the store',
      'She went to the store.',
      'she went to the store.',
      'She went, to the store',
    ],
    correctIndex: 1,
    explanation: 'A sentence starts with a capital letter and ends with a period.',
    gradeLevel: 2,
    difficulty: 'easy',
  },
  {
    subject: 'language',
    question: 'What is the plural of "mouse" (the animal)?',
    answers: ['Mouses', 'Meese', 'Mice', 'Mouse'],
    correctIndex: 2,
    explanation: '"Mice" is the irregular plural of "mouse". English has many irregular plurals.',
    gradeLevel: 3,
    difficulty: 'easy',
  },
  {
    subject: 'language',
    question: 'What is an antonym for "ancient"?',
    answers: ['Old', 'Modern', 'Historic', 'Aged'],
    correctIndex: 1,
    explanation: '"Modern" means current or new — the opposite of "ancient", which means very old.',
    gradeLevel: 4,
    difficulty: 'medium',
  },
  {
    subject: 'language',
    question: 'Which part of speech describes an action or state of being?',
    answers: ['Noun', 'Adjective', 'Verb', 'Adverb'],
    correctIndex: 2,
    explanation: 'A verb expresses an action (run, eat) or a state of being (is, was).',
    gradeLevel: 3,
    difficulty: 'medium',
  },
  {
    subject: 'language',
    question: 'What literary device compares two things using "like" or "as"?',
    answers: ['Metaphor', 'Simile', 'Alliteration', 'Hyperbole'],
    correctIndex: 1,
    explanation: 'A simile uses "like" or "as" to compare, e.g. "fast as lightning".',
    gradeLevel: 5,
    difficulty: 'hard',
  },
  {
    subject: 'language',
    question: 'What is the correct spelling of the word meaning "to postpone"?',
    answers: ['Defur', 'Deffur', 'Defer', 'Defurr'],
    correctIndex: 2,
    explanation: '"Defer" (d-e-f-e-r) means to put something off to a later time.',
    gradeLevel: 6,
    difficulty: 'hard',
  },
];

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export class QuestionEngine {
  /** All questions keyed by their assigned UUID. */
  private questions: Map<string, Question> = new Map();

  constructor() {
    // Assign stable UUIDs to every question at startup
    for (const raw of RAW_QUESTIONS) {
      const id = randomUUID();
      this.questions.set(id, { ...raw, id } as Question);
    }
  }

  // -------------------------------------------------------------------------
  // Retrieval
  // -------------------------------------------------------------------------

  /**
   * Return a random question matching the given subject and difficulty.
   * Falls back to just matching subject if no difficulty match is found.
   */
  getQuestion(subject: Subject, difficulty: Difficulty): Question | null {
    const pool = Array.from(this.questions.values()).filter(
      (q) => q.subject === subject && q.difficulty === difficulty,
    );

    if (pool.length === 0) {
      // Fall back to any question in the subject
      const fallback = Array.from(this.questions.values()).filter(
        (q) => q.subject === subject,
      );
      if (fallback.length === 0) return null;
      return fallback[Math.floor(Math.random() * fallback.length)];
    }

    return pool[Math.floor(Math.random() * pool.length)];
  }

  /**
   * Return the safe client-facing version of a question (no correct answer).
   */
  getClientQuestion(question: Question): ClientQuestion {
    return {
      id: question.id,
      subject: question.subject,
      question: question.question,
      answers: question.answers,
      difficulty: question.difficulty,
      timeLimit: ANSWER_TIME_LIMIT_SECONDS,
    };
  }

  /**
   * Look up a question by ID (used during answer validation).
   */
  getQuestionById(id: string): Question | undefined {
    return this.questions.get(id);
  }

  // -------------------------------------------------------------------------
  // Server-side validation
  // -------------------------------------------------------------------------

  /**
   * Validate a player's answer.  Returns whether they were correct along with
   * the explanation text.  The correct index is never sent to the client
   * through this path — only the boolean result and explanation.
   */
  validateAnswer(
    questionId: string,
    answerIndex: number,
  ): { correct: boolean; explanation: string } | null {
    const question = this.questions.get(questionId);
    if (!question) return null;

    const correct = answerIndex === question.correctIndex;
    return { correct, explanation: question.explanation };
  }
}
