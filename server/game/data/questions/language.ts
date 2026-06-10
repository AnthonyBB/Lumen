/**
 * Language Arts question bank — tagged with grade-level TOPIC ids from curriculum.ts.
 * Imported and concatenated by QuestionEngine.  Server-side only.
 *
 * SEED: 3 questions per topic (24 topics → 72 questions).
 * TODO: expand to 20+ per topic. Append below the matching topic header.
 */

import { makeQ, type RawQuestion } from './util.js';

const q = makeQ('language');

export const LANGUAGE_QUESTIONS: RawQuestion[] = [
  // ── language_g1_t1 · Grade 1 · Phonics & Sounds ─────────────────────────────
  q('language_g1_t1', 1, 'easy', 'Which word starts with the same sound as "cat"?', ['Dog', 'Cup', 'Sun', 'Map'], 1, '"Cat" and "cup" both start with /k/.'),
  q('language_g1_t1', 1, 'easy', 'Which word rhymes with "tree"?', ['Trap', 'Bee', 'Toe', 'Tan'], 1, '"Tree" and "bee" share the /ee/ sound.'),
  q('language_g1_t1', 1, 'medium', 'How many syllables are in "banana"?', ['1', '2', '3', '4'], 2, 'Ba-na-na — three syllables.'),

  // ── language_g1_t2 · Grade 1 · Sight Words & Reading ────────────────────────
  q('language_g1_t2', 1, 'easy', 'Which is a common sight word?', ['the', 'xylophone', 'elephant', 'computer'], 0, '"the" is a very common sight word.'),
  q('language_g1_t2', 1, 'easy', 'Finish the sentence: "I ___ a dog."', ['see', 'tree', 'blue', 'jump'], 0, '"I see a dog" makes sense.'),
  q('language_g1_t2', 1, 'medium', 'What word completes: "The sun is ___"?', ['hot', 'run', 'box', 'and'], 0, '"The sun is hot" is a complete idea.'),

  // ── language_g2_t1 · Grade 2 · Spelling Patterns ────────────────────────────
  q('language_g2_t1', 2, 'easy', 'Which word is spelled correctly?', ['Frend', 'Freind', 'Friend', 'Frennd'], 2, 'The correct spelling is "friend".'),
  q('language_g2_t1', 2, 'medium', 'What is the plural of "box"?', ['Boxs', 'Boxes', 'Boxen', 'Box'], 1, 'Words ending in -x add -es: boxes.'),
  q('language_g2_t1', 2, 'medium', 'Which word has a long "a" sound?', ['Cat', 'Cake', 'Cap', 'Can'], 1, 'The silent e in "cake" makes the a long.'),

  // ── language_g2_t2 · Grade 2 · Sentences & Reading ──────────────────────────
  q('language_g2_t2', 2, 'easy', 'A sentence should begin with a:', ['Capital letter', 'Number', 'Period', 'Space'], 0, 'Sentences start with a capital letter.'),
  q('language_g2_t2', 2, 'medium', 'What punctuation ends a question?', ['Period', 'Question mark', 'Comma', 'Dash'], 1, 'Questions end with a question mark (?).'),
  q('language_g2_t2', 2, 'medium', 'Which is a complete sentence?', ['The happy dog.', 'The dog ran fast.', 'Running quickly.', 'Big red.'], 1, '"The dog ran fast." has a subject and verb.'),

  // ── language_g3_t1 · Grade 3 · Parts of Speech ──────────────────────────────
  q('language_g3_t1', 3, 'easy', 'Which word is a noun?', ['Run', 'Happy', 'Dog', 'Quickly'], 2, 'A noun names a person, place, or thing — "dog".'),
  q('language_g3_t1', 3, 'medium', 'Which word is a verb?', ['Jump', 'Blue', 'Table', 'Soft'], 0, 'A verb shows action — "jump".'),
  q('language_g3_t1', 3, 'medium', 'Which word is an adjective?', ['Sing', 'Bright', 'River', 'They'], 1, 'An adjective describes — "bright".'),

  // ── language_g3_t2 · Grade 3 · Reading Comprehension ────────────────────────
  q('language_g3_t2', 3, 'easy', 'The main idea of a story is:', ['What it is mostly about', 'The last word', 'The title font', 'The page number'], 0, 'The main idea is what a text is mostly about.'),
  q('language_g3_t2', 3, 'medium', 'A detail that supports the main idea is called a:', ['Supporting detail', 'Cover', 'Margin', 'Glossary'], 0, 'Supporting details back up the main idea.'),
  q('language_g3_t2', 3, 'medium', 'To find out what happens next, you can make a:', ['Prediction', 'Sandwich', 'Drawing only', 'Rhyme'], 0, 'A prediction is a smart guess about what comes next.'),

  // ── language_g4_t1 · Grade 4 · Grammar & Punctuation ────────────────────────
  q('language_g4_t1', 4, 'easy', 'Which sentence is punctuated correctly?', ['i like cats', 'I like cats.', 'I like cats', 'i like cats.'], 1, 'Capital start and a period at the end.'),
  q('language_g4_t1', 4, 'medium', 'Choose the correct word: "They\'re going to ___ house."', ['there', 'their', "they're", 'thair'], 1, '"Their" shows possession.'),
  q('language_g4_t1', 4, 'medium', 'A comma is used to:', ['Separate items in a list', 'End a sentence', 'Start a paragraph', 'Make a question'], 0, 'Commas separate items in a list.'),

  // ── language_g4_t2 · Grade 4 · Vocabulary & Context ─────────────────────────
  q('language_g4_t2', 4, 'easy', 'A synonym for "happy" is:', ['Sad', 'Glad', 'Angry', 'Tired'], 1, '"Glad" means about the same as "happy".'),
  q('language_g4_t2', 4, 'medium', 'An antonym for "begin" is:', ['Start', 'End', 'Open', 'Run'], 1, '"End" is the opposite of "begin".'),
  q('language_g4_t2', 4, 'medium', 'Using nearby words to guess a meaning is using:', ['Context clues', 'A ruler', 'A timer', 'A rhyme'], 0, 'Context clues help define unknown words.'),

  // ── language_g5_t1 · Grade 5 · Writing Paragraphs ───────────────────────────
  q('language_g5_t1', 5, 'easy', 'A paragraph usually begins with a:', ['Topic sentence', 'Period', 'Random word', 'Page number'], 0, 'A topic sentence introduces the paragraph\'s idea.'),
  q('language_g5_t1', 5, 'medium', 'Sentences in a paragraph should all relate to:', ['One main idea', 'Many random ideas', 'The title only', 'Nothing'], 0, 'A good paragraph stays focused on one main idea.'),
  q('language_g5_t1', 5, 'medium', 'A concluding sentence does what?', ['Wraps up the idea', 'Starts a new topic', 'Adds a title', 'Lists the author'], 0, 'It wraps up the paragraph\'s main idea.'),

  // ── language_g5_t2 · Grade 5 · Roots, Prefixes & Suffixes ───────────────────
  q('language_g5_t2', 5, 'easy', 'The prefix "un-" usually means:', ['Not', 'Again', 'Before', 'Many'], 0, '"Un-" means not, as in "unhappy".'),
  q('language_g5_t2', 5, 'medium', 'The root "port" means:', ['Carry', 'Water', 'Light', 'Sound'], 0, '"Port" means carry (transport, portable).'),
  q('language_g5_t2', 5, 'medium', 'The suffix "-less" means:', ['Without', 'Full of', 'Before', 'Two'], 0, '"-less" means without, as in "fearless".'),

  // ── language_g6_t1 · Grade 6 · Figurative Language ──────────────────────────
  q('language_g6_t1', 6, 'easy', 'A simile compares two things using:', ['"like" or "as"', 'Numbers', 'Periods', 'Nouns only'], 0, 'Similes use "like" or "as".'),
  q('language_g6_t1', 6, 'medium', '"The wind whispered" is an example of:', ['Personification', 'A simile', 'A pun', 'Alliteration'], 0, 'Giving human traits to the wind is personification.'),
  q('language_g6_t1', 6, 'medium', '"Her smile was sunshine" is a:', ['Metaphor', 'Simile', 'Question', 'List'], 0, 'A metaphor states one thing IS another.'),

  // ── language_g6_t2 · Grade 6 · Essay Writing ────────────────────────────────
  q('language_g6_t2', 6, 'easy', 'An essay introduction usually ends with a:', ['Thesis statement', 'Bibliography', 'Random fact', 'Title only'], 0, 'The thesis states the essay\'s main point.'),
  q('language_g6_t2', 6, 'medium', 'Body paragraphs should each:', ['Support the thesis', 'Change the topic', 'Repeat the title', 'Add nothing'], 0, 'Each body paragraph supports the thesis.'),
  q('language_g6_t2', 6, 'medium', 'A conclusion should:', ['Restate and wrap up', 'Introduce new topics', 'List sources only', 'Be the longest part'], 0, 'A conclusion restates and wraps up the essay.'),

  // ── language_g7_t1 · Grade 7 · Literary Elements ────────────────────────────
  q('language_g7_t1', 7, 'easy', 'The sequence of events in a story is the:', ['Plot', 'Setting', 'Theme', 'Title'], 0, 'The plot is the sequence of events.'),
  q('language_g7_t1', 7, 'medium', 'The time and place of a story is the:', ['Setting', 'Plot', 'Climax', 'Narrator'], 0, 'Setting is where and when a story happens.'),
  q('language_g7_t1', 7, 'medium', 'The struggle that drives a story is the:', ['Conflict', 'Cover', 'Index', 'Footnote'], 0, 'Conflict is the central struggle.'),

  // ── language_g7_t2 · Grade 7 · Grammar Mastery ──────────────────────────────
  q('language_g7_t2', 7, 'easy', 'Which is an independent clause?', ['Because it rained', 'She sang', 'When we left', 'After the show'], 1, '"She sang" stands alone as a sentence.'),
  q('language_g7_t2', 7, 'medium', 'A dependent clause cannot:', ['Stand alone', 'Have a subject', 'Have a verb', 'Be in a sentence'], 0, 'A dependent clause cannot stand alone.'),
  q('language_g7_t2', 7, 'medium', 'Choose the correct verb: "Each of the students ___ ready."', ['are', 'is', 'were', 'be'], 1, '"Each" is singular, so use "is".'),

  // ── language_g8_t1 · Grade 8 · Theme & Author\'s Craft ───────────────────────
  q('language_g8_t1', 8, 'easy', 'The central message of a story is its:', ['Theme', 'Setting', 'Title', 'Length'], 0, 'Theme is the underlying message or lesson.'),
  q('language_g8_t1', 8, 'medium', 'Foreshadowing is used to:', ['Hint at future events', 'End the story', 'List characters', 'Number pages'], 0, 'Foreshadowing hints at what will happen.'),
  q('language_g8_t1', 8, 'medium', 'Tone refers to the author\'s:', ['Attitude', 'Page count', 'Font', 'Title'], 0, 'Tone is the author\'s attitude toward the subject.'),

  // ── language_g8_t2 · Grade 8 · Persuasive Writing ───────────────────────────
  q('language_g8_t2', 8, 'easy', 'A persuasive essay tries to:', ['Convince the reader', 'Tell a fairy tale', 'List facts only', 'Rhyme'], 0, 'Persuasive writing convinces the reader of a position.'),
  q('language_g8_t2', 8, 'medium', 'Strong arguments are backed by:', ['Evidence', 'Guesses', 'Insults', 'Blank space'], 0, 'Good arguments use evidence and reasons.'),
  q('language_g8_t2', 8, 'medium', 'Addressing the other side\'s view is called a:', ['Counterargument', 'Title', 'Heading', 'Citation'], 0, 'A counterargument addresses opposing views.'),

  // ── language_g9_t1 · Grade 9 · Literary Analysis ────────────────────────────
  q('language_g9_t1', 9, 'easy', 'A claim in an analysis must be supported by:', ['Textual evidence', 'Opinions only', 'Drawings', 'Nothing'], 0, 'Analysis claims need textual evidence.'),
  q('language_g9_t1', 9, 'medium', 'A symbol in literature is something that:', ['Represents a bigger idea', 'Ends a sentence', 'Counts pages', 'Is always a person'], 0, 'A symbol stands for a larger idea.'),
  q('language_g9_t1', 9, 'medium', 'Analyzing characters by their actions reveals their:', ['Traits and motives', 'Page count', 'Font size', 'Spelling'], 0, 'Actions reveal a character\'s traits and motives.'),

  // ── language_g9_t2 · Grade 9 · Argumentative Essays ─────────────────────────
  q('language_g9_t2', 9, 'easy', 'A strong thesis takes a clear:', ['Position', 'Pause', 'Picture', 'Rhyme'], 0, 'A thesis states a clear, arguable position.'),
  q('language_g9_t2', 9, 'medium', 'A logical fallacy is an error in:', ['Reasoning', 'Spelling', 'Margins', 'Fonts'], 0, 'A fallacy is a flaw in reasoning.'),
  q('language_g9_t2', 9, 'medium', 'Citing a credible source strengthens an essay\'s:', ['Credibility', 'Page count', 'Color', 'Rhythm'], 0, 'Credible sources boost an argument\'s credibility.'),

  // ── language_g10_t1 · Grade 10 · World & Classic Literature ─────────────────
  q('language_g10_t1', 10, 'easy', 'Shakespeare is famous for writing:', ['Plays and sonnets', 'Cookbooks', 'Maps', 'Laws'], 0, 'Shakespeare wrote plays and sonnets.'),
  q('language_g10_t1', 10, 'medium', 'An epic is a long narrative poem about:', ['Heroic deeds', 'Grocery lists', 'Weather only', 'Math'], 0, 'Epics tell of heroic deeds (e.g., The Odyssey).'),
  q('language_g10_t1', 10, 'medium', 'A tragedy typically ends with the protagonist\'s:', ['Downfall', 'Wedding', 'Promotion', 'Birthday'], 0, 'Classical tragedies end in the hero\'s downfall.'),

  // ── language_g10_t2 · Grade 10 · Rhetoric & Style ───────────────────────────
  q('language_g10_t2', 10, 'easy', 'An appeal to emotion is called:', ['Pathos', 'Logos', 'Ethos', 'Chaos'], 0, 'Pathos appeals to the audience\'s emotions.'),
  q('language_g10_t2', 10, 'medium', 'An appeal to logic and reason is called:', ['Logos', 'Pathos', 'Ethos', 'Tempo'], 0, 'Logos appeals to logic and evidence.'),
  q('language_g10_t2', 10, 'medium', 'Repeating a word at the start of clauses is:', ['Anaphora', 'A footnote', 'A simile', 'A pun'], 0, 'Anaphora repeats words for emphasis.'),

  // ── language_g11_t1 · Grade 11 · American Literature ────────────────────────
  q('language_g11_t1', 11, 'easy', 'Mark Twain is known for writing about life along the:', ['Mississippi River', 'Nile River', 'Thames', 'Amazon'], 0, 'Twain wrote about the Mississippi River.'),
  q('language_g11_t1', 11, 'medium', 'Transcendentalism valued nature and:', ['Individualism', 'Conformity', 'Warfare', 'Industry'], 0, 'Transcendentalists prized nature and the individual.'),
  q('language_g11_t1', 11, 'medium', 'The Harlem Renaissance celebrated African American:', ['Art and culture', 'Math', 'Sports only', 'Farming'], 0, 'It was a flourishing of Black art and culture.'),

  // ── language_g11_t2 · Grade 11 · Research & Synthesis ───────────────────────
  q('language_g11_t2', 11, 'easy', 'Giving credit to sources avoids:', ['Plagiarism', 'Reading', 'Editing', 'Writing'], 0, 'Citing sources prevents plagiarism.'),
  q('language_g11_t2', 11, 'medium', 'Synthesis means combining ideas from:', ['Multiple sources', 'One word', 'A title only', 'No sources'], 0, 'Synthesis blends ideas from several sources.'),
  q('language_g11_t2', 11, 'medium', 'A primary source is:', ['A firsthand account', 'A summary', 'A textbook only', 'A rumor'], 0, 'Primary sources are original, firsthand records.'),

  // ── language_g12_t1 · Grade 12 · British & World Literature ─────────────────
  q('language_g12_t1', 12, 'easy', '"Beowulf" is an example of an Old English:', ['Epic poem', 'Newspaper', 'Cookbook', 'Map'], 0, '"Beowulf" is an Old English epic poem.'),
  q('language_g12_t1', 12, 'medium', 'A sonnet is a poem with how many lines?', ['10', '12', '14', '16'], 2, 'A sonnet has 14 lines.'),
  q('language_g12_t1', 12, 'medium', 'An allusion is a reference to:', ['Another work or event', 'A spelling rule', 'A page number', 'A font'], 0, 'An allusion references another work, person, or event.'),

  // ── language_g12_t2 · Grade 12 · Composition & Analysis ─────────────────────
  q('language_g12_t2', 12, 'easy', 'A well-structured essay needs a clear:', ['Thesis and support', 'Cover image', 'Long title', 'Rhyme scheme'], 0, 'Strong essays have a clear thesis and support.'),
  q('language_g12_t2', 12, 'medium', 'Revising focuses mainly on improving:', ['Content and clarity', 'Only fonts', 'Page color', 'Margins only'], 0, 'Revision improves content, organization, and clarity.'),
  q('language_g12_t2', 12, 'medium', 'A rhetorical analysis examines HOW a text:', ['Persuades its audience', 'Is printed', 'Is bound', 'Is sold'], 0, 'It analyzes how an author persuades the audience.'),
];
