// =========================================================================
// Class Time v3 (v171) — multiple choice + whiteboard remediation.
//
// Major redesign goals motivated by field reports:
//  - ConvAI listening was unreliable, silence detection was unreliable, the
//    canvas-vision wakeup was unreliable.
//  - The new flow: Humphrey TTS-reads the question + every option, buttons
//    stay disabled until she finishes, Nigel taps to answer.
//  - Wrong twice → Humphrey uses the whiteboard to TEACH the solution step
//    by step (driven by front-end, NOT an agent — no listening required).
//
// What's preserved from prior versions:
//  - 4 courses per day (math / reading / spelling / science)
//  - 15-min break overlay between courses (v158)
//  - ha_day_lesson_plans + ha_course_attempts for routing/resume (v158/v163)
//  - Exit-saves-progress via sendBeacon (v163)
//  - Today's Mission integration on home (v146/v151)
//
// What's retired:
//  - ConvAI session, listening, silence detection, nudge button (v166)
//  - Canvas vision wakeup (v167)
//  - Topic auto-advance watcher (v154)
//  - "Your Space" — Nigel's drawing canvas (he taps, doesn't draw)
//  - Voice cap UI (TTS is cheap, no per-conversation gating)
//
// What stays for remediation only:
//  - class-time-board.js (writeWord, writeLetter, drawEquation, showVisual)
//  - class-time-visuals.js (SVG library for showVisual)
// =========================================================================

