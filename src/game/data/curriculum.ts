/**
 * Grade-level curriculum — CLIENT COPY.
 *
 * Each subject (math, science, history, language) has exactly TWO topics at
 * every grade 1–12, giving 4 × 12 × 2 = 96 topics.  A topic is one subject at
 * one grade and is played as a 5-question quiz.
 *
 * Topic id format: `<subject>_g<grade>_t<n>`  e.g. 'math_g1_t1', 'science_g10_t2'.
 *
 * KEEP IN SYNC with the server master copy: server/game/data/curriculum.ts
 * (same pattern as the equipment system's duplicated catalog).  This client
 * copy carries only labels/icons/descriptions — never answers — so a drifted
 * copy can show stale text but can never grant access to anything (the server
 * validates every topic id and computes every reward).
 */

import type { Subject } from '../../engine/types'

export interface GradeTopic {
  id: string            // `<subject>_g<grade>_t<n>`
  subject: Subject
  grade: number         // 1 .. 12
  name: string
  icon: string          // emoji
  description: string   // one kid-friendly sentence
}

function topic(
  subject: Subject,
  grade: number,
  n: 1 | 2,
  name: string,
  icon: string,
  description: string,
): GradeTopic {
  return { id: `${subject}_g${grade}_t${n}`, subject, grade, name, icon, description }
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

  // ─── GEOGRAPHY ─────────────────────────────────────────────────────────────
  topic('geography', 1, 1, 'Map Basics', '🗺️', 'Read a map, use a compass rose, and find directions.'),
  topic('geography', 1, 2, 'Continents & Oceans', '🌊', 'Name the seven continents and five oceans of Earth.'),
  topic('geography', 2, 1, 'Land & Water Features', '⛰️', 'Identify mountains, rivers, lakes, islands, and plains.'),
  topic('geography', 2, 2, 'Neighborhoods & Communities', '🏘️', 'Compare urban, suburban, and rural communities.'),
  topic('geography', 3, 1, 'World Regions & Climates', '🌡️', 'Explore tropical, polar, and temperate climate zones.'),
  topic('geography', 3, 2, 'U.S. Geography Basics', '🦅', 'Find the 50 states, capital, and major U.S. features.'),
  topic('geography', 4, 1, 'North American Geography', '🍁', 'Explore Canada, Mexico, major rivers, and the Great Lakes.'),
  topic('geography', 4, 2, 'South American Geography', '🌿', 'Discover the Amazon, Andes, and countries of South America.'),
  topic('geography', 5, 1, 'European Geography', '🏰', 'Locate countries, capitals, rivers, and mountains of Europe.'),
  topic('geography', 5, 2, 'African Geography', '🐘', 'Explore the Sahara, Nile, and diverse countries of Africa.'),
  topic('geography', 6, 1, 'Asian Geography', '🏯', "Navigate Asia's countries, capitals, and landmark features."),
  topic('geography', 6, 2, 'Oceania & Polar Regions', '🐧', 'Explore Australia, Pacific Islands, and the polar extremes.'),
  topic('geography', 7, 1, 'Human Geography', '👥', 'Study how people settle, migrate, and shape the land.'),
  topic('geography', 7, 2, 'Economic Geography', '📦', 'Understand trade routes, natural resources, and development.'),
  topic('geography', 8, 1, 'Political Geography', '🌐', 'Examine nations, borders, and international organizations.'),
  topic('geography', 8, 2, 'Geographic Information Systems', '🛰️', 'Use GPS, satellite imagery, and GIS to map our world.'),
  topic('geography', 9, 1, 'Environmental Geography', '🌳', 'Analyze ecosystems, biomes, and human impact on nature.'),
  topic('geography', 9, 2, 'Cultural Geography', '🎎', 'Explore how culture, language, and religion shape places.'),
  topic('geography', 10, 1, 'Regional Studies: Americas', '🌎', 'Deep-dive into the economies and geographies of the Americas.'),
  topic('geography', 10, 2, 'Regional Studies: Europe & Asia', '🌏', 'Compare the EU, Eastern Europe, China, and South Asia.'),
  topic('geography', 11, 1, 'Physical Geography', '🌋', 'Study plate tectonics, earthquakes, and landform processes.'),
  topic('geography', 11, 2, 'Population & Migration', '📊', 'Analyze demographic trends and migration patterns.'),
  topic('geography', 12, 1, 'Global Issues & Sustainability', '♻️', 'Examine climate change, resource depletion, and solutions.'),
  topic('geography', 12, 2, 'Geographic Research Methods', '🔭', 'Apply fieldwork, data analysis, and cartography skills.'),

  // ─── TECHNOLOGY ────────────────────────────────────────────────────────────
  topic('technology', 1, 1, 'Computer Parts & Functions', '💻', 'Name the main parts of a computer and what each does.'),
  topic('technology', 1, 2, 'Digital Safety Basics', '🔒', 'Learn to stay safe online and protect personal information.'),
  topic('technology', 2, 1, 'Using a Computer', '🖱️', 'Practice clicking, typing, and saving files.'),
  topic('technology', 2, 2, 'Internet Basics', '🌐', 'Explore websites, browsers, and how the internet works.'),
  topic('technology', 3, 1, 'Research & Search Engines', '🔍', 'Search the web wisely and choose trustworthy sources.'),
  topic('technology', 3, 2, 'Coding Basics', '📝', 'Write your first sequences and loops in block coding.'),
  topic('technology', 4, 1, 'Algorithms & Problem Solving', '🤔', 'Break problems into steps and create flowcharts.'),
  topic('technology', 4, 2, 'Digital Citizenship', '🤝', 'Act responsibly online — copyright, netiquette, privacy.'),
  topic('technology', 5, 1, 'Programming Concepts', '⚙️', 'Use variables, conditionals, and functions in code.'),
  topic('technology', 5, 2, 'Data & Spreadsheets', '📈', 'Organize, sort, and chart data in a spreadsheet.'),
  topic('technology', 6, 1, 'Web Design Basics', '🖥️', 'Build simple pages with HTML and CSS.'),
  topic('technology', 6, 2, 'Cybersecurity Basics', '🛡️', 'Create strong passwords and recognize phishing attacks.'),
  topic('technology', 7, 1, 'Programming Logic', '🧩', 'Write loops, conditionals, and debug your programs.'),
  topic('technology', 7, 2, 'Networking Basics', '📡', 'Discover how the internet routes data using IP and packets.'),
  topic('technology', 8, 1, 'App & Software Development', '📱', 'Design interfaces and follow the software development cycle.'),
  topic('technology', 8, 2, 'Databases', '🗄️', 'Organize records in tables and run simple queries.'),
  topic('technology', 9, 1, 'Programming Fundamentals', '💾', 'Apply object-oriented concepts, functions, and libraries.'),
  topic('technology', 9, 2, 'Data Science Intro', '📉', 'Collect, clean, and visualize data to find patterns.'),
  topic('technology', 10, 1, 'Advanced Algorithms', '🏎️', 'Analyze sorting algorithms and computational complexity.'),
  topic('technology', 10, 2, 'Artificial Intelligence', '🤖', 'Explore machine learning, neural networks, and AI ethics.'),
  topic('technology', 11, 1, 'Computer Systems', '🖧', 'Understand hardware, operating systems, and memory.'),
  topic('technology', 11, 2, 'Software Engineering', '🔧', 'Apply SDLC, testing, and agile methods to real projects.'),
  topic('technology', 12, 1, 'Computer Science Theory', '∞', 'Study binary, logic gates, and computability limits.'),
  topic('technology', 12, 2, 'Technology & Ethics', '⚖️', 'Debate privacy, algorithmic bias, and societal impact.'),

  // ─── ARTS ──────────────────────────────────────────────────────────────────
  topic('arts', 1, 1, 'Colors & Visual Art Basics', '🎨', 'Mix primary colors and identify basic shapes in artwork.'),
  topic('arts', 1, 2, 'Music & Rhythm Basics', '🥁', 'Feel the beat, explore tempo, and discover loud and soft sounds.'),
  topic('arts', 2, 1, 'Elements of Art', '✏️', 'Explore line, shape, texture, form, and space in artwork.'),
  topic('arts', 2, 2, 'Melody & Harmony', '🎵', 'Listen for pitch, high and low sounds, and simple melodies.'),
  topic('arts', 3, 1, 'Art Techniques & Media', '🖌️', 'Try painting, drawing, and basic sculpture methods.'),
  topic('arts', 3, 2, 'Musical Instruments', '🎸', 'Meet the four instrument families: strings, woodwinds, brass, percussion.'),
  topic('arts', 4, 1, 'Principles of Design', '📐', 'Use balance, pattern, contrast, and emphasis in your art.'),
  topic('arts', 4, 2, 'Music History Intro', '🎼', 'Explore folk songs, spirituals, and early classical music.'),
  topic('arts', 5, 1, 'Art Styles & Movements', '🖼️', 'Discover realism, impressionism, and other art styles.'),
  topic('arts', 5, 2, 'Music Theory Basics', '🎹', 'Learn about scales, keys, time signatures, and notation.'),
  topic('arts', 6, 1, 'Renaissance Art', '🏛️', 'Explore perspective and the great masters of the Renaissance.'),
  topic('arts', 6, 2, 'World Music', '🌍', 'Hear the rhythms, instruments, and traditions of global music.'),
  topic('arts', 7, 1, 'American Art Movements', '🗽', 'Trace art from colonial times through Native American traditions.'),
  topic('arts', 7, 2, 'Jazz & Blues', '🎷', 'Discover the origins and legends of jazz and blues music.'),
  topic('arts', 8, 1, 'Modern Art Movements', '💡', 'Explore cubism, surrealism, and abstract expressionism.'),
  topic('arts', 8, 2, 'Classical Composers', '🎻', 'Meet Bach, Mozart, Beethoven, and other great composers.'),
  topic('arts', 9, 1, 'Art History: Ancient to Medieval', '🏺', 'Journey through Egyptian, Greek, Roman, and Byzantine art.'),
  topic('arts', 9, 2, 'Musical Forms & Genres', '🎭', 'Study the symphony, concerto, sonata, and opera.'),
  topic('arts', 10, 1, 'Impressionism & Post-Impressionism', '🌸', 'Analyze Monet, Van Gogh, Cézanne, and their innovations.'),
  topic('arts', 10, 2, '20th-Century Music', '🎤', 'Follow music from ragtime and swing to rock and pop.'),
  topic('arts', 11, 1, 'Contemporary & Digital Art', '📸', 'Examine street art, digital media, and modern installations.'),
  topic('arts', 11, 2, 'Music Analysis & Theory', '🎶', 'Analyze chord progressions, counterpoint, and musical structure.'),
  topic('arts', 12, 1, 'Art Criticism & Appreciation', '🔎', 'Apply formal analysis and critique methods to major works.'),
  topic('arts', 12, 2, 'Music Composition & Production', '🎙️', 'Arrange, record, and produce original music.'),

  // ─── HEALTH ────────────────────────────────────────────────────────────────
  topic('health', 1, 1, 'Healthy Habits', '🦷', 'Sleep, wash hands, brush teeth, and stay active every day.'),
  topic('health', 1, 2, 'Body Parts & Functions', '🫁', 'Name major body parts and what each one does.'),
  topic('health', 2, 1, 'Food & Nutrition Basics', '🥦', 'Explore the food groups and why vegetables and water matter.'),
  topic('health', 2, 2, 'Exercise & Movement', '🏃', 'Discover why staying active keeps your body strong.'),
  topic('health', 3, 1, 'Personal Safety', '🚦', 'Learn rules for staying safe with strangers and at home.'),
  topic('health', 3, 2, 'Emotional Health', '😊', 'Identify feelings and healthy ways to manage emotions.'),
  topic('health', 4, 1, 'Body Systems', '🫀', 'Tour the digestive, circulatory, and respiratory systems.'),
  topic('health', 4, 2, 'Healthy Relationships', '🤗', 'Build friendships based on respect, kindness, and boundaries.'),
  topic('health', 5, 1, 'Growth & Development', '📏', 'Understand the physical changes that come with growing up.'),
  topic('health', 5, 2, 'Mental Health Awareness', '🧠', 'Recognize stress and anxiety, and discover coping strategies.'),
  topic('health', 6, 1, 'Nutrition & Fitness', '🥗', 'Explore macronutrients, vitamins, and different exercise types.'),
  topic('health', 6, 2, 'Substance Awareness', '🚫', 'Learn how tobacco, alcohol, and drugs affect the body.'),
  topic('health', 7, 1, 'Disease & Prevention', '💉', 'Understand germs, vaccines, the immune system, and hygiene.'),
  topic('health', 7, 2, 'Health Resources', '🏥', 'Meet doctors, nurses, and health professionals and when to seek help.'),
  topic('health', 8, 1, 'First Aid & Safety', '🩹', 'Learn CPR basics, how to call for help, and wound care.'),
  topic('health', 8, 2, 'Stress Management', '🧘', 'Use exercise, sleep, and relaxation to manage daily stress.'),
  topic('health', 9, 1, 'Reproductive Health', '🔬', 'Study the reproductive system, disease prevention, and consent.'),
  topic('health', 9, 2, 'Community Health', '🏙️', 'Explore public health, sanitation, and disease control in society.'),
  topic('health', 10, 1, 'Nutrition Science', '⚗️', 'Analyze metabolism, macros, and how nutrients fuel the body.'),
  topic('health', 10, 2, 'Mental Health In-Depth', '💬', 'Understand depression, anxiety disorders, and available treatments.'),
  topic('health', 11, 1, 'Public Health', '🌐', 'Study epidemiology, health policy, and global disease patterns.'),
  topic('health', 11, 2, 'Environmental Health', '🌿', 'Examine how air, water, and chemical exposure affect health.'),
  topic('health', 12, 1, 'Health Policy & Advocacy', '📜', 'Compare healthcare systems and explore patient advocacy.'),
  topic('health', 12, 2, 'Lifelong Wellness', '🏅', 'Build habits that prevent chronic disease and support long-term health.'),
]

/** Fast lookup: topic id → GradeTopic. */
export const TOPIC_MAP: Record<string, GradeTopic> = Object.fromEntries(
  GRADE_TOPICS.map((t) => [t.id, t]),
)

/** Lookup of the two topics at a given (subject, grade). */
export const TOPICS_BY_SUBJECT_GRADE: Record<Subject, Record<number, GradeTopic[]>> = (() => {
  const out = { math: {}, science: {}, history: {}, language: {}, geography: {}, technology: {}, arts: {}, health: {} } as Record<
    Subject,
    Record<number, GradeTopic[]>
  >
  for (const t of GRADE_TOPICS) {
    ;(out[t.subject][t.grade] ??= []).push(t)
  }
  return out
})()

export const MIN_GRADE = 1
export const MAX_GRADE = 12
/** Sentinel grade meaning "all 12 grades complete". */
export const MASTERED_GRADE = 13
