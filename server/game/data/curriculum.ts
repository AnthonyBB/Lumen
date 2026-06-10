/**
 * Grade-level curriculum — the per-subject, grade-by-grade progression system.
 *
 * Each of the four learning subjects (math, science, history, language) has
 * exactly TWO topics at every grade 1–12, giving 4 × 12 × 2 = 96 topics.
 * A topic is one subject at one grade; players play it as a 5-question quiz.
 *
 * Topic id format (STABLE — content question banks rely on it):
 *     <subject>_g<grade>_t<n>     e.g. 'math_g1_t1', 'science_g10_t2'
 *
 * Question banks in server/game/data/questions/ tag every question with one of
 * these topic ids.
 *
 * KEEP IN SYNC with the client copy: src/game/data/curriculum.ts
 * (the client duplicates this catalog — names/icons/descriptions only, never
 * answers — for its classroom UI).
 */

import type { Subject } from '../../types/index.js';

export interface GradeTopic {
  /** Stable id, format `<subject>_g<grade>_t<n>` (n = 1 | 2). */
  id: string;
  subject: Subject;
  grade: number;         // 1 .. 12
  name: string;          // 'Addition & Subtraction to 20'
  icon: string;          // emoji
  description: string;   // one kid-friendly sentence
}

/**
 * Authoring helper — keeps the catalog below compact and the id scheme
 * impossible to typo.  Two calls per (subject, grade).
 */
function topic(
  subject: Subject,
  grade: number,
  n: 1 | 2,
  name: string,
  icon: string,
  description: string,
): GradeTopic {
  return { id: `${subject}_g${grade}_t${n}`, subject, grade, name, icon, description };
}