(function () {
  'use strict';

  const NS = (window.HeroAcademy = window.HeroAcademy || {});

  // -------- Config --------
  const CHILD_ID = '2e0e51c5-f120-4152-8aa1-041eeecc8165'; // Nigel
  const COURSES_PER_DAY = 4;
  const QUESTIONS_PER_COURSE = 8;
  const TTS_FALLBACK_MS = 35000; // v179: bumped from 25000
  const STEP_PAUSE_MS = 600;     // Pause between demo steps
  const FEEDBACK_PAUSE_MS = 1200; // Pause after right/wrong feedback before advancing
  // v175: POST_CORRECT used to be a fixed 5000ms race against TTS, meaning
  // Humphrey got cut off on longer explanations. Now we WAIT for TTS to
  // finish, then add a breathing-room pause for Nigel to absorb.
  const POST_SPEECH_PAUSE_MS = 2000; // pause AFTER TTS finishes, not a race against it
  const TTS_SAFETY_MS = 35000; // v179: bumped from 20000

  const SUBJECTS = ['math', 'reading', 'spelling', 'science'];
  const SUBJECT_LABEL = { math: 'Math', reading: 'Reading', spelling: 'Spelling', science: 'Science' };

  // -------- State --------
  const state = {
    today: todayISO(),
    dayPlan: null,
    courseProgress: null,
    courseIdx: 0,            // 0..3
    subject: 'math',
    questions: [],           // array of QuestionDef
    qIdx: 0,                 // index into state.questions
    wrongAttempts: 0,        // for the current question
    ttsLocked: true,         // true while Humphrey is reading
    inDemo: false,
    muted: false,
    abortDemo: false,
  };

  function todayISO() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // =====================================================================
  // Hardcoded v171 question bank — proves the loop end-to-end. v172 will
  // swap to /api/class-time/questions with Haiku-generated daily-fresh
  // questions + remediation scripts.
  //
  // Each question has:
  //   topic: string label
  //   question: string
  //   options: string[] (3 or 4 options)
  //   correct_index: number
  //   explanation: string (short, said on correct OR after demo)
  //   hint: string (said after first wrong attempt)
  //   remediation: {
  //     intro: string,
  //     steps: [{ say: string, board: { tool, args } | null }, ...],
  //     outro: string
  //   }
  // Board tools: writeWord({word}), writeLetter({letter}), drawEquation({equation}), showVisual({topic}), clearBoard()
  // =====================================================================
  const V171_BANK = {
    math: [
      {
        topic: 'Addition within 20',
        question: 'What is 7 + 5?',
        options: ['10', '11', '12', '13'],
        correct_index: 2,
        explanation: 'Seven plus five equals twelve.',
        hint: 'Try counting up from 7 — eight, nine, ten…',
        remediation: {
          intro: "Let me show you how to solve seven plus five.",
          steps: [
            { say: "First, let's write down the problem.", board: { tool: 'drawEquation', args: { equation: '7 + 5 = ?' } } },
            { say: "We start at seven. Now we count up five more: eight, nine, ten, eleven, twelve.", board: null },
            { say: "So seven plus five equals twelve.", board: { tool: 'drawEquation', args: { equation: '7 + 5 = 12' } } },
          ],
          outro: "Now you've got it!",
        },
      },
      {
        topic: 'Subtraction within 20',
        question: 'What is 14 minus 6?',
        options: ['6', '7', '8', '9'],
        correct_index: 2,
        explanation: 'Fourteen minus six equals eight.',
        hint: 'Try counting back from 14 — thirteen, twelve…',
        remediation: {
          intro: "Let me show you fourteen minus six.",
          steps: [
            { say: "Here's the problem.", board: { tool: 'drawEquation', args: { equation: '14 - 6 = ?' } } },
            { say: "We start at fourteen and count back six: thirteen, twelve, eleven, ten, nine, eight.", board: null },
            { say: "Fourteen minus six is eight.", board: { tool: 'drawEquation', args: { equation: '14 - 6 = 8' } } },
          ],
          outro: "Counting back works great for subtraction.",
        },
      },
      {
        topic: 'Skip counting by 2',
        question: 'What number comes next? 2, 4, 6, 8, ___',
        options: ['9', '10', '11', '12'],
        correct_index: 1,
        explanation: 'When you skip-count by twos, the next number is 10.',
        hint: 'We are jumping by two each time. After eight comes…',
        remediation: {
          intro: "Let me show you the pattern.",
          steps: [
            { say: "We're counting by twos.", board: { tool: 'writeWord', args: { word: '2 4 6 8' } } },
            { say: "Each number is two more than the one before. Two, then four, then six, then eight.", board: null },
            { say: "So after eight, we add two more, which gives us ten.", board: { tool: 'writeWord', args: { word: '10' } } },
          ],
          outro: "Skip-counting is just adding the same number each time.",
        },
      },
      {
        topic: 'Place value',
        question: 'In the number 47, what is the value of the 4?',
        options: ['4', '14', '40', '44'],
        correct_index: 2,
        explanation: 'The 4 is in the tens place, so it means forty.',
        hint: 'Think about which spot the 4 is in — ones or tens?',
        remediation: {
          intro: "Let me show you place value.",
          steps: [
            { say: "Here's the number forty-seven.", board: { tool: 'writeWord', args: { word: '47' } } },
            { say: "The four is in the tens place. The seven is in the ones place.", board: null },
            { say: "So the four really means four tens, which is forty.", board: { tool: 'drawEquation', args: { equation: '4 tens = 40' } } },
          ],
          outro: "Place value tells you how much each digit is worth.",
        },
      },
      {
        topic: 'Doubles',
        question: 'What is 8 + 8?',
        options: ['14', '15', '16', '17'],
        correct_index: 2,
        explanation: 'Double eight is sixteen.',
        hint: 'Doubles means adding a number to itself.',
        remediation: {
          intro: "Eight plus eight is a doubles fact.",
          steps: [
            { say: "Eight plus eight.", board: { tool: 'drawEquation', args: { equation: '8 + 8 = ?' } } },
            { say: "Think of two hands with eight fingers each — that's sixteen fingers total.", board: null },
            { say: "Eight plus eight equals sixteen.", board: { tool: 'drawEquation', args: { equation: '8 + 8 = 16' } } },
          ],
          outro: "Memorize the doubles and addition gets much faster.",
        },
      },
      {
        topic: 'Comparing numbers',
        question: 'Which symbol goes here? 23 ___ 32',
        options: ['<', '>', '='],
        correct_index: 0,
        explanation: 'Twenty-three is less than thirty-two, so the symbol is less-than.',
        hint: 'Twenty-three or thirty-two — which is bigger?',
        remediation: {
          intro: "Let me show you comparing numbers.",
          steps: [
            { say: "We have twenty-three and thirty-two.", board: { tool: 'writeWord', args: { word: '23 vs 32' } } },
            { say: "Thirty-two is the bigger number. Twenty-three is smaller.", board: null },
            { say: "The open side of the symbol always points to the bigger number, like a hungry alligator.", board: { tool: 'drawEquation', args: { equation: '23 < 32' } } },
          ],
          outro: "Less-than points left, greater-than points right.",
        },
      },
      {
        topic: 'Word problem',
        question: 'Nigel has 9 stickers. He gives 4 to his friend. How many stickers does he have left?',
        options: ['3', '4', '5', '6'],
        correct_index: 2,
        explanation: 'Nine minus four is five stickers left.',
        hint: 'Giving away means subtracting.',
        remediation: {
          intro: "Let me show you this word problem.",
          steps: [
            { say: "Nigel starts with nine stickers.", board: { tool: 'writeWord', args: { word: '9 start' } } },
            { say: "He gives away four. That means subtract.", board: { tool: 'drawEquation', args: { equation: '9 - 4 = ?' } } },
            { say: "Nine minus four is five. He has five stickers left.", board: { tool: 'drawEquation', args: { equation: '9 - 4 = 5' } } },
          ],
          outro: "Watch for 'gives away' or 'eats' or 'loses' — those mean subtract.",
        },
      },
      {
        topic: 'Adding three numbers',
        question: 'What is 3 + 4 + 5?',
        options: ['11', '12', '13', '14'],
        correct_index: 1,
        explanation: 'Three plus four is seven, plus five more is twelve.',
        hint: 'Add two of them first, then add the third.',
        remediation: {
          intro: "Let's add three numbers step by step.",
          steps: [
            { say: "Three plus four plus five.", board: { tool: 'drawEquation', args: { equation: '3 + 4 + 5 = ?' } } },
            { say: "First, three plus four is seven.", board: { tool: 'drawEquation', args: { equation: '3 + 4 = 7' } } },
            { say: "Now seven plus five is twelve.", board: { tool: 'drawEquation', args: { equation: '7 + 5 = 12' } } },
          ],
          outro: "Adding three numbers? Just do it two at a time.",
        },
      },
    ],
    reading: [
      {
        topic: 'Short vowels',
        question: 'Which word has the short "a" sound like in "cat"?',
        options: ['cake', 'cap', 'cane', 'kite'],
        correct_index: 1,
        explanation: 'Cap has the short a sound, just like cat.',
        hint: 'Short a sounds like "aaa" — the sound a sheep makes.',
        remediation: {
          intro: "Let me show you the short a sound.",
          steps: [
            { say: "Short a sounds like 'aaa'. Listen: cat, mat, hat, bat. They all have short a.", board: { tool: 'writeWord', args: { word: 'cat' } } },
            { say: "Now look at cap. C - a - p. That's the same short a sound.", board: { tool: 'writeWord', args: { word: 'cap' } } },
            { say: "Cake has a long a — like the letter name A. Cap has short a — like aaa.", board: null },
          ],
          outro: "Short vowels sound short. Long vowels say their name.",
        },
      },
      {
        topic: 'Rhyming words',
        question: 'Which word rhymes with "frog"?',
        options: ['fish', 'jump', 'log', 'leaf'],
        correct_index: 2,
        explanation: 'Frog and log both end with the "og" sound — they rhyme.',
        hint: 'Rhyming words end with the same sound.',
        remediation: {
          intro: "Let me show you rhymes.",
          steps: [
            { say: "Frog ends with the sound 'og'.", board: { tool: 'writeWord', args: { word: 'frog' } } },
            { say: "Log also ends with 'og'.", board: { tool: 'writeWord', args: { word: 'log' } } },
            { say: "Frog and log rhyme because they end the same way.", board: null },
          ],
          outro: "Rhyming words sound alike at the end.",
        },
      },
      {
        topic: 'Sight words',
        question: 'Which word is "because"?',
        options: ['before', 'because', 'beside', 'between'],
        correct_index: 1,
        explanation: 'Because starts with "be" and ends with "cause".',
        hint: 'It starts with B-E and ends with C-A-U-S-E.',
        remediation: {
          intro: "Let me show you the word because.",
          steps: [
            { say: "Because. B - E - C - A - U - S - E. Because.", board: { tool: 'writeWord', args: { word: 'because' } } },
            { say: "Before is shorter. Beside is shorter. Because is the longest.", board: null },
            { say: "Use because when you tell why — 'I'm happy because it's Friday'.", board: null },
          ],
          outro: "Sight words you just have to memorize by looking at them.",
        },
      },
      {
        topic: 'Compound words',
        question: 'Which is a compound word?',
        options: ['running', 'rainbow', 'happy', 'apple'],
        correct_index: 1,
        explanation: 'Rainbow is rain plus bow — two words joined together.',
        hint: 'A compound word is two words stuck together.',
        remediation: {
          intro: "A compound word is two whole words joined together.",
          steps: [
            { say: "Rainbow. That's rain plus bow.", board: { tool: 'writeWord', args: { word: 'rainbow' } } },
            { say: "Rain is a word. Bow is a word. Put them together and you get rainbow.", board: null },
            { say: "Other compound words: sunshine, baseball, butterfly. Each one is two words stuck together.", board: null },
          ],
          outro: "Look for two words hiding inside a longer word.",
        },
      },
      {
        topic: 'Beginning sounds',
        question: 'Which word starts with the same sound as "ship"?',
        options: ['snake', 'shoe', 'soup', 'star'],
        correct_index: 1,
        explanation: 'Shoe starts with "sh", just like ship.',
        hint: 'Listen for the SH sound at the beginning.',
        remediation: {
          intro: "Let me show you the sh sound.",
          steps: [
            { say: "Ship starts with sh.", board: { tool: 'writeWord', args: { word: 'ship' } } },
            { say: "Shoe also starts with sh.", board: { tool: 'writeWord', args: { word: 'shoe' } } },
            { say: "Snake starts with just s. That's different. Sh is when the s and h work together.", board: null },
          ],
          outro: "Two letters together sometimes make one new sound.",
        },
      },
      {
        topic: 'Plurals',
        question: 'What is the plural of "child"?',
        options: ['childs', 'childes', 'children', 'childies'],
        correct_index: 2,
        explanation: 'The plural of child is children — it changes shape.',
        hint: 'Some plurals do not just add s.',
        remediation: {
          intro: "Most plurals add s, but some are special.",
          steps: [
            { say: "One child.", board: { tool: 'writeWord', args: { word: 'child' } } },
            { say: "Many of them: children. The word changes completely.", board: { tool: 'writeWord', args: { word: 'children' } } },
            { say: "Other tricky ones: foot becomes feet, mouse becomes mice. You memorize these.", board: null },
          ],
          outro: "Most plurals add s — but some are irregular and you just learn them.",
        },
      },
      {
        topic: 'Reading comprehension',
        question: 'Tom planted a seed. He watered it every day. What does Tom want to happen?',
        options: ['Tom wants to swim', 'Tom wants the seed to grow', 'Tom wants to eat lunch', 'Tom wants to sleep'],
        correct_index: 1,
        explanation: 'Tom is taking care of the seed because he wants it to grow into a plant.',
        hint: 'Why would someone water a seed every day?',
        remediation: {
          intro: "Let's think about why Tom is doing this.",
          steps: [
            { say: "Tom planted a seed and waters it every day.", board: { tool: 'writeWord', args: { word: 'seed + water' } } },
            { say: "Seeds need water to grow into plants.", board: null },
            { say: "So Tom is hoping his seed will grow.", board: { tool: 'writeWord', args: { word: 'grow!' } } },
          ],
          outro: "Sometimes the answer is not in the story — you have to think about it.",
        },
      },
      {
        topic: 'Synonyms',
        question: 'Which word means almost the same as "big"?',
        options: ['tiny', 'large', 'fast', 'soft'],
        correct_index: 1,
        explanation: 'Big and large mean almost the same thing.',
        hint: 'Synonyms mean about the same thing.',
        remediation: {
          intro: "Synonyms are words that mean almost the same thing.",
          steps: [
            { say: "Big means not small.", board: { tool: 'writeWord', args: { word: 'big' } } },
            { say: "Large also means not small.", board: { tool: 'writeWord', args: { word: 'large' } } },
            { say: "Big and large are synonyms — they mean about the same thing.", board: null },
          ],
          outro: "Synonyms give you more ways to say the same idea.",
        },
      },
    ],
    spelling: [
      {
        topic: 'CVC words',
        question: 'How do you spell the word for the sound a sheep makes? (Hint: starts with B-A)',
        options: ['baa', 'baah', 'bah', 'bha'],
        correct_index: 0,
        explanation: 'Sheep say "baa" — just B-A-A.',
        hint: 'Sound it out — B, then aaa, then aaa.',
        remediation: {
          intro: "Let me show you how to spell baa.",
          steps: [
            { say: "B sound, then long a sound: baa.", board: { tool: 'writeWord', args: { word: 'baa' } } },
            { say: "Just two letters — B and double A.", board: null },
            { say: "Bah with an H is a different word. The simple spelling is B - A - A.", board: null },
          ],
          outro: "Sound out each part of the word.",
        },
      },
      {
        topic: 'Silent E',
        question: 'How do you spell the word that means the opposite of "small" (something a baby tooth might become)?',
        options: ['biger', 'biggr', 'biggest', 'bigger'],
        correct_index: 3,
        explanation: 'Bigger has two Gs and ends in E-R.',
        hint: 'When you compare two things, words often end with E-R.',
        remediation: {
          intro: "When you compare two things, add E-R to the word.",
          steps: [
            { say: "Big.", board: { tool: 'writeWord', args: { word: 'big' } } },
            { say: "When comparing, we double the g and add e-r: bigger.", board: { tool: 'writeWord', args: { word: 'bigger' } } },
            { say: "Bigger has two Gs because the vowel before is short.", board: null },
          ],
          outro: "Comparing words: add E-R, sometimes double the last letter.",
        },
      },
      {
        topic: 'Long vowels',
        question: 'How do you spell the word for what you do when you are tired?',
        options: ['slep', 'slepe', 'sleep', 'sleap'],
        correct_index: 2,
        explanation: 'Sleep is spelled S-L-E-E-P with two Es.',
        hint: 'The long E sound is usually two Es next to each other.',
        remediation: {
          intro: "Let me show you sleep.",
          steps: [
            { say: "Long e sound is often spelled with two Es.", board: { tool: 'writeWord', args: { word: 'sleep' } } },
            { say: "S - L - double E - P. Sleep.", board: null },
            { say: "Other words like this: feet, bee, see, tree. All use double E.", board: null },
          ],
          outro: "Double E is one common way to spell the long e sound.",
        },
      },
      {
        topic: 'Common sight words',
        question: 'How do you spell the question word that asks about a place?',
        options: ['were', 'where', 'wher', 'whear'],
        correct_index: 1,
        explanation: 'Where has W-H at the start and ends with E-R-E.',
        hint: 'Most question words start with W-H.',
        remediation: {
          intro: "Question words usually start with w-h.",
          steps: [
            { say: "Where. W - H - E - R - E.", board: { tool: 'writeWord', args: { word: 'where' } } },
            { say: "Other question words: what, when, why, who. All start with w-h.", board: null },
            { say: "Where asks about a place. 'Where are you?'", board: null },
          ],
          outro: "When in doubt on a question word, try starting it with W-H.",
        },
      },
      {
        topic: 'Plurals',
        question: 'How do you spell more than one box?',
        options: ['boxs', 'boxes', 'boxies', 'box\'s'],
        correct_index: 1,
        explanation: 'Boxes ends in E-S because box already ends in an X.',
        hint: 'Words ending in s, x, ch, or sh add ES instead of just S.',
        remediation: {
          intro: "Words ending in x add e-s, not just s.",
          steps: [
            { say: "One box.", board: { tool: 'writeWord', args: { word: 'box' } } },
            { say: "Many of them: boxes.", board: { tool: 'writeWord', args: { word: 'boxes' } } },
            { say: "Same rule for bus, fish, lunch — buses, fishes, lunches. All add e-s.", board: null },
          ],
          outro: "Ends in s, x, ch, sh? Add e-s.",
        },
      },
      {
        topic: 'Double letters',
        question: 'How do you spell the word for something that is fluffy and white?',
        options: ['cotn', 'coton', 'cotton', 'cottn'],
        correct_index: 2,
        explanation: 'Cotton has two Ts in the middle.',
        hint: 'Listen for a short sound — sometimes that means a double letter.',
        remediation: {
          intro: "Let me show you cotton.",
          steps: [
            { say: "Cot — short o sound. Then add t-o-n.", board: { tool: 'writeWord', args: { word: 'cotton' } } },
            { say: "Two Ts because the vowel before is short.", board: null },
            { say: "Same with kitten, button, ribbon. All have double letters.", board: null },
          ],
          outro: "Short vowels often need a double consonant after them.",
        },
      },
      {
        topic: 'Common irregular words',
        question: 'How do you spell the word that means a girl or boy in your family?',
        options: ['kid', 'chold', 'child', 'cild'],
        correct_index: 2,
        explanation: 'Child is C-H-I-L-D.',
        hint: 'It starts with C-H, not just C.',
        remediation: {
          intro: "Let me show you child.",
          steps: [
            { say: "Child starts with c-h, like in chair.", board: { tool: 'writeWord', args: { word: 'child' } } },
            { say: "C - H - I - L - D. Five letters.", board: null },
            { say: "More than one is children — that word changes.", board: { tool: 'writeWord', args: { word: 'children' } } },
          ],
          outro: "C-H makes the ch sound.",
        },
      },
      {
        topic: 'Apostrophes',
        question: 'How do you spell "do not" as one short word?',
        options: ['dont', 'do\'nt', 'don\'t', 'donot'],
        correct_index: 2,
        explanation: 'Don\'t has an apostrophe where the O in "not" used to be.',
        hint: 'The apostrophe replaces a missing letter.',
        remediation: {
          intro: "When you smash two words together, you use an apostrophe.",
          steps: [
            { say: "Do not.", board: { tool: 'writeWord', args: { word: 'do not' } } },
            { say: "We drop the o in not and put an apostrophe there: don\'t.", board: { tool: 'writeWord', args: { word: "don't" } } },
            { say: "Same with can\'t, won\'t, isn\'t — the apostrophe takes the place of missing letters.", board: null },
          ],
          outro: "Apostrophes show where letters have been left out.",
        },
      },
    ],
    science: [
      {
        topic: 'Animal classification',
        question: 'Which one is a mammal?',
        options: ['frog', 'shark', 'dog', 'eagle'],
        correct_index: 2,
        explanation: 'A dog is a mammal — it has fur and feeds milk to its babies.',
        hint: 'Mammals have fur or hair and feed milk to their babies.',
        remediation: {
          intro: "Let me show you what makes a mammal.",
          steps: [
            { say: "Mammals have three things: fur or hair, they breathe air, and mothers feed milk to their babies.", board: { tool: 'writeWord', args: { word: 'mammals' } } },
            { say: "A dog has fur. A mother dog feeds her puppies milk. So a dog is a mammal.", board: null },
            { say: "Frogs are amphibians, sharks are fish, eagles are birds. None of those are mammals.", board: null },
          ],
          outro: "Fur plus milk equals mammal.",
        },
      },
      {
        topic: 'States of matter',
        question: 'What state of matter is water when it freezes?',
        options: ['liquid', 'gas', 'solid', 'plasma'],
        correct_index: 2,
        explanation: 'Frozen water is ice — a solid.',
        hint: 'When something freezes, it gets hard and keeps its shape.',
        remediation: {
          intro: "Let me show you the three main states of matter.",
          steps: [
            { say: "Solid keeps its shape — like ice or a rock.", board: { tool: 'writeWord', args: { word: 'solid' } } },
            { say: "Liquid flows — like water in a cup.", board: { tool: 'writeWord', args: { word: 'liquid' } } },
            { say: "When water freezes, it becomes ice — and ice is a solid.", board: null },
          ],
          outro: "Solid, liquid, gas — three states of the same stuff.",
        },
      },
      {
        topic: 'The water cycle',
        question: 'What do we call it when water falls from clouds?',
        options: ['evaporation', 'precipitation', 'condensation', 'collection'],
        correct_index: 1,
        explanation: 'Precipitation is when water falls from clouds — rain, snow, sleet, or hail.',
        hint: 'It starts with the letter P — a big word.',
        remediation: {
          intro: "The water cycle has four big words.",
          steps: [
            { say: "Evaporation: sun heats water and it goes up as invisible gas.", board: { tool: 'writeWord', args: { word: 'evaporation' } } },
            { say: "Condensation: the gas cools and forms clouds.", board: { tool: 'writeWord', args: { word: 'condensation' } } },
            { say: "Precipitation: water falls from clouds as rain or snow.", board: { tool: 'writeWord', args: { word: 'precipitation' } } },
          ],
          outro: "And then it collects in rivers and lakes — that's collection.",
        },
      },
      {
        topic: 'Plants',
        question: 'What part of a plant takes in water from the ground?',
        options: ['leaves', 'flower', 'roots', 'stem'],
        correct_index: 2,
        explanation: 'Roots take in water and nutrients from the soil.',
        hint: 'It is the part underground.',
        remediation: {
          intro: "Let me show you the parts of a plant.",
          steps: [
            { say: "Roots are underground. They take in water and food from the soil.", board: { tool: 'writeWord', args: { word: 'roots' } } },
            { say: "The stem carries the water up.", board: { tool: 'writeWord', args: { word: 'stem' } } },
            { say: "The leaves use sunlight. The flower makes seeds.", board: null },
          ],
          outro: "Roots, stem, leaves, flower — all work together.",
        },
      },
      {
        topic: 'Day and night',
        question: 'Why does the sun appear to move across the sky during the day?',
        options: ['The sun is moving', 'The Earth is spinning', 'The clouds are moving', 'The wind is pushing it'],
        correct_index: 1,
        explanation: 'The Earth spins, so the sun looks like it moves — but really we are moving.',
        hint: 'The Earth turns around once every day.',
        remediation: {
          intro: "The sun looks like it moves, but really we are moving.",
          steps: [
            { say: "The Earth spins like a top. One full spin takes 24 hours.", board: { tool: 'writeWord', args: { word: 'Earth spins' } } },
            { say: "As we spin, our side of Earth faces the sun, then turns away.", board: null },
            { say: "That's why the sun seems to move — but it's really us turning.", board: null },
          ],
          outro: "The sun stays still. We do all the moving.",
        },
      },
      {
        topic: 'The five senses',
        question: 'Which sense do you use to find out if something is sweet or sour?',
        options: ['sight', 'hearing', 'taste', 'smell'],
        correct_index: 2,
        explanation: 'You use taste — your tongue — to tell sweet from sour.',
        hint: 'You use this sense with your tongue.',
        remediation: {
          intro: "We have five senses.",
          steps: [
            { say: "Sight is what you see with your eyes. Hearing is what you do with your ears.", board: { tool: 'writeWord', args: { word: '5 senses' } } },
            { say: "Smell is your nose. Touch is your skin. Taste is your tongue.", board: null },
            { say: "Sweet, sour, salty, bitter — those are tastes.", board: null },
          ],
          outro: "Five senses, five ways to find out about the world.",
        },
      },
      {
        topic: 'Force and motion',
        question: 'What makes a ball roll down a hill?',
        options: ['the wind', 'gravity', 'magnets', 'electricity'],
        correct_index: 1,
        explanation: 'Gravity pulls everything down toward Earth.',
        hint: 'It is the invisible force that pulls things down.',
        remediation: {
          intro: "Gravity pulls everything toward the ground.",
          steps: [
            { say: "Drop anything — a ball, a pencil, a leaf. It falls down because of gravity.", board: { tool: 'writeWord', args: { word: 'gravity' } } },
            { say: "On a hill, gravity pulls the ball down the slope.", board: null },
            { say: "Gravity is the same force that keeps us on Earth instead of floating away.", board: null },
          ],
          outro: "Gravity pulls down — every time.",
        },
      },
      {
        topic: 'Habitats',
        question: 'Where would you most likely find a polar bear?',
        options: ['desert', 'rainforest', 'arctic ice', 'farm'],
        correct_index: 2,
        explanation: 'Polar bears live in the cold arctic where there is ice and snow.',
        hint: 'Polar bears have thick white fur to stay warm.',
        remediation: {
          intro: "Animals live in habitats that suit them.",
          steps: [
            { say: "Polar bears have thick white fur.", board: { tool: 'writeWord', args: { word: 'polar bear' } } },
            { say: "They live where it is very cold — on the arctic ice near the north pole.", board: { tool: 'writeWord', args: { word: 'arctic' } } },
            { say: "Their white fur helps them blend in with the snow when they hunt.", board: null },
          ],
          outro: "Animals usually live where their bodies fit best.",
        },
      },
    ],
  };

  // -------- DOM helpers --------
  const $ = (id) => document.getElementById(id);
  function setBootMessage(label, sub) {
    if ($('boot-label') && label) $('boot-label').textContent = label;
    if ($('boot-sub') && sub) $('boot-sub').textContent = sub;
  }
  function hideBoot() { $('boot-overlay').style.display = 'none'; }
  function showBoot() { $('boot-overlay').style.display = 'flex'; }

  // -------- API helpers (re-using existing endpoints) --------
  async function jsonFetch(url, opts) {
    const r = await fetch(url, opts);
    if (!r.ok) throw new Error(`${url} → ${r.status}`);
    return r.json();
  }
  async function fetchDayPlan() {
    try {
      const r = await jsonFetch(`/api/class-time/lesson-plan-day?date=${state.today}&child_id=${CHILD_ID}`);
      return r;
    } catch (e) {
      console.warn('[class-time-mc] day plan fetch failed, using subjects-only fallback', e);
      return {
        date: state.today,
        courses: SUBJECTS.map((s, i) => ({ subject: s, order: i + 1, topics: [] })),
      };
    }
  }
  async function fetchCourseProgress() {
    try {
      const r = await jsonFetch(`/api/class-time/course-progress?date=${state.today}&child_id=${CHILD_ID}`);
      return r;
    } catch (e) {
      console.warn('[class-time-mc] progress fetch failed', e);
      return { completed: [] };
    }
  }
  async function recordCourseComplete(courseIdx, subject, topicsCovered) {
    try {
      const r = await fetch('/api/class-time/record-course', {
        method: 'POST', keepalive: true,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          child_id: CHILD_ID,
          plan_date: state.today,
          date: state.today, // v174: belt-and-suspenders — server accepts either
          course_order: courseIdx + 1,
          subject,
          topics_covered: topicsCovered,
        }),
      });
      if (!r.ok) {
        let detail = '';
        try { detail = await r.text(); } catch (_) {}
        console.error('[class-time-mc] record-course HTTP', r.status, detail.slice(0, 300));
        logEvent('class_time_save_failed', { status: r.status, course_idx: courseIdx, subject, detail: detail.slice(0, 200) });
      }
    } catch (e) { console.warn('[class-time-mc] record-course failed', e); }
  }
  function findFirstIncompleteCourse() {
    const done = new Set((state.courseProgress?.completed || []).map((c) => c.course_order));
    for (let i = 0; i < COURSES_PER_DAY; i++) {
      if (!done.has(i + 1)) return i;
    }
    return COURSES_PER_DAY;
  }

  // -------- TTS --------
  function tts(text) {
    if (!text || state.muted) return Promise.resolve();
    const H = NS.Humphrey;
    if (!H || typeof H.say !== 'function') return Promise.resolve();
    try {
      const p = H.say('class-time-mc', { kidName: 'Nigel', text: String(text), priority: 'high' });
      return Promise.resolve(p);
    } catch (e) {
      console.warn('[class-time-mc] tts threw', e);
      return Promise.resolve();
    }
  }
  // v175: wait for TTS to actually finish THEN run the callback after a pause.
  // Replaces the old pattern of fixed-ms setTimeout that raced against TTS.
  function waitForSpeechThenDo(ttsPromise, pauseMs, callback) {
    let done = false;
    const safety = setTimeout(() => {
      if (done) return;
      done = true;
      console.warn('[class-time-mc] TTS safety timeout — advancing');
      callback();
    }, TTS_SAFETY_MS);
    ttsPromise.then(() => {
      if (done) return;
      setTimeout(() => {
        if (done) return;
        done = true;
        clearTimeout(safety);
        callback();
      }, pauseMs);
    }).catch(() => {
      if (done) return;
      done = true;
      clearTimeout(safety);
      callback();
    });
  }
  function pulseHumphreyOn() { $('humphrey-portrait')?.classList.add('speaking'); }
  function pulseHumphreyOff() { $('humphrey-portrait')?.classList.remove('speaking'); }

  // =====================================================================
  // v173: kid-friendly audio cues for right/wrong. WebAudio so no asset
  // fetch and no dependency on ElevenLabs being warmed up. Synthesized to
  // be PROMINENT but not annoying — happy two-note chime on correct, soft
  // descending blip on wrong (no harsh buzzer for a 7yo).
  // =====================================================================
  let __audioCtx = null;
  function getAudioCtx() {
    if (__audioCtx) return __audioCtx;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) __audioCtx = new Ctx();
    } catch (_) {}
    return __audioCtx;
  }
  function playCue(kind) {
    if (state.muted) return;
    const ctx = getAudioCtx();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      if (kind === 'correct') {
        // Two-note ascending chime: C5 → E5
        [[523.25, 0], [659.25, 0.12]].forEach(([freq, delay]) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(0.0001, now + delay);
          gain.gain.exponentialRampToValueAtTime(0.18, now + delay + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.32);
          osc.connect(gain).connect(ctx.destination);
          osc.start(now + delay);
          osc.stop(now + delay + 0.34);
        });
      } else if (kind === 'wrong') {
        // Soft descending blip: G4 → E4 (gentle, not punitive)
        [[392, 0], [329.63, 0.13]].forEach(([freq, delay]) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(0.0001, now + delay);
          gain.gain.exponentialRampToValueAtTime(0.12, now + delay + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.22);
          osc.connect(gain).connect(ctx.destination);
          osc.start(now + delay);
          osc.stop(now + delay + 0.24);
        });
      } else if (kind === 'advance') {
        // Crisp 'click' for I-Get-It → next question
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.1, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.12);
      }
    } catch (e) { console.warn('[class-time-mc] cue failed', kind, e); }
  }

  // =====================================================================
  // v173: topic mastery telemetry. Each answered question contributes one
  // attempt to ha_topic_mastery. We mark "passed" only when the FIRST tap
  // was correct — getting it after a hint or after the demo still counts
  // as attempted but not passed (cleaner signal of true mastery).
  // =====================================================================
  function recordTopicAttempt(topicId, passedFirstTry) {
    if (!topicId) return;
    try {
      if (NS.Telemetry && typeof NS.Telemetry.rpc === 'function') {
        NS.Telemetry.rpc('ha_record_topic_attempt', {
          p_child_id: NS.Telemetry.childId ? NS.Telemetry.childId() : CHILD_ID,
          p_topic_id: topicId,
          p_passed: !!passedFirstTry,
          // v173b: pass subject so the auto-registered ha_topics row gets
          // the right subject column instead of defaulting to 'unknown'.
          p_subject: state.subject || 'unknown',
          p_zone_id: 'class-time',
        });
      }
    } catch (e) { console.warn('[class-time-mc] recordTopicAttempt failed', e); }
  }

  // -------- Question rendering --------
  function letterFor(i) { return String.fromCharCode(65 + i); } // 0→A

  function renderQuestion(q) {
    state.wrongAttempts = 0;
    state.inDemo = false;
    state.abortDemo = false;
    $('q-topic').textContent = q.topic;
    $('q-text').textContent = q.question;
    $('feedback').textContent = '';
    $('feedback').className = 'ct-feedback';
    $('demo-board').hidden = true;
    $('demo-next-btn').hidden = true;

    // Render answer buttons disabled
    const wrap = $('answer-buttons');
    wrap.innerHTML = '';
    wrap.style.display = 'grid';
    q.options.forEach((opt, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ct-answer-btn';
      btn.disabled = true;
      btn.dataset.index = String(i);
      btn.innerHTML = `<span class="letter">${letterFor(i)}</span><span class="text">${opt}</span>`;
      btn.addEventListener('click', () => onAnswerClick(i));
      wrap.appendChild(btn);
    });
    setListeningStatus();

    // v179: sequential per-option read with highlight
    readQuestionWithHighlights(q);
  }

  async function readQuestionWithHighlights(q) {
    lockButtons();
    pulseHumphreyOn();
    state.readGen = (state.readGen || 0) + 1;
    const gen = state.readGen;
    try {
      await sayWithTimeout(`Question. ${q.question}`, 30000);
      if (gen !== state.readGen) return;
      await pause(450);
      for (let i = 0; i < q.options.length; i++) {
        if (gen !== state.readGen) return;
        const cardBtn = document.querySelector(`#answer-buttons .ct-answer-btn[data-index="${i}"]`);
        cardBtn?.classList.add('is-being-read');
        try {
          await sayWithTimeout(`${letterFor(i)}. ${q.options[i]}.`, 30000);
        } finally {
          cardBtn?.classList.remove('is-being-read');
        }
        if (gen !== state.readGen) return;
        await pause(320);
      }
    } catch (e) {
      console.warn('[class-time-mc] readQuestionWithHighlights error', e);
    } finally {
      if (gen === state.readGen) {
        pulseHumphreyOff();
        unlockButtons();
      }
    }
  }

  function sayWithTimeout(text, maxMs) {
    return new Promise((resolve) => {
      let done = false;
      const t = setTimeout(() => { if (done) return; done = true; resolve(); }, maxMs || 30000);
      tts(text).then(() => { if (done) return; done = true; clearTimeout(t); resolve(); })
        .catch(() => { if (done) return; done = true; clearTimeout(t); resolve(); });
    });
  }

  function pause(ms) { return new Promise(r => setTimeout(r, ms)); }

  function setListeningStatus() {
    const s = $('q-status');
    s.className = 'ct-q-status';
    s.innerHTML = '<span class="ct-listen-dot"></span> Ms. Humphrey is reading…';
  }
  function setReadyStatus() {
    const s = $('q-status');
    s.className = 'ct-q-status ready';
    s.innerHTML = '<span class="ct-listen-dot"></span> Tap your answer →';
  }

  function lockButtons() {
    document.querySelectorAll('#answer-buttons .ct-answer-btn').forEach((b) => { b.disabled = true; });
    state.ttsLocked = true;
    setListeningStatus();
  }
  function unlockButtons() {
    document.querySelectorAll('#answer-buttons .ct-answer-btn').forEach((b) => { b.disabled = false; });
    state.ttsLocked = false;
    setReadyStatus();
  }

  function speakAndUnlock(text) {
    lockButtons();
    pulseHumphreyOn();
    let unlocked = false;
    const fallback = setTimeout(() => {
      if (unlocked) return;
      unlocked = true;
      console.warn('[class-time-mc] TTS fallback fired — unlocking buttons after timeout');
      pulseHumphreyOff();
      unlockButtons();
    }, TTS_FALLBACK_MS);
    tts(text).then(() => {
      if (unlocked) return;
      unlocked = true;
      clearTimeout(fallback);
      pulseHumphreyOff();
      unlockButtons();
    }).catch(() => {
      if (unlocked) return;
      unlocked = true;
      clearTimeout(fallback);
      pulseHumphreyOff();
      unlockButtons();
    });
  }

  // -------- Answer handling --------
  function onAnswerClick(idx) {
    if (state.ttsLocked) return;
    const q = state.questions[state.qIdx];
    const isCorrect = idx === q.correct_index;
    const buttons = Array.from(document.querySelectorAll('#answer-buttons .ct-answer-btn'));

    if (isCorrect) {
      buttons[idx].classList.add('correct');
      buttons.forEach((b) => { b.disabled = true; });
      $('feedback').textContent = `✓ ${q.explanation}`;
      $('feedback').className = 'ct-feedback correct';
      playCue('correct'); // v173
      // v173: only counts as "passed" if FIRST tap was correct
      recordTopicAttempt(q.topic, state.wrongAttempts === 0);
      logEvent('class_time_question_answered', { course_idx: state.courseIdx, q_idx: state.qIdx, correct: true, attempts: state.wrongAttempts + 1 });
      const ttsP = tts(`Yes! ${q.explanation}`);
      waitForSpeechThenDo(ttsP, POST_SPEECH_PAUSE_MS, advanceQuestion); // v175: waits for her to finish
      return;
    }

    // Wrong path
    state.wrongAttempts++;
    buttons[idx].classList.add('wrong');
    buttons[idx].disabled = true;
    playCue('wrong'); // v173

    if (state.wrongAttempts >= 2) {
      // Trigger the whiteboard remediation demo
      $('feedback').textContent = `Let's work through this together.`;
      $('feedback').className = 'ct-feedback hint';
      // v173: record as attempted-but-not-passed (we'll show the demo)
      recordTopicAttempt(q.topic, false);
      logEvent('class_time_question_answered', { course_idx: state.courseIdx, q_idx: state.qIdx, correct: false, attempts: state.wrongAttempts, demo_shown: true });
      setTimeout(() => startRemediation(q), FEEDBACK_PAUSE_MS);
      return;
    }

    // First wrong — give hint and let Nigel try again
    $('feedback').textContent = q.hint;
    $('feedback').className = 'ct-feedback wrong';
    logEvent('class_time_question_answered', { course_idx: state.courseIdx, q_idx: state.qIdx, correct: false, attempts: state.wrongAttempts });
    speakAndUnlock(`Not quite. ${q.hint} Try again.`);
  }

  // -------- Whiteboard remediation (the teaching demo) --------
  async function startRemediation(q) {
    state.inDemo = true;
    // Hide answer buttons + feedback, show board panel.
    $('answer-buttons').style.display = 'none';
    $('feedback').textContent = '';
    $('demo-board').hidden = false;
    $('demo-next-btn').hidden = true;

    // v171 hotfix: setting `hidden = false` doesn't synchronously force a
    // layout pass. If we call Board.mount() immediately, fitCanvas runs
    // getBoundingClientRect on a host that still measures 0×0, the canvas
    // gets sized to 1×1 pixels, and every subsequent drawEquation renders
    // to an invisible canvas. Two RAF ticks guarantee the browser has
    // painted the now-visible panel and the canvas host has its true
    // dimensions when mount() reads them.
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));

    // Mount/clear the board (class-time-board.js exposes ClassTimeBoard)
    const Board = NS.ClassTimeBoard;
    if (Board && typeof Board.mount === 'function') {
      try { Board.mount({}); } catch (e) { console.warn('[class-time-mc] board mount issue', e); }
    }
    if (Board && typeof Board.clearBoard === 'function') Board.clearBoard();

    const r = q.remediation;
    if (!r || !Array.isArray(r.steps)) {
      // No remediation script — just reveal correct + advance
      $('demo-next-btn').hidden = false;
      $('demo-next-btn').onclick = () => advanceQuestion();
      tts(q.explanation);
      return;
    }

    // Intro
    pulseHumphreyOn();
    if (r.intro) await tts(r.intro);
    if (state.abortDemo) return;

    // Steps — each step: optional board action, then TTS narration
    for (let i = 0; i < r.steps.length; i++) {
      if (state.abortDemo) return;
      $('demo-step-label').textContent = `Step ${i + 1} of ${r.steps.length}`;
      const step = r.steps[i];
      // Fire the board tool first so the visual is on screen as she speaks
      if (step.board && Board) {
        try {
          const fn = Board[step.board.tool];
          if (typeof fn === 'function') {
            const result = fn(step.board.args || {});
            // class-time-board.js v167 returns structured { ok, reason } —
            // we don't need to react here, just continue.
            void result;
          }
        } catch (e) { console.warn('[class-time-mc] board tool failed', step.board, e); }
      }
      if (step.say) await tts(step.say);
      if (state.abortDemo) return;
      await new Promise((res) => setTimeout(res, STEP_PAUSE_MS));
    }

    if (r.outro) await tts(r.outro);
    pulseHumphreyOff();
    if (state.abortDemo) return;

    // Show "I get it!" button
    $('demo-next-btn').hidden = false;
    $('demo-next-btn').onclick = () => {
      state.abortDemo = true; // belt-and-suspenders
      playCue('advance'); // v173
      advanceQuestion();
    };
  }

  // -------- Advance / course transitions --------
  function advanceQuestion() {
    state.abortDemo = true;
    pulseHumphreyOff();
    state.qIdx++;
    $('q-progress').textContent = `${state.qIdx} / ${state.questions.length}`;
    // Topic pip
    renderTopicPip();
    if (state.qIdx >= state.questions.length) {
      finishCourse();
      return;
    }
    // Restore normal MC layout
    $('demo-board').hidden = true;
    $('demo-next-btn').hidden = true;
    $('answer-buttons').style.display = 'grid';
    renderQuestion(state.questions[state.qIdx]);
  }

  function renderTopicPip() {
    const pipBox = $('topic-pip');
    if (!pipBox) return;
    const total = state.questions.length;
    pipBox.innerHTML = '';
    for (let i = 0; i < total; i++) {
      const dot = document.createElement('span');
      if (i < state.qIdx) dot.classList.add('done');
      else if (i === state.qIdx) dot.classList.add('active');
      pipBox.appendChild(dot);
    }
  }

  async function finishCourse() {
    const subject = state.subject;
    const courseIdx = state.courseIdx;
    const topicsCovered = state.questions.map((q) => q.topic);
    logEvent('class_time_course_complete', { course_idx: courseIdx, subject });
    await recordCourseComplete(courseIdx, subject, topicsCovered);

    if (courseIdx + 1 >= COURSES_PER_DAY) {
      handleDayCompletion('all-courses-done');
      return;
    }

    // v180: 5-min analog clock practice runs once per day, right after the
    // math course finishes and BEFORE the between-course break. Guarded by
    // localStorage so a re-entry the same day doesn't double-run it.
    const clockKey = `ha_clock_activity_${state.today}`;
    const alreadyDone = (() => { try { return localStorage.getItem(clockKey) === '1'; } catch (_) { return false; } })();
    if (subject === 'math' && !alreadyDone && NS.ClockActivity && typeof NS.ClockActivity.start === 'function') {
      logEvent('clock_activity_gate_enter', { course_idx: courseIdx });
      try { document.getElementById('classroom').style.display = 'none'; } catch (_) {}
      NS.ClockActivity.start({
        date: state.today,
        onComplete: (info) => {
          try { localStorage.setItem(clockKey, '1'); } catch (_) {}
          logEvent('clock_activity_gate_exit', { reason: (info && info.reason) || 'done', answered: (info && info.answered) || 0 });
          try { document.getElementById('classroom').style.display = 'flex'; } catch (_) {}
          showBreakOverlay(courseIdx + 1);
        },
      });
      return;
    }

    // Show break overlay (15 min) then start next course
    showBreakOverlay(courseIdx + 1);
  }

  function showBreakOverlay(nextCourseIdx) {
    const nextSubject = SUBJECTS[nextCourseIdx];
    $('break-next-label').textContent = `Next: ${SUBJECT_LABEL[nextSubject]} · Course ${nextCourseIdx + 1} of ${COURSES_PER_DAY}`;
    const overlay = $('break-overlay');
    overlay.style.display = 'flex';

    // v173: warm the cache for the NEXT course while Nigel is on break.
    const prefetchUrl = `/api/class-time/questions?date=${state.today}&child_id=${CHILD_ID}&course_order=${nextCourseIdx + 1}`;
    fetch(prefetchUrl).then(r => r.ok ? r.json() : null).then((data) => {
      if (data && data.ok) {
        console.log(`[class-time-mc] prefetched course ${nextCourseIdx + 1} (${data.source}, ${data.count} q)`);
      }
    }).catch((e) => {
      console.log('[class-time-mc] prefetch failed (no big deal — will re-fetch on resume):', e);
    });

    const resumeBtn = $('break-resume-btn');
    const timerDisplay = $('break-timer');
    const pickerWrap = $('break-picker');

    // v173b: ALWAYS unify with break-timer.js. The floating pill bottom-left
    // and this overlay both read from the SAME break state (localStorage
    // 'ha_break_end_ts'). Previously we were calling BreakTimer.start with an
    // options object, but startBreak takes durationMs as a number — so it
    // NaN'd and the floating pill + overlay diverged. Now they're locked.
    const BT = NS.BreakTimer;
    let pollHandle = null;

    function startBreakWith(durationMs) {
      // Hide the duration picker once a length is locked in
      if (pickerWrap) pickerWrap.style.display = 'none';
      timerDisplay.style.display = '';
      resumeBtn.style.display = '';
      resumeBtn.disabled = true;
      resumeBtn.textContent = 'Take your break first…';
      if (BT && typeof BT.start === 'function') {
        try { BT.start(durationMs); } catch (e) { console.warn('[class-time-mc] BT.start threw', e); }
      } else {
        // No break timer module — fall back to a local countdown
        console.warn('[class-time-mc] BreakTimer module missing — using local countdown');
        const endTs = Date.now() + durationMs;
        try { localStorage.setItem('ha_break_end_ts', String(endTs)); } catch (_) {}
      }
      beginPoll();
    }

    function beginPoll() {
      if (pollHandle) { clearInterval(pollHandle); pollHandle = null; }
      pollHandle = setInterval(() => {
        const remaining = (BT && typeof BT.remainingMs === 'function')
          ? BT.remainingMs()
          : Math.max(0, (parseInt(localStorage.getItem('ha_break_end_ts'), 10) || 0) - Date.now());
        const s = Math.ceil(remaining / 1000);
        const m = Math.floor(s / 60);
        const ss = s % 60;
        timerDisplay.textContent = `${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
        const phase = (BT && typeof BT.state === 'function') ? BT.state() : (remaining > 0 ? 'running' : 'expired');
        if (phase === 'expired' || remaining <= 0) {
          clearInterval(pollHandle); pollHandle = null;
          timerDisplay.textContent = '00:00';
          resumeBtn.disabled = false;
          resumeBtn.textContent = `✓ Ready! Start ${SUBJECT_LABEL[nextSubject]} →`;
        }
      }, 500);
    }

    // v173b: resume button does ONE thing — end the break and advance to
    // next course. Idempotent against double-clicks because we tear down
    // the poll first.
    resumeBtn.onclick = () => {
      if (resumeBtn.disabled) return;
      if (pollHandle) { clearInterval(pollHandle); pollHandle = null; }
      // Clear the unified break state so the floating pill clears too
      if (BT && typeof BT.end === 'function') { try { BT.end(); } catch (_) {} }
      else { try { localStorage.removeItem('ha_break_end_ts'); localStorage.removeItem('ha_break_done'); } catch (_) {} }
      overlay.style.display = 'none';
      console.log(`[class-time-mc] break ended, starting course ${nextCourseIdx + 1}`);
      // v173b: explicit advance to next course. fire-and-forget the async startCourse.
      startCourse(nextCourseIdx).catch((e) => console.error('[class-time-mc] startCourse from break failed', e));
    };

    // v173b: ALSO offer an early-exit "Skip break ▶" button via wrap (small)
    // so Nigel can skip the break entirely if he wants to keep going.
    const skipBtn = $('break-skip-btn');
    if (skipBtn) {
      skipBtn.onclick = () => {
        if (pollHandle) { clearInterval(pollHandle); pollHandle = null; }
        if (BT && typeof BT.end === 'function') { try { BT.end(); } catch (_) {} }
        else { try { localStorage.removeItem('ha_break_end_ts'); localStorage.removeItem('ha_break_done'); } catch (_) {} }
        overlay.style.display = 'none';
        console.log(`[class-time-mc] break skipped, starting course ${nextCourseIdx + 1}`);
        startCourse(nextCourseIdx).catch((e) => console.error('[class-time-mc] startCourse skip failed', e));
      };
    }

    // v173b: check if a break is ALREADY in flight (e.g. Nigel tapped the
    // floating pill before finishing the course). If so, adopt it and skip
    // the duration picker.
    const existingRemaining = (BT && typeof BT.remainingMs === 'function') ? BT.remainingMs() : 0;
    const existingPhase = (BT && typeof BT.state === 'function') ? BT.state() : 'idle';
    if (existingPhase === 'running' && existingRemaining > 0) {
      console.log(`[class-time-mc] adopting in-flight break (${Math.round(existingRemaining/1000)}s left)`);
      if (pickerWrap) pickerWrap.style.display = 'none';
      timerDisplay.style.display = '';
      resumeBtn.style.display = '';
      resumeBtn.disabled = true;
      resumeBtn.textContent = 'Take your break first…';
      beginPoll();
      return;
    }

    // Otherwise show the duration picker first
    if (pickerWrap) {
      pickerWrap.style.display = '';
      timerDisplay.style.display = 'none';
      resumeBtn.style.display = 'none';
      // Wire the three duration buttons
      [5, 10, 15].forEach((mins) => {
        const btn = document.getElementById(`break-${mins}-btn`);
        if (!btn) return;
        btn.classList.toggle('default', mins === 10);
        btn.onclick = () => startBreakWith(mins * 60 * 1000);
      });
    } else {
      // No picker — default straight to 10 min
      startBreakWith(10 * 60 * 1000);
    }
  }

  function handleDayCompletion(reason) {
    state.abortDemo = true;
    // Mark zone complete for Today's Mission (same pattern as cauldron)
    try {
      const rawState = localStorage.getItem('hero_academy_state_v1');
      const appState = rawState ? JSON.parse(rawState) : {};
      appState.zoneProgress = appState.zoneProgress || {};
      const prev = appState.zoneProgress['class-time'] || 0;
      appState.zoneProgress['class-time'] = Math.min(100, prev + 25);
      localStorage.setItem('hero_academy_state_v1', JSON.stringify(appState));
      const key = `ha_mission_zones_done_${state.today}`;
      const done = JSON.parse(localStorage.getItem(key) || '[]');
      if (!done.includes('class-time')) { done.push('class-time'); localStorage.setItem(key, JSON.stringify(done)); }
    } catch (_) {}
    if (NS.TodayMission && typeof NS.TodayMission.markVisited === 'function') {
      try { NS.TodayMission.markVisited('class-time'); } catch (_) {}
    }
    logEvent('class_time_complete', { reason });

    document.getElementById('classroom').style.display = 'none';
    $('completion').style.display = 'flex';
    $('completion-btn').onclick = exitToHome;
  }

  // -------- Course start --------
  // v172: fetch from /api/class-time/questions for daily-fresh Haiku content.
  // Falls back to V171_BANK if the API or Haiku fails. The endpoint itself
  // caches per (child_id, plan_date, course_order), so two visits to the same
  // course in the same day see the same questions — but the next day brings
  // a fresh set.
  // v180: for math, interleave 4 coded double-digit problems with 4 Haiku
  // problems so the kid sees a stable progression (coded bank) alongside
  // fresh daily variety (Haiku). When math-bank is absent (e.g. module
  // failed to load), we fall through to the original Haiku-only flow.
  async function fetchQuestionsForCourse(courseIdx) {
    const courseOrder = courseIdx + 1;
    const subject = SUBJECTS[courseIdx] || 'math';
    state.subject = subject;
    state.courseIdx = courseIdx;
    let serverQuestions = null;
    let serverSource = 'unknown';
    try {
      const url = `/api/class-time/questions?date=${state.today}&child_id=${CHILD_ID}&course_order=${courseOrder}`;
      const r = await fetch(url);
      if (r.ok) {
        const data = await r.json();
        if (data && Array.isArray(data.questions) && data.questions.length >= 3) {
          serverQuestions = data.questions;
          serverSource = data.source || 'haiku';
          console.log(`[class-time-mc] questions source=${serverSource} count=${serverQuestions.length}`);
          // If the server's source is 'fallback' AND the subject is non-math, the
          // server returned math questions — use the subject-specific V171_BANK
          // instead.
          if (serverSource === 'fallback' && subject !== 'math') {
            return (V171_BANK[subject] || V171_BANK.math).slice(0, QUESTIONS_PER_COURSE);
          }
        }
      } else {
        console.warn('[class-time-mc] questions api ' + r.status);
      }
    } catch (e) {
      console.warn('[class-time-mc] questions fetch failed:', e);
    }

    // v180 — Math: interleave 4 coded double-digit problems with 4 Haiku.
    if (subject === 'math' && NS.MathBank && typeof NS.MathBank.pickForDate === 'function') {
      const coded = NS.MathBank.pickForDate(state.today, 4);
      const fromServer = (serverQuestions || V171_BANK.math).slice(0, 4);
      const interleaved = [];
      for (let i = 0; i < 4; i++) {
        // Even slots: coded (stable). Odd slots: Haiku/server (fresh).
        if (coded[i]) interleaved.push(coded[i]);
        if (fromServer[i]) interleaved.push(fromServer[i]);
      }
      const out = interleaved.slice(0, QUESTIONS_PER_COURSE);
      console.log(`[class-time-mc] math: ${coded.length} coded + ${fromServer.length} server, interleaved to ${out.length}`);
      if (out.length >= 4) return out;
      // Fall through if somehow we didn't get enough
    }

    if (serverQuestions && serverQuestions.length >= 3) {
      return serverQuestions.slice(0, QUESTIONS_PER_COURSE);
    }
    console.warn('[class-time-mc] using V171_BANK fallback for ' + subject);
    return (V171_BANK[subject] || V171_BANK.math).slice(0, QUESTIONS_PER_COURSE);
  }

  async function startCourse(courseIdx) {
    state.courseIdx = courseIdx;
    state.subject = SUBJECTS[courseIdx];
    setBootMessage('Loading questions for ' + (SUBJECT_LABEL[state.subject] || state.subject) + '…', '');
    state.questions = await fetchQuestionsForCourse(courseIdx);
    state.qIdx = 0;
    $('course-badge').textContent = `Course ${courseIdx + 1}/${COURSES_PER_DAY}`;
    $('subject-badge').textContent = SUBJECT_LABEL[state.subject] || state.subject;
    $('q-progress').textContent = `0 / ${state.questions.length}`;
    renderTopicPip();
    hideBoot();
    document.getElementById('classroom').style.display = 'flex';
    if (!state.questions.length) {
      console.warn('[class-time-mc] no questions for course', courseIdx);
      finishCourse();
      return;
    }
    // v187: brief spoken course-opening remark before diving into Q1, so the
    // start of each course doesn't feel abrupt. We AWAIT it (buttons aren't
    // rendered yet) so it can't collide with the question read.
    const label = SUBJECT_LABEL[state.subject] || state.subject;
    const ordinal = ['first', 'second', 'third', 'fourth'][courseIdx] || `course ${courseIdx + 1}`;
    const opener = courseIdx === 0
      ? `Welcome to class, Nigel! Let's start with ${label}. Here is your first question.`
      : `Great, it's time for ${label} — our ${ordinal} class. Here is your first question.`;
    try { await sayWithTimeout(opener, 30000); } catch (_) {}
    renderQuestion(state.questions[0]);
  }

  // -------- Exit / mute --------
  function exit() {
    state.abortDemo = true;
    logEvent('class_time_exit_early', { course_idx: state.courseIdx, q_idx: state.qIdx });
    exitToHome();
  }
  function exitToHome() { window.location.href = '/'; }
  function toggleMute() {
    state.muted = !state.muted;
    const btn = $('mute-btn');
    if (btn) btn.textContent = state.muted ? '🔇' : '🔊';
    if (state.muted && NS.Humphrey && typeof NS.Humphrey.toggleMute === 'function') {
      // Mirror to Humphrey's own mute so any in-flight TTS stops too.
      try { if (!NS.Humphrey.isMuted()) NS.Humphrey.toggleMute(); } catch (_) {}
    } else if (!state.muted && NS.Humphrey && NS.Humphrey.isMuted && NS.Humphrey.isMuted()) {
      try { NS.Humphrey.toggleMute(); } catch (_) {}
    }
  }

  // -------- Telemetry --------
  function logEvent(eventType, payload) {
    try {
      if (NS.Telemetry && typeof NS.Telemetry.rpc === 'function') {
        NS.Telemetry.rpc('ha_record_event', {
          p_child_id: NS.Telemetry.childId ? NS.Telemetry.childId() : CHILD_ID,
          p_event_type: eventType,
          p_payload: payload || {},
        });
      }
    } catch (e) { console.warn('[class-time-mc] logEvent failed', eventType, e); }
  }

  // -------- Boot --------
  async function boot() {
    setBootMessage("Setting up today's class…", "Ms. Humphrey is getting ready");

    // Initialize Humphrey (TTS-only — no ConvAI in v171)
    if (NS.Humphrey && typeof NS.Humphrey.init === 'function') {
      try {
        NS.Humphrey.init({ position: 'bottom-right', audioEnabled: true, kidName: 'Nigel' });
        NS.Humphrey.hide(); // We use our own embedded portrait
      } catch (e) { console.warn('[class-time-mc] Humphrey.init failed', e); }
    }

    // Fetch progress + day plan in parallel
    setBootMessage("Loading today's school day…", '');
    const [dayPlan, progress] = await Promise.all([fetchDayPlan(), fetchCourseProgress()]);
    state.dayPlan = dayPlan;
    state.courseProgress = progress;

    // Wire UI
    $('exit-btn').addEventListener('click', exit);
    $('mute-btn').addEventListener('click', toggleMute);
    $('read-again-btn').addEventListener('click', () => {
      if (state.inDemo) return; // v173: don't compete with the demo's narration
      const q = state.questions[state.qIdx];
      if (!q) return;
      const btn = $('read-again-btn');
      btn.classList.add('speaking');
      // v179: sequential reader
      readQuestionWithHighlights(q).finally(() => btn.classList.remove('speaking'));
    });

    // Mount the board ahead of time so the canvas DOM exists.
    if (NS.ClassTimeBoard && typeof NS.ClassTimeBoard.mount === 'function') {
      try { NS.ClassTimeBoard.mount({}); } catch (e) { console.warn('[class-time-mc] board mount issue', e); }
    }

    // Resume from the first incomplete course
    const startIdx = findFirstIncompleteCourse();
    if (startIdx >= COURSES_PER_DAY) {
      hideBoot();
      handleDayCompletion('day-already-done');
      return;
    }
    await startCourse(startIdx);

    // v173: warm cache for course +1 in the background. Cheap — Haiku
    // already cached its content if it's been requested today; if not,
    // ~17s now means the break-to-course-2 transition is instant.
    if (startIdx + 1 < COURSES_PER_DAY) {
      const url = `/api/class-time/questions?date=${state.today}&child_id=${CHILD_ID}&course_order=${startIdx + 2}`;
      fetch(url).then(r => r.ok ? r.json() : null).then((data) => {
        if (data && data.ok) console.log(`[class-time-mc] boot-prefetched course ${startIdx + 2} (${data.source})`);
      }).catch(() => {});
    }
  }

  // Save progress on tab hide / exit (matches v163 pattern)
  function persistOnLeave() {
    // Course completion is already saved when finishCourse fires. Nothing
    // to do mid-question — but if we want partial progress later, hook here.
  }
  window.addEventListener('pagehide', persistOnLeave);
  window.addEventListener('beforeunload', persistOnLeave);

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    boot().catch((e) => { console.error('[class-time-mc] boot failed', e); setBootMessage('Could not load class.', 'Please refresh and try again.'); });
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      boot().catch((e) => { console.error('[class-time-mc] boot failed', e); setBootMessage('Could not load class.', 'Please refresh and try again.'); });
    });
  }

  // Expose minimal API for testing
  NS.ClassTimeMC = {
    state,
    startCourse,
    advanceQuestion,
    renderQuestion,
    startRemediation,
  };
})();
