/**
 * Language Arts question bank — tagged with subcategories from curriculum.ts.
 * Imported and concatenated by QuestionEngine.  Server-side only.
 */

import { makeQ, type RawQuestion } from './util.js';

const q = makeQ('language');

export const LANGUAGE_QUESTIONS: RawQuestion[] = [
  // ── Phonics & Spelling (K-3) ──────────────────────────────────────────────
  q('lang_phonics', 0, 'easy', 'Which word starts with the same sound as "cat"?', ['Dog', 'Cup', 'Sun', 'Map'], 1, '"Cat" and "cup" both start with the hard C sound: /k/.'),
  q('lang_phonics', 1, 'easy', 'Which word rhymes with "tree"?', ['Trap', 'Bee', 'Toe', 'Tan'], 1, '"Tree" and "bee" both end with the same /ee/ sound — they rhyme.'),
  q('lang_phonics', 1, 'easy', 'How many syllables are in the word "banana"?', ['1', '2', '3', '4'], 2, 'Ba-na-na — clap it out: three syllables.'),
  q('lang_phonics', 2, 'medium', 'Which word is spelled correctly?', ['Frend', 'Freind', 'Friend', 'Frennd'], 2, '"Friend" is the correct spelling — remember "i before e" here: f-r-i-e-n-d.'),
  q('lang_phonics', 3, 'medium', 'What is the correct spelling of the word meaning "to postpone"?', ['Defur', 'Deffur', 'Defer', 'Defurr'], 2, '"Defer" (d-e-f-e-r) means to put something off to a later time.'),
  q('lang_phonics', 3, 'medium', 'Which word has a silent letter?', ['Jump', 'Knee', 'Fast', 'Drip'], 1, 'In "knee" the K is silent — you only hear the N sound.'),

  // ── Vocabulary (K-12) ─────────────────────────────────────────────────────
  q('lang_vocabulary', 2, 'easy', 'What is a synonym for "happy"?', ['Sad', 'Joyful', 'Angry', 'Tired'], 1, '"Joyful" means feeling great happiness — it is a synonym for "happy".'),
  q('lang_vocabulary', 4, 'medium', 'What is an antonym for "ancient"?', ['Old', 'Modern', 'Historic', 'Aged'], 1, '"Modern" means current or new — the opposite of "ancient", which means very old.'),
  q('lang_vocabulary', 1, 'easy', 'Which word means the opposite of "big"?', ['Huge', 'Giant', 'Small', 'Tall'], 2, '"Small" is the antonym (opposite) of "big".'),
  q('lang_vocabulary', 6, 'medium', 'What does "reluctant" mean?', ['Very excited', 'Unwilling or hesitant', 'Extremely fast', 'Brightly colored'], 1, 'A reluctant person does not want to do something — they hesitate.'),
  q('lang_vocabulary', 9, 'hard', 'What does the word "meticulous" mean?', ['Careless', 'Very careful and precise', 'Loud and bold', 'Quick and sloppy'], 1, 'A meticulous person pays great attention to every small detail.'),
  q('lang_vocabulary', 11, 'hard', 'Which word means "to make something less severe"?', ['Aggravate', 'Mitigate', 'Escalate', 'Duplicate'], 1, '"Mitigate" means to soften or lessen — like mitigating damage.'),

  // ── Grammar & Punctuation (2-10) ──────────────────────────────────────────
  q('lang_grammar', 2, 'easy', 'Which sentence uses correct punctuation?', ['She went to the store', 'She went to the store.', 'she went to the store.', 'She went, to the store'], 1, 'A sentence starts with a capital letter and ends with a period.'),
  q('lang_grammar', 3, 'easy', 'What is the plural of "mouse" (the animal)?', ['Mouses', 'Meese', 'Mice', 'Mouse'], 2, '"Mice" is the irregular plural of "mouse". English has many irregular plurals.'),
  q('lang_grammar', 3, 'medium', 'Which part of speech describes an action or state of being?', ['Noun', 'Adjective', 'Verb', 'Adverb'], 2, 'A verb expresses an action (run, eat) or a state of being (is, was).'),
  q('lang_grammar', 5, 'medium', 'Which sentence uses the apostrophe correctly?', ['The dogs bone is lost.', "The dog's bone is lost.", "The dogs' bone is lost, said one dog.", 'The dog,s bone is lost.'], 1, "\"The dog's bone\" shows one dog owns the bone — apostrophe before the s."),
  q('lang_grammar', 7, 'hard', 'Which sentence is in the passive voice?', ['The cat chased the mouse.', 'The mouse was chased by the cat.', 'The cat is chasing the mouse.', 'The cat will chase the mouse.'], 1, 'In passive voice the subject receives the action: "was chased by".'),
  q('lang_grammar', 9, 'hard', 'Which sentence has correct subject-verb agreement?', ['The team are winning.', 'Each of the players have a jersey.', 'Neither of the answers is correct.', 'The dogs barks loudly.'], 2, '"Neither" is singular, so it takes the singular verb "is".'),

  // ── Reading Comprehension (1-12) ──────────────────────────────────────────
  q('lang_reading', 1, 'easy', '"Sam fed his fish before school." What did Sam do first?', ['Went to school', 'Fed his fish', 'Ate lunch', 'Took a nap'], 1, 'The sentence says he fed the fish BEFORE school, so that came first.'),
  q('lang_reading', 3, 'easy', 'What do we call the main message or lesson of a story?', ['The setting', 'The theme', 'The title', 'The chapter'], 1, 'The theme is the big idea or lesson a story teaches.'),
  q('lang_reading', 4, 'medium', 'What is the "setting" of a story?', ['The main character', 'Where and when it happens', 'The ending', 'The author'], 1, 'Setting is the time and place of a story — like a castle long ago.'),
  q('lang_reading', 6, 'medium', '"The wind howled and shutters slammed as Mia gripped her flashlight." What mood does this create?', ['Cheerful', 'Tense and spooky', 'Bored', 'Silly'], 1, 'Words like "howled", "slammed", and "gripped" build suspense and a spooky mood.'),
  q('lang_reading', 8, 'hard', 'What is an inference?', ['Copying the text word for word', 'A conclusion drawn from clues in the text', 'The story’s title', 'A spelling rule'], 1, 'Readers infer by combining text clues with what they already know.'),
  q('lang_reading', 11, 'hard', 'An author writes an article to convince readers to recycle. What is the author’s purpose?', ['To entertain', 'To persuade', 'To confuse', 'To rhyme'], 1, 'Convincing readers to act or believe something is persuasion.'),

  // ── Writing & Composition (3-12) ──────────────────────────────────────────
  q('lang_writing', 3, 'easy', 'Which sentence is a complete sentence?', ['Running fast.', 'The dog barked.', 'Under the table.', 'Because it rained.'], 1, 'A complete sentence needs a subject (the dog) and a verb (barked).'),
  q('lang_writing', 4, 'medium', 'What does a topic sentence do?', ['Ends the essay', 'Tells the main idea of a paragraph', 'Lists every detail', 'Asks a riddle'], 1, 'A topic sentence introduces what the paragraph will be about.'),
  q('lang_writing', 5, 'medium', 'Which is the best order for a story?', ['End, middle, beginning', 'Beginning, middle, end', 'Middle only', 'Random order'], 1, 'Stories flow best with a clear beginning, middle, and end.'),
  q('lang_writing', 7, 'medium', 'Which transition word shows contrast?', ['Also', 'However', 'First', 'Next'], 1, '"However" signals a contrasting or opposite idea is coming.'),
  q('lang_writing', 9, 'hard', 'In a persuasive essay, what is a "counterargument"?', ['Your strongest point', 'The opposing side’s view that you address', 'The conclusion', 'A quotation'], 1, 'Strong writers present the other side’s view, then explain why their position still stands.'),
  q('lang_writing', 11, 'hard', 'What is a thesis statement?', ['A list of sources', 'The main claim an essay will support', 'The final sentence', 'A type of poem'], 1, 'The thesis states the essay’s central argument, usually at the end of the introduction.'),

  // ── Literature & Poetry (5-12) ────────────────────────────────────────────
  q('lang_literature', 5, 'easy', 'What literary device compares two things using "like" or "as"?', ['Metaphor', 'Simile', 'Alliteration', 'Hyperbole'], 1, 'A simile uses "like" or "as" to compare, e.g. "fast as lightning".'),
  q('lang_literature', 6, 'medium', '"The wind whispered through the trees" is an example of what?', ['Personification', 'Rhyme', 'Alliteration', 'Onomatopoeia'], 0, 'Giving human actions (whispering) to non-human things is personification.'),
  q('lang_literature', 7, 'medium', 'What is a haiku?', ['A long adventure novel', 'A 3-line poem with 5-7-5 syllables', 'A type of play', 'A newspaper article'], 1, 'A haiku is a short Japanese poem with 5, 7, and 5 syllables per line.'),
  q('lang_literature', 8, 'medium', 'What is the "climax" of a story?', ['The first sentence', 'The most exciting turning point', 'The list of characters', 'The dedication page'], 1, 'The climax is the peak of tension where the conflict comes to a head.'),
  q('lang_literature', 10, 'hard', '"I’ve told you a million times!" is an example of which device?', ['Simile', 'Hyperbole', 'Irony', 'Metaphor'], 1, 'Hyperbole is deliberate exaggeration for effect.'),
  q('lang_literature', 12, 'hard', 'A story’s narrator uses "I" and "me". What point of view is this?', ['Second person', 'Third person limited', 'First person', 'Omniscient'], 2, 'First-person narrators tell the story from their own perspective using "I".'),

  // ── Roots, Prefixes & Suffixes (4-9) ──────────────────────────────────────
  q('lang_roots', 4, 'easy', 'What does the prefix "re-" mean in "redo"?', ['Not', 'Again', 'Before', 'Under'], 1, '"Re-" means again — to redo is to do something again.'),
  q('lang_roots', 4, 'easy', 'What does the prefix "un-" mean in "unhappy"?', ['Very', 'Not', 'After', 'More'], 1, '"Un-" means not — unhappy means not happy.'),
  q('lang_roots', 5, 'medium', 'What does the suffix "-less" mean in "fearless"?', ['Full of', 'Without', 'Smaller', 'Again'], 1, '"-less" means without — fearless means without fear.'),
  q('lang_roots', 6, 'medium', 'The root "aqua" (as in aquarium) means what?', ['Air', 'Fire', 'Water', 'Earth'], 2, '"Aqua" is Latin for water — an aquarium holds water and fish.'),
  q('lang_roots', 8, 'hard', 'The Greek root "tele" in "telescope" and "telephone" means what?', ['Sound', 'Far', 'Light', 'Small'], 1, '"Tele" means far or distant — a telescope lets you see far away.'),
  q('lang_roots', 9, 'hard', 'Knowing "bene" means good, what does "benevolent" most likely mean?', ['Harmful', 'Kind and well-meaning', 'Invisible', 'Wealthy'], 1, '"Bene" (good) + "volent" (wishing) — benevolent means wishing others well.'),
];
