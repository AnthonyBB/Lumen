/**
 * History question bank — tagged with grade-level TOPIC ids from curriculum.ts.
 * Imported and concatenated by QuestionEngine.  Server-side only.
 *
 * SEED: 3 questions per topic (24 topics → 72 questions).
 * TODO: expand to 20+ per topic. Append below the matching topic header.
 */

import { makeQ, type RawQuestion } from './util.js';

const q = makeQ('history');

export const HISTORY_QUESTIONS: RawQuestion[] = [
  // ── history_g1_t1 · Grade 1 · My Community ───────────────────────────────────
  q('history_g1_t1', 1, 'easy', 'Who helps put out fires?', ['Bakers', 'Firefighters', 'Painters', 'Singers'], 1, 'Firefighters put out fires and rescue people.'),
  q('history_g1_t1', 1, 'easy', 'Where do people borrow books?', ['The bank', 'The library', 'The bakery', 'The gym'], 1, 'A library lends books to the community.'),
  q('history_g1_t1', 1, 'medium', 'Who delivers letters to homes?', ['A teacher', 'A mail carrier', 'A doctor', 'A pilot'], 1, 'A mail carrier delivers letters and packages.'),

  // ── history_g1_t2 · Grade 1 · Then & Now ─────────────────────────────────────
  q('history_g1_t2', 1, 'easy', 'Long ago, how did people travel before cars?', ['Airplanes', 'Horses', 'Trains only', 'Rockets'], 1, 'Before cars, people often rode horses.'),
  q('history_g1_t2', 1, 'easy', 'What do we use today to talk to faraway friends?', ['Smoke signals', 'Phones', 'Drums', 'Nothing'], 1, 'Today we use phones to talk far away.'),
  q('history_g1_t2', 1, 'medium', 'How did people keep food cold before refrigerators?', ['With ice', 'With fire', 'With fans', 'With light'], 0, 'People used ice boxes to keep food cold.'),

  // ── history_g2_t1 · Grade 2 · Maps & Globes ─────────────────────────────────
  q('history_g2_t1', 2, 'easy', 'What does a globe show?', ['A whole street', 'The round Earth', 'One house', 'A car'], 1, 'A globe is a model of the round Earth.'),
  q('history_g2_t1', 2, 'medium', 'On most maps, which direction is up?', ['South', 'North', 'East', 'West'], 1, 'North is usually at the top of a map.'),
  q('history_g2_t1', 2, 'medium', 'What part of a map tells what symbols mean?', ['The key', 'The title only', 'The corner', 'The border'], 0, 'A map key (legend) explains the symbols.'),

  // ── history_g2_t2 · Grade 2 · Good Citizens ─────────────────────────────────
  q('history_g2_t2', 2, 'easy', 'What is a good way to be a kind citizen?', ['Littering', 'Helping a neighbor', 'Breaking rules', 'Pushing in line'], 1, 'Good citizens help others and follow rules.'),
  q('history_g2_t2', 2, 'medium', 'Who leads a city government?', ['A mayor', 'A king', 'A captain', 'A coach'], 0, 'Most cities elect a mayor to lead.'),
  q('history_g2_t2', 2, 'medium', 'Why do communities have rules?', ['To keep people safe and fair', 'To make people sad', 'For no reason', 'To waste time'], 0, 'Rules keep everyone safe and treat people fairly.'),

  // ── history_g3_t1 · Grade 3 · Communities Around the World ───────────────────
  q('history_g3_t1', 3, 'easy', 'A very large city is called a:', ['Village', 'Metropolis', 'Farm', 'Tent'], 1, 'A metropolis is a large, busy city.'),
  q('history_g3_t1', 3, 'medium', 'People in different places may speak different:', ['Languages', 'Numbers only', 'Colors', 'Shapes'], 0, 'Communities around the world speak many languages.'),
  q('history_g3_t1', 3, 'medium', 'A community near the ocean might depend on:', ['Fishing', 'Mining ice', 'Volcanoes', 'Nothing'], 0, 'Coastal communities often rely on fishing.'),

  // ── history_g3_t2 · Grade 3 · Local & National Heroes ───────────────────────
  q('history_g3_t2', 3, 'easy', 'A hero who helps the community is someone who:', ['Helps others', 'Only helps themselves', 'Hides away', 'Breaks things'], 0, 'Heroes act bravely to help others.'),
  q('history_g3_t2', 3, 'medium', 'Martin Luther King Jr. is remembered for working for:', ['Equal rights', 'Faster cars', 'Taller buildings', 'New games'], 0, 'Dr. King worked for civil rights and equality.'),
  q('history_g3_t2', 3, 'medium', 'A national holiday honors:', ['Important people or events', 'Only birthdays', 'Nothing', 'The weather'], 0, 'Holidays honor important people and events.'),

  // ── history_g4_t1 · Grade 4 · U.S. Regions & Geography ──────────────────────
  q('history_g4_t1', 4, 'easy', 'Which is the largest ocean bordering the United States?', ['Atlantic', 'Pacific', 'Indian', 'Arctic'], 1, 'The Pacific Ocean borders the U.S. west coast.'),
  q('history_g4_t1', 4, 'medium', 'The Rocky Mountains are found in which region?', ['The West', 'The Southeast', 'The Northeast', 'The Midwest'], 0, 'The Rockies run through the western U.S.'),
  q('history_g4_t1', 4, 'medium', 'Which river is one of the longest in the U.S.?', ['The Thames', 'The Mississippi', 'The Nile', 'The Amazon'], 1, 'The Mississippi River flows through the central U.S.'),

  // ── history_g4_t2 · Grade 4 · Native Peoples & Settlers ─────────────────────
  q('history_g4_t2', 4, 'easy', 'Native Americans lived in the Americas:', ['Before European settlers', 'After cars', 'Only last year', 'Never'], 0, 'Native peoples lived here long before settlers arrived.'),
  q('history_g4_t2', 4, 'medium', 'Many Plains tribes hunted which animal?', ['Bison', 'Penguins', 'Camels', 'Kangaroos'], 0, 'Plains tribes depended on the bison (buffalo).'),
  q('history_g4_t2', 4, 'medium', 'Early settlers and Native peoples often traded:', ['Goods', 'Cell phones', 'Cars', 'Televisions'], 0, 'They traded food, furs, and other goods.'),

  // ── history_g5_t1 · Grade 5 · Colonial America ──────────────────────────────
  q('history_g5_t1', 5, 'easy', 'The Pilgrims sailed to America on which ship?', ['Titanic', 'Mayflower', 'Santa Maria', 'Endeavour'], 1, 'The Pilgrims sailed on the Mayflower in 1620.'),
  q('history_g5_t1', 5, 'medium', 'How many original colonies were there?', ['10', '13', '50', '7'], 1, 'There were 13 original colonies.'),
  q('history_g5_t1', 5, 'medium', 'Jamestown, founded in 1607, was in which colony?', ['Virginia', 'Texas', 'California', 'Maine'], 0, 'Jamestown was the first lasting English settlement, in Virginia.'),

  // ── history_g5_t2 · Grade 5 · American Revolution ───────────────────────────
  q('history_g5_t2', 5, 'easy', 'The Declaration of Independence was signed in what year?', ['1492', '1776', '1865', '1920'], 1, 'It was signed in 1776.'),
  q('history_g5_t2', 5, 'medium', 'Who was the first U.S. president?', ['Abraham Lincoln', 'George Washington', 'Thomas Jefferson', 'John Adams'], 1, 'George Washington was the first president.'),
  q('history_g5_t2', 5, 'medium', 'The colonists fought for independence from which country?', ['France', 'Spain', 'Great Britain', 'Mexico'], 2, 'They fought against Great Britain.'),

  // ── history_g6_t1 · Grade 6 · Ancient Civilizations ─────────────────────────
  q('history_g6_t1', 6, 'easy', 'The ancient pyramids were built in which country?', ['Greece', 'Egypt', 'China', 'Peru'], 1, 'The great pyramids are in Egypt.'),
  q('history_g6_t1', 6, 'medium', 'Mesopotamia developed between which two rivers?', ['Nile and Congo', 'Tigris and Euphrates', 'Amazon and Plata', 'Ganges and Indus'], 1, 'Mesopotamia lay between the Tigris and Euphrates.'),
  q('history_g6_t1', 6, 'medium', 'One of the earliest forms of writing was:', ['Cuneiform', 'Email', 'Braille', 'Morse code'], 0, 'Cuneiform was used in ancient Mesopotamia.'),

  // ── history_g6_t2 · Grade 6 · Greece & Rome ─────────────────────────────────
  q('history_g6_t2', 6, 'easy', 'Democracy began in which ancient city?', ['Rome', 'Athens', 'Cairo', 'Babylon'], 1, 'Athens is known as the birthplace of democracy.'),
  q('history_g6_t2', 6, 'medium', 'Who was a famous ruler of the Roman Empire?', ['Julius Caesar', 'King Tut', 'Genghis Khan', 'Napoleon'], 0, 'Julius Caesar was a famous Roman leader.'),
  q('history_g6_t2', 6, 'medium', 'The Romans are known for building:', ['Roads and aqueducts', 'Spaceships', 'Smartphones', 'Skyscrapers'], 0, 'Romans built lasting roads and aqueducts.'),

  // ── history_g7_t1 · Grade 7 · The Middle Ages ───────────────────────────────
  q('history_g7_t1', 7, 'easy', 'In feudalism, peasants who worked the land were called:', ['Knights', 'Serfs', 'Kings', 'Merchants'], 1, 'Serfs farmed the land under a lord.'),
  q('history_g7_t1', 7, 'medium', 'A large fortified home of a medieval lord was a:', ['Castle', 'Cottage', 'Tent', 'Skyscraper'], 0, 'Lords lived in fortified castles.'),
  q('history_g7_t1', 7, 'medium', 'The Black Death was a deadly:', ['Plague', 'Storm', 'War', 'Famine only'], 0, 'The Black Death was a plague that swept Europe.'),

  // ── history_g7_t2 · Grade 7 · Renaissance & Exploration ─────────────────────
  q('history_g7_t2', 7, 'easy', 'The Renaissance was a rebirth of art and:', ['Learning', 'Farming', 'War', 'Hunting'], 0, 'It revived art, science, and learning.'),
  q('history_g7_t2', 7, 'medium', 'Who painted the Mona Lisa?', ['Michelangelo', 'Leonardo da Vinci', 'Raphael', 'Donatello'], 1, 'Leonardo da Vinci painted the Mona Lisa.'),
  q('history_g7_t2', 7, 'medium', 'In 1492, who sailed across the Atlantic for Spain?', ['Magellan', 'Columbus', 'Cook', 'Hudson'], 1, 'Christopher Columbus crossed the Atlantic in 1492.'),

  // ── history_g8_t1 · Grade 8 · U.S. Constitution & Civics ────────────────────
  q('history_g8_t1', 8, 'easy', 'The first ten amendments are called the:', ['Bill of Rights', 'Preamble', 'Declaration', 'Articles'], 0, 'The Bill of Rights is the first ten amendments.'),
  q('history_g8_t1', 8, 'medium', 'How many branches does the U.S. government have?', ['2', '3', '4', '5'], 1, 'Three: legislative, executive, and judicial.'),
  q('history_g8_t1', 8, 'medium', 'Which branch makes laws?', ['Executive', 'Legislative', 'Judicial', 'Military'], 1, 'Congress (legislative branch) makes laws.'),

  // ── history_g8_t2 · Grade 8 · Civil War & Reconstruction ────────────────────
  q('history_g8_t2', 8, 'easy', 'Who was president during the Civil War?', ['Washington', 'Lincoln', 'Jefferson', 'Roosevelt'], 1, 'Abraham Lincoln led during the Civil War.'),
  q('history_g8_t2', 8, 'medium', 'The Civil War was fought mainly over:', ['Slavery and union', 'Taxes on tea', 'Land in Asia', 'Trade with China'], 0, 'Slavery and preserving the Union were central issues.'),
  q('history_g8_t2', 8, 'medium', 'The Emancipation Proclamation aimed to free:', ['Enslaved people', 'Prisoners of war', 'Soldiers', 'Farmers'], 0, 'It declared enslaved people in rebel states free.'),

  // ── history_g9_t1 · Grade 9 · World History: Revolutions ────────────────────
  q('history_g9_t1', 9, 'easy', 'The French Revolution began in which year?', ['1689', '1789', '1889', '1989'], 1, 'The French Revolution began in 1789.'),
  q('history_g9_t1', 9, 'medium', 'A common cause of revolutions is:', ['Inequality and unrest', 'Good weather', 'New holidays', 'More books'], 0, 'Inequality and discontent often spark revolutions.'),
  q('history_g9_t1', 9, 'medium', 'The Enlightenment promoted ideas of:', ['Reason and rights', 'Magic', 'Conquest only', 'Silence'], 0, 'Enlightenment thinkers emphasized reason and individual rights.'),

  // ── history_g9_t2 · Grade 9 · Industrial Age ────────────────────────────────
  q('history_g9_t2', 9, 'easy', 'The Industrial Revolution began in which country?', ['France', 'Great Britain', 'Japan', 'Brazil'], 1, 'It began in Great Britain in the 1700s.'),
  q('history_g9_t2', 9, 'medium', 'The steam engine was used to power:', ['Factories and trains', 'Smartphones', 'Airplanes', 'Satellites'], 0, 'Steam engines powered factories and railways.'),
  q('history_g9_t2', 9, 'medium', 'Industrialization caused many people to move to:', ['Cities', 'Deserts', 'Caves', 'Oceans'], 0, 'People moved to cities for factory jobs (urbanization).'),

  // ── history_g10_t1 · Grade 10 · World Wars ──────────────────────────────────
  q('history_g10_t1', 10, 'easy', 'World War I began in which year?', ['1814', '1914', '1939', '1945'], 1, 'World War I began in 1914.'),
  q('history_g10_t1', 10, 'medium', 'World War II ended in which year?', ['1918', '1939', '1945', '1950'], 2, 'World War II ended in 1945.'),
  q('history_g10_t1', 10, 'medium', 'The alliance opposing the Axis powers was the:', ['Allies', 'Central Powers', 'Triple Entente', 'Union'], 0, 'The Allies fought the Axis in World War II.'),

  // ── history_g10_t2 · Grade 10 · Cold War & Modern Era ───────────────────────
  q('history_g10_t2', 10, 'easy', 'The Cold War was mainly between the U.S. and the:', ['Soviet Union', 'Roman Empire', 'British Empire', 'Ottoman Empire'], 0, 'It was a rivalry between the U.S. and the USSR.'),
  q('history_g10_t2', 10, 'medium', 'The Berlin Wall fell in which year?', ['1969', '1979', '1989', '1999'], 2, 'The Berlin Wall fell in 1989.'),
  q('history_g10_t2', 10, 'medium', 'The "Space Race" was a competition to explore:', ['Space', 'The ocean', 'Antarctica', 'The desert'], 0, 'The U.S. and USSR raced to achievements in space.'),

  // ── history_g11_t1 · Grade 11 · U.S. History in Depth ───────────────────────
  q('history_g11_t1', 11, 'easy', 'The Great Depression began in which year?', ['1919', '1929', '1939', '1949'], 1, 'The Great Depression began in 1929.'),
  q('history_g11_t1', 11, 'medium', "FDR's set of relief programs was called the:", ['New Deal', 'Square Deal', 'Fair Deal', 'Great Society'], 0, 'The New Deal addressed the Great Depression.'),
  q('history_g11_t1', 11, 'medium', 'The Civil Rights Movement sought to end:', ['Segregation', 'Trade', 'Voting', 'Schools'], 0, 'It fought racial segregation and discrimination.'),

  // ── history_g11_t2 · Grade 11 · Government & Economics ──────────────────────
  q('history_g11_t2', 11, 'easy', 'In a market economy, prices are set mainly by:', ['Supply and demand', 'A king', 'Random chance', 'The weather'], 0, 'Supply and demand drive prices in a market economy.'),
  q('history_g11_t2', 11, 'medium', 'The power to declare war belongs to which branch?', ['Legislative', 'Executive', 'Judicial', 'Press'], 0, 'Congress holds the power to declare war.'),
  q('history_g11_t2', 11, 'medium', 'Inflation means that prices, in general, are:', ['Rising', 'Falling', 'Frozen', 'Disappearing'], 0, 'Inflation is a general rise in prices.'),

  // ── history_g12_t1 · Grade 12 · Modern World History ────────────────────────
  q('history_g12_t1', 12, 'easy', 'Globalization means the world is becoming more:', ['Connected', 'Isolated', 'Empty', 'Silent'], 0, 'Globalization links economies and cultures worldwide.'),
  q('history_g12_t1', 12, 'medium', 'The United Nations was founded to promote:', ['International cooperation', 'One world army', 'Trade bans', 'Space travel'], 0, 'The UN promotes peace and cooperation among nations.'),
  q('history_g12_t1', 12, 'medium', 'The European Union is primarily a(n):', ['Economic and political union', 'Military empire', 'Single country', 'Sports league'], 0, 'The EU is an economic and political partnership of nations.'),

  // ── history_g12_t2 · Grade 12 · Civics & Global Issues ──────────────────────
  q('history_g12_t2', 12, 'easy', 'A right protected by free speech is the ability to:', ['Express opinions', 'Break laws', 'Avoid taxes', 'Vote twice'], 0, 'Free speech protects expressing opinions.'),
  q('history_g12_t2', 12, 'medium', 'Climate change is largely driven by:', ['Greenhouse gas emissions', 'Reading books', 'Ocean currents only', 'Moon phases'], 0, 'Human greenhouse gas emissions are the main driver.'),
  q('history_g12_t2', 12, 'medium', 'Human rights are rights that belong to:', ['Every person', 'Only leaders', 'Only adults', 'No one'], 0, 'Human rights belong to all people.'),
];
