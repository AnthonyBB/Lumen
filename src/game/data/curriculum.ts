/**
 * K-12 curriculum taxonomy — CLIENT COPY.
 *
 * KEEP IN SYNC with the server master copy: server/game/data/curriculum.ts
 * (same pattern as the equipment system's duplicated catalog).  The server
 * validates every subcategory id it receives, so a drifted client copy can
 * never grant access to anything — it would just show stale labels.
 *
 * Also provides a tag → subcategory mapping so the local question bank in
 * src/engine/questions/ (whose questions carry free-form `tags`) can be
 * filtered by curriculum subcategory in the ClassroomScene picker.
 */

import type { Subject, Question } from '../../engine/types'

export interface Subcategory {
  id: string            // e.g. 'math_fractions'
  subject: Subject
  name: string          // 'Fractions & Decimals'
  icon: string          // emoji
  description: string   // one kid-friendly sentence
  gradeMin: number      // 0 (K) .. 12
  gradeMax: number
}

export const CURRICULUM: Subcategory[] = [
  // ── Math ──────────────────────────────────────────────────────────────────
  { id: 'math_counting',  subject: 'math', name: 'Counting & Place Value',    icon: '🔢', description: 'Count, compare, and discover what each digit is worth.',       gradeMin: 0,  gradeMax: 2 },
  { id: 'math_addsub',    subject: 'math', name: 'Addition & Subtraction',    icon: '➕', description: 'Add things together and take them away like a number wizard.', gradeMin: 1,  gradeMax: 3 },
  { id: 'math_muldiv',    subject: 'math', name: 'Multiplication & Division', icon: '✖️', description: 'Master times tables and share numbers into equal groups.',     gradeMin: 2,  gradeMax: 5 },
  { id: 'math_fractions', subject: 'math', name: 'Fractions & Decimals',      icon: '🍕', description: 'Slice numbers into parts and work with pieces of a whole.',    gradeMin: 3,  gradeMax: 6 },
  { id: 'math_geometry',  subject: 'math', name: 'Geometry & Measurement',    icon: '📐', description: 'Explore shapes, angles, area, and how we measure the world.',  gradeMin: 2,  gradeMax: 8 },
  { id: 'math_ratios',    subject: 'math', name: 'Ratios & Percents',         icon: '⚖️', description: 'Compare amounts and figure out percentages like a pro.',       gradeMin: 5,  gradeMax: 8 },
  { id: 'math_algebra',   subject: 'math', name: 'Algebra',                   icon: '🧮', description: 'Solve for mystery numbers using equations and variables.',     gradeMin: 7,  gradeMax: 10 },
  { id: 'math_functions', subject: 'math', name: 'Functions & Graphs',        icon: '📈', description: 'See how numbers relate by drawing lines and curves.',          gradeMin: 8,  gradeMax: 11 },
  { id: 'math_trig',      subject: 'math', name: 'Trigonometry',              icon: '📏', description: 'Unlock the secrets of triangles, sines, and cosines.',         gradeMin: 9,  gradeMax: 12 },
  { id: 'math_stats',     subject: 'math', name: 'Statistics & Probability',  icon: '🎲', description: 'Predict chances and make sense of data like a scientist.',     gradeMin: 6,  gradeMax: 12 },
  { id: 'math_precalc',   subject: 'math', name: 'Pre-Calculus Basics',       icon: '♾️', description: 'Step into advanced math with sequences, limits, and logs.',    gradeMin: 11, gradeMax: 12 },

  // ── Science ───────────────────────────────────────────────────────────────
  { id: 'sci_animals',    subject: 'science', name: 'Animals & Habitats',     icon: '🐾', description: 'Meet amazing creatures and the places they call home.',            gradeMin: 0, gradeMax: 3 },
  { id: 'sci_plants',     subject: 'science', name: 'Plants & Ecosystems',    icon: '🌱', description: 'Learn how plants grow and how living things depend on each other.', gradeMin: 1, gradeMax: 5 },
  { id: 'sci_weather',    subject: 'science', name: 'Weather & Climate',      icon: '⛅', description: 'Discover what makes rain, wind, storms, and seasons.',             gradeMin: 0, gradeMax: 6 },
  { id: 'sci_space',      subject: 'science', name: 'Earth & Space',          icon: '🪐', description: 'Journey through planets, stars, and the layers of our Earth.',     gradeMin: 2, gradeMax: 8 },
  { id: 'sci_matter',     subject: 'science', name: 'Matter & Materials',     icon: '🧊', description: 'Find out what everything is made of — solids, liquids, and gases.', gradeMin: 3, gradeMax: 7 },
  { id: 'sci_forces',     subject: 'science', name: 'Forces & Motion',        icon: '🍎', description: 'Push, pull, and explore why things move the way they do.',         gradeMin: 4, gradeMax: 9 },
  { id: 'sci_energy',     subject: 'science', name: 'Energy & Electricity',   icon: '⚡', description: 'Power up your knowledge of light, heat, and circuits.',            gradeMin: 5, gradeMax: 10 },
  { id: 'sci_cells',      subject: 'science', name: 'Cells & Life Science',   icon: '🔬', description: 'Zoom in on cells, genes, and the building blocks of life.',        gradeMin: 6, gradeMax: 10 },
  { id: 'sci_chemistry',  subject: 'science', name: 'Chemistry',              icon: '⚗️', description: 'Mix it up with atoms, elements, and chemical reactions.',          gradeMin: 8, gradeMax: 12 },
  { id: 'sci_physics',    subject: 'science', name: 'Physics',                icon: '🧲', description: 'Explore the deep laws of motion, waves, and energy.',              gradeMin: 9, gradeMax: 12 },
  { id: 'sci_body',       subject: 'science', name: 'Human Body & Health',    icon: '🫀', description: 'Tour the incredible machine that is your own body.',               gradeMin: 2, gradeMax: 10 },

  // ── History ───────────────────────────────────────────────────────────────
  { id: 'hist_community', subject: 'history', name: 'Community & Citizenship', icon: '🏘️', description: 'Learn how neighborhoods, helpers, and good citizens work together.', gradeMin: 0, gradeMax: 3 },
  { id: 'hist_ancient',   subject: 'history', name: 'Ancient Civilizations',   icon: '🏛️', description: 'Travel back to Egypt, Greece, Rome, and other ancient worlds.',  gradeMin: 3, gradeMax: 7 },
  { id: 'hist_explorers', subject: 'history', name: 'World Explorers',         icon: '🧭', description: 'Sail with the brave explorers who mapped the globe.',            gradeMin: 4, gradeMax: 7 },
  { id: 'hist_american',  subject: 'history', name: 'American History',        icon: '🦅', description: 'Follow the story of the United States from colonies to today.',  gradeMin: 4, gradeMax: 11 },
  { id: 'hist_world',     subject: 'history', name: 'World History',           icon: '🌍', description: 'Discover the big events that shaped nations around the world.',  gradeMin: 6, gradeMax: 12 },
  { id: 'hist_geography', subject: 'history', name: 'Geography & Maps',        icon: '🗺️', description: 'Read maps and explore continents, oceans, and countries.',       gradeMin: 0, gradeMax: 8 },
  { id: 'hist_civics',    subject: 'history', name: 'Government & Civics',     icon: '🗳️', description: 'See how laws are made and how governments serve people.',        gradeMin: 5, gradeMax: 12 },
  { id: 'hist_economics', subject: 'history', name: 'Economics Basics',        icon: '💰', description: 'Understand money, trade, and how people buy and sell.',          gradeMin: 6, gradeMax: 12 },

  // ── Language ──────────────────────────────────────────────────────────────
  { id: 'lang_phonics',    subject: 'language', name: 'Phonics & Spelling',         icon: '🔤', description: 'Sound out letters and spell words like a champion.',        gradeMin: 0, gradeMax: 3 },
  { id: 'lang_vocabulary', subject: 'language', name: 'Vocabulary',                 icon: '📚', description: 'Grow your word power with synonyms, antonyms, and more.',    gradeMin: 0, gradeMax: 12 },
  { id: 'lang_grammar',    subject: 'language', name: 'Grammar & Punctuation',      icon: '✏️', description: 'Build strong sentences with the rules of great writing.',    gradeMin: 2, gradeMax: 10 },
  { id: 'lang_reading',    subject: 'language', name: 'Reading Comprehension',      icon: '📖', description: 'Read closely and find the meaning hidden in every passage.', gradeMin: 1, gradeMax: 12 },
  { id: 'lang_writing',    subject: 'language', name: 'Writing & Composition',      icon: '📝', description: 'Craft essays, stories, and paragraphs that shine.',          gradeMin: 3, gradeMax: 12 },
  { id: 'lang_literature', subject: 'language', name: 'Literature & Poetry',        icon: '🎭', description: 'Explore stories, poems, and the devices authors use.',       gradeMin: 5, gradeMax: 12 },
  { id: 'lang_roots',      subject: 'language', name: 'Roots, Prefixes & Suffixes', icon: '🌳', description: 'Crack the code of words by studying their building blocks.', gradeMin: 4, gradeMax: 9 },
]

