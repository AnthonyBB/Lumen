/**
 * Science question bank — tagged with grade-level TOPIC ids from curriculum.ts.
 * Imported and concatenated by QuestionEngine.  Server-side only.
 *
 * SEED: 3 questions per topic (24 topics → 72 questions).
 * TODO: expand to 20+ per topic. Append below the matching topic header.
 */

import { makeQ, type RawQuestion } from './util.js';

const q = makeQ('science');

export const SCIENCE_QUESTIONS: RawQuestion[] = [
  // ── science_g1_t1 · Grade 1 · Living & Nonliving ────────────────────────────
  q('science_g1_t1', 1, 'easy', 'Which of these is a living thing?', ['A rock', 'A tree', 'A spoon', 'A cloud'], 1, 'A tree grows, needs water, and is alive.'),
  q('science_g1_t1', 1, 'easy', 'What do living things need to grow?', ['Food and water', 'Only sunlight', 'Nothing', 'Only air'], 0, 'Living things need food, water, and air.'),
  q('science_g1_t1', 1, 'medium', 'Which is NOT alive?', ['A puppy', 'A flower', 'A toy car', 'A fish'], 2, 'A toy car does not grow, eat, or breathe.'),

  // ── science_g1_t2 · Grade 1 · Weather & Seasons ─────────────────────────────
  q('science_g1_t2', 1, 'easy', 'Which season is the coldest?', ['Summer', 'Winter', 'Spring', 'Fall'], 1, 'Winter is the coldest season.'),
  q('science_g1_t2', 1, 'easy', 'What falls from clouds when it rains?', ['Snow', 'Water', 'Sand', 'Leaves'], 1, 'Rain is water that falls from clouds.'),
  q('science_g1_t2', 1, 'medium', 'What do we usually see in the sky on a sunny day?', ['The sun', 'The moon', 'Stars', 'Lightning'], 0, 'On a sunny day the sun shines in the sky.'),

  // ── science_g2_t1 · Grade 2 · Animals & Habitats ────────────────────────────
  q('science_g2_t1', 2, 'easy', 'Which animal lives in the ocean?', ['Lion', 'Dolphin', 'Eagle', 'Camel'], 1, 'Dolphins live in the ocean.'),
  q('science_g2_t1', 2, 'medium', 'What is a desert habitat like?', ['Cold and icy', 'Hot and dry', 'Wet and rainy', 'Underwater'], 1, 'Deserts are hot and dry with little rain.'),
  q('science_g2_t1', 2, 'medium', 'Which animal is a reptile?', ['Frog', 'Snake', 'Rabbit', 'Owl'], 1, 'Snakes are scaly, cold-blooded reptiles.'),

  // ── science_g2_t2 · Grade 2 · Plants & Life Cycles ──────────────────────────
  q('science_g2_t2', 2, 'easy', 'What do caterpillars turn into?', ['Bees', 'Spiders', 'Butterflies', 'Beetles'], 2, 'Caterpillars become butterflies — metamorphosis.'),
  q('science_g2_t2', 2, 'easy', 'What part of a plant takes in water from the soil?', ['Leaves', 'Flower', 'Roots', 'Stem'], 2, 'Roots absorb water from the soil.'),
  q('science_g2_t2', 2, 'medium', 'What does a seed need to grow?', ['Water and sunlight', 'Only darkness', 'Only rocks', 'Nothing'], 0, 'Seeds need water, sunlight, and soil to grow.'),

  // ── science_g3_t1 · Grade 3 · Forces & Motion ───────────────────────────────
  q('science_g3_t1', 3, 'easy', 'What force pulls objects toward the ground?', ['Magnetism', 'Gravity', 'Friction', 'Wind'], 1, 'Gravity pulls things down toward Earth.'),
  q('science_g3_t1', 3, 'medium', 'What force slows a ball rolling on grass?', ['Gravity', 'Friction', 'Magnetism', 'Sound'], 1, 'Friction between the ball and grass slows it.'),
  q('science_g3_t1', 3, 'medium', 'A push or a pull is called a:', ['Force', 'Speed', 'Mass', 'Weight'], 0, 'Pushes and pulls are forces.'),

  // ── science_g3_t2 · Grade 3 · Earth & Its Resources ─────────────────────────
  q('science_g3_t2', 3, 'easy', 'Which is a natural resource?', ['Plastic toy', 'Water', 'Television', 'Bicycle'], 1, 'Water is a natural resource from the Earth.'),
  q('science_g3_t2', 3, 'medium', 'What is soil mostly made of?', ['Plastic', 'Tiny bits of rock and matter', 'Metal', 'Glass'], 1, 'Soil is weathered rock mixed with organic matter.'),
  q('science_g3_t2', 3, 'medium', 'Which resource can run out if we use too much?', ['Sunlight', 'Coal', 'Wind', 'Moonlight'], 1, 'Coal is nonrenewable and can be used up.'),

  // ── science_g4_t1 · Grade 4 · Energy & Sound ────────────────────────────────
  q('science_g4_t1', 4, 'easy', 'Sound travels as:', ['Light', 'Vibrations', 'Heat', 'Color'], 1, 'Sound is vibrations moving through the air.'),
  q('science_g4_t1', 4, 'medium', 'Which travels faster?', ['Sound', 'Light', 'They are equal', 'Neither moves'], 1, 'Light travels much faster than sound.'),
  q('science_g4_t1', 4, 'medium', 'What lets us see objects?', ['Sound', 'Light', 'Wind', 'Gravity'], 1, 'Light reflects off objects into our eyes.'),

  // ── science_g4_t2 · Grade 4 · Ecosystems & Food Chains ──────────────────────
  q('science_g4_t2', 4, 'easy', 'In a food chain, where does energy start?', ['The sun', 'The soil', 'Predators', 'Decomposers'], 0, 'The sun provides energy that plants capture.'),
  q('science_g4_t2', 4, 'medium', 'An animal that eats only plants is a:', ['Carnivore', 'Herbivore', 'Omnivore', 'Producer'], 1, 'Herbivores eat only plants.'),
  q('science_g4_t2', 4, 'medium', 'What do decomposers do?', ['Hunt prey', 'Break down dead matter', 'Make sunlight', 'Drink water only'], 1, 'Decomposers recycle nutrients from dead matter.'),

  // ── science_g5_t1 · Grade 5 · Matter & Its States ───────────────────────────
  q('science_g5_t1', 5, 'easy', 'Which is a gas?', ['Ice', 'Water', 'Steam', 'Rock'], 2, 'Steam is water in its gas state.'),
  q('science_g5_t1', 5, 'medium', 'What happens to water when it freezes?', ['Becomes a gas', 'Becomes a solid', 'Disappears', 'Becomes warmer'], 1, 'Freezing turns liquid water into solid ice.'),
  q('science_g5_t1', 5, 'medium', 'A solid keeps its:', ['Shape', 'Temperature only', 'Color only', 'Nothing'], 0, 'Solids hold a fixed shape.'),

  // ── science_g5_t2 · Grade 5 · Earth & Space ─────────────────────────────────
  q('science_g5_t2', 5, 'easy', 'What is at the center of our solar system?', ['Earth', 'The Moon', 'The Sun', 'Mars'], 2, 'The Sun is at the center; planets orbit it.'),
  q('science_g5_t2', 5, 'medium', 'What causes day and night?', ['Earth spinning on its axis', 'The Sun moving', 'Clouds', 'The Moon'], 0, 'Earth rotates, bringing day then night.'),
  q('science_g5_t2', 5, 'medium', 'Which planet is known as the Red Planet?', ['Venus', 'Mars', 'Jupiter', 'Saturn'], 1, 'Mars looks red from its iron-rich dust.'),

  // ── science_g6_t1 · Grade 6 · Cells & Living Systems ────────────────────────
  q('science_g6_t1', 6, 'easy', 'What is the basic unit of life?', ['Atom', 'Cell', 'Organ', 'Molecule'], 1, 'The cell is the smallest unit of life.'),
  q('science_g6_t1', 6, 'medium', 'Which part controls the cell\'s activities?', ['Nucleus', 'Cell wall', 'Vacuole', 'Cytoplasm'], 0, 'The nucleus is the cell\'s control center.'),
  q('science_g6_t1', 6, 'medium', 'Plants make food through:', ['Respiration', 'Photosynthesis', 'Digestion', 'Evaporation'], 1, 'Photosynthesis uses sunlight to make food.'),

  // ── science_g6_t2 · Grade 6 · Weather & Climate ─────────────────────────────
  q('science_g6_t2', 6, 'easy', 'What instrument measures temperature?', ['Barometer', 'Thermometer', 'Anemometer', 'Ruler'], 1, 'A thermometer measures temperature.'),
  q('science_g6_t2', 6, 'medium', 'Weather is short-term; climate is:', ['The same thing', 'A long-term pattern', 'Only rain', 'Only wind'], 1, 'Climate is the long-term average of weather.'),
  q('science_g6_t2', 6, 'medium', 'What drives the water cycle?', ['Energy from the sun', 'Gravity only', 'Wind only', 'Moonlight'], 0, 'The sun evaporates water, driving the cycle.'),

  // ── science_g7_t1 · Grade 7 · Human Body Systems ────────────────────────────
  q('science_g7_t1', 7, 'easy', 'Which organ pumps blood?', ['Lungs', 'Heart', 'Stomach', 'Brain'], 1, 'The heart pumps blood through the body.'),
  q('science_g7_t1', 7, 'medium', 'Which system carries oxygen into the body?', ['Digestive', 'Respiratory', 'Skeletal', 'Muscular'], 1, 'The respiratory system brings in oxygen.'),
  q('science_g7_t1', 7, 'medium', 'What do the kidneys do?', ['Pump blood', 'Filter waste from blood', 'Digest food', 'Send signals'], 1, 'Kidneys filter waste to make urine.'),

  // ── science_g7_t2 · Grade 7 · Atoms & Elements ──────────────────────────────
  q('science_g7_t2', 7, 'easy', 'What is the smallest unit of an element?', ['Cell', 'Atom', 'Molecule', 'Compound'], 1, 'An atom is the smallest unit of an element.'),
  q('science_g7_t2', 7, 'medium', 'Which particle has a positive charge?', ['Electron', 'Proton', 'Neutron', 'Photon'], 1, 'Protons carry a positive charge.'),
  q('science_g7_t2', 7, 'medium', 'What does the periodic table organize?', ['Animals', 'Elements', 'Planets', 'Rocks'], 1, 'It organizes the chemical elements.'),

  // ── science_g8_t1 · Grade 8 · Forces & Newton\'s Laws ────────────────────────
  q('science_g8_t1', 8, 'easy', 'An object at rest stays at rest unless acted on by a:', ['Color', 'Force', 'Sound', 'Smell'], 1, 'Newton\'s first law: a force is needed to change motion.'),
  q('science_g8_t1', 8, 'medium', 'Newton\'s second law is written as:', ['F = ma', 'E = mc²', 'V = IR', 'a = F/t'], 0, 'Force equals mass times acceleration.'),
  q('science_g8_t1', 8, 'medium', 'For every action there is an equal and opposite:', ['Reaction', 'Distance', 'Mass', 'Charge'], 0, 'Newton\'s third law of motion.'),

  // ── science_g8_t2 · Grade 8 · Energy & Waves ────────────────────────────────
  q('science_g8_t2', 8, 'easy', 'Energy stored in a stretched spring is:', ['Kinetic', 'Potential', 'Thermal', 'Sound'], 1, 'Stored energy is potential energy.'),
  q('science_g8_t2', 8, 'medium', 'The number of waves passing per second is the:', ['Amplitude', 'Frequency', 'Wavelength', 'Speed'], 1, 'Frequency counts waves per second.'),
  q('science_g8_t2', 8, 'medium', 'Energy cannot be created or destroyed, only:', ['Transformed', 'Deleted', 'Doubled', 'Frozen'], 0, 'Conservation of energy: it transforms.'),

  // ── science_g9_t1 · Grade 9 · Biology Foundations ───────────────────────────
  q('science_g9_t1', 9, 'easy', 'Which molecule carries genetic information?', ['DNA', 'ATP', 'CO₂', 'H₂O'], 0, 'DNA stores genetic instructions.'),
  q('science_g9_t1', 9, 'medium', 'The powerhouse of the cell is the:', ['Nucleus', 'Mitochondria', 'Ribosome', 'Vacuole'], 1, 'Mitochondria produce energy (ATP).'),
  q('science_g9_t1', 9, 'medium', 'Organisms in a region plus their environment form an:', ['Ecosystem', 'Atom', 'Organ', 'Cell'], 0, 'An ecosystem includes living and nonliving parts.'),

  // ── science_g9_t2 · Grade 9 · Chemistry Basics ──────────────────────────────
  q('science_g9_t2', 9, 'easy', 'What is the chemical symbol for water?', ['CO₂', 'O₂', 'H₂O', 'NaCl'], 2, 'Water is H₂O — two hydrogen, one oxygen.'),
  q('science_g9_t2', 9, 'medium', 'A substance made of two or more elements bonded is a:', ['Mixture', 'Compound', 'Atom', 'Isotope'], 1, 'A compound has elements chemically bonded.'),
  q('science_g9_t2', 9, 'medium', 'Sand mixed with iron filings is a:', ['Compound', 'Mixture', 'Element', 'Solution'], 1, 'They are mixed but not chemically bonded.'),

  // ── science_g10_t1 · Grade 10 · Chemical Reactions ──────────────────────────
  q('science_g10_t1', 10, 'easy', 'In a chemical reaction, the starting substances are the:', ['Products', 'Reactants', 'Catalysts', 'Ions'], 1, 'Reactants are consumed to form products.'),
  q('science_g10_t1', 10, 'medium', 'Balancing equations preserves the:', ['Number of atoms', 'Color', 'Temperature', 'Volume'], 0, 'Mass is conserved, so atoms must balance.'),
  q('science_g10_t1', 10, 'medium', 'A reaction that releases heat is:', ['Endothermic', 'Exothermic', 'Neutral', 'Frozen'], 1, 'Exothermic reactions release heat.'),

  // ── science_g10_t2 · Grade 10 · Genetics & Heredity ─────────────────────────
  q('science_g10_t2', 10, 'easy', 'A gene is a section of:', ['Protein', 'DNA', 'Fat', 'Water'], 1, 'Genes are segments of DNA.'),
  q('science_g10_t2', 10, 'medium', 'An allele that masks another is called:', ['Recessive', 'Dominant', 'Neutral', 'Mutant'], 1, 'Dominant alleles mask recessive ones.'),
  q('science_g10_t2', 10, 'medium', 'A Punnett square is used to predict:', ['Weather', 'Offspring traits', 'Star paths', 'Reaction rates'], 1, 'It predicts the chances of inherited traits.'),

  // ── science_g11_t1 · Grade 11 · Physics: Mechanics ──────────────────────────
  q('science_g11_t1', 11, 'easy', 'Momentum is mass times:', ['Velocity', 'Time', 'Charge', 'Area'], 0, 'Momentum p = mass × velocity.'),
  q('science_g11_t1', 11, 'medium', 'Work equals force times:', ['Mass', 'Distance', 'Time', 'Speed'], 1, 'Work = force × distance.'),
  q('science_g11_t1', 11, 'hard', 'Kinetic energy depends on mass and:', ['Color', 'Velocity squared', 'Charge', 'Volume'], 1, 'KE = ½mv², depending on velocity squared.'),

  // ── science_g11_t2 · Grade 11 · Organic & Acids/Bases ───────────────────────
  q('science_g11_t2', 11, 'easy', 'Organic chemistry is the study of compounds containing:', ['Iron', 'Carbon', 'Gold', 'Helium'], 1, 'Organic compounds are built around carbon.'),
  q('science_g11_t2', 11, 'medium', 'A solution with pH 2 is:', ['Acidic', 'Basic', 'Neutral', 'Salt'], 0, 'pH below 7 is acidic.'),
  q('science_g11_t2', 11, 'medium', 'What is the pH of a neutral solution?', ['0', '7', '14', '1'], 1, 'Pure water is neutral at pH 7.'),

  // ── science_g12_t1 · Grade 12 · Physics: Electromagnetism ───────────────────
  q('science_g12_t1', 12, 'easy', 'Opposite electric charges:', ['Attract', 'Repel', 'Do nothing', 'Vanish'], 0, 'Opposite charges attract each other.'),
  q('science_g12_t1', 12, 'medium', "Ohm's law is written as:", ['V = IR', 'F = ma', 'E = mc²', 'P = mv'], 0, 'Voltage = current × resistance.'),
  q('science_g12_t1', 12, 'hard', 'Light is an example of a(n):', ['Sound wave', 'Electromagnetic wave', 'Water wave', 'Shock wave'], 1, 'Light is an electromagnetic wave.'),

  // ── science_g12_t2 · Grade 12 · Molecular Biology ───────────────────────────
  q('science_g12_t2', 12, 'easy', 'Proteins are built from:', ['Amino acids', 'Sugars', 'Fats', 'Minerals'], 0, 'Amino acids are the building blocks of proteins.'),
  q('science_g12_t2', 12, 'medium', 'Enzymes work by lowering the:', ['Temperature', 'Activation energy', 'Mass', 'pH always'], 1, 'Enzymes speed reactions by lowering activation energy.'),
  q('science_g12_t2', 12, 'hard', 'Messenger RNA carries instructions from DNA to the:', ['Nucleus', 'Ribosome', 'Membrane', 'Vacuole'], 1, 'mRNA delivers code to ribosomes for protein synthesis.'),
];
