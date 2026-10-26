/* Class Time — Curated Writing/Spelling/Grammar Bank (v180)
 * 60 hand-authored questions. Every answer correct BY CONSTRUCTION.
 * Primary source for Writing/Spelling + Reading fallback. */
(function () {
  'use strict';
  const NS = (window.HeroAcademy = window.HeroAcademy || {});
  const WRITING_BANK = [
    {
      topic: 'Capitalization — sentence start',
      question: 'Which sentence starts with a capital letter?',
      options: ['The dog ran fast.', 'the dog ran fast.', 'the Dog ran fast.', 'the dog Ran fast.'],
      correct_answer: 'The dog ran fast.',
      explanation: 'A sentence always begins with a capital letter, so \'The\' is correct.',
      hint: 'Look at the very first letter of each sentence. Which one is big?',
      remediation: {
        intro: 'Let me show you how sentences begin.',
        steps: [
          { say: 'Every sentence starts with a capital letter.', board: { tool: 'writeWord', args: { word: 'The' } } },
          { say: 'Look: \'The dog ran fast.\' The first letter T is capital.', board: null },
          { say: 'The other sentences start with a small letter, so they are wrong.', board: null },
        ],
        outro: 'The first letter of a sentence is always capital.',
      },
    },
    {
      topic: 'Capitalization — sentence start',
      question: 'Which sentence is written correctly?',
      options: ['My cat is soft.', 'my cat is soft.', 'my Cat is soft.', 'my cat Is soft.'],
      correct_answer: 'My cat is soft.',
      explanation: 'The sentence must start with a capital letter, so \'My\' is correct.',
      hint: 'Which sentence has a big letter at the very start?',
      remediation: {
        intro: 'Let me show you.',
        steps: [
          { say: 'A sentence begins with a capital letter.', board: { tool: 'writeWord', args: { word: 'My' } } },
          { say: '\'My cat is soft.\' starts with a capital M.', board: null },
          { say: 'The others start small, so they are not correct.', board: null },
        ],
        outro: 'Always start a sentence with a capital letter.',
      },
    },
    {
      topic: 'Capitalization — names',
      question: 'Which name is written correctly?',
      options: ['Sam', 'sam', 'sAm', 'saM'],
      correct_answer: 'Sam',
      explanation: 'People\'s names always start with a capital letter, so \'Sam\' is correct.',
      hint: 'A person\'s name begins with a big letter.',
      remediation: {
        intro: 'Names are special words.',
        steps: [
          { say: 'A person\'s name always starts with a capital letter.', board: { tool: 'writeWord', args: { word: 'Sam' } } },
          { say: 'Sam begins with a capital S.', board: null },
          { say: 'We never write a name with a small first letter.', board: null },
        ],
        outro: 'Always capitalize people\'s names.',
      },
    },
    {
      topic: 'Capitalization — the word I',
      question: 'Which sentence is correct?',
      options: ['Today I feel happy.', 'Today i feel happy.', 'today i feel happy.', 'today I feel happy.'],
      correct_answer: 'Today I feel happy.',
      explanation: 'The word \'I\' is always capital, and the sentence starts with a capital too.',
      hint: 'The word that means yourself is always a big letter.',
      remediation: {
        intro: 'The word \'I\' is special.',
        steps: [
          { say: 'When you talk about yourself, \'I\' is always capital.', board: { tool: 'writeLetter', args: { letter: 'I' } } },
          { say: '\'Today I feel happy.\' has a capital T to start and a capital I.', board: null },
          { say: 'We never write \'i\' small when it means you.', board: null },
        ],
        outro: 'The word I is always capital.',
      },
    },
    {
      topic: 'Capitalization — days',
      question: 'Which day of the week is written correctly?',
      options: ['Monday', 'monday', 'MonDay', 'mondaY'],
      correct_answer: 'Monday',
      explanation: 'Days of the week always start with a capital letter, so \'Monday\' is correct.',
      hint: 'Days of the week begin with a big letter.',
      remediation: {
        intro: 'Days of the week are special words.',
        steps: [
          { say: 'Every day of the week starts with a capital letter.', board: { tool: 'writeWord', args: { word: 'Monday' } } },
          { say: 'Monday begins with a capital M.', board: null },
          { say: 'We always capitalize Monday, Tuesday, and the rest.', board: null },
        ],
        outro: 'Days of the week start with a capital letter.',
      },
    },
    {
      topic: 'Capitalization — places',
      question: 'Which sentence about a place is written correctly?',
      options: ['We live in Texas.', 'We live in texas.', 'we live in texas.', 'we live in Texas.'],
      correct_answer: 'We live in Texas.',
      explanation: 'The sentence starts with a capital, and \'Texas\' is a place name, so it\'s capital too.',
      hint: 'A place name and the start of a sentence both need big letters.',
      remediation: {
        intro: 'Place names are special.',
        steps: [
          { say: 'The names of places start with a capital letter.', board: { tool: 'writeWord', args: { word: 'Texas' } } },
          { say: '\'We live in Texas.\' starts with capital W and Texas has a capital T.', board: null },
          { say: 'Place names like Texas are always capitalized.', board: null },
        ],
        outro: 'Capitalize the names of places.',
      },
    },
    {
      topic: 'Capitalization — months',
      question: 'Which month is written correctly?',
      options: ['July', 'july', 'juLy', 'julY'],
      correct_answer: 'July',
      explanation: 'Months of the year always start with a capital letter, so \'July\' is correct.',
      hint: 'Months begin with a big letter.',
      remediation: {
        intro: 'Months are special words.',
        steps: [
          { say: 'Every month starts with a capital letter.', board: { tool: 'writeWord', args: { word: 'July' } } },
          { say: 'July begins with a capital J.', board: null },
          { say: 'We always capitalize July, June, and the other months.', board: null },
        ],
        outro: 'Months of the year start with a capital letter.',
      },
    },
    {
      topic: 'Capitalization — sentence start',
      question: 'Which sentence starts the right way?',
      options: ['Birds can fly high.', 'birds can fly high.', 'birds Can fly high.', 'birds can Fly high.'],
      correct_answer: 'Birds can fly high.',
      explanation: 'A sentence begins with a capital letter, so \'Birds\' is correct.',
      hint: 'Look for the big letter at the start.',
      remediation: {
        intro: 'Sentences begin with a capital.',
        steps: [
          { say: 'The first word gets a capital letter.', board: { tool: 'writeWord', args: { word: 'Birds' } } },
          { say: '\'Birds can fly high.\' starts with a capital B.', board: null },
          { say: 'The others start with a small b, so they are wrong.', board: null },
        ],
        outro: 'Start every sentence with a capital letter.',
      },
    },
    {
      topic: 'Capitalization — names',
      question: 'Which sentence with a name is written correctly?',
      options: ['I play with Max.', 'I play with max.', 'i play with max.', 'i play with Max.'],
      correct_answer: 'I play with Max.',
      explanation: '\'I\' is capital and \'Max\' is a name, so both are capital.',
      hint: 'The word for yourself and a person\'s name both need big letters.',
      remediation: {
        intro: 'Two special words here.',
        steps: [
          { say: '\'I\' is always capital, and a name like Max is capital too.', board: { tool: 'writeWord', args: { word: 'Max' } } },
          { say: '\'I play with Max.\' has a capital I and a capital M.', board: null },
          { say: 'We capitalize both I and people\'s names.', board: null },
        ],
        outro: 'Capitalize I and people\'s names.',
      },
    },
    {
      topic: 'Capitalization — sentence start',
      question: 'Which one is a correctly written sentence?',
      options: ['The sun is bright.', 'the sun is bright.', 'The sun is Bright.', 'the Sun is bright.'],
      correct_answer: 'The sun is bright.',
      explanation: 'A sentence starts with one capital letter at the beginning: \'The\'.',
      hint: 'Only the first word should have a big letter here.',
      remediation: {
        intro: 'Let me show you.',
        steps: [
          { say: 'A sentence starts with a capital, but the other words stay small.', board: { tool: 'writeWord', args: { word: 'The' } } },
          { say: '\'The sun is bright.\' has just one capital at the start.', board: null },
          { say: 'We do not put capitals in the middle for these words.', board: null },
        ],
        outro: 'Capitalize only the first word here.',
      },
    },
    {
      topic: 'Punctuation — asking',
      question: 'Which sentence is asking a question?',
      options: ['Where is my hat?', 'I lost my hat.', 'I found my hat!', 'My hat is blue.'],
      correct_answer: 'Where is my hat?',
      explanation: 'A question asks something and ends with a question mark.',
      hint: 'A question ends with a special curvy mark: ?',
      remediation: {
        intro: 'Questions ask something.',
        steps: [
          { say: 'A question ends with a question mark.', board: { tool: 'writeWord', args: { word: '?' } } },
          { say: '\'Where is my hat?\' is asking, so it uses a question mark.', board: null },
          { say: 'The others just tell us something, so they are not questions.', board: null },
        ],
        outro: 'Questions end with a question mark.',
      },
    },
    {
      topic: 'Punctuation — telling',
      question: 'Which sentence just tells us something?',
      options: ['The cat is sleeping.', 'Is the cat sleeping?', 'Wake up now!', 'Where is the cat?'],
      correct_answer: 'The cat is sleeping.',
      explanation: 'A telling sentence ends with a period.',
      hint: 'A sentence that tells something ends with a small dot: .',
      remediation: {
        intro: 'Telling sentences end with a period.',
        steps: [
          { say: 'When a sentence tells us something, it ends with a period.', board: { tool: 'writeWord', args: { word: '.' } } },
          { say: '\'The cat is sleeping.\' tells us a fact, so it uses a period.', board: null },
          { say: 'The others ask or shout, so they use different marks.', board: null },
        ],
        outro: 'Telling sentences end with a period.',
      },
    },
    {
      topic: 'Punctuation — excitement',
      question: 'Which sentence shows excitement?',
      options: ['We won the game!', 'We won the game.', 'Did we win the game?', 'The game is over.'],
      correct_answer: 'We won the game!',
      explanation: 'An exciting sentence ends with an exclamation point.',
      hint: 'A shouting, excited sentence ends with: !',
      remediation: {
        intro: 'Excited sentences are loud.',
        steps: [
          { say: 'When a sentence is exciting, it ends with an exclamation point.', board: { tool: 'writeWord', args: { word: '!' } } },
          { say: '\'We won the game!\' is exciting, so it uses an exclamation point.', board: null },
          { say: 'The others are calm or asking, so they are different.', board: null },
        ],
        outro: 'Exciting sentences end with an exclamation point.',
      },
    },
    {
      topic: 'Punctuation — asking',
      question: 'Which sentence is a question?',
      options: ['Do you like pizza?', 'I like pizza.', 'Pizza is yummy!', 'We eat pizza.'],
      correct_answer: 'Do you like pizza?',
      explanation: 'A question asks something and ends with a question mark.',
      hint: 'Find the sentence that is asking, not telling.',
      remediation: {
        intro: 'Questions ask things.',
        steps: [
          { say: 'A question ends with a question mark.', board: { tool: 'writeWord', args: { word: '?' } } },
          { say: '\'Do you like pizza?\' asks you something.', board: null },
          { say: 'The others tell about pizza, so they are not questions.', board: null },
        ],
        outro: 'Questions end with a question mark.',
      },
    },
    {
      topic: 'Punctuation — telling',
      question: 'Which sentence ends with a period because it tells something?',
      options: ['My bike is red.', 'Is your bike red?', 'I love my bike!', 'Where is the bike?'],
      correct_answer: 'My bike is red.',
      explanation: 'A sentence that tells a fact ends with a period.',
      hint: 'Look for the calm telling sentence.',
      remediation: {
        intro: 'Telling sentences use a period.',
        steps: [
          { say: 'A telling sentence ends with a period.', board: { tool: 'writeWord', args: { word: '.' } } },
          { say: '\'My bike is red.\' tells us a fact.', board: null },
          { say: 'The others ask or shout.', board: null },
        ],
        outro: 'Telling sentences end with a period.',
      },
    },
    {
      topic: 'Punctuation — asking',
      question: 'Which one needs a question mark?',
      options: ['What time is it?', 'It is three o\'clock.', 'I am late!', 'The clock is big.'],
      correct_answer: 'What time is it?',
      explanation: 'It asks something, so it needs a question mark.',
      hint: 'Which sentence is asking about something?',
      remediation: {
        intro: 'Asking needs a question mark.',
        steps: [
          { say: 'Asking sentences end with a question mark.', board: { tool: 'writeWord', args: { word: '?' } } },
          { say: '\'What time is it?\' is asking, so it needs a question mark.', board: null },
          { say: 'The others tell or shout.', board: null },
        ],
        outro: 'Asking sentences end with a question mark.',
      },
    },
    {
      topic: 'Punctuation — excitement',
      question: 'Which sentence should end with an exclamation point?',
      options: ['Look at that big dog!', 'I see a dog.', 'Is that a dog?', 'The dog is brown.'],
      correct_answer: 'Look at that big dog!',
      explanation: 'It shows strong feeling, so it ends with an exclamation point.',
      hint: 'Which sentence is the most excited?',
      remediation: {
        intro: 'Excited sentences are loud.',
        steps: [
          { say: 'Big feelings end with an exclamation point.', board: { tool: 'writeWord', args: { word: '!' } } },
          { say: '\'Look at that big dog!\' is excited.', board: null },
          { say: 'The others are calm or asking.', board: null },
        ],
        outro: 'Exciting sentences end with an exclamation point.',
      },
    },
    {
      topic: 'Punctuation — telling',
      question: 'Which sentence is a telling sentence?',
      options: ['We went to the park.', 'Did we go to the park?', 'What fun we had!', 'Where is the park?'],
      correct_answer: 'We went to the park.',
      explanation: 'It tells what happened, so it ends with a period.',
      hint: 'Find the calm sentence that tells what happened.',
      remediation: {
        intro: 'Telling sentences end with a period.',
        steps: [
          { say: 'A telling sentence ends with a period.', board: { tool: 'writeWord', args: { word: '.' } } },
          { say: '\'We went to the park.\' tells what we did.', board: null },
          { say: 'The others ask or shout.', board: null },
        ],
        outro: 'Telling sentences end with a period.',
      },
    },
    {
      topic: 'Punctuation — asking',
      question: 'Which sentence asks something?',
      options: ['Can I have a snack?', 'I want a snack.', 'Snacks are great!', 'Here is your snack.'],
      correct_answer: 'Can I have a snack?',
      explanation: 'It asks for something, so it ends with a question mark.',
      hint: 'Which sentence is asking?',
      remediation: {
        intro: 'Asking sentences ask.',
        steps: [
          { say: 'Asking sentences end with a question mark.', board: { tool: 'writeWord', args: { word: '?' } } },
          { say: '\'Can I have a snack?\' is asking.', board: null },
          { say: 'The others are telling or excited.', board: null },
        ],
        outro: 'Questions end with a question mark.',
      },
    },
    {
      topic: 'Punctuation — excitement',
      question: 'Which sentence is the most exciting?',
      options: ['Happy birthday to you!', 'It is my birthday.', 'When is your birthday?', 'I am seven.'],
      correct_answer: 'Happy birthday to you!',
      explanation: 'It shows joy and excitement, so it ends with an exclamation point.',
      hint: 'Which sentence sounds the happiest and loudest?',
      remediation: {
        intro: 'Exciting sentences are loud.',
        steps: [
          { say: 'Excited sentences end with an exclamation point.', board: { tool: 'writeWord', args: { word: '!' } } },
          { say: '\'Happy birthday to you!\' is full of excitement.', board: null },
          { say: 'The others just tell us something.', board: null },
        ],
        outro: 'Exciting sentences end with an exclamation point.',
      },
    },
    {
      topic: 'Short vowels — short a',
      question: 'Which word has the short \'a\' sound like in \'cat\'?',
      options: ['map', 'make', 'mail', 'mean'],
      correct_answer: 'map',
      explanation: 'Map has the short a sound, just like cat.',
      hint: 'Short a sounds like \'aaa\' — the sound in cat.',
      remediation: {
        intro: 'Listen for short a.',
        steps: [
          { say: 'Short a sounds like \'aaa\'. Listen: cat, map, bag.', board: { tool: 'writeWord', args: { word: 'map' } } },
          { say: 'Map has that same short a sound.', board: null },
          { say: 'The other words have long sounds, not short a.', board: null },
        ],
        outro: 'Short a sounds like the a in cat.',
      },
    },
    {
      topic: 'Short vowels — short e',
      question: 'Which word has the short \'e\' sound like in \'bed\'?',
      options: ['pen', 'pea', 'pie', 'pine'],
      correct_answer: 'pen',
      explanation: 'Pen has the short e sound, just like bed.',
      hint: 'Short e sounds like \'eh\' — the sound in bed.',
      remediation: {
        intro: 'Listen for short e.',
        steps: [
          { say: 'Short e sounds like \'eh\'. Listen: bed, pen, red.', board: { tool: 'writeWord', args: { word: 'pen' } } },
          { say: 'Pen has that short e sound.', board: null },
          { say: 'The other words do not have short e.', board: null },
        ],
        outro: 'Short e sounds like the e in bed.',
      },
    },
    {
      topic: 'Short vowels — short i',
      question: 'Which word has the short \'i\' sound like in \'pig\'?',
      options: ['win', 'wine', 'wide', 'white'],
      correct_answer: 'win',
      explanation: 'Win has the short i sound, just like pig.',
      hint: 'Short i sounds like \'ih\' — the sound in pig.',
      remediation: {
        intro: 'Listen for short i.',
        steps: [
          { say: 'Short i sounds like \'ih\'. Listen: pig, win, sit.', board: { tool: 'writeWord', args: { word: 'win' } } },
          { say: 'Win has that short i sound.', board: null },
          { say: 'The other words have a long i sound.', board: null },
        ],
        outro: 'Short i sounds like the i in pig.',
      },
    },
    {
      topic: 'Short vowels — short o',
      question: 'Which word has the short \'o\' sound like in \'dog\'?',
      options: ['pot', 'road', 'boat', 'rope'],
      correct_answer: 'pot',
      explanation: 'Pot has the short o sound, just like dog.',
      hint: 'Short o sounds like \'aah\' — the sound in dog.',
      remediation: {
        intro: 'Listen for short o.',
        steps: [
          { say: 'Short o sounds like \'ahh\'. Listen: dog, pot, hop.', board: { tool: 'writeWord', args: { word: 'pot' } } },
          { say: 'Pot has that short o sound.', board: null },
          { say: 'The other words have a long o sound.', board: null },
        ],
        outro: 'Short o sounds like the o in dog.',
      },
    },
    {
      topic: 'Short vowels — short u',
      question: 'Which word has the short \'u\' sound like in \'sun\'?',
      options: ['bug', 'blue', 'cube', 'tube'],
      correct_answer: 'bug',
      explanation: 'Bug has the short u sound, just like sun.',
      hint: 'Short u sounds like \'uh\' — the sound in sun.',
      remediation: {
        intro: 'Listen for short u.',
        steps: [
          { say: 'Short u sounds like \'uh\'. Listen: sun, bug, cup.', board: { tool: 'writeWord', args: { word: 'bug' } } },
          { say: 'Bug has that short u sound.', board: null },
          { say: 'The other words do not have short u.', board: null },
        ],
        outro: 'Short u sounds like the u in sun.',
      },
    },
    {
      topic: 'Blending — CVC',
      question: 'Blend the sounds: /h/ /a/ /t/. What word is it?',
      options: ['hat', 'hit', 'hot', 'hut'],
      correct_answer: 'hat',
      explanation: 'h-a-t blends together to make hat.',
      hint: 'Say each sound slowly, then push them together.',
      remediation: {
        intro: 'Let\'s blend the sounds.',
        steps: [
          { say: 'We say each sound: h... a... t.', board: { tool: 'writeWord', args: { word: 'hat' } } },
          { say: 'Push them together: h-a-t makes hat.', board: null },
          { say: 'The middle sound is short a, so it\'s hat.', board: null },
        ],
        outro: 'Blend the sounds to read the word.',
      },
    },
    {
      topic: 'Blending — CVC',
      question: 'Blend the sounds: /b/ /e/ /d/. What word is it?',
      options: ['bed', 'bad', 'bid', 'bud'],
      correct_answer: 'bed',
      explanation: 'b-e-d blends together to make bed.',
      hint: 'Say each sound, then say them fast together.',
      remediation: {
        intro: 'Let\'s blend.',
        steps: [
          { say: 'We say: b... e... d.', board: { tool: 'writeWord', args: { word: 'bed' } } },
          { say: 'Push them together: b-e-d makes bed.', board: null },
          { say: 'The middle sound is short e, so it\'s bed.', board: null },
        ],
        outro: 'Blend the sounds to read the word.',
      },
    },
    {
      topic: 'Blending — CVC',
      question: 'Blend the sounds: /p/ /i/ /n/. What word is it?',
      options: ['pin', 'pan', 'pen', 'pun'],
      correct_answer: 'pin',
      explanation: 'p-i-n blends together to make pin.',
      hint: 'Say each sound slowly, then blend them.',
      remediation: {
        intro: 'Let\'s blend.',
        steps: [
          { say: 'We say: p... i... n.', board: { tool: 'writeWord', args: { word: 'pin' } } },
          { say: 'Push them together: p-i-n makes pin.', board: null },
          { say: 'The middle sound is short i, so it\'s pin.', board: null },
        ],
        outro: 'Blend the sounds to read the word.',
      },
    },
    {
      topic: 'Short vowels — short a',
      question: 'Which word has the short \'a\' sound?',
      options: ['bag', 'bake', 'bay', 'bead'],
      correct_answer: 'bag',
      explanation: 'Bag has the short a sound like in cat.',
      hint: 'Listen for the \'aaa\' sound.',
      remediation: {
        intro: 'Listen for short a.',
        steps: [
          { say: 'Short a is \'aaa\'. Listen: bag, cat, ham.', board: { tool: 'writeWord', args: { word: 'bag' } } },
          { say: 'Bag has that short a sound.', board: null },
          { say: 'The others have long sounds.', board: null },
        ],
        outro: 'Short a sounds like the a in cat.',
      },
    },
    {
      topic: 'Short vowels — short o',
      question: 'Which word has the short \'o\' sound?',
      options: ['top', 'toe', 'tow', 'toad'],
      correct_answer: 'top',
      explanation: 'Top has the short o sound like in dog.',
      hint: 'Listen for the \'ahh\' sound.',
      remediation: {
        intro: 'Listen for short o.',
        steps: [
          { say: 'Short o is \'ahh\'. Listen: top, dog, mop.', board: { tool: 'writeWord', args: { word: 'top' } } },
          { say: 'Top has that short o sound.', board: null },
          { say: 'The others have a long o sound.', board: null },
        ],
        outro: 'Short o sounds like the o in dog.',
      },
    },
    {
      topic: 'Word family — -at',
      question: 'Which word is in the \'-at\' family (rhymes with \'cat\')?',
      options: ['bat', 'bit', 'but', 'bet'],
      correct_answer: 'bat',
      explanation: 'Bat rhymes with cat — they are both in the -at family.',
      hint: 'Which word ends with the same sound as cat?',
      remediation: {
        intro: 'Let\'s find the -at family.',
        steps: [
          { say: 'Words in the -at family end with \'at\'. Like cat, hat, bat.', board: { tool: 'writeWord', args: { word: 'bat' } } },
          { say: 'Bat ends with -at, so it rhymes with cat.', board: null },
          { say: 'The others end with different sounds.', board: null },
        ],
        outro: 'Words in the -at family rhyme with cat.',
      },
    },
    {
      topic: 'Word family — -an',
      question: 'Which word rhymes with \'pan\' (the \'-an\' family)?',
      options: ['man', 'men', 'min', 'mine'],
      correct_answer: 'man',
      explanation: 'Man rhymes with pan — both end with -an.',
      hint: 'Which word ends with the same sound as pan?',
      remediation: {
        intro: 'Let\'s find the -an family.',
        steps: [
          { say: 'Words in the -an family end with \'an\'. Like pan, can, man.', board: { tool: 'writeWord', args: { word: 'man' } } },
          { say: 'Man ends with -an, so it rhymes with pan.', board: null },
          { say: 'The others end differently.', board: null },
        ],
        outro: 'Words in the -an family rhyme with pan.',
      },
    },
    {
      topic: 'Word family — -ig',
      question: 'Which word is in the \'-ig\' family (rhymes with \'pig\')?',
      options: ['dig', 'dog', 'dug', 'bag'],
      correct_answer: 'dig',
      explanation: 'Dig rhymes with pig — both end with -ig.',
      hint: 'Which word ends with the same sound as pig?',
      remediation: {
        intro: 'Let\'s find the -ig family.',
        steps: [
          { say: 'Words in the -ig family end with \'ig\'. Like pig, big, dig.', board: { tool: 'writeWord', args: { word: 'dig' } } },
          { say: 'Dig ends with -ig, so it rhymes with pig.', board: null },
          { say: 'The others end with different sounds.', board: null },
        ],
        outro: 'Words in the -ig family rhyme with pig.',
      },
    },
    {
      topic: 'Word family — -op',
      question: 'Which word rhymes with \'hop\' (the \'-op\' family)?',
      options: ['top', 'tap', 'tip', 'tube'],
      correct_answer: 'top',
      explanation: 'Top rhymes with hop — both end with -op.',
      hint: 'Which word ends with the same sound as hop?',
      remediation: {
        intro: 'Let\'s find the -op family.',
        steps: [
          { say: 'Words in the -op family end with \'op\'. Like hop, top, mop.', board: { tool: 'writeWord', args: { word: 'top' } } },
          { say: 'Top ends with -op, so it rhymes with hop.', board: null },
          { say: 'The others end differently.', board: null },
        ],
        outro: 'Words in the -op family rhyme with hop.',
      },
    },
    {
      topic: 'Word family — -un',
      question: 'Which word is in the \'-un\' family (rhymes with \'sun\')?',
      options: ['run', 'ran', 'rain', 'rin'],
      correct_answer: 'run',
      explanation: 'Run rhymes with sun — both end with -un.',
      hint: 'Which word ends with the same sound as sun?',
      remediation: {
        intro: 'Let\'s find the -un family.',
        steps: [
          { say: 'Words in the -un family end with \'un\'. Like sun, fun, run.', board: { tool: 'writeWord', args: { word: 'run' } } },
          { say: 'Run ends with -un, so it rhymes with sun.', board: null },
          { say: 'The others end with different sounds.', board: null },
        ],
        outro: 'Words in the -un family rhyme with sun.',
      },
    },
    {
      topic: 'Rhyming',
      question: 'Which word rhymes with \'tree\'?',
      options: ['bee', 'boat', 'book', 'ball'],
      correct_answer: 'bee',
      explanation: 'Bee rhymes with tree — they end with the same sound.',
      hint: 'Say the words out loud. Which one sounds like tree at the end?',
      remediation: {
        intro: 'Let\'s find the rhyme.',
        steps: [
          { say: 'Rhyming words end with the same sound. Tree and bee both end in \'ee\'.', board: { tool: 'writeWord', args: { word: 'bee' } } },
          { say: 'Bee rhymes with tree.', board: null },
          { say: 'The others do not rhyme with tree.', board: null },
        ],
        outro: 'Rhyming words end with the same sound.',
      },
    },
    {
      topic: 'Rhyming',
      question: 'Which word rhymes with \'cake\'?',
      options: ['lake', 'lick', 'lock', 'luck'],
      correct_answer: 'lake',
      explanation: 'Lake rhymes with cake — they end with the same sound.',
      hint: 'Which word sounds like cake at the end?',
      remediation: {
        intro: 'Let\'s find the rhyme.',
        steps: [
          { say: 'Cake and lake both end in \'ake\'.', board: { tool: 'writeWord', args: { word: 'lake' } } },
          { say: 'Lake rhymes with cake.', board: null },
          { say: 'The others do not rhyme with cake.', board: null },
        ],
        outro: 'Rhyming words end with the same sound.',
      },
    },
    {
      topic: 'Word family — -ig',
      question: 'Which word rhymes with \'big\'?',
      options: ['wig', 'wag', 'wug', 'wing'],
      correct_answer: 'wig',
      explanation: 'Wig rhymes with big — both end with -ig.',
      hint: 'Which word ends like big?',
      remediation: {
        intro: 'Let\'s find the rhyme.',
        steps: [
          { say: 'Big and wig both end in \'ig\'.', board: { tool: 'writeWord', args: { word: 'wig' } } },
          { say: 'Wig rhymes with big.', board: null },
          { say: 'The others do not rhyme with big.', board: null },
        ],
        outro: 'Words in the -ig family rhyme with big.',
      },
    },
    {
      topic: 'Sight word — said',
      question: 'Which word is spelled correctly: the word \'said\'?',
      options: ['said', 'sed', 'sayd', 'saed'],
      correct_answer: 'said',
      explanation: 'The sight word is spelled s-a-i-d: said.',
      hint: 'This is a tricky word to memorize. It has \'ai\' in the middle.',
      remediation: {
        intro: 'Let\'s learn \'said\'.',
        steps: [
          { say: 'The word said is spelled s-a-i-d.', board: { tool: 'writeWord', args: { word: 'said' } } },
          { say: 'It has an a and an i together in the middle.', board: null },
          { say: 'We memorize said because it does not sound the way it looks.', board: null },
        ],
        outro: 'Said is spelled s-a-i-d.',
      },
    },
    {
      topic: 'Sight word — have',
      question: 'Which word is spelled correctly: the word \'have\'?',
      options: ['have', 'hav', 'haf', 'havv'],
      correct_answer: 'have',
      explanation: 'The sight word is spelled h-a-v-e: have.',
      hint: 'It ends with a silent e.',
      remediation: {
        intro: 'Let\'s learn \'have\'.',
        steps: [
          { say: 'The word have is spelled h-a-v-e.', board: { tool: 'writeWord', args: { word: 'have' } } },
          { say: 'It ends with a silent e.', board: null },
          { say: 'We memorize have as a sight word.', board: null },
        ],
        outro: 'Have is spelled h-a-v-e.',
      },
    },
    {
      topic: 'Sight word — they',
      question: 'Which word is spelled correctly: the word \'they\'?',
      options: ['they', 'thay', 'they\'', 'thai'],
      correct_answer: 'they',
      explanation: 'The sight word is spelled t-h-e-y: they.',
      hint: 'It ends with \'ey\'.',
      remediation: {
        intro: 'Let\'s learn \'they\'.',
        steps: [
          { say: 'The word they is spelled t-h-e-y.', board: { tool: 'writeWord', args: { word: 'they' } } },
          { say: 'It ends with the letters e and y.', board: null },
          { say: 'We memorize they as a sight word.', board: null },
        ],
        outro: 'They is spelled t-h-e-y.',
      },
    },
    {
      topic: 'Sight word — was',
      question: 'Which word is spelled correctly: the word \'was\'?',
      options: ['was', 'wuz', 'wos', 'wass'],
      correct_answer: 'was',
      explanation: 'The sight word is spelled w-a-s: was.',
      hint: 'It sounds like \'wuz\' but we spell it w-a-s.',
      remediation: {
        intro: 'Let\'s learn \'was\'.',
        steps: [
          { say: 'The word was is spelled w-a-s.', board: { tool: 'writeWord', args: { word: 'was' } } },
          { say: 'It sounds like \'wuz\' but we always write w-a-s.', board: null },
          { say: 'We memorize was as a sight word.', board: null },
        ],
        outro: 'Was is spelled w-a-s.',
      },
    },
    {
      topic: 'Sight word — where',
      question: 'Which word is spelled correctly: the word \'where\'?',
      options: ['where', 'wher', 'were', 'whair'],
      correct_answer: 'where',
      explanation: 'The sight word is spelled w-h-e-r-e: where.',
      hint: 'It starts with \'wh\' and ends with a silent e.',
      remediation: {
        intro: 'Let\'s learn \'where\'.',
        steps: [
          { say: 'The word where is spelled w-h-e-r-e.', board: { tool: 'writeWord', args: { word: 'where' } } },
          { say: 'It starts with wh and ends with a silent e.', board: null },
          { say: 'We memorize where as a sight word.', board: null },
        ],
        outro: 'Where is spelled w-h-e-r-e.',
      },
    },
    {
      topic: 'Sight word — come',
      question: 'Which word is spelled correctly: the word \'come\'?',
      options: ['come', 'cum', 'cme', 'comm'],
      correct_answer: 'come',
      explanation: 'The sight word is spelled c-o-m-e: come.',
      hint: 'It ends with a silent e.',
      remediation: {
        intro: 'Let\'s learn \'come\'.',
        steps: [
          { say: 'The word come is spelled c-o-m-e.', board: { tool: 'writeWord', args: { word: 'come' } } },
          { say: 'It ends with a silent e.', board: null },
          { say: 'We memorize come as a sight word.', board: null },
        ],
        outro: 'Come is spelled c-o-m-e.',
      },
    },
    {
      topic: 'Sight word — your',
      question: 'Which word is spelled correctly: the word \'your\'?',
      options: ['your', 'yor', 'yur', 'youre'],
      correct_answer: 'your',
      explanation: 'The sight word is spelled y-o-u-r: your.',
      hint: 'It has \'our\' at the end.',
      remediation: {
        intro: 'Let\'s learn \'your\'.',
        steps: [
          { say: 'The word your is spelled y-o-u-r.', board: { tool: 'writeWord', args: { word: 'your' } } },
          { say: 'It ends with the letters o, u, r.', board: null },
          { say: 'We memorize your as a sight word.', board: null },
        ],
        outro: 'Your is spelled y-o-u-r.',
      },
    },
    {
      topic: 'Sight word — there',
      question: 'Which word is spelled correctly: the word \'there\'?',
      options: ['there', 'ther', 'thair', 'theer'],
      correct_answer: 'there',
      explanation: 'The sight word is spelled t-h-e-r-e: there.',
      hint: 'It ends with a silent e, like \'here\' with a t.',
      remediation: {
        intro: 'Let\'s learn \'there\'.',
        steps: [
          { say: 'The word there is spelled t-h-e-r-e.', board: { tool: 'writeWord', args: { word: 'there' } } },
          { say: 'It has the word \'here\' inside it with a t in front.', board: null },
          { say: 'We memorize there as a sight word.', board: null },
        ],
        outro: 'There is spelled t-h-e-r-e.',
      },
    },
    {
      topic: 'Plurals — add s',
      question: 'What is the word for more than one \'cat\'?',
      options: ['cats', 'cat', 'cates', 'catz'],
      correct_answer: 'cats',
      explanation: 'We add s to make cat into cats.',
      hint: 'To mean more than one, we usually add the letter s.',
      remediation: {
        intro: 'Let\'s make it plural.',
        steps: [
          { say: 'To mean more than one, we add s. One cat, two cats.', board: { tool: 'writeWord', args: { word: 'cats' } } },
          { say: 'Cat plus s makes cats.', board: null },
          { say: 'That is how we show there is more than one.', board: null },
        ],
        outro: 'Add s to mean more than one.',
      },
    },
    {
      topic: 'Plurals — add s',
      question: 'What is the word for more than one \'dog\'?',
      options: ['dogs', 'dog', 'doges', 'dogz'],
      correct_answer: 'dogs',
      explanation: 'We add s to make dog into dogs.',
      hint: 'Add the letter s to mean more than one.',
      remediation: {
        intro: 'Let\'s make it plural.',
        steps: [
          { say: 'To mean more than one, we add s. One dog, two dogs.', board: { tool: 'writeWord', args: { word: 'dogs' } } },
          { say: 'Dog plus s makes dogs.', board: null },
          { say: 'That shows more than one.', board: null },
        ],
        outro: 'Add s to mean more than one.',
      },
    },
    {
      topic: 'Plurals — add es',
      question: 'What is the word for more than one \'box\'?',
      options: ['boxes', 'boxs', 'box', 'boxies'],
      correct_answer: 'boxes',
      explanation: 'Words ending in x add \'es\', so box becomes boxes.',
      hint: 'When a word ends in x, we add \'es\', not just s.',
      remediation: {
        intro: 'Let\'s make it plural.',
        steps: [
          { say: 'Words that end in x get \'es\'. One box, two boxes.', board: { tool: 'writeWord', args: { word: 'boxes' } } },
          { say: 'Box plus es makes boxes.', board: null },
          { say: 'We add es so it is easy to say.', board: null },
        ],
        outro: 'Words ending in x add es.',
      },
    },
    {
      topic: 'Plurals — add es',
      question: 'What is the word for more than one \'bus\'?',
      options: ['buses', 'buss', 'bus', 'busies'],
      correct_answer: 'buses',
      explanation: 'Words ending in s add \'es\', so bus becomes buses.',
      hint: 'When a word ends in s, we add \'es\'.',
      remediation: {
        intro: 'Let\'s make it plural.',
        steps: [
          { say: 'Words that end in s get \'es\'. One bus, two buses.', board: { tool: 'writeWord', args: { word: 'buses' } } },
          { say: 'Bus plus es makes buses.', board: null },
          { say: 'We add es so it is easy to say.', board: null },
        ],
        outro: 'Words ending in s add es.',
      },
    },
    {
      topic: 'Endings — ing',
      question: 'Add -ing to \'jump\'. What is the new word?',
      options: ['jumping', 'jumpping', 'jumpeing', 'jumping\''],
      correct_answer: 'jumping',
      explanation: 'Jump plus ing makes jumping.',
      hint: 'Just add the letters i-n-g to the end of jump.',
      remediation: {
        intro: 'Let\'s add ing.',
        steps: [
          { say: 'We add ing to show it is happening now. Jump becomes jumping.', board: { tool: 'writeWord', args: { word: 'jumping' } } },
          { say: 'Jump plus ing makes jumping.', board: null },
          { say: 'We do not double the p in jump.', board: null },
        ],
        outro: 'Add ing to show it is happening now.',
      },
    },
    {
      topic: 'Endings — ing',
      question: 'Add -ing to \'play\'. What is the new word?',
      options: ['playing', 'plaing', 'playying', 'playeing'],
      correct_answer: 'playing',
      explanation: 'Play plus ing makes playing.',
      hint: 'Add i-n-g to the end of play.',
      remediation: {
        intro: 'Let\'s add ing.',
        steps: [
          { say: 'We add ing to play. Play becomes playing.', board: { tool: 'writeWord', args: { word: 'playing' } } },
          { say: 'Play plus ing makes playing.', board: null },
          { say: 'We keep the whole word play and add ing.', board: null },
        ],
        outro: 'Add ing to show it is happening now.',
      },
    },
    {
      topic: 'Endings — ed',
      question: 'Add -ed to \'walk\' to mean it already happened.',
      options: ['walked', 'walkd', 'walded', 'walkeded'],
      correct_answer: 'walked',
      explanation: 'Walk plus ed makes walked, which means it happened before.',
      hint: 'Add e-d to show it already happened.',
      remediation: {
        intro: 'Let\'s add ed.',
        steps: [
          { say: 'We add ed to show it already happened. Walk becomes walked.', board: { tool: 'writeWord', args: { word: 'walked' } } },
          { say: 'Walk plus ed makes walked.', board: null },
          { say: 'Ed at the end means it is in the past.', board: null },
        ],
        outro: 'Add ed to show it already happened.',
      },
    },
    {
      topic: 'Complete sentence',
      question: 'Which one is a complete sentence?',
      options: ['The bird sings.', 'The bird.', 'Sings loud.', 'The the bird.'],
      correct_answer: 'The bird sings.',
      explanation: 'A complete sentence has a naming part and a doing part: \'The bird sings.\'',
      hint: 'A full sentence tells who and what they do.',
      remediation: {
        intro: 'Complete sentences are whole.',
        steps: [
          { say: 'A sentence needs a naming part and a doing part.', board: { tool: 'writeWord', args: { word: 'The bird sings' } } },
          { say: '\'The bird sings.\' tells who (the bird) and what (sings).', board: null },
          { say: 'The others are missing a part, so they are not complete.', board: null },
        ],
        outro: 'A complete sentence has a who and a doing part.',
      },
    },
    {
      topic: 'Complete sentence',
      question: 'Which group of words is a complete sentence?',
      options: ['My mom drives.', 'My mom.', 'Drives fast.', 'The and mom.'],
      correct_answer: 'My mom drives.',
      explanation: 'It has a naming part (My mom) and a doing part (drives).',
      hint: 'Look for the one that tells who and what they do.',
      remediation: {
        intro: 'Complete sentences are whole.',
        steps: [
          { say: 'A sentence needs a who and a doing word.', board: { tool: 'writeWord', args: { word: 'My mom drives' } } },
          { say: '\'My mom drives.\' tells who and what.', board: null },
          { say: 'The others are missing a part.', board: null },
        ],
        outro: 'A complete sentence has a who and a doing part.',
      },
    },
    {
      topic: 'Complete sentence',
      question: 'Which one is a whole, complete sentence?',
      options: ['We eat lunch.', 'We lunch.', 'Eat now.', 'We eat the the.'],
      correct_answer: 'We eat lunch.',
      explanation: 'It has a who (We) and a doing part (eat lunch).',
      hint: 'Find the one that makes a whole thought.',
      remediation: {
        intro: 'Complete sentences make sense.',
        steps: [
          { say: 'A complete sentence makes a whole thought.', board: { tool: 'writeWord', args: { word: 'We eat lunch' } } },
          { say: '\'We eat lunch.\' tells who and what.', board: null },
          { say: 'The others are not whole thoughts.', board: null },
        ],
        outro: 'A complete sentence is a whole thought.',
      },
    },
    {
      topic: 'Complete sentence',
      question: 'Which is a complete sentence?',
      options: ['Dogs like to run.', 'Dogs like.', 'To run fast.', 'Dogs run run the.'],
      correct_answer: 'Dogs like to run.',
      explanation: 'It tells who (Dogs) and what they do (like to run).',
      hint: 'Look for the whole idea.',
      remediation: {
        intro: 'Complete sentences are whole.',
        steps: [
          { say: 'A sentence tells who and what.', board: { tool: 'writeWord', args: { word: 'Dogs like to run' } } },
          { say: '\'Dogs like to run.\' is a whole idea.', board: null },
          { say: 'The others are missing something.', board: null },
        ],
        outro: 'A complete sentence has a who and a doing part.',
      },
    },
    {
      topic: 'Sentence vs fragment',
      question: 'Which one is NOT a complete sentence?',
      options: ['Under the bed.', 'The cat hid.', 'I see you.', 'Birds fly.'],
      correct_answer: 'Under the bed.',
      explanation: '\'Under the bed.\' has no doing part, so it is not complete.',
      hint: 'Which one is missing a doing word?',
      remediation: {
        intro: 'Some groups of words are not sentences.',
        steps: [
          { say: 'A complete sentence needs a who and a doing word.', board: null },
          { say: '\'Under the bed.\' tells where, but not who or what they do.', board: null },
          { say: 'The others each have a who and a doing word.', board: null },
        ],
        outro: 'A fragment is missing a part.',
      },
    },
    {
      topic: 'Complete sentence',
      question: 'Which group of words makes a complete sentence?',
      options: ['The sun is hot.', 'The sun.', 'Is hot today.', 'Sun the hot.'],
      correct_answer: 'The sun is hot.',
      explanation: 'It has a naming part (The sun) and a doing part (is hot).',
      hint: 'Find the whole sentence.',
      remediation: {
        intro: 'Complete sentences are whole.',
        steps: [
          { say: 'A sentence needs a who and a telling part.', board: { tool: 'writeWord', args: { word: 'The sun is hot' } } },
          { say: '\'The sun is hot.\' tells who and what.', board: null },
          { say: 'The others are not complete.', board: null },
        ],
        outro: 'A complete sentence has a who and a doing part.',
      },
    },
    {
      topic: 'Complete sentence',
      question: 'Which one tells a complete idea?',
      options: ['I like my school.', 'I like.', 'My school.', 'Like school the.'],
      correct_answer: 'I like my school.',
      explanation: 'It has a who (I) and a doing part (like my school).',
      hint: 'Look for the whole thought.',
      remediation: {
        intro: 'Complete sentences are whole.',
        steps: [
          { say: 'A sentence is a whole thought with a who and a doing word.', board: { tool: 'writeWord', args: { word: 'I like my school' } } },
          { say: '\'I like my school.\' tells who and what.', board: null },
          { say: 'The others are missing a part.', board: null },
        ],
        outro: 'A complete sentence has a who and a doing part.',
      },
    },
  ];
  // Days since an epoch → a block index. Each day advances by a full window of
  // `count` so consecutive days pull NON-OVERLAPPING questions. With 60 questions
  // and 8/day, that's 7 fully-distinct days before any reuse.
  function daysSinceEpoch(dateStr) {
    const s = String(dateStr || '');
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    let dayNum;
    if (m) {
      dayNum = Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000);
    } else {
      // Fallback: stable hash of the string
      let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
      dayNum = h;
    }
    return dayNum;
  }
  function pickForDate(dateStr, n) {
    const count = Math.max(1, n || 8);
    const total = WRITING_BANK.length;
    const blocks = Math.max(1, Math.floor(total / count)); // distinct windows available
    const block = daysSinceEpoch(dateStr) % blocks;        // which window today uses
    const start = block * count;
    const out = [];
    for (let i = 0; i < count; i++) out.push(WRITING_BANK[(start + i) % total]);
    return out;
  }
  NS.WritingBank = { all: WRITING_BANK, count: WRITING_BANK.length, pickForDate };
})();