/** Fast lookup: subcategory id → Subcategory. */
export const SUBCATEGORY_MAP: Record<string, Subcategory> = Object.fromEntries(
  CURRICULUM.map((s) => [s.id, s]),
)

/** Subcategories grouped by subject (for the picker UI). */
export const CURRICULUM_BY_SUBJECT: Record<Subject, Subcategory[]> = {
  math: CURRICULUM.filter((s) => s.subject === 'math'),
  science: CURRICULUM.filter((s) => s.subject === 'science'),
  history: CURRICULUM.filter((s) => s.subject === 'history'),
  language: CURRICULUM.filter((s) => s.subject === 'language'),
}

/** Format a grade range like "Grades K-2" or "Grades 9-12". */
export function gradeRangeLabel(s: Subcategory): string {
  const lo = s.gradeMin === 0 ? 'K' : String(s.gradeMin)
  return `Grades ${lo}-${s.gradeMax}`
}

// ---------------------------------------------------------------------------
// Tag → subcategory mapping for the local question bank (src/engine/questions/)
// ---------------------------------------------------------------------------

const TAG_TO_SUBCATEGORY: Record<string, string> = {
  // math
  'counting': 'math_counting', 'time': 'math_counting', 'patterns': 'math_counting',
  'addition': 'math_addsub', 'subtraction': 'math_addsub',
  'multiplication': 'math_muldiv', 'division': 'math_muldiv',
  'factors': 'math_muldiv', 'multiples': 'math_muldiv', 'primes': 'math_muldiv', 'number properties': 'math_muldiv',
  'fractions': 'math_fractions', 'decimals': 'math_fractions', 'ordering': 'math_fractions', 'simplification': 'math_fractions',
  'geometry': 'math_geometry', 'shapes': 'math_geometry', 'perimeter': 'math_geometry', 'area': 'math_geometry',
  'circles': 'math_geometry', 'Pythagoras': 'math_geometry', 'measurement': 'math_geometry',
  'ratios': 'math_ratios', 'percentages': 'math_ratios',
  'algebra': 'math_algebra', 'exponents': 'math_algebra', 'order of operations': 'math_algebra',
  'statistics': 'math_stats', 'mean': 'math_stats', 'probability': 'math_stats',
  // science
  'animals': 'sci_animals', 'insects': 'sci_animals', 'life cycles': 'sci_animals',
  'classification': 'sci_animals', 'food chains': 'sci_animals',
  'plants': 'sci_plants', 'photosynthesis': 'sci_plants', 'ecosystems': 'sci_plants', 'biomes': 'sci_plants',
  'weather': 'sci_weather', 'water cycle': 'sci_weather', 'atmosphere': 'sci_weather',
  'space': 'sci_space', 'solar system': 'sci_space', 'planets': 'sci_space', 'stars': 'sci_space',
  'earth science': 'sci_space', 'rocks': 'sci_space',
  'states of matter': 'sci_matter', 'matter': 'sci_matter', 'scientific method': 'sci_matter',
  'forces': 'sci_forces', 'motion': 'sci_forces',
  'energy': 'sci_energy', 'electricity': 'sci_energy', 'light': 'sci_energy', 'electromagnetic spectrum': 'sci_energy',
  'cell biology': 'sci_cells', 'genetics': 'sci_cells', 'life science': 'sci_cells',
  'chemistry': 'sci_chemistry', 'acids and bases': 'sci_chemistry', 'atomic structure': 'sci_chemistry',
  'reactions': 'sci_chemistry', 'gas laws': 'sci_chemistry',
  'physics': 'sci_physics',
  'human body': 'sci_body', 'gases': 'sci_body',
  // history
  'ancient civilizations': 'hist_ancient', 'landmarks': 'hist_ancient', 'culture': 'hist_ancient',
  'engineering': 'hist_ancient',
  'explorers': 'hist_explorers', 'exploration': 'hist_explorers', 'trade': 'hist_explorers',
  'world empires': 'hist_world', 'wars': 'hist_world', 'major events': 'hist_world',
  'revolutions': 'hist_world', 'cultural history': 'hist_world', 'historical figures': 'hist_world',
  'inventions': 'hist_world',
  'geography': 'hist_geography', 'timeline concepts': 'hist_geography',
  'law': 'hist_civics', 'government': 'hist_civics',
  'economy': 'hist_economics',
  // language
  'phonics': 'lang_phonics', 'rhyming': 'lang_phonics', 'syllables': 'lang_phonics', 'spelling': 'lang_phonics',
  'vocabulary': 'lang_vocabulary', 'synonyms': 'lang_vocabulary', 'antonyms': 'lang_vocabulary',
  'connotation': 'lang_vocabulary', 'semantics': 'lang_vocabulary', 'word choice': 'lang_vocabulary',
  'advanced vocabulary': 'lang_vocabulary',
  'grammar': 'lang_grammar', 'punctuation': 'lang_grammar', 'capitalization': 'lang_grammar',
  'parts of speech': 'lang_grammar', 'sentence structure': 'lang_grammar', 'plurals': 'lang_grammar',
  'reading comprehension': 'lang_reading',
  'writing': 'lang_writing', 'writing styles': 'lang_writing',
  'literary devices': 'lang_literature', 'figurative language': 'lang_literature', 'irony': 'lang_literature',
  'word roots': 'lang_roots', 'prefixes': 'lang_roots', 'suffixes': 'lang_roots', 'etymology': 'lang_roots',
}

/**
 * Best-fit subcategory for a local question, derived from its tags.
 * Returns undefined when no tag maps (such questions appear only in the
 * subject-wide pool fallback).
 */
export function questionSubcategory(q: Question): string | undefined {
  for (const tag of q.tags ?? []) {
    const sub = TAG_TO_SUBCATEGORY[tag]
    if (sub && SUBCATEGORY_MAP[sub].subject === q.subject) return sub
  }
  return undefined
}
