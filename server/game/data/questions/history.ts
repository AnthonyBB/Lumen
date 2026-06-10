/**
 * History question bank — tagged with subcategories from curriculum.ts.
 * Imported and concatenated by QuestionEngine.  Server-side only.
 */

import { makeQ, type RawQuestion } from './util.js';

const q = makeQ('history');

export const HISTORY_QUESTIONS: RawQuestion[] = [
  // ── Community & Citizenship (K-3) ─────────────────────────────────────────
  q('hist_community', 0, 'easy', 'Who helps keep people safe and puts out fires?', ['Bakers', 'Firefighters', 'Painters', 'Singers'], 1, 'Firefighters are community helpers who put out fires and rescue people.'),
  q('hist_community', 1, 'easy', 'Where do people in a town go to borrow books?', ['The bank', 'The library', 'The post office', 'The bakery'], 1, 'A library lends books to everyone in the community for free.'),
  q('hist_community', 1, 'easy', 'What is a good way to be a kind citizen?', ['Littering', 'Helping a neighbor', 'Breaking rules', 'Pushing in line'], 1, 'Good citizens help others, follow rules, and care for their community.'),
  q('hist_community', 2, 'medium', 'Who leads a city government?', ['A mayor', 'A king', 'A captain', 'A coach'], 0, 'Most cities elect a mayor to lead their local government.'),
  q('hist_community', 2, 'medium', 'Why do communities have rules and laws?', ['To make life boring', 'To keep people safe and fair', 'To stop all fun', 'Only for grown-ups'], 1, 'Rules and laws protect people and help everyone get along fairly.'),
  q('hist_community', 3, 'medium', 'What does it mean to volunteer?', ['To get paid for work', 'To help without being paid', 'To go on vacation', 'To win a prize'], 1, 'Volunteers freely give their time to help others and improve their community.'),

  // ── Ancient Civilizations (3-7) ───────────────────────────────────────────
  q('hist_ancient', 4, 'easy', 'What ancient civilization built the pyramids at Giza?', ['Mesopotamians', 'Ancient Egyptians', 'Mayans', 'Romans'], 1, 'The Ancient Egyptians built the Giza pyramids around 2500 BC as tombs for their pharaohs.'),
  q('hist_ancient', 5, 'medium', 'Which empire built the Colosseum in Rome?', ['Greek', 'Ottoman', 'Roman', 'Byzantine'], 2, 'The Roman Empire built the Colosseum between AD 70 and 80 under Emperor Vespasian.'),
  q('hist_ancient', 5, 'medium', 'Which ancient wonder was located in Alexandria, Egypt?', ['Colossus of Rhodes', 'Great Pyramid', 'Lighthouse of Alexandria', 'Hanging Gardens'], 2, 'The Lighthouse of Alexandria (Pharos) guided ships and was one of the Seven Wonders of the Ancient World.'),
  q('hist_ancient', 3, 'easy', 'What did ancient Egyptians use to write?', ['Hieroglyphics', 'Emojis', 'The English alphabet', 'Morse code'], 0, 'Hieroglyphics were picture symbols used for writing in ancient Egypt.'),
  q('hist_ancient', 6, 'medium', 'Which ancient Greek city is called the birthplace of democracy?', ['Sparta', 'Athens', 'Troy', 'Olympia'], 1, 'Athens let citizens vote on laws around 500 BC — an early democracy.'),
  q('hist_ancient', 7, 'hard', 'Between which two rivers did ancient Mesopotamia develop?', ['Nile and Congo', 'Tigris and Euphrates', 'Amazon and Orinoco', 'Yellow and Yangtze'], 1, 'Mesopotamia means "between the rivers" — the Tigris and Euphrates in modern Iraq.'),

  // ── World Explorers (4-7) ─────────────────────────────────────────────────
  q('hist_explorers', 4, 'easy', 'What year did Christopher Columbus first reach the Americas?', ['1488', '1492', '1498', '1502'], 1, 'Columbus reached the Bahamas on October 12, 1492, during his first voyage.'),
  q('hist_explorers', 4, 'easy', 'What did early explorers use to find their direction at sea?', ['A telescope', 'A compass', 'A telephone', 'A clock'], 1, 'A magnetic compass always points north, helping sailors navigate.'),
  q('hist_explorers', 5, 'medium', 'Whose expedition was the first to sail all the way around the world?', ['Columbus', 'Magellan', 'Marco Polo', 'Leif Erikson'], 1, 'Ferdinand Magellan’s expedition (1519-1522) completed the first circumnavigation of the globe.'),
  q('hist_explorers', 5, 'medium', 'Which explorer traveled from Italy to China and wrote about it?', ['Marco Polo', 'Hernán Cortés', 'James Cook', 'Vasco da Gama'], 0, 'Marco Polo journeyed along the Silk Road to China in the 1270s and described his travels in a famous book.'),
  q('hist_explorers', 6, 'medium', 'Which explorers were likely the first Europeans to reach North America, around the year 1000?', ['The Spanish', 'The Vikings', 'The Portuguese', 'The Dutch'], 1, 'Viking sailors led by Leif Erikson reached Newfoundland nearly 500 years before Columbus.'),
  q('hist_explorers', 7, 'hard', 'Why did European explorers seek a sea route to Asia?', ['To find penguins', 'To trade for spices and silk', 'To study volcanoes', 'To escape winter'], 1, 'Spices and silk were extremely valuable, and land routes were long and costly.'),

  // ── American History (4-11) ───────────────────────────────────────────────
  q('hist_american', 3, 'easy', 'Who was the first President of the United States?', ['Thomas Jefferson', 'John Adams', 'Benjamin Franklin', 'George Washington'], 3, 'George Washington became the first U.S. President in 1789.'),
  q('hist_american', 4, 'medium', 'What document declared American independence in 1776?', ['The Constitution', 'The Magna Carta', 'The Bill of Rights', 'The Declaration of Independence'], 3, 'The Declaration of Independence, adopted on July 4, 1776, declared the 13 colonies free from British rule.'),
  q('hist_american', 5, 'easy', 'How many original colonies formed the United States?', ['10', '13', '15', '50'], 1, 'Thirteen British colonies along the Atlantic coast became the first states.'),
  q('hist_american', 7, 'medium', 'Which president wrote the Emancipation Proclamation during the Civil War?', ['George Washington', 'Abraham Lincoln', 'Theodore Roosevelt', 'Thomas Jefferson'], 1, 'Abraham Lincoln issued it in 1863, declaring enslaved people in Confederate states free.'),
  q('hist_american', 9, 'hard', 'What movement, led in part by Dr. Martin Luther King Jr., worked for equal rights in the 1950s-60s?', ['The Gold Rush', 'The Civil Rights Movement', 'The New Deal', 'Westward Expansion'], 1, 'The Civil Rights Movement used peaceful protest to win equal rights for Black Americans.'),
  q('hist_american', 11, 'hard', 'Which purchase in 1803 doubled the size of the United States?', ['The Alaska Purchase', 'The Louisiana Purchase', 'The Gadsden Purchase', 'The Florida Treaty'], 1, 'The U.S. bought the Louisiana Territory from France, doubling the nation’s land.'),

  // ── World History (6-12) ──────────────────────────────────────────────────
  q('hist_world', 6, 'easy', 'In which year did World War II end?', ['1943', '1944', '1945', '1946'], 2, 'World War II ended in 1945: Germany surrendered in May and Japan in September.'),
  q('hist_world', 7, 'medium', 'What was the Renaissance?', ['A type of castle', 'A rebirth of art and learning in Europe', 'A war between kingdoms', 'A trade ship'], 1, 'The Renaissance (14th-17th centuries) revived art, science, and learning across Europe.'),
  q('hist_world', 8, 'medium', 'The Industrial Revolution began in which country?', ['France', 'Great Britain', 'United States', 'Japan'], 1, 'Factories and steam power first transformed Britain in the late 1700s.'),
  q('hist_world', 9, 'medium', 'What wall divided a famous German city until 1989?', ['The Great Wall', 'Hadrian’s Wall', 'The Berlin Wall', 'The Western Wall'], 2, 'The Berlin Wall separated East and West Berlin during the Cold War until it fell in 1989.'),
  q('hist_world', 10, 'hard', 'What event in 1914 sparked the start of World War I?', ['The sinking of the Titanic', 'The assassination of Archduke Franz Ferdinand', 'The French Revolution', 'The Moon landing'], 1, 'The archduke’s assassination in Sarajevo set off a chain of alliances that led to war.'),
  q('hist_world', 12, 'hard', 'What was the Cold War?', ['A war fought in winter', 'A tense rivalry between the USA and USSR without direct war', 'A battle over Antarctica', 'A medieval conflict'], 1, 'From about 1947 to 1991, the two superpowers competed through politics, technology, and influence.'),

  // ── Geography & Maps (K-8) ────────────────────────────────────────────────
  q('hist_geography', 0, 'easy', 'Which of these is the biggest?', ['A town', 'A country', 'A continent', 'A street'], 2, 'A continent is a huge landmass containing many countries, like Africa or Asia.'),
  q('hist_geography', 2, 'easy', 'How many continents are there on Earth?', ['5', '6', '7', '8'], 2, 'There are 7 continents: Africa, Antarctica, Asia, Australia, Europe, North America, and South America.'),
  q('hist_geography', 3, 'easy', 'On most maps, which direction is at the top?', ['South', 'East', 'West', 'North'], 3, 'Maps are usually drawn with north at the top — the compass rose shows directions.'),
  q('hist_geography', 4, 'medium', 'What is the largest ocean on Earth?', ['Atlantic', 'Indian', 'Arctic', 'Pacific'], 3, 'The Pacific Ocean is the largest and deepest ocean, covering about a third of the planet.'),
  q('hist_geography', 6, 'medium', 'What imaginary line circles the Earth halfway between the poles?', ['The prime meridian', 'The equator', 'The horizon', 'The tropic line'], 1, 'The equator divides Earth into the Northern and Southern Hemispheres.'),
  q('hist_geography', 8, 'hard', 'What do lines of longitude measure?', ['Distance north or south', 'Distance east or west', 'Ocean depth', 'Mountain height'], 1, 'Longitude lines run pole to pole and measure how far east or west a place is from the prime meridian.'),

  // ── Government & Civics (5-12) ────────────────────────────────────────────
  q('hist_civics', 5, 'easy', 'In a democracy, how do citizens choose their leaders?', ['By voting', 'By drawing straws', 'By birthright', 'By contest'], 0, 'Democracies hold elections where citizens vote for their leaders.'),
  q('hist_civics', 6, 'medium', 'What are the three branches of the U.S. government?', ['Army, Navy, Air Force', 'Legislative, Executive, Judicial', 'Federal, State, City', 'King, Court, Council'], 1, 'Congress makes laws (legislative), the President enforces them (executive), and courts interpret them (judicial).'),
  q('hist_civics', 7, 'medium', 'What is the supreme law of the United States?', ['The Declaration of Independence', 'The Constitution', 'The Federalist Papers', 'State law'], 1, 'The Constitution, written in 1787, is the highest law of the land.'),
  q('hist_civics', 8, 'medium', 'What are the first ten amendments to the U.S. Constitution called?', ['The Preamble', 'The Bill of Rights', 'The Articles', 'The Charters'], 1, 'The Bill of Rights protects freedoms like speech, press, and religion.'),
  q('hist_civics', 10, 'hard', 'What does "checks and balances" mean?', ['Banks checking money', 'Each branch limits the others’ power', 'Voting twice', 'Balancing the budget'], 1, 'Each branch of government can limit the others so no single branch becomes too powerful.'),
  q('hist_civics', 12, 'hard', 'What is a veto?', ['A type of election', 'The president’s power to reject a bill', 'A court ruling', 'A new amendment'], 1, 'A president can veto (reject) a bill, though Congress can override it with a two-thirds vote.'),

  // ── Economics Basics (6-12) ───────────────────────────────────────────────
  q('hist_economics', 6, 'easy', 'What do we call the money you keep instead of spending?', ['Debt', 'Savings', 'Tax', 'Rent'], 1, 'Savings is money you set aside to use later.'),
  q('hist_economics', 6, 'easy', 'What is a "good" in economics?', ['A kind deed', 'A physical thing you can buy, like a toy', 'A law', 'A holiday'], 1, 'Goods are physical products; services are work done for others, like a haircut.'),
  q('hist_economics', 7, 'medium', 'What usually happens to price when something is scarce but many people want it?', ['The price falls', 'The price rises', 'The price stays the same', 'It becomes free'], 1, 'High demand plus low supply pushes prices up — the law of supply and demand.'),
  q('hist_economics', 8, 'medium', 'What is a budget?', ['A type of bank', 'A plan for spending and saving money', 'A loan', 'A paycheck'], 1, 'A budget helps you plan how much to spend and save from the money you have.'),
  q('hist_economics', 10, 'hard', 'What is inflation?', ['Money gaining value', 'A general rise in prices over time', 'A type of tax', 'Free trade'], 1, 'Inflation means prices rise over time, so each dollar buys a little less.'),
  q('hist_economics', 12, 'hard', 'What do we call money paid to the government to fund public services?', ['Interest', 'Taxes', 'Profit', 'Wages'], 1, 'Taxes pay for roads, schools, parks, and other public services.'),
];
