/**
 * Math question bank — tagged with subcategories from curriculum.ts.
 * Imported and concatenated by QuestionEngine.  Server-side only.
 */

import { makeQ, type RawQuestion } from './util.js';

const q = makeQ('math');

export const MATH_QUESTIONS: RawQuestion[] = [
  // ── Counting & Place Value (K-2) ──────────────────────────────────────────
  q('math_counting', 0, 'easy', 'What number comes right after 7?', ['6', '8', '9', '10'], 1, 'Counting up: 7, then 8. Eight comes right after seven.'),
  q('math_counting', 0, 'easy', 'How many fingers are on two hands?', ['5', '8', '10', '12'], 2, 'Each hand has 5 fingers, and 5 + 5 = 10.'),
  q('math_counting', 1, 'easy', 'Which number is the biggest?', ['12', '21', '9', '15'], 1, '21 has 2 tens, more than 12 (1 ten), 15 (1 ten), or 9 (0 tens).'),
  q('math_counting', 1, 'medium', 'In the number 47, what does the 4 stand for?', ['4 ones', '4 tens', '4 hundreds', '4 sevens'], 1, 'The 4 is in the tens place, so it means 4 tens, or 40.'),
  q('math_counting', 2, 'medium', 'What number is 10 more than 63?', ['64', '53', '73', '83'], 2, 'Adding 10 raises the tens digit by one: 63 + 10 = 73.'),
  q('math_counting', 2, 'medium', 'Counting by 5s, what comes after 25?', ['26', '35', '30', '20'], 2, 'Counting by fives: 5, 10, 15, 20, 25, 30.'),

  // ── Addition & Subtraction (1-3) ──────────────────────────────────────────
  q('math_addsub', 1, 'easy', 'What is 4 + 3?', ['6', '7', '8', '5'], 1, '4 + 3 = 7. Count up three from four: 5, 6, 7.'),
  q('math_addsub', 1, 'easy', 'What is 9 − 5?', ['3', '5', '4', '6'], 2, '9 − 5 = 4. Take five away from nine and four are left.'),
  q('math_addsub', 2, 'easy', 'What is 8 + 7?', ['14', '15', '16', '13'], 1, '8 + 7 = 15. Think 8 + 2 = 10, then 10 + 5 = 15.'),
  q('math_addsub', 2, 'medium', 'What is 23 + 45?', ['58', '67', '68', '78'], 2, 'Add tens: 20 + 40 = 60. Add ones: 3 + 5 = 8. Total: 68.'),
  q('math_addsub', 3, 'medium', 'What is 52 − 27?', ['25', '35', '24', '15'], 0, '52 − 27: take 20 to get 32, then 7 more leaves 25.'),
  q('math_addsub', 3, 'hard', 'Maya had 64 marbles, gave away 18, then found 9 more. How many does she have?', ['46', '55', '54', '73'], 1, '64 − 18 = 46, then 46 + 9 = 55.'),

  // ── Multiplication & Division (2-5) ───────────────────────────────────────
  q('math_muldiv', 3, 'easy', 'What is 7 × 8?', ['54', '56', '63', '48'], 1, '7 × 8 = 56. You can think of it as 7 × 4 × 2 = 28 × 2 = 56.'),
  q('math_muldiv', 4, 'easy', 'What is 144 ÷ 12?', ['11', '13', '12', '10'], 2, '144 ÷ 12 = 12. The 12 times table: 12 × 12 = 144.'),
  q('math_muldiv', 2, 'easy', 'What is 3 × 4?', ['7', '12', '9', '16'], 1, '3 × 4 means 3 groups of 4: 4 + 4 + 4 = 12.'),
  q('math_muldiv', 3, 'medium', 'There are 6 bags with 9 apples in each. How many apples in all?', ['45', '54', '63', '15'], 1, '6 × 9 = 54 apples.'),
  q('math_muldiv', 4, 'medium', 'Which number is prime?', ['9', '15', '21', '17'], 3, 'A prime has only two factors: 1 and itself. 17 cannot be divided evenly by anything else.'),
  q('math_muldiv', 5, 'hard', 'What is 13 × 14?', ['172', '182', '192', '162'], 1, '13 × 14 = 13 × 10 + 13 × 4 = 130 + 52 = 182.'),

  // ── Fractions & Decimals (3-6) ────────────────────────────────────────────
  q('math_fractions', 3, 'easy', 'A pizza is cut into 4 equal slices and you eat 1. What fraction did you eat?', ['1/2', '1/3', '1/4', '4/1'], 2, 'One slice out of four equal slices is 1/4 of the pizza.'),
  q('math_fractions', 3, 'easy', 'Which fraction is bigger?', ['1/4', '1/2', '1/8', '1/10'], 1, '1/2 is the biggest — the smaller the bottom number, the bigger each piece.'),
  q('math_fractions', 4, 'medium', 'What is 1/4 + 2/4?', ['3/8', '3/4', '2/8', '1/2'], 1, 'Same denominators: add the tops. 1 + 2 = 3, so 3/4.'),
  q('math_fractions', 5, 'medium', 'What is 0.5 written as a fraction?', ['1/5', '5/100', '1/2', '2/5'], 2, '0.5 means five tenths, which simplifies to 1/2.'),
  q('math_fractions', 5, 'medium', 'What is 0.3 + 0.45?', ['0.48', '0.75', '0.35', '0.85'], 1, 'Line up the decimals: 0.30 + 0.45 = 0.75.'),
  q('math_fractions', 6, 'hard', 'What is 2/3 × 3/4?', ['6/7', '5/12', '1/2', '8/9'], 2, 'Multiply tops and bottoms: 6/12, which simplifies to 1/2.'),

  // ── Geometry & Measurement (2-8) ──────────────────────────────────────────
  q('math_geometry', 4, 'medium', 'If a rectangle has a length of 9 and a width of 5, what is its area?', ['28', '40', '45', '50'], 2, 'Area of a rectangle = length × width = 9 × 5 = 45.'),
  q('math_geometry', 2, 'easy', 'How many sides does a triangle have?', ['2', '3', '4', '5'], 1, 'A triangle always has exactly 3 sides and 3 corners.'),
  q('math_geometry', 3, 'easy', 'How many centimeters are in one meter?', ['10', '100', '1000', '50'], 1, 'One meter equals 100 centimeters — "centi" means one hundredth.'),
  q('math_geometry', 5, 'medium', 'A square has a perimeter of 36 cm. How long is each side?', ['6 cm', '9 cm', '12 cm', '18 cm'], 1, 'A square has 4 equal sides: 36 ÷ 4 = 9 cm.'),
  q('math_geometry', 7, 'hard', 'What is the sum of the interior angles of a triangle?', ['90°', '180°', '270°', '360°'], 1, 'The three angles of any triangle always add up to 180 degrees.'),
  q('math_geometry', 8, 'hard', 'A right triangle has legs of 3 and 4. How long is the hypotenuse?', ['5', '6', '7', '12'], 0, 'Pythagorean theorem: 3² + 4² = 9 + 16 = 25, and √25 = 5.'),

  // ── Ratios & Percents (5-8) ───────────────────────────────────────────────
  q('math_ratios', 6, 'medium', 'What is 15% of 200?', ['25', '30', '35', '40'], 1, '15% of 200 = 0.15 × 200 = 30.'),
  q('math_ratios', 5, 'easy', 'In a bag of 3 red and 6 blue marbles, what is the ratio of red to blue?', ['1:2', '2:1', '1:3', '3:1'], 0, '3 red to 6 blue simplifies to 1:2.'),
  q('math_ratios', 5, 'easy', 'What is 50% of 80?', ['20', '30', '40', '60'], 2, '50% means half, and half of 80 is 40.'),
  q('math_ratios', 6, 'medium', 'A recipe uses 2 cups of flour for 3 cups of milk. How much flour for 9 cups of milk?', ['4 cups', '6 cups', '8 cups', '3 cups'], 1, 'Milk tripled (3 → 9), so triple the flour: 2 × 3 = 6 cups.'),
  q('math_ratios', 7, 'hard', 'A $60 game is on sale for 25% off. What is the sale price?', ['$35', '$40', '$45', '$50'], 2, '25% of 60 is 15, so the price is 60 − 15 = $45.'),
  q('math_ratios', 8, 'hard', 'If 12 is 30% of a number, what is the number?', ['36', '40', '42', '48'], 1, 'Number = 12 ÷ 0.30 = 40.'),

  // ── Algebra (7-10) ────────────────────────────────────────────────────────
  q('math_algebra', 7, 'medium', 'Solve for x: 3x + 6 = 21', ['3', '4', '5', '6'], 2, '3x = 21 − 6 = 15, so x = 15 ÷ 3 = 5.'),
  q('math_algebra', 7, 'medium', 'What is the square root of 169?', ['11', '12', '13', '14'], 2, '13 × 13 = 169, so √169 = 13.'),
  q('math_algebra', 7, 'medium', 'What is the value of 2³ (2 to the power of 3)?', ['6', '9', '8', '12'], 2, '2³ means 2 × 2 × 2 = 4 × 2 = 8.'),
  q('math_algebra', 8, 'hard', 'Solve for x: 2(x − 4) = 10', ['7', '9', '3', '5'], 1, 'Divide both sides by 2: x − 4 = 5, so x = 9.'),
  q('math_algebra', 9, 'hard', 'Simplify: 3x + 2x − 4x', ['x', '5x', '9x', '−x'], 0, 'Combine like terms: 3 + 2 − 4 = 1, so the answer is 1x = x.'),
  q('math_algebra', 10, 'hard', 'Which is a solution of x² − 9 = 0?', ['x = 9', 'x = 3', 'x = 81', 'x = 0'], 1, 'x² = 9, so x = 3 or x = −3. Of the choices, x = 3 works.'),

  // ── Functions & Graphs (8-11) ─────────────────────────────────────────────
  q('math_functions', 8, 'medium', 'In y = 2x + 1, what is y when x = 3?', ['5', '6', '7', '8'], 2, 'Substitute: y = 2(3) + 1 = 7.'),
  q('math_functions', 8, 'medium', 'What is the slope of the line y = 5x − 2?', ['−2', '2', '5', '3'], 2, 'In y = mx + b form, the slope is m, which is 5.'),
  q('math_functions', 9, 'medium', 'Where does the line y = x + 4 cross the y-axis?', ['(0, 4)', '(4, 0)', '(0, −4)', '(1, 4)'], 0, 'The y-intercept is b = 4, at the point (0, 4).'),
  q('math_functions', 9, 'hard', 'If f(x) = x² + 1, what is f(4)?', ['9', '16', '17', '8'], 2, 'f(4) = 4² + 1 = 16 + 1 = 17.'),
  q('math_functions', 10, 'hard', 'What shape is the graph of y = x²?', ['A straight line', 'A circle', 'A parabola', 'A triangle'], 2, 'Quadratic functions graph as U-shaped curves called parabolas.'),
  q('math_functions', 11, 'hard', 'A line passes through (0, 2) and (2, 6). What is its slope?', ['1', '2', '3', '4'], 1, 'Slope = rise ÷ run = (6 − 2) ÷ (2 − 0) = 4 ÷ 2 = 2.'),

  // ── Trigonometry (9-12) ───────────────────────────────────────────────────
  q('math_trig', 9, 'medium', 'In a right triangle, sine of an angle equals which ratio?', ['adjacent/hypotenuse', 'opposite/hypotenuse', 'opposite/adjacent', 'hypotenuse/opposite'], 1, 'SOH: Sine = Opposite ÷ Hypotenuse.'),
  q('math_trig', 9, 'medium', 'Which side of a right triangle is the hypotenuse?', ['The shortest side', 'Either leg', 'The side opposite the right angle', 'The bottom side'], 2, 'The hypotenuse is the longest side, always across from the 90° angle.'),
  q('math_trig', 10, 'medium', 'What is cos(0°)?', ['0', '1', '−1', '1/2'], 1, 'The cosine of 0 degrees is 1.'),
  q('math_trig', 10, 'hard', 'What is sin(30°)?', ['1/2', '√3/2', '1', '√2/2'], 0, 'sin(30°) = 1/2 — one of the special angle values worth memorizing.'),
  q('math_trig', 11, 'hard', 'tan(θ) equals which ratio?', ['sin θ × cos θ', 'cos θ / sin θ', 'sin θ / cos θ', '1 / sin θ'], 2, 'Tangent is sine divided by cosine.'),
  q('math_trig', 12, 'hard', 'How many degrees are in π radians?', ['90°', '180°', '270°', '360°'], 1, 'π radians equals 180 degrees — half a full circle.'),

  // ── Statistics & Probability (6-12) ───────────────────────────────────────
  q('math_stats', 6, 'easy', 'What is the probability of flipping heads on a fair coin?', ['1/4', '1/3', '1/2', '1'], 2, 'A coin has two equally likely sides, so heads has a 1/2 chance.'),
  q('math_stats', 6, 'medium', 'What is the mean of 4, 6, and 8?', ['5', '6', '7', '8'], 1, 'Mean = (4 + 6 + 8) ÷ 3 = 18 ÷ 3 = 6.'),
  q('math_stats', 7, 'medium', 'What is the median of 3, 7, 9, 12, 15?', ['7', '9', '12', '15'], 1, 'The median is the middle value when sorted — here, 9.'),
  q('math_stats', 8, 'medium', 'What is the probability of rolling a 6 on a standard die?', ['1/2', '1/3', '1/6', '1/12'], 2, 'A die has 6 equally likely faces, so each face has a 1/6 chance.'),
  q('math_stats', 9, 'hard', 'In the data set 2, 2, 3, 5, 8, what is the mode?', ['2', '3', '5', '8'], 0, 'The mode is the value that appears most often — 2 appears twice.'),
  q('math_stats', 11, 'hard', 'Two coins are flipped. What is the probability both land heads?', ['1/2', '1/3', '1/4', '1/8'], 2, 'Each flip is 1/2, and independent events multiply: 1/2 × 1/2 = 1/4.'),

  // ── Pre-Calculus Basics (11-12) ───────────────────────────────────────────
  q('math_precalc', 11, 'medium', 'What is the next term in the geometric sequence 2, 6, 18, 54, ...?', ['108', '162', '216', '72'], 1, 'Each term is multiplied by 3: 54 × 3 = 162.'),
  q('math_precalc', 11, 'medium', 'What is log₁₀(1000)?', ['2', '3', '10', '100'], 1, '10³ = 1000, so the base-10 logarithm of 1000 is 3.'),
  q('math_precalc', 11, 'hard', 'What is the common difference of the arithmetic sequence 5, 9, 13, 17, ...?', ['3', '4', '5', '9'], 1, 'Each term increases by 4: 9 − 5 = 4.'),
  q('math_precalc', 12, 'hard', 'As x grows very large, what value does 1/x approach?', ['1', 'Infinity', '0', '−1'], 2, 'Dividing 1 by bigger and bigger numbers gets closer and closer to 0 — a limit.'),
  q('math_precalc', 12, 'hard', 'If f(x) = 2x and g(x) = x + 3, what is f(g(2))?', ['7', '10', '8', '12'], 1, 'g(2) = 5, then f(5) = 10. Composition works inside-out.'),
  q('math_precalc', 12, 'hard', 'What is 5! (5 factorial)?', ['25', '60', '120', '720'], 2, '5! = 5 × 4 × 3 × 2 × 1 = 120.'),
];
