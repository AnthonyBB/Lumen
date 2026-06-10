/**
 * Science question bank — tagged with subcategories from curriculum.ts.
 * Imported and concatenated by QuestionEngine.  Server-side only.
 */

import { makeQ, type RawQuestion } from './util.js';

const q = makeQ('science');

export const SCIENCE_QUESTIONS: RawQuestion[] = [
  // ── Animals & Habitats (K-3) ──────────────────────────────────────────────
  q('sci_animals', 0, 'easy', 'Which animal lives in the ocean?', ['Lion', 'Dolphin', 'Eagle', 'Camel'], 1, 'Dolphins are ocean mammals — they swim but breathe air.'),
  q('sci_animals', 1, 'easy', 'What do caterpillars turn into?', ['Bees', 'Spiders', 'Butterflies', 'Beetles'], 2, 'Caterpillars form a chrysalis and emerge as butterflies — metamorphosis!'),
  q('sci_animals', 1, 'easy', 'Which animal is a reptile?', ['Frog', 'Snake', 'Rabbit', 'Owl'], 1, 'Snakes are reptiles: scaly skin and cold-blooded. Frogs are amphibians.'),
  q('sci_animals', 2, 'medium', 'What is a desert habitat like?', ['Cold and icy', 'Hot and dry', 'Wet and rainy', 'Deep underwater'], 1, 'Deserts get very little rain and are usually hot and dry.'),
  q('sci_animals', 2, 'medium', 'Which animal hibernates through winter?', ['Bear', 'Wolf', 'Deer', 'Hawk'], 0, 'Bears sleep through winter in dens to save energy when food is scarce.'),
  q('sci_animals', 3, 'medium', 'What do we call animals that eat only plants?', ['Carnivores', 'Omnivores', 'Herbivores', 'Predators'], 2, 'Herbivores, like rabbits and deer, eat only plants.'),

  // ── Plants & Ecosystems (1-5) ─────────────────────────────────────────────
  q('sci_plants', 4, 'easy', 'What gas do plants absorb from the air during photosynthesis?', ['Oxygen', 'Nitrogen', 'Carbon Dioxide', 'Hydrogen'], 2, 'Plants take in carbon dioxide (CO₂) and use sunlight to convert it into glucose and oxygen.'),
  q('sci_plants', 1, 'easy', 'What do seeds need to start growing?', ['Water and warmth', 'Wind and snow', 'Sand and rocks', 'Darkness and ice'], 0, 'Seeds sprout when they have water, warmth, and air.'),
  q('sci_plants', 2, 'easy', 'Which part of a plant takes in water from the soil?', ['Leaves', 'Flowers', 'Roots', 'Petals'], 2, 'Roots anchor the plant and absorb water and nutrients from the soil.'),
  q('sci_plants', 3, 'medium', 'In a food chain, what do we call animals that eat other animals?', ['Producers', 'Predators', 'Plants', 'Prey'], 1, 'Predators hunt and eat other animals, which are their prey.'),
  q('sci_plants', 4, 'medium', 'What is the first link in most food chains?', ['Fish', 'Insects', 'Plants', 'Birds'], 2, 'Plants are producers — they make their own food from sunlight and feed everything else.'),
  q('sci_plants', 5, 'hard', 'What do we call all the living and nonliving things interacting in one area?', ['A herd', 'An ecosystem', 'A colony', 'A biosphere'], 1, 'An ecosystem includes the plants, animals, water, soil, and climate of an area working together.'),

  // ── Weather & Climate (K-6) ───────────────────────────────────────────────
  q('sci_weather', 0, 'easy', 'What falls from clouds when it rains?', ['Sand', 'Water', 'Leaves', 'Dust'], 1, 'Rain is water droplets falling from clouds.'),
  q('sci_weather', 1, 'easy', 'What do we use to measure temperature?', ['A ruler', 'A clock', 'A thermometer', 'A scale'], 2, 'A thermometer measures how hot or cold something is.'),
  q('sci_weather', 2, 'easy', 'In which season do leaves usually fall from trees?', ['Spring', 'Summer', 'Autumn', 'Winter'], 2, 'In autumn (fall), many trees drop their leaves to get ready for winter.'),
  q('sci_weather', 4, 'medium', 'What is it called when water vapor in the air turns into liquid drops?', ['Evaporation', 'Condensation', 'Precipitation', 'Collection'], 1, 'Condensation is vapor cooling into liquid — that is how clouds form.'),
  q('sci_weather', 5, 'medium', 'Which cloud type usually brings thunderstorms?', ['Cirrus', 'Stratus', 'Cumulonimbus', 'Fog'], 2, 'Tall, towering cumulonimbus clouds produce thunder, lightning, and heavy rain.'),
  q('sci_weather', 6, 'hard', 'What is the difference between weather and climate?', ['They are the same', 'Weather is daily; climate is the long-term pattern', 'Climate changes hourly', 'Weather only happens in summer'], 1, 'Weather is what happens day to day; climate is the average pattern over many years.'),

  // ── Earth & Space (2-8) ───────────────────────────────────────────────────
  q('sci_space', 3, 'easy', 'What planet is closest to the Sun?', ['Venus', 'Earth', 'Mars', 'Mercury'], 3, 'Mercury is the closest planet to the Sun in our solar system.'),
  q('sci_space', 6, 'medium', 'Which layer of the Earth is the thickest?', ['Crust', 'Outer Core', 'Inner Core', 'Mantle'], 3, 'The mantle is about 2,900 km thick — the thickest layer of the Earth.'),
  q('sci_space', 2, 'easy', 'What lights up the sky during the day?', ['The Moon', 'The Sun', 'Stars', 'Clouds'], 1, 'The Sun is our star — its light makes daytime bright.'),
  q('sci_space', 4, 'medium', 'How long does Earth take to orbit the Sun once?', ['One day', 'One month', 'One year', 'One week'], 2, 'Earth completes one trip around the Sun every year (about 365 days).'),
  q('sci_space', 6, 'medium', 'What causes the Moon to shine?', ['It burns like the Sun', 'It reflects sunlight', 'Electric storms', 'City lights'], 1, 'The Moon makes no light of its own — it reflects light from the Sun.'),
  q('sci_space', 8, 'hard', 'What type of rock forms when lava cools and hardens?', ['Sedimentary', 'Metamorphic', 'Igneous', 'Fossil'], 2, 'Igneous rock forms from cooled magma or lava — like basalt and granite.'),

  // ── Matter & Materials (3-7) ──────────────────────────────────────────────
  q('sci_matter', 4, 'easy', 'What is the chemical symbol for water?', ['WO', 'HO', 'H₂O', 'W₂O'], 2, 'Water is made of two hydrogen atoms and one oxygen atom: H₂O.'),
  q('sci_matter', 3, 'easy', 'Which of these is a solid?', ['Milk', 'Steam', 'Ice', 'Juice'], 2, 'Ice is frozen water — a solid with a fixed shape.'),
  q('sci_matter', 3, 'easy', 'What are the three common states of matter?', ['Hot, cold, warm', 'Solid, liquid, gas', 'Rock, water, air', 'Big, medium, small'], 1, 'Matter commonly exists as solid, liquid, or gas.'),
  q('sci_matter', 5, 'medium', 'What happens to water when it boils?', ['It becomes a solid', 'It becomes a gas', 'It disappears forever', 'It becomes heavier'], 1, 'Boiling water turns into water vapor, a gas. The water is still there, just invisible.'),
  q('sci_matter', 6, 'medium', 'Which is a physical change, not a chemical change?', ['Burning wood', 'Rusting iron', 'Melting ice', 'Baking a cake'], 2, 'Melting only changes the state — the ice is still water. Burning and rusting create new substances.'),
  q('sci_matter', 7, 'hard', 'What is the smallest particle of an element that keeps its properties?', ['A cell', 'A molecule', 'An atom', 'A grain'], 2, 'Atoms are the basic building blocks of all matter.'),

  // ── Forces & Motion (4-9) ─────────────────────────────────────────────────
  q('sci_forces', 5, 'medium', 'What force keeps planets in orbit around the Sun?', ['Magnetism', 'Gravity', 'Friction', 'Electricity'], 1, 'Gravity is the attractive force between objects with mass that keeps planets orbiting the Sun.'),
  q('sci_forces', 4, 'easy', 'What force slows a ball rolling across the grass?', ['Gravity', 'Friction', 'Magnetism', 'Sound'], 1, 'Friction between the ball and the grass rubs against the motion and slows it down.'),
  q('sci_forces', 4, 'easy', 'Which force pulls objects toward the ground?', ['Friction', 'Wind', 'Gravity', 'Heat'], 2, 'Gravity pulls everything toward Earth’s center — that is why dropped things fall.'),
  q('sci_forces', 6, 'medium', 'What unit do scientists use to measure force?', ['Watts', 'Newtons', 'Liters', 'Volts'], 1, 'Force is measured in newtons (N), named after Isaac Newton.'),
  q('sci_forces', 8, 'hard', 'According to Newton’s third law, every action has...', ['A bigger reaction', 'An equal and opposite reaction', 'No reaction', 'A delayed reaction'], 1, 'Newton’s third law: forces come in equal and opposite pairs.'),
  q('sci_forces', 9, 'hard', 'A car travels 100 km in 2 hours. What is its average speed?', ['25 km/h', '50 km/h', '100 km/h', '200 km/h'], 1, 'Speed = distance ÷ time = 100 ÷ 2 = 50 km/h.'),

  // ── Energy & Electricity (5-10) ───────────────────────────────────────────
  q('sci_energy', 5, 'easy', 'Which of these is a source of renewable energy?', ['Coal', 'Oil', 'Sunlight', 'Natural gas'], 2, 'Sunlight never runs out — solar power is renewable energy.'),
  q('sci_energy', 5, 'easy', 'What kind of energy does a stretched rubber band store?', ['Sound energy', 'Stored (potential) energy', 'Light energy', 'Heat only'], 1, 'A stretched band stores elastic potential energy, released when you let go.'),
  q('sci_energy', 6, 'medium', 'What must a circuit be for electricity to flow?', ['Open', 'Closed', 'Wet', 'Painted'], 1, 'Current only flows around a complete, closed loop.'),
  q('sci_energy', 7, 'medium', 'Which material is a good conductor of electricity?', ['Rubber', 'Glass', 'Copper', 'Wood'], 2, 'Metals like copper let electricity flow easily — that is why wires are made of it.'),
  q('sci_energy', 9, 'hard', 'A ball at the top of a hill has mostly which kind of energy?', ['Kinetic', 'Potential', 'Sound', 'Chemical'], 1, 'Height gives it gravitational potential energy, which becomes kinetic as it rolls down.'),
  q('sci_energy', 10, 'hard', 'What does the law of conservation of energy state?', ['Energy can be destroyed', 'Energy cannot be created or destroyed, only changed in form', 'Energy always increases', 'Energy only comes from the Sun'], 1, 'Energy transforms between forms, but the total amount stays the same.'),

  // ── Cells & Life Science (6-10) ───────────────────────────────────────────
  q('sci_cells', 7, 'medium', 'What is the powerhouse of the cell?', ['Nucleus', 'Ribosome', 'Mitochondria', 'Vacuole'], 2, 'Mitochondria produce ATP energy through cellular respiration, earning the nickname "powerhouse of the cell".'),
  q('sci_cells', 6, 'easy', 'What is the basic unit of all living things?', ['The atom', 'The cell', 'The organ', 'The bone'], 1, 'All living things are made of one or more cells.'),
  q('sci_cells', 6, 'medium', 'Which part of the cell holds its genetic instructions (DNA)?', ['Cell wall', 'Nucleus', 'Cytoplasm', 'Membrane'], 1, 'The nucleus is the control center that stores DNA.'),
  q('sci_cells', 7, 'medium', 'Which structure do plant cells have that animal cells lack?', ['Nucleus', 'Cell wall', 'Cytoplasm', 'Mitochondria'], 1, 'Plant cells have a stiff cell wall (and chloroplasts) that animal cells do not.'),
  q('sci_cells', 9, 'hard', 'What molecule carries genetic information in nearly all living things?', ['ATP', 'RNA only', 'DNA', 'Glucose'], 2, 'DNA (deoxyribonucleic acid) stores the genetic code passed from parents to offspring.'),
  q('sci_cells', 10, 'hard', 'What process do cells use to divide into two identical cells?', ['Photosynthesis', 'Mitosis', 'Digestion', 'Osmosis'], 1, 'Mitosis copies the cell’s DNA and splits it into two identical daughter cells.'),

  // ── Chemistry (8-12) ──────────────────────────────────────────────────────
  q('sci_chemistry', 8, 'medium', 'What is the chemical symbol for gold?', ['Go', 'Gd', 'Au', 'Ag'], 2, 'Gold is Au, from its Latin name "aurum". Silver is Ag.'),
  q('sci_chemistry', 8, 'medium', 'What particle in an atom has a positive charge?', ['Electron', 'Neutron', 'Proton', 'Photon'], 2, 'Protons are positive, electrons negative, and neutrons neutral.'),
  q('sci_chemistry', 9, 'medium', 'What does the pH scale measure?', ['Temperature', 'How acidic or basic a solution is', 'Density', 'Color'], 1, 'pH below 7 is acidic, 7 is neutral, above 7 is basic (alkaline).'),
  q('sci_chemistry', 10, 'hard', 'What is the atomic number of an element equal to?', ['Its number of neutrons', 'Its number of protons', 'Its mass', 'Its number of shells'], 1, 'The atomic number counts the protons — it defines which element it is.'),
  q('sci_chemistry', 11, 'hard', 'In the reaction 2H₂ + O₂ → 2H₂O, what are H₂ and O₂ called?', ['Products', 'Reactants', 'Catalysts', 'Solutions'], 1, 'The substances on the left that get used up are the reactants; H₂O is the product.'),
  q('sci_chemistry', 12, 'hard', 'What kind of bond forms when atoms share electrons?', ['Ionic bond', 'Covalent bond', 'Magnetic bond', 'Metallic bond'], 1, 'Covalent bonds share electron pairs; ionic bonds transfer electrons.'),

  // ── Physics (9-12) ────────────────────────────────────────────────────────
  q('sci_physics', 9, 'medium', 'What is the speed of light in a vacuum (approximately)?', ['300,000 km/s', '3,000 km/s', '300 km/s', '30,000 km/s'], 0, 'Light travels at about 300,000 kilometers per second — nature’s speed limit.'),
  q('sci_physics', 9, 'medium', 'Sound travels fastest through which material?', ['Air', 'Water', 'Steel', 'A vacuum'], 2, 'Sound moves fastest through solids like steel; it cannot travel through a vacuum at all.'),
  q('sci_physics', 10, 'medium', 'What does Newton’s second law say force equals?', ['Mass × acceleration', 'Mass ÷ speed', 'Weight × height', 'Speed × time'], 0, 'F = ma: force equals mass times acceleration.'),
  q('sci_physics', 10, 'hard', 'Which color of visible light has the longest wavelength?', ['Blue', 'Green', 'Violet', 'Red'], 3, 'Red light has the longest visible wavelength; violet has the shortest.'),
  q('sci_physics', 11, 'hard', 'What unit measures electrical resistance?', ['Volt', 'Ampere', 'Ohm', 'Joule'], 2, 'Resistance is measured in ohms (Ω); V = IR relates volts, amps, and ohms.'),
  q('sci_physics', 12, 'hard', 'What is the kinetic energy formula?', ['KE = mgh', 'KE = ½mv²', 'KE = mv', 'KE = m²v'], 1, 'Kinetic energy is one-half mass times velocity squared.'),

  // ── Human Body & Health (2-10) ────────────────────────────────────────────
  q('sci_body', 5, 'medium', 'How many bones are in an adult human body?', ['196', '206', '216', '226'], 1, 'An adult human body has 206 bones. Babies are born with about 270.'),
  q('sci_body', 2, 'easy', 'Which organ pumps blood around your body?', ['The brain', 'The lungs', 'The heart', 'The stomach'], 2, 'Your heart is a muscle that pumps blood to every part of your body.'),
  q('sci_body', 3, 'easy', 'What do your lungs help you do?', ['Digest food', 'Breathe', 'See', 'Hear'], 1, 'Lungs take in oxygen from the air and release carbon dioxide.'),
  q('sci_body', 6, 'medium', 'Which body system includes the brain, spinal cord, and nerves?', ['Digestive system', 'Nervous system', 'Skeletal system', 'Circulatory system'], 1, 'The nervous system carries electrical messages that control the body.'),
  q('sci_body', 8, 'hard', 'What do red blood cells carry to the body’s tissues?', ['Carbon dioxide only', 'Oxygen', 'Food', 'Water only'], 1, 'Red blood cells use hemoglobin to carry oxygen from the lungs to your tissues.'),
  q('sci_body', 10, 'hard', 'Which organ filters waste from the blood to make urine?', ['The liver', 'The kidneys', 'The pancreas', 'The spleen'], 1, 'The two kidneys filter blood and remove waste as urine.'),
];
