/**
 * Math question bank — tagged with grade-level TOPIC ids from curriculum.ts.
 * Imported and concatenated by QuestionEngine.  Server-side only.
 *
 * SEED: 3 questions per topic (24 topics → 72 questions).
 * TODO: expand to 20+ per topic. Append below the matching topic header; the
 * `q(<topicId>, <grade>, ...)` signature must match the topic's id and grade.
 */

import { makeQ, type RawQuestion } from './util.js';

const q = makeQ('math');

export const MATH_QUESTIONS: RawQuestion[] = [
  // ── math_g1_t1 · Grade 1 · Counting to 100 ──────────────────────────────────
  q('math_g1_t1', 1, 'easy', 'What number comes right after 7?', ['6', '8', '9', '10'], 1, 'Counting up: 7, then 8.'),
  q('math_g1_t1', 1, 'easy', 'Which number is the biggest?', ['12', '21', '9', '15'], 1, '21 is the largest of these numbers.'),
  q('math_g1_t1', 1, 'medium', 'Counting by tens, what comes after 30?', ['31', '40', '35', '20'], 1, 'By tens: 10, 20, 30, 40.'),

  // ── math_g1_t2 · Grade 1 · Addition & Subtraction to 20 ──────────────────────
  q('math_g1_t2', 1, 'easy', 'What is 4 + 3?', ['6', '7', '8', '5'], 1, '4 + 3 = 7.'),
  q('math_g1_t2', 1, 'easy', 'What is 9 − 5?', ['3', '5', '4', '6'], 2, '9 − 5 = 4.'),
  q('math_g1_t2', 1, 'medium', 'What is 8 + 7?', ['14', '15', '16', '13'], 1, '8 + 7 = 15.'),

  // ── math_g2_t1 · Grade 2 · Place Value to 1,000 ─────────────────────────────
  q('math_g2_t1', 2, 'easy', 'In the number 47, what does the 4 stand for?', ['4 ones', '4 tens', '4 hundreds', '4 sevens'], 1, 'The 4 is in the tens place, so it means 40.'),
  q('math_g2_t1', 2, 'medium', 'What number is 10 more than 63?', ['64', '53', '73', '83'], 2, 'Adding 10 raises the tens digit: 63 + 10 = 73.'),
  q('math_g2_t1', 2, 'medium', 'How many tens are in 250?', ['2', '5', '25', '250'], 2, '250 = 25 tens (25 × 10 = 250).'),

  // ── math_g2_t2 · Grade 2 · Two-Digit Add & Subtract ─────────────────────────
  q('math_g2_t2', 2, 'easy', 'What is 23 + 45?', ['58', '67', '68', '78'], 2, '20 + 40 = 60, 3 + 5 = 8, total 68.'),
  q('math_g2_t2', 2, 'medium', 'What is 52 − 27?', ['25', '35', '24', '15'], 0, '52 − 27 = 25.'),
  q('math_g2_t2', 2, 'medium', 'What is 36 + 48?', ['74', '84', '94', '82'], 1, '36 + 48 = 84.'),

  // ── math_g3_t1 · Grade 3 · Multiplication Facts ─────────────────────────────
  q('math_g3_t1', 3, 'easy', 'What is 3 × 4?', ['7', '12', '9', '16'], 1, '3 groups of 4 = 12.'),
  q('math_g3_t1', 3, 'medium', 'What is 7 × 8?', ['54', '56', '63', '48'], 1, '7 × 8 = 56.'),
  q('math_g3_t1', 3, 'medium', 'What is 6 × 9?', ['45', '54', '63', '48'], 1, '6 × 9 = 54.'),

  // ── math_g3_t2 · Grade 3 · Division & Fractions ─────────────────────────────
  q('math_g3_t2', 3, 'easy', 'What is 12 ÷ 3?', ['3', '4', '5', '6'], 1, '12 ÷ 3 = 4.'),
  q('math_g3_t2', 3, 'easy', 'A pizza is cut into 4 equal slices and you eat 1. What fraction did you eat?', ['1/2', '1/3', '1/4', '4/1'], 2, 'One of four equal slices is 1/4.'),
  q('math_g3_t2', 3, 'medium', 'Which fraction is bigger?', ['1/4', '1/2', '1/8', '1/10'], 1, '1/2 is biggest — smaller bottom number means bigger pieces.'),

  // ── math_g4_t1 · Grade 4 · Multi-Digit Operations ───────────────────────────
  q('math_g4_t1', 4, 'medium', 'What is 144 ÷ 12?', ['11', '13', '12', '10'], 2, '12 × 12 = 144, so 144 ÷ 12 = 12.'),
  q('math_g4_t1', 4, 'medium', 'What is 23 × 4?', ['82', '92', '86', '96'], 1, '23 × 4 = 92.'),
  q('math_g4_t1', 4, 'hard', 'What is 13 × 14?', ['172', '182', '192', '162'], 1, '13 × 14 = 182.'),

  // ── math_g4_t2 · Grade 4 · Fractions & Decimals ─────────────────────────────
  q('math_g4_t2', 4, 'easy', 'What is 1/4 + 2/4?', ['3/8', '3/4', '2/8', '1/2'], 1, 'Same denominator: 1 + 2 = 3, so 3/4.'),
  q('math_g4_t2', 4, 'medium', 'What is 0.5 written as a fraction?', ['1/5', '5/100', '1/2', '2/5'], 2, '0.5 = five tenths = 1/2.'),
  q('math_g4_t2', 4, 'medium', 'Which decimal equals 3/10?', ['0.03', '0.3', '3.0', '0.13'], 1, '3/10 = 0.3.'),

  // ── math_g5_t1 · Grade 5 · Decimal Operations ───────────────────────────────
  q('math_g5_t1', 5, 'medium', 'What is 0.3 + 0.45?', ['0.48', '0.75', '0.35', '0.85'], 1, 'Line up: 0.30 + 0.45 = 0.75.'),
  q('math_g5_t1', 5, 'medium', 'What is 2.5 × 4?', ['8', '10', '9', '12'], 1, '2.5 × 4 = 10.'),
  q('math_g5_t1', 5, 'hard', 'What is 6.4 ÷ 8?', ['0.8', '0.08', '8', '0.6'], 0, '6.4 ÷ 8 = 0.8.'),

  // ── math_g5_t2 · Grade 5 · Fraction Operations ──────────────────────────────
  q('math_g5_t2', 5, 'medium', 'What is 1/2 + 1/3?', ['2/5', '5/6', '1/6', '2/6'], 1, 'Common denominator 6: 3/6 + 2/6 = 5/6.'),
  q('math_g5_t2', 5, 'hard', 'What is 2/3 × 3/4?', ['6/7', '5/12', '1/2', '8/9'], 2, '6/12 simplifies to 1/2.'),
  q('math_g5_t2', 5, 'medium', 'What is 3/4 − 1/4?', ['1/4', '1/2', '2/4', '1'], 1, '3/4 − 1/4 = 2/4 = 1/2.'),

  // ── math_g6_t1 · Grade 6 · Ratios & Rates ───────────────────────────────────
  q('math_g6_t1', 6, 'easy', 'In a bag of 3 red and 6 blue marbles, what is the ratio of red to blue?', ['1:2', '2:1', '1:3', '3:1'], 0, '3:6 simplifies to 1:2.'),
  q('math_g6_t1', 6, 'medium', 'A car travels 120 miles in 2 hours. What is its speed?', ['40 mph', '60 mph', '80 mph', '120 mph'], 1, '120 ÷ 2 = 60 miles per hour.'),
  q('math_g6_t1', 6, 'medium', 'A recipe uses 2 cups flour per 3 cups milk. How much flour for 9 cups milk?', ['4 cups', '6 cups', '8 cups', '3 cups'], 1, 'Milk tripled, so flour tripled: 6 cups.'),

  // ── math_g6_t2 · Grade 6 · Percents & Negatives ─────────────────────────────
  q('math_g6_t2', 6, 'easy', 'What is 50% of 80?', ['20', '30', '40', '60'], 2, '50% is half of 80 = 40.'),
  q('math_g6_t2', 6, 'medium', 'What is 15% of 200?', ['25', '30', '35', '40'], 1, '0.15 × 200 = 30.'),
  q('math_g6_t2', 6, 'medium', 'What is −5 + 8?', ['−3', '3', '13', '−13'], 1, '−5 + 8 = 3.'),

  // ── math_g7_t1 · Grade 7 · Ratios & Proportions ─────────────────────────────
  q('math_g7_t1', 7, 'medium', 'If 12 is 30% of a number, what is the number?', ['36', '40', '42', '48'], 1, '12 ÷ 0.30 = 40.'),
  q('math_g7_t1', 7, 'hard', 'A $60 game is 25% off. What is the sale price?', ['$35', '$40', '$45', '$50'], 2, '25% of 60 = 15, so 60 − 15 = $45.'),
  q('math_g7_t1', 7, 'medium', 'Solve the proportion: 2/5 = x/20', ['4', '8', '10', '40'], 1, '20 ÷ 5 = 4, then 2 × 4 = 8.'),

  // ── math_g7_t2 · Grade 7 · Integers & Expressions ───────────────────────────
  q('math_g7_t2', 7, 'easy', 'What is −6 − 4?', ['−10', '−2', '2', '10'], 0, 'Going more negative: −6 − 4 = −10.'),
  q('math_g7_t2', 7, 'medium', 'Simplify: 3x + 2x', ['5', '5x', '6x', 'x'], 1, 'Combine like terms: 3x + 2x = 5x.'),
  q('math_g7_t2', 7, 'medium', 'What is −3 × 4?', ['−12', '12', '−7', '7'], 0, 'A negative times a positive is negative: −12.'),

  // ── math_g8_t1 · Grade 8 · Linear Equations ─────────────────────────────────
  q('math_g8_t1', 8, 'medium', 'Solve for x: 3x + 6 = 21', ['3', '4', '5', '6'], 2, '3x = 15, so x = 5.'),
  q('math_g8_t1', 8, 'medium', 'What is the slope of the line y = 5x − 2?', ['−2', '2', '5', '3'], 2, 'In y = mx + b, slope m = 5.'),
  q('math_g8_t1', 8, 'hard', 'Solve for x: 2(x − 4) = 10', ['7', '9', '3', '5'], 1, 'x − 4 = 5, so x = 9.'),

  // ── math_g8_t2 · Grade 8 · Exponents & Roots ────────────────────────────────
  q('math_g8_t2', 8, 'easy', 'What is 2³?', ['6', '9', '8', '12'], 2, '2 × 2 × 2 = 8.'),
  q('math_g8_t2', 8, 'medium', 'What is the square root of 169?', ['11', '12', '13', '14'], 2, '13 × 13 = 169.'),
  q('math_g8_t2', 8, 'hard', 'Write 5,000 in scientific notation.', ['5 × 10²', '5 × 10³', '5 × 10⁴', '50 × 10²'], 1, '5,000 = 5 × 1000 = 5 × 10³.'),

  // ── math_g9_t1 · Grade 9 · Algebra I Foundations ────────────────────────────
  q('math_g9_t1', 9, 'medium', 'If f(x) = 2x + 1, what is f(3)?', ['5', '6', '7', '8'], 2, 'f(3) = 2(3) + 1 = 7.'),
  q('math_g9_t1', 9, 'medium', 'A line passes through (0, 2) and (2, 6). What is its slope?', ['1', '2', '3', '4'], 1, '(6 − 2) ÷ (2 − 0) = 2.'),
  q('math_g9_t1', 9, 'hard', 'Simplify: 3x + 2x − 4x', ['x', '5x', '9x', '−x'], 0, '3 + 2 − 4 = 1, so x.'),

  // ── math_g9_t2 · Grade 9 · Quadratics ───────────────────────────────────────
  q('math_g9_t2', 9, 'medium', 'Which is a solution of x² − 9 = 0?', ['x = 9', 'x = 3', 'x = 81', 'x = 0'], 1, 'x² = 9, so x = 3 (or −3).'),
  q('math_g9_t2', 9, 'hard', 'Factor: x² + 5x + 6', ['(x+2)(x+3)', '(x+1)(x+6)', '(x+5)(x+1)', '(x+2)(x+4)'], 0, '2 × 3 = 6 and 2 + 3 = 5.'),
  q('math_g9_t2', 9, 'medium', 'What shape is the graph of y = x²?', ['A line', 'A circle', 'A parabola', 'A triangle'], 2, 'Quadratics graph as parabolas.'),

  // ── math_g10_t1 · Grade 10 · Geometry & Proofs ──────────────────────────────
  q('math_g10_t1', 10, 'easy', 'What is the sum of the interior angles of a triangle?', ['90°', '180°', '270°', '360°'], 1, 'They always add to 180°.'),
  q('math_g10_t1', 10, 'medium', 'A rectangle is 9 by 5. What is its area?', ['28', '40', '45', '50'], 2, 'Area = 9 × 5 = 45.'),
  q('math_g10_t1', 10, 'hard', 'Two triangles with equal corresponding angles are always:', ['Congruent', 'Similar', 'Equal in area', 'Right triangles'], 1, 'Equal angles guarantee similarity, not congruence.'),

  // ── math_g10_t2 · Grade 10 · Right-Triangle Trig ────────────────────────────
  q('math_g10_t2', 10, 'easy', 'A right triangle has legs 3 and 4. How long is the hypotenuse?', ['5', '6', '7', '12'], 0, '3² + 4² = 25, √25 = 5.'),
  q('math_g10_t2', 10, 'medium', 'In a right triangle, sine equals which ratio?', ['adjacent/hypotenuse', 'opposite/hypotenuse', 'opposite/adjacent', 'hypotenuse/opposite'], 1, 'SOH: sine = opposite ÷ hypotenuse.'),
  q('math_g10_t2', 10, 'hard', 'What is sin(30°)?', ['1/2', '√3/2', '1', '√2/2'], 0, 'sin(30°) = 1/2.'),

  // ── math_g11_t1 · Grade 11 · Algebra II ─────────────────────────────────────
  q('math_g11_t1', 11, 'medium', 'What is log₁₀(1000)?', ['2', '3', '10', '100'], 1, '10³ = 1000, so log = 3.'),
  q('math_g11_t1', 11, 'hard', 'What is i² (i = √−1)?', ['1', '−1', 'i', '0'], 1, 'By definition i² = −1.'),
  q('math_g11_t1', 11, 'medium', 'What is the degree of 4x³ + 2x − 7?', ['1', '2', '3', '4'], 2, 'The highest exponent is 3.'),

  // ── math_g11_t2 · Grade 11 · Trigonometry ───────────────────────────────────
  q('math_g11_t2', 11, 'medium', 'How many degrees are in π radians?', ['90°', '180°', '270°', '360°'], 1, 'π radians = 180°.'),
  q('math_g11_t2', 11, 'medium', 'tan(θ) equals which ratio?', ['sin θ × cos θ', 'cos θ / sin θ', 'sin θ / cos θ', '1 / sin θ'], 2, 'Tangent = sine ÷ cosine.'),
  q('math_g11_t2', 11, 'hard', 'What is cos(0°)?', ['0', '1', '−1', '1/2'], 1, 'cos(0°) = 1.'),

  // ── math_g12_t1 · Grade 12 · Pre-Calculus ───────────────────────────────────
  q('math_g12_t1', 12, 'medium', 'What is the next term in 2, 6, 18, 54, ...?', ['108', '162', '216', '72'], 1, 'Multiply by 3: 54 × 3 = 162.'),
  q('math_g12_t1', 12, 'hard', 'As x grows very large, 1/x approaches:', ['1', 'Infinity', '0', '−1'], 2, 'The limit of 1/x is 0.'),
  q('math_g12_t1', 12, 'hard', 'What is 5! (5 factorial)?', ['25', '60', '120', '720'], 2, '5 × 4 × 3 × 2 × 1 = 120.'),

  // ── math_g12_t2 · Grade 12 · Intro to Calculus ──────────────────────────────
  q('math_g12_t2', 12, 'medium', 'The derivative measures a function\'s:', ['Area', 'Rate of change', 'Average', 'Maximum'], 1, 'A derivative is an instantaneous rate of change.'),
  q('math_g12_t2', 12, 'hard', 'What is the derivative of x²?', ['x', '2x', 'x²', '2'], 1, 'd/dx(x²) = 2x by the power rule.'),
  q('math_g12_t2', 12, 'hard', 'The integral of a function gives the:', ['Slope', 'Area under the curve', 'Tangent line', 'Vertex'], 1, 'A definite integral is the area under the curve.'),
];