export const GRADE_TOPICS: GradeTopic[] = [
  // ─── MATH ──────────────────────────────────────────────────────────────────
  topic('math', 1, 1, 'Counting to 100', '🔢', 'Count, order, and compare numbers all the way to one hundred.'),
  topic('math', 1, 2, 'Addition & Subtraction to 20', '➕', 'Add and take away small numbers up to twenty.'),
  topic('math', 2, 1, 'Place Value to 1,000', '💯', 'See what each digit is worth in hundreds, tens, and ones.'),
  topic('math', 2, 2, 'Two-Digit Add & Subtract', '➖', 'Add and subtract bigger numbers with regrouping.'),
  topic('math', 3, 1, 'Multiplication Facts', '✖️', 'Master your times tables up to ten times ten.'),
  topic('math', 3, 2, 'Division & Fractions', '🍕', 'Share into equal groups and meet your first fractions.'),
  topic('math', 4, 1, 'Multi-Digit Operations', '🧮', 'Multiply and divide larger numbers with confidence.'),
  topic('math', 4, 2, 'Fractions & Decimals', '🔟', 'Compare fractions and the decimals that match them.'),
  topic('math', 5, 1, 'Decimal Operations', '📊', 'Add, subtract, multiply, and divide with decimals.'),
  topic('math', 5, 2, 'Fraction Operations', '🥧', 'Add, subtract, and multiply fractions like a pro.'),
  topic('math', 6, 1, 'Ratios & Rates', '⚖️', 'Compare amounts using ratios, rates, and unit pricing.'),
  topic('math', 6, 2, 'Percents & Negatives', '➗', 'Work with percentages and numbers below zero.'),
  topic('math', 7, 1, 'Ratios & Proportions', '📐', 'Solve proportions and scale quantities up or down.'),
  topic('math', 7, 2, 'Integers & Expressions', '🧾', 'Combine signed numbers and simplify expressions.'),
  topic('math', 8, 1, 'Linear Equations', '📈', 'Solve equations and graph straight lines.'),
  topic('math', 8, 2, 'Exponents & Roots', '√', 'Use powers, scientific notation, and square roots.'),
  topic('math', 9, 1, 'Algebra I Foundations', '𝑥', 'Master functions, slope, and systems of equations.'),
  topic('math', 9, 2, 'Quadratics', '⤴️', 'Factor and solve quadratic equations and parabolas.'),
  topic('math', 10, 1, 'Geometry & Proofs', '📏', 'Reason about shapes, congruence, and similarity.'),
  topic('math', 10, 2, 'Right-Triangle Trig', '🔺', 'Use sine, cosine, and the Pythagorean theorem.'),
  topic('math', 11, 1, 'Algebra II', '🧠', 'Explore polynomials, logarithms, and complex numbers.'),
  topic('math', 11, 2, 'Trigonometry', '🌀', 'Work with the unit circle, radians, and identities.'),
  topic('math', 12, 1, 'Pre-Calculus', '♾️', 'Tackle sequences, limits, and advanced functions.'),
  topic('math', 12, 2, 'Intro to Calculus', '∫', 'Meet derivatives, rates of change, and the integral.'),

  // ─── SCIENCE ───────────────────────────────────────────────────────────────
  topic('science', 1, 1, 'Living & Nonliving', '🌱', 'Tell apart things that are alive from things that are not.'),
  topic('science', 1, 2, 'Weather & Seasons', '⛅', 'Discover sun, rain, wind, and the changing seasons.'),
  topic('science', 2, 1, 'Animals & Habitats', '🐾', 'Meet creatures and the homes where they live.'),
  topic('science', 2, 2, 'Plants & Life Cycles', '🌻', 'Watch how plants and animals grow and change.'),
  topic('science', 3, 1, 'Forces & Motion', '🏃', 'Push, pull, and explore why things move.'),
  topic('science', 3, 2, 'Earth & Its Resources', '🪨', 'Learn about rocks, soil, water, and natural resources.'),
  topic('science', 4, 1, 'Energy & Sound', '🔊', 'Explore light, heat, and how sound travels.'),
  topic('science', 4, 2, 'Ecosystems & Food Chains', '🦌', 'See how living things depend on one another.'),
  topic('science', 5, 1, 'Matter & Its States', '🧊', 'Investigate solids, liquids, gases, and changes.'),
  topic('science', 5, 2, 'Earth & Space', '🪐', 'Journey through planets, the moon, and the stars.'),
  topic('science', 6, 1, 'Cells & Living Systems', '🔬', 'Zoom in on the cells that build every living thing.'),
  topic('science', 6, 2, 'Weather & Climate', '🌦️', 'Understand what drives weather and Earth’s climate.'),
  topic('science', 7, 1, 'Human Body Systems', '🫀', 'Tour the systems that keep your body running.'),
  topic('science', 7, 2, 'Atoms & Elements', '⚛️', 'Discover atoms, elements, and the periodic table.'),
  topic('science', 8, 1, 'Forces & Newton’s Laws', '🍎', 'Apply the laws that govern motion and gravity.'),
  topic('science', 8, 2, 'Energy & Waves', '🌊', 'Explore energy transfer, light, and wave behavior.'),
  topic('science', 9, 1, 'Biology Foundations', '🧫', 'Study cells, ecology, and the web of life.'),
  topic('science', 9, 2, 'Chemistry Basics', '⚗️', 'Mix it up with bonds, mixtures, and reactions.'),
  topic('science', 10, 1, 'Chemical Reactions', '🧪', 'Balance equations and track what reactions produce.'),
  topic('science', 10, 2, 'Genetics & Heredity', '🧬', 'Crack the code of DNA, genes, and inheritance.'),
  topic('science', 11, 1, 'Physics: Mechanics', '🧲', 'Analyze motion, forces, energy, and momentum.'),
  topic('science', 11, 2, 'Organic & Acids/Bases', '🧴', 'Explore carbon chemistry and the pH scale.'),
  topic('science', 12, 1, 'Physics: Electromagnetism', '⚡', 'Master circuits, fields, and electromagnetic waves.'),
  topic('science', 12, 2, 'Molecular Biology', '🧯', 'Dive into proteins, enzymes, and cellular machinery.'),

  // ─── HISTORY ───────────────────────────────────────────────────────────────
  topic('history', 1, 1, 'My Community', '🏘️', 'Meet the helpers and places in your neighborhood.'),
  topic('history', 1, 2, 'Then & Now', '🕰️', 'See how everyday life has changed over time.'),
  topic('history', 2, 1, 'Maps & Globes', '🗺️', 'Read maps and find places on a globe.'),
  topic('history', 2, 2, 'Good Citizens', '🤝', 'Learn the rules and rights that help people live together.'),
  topic('history', 3, 1, 'Communities Around the World', '🌐', 'Compare how people live in different places.'),
  topic('history', 3, 2, 'Local & National Heroes', '🦸', 'Honor leaders and heroes who shaped our story.'),
  topic('history', 4, 1, 'U.S. Regions & Geography', '🏞️', 'Explore the landscapes and regions of the country.'),
  topic('history', 4, 2, 'Native Peoples & Settlers', '🪶', 'Discover early peoples and the first settlers.'),
  topic('history', 5, 1, 'Colonial America', '⛵', 'Walk through the founding of the American colonies.'),
  topic('history', 5, 2, 'American Revolution', '🦅', 'Follow the fight for independence and a new nation.'),
  topic('history', 6, 1, 'Ancient Civilizations', '🏛️', 'Travel to Egypt, Mesopotamia, and the early world.'),
  topic('history', 6, 2, 'Greece & Rome', '🏺', 'Discover the ideas and empires of Greece and Rome.'),
  topic('history', 7, 1, 'The Middle Ages', '🏰', 'Explore feudal life, kingdoms, and the medieval world.'),
  topic('history', 7, 2, 'Renaissance & Exploration', '🧭', 'Sail with explorers and the rebirth of learning.'),
  topic('history', 8, 1, 'U.S. Constitution & Civics', '🗳️', 'Understand how American government was built and works.'),
  topic('history', 8, 2, 'Civil War & Reconstruction', '⚔️', 'Study the war that tested and reshaped the nation.'),
  topic('history', 9, 1, 'World History: Revolutions', '🔥', 'Trace the revolutions that remade the modern world.'),
  topic('history', 9, 2, 'Industrial Age', '🏭', 'See how industry transformed work and society.'),
  topic('history', 10, 1, 'World Wars', '🌍', 'Examine the causes and impact of two global wars.'),
  topic('history', 10, 2, 'Cold War & Modern Era', '🛰️', 'Follow the tensions and changes after 1945.'),
  topic('history', 11, 1, 'U.S. History in Depth', '📜', 'Connect the major eras of the American experience.'),
  topic('history', 11, 2, 'Government & Economics', '💰', 'Analyze how government and economies steer nations.'),
  topic('history', 12, 1, 'Modern World History', '🗞️', 'Study globalization and the contemporary world.'),
  topic('history', 12, 2, 'Civics & Global Issues', '🕊️', 'Wrestle with rights, policy, and global challenges.'),

  // ─── LANGUAGE ──────────────────────────────────────────────────────────────
  topic('language', 1, 1, 'Phonics & Sounds', '🔤', 'Sound out letters and blend them into words.'),
  topic('language', 1, 2, 'Sight Words & Reading', '📖', 'Recognize common words and read simple sentences.'),
  topic('language', 2, 1, 'Spelling Patterns', '✏️', 'Spell words using common patterns and rules.'),
  topic('language', 2, 2, 'Sentences & Reading', '📚', 'Build complete sentences and understand short stories.'),
  topic('language', 3, 1, 'Parts of Speech', '🧩', 'Name nouns, verbs, adjectives, and more.'),
  topic('language', 3, 2, 'Reading Comprehension', '🔍', 'Find the main idea and details in a passage.'),
  topic('language', 4, 1, 'Grammar & Punctuation', '✒️', 'Punctuate and structure sentences correctly.'),
  topic('language', 4, 2, 'Vocabulary & Context', '💬', 'Grow your words and learn meaning from context.'),
  topic('language', 5, 1, 'Writing Paragraphs', '📝', 'Organize ideas into clear, focused paragraphs.'),
  topic('language', 5, 2, 'Roots, Prefixes & Suffixes', '🌳', 'Crack words apart to discover their meaning.'),
  topic('language', 6, 1, 'Figurative Language', '🎭', 'Spot similes, metaphors, and vivid imagery.'),
  topic('language', 6, 2, 'Essay Writing', '🖊️', 'Plan and write organized multi-paragraph essays.'),
  topic('language', 7, 1, 'Literary Elements', '📕', 'Analyze plot, character, theme, and setting.'),
  topic('language', 7, 2, 'Grammar Mastery', '🪶', 'Refine clauses, phrases, and tricky grammar.'),
  topic('language', 8, 1, 'Theme & Author’s Craft', '✍️', 'Interpret theme and how authors create effect.'),
  topic('language', 8, 2, 'Persuasive Writing', '📣', 'Build convincing arguments with evidence.'),
  topic('language', 9, 1, 'Literary Analysis', '🎓', 'Read closely and support claims with text.'),
  topic('language', 9, 2, 'Argumentative Essays', '⚖️', 'Construct and defend strong written arguments.'),
  topic('language', 10, 1, 'World & Classic Literature', '🏛️', 'Explore enduring works from around the world.'),
  topic('language', 10, 2, 'Rhetoric & Style', '🎙️', 'Study rhetorical devices and effective style.'),
  topic('language', 11, 1, 'American Literature', '🗽', 'Read defining voices of American writing.'),
  topic('language', 11, 2, 'Research & Synthesis', '📑', 'Gather sources and synthesize them in writing.'),
  topic('language', 12, 1, 'British & World Literature', '👑', 'Engage with major works of the literary canon.'),
  topic('language', 12, 2, 'Composition & Analysis', '📔', 'Write and analyze at a college-ready level.'),
];

/** Fast lookup: topic id → GradeTopic.  Used to validate client-sent ids. */
export const TOPIC_MAP: Record<string, GradeTopic> = Object.fromEntries(
  GRADE_TOPICS.map((t) => [t.id, t]),
);

/**
 * Lookup of the two topics at a given (subject, grade):
 *     TOPICS_BY_SUBJECT_GRADE[subject][grade] → [GradeTopic, GradeTopic]
 */
export const TOPICS_BY_SUBJECT_GRADE: Record<Subject, Record<number, GradeTopic[]>> = (() => {
  const out = { math: {}, science: {}, history: {}, language: {} } as Record<
    Subject,
    Record<number, GradeTopic[]>
  >;
  for (const t of GRADE_TOPICS) {
    (out[t.subject][t.grade] ??= []).push(t);
  }
  return out;
})();

/** Lowest and highest playable grades, plus the "mastered" sentinel. */
export const MIN_GRADE = 1;
export const MAX_GRADE = 12;
/** Sentinel grade meaning "all 12 grades complete" — no further topics. */
export const MASTERED_GRADE = 13;
