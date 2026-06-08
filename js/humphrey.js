/**
 * Hero Academy — Ms. Humphrey
 * The teacher-in-residence. Ubiquitously summonable from any game/zone.
 *
 *   HeroAcademy.Humphrey.say('correct-answer', { streak: 3, kidName: 'Nigel' });
 *
 * Phase 2 v0.1 — May 30, 2026
 *   - Base portrait + corner widget + speech bubble
 *   - Event catalog with variant phrasings (randomized, non-repeating)
 *   - Expression slot system (graceful fallback to base when art is missing)
 *   - Audio: pre-rendered MP3 → ElevenLabs TTS (Vercel proxy) → Web Speech API → silent (text-only)
 *   - Queue (1 utterance at a time, FIFO)
 *   - Mute state persists in localStorage
 *
 * ElevenLabs voice:
 *   - Voice: Emory — Warm, Smooth and Friendly (voice_id: aNGh7D6DrhhIlad2U6Fg)
 *   - Model: eleven_flash_v2_5
 *   - TTS proxy: /api/humphrey/tts (Vercel serverless, holds API key server-side)
 *   - Set ELEVENLABS_API_KEY env var on Vercel to enable real voice
 */
(function () {
  'use strict';

  const VERSION = '0.1.0';
  const NS = (window.HeroAcademy = window.HeroAcademy || {});
  if (NS.Humphrey) {
    console.warn('[Humphrey] Already loaded, skipping.');
    return;
  }

  // --- Configuration -------------------------------------------------------

  const DEFAULTS = {
    position: 'bottom-right',          // bottom-right | bottom-left | top-right | top-left
    audioEnabled: true,
    enabled: true,
    minDurationMs: 2400,
    msPerCharacter: 55,                // ~16wpm reading speed for a 7yo
    maxDurationMs: 12000,
    assetBase: '/assets/humphrey/',
    ttsEndpoint: '/api/humphrey/tts',    // Vercel serverless → ElevenLabs TTS
    // v145: HARD OFF. Falling back to window.speechSynthesis on a TTS failure
    // played a different default voice on every device (Galaxy Tab system voice,
    // iOS Samantha, etc.) which read as Ms. Humphrey "randomly switching." A
    // missed utterance is now silent — the on-screen panelLog + console.error
    // at the failure sites still surface the cause for diagnosis.
    fallbackToWebSpeech: false,
    skipPrerendered: true,             // pre-rendered MP3s don't exist yet; skip 1.5s wait
    debug: false,
    // 1.3 — Auto-welcome: each page passes its own event key. After the first
    // user gesture unlocks audio, Humphrey fires this event once per day per
    // page (gated by ha_welcomed_<event>_<YYYY-MM-DD>). Set to null to skip.
    welcomeEvent: null,
    kidName: 'Nigel',
  };

  const STORAGE_KEY = 'ha_humphrey_v1';

  // --- Event catalog -------------------------------------------------------
  //
  // Each entry: { expression, lines: [variant phrasings], audio?: optional }
  // Tokens in lines: {kidName}, {streak}, {topic}, {character}, {percent}, {zone}
  //
  // Variants get randomized non-repeating per event so she doesn't loop.
  // Keep lines short — kid is 7, this is a sidebar not a lecture.

  const CATALOG = {
    // -----------------------------------------------------------------------
    // Welcomes — one per page. Fired by the audio-unlock hook on first gesture,
    // gated by a daily flag (ha_welcomed_<event>_<YYYY-MM-DD>) so they don't
    // replay within the same day. Each has 10+ variants so repeat days feel fresh.
    // -----------------------------------------------------------------------
    'welcome-home': {
      expression: 'smile',
      lines: [
        "Hi {kidName}! There you are. Ready to learn something good?",
        "Hello, hello! Welcome back. What feels right today?",
        "Good to see you, my friend. Pick a zone whenever you are ready.",
        "{kidName}! Come in, come in. Your training awaits.",
        "Hi there. Big day or small day, both are fine with me.",
        "Welcome back. I was hoping you would stop by.",
        "There is my favorite student. Let us see what today brings.",
        "Hey {kidName}. Quick warm up or a real session, your call.",
        "Hello! Take a look around. Everything is open for you.",
        "Good day to be curious, {kidName}. Where to first?",
        "Welcome in. I have a feeling today is going to be a good one.",
        "Hi there. Come on, let us pick something fun.",
      ],
    },
    'welcome-cauldron': {
      expression: 'smile',
      lines: [
        "Welcome to the Cauldron Cafe, {kidName}. The customers are waiting!",
        "Ah, the Cauldron Cafe, my favorite place for math. Apron on?",
        "Hi {kidName}! Let us see who is hungry today.",
        "Into the kitchen we go. Numbers and orders, here we come.",
        "Cauldron Cafe! Time to count, stir, and serve.",
        "Hello {kidName}. Today's specials are math problems. Let us cook.",
        "Welcome back to the cafe. The customers love your work.",
        "Apron on, {kidName}. Math chef coming through!",
        "Here we are, the Cauldron Cafe. Ready to take some orders?",
        "Hi friend. Numbers smell good in here, do they not?",
      ],
    },
    'welcome-diner': {
      expression: 'smile',
      lines: [
        "Welcome to Diner Lanes, {kidName}! Roll a strike and learn the map.",
        "Diner Lanes! Bowling and geography, my kind of combo.",
        "Hi {kidName}! Pick a state, knock down some pins.",
        "Here we go, Diner Lanes. America is waiting.",
        "Welcome back to the lanes. Aim well, my friend.",
        "Hello {kidName}! Which state shall we visit first today?",
        "Diner Lanes! Pins and places, here we come.",
        "Roll it true, {kidName}. The fifty states are watching.",
        "Welcome in. Let us see what customer walks up next.",
        "Hi friend. Bowling shoes on, brain switched on, let us go.",
      ],
    },
    'welcome-word-tower': {
      expression: 'encouraging',
      lines: [
        "Word Tower! Let us climb it one word at a time, {kidName}.",
        "Welcome to Word Tower. Eight words today. Take your time.",
        "Hi {kidName}! Reading practice. I will be listening carefully.",
        "Word Tower it is. Big breath, clear voice.",
        "Here we go. Words to climb, sounds to catch.",
        "Welcome back, {kidName}. Let us hear that great reading voice.",
        "Word Tower! I love listening to you read.",
        "Hi friend! New words today. We have got this together.",
        "Climbing time. One word, one breath, one step.",
        "Welcome in. Read like you are telling me a story.",
      ],
    },
    'welcome-story-time': {
      expression: 'smile',
      lines: [
        "Story Time! I wrote you a story today, {kidName}.",
        "Welcome to Story Time. I have a fresh one ready.",
        "Hi {kidName}! I will read first, then you read it back to me.",
        "Story Time it is. Cozy up. Words ahead.",
        "Here we go. A story made just for you.",
        "Welcome back, {kidName}. Let us see what story finds us today.",
        "Story Time! Three sentences, one big adventure.",
        "Hi friend. I think you will like this one.",
        "Settle in. I have a story I think you will love.",
        "Welcome. Listen first, then read. Easy as that.",
      ],
    },
    'welcome-hero-hall': {
      expression: 'cheering',
      lines: [
        "Welcome to Hero Hall, {kidName}! Look who is here.",
        "Hero Hall! Your Squad is waiting.",
        "Hi {kidName}! All your friends in one place.",
        "Welcome back to the Hall. Quite a crew you have gathered.",
        "Here we are, Hero Hall. Say hi to everyone.",
        "Hello, {kidName}! The Squad has been asking about you.",
        "Hero Hall! Each one earned their spot, including you.",
        "Welcome in. This place feels like home.",
        "Look at this lineup, {kidName}. You did this.",
        "Welcome, friend. Your heroes are glad you came.",
      ],
    },
    // -----------------------------------------------------------------------
    // Generic welcome — kept as fallback if a page does not specify its own.
    // -----------------------------------------------------------------------
    'welcome': {
      expression: 'smile',
      lines: [
        "Hi {kidName}! Ready to learn something new today?",
        "There you are, {kidName}! Let us get started.",
        "Welcome back, {kidName}! I missed you.",
        "Hello, {kidName}. Lovely to see you.",
        "Hi friend! Come on in.",
      ],
    },
    'goodbye': {
      expression: 'smile',
      lines: [
        "Great work today, {kidName}. See you tomorrow!",
        "You did wonderfully. Until next time.",
        "Bye for now, {kidName}. Be proud of yourself.",
        "Goodbye, my friend. Rest those clever eyes.",
        "All done. See you soon, {kidName}.",
        "What a session. Have a beautiful day.",
        "Bye, {kidName}. Tell your family I said hi.",
        "See you tomorrow. Sweet dreams if it is late.",
        "Good work today. Go play.",
        "Off you go. You earned the break.",
        "Bye, friend. Same time tomorrow?",
        "See you next time. I will be here.",
      ],
    },
    'zone-enter': {
      expression: 'encouraging',
      lines: [
        "Welcome to {zone}! Let us see what is waiting for us.",
        "Oh, {zone}! One of my favorites.",
        "Here we are at {zone}. Time to explore.",
        "{zone}, here we go.",
        "Welcome in. {zone} has good things in store.",
      ],
    },
    'zone-locked': {
      expression: 'concerned',
      lines: [
        "That one is still locked. Let us keep practicing the others first!",
        "Not quite ready for that one yet. Soon!",
        "Locked for now, {kidName}. Keep building.",
      ],
    },
    'level-start': {
      expression: 'encouraging',
      lines: [
        "Okay {kidName}, today we are working on {topic}. You have got this.",
        "Let us practice {topic}. Take your time.",
        "Ready? Today's lesson is {topic}. Deep breath.",
        "{topic} today, {kidName}. We will go step by step.",
        "Here we go, {topic}. I am right here with you.",
      ],
    },
    // -----------------------------------------------------------------------
    // Correctness feedback — these fire ~6 times per session, hence 12+ each.
    // 'correct-answer' is the generic; -math and -reading are flavored for
    // their zones. Call sites can pick whichever fits; missing keys fall back
    // to 'correct-answer' via _default.
    // -----------------------------------------------------------------------
    'correct-answer': {
      expression: 'cheering',
      lines: [
        "Yes! Exactly right.",
        "Beautiful work, {kidName}!",
        "That is it. You are getting this.",
        "Nice thinking!",
        "Perfect.",
        "Yes, that is the one.",
        "Right on the nose.",
        "Got it! Lovely.",
        "Excellent, {kidName}.",
        "Yes, you saw it.",
        "Spot on.",
        "There it is!",
        "Bang, that is right.",
        "Mm-hmm, exactly.",
        "Look at you go!",
      ],
    },
    'correct-answer-math': {
      expression: 'cheering',
      lines: [
        "Yes! That is the right number.",
        "Perfect math, {kidName}.",
        "You counted it just right.",
        "Yes, that is exactly the answer.",
        "Nice work, the numbers add up.",
        "That is the one. Beautiful.",
        "Yes! Your math is sharp today.",
        "Spot on, {kidName}.",
        "Mm-hmm, that is correct.",
        "Right answer, {kidName}. Lovely.",
        "Yes, you worked that out perfectly.",
        "There it is. Math hero.",
      ],
    },
    'correct-answer-reading': {
      expression: 'cheering',
      lines: [
        "Yes! Beautiful reading.",
        "Perfect, {kidName}. I heard every word.",
        "That was crystal clear.",
        "Yes, exactly right. Nice voice.",
        "You read that wonderfully.",
        "Got it. Lovely reading.",
        "Spot on, {kidName}.",
        "Yes! Clean and clear.",
        "Mm-hmm, that was the right sound.",
        "Lovely. Your voice was so clear.",
        "Yes, you nailed it.",
        "Excellent reading, my friend.",
      ],
    },
    'wrong-answer': {
      expression: 'encouraging',
      lines: [
        "Not quite, but good try. Let us look again.",
        "Close! Let us slow down and try one more time.",
        "That is a fair guess. Want another go?",
        "Almost. Take another look, you will see it.",
        "Not yet. Try once more.",
        "Hmm, not this time. Easy fix though.",
        "Close one. Look again carefully.",
        "Not yet, but I see you thinking.",
        "Almost there, {kidName}.",
        "Tricky one. Look one more time.",
      ],
    },
    'wrong-answer-math': {
      expression: 'encouraging',
      lines: [
        "Not quite. Count one more time, {kidName}.",
        "Close! The numbers are nearly there.",
        "Almost. Look at the problem again carefully.",
        "Hmm, not this number. Try once more.",
        "Not yet. Slow down and recount.",
        "Tricky one. Take it step by step.",
        "Easy miss, {kidName}. Look again.",
        "Not yet. The right answer is hiding nearby.",
        "Close. One more careful look.",
        "Almost, but not quite. Try once more.",
      ],
    },
    'wrong-answer-reading': {
      expression: 'encouraging',
      lines: [
        "Not quite, but I heard you trying. Let us try again.",
        "Close! Slow it down and try one more time.",
        "Almost. Listen to the sounds again with me.",
        "Not yet. Take a breath and try the word again.",
        "Hmm, missed a sound. No worries, try once more.",
        "Tricky word. Let us go slow.",
        "Not yet, {kidName}. Easy fix.",
        "Close. One more careful try.",
        "Almost there. Sound it out one more time.",
        "Not quite, but you are close.",
      ],
    },
    'streak-3': {
      expression: 'cheering',
      lines: [
        "Three in a row! You are on fire!",
        "Look at you, three right in a row!",
        "Three! Keep that going, {kidName}.",
        "Three correct! That is a streak.",
        "Three for three. Wonderful.",
      ],
    },
    'streak-5': {
      expression: 'cheering',
      lines: [
        "Five in a row, {kidName}! Wow!",
        "Five! That is a real streak now.",
        "Five correct! I am so proud.",
        "Five for five. Amazing focus.",
        "Five in a row. Look at that brain!",
      ],
    },
    'streak-10': {
      expression: 'surprised',
      lines: [
        "TEN in a row?! {kidName}, you are amazing!",
        "Ten in a row! I am so proud of you.",
        "Ten! That is incredible, {kidName}.",
        "Ten in a row. Are you even real?",
        "Ten! What a streak, my friend.",
      ],
    },
    'milestone-reached': {
      expression: 'cheering',
      lines: [
        "That is a milestone, {kidName}! Look at that progress.",
        "You just hit a milestone. Pause and feel good about that.",
        "Milestone, {kidName}. Big deal.",
        "Right there, a real milestone.",
      ],
    },
    'mastery-achieved': {
      expression: 'cheering',
      lines: [
        "You have mastered {topic}! That is a big deal, {kidName}.",
        "{topic}, mastered! On to the next when you are ready.",
        "I am putting {topic} in the 'you got it' pile. Excellent.",
        "Look at that. {topic}, locked in.",
        "{topic} is yours now, {kidName}. Wonderful work.",
        "That is mastery, my friend. {topic}, done.",
        "{topic}: officially in your toolkit.",
        "Big one, {kidName}. You have truly got {topic}.",
        "Mastered it. {topic} is part of you now.",
        "Yes! {topic}, checked off the list.",
        "That is how it is done. {topic} mastered.",
        "{topic} is now something you know. Beautifully done.",
      ],
    },
    'character-unlocked': {
      expression: 'surprised',
      lines: [
        "Oh! Look who showed up, {character}!",
        "{character} just joined the Squad! Go say hi in Hero Hall.",
        "A new friend! {character} wants to meet you.",
        "{character} is here, {kidName}. New teammate.",
        "Look at that, {character} unlocked.",
      ],
    },
    'idle-too-long': {
      expression: 'encouraging',
      lines: [
        "Hey {kidName}, still with me?",
        "Take your time. I am here whenever you are ready.",
        "Need a quick break? That is okay.",
        "Thinking is good. Let me know when you are set.",
        "I am right here, {kidName}. No rush.",
        "Want some help, or are you working it out?",
        "Still thinking? That is fine.",
        "Catching your breath? Take all the time you need.",
        "Hey friend. I am here when you want me.",
        "All good? Just say the word.",
      ],
    },
    'idle-too-long-math': {
      expression: 'encouraging',
      lines: [
        "Hey {kidName}, looking at that problem hard?",
        "Take your time with the numbers, my friend.",
        "Want help with this one, or want to keep working?",
        "Thinking carefully is the right move. No rush.",
        "I am here if you want me to walk through it.",
        "Math takes patience. You are doing fine.",
        "Still working on it? Good. Slow is okay.",
        "Want a hint, {kidName}, or shall we keep going?",
        "Tricky one, huh? Tap me if you want help.",
        "Take all the time you need, friend.",
      ],
    },
    'idle-too-long-reading': {
      expression: 'encouraging',
      lines: [
        "Hey {kidName}, ready to read when you are?",
        "Take your time. Find the word, then read it out.",
        "Want me to read it first? Just say so.",
        "I am listening whenever you are ready.",
        "No rush at all. Breathe and try when ready.",
        "Sound it out in your head first if you want.",
        "Still warming up? That is okay.",
        "Want help with this one, or shall I wait?",
        "Take your time, my friend. I will not move.",
        "Whenever you are ready, I am listening.",
      ],
    },
    'try-again': {
      expression: 'encouraging',
      lines: [
        "Want to try that one again? No rush.",
        "Let us give it another shot.",
        "One more try. I believe in you.",
        "Take your time. Try it again when you are ready.",
        "Easy does it. Another go?",
        "No rush at all. Breathe and try again.",
        "Slow down and try it once more.",
        "Reset. Have another go, my friend.",
        "Try it again. Fresh eyes.",
        "One more pass. You have got this.",
        "Take it slow, {kidName}. Once more.",
        "Try again. It will come.",
      ],
    },
    'try-again-math': {
      expression: 'encouraging',
      lines: [
        "Want to count it again? Take your time.",
        "Let us look at the numbers one more time.",
        "One more try, {kidName}. Slow and steady.",
        "Take a breath and count again.",
        "Try it once more. The answer is close.",
        "Reset. Look at the problem fresh.",
        "Count it on your fingers if you need to.",
        "One more pass. You can do this, {kidName}.",
        "Try again. Slow down for it.",
        "Take it slow. The answer will show up.",
      ],
    },
    'try-again-reading': {
      expression: 'encouraging',
      lines: [
        "Want to read it again? Take your time.",
        "Let us sound it out together one more time.",
        "One more try, {kidName}. Clear voice.",
        "Try the word again. Slow it down.",
        "Take a breath and read it once more.",
        "Reset. Look at the letters fresh.",
        "Sound out each part, then put them together.",
        "Try again. Your voice is doing great.",
        "One more try. You are very close.",
        "Read it once more. I am listening.",
      ],
    },
    'time-for-break': {
      expression: 'smile',
      lines: [
        "You have worked hard. Let us take a break.",
        "Good time for water and a stretch.",
        "Break time, {kidName}. You earned it.",
        "Let us pause. Eyes need rest.",
      ],
    },
    'week-summary': {
      expression: 'smile',
      lines: [
        "What a week, {kidName}! Let me tell you what I noticed.",
      ],
    },
    'homework-assigned': {
      expression: 'encouraging',
      lines: [
        "Hi {kidName}! Today's homework is {topic}. You have got this!",
        "Ready for today's homework, {kidName}? Let us tackle {topic}.",
        "Homework time, {kidName}! We are working on {topic} today.",
        "Today's task is {topic}. Let us knock it out together.",
      ],
    },
    'homework-done': {
      expression: 'cheering',
      lines: [
        "You did it, {kidName}! Today's homework is finished!",
        "All done, {kidName}! Great work on your homework!",
        "Homework complete, {kidName}! I am so proud of you.",
        "Done and dusted, {kidName}. Beautiful work today.",
      ],
    },
    // -----------------------------------------------------------------------
    // Sound Stage (Music studio) — added v110. These welcome events fire on
    // each Sound Stage page's Humphrey.init({ welcomeEvent: ... }) call.
    // -----------------------------------------------------------------------
    'welcome-sound-stage': {
      expression: 'smile',
      lines: [
        "Welcome to the Sound Stage, {kidName}! Pick a room — Piano Lab is a great warm-up.",
        "Sound Stage, {kidName}! What sounds fun today?",
        "Hi {kidName}! Music time. Tap any room to begin.",
        "Welcome in. Music makes brains happy — let us see what calls to you today.",
        "Sound Stage it is! Play, listen, or sing — your call.",
      ],
    },
    'welcome-piano-lab': {
      expression: 'smile',
      lines: [
        "Piano Lab! Tap any key to start, {kidName}. I love listening.",
        "Hi {kidName}! Try Free Play first, then we can learn a song together.",
        "Welcome to the Piano Lab. Slow and steady makes pretty music.",
        "Piano time! Pick a mode — Free Play, Learn a Song, or Echo Me.",
        "Here we are at the piano. Take your time, {kidName}.",
      ],
    },
    'welcome-video-theater': {
      expression: 'smile',
      lines: [
        "Welcome to the Video Theater, {kidName}! Pick a category and we will watch together.",
        "Video Theater! Real composers, real songs, real lessons.",
        "Hi {kidName}! Lots of music ready to go. Pick a flavor.",
        "Theater is open. Pull up a seat, friend.",
        "Welcome in. Watching music is its own kind of magic.",
      ],
    },
    'welcome-beat-box': {
      expression: 'cheering',
      lines: [
        "Welcome to the Beat Box, {kidName}! Tap a drum pad to play.",
        "Hi {kidName}! Time to make some beats. Tap any pad to start.",
        "The Beat Box is open — let's build a beat together.",
        "Drummer in the house! Tap a pad, {kidName}.",
        "Beat Box ready, {kidName}. Free Play or Beat Maker — your call.",
      ],
    },
    'welcome-name-instrument': {
      expression: 'encouraging',
      lines: [
        "Welcome, {kidName}! Listen carefully and pick the right instrument.",
        "Hi {kidName}! Ears on — let's see how well you know your instruments.",
        "Time for Name That Instrument. Listen and choose.",
        "Ready, {kidName}? Pick the instrument you hear.",
        "Music quiz time, {kidName}! Tap Play to hear the sound.",
      ],
    },
    'welcome-sing-it-back': {
      expression: 'smile',
      lines: [
        "Welcome, {kidName}! I'll sing a little tune and you sing it back to me.",
        "Hi {kidName}! Sing It Back is open. Tap to hear the pattern.",
        "Time to sing, {kidName}. Listen first, then your turn.",
        "Singers warm up by matching notes — let's try it together.",
        "Ready to sing, {kidName}? Hear the pattern, then sing it back.",
      ],
    },
    'welcome-creation-studio': {
      expression: 'cheering',
      lines: [
        "Welcome to the Creation Studio, {kidName}! Pick a room — Sketch Lab, Animation, or your Gallery.",
        "Hi {kidName}! The studio is open. Let's make beautiful things.",
        "Art time, {kidName}! Eight brushes await in Sketch Lab.",
        "Creation Studio is yours, {kidName}. What will we make today?",
        "Welcome back, artist. Pick a room and let's create.",
      ],
    },
    'welcome-sketch-lab': {
      expression: 'encouraging',
      lines: [
        "Sketch Lab! Try the rainbow brush, {kidName} — it's my favorite.",
        "Welcome, {kidName}! Pick a brush, pick a color, and go.",
        "Time to draw, {kidName}. The kaleidoscope makes patterns by itself.",
        "Hi {kidName}! Tap a brush on the left and start anywhere on the canvas.",
        "Sketch Lab is open. Save when you love what you've made.",
      ],
    },
    'welcome-animation-studio': {
      expression: 'cheering',
      lines: [
        "Animation Studio! Draw a frame, add another, watch them move.",
        "Welcome, {kidName}! Twelve frames max. Make something magical.",
        "Animator at work! Onion skin lets you see your last frame faintly.",
        "Hi {kidName}! Draw, then tap plus to add a new frame.",
        "Time to make things move, {kidName}. Press play when you're ready.",
      ],
    },
    'welcome-photo-booth': {
      expression: 'cheering',
      lines: [
        "Photo Booth! Take a picture, {kidName}, then doodle on top.",
        "Welcome to Photo Booth, {kidName}. Tap the camera button when you're ready.",
        "Smile big, {kidName}! Tap 📷 to capture, then decorate.",
        "Hi {kidName}! Stickers and brushes wait for you after you snap.",
        "Time to pose, {kidName}. Make it silly or make it cool.",
      ],
    },
    'welcome-stamp-studio': {
      expression: 'cheering',
      lines: [
        "Stamp Studio! Pick a scene and drop in stickers, {kidName}.",
        "Welcome, {kidName}! Beach, space, jungle, city, or castle — your choice.",
        "Time to build a world, {kidName}. Tap stickers to add them.",
        "Hi {kidName}! Drag stickers around and resize them with + and −.",
        "Stamp Studio is open. Save when your scene is just right.",
      ],
    },
    'welcome-gallery': {
      expression: 'smile',
      lines: [
        "Your gallery, {kidName}! Everything you've made lives here.",
        "Welcome to the gallery. Tap any creation to see it bigger.",
        "Hi {kidName}! Browse your art. You can share or download anything.",
        "Your masterpieces, {kidName}. Tap one to view, share, or delete.",
        "Welcome back, artist. Pick something to revisit.",
      ],
    },
    // Fallback used if an unknown event is fired AND no { text } override
    // is supplied. Kept benign — no thinking-aloud filler.
    '_default': {
      expression: 'idle',
      lines: ["Okay, {kidName}.", "Mm-hmm.", "Got it, {kidName}.", "Sure thing."],
    },
  };

  // --- State ---------------------------------------------------------------

  const state = {
    cfg: { ...DEFAULTS },
    mounted: false,
    speaking: false,
    audioUnlocked: false,
    queue: [],
    lastVariantByEvent: {},
    currentAudio: null,
    audioEl: null,                     // single reusable <audio>; warmed in user gesture
    currentExpression: 'idle',
    persisted: loadPersisted(),
    idleTimer: null,
    stickyBubbleActive: false,         // true while a visual aid is "frozen" on the bubble after Humphrey finishes speaking
    refs: { root: null, portrait: null, bubble: null, bubbleText: null, bubbleFigure: null, bubbleImg: null, bubbleCaption: null, muteBtn: null },
    listeners: {},
  };

  function loadPersisted() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { muted: false };
      return JSON.parse(raw);
    } catch { return { muted: false }; }
  }
  function savePersisted() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.persisted)); }
    catch { /* private mode etc. — non-fatal */ }
  }

  // --- DOM construction ----------------------------------------------------

  function mount() {
    if (state.mounted || !document.body) return;
    const cfg = state.cfg;

    const root = document.createElement('div');
    root.className = `ha-humphrey ha-humphrey--${cfg.position}`;
    root.setAttribute('aria-live', 'polite');
    root.setAttribute('aria-atomic', 'false');
    root.dataset.expression = 'idle';
    root.dataset.speaking = 'false';
    root.innerHTML = `
      <div class="ha-humphrey__bubble" role="status">
        <figure class="ha-humphrey__bubble-figure" hidden>
          <img class="ha-humphrey__bubble-img" alt="" decoding="async">
          <figcaption class="ha-humphrey__bubble-caption"></figcaption>
        </figure>
        <p class="ha-humphrey__text"></p>
      </div>
      <div class="ha-humphrey__portrait-wrap">
        <button class="ha-humphrey__portrait" type="button"
                aria-label="Tap Ms. Humphrey to hear her again">
          <picture>
            <source type="image/webp"
                    srcset="${cfg.assetBase}humphrey_base_256.webp 1x,
                            ${cfg.assetBase}humphrey_base_512.webp 2x">
            <img src="${cfg.assetBase}humphrey_base_256.png"
                 srcset="${cfg.assetBase}humphrey_base_256.png 1x,
                         ${cfg.assetBase}humphrey_base_512.png 2x"
                 alt="Ms. Humphrey, your teacher"
                 class="ha-humphrey__img"
                 decoding="async">
          </picture>
        </button>
        <button class="ha-humphrey__mute" type="button"
                aria-label="Mute Ms. Humphrey's voice"
                title="Mute voice">
          <span class="ha-humphrey__mute-icon" aria-hidden="true"></span>
        </button>
      </div>
    `;
    document.body.appendChild(root);

    // Cache refs
    state.refs.root = root;
    state.refs.portrait = root.querySelector('.ha-humphrey__portrait');
    state.refs.bubble = root.querySelector('.ha-humphrey__bubble');
    state.refs.bubbleText = root.querySelector('.ha-humphrey__text');
    state.refs.bubbleFigure = root.querySelector('.ha-humphrey__bubble-figure');
    state.refs.bubbleImg = root.querySelector('.ha-humphrey__bubble-img');
    state.refs.bubbleCaption = root.querySelector('.ha-humphrey__bubble-caption');
    state.refs.muteBtn = root.querySelector('.ha-humphrey__mute');

    // Wire up controls
    // Portrait stays as passive presence: face, expression, speech bubble.
    // The big #humphreyBtn is the single "call her" affordance (wired by
    // js/humphrey-qna.js). We deliberately do NOT bind a click handler here
    // so the two UIs stop battling each other.
    // (Was: state.refs.portrait.addEventListener('click', onPortraitClick);)
    state.refs.muteBtn.addEventListener('click', toggleMute);

    // Tap the speech bubble to dismiss a lingering visual aid. Only acts when
    // the bubble is sticky (i.e. carries an image and Humphrey is done
    // speaking); otherwise the tap is a no-op so the kid can't kill her
    // mid-sentence accidentally.
    state.refs.bubble.addEventListener('click', () => {
      if (state.stickyBubbleActive) hideBubble();
    });

    // Reflect initial mute state
    reflectMuteState();

    state.mounted = true;
    emit('mounted');
    debug('Mounted. Position:', cfg.position);
    // 1.5 — Visible listening pulse: toggle CSS class on the root when the
    // Listener module reports the mic is hot. Listener emits via the bus.
    on('started-listening', function () {
      if (state.refs.root) state.refs.root.classList.add('ha-humphrey--listening');
    });
    on('stopped-listening', function () {
      if (state.refs.root) state.refs.root.classList.remove('ha-humphrey--listening');
    });
    // Drain any items that were queued before mount finished (e.g. zone-enter
    // fired from the page's inline init script before DOMContentLoaded). Without
    // this, those items sit in queue forever and pop out on the user's first
    // post-mount say() — playing welcome audio over the first answer response.
    pump();
  }

  function unmount() {
    if (!state.mounted) return;
    state.refs.root?.remove();
    state.refs = { root: null, portrait: null, bubble: null, bubbleText: null, bubbleFigure: null, bubbleImg: null, bubbleCaption: null, muteBtn: null };
    state.mounted = false;
    stopAudio();
    emit('unmounted');
  }

  // --- Public API ----------------------------------------------------------

  /**
   * Trigger Ms. Humphrey to say something.
   *
   * @param {string} event       Key from CATALOG (or arbitrary if you pass options.text)
   * @param {object} [context]   Token substitutions + overrides
   *   context.text         — bypass catalog, use this exact text
   *   context.expression   — force expression
   *   context.audioUrl     — explicit audio file to play
   *   context.duration     — explicit display duration (ms)
   *   context.priority     — 'normal' | 'high'. High clears queue.
   *   context.kidName etc. — token substitutions
   * @returns {Promise<{event, text, expression}>} resolves when she's done speaking
   */
  function say(event, context = {}) {
    if (!state.cfg.enabled) return Promise.resolve({ skipped: 'disabled' });

    const utterance = resolveUtterance(event, context);
    // Carry through an optional visual-aid query so the speech bubble can
    // surface a Wikipedia thumbnail alongside her words.
    if (context && context.image) utterance.image = context.image;
    debug('say()', event, '→', utterance.text);

    if (context.priority === 'high') {
      state.queue = [];
      stopAudio();
      state.speaking = false;
    }

    return new Promise((resolve) => {
      utterance._resolve = resolve;
      state.queue.push(utterance);
      pump();
    });
  }

  function show() { if (state.refs.root) state.refs.root.hidden = false; }
  function hide() { if (state.refs.root) state.refs.root.hidden = true; }
  function isMuted() { return !!state.persisted.muted; }

  function toggleMute() {
    state.persisted.muted = !state.persisted.muted;
    savePersisted();
    reflectMuteState();
    if (state.persisted.muted) stopAudio();
    emit('mute-changed', { muted: state.persisted.muted });
  }

  function setExpression(expr) {
    if (!state.refs.root) return;
    if (state.currentExpression === expr) return; // no-op: skip jitter on auto-restore
    state.currentExpression = expr;
    state.refs.root.dataset.expression = expr;
    // If an expression-specific image exists, crossfade in. Otherwise keep current.
    const img = state.refs.root.querySelector('.ha-humphrey__img');
    if (!img) return;
    const candidate = `${state.cfg.assetBase}humphrey_${expr}_512.webp`;
    // Probe without disrupting the displayed image if it doesn't exist
    const probe = new Image();
    probe.onload = () => {
      // 200ms crossfade: fade out (100ms) -> swap src -> fade back in (100ms)
      img.style.opacity = '0';
      setTimeout(() => {
        img.src = candidate;
        // rAF lets the browser register opacity:0 before transitioning back
        requestAnimationFrame(() => { img.style.opacity = '1'; });
      }, 100);
    };
    probe.onerror = () => { /* keep current; expression art not yet generated */ };
    probe.src = candidate;
  }

  function configure(partial) {
    state.cfg = { ...state.cfg, ...partial };
    debug('configure', state.cfg);
  }

  function on(eventName, fn) {
    (state.listeners[eventName] = state.listeners[eventName] || []).push(fn);
    return () => off(eventName, fn);
  }
  function off(eventName, fn) {
    const arr = state.listeners[eventName];
    if (!arr) return;
    const i = arr.indexOf(fn);
    if (i >= 0) arr.splice(i, 1);
  }
  function emit(eventName, payload) {
    (state.listeners[eventName] || []).forEach((fn) => {
      try { fn(payload); } catch (e) { console.error('[Humphrey] listener error', e); }
    });
  }

  function startIdleWatcher(thresholdMs = 45000, event = 'idle-too-long') {
    stopIdleWatcher();
    const reset = () => {
      clearTimeout(state.idleTimer);
      state.idleTimer = setTimeout(() => say(event), thresholdMs);
    };
    state._idleResetFn = reset;
    ['pointerdown', 'keydown', 'touchstart'].forEach((evt) =>
      window.addEventListener(evt, reset, { passive: true })
    );
    reset();
  }
  function stopIdleWatcher() {
    if (state._idleResetFn) {
      clearTimeout(state.idleTimer);
      ['pointerdown', 'keydown', 'touchstart'].forEach((evt) =>
        window.removeEventListener(evt, state._idleResetFn)
      );
      state._idleResetFn = null;
    }
  }

  // --- Utterance resolution -----------------------------------------------

  function resolveUtterance(event, context) {
    const entry = CATALOG[event] || CATALOG['_default'];
    const lineIdx = pickVariantIndex(event, entry.lines.length);
    const rawLine = context.text || entry.lines[lineIdx];
    const text = interpolate(rawLine, context);
    return {
      event,
      text,
      expression: context.expression || entry.expression || 'idle',
      audioUrl: context.audioUrl || resolveAudioUrl(event, lineIdx),
      duration: context.duration || computeDuration(text),
      context,
    };
  }

  function pickVariantIndex(event, count) {
    if (count <= 1) return 0;
    let idx;
    let tries = 0;
    do {
      idx = Math.floor(Math.random() * count);
      tries++;
    } while (idx === state.lastVariantByEvent[event] && tries < 4);
    state.lastVariantByEvent[event] = idx;
    return idx;
  }

  function interpolate(template, ctx) {
    return template.replace(/\{(\w+)\}/g, (_, key) => {
      if (key in ctx) return String(ctx[key]);
      // sensible defaults so missing context doesn't leak {tokens}
      if (key === 'kidName') return 'friend';
      if (key === 'topic') return 'this';
      if (key === 'zone') return 'this place';
      if (key === 'character') return 'a new friend';
      return '';
    });
  }

  function computeDuration(text) {
    const c = state.cfg;
    return Math.min(c.maxDurationMs, Math.max(c.minDurationMs, text.length * c.msPerCharacter));
  }

  function resolveAudioUrl(event, variantIdx) {
    // Convention: /assets/humphrey/audio/{event}-{variantIdx+1}.mp3
    // If the file doesn't exist, the audio chain falls through to Web Speech.
    return `${state.cfg.assetBase}audio/${event}-${String(variantIdx + 1).padStart(2, '0')}.mp3`;
  }

  // --- Speaking pipeline ---------------------------------------------------

  function pump() {
    if (state.speaking || state.queue.length === 0 || !state.mounted) return;
    const utterance = state.queue.shift();
    state.speaking = true;
    state.currentUtterance = utterance;
    speak(utterance).then(() => {
      state.speaking = false;
      state.currentUtterance = null;
      utterance._resolve?.({
        event: utterance.event,
        text: utterance.text,
        expression: utterance.expression,
      });
      emit('finished-speaking', utterance);
      pump();
    });
  }

  function speak(utterance) {
    return new Promise((resolve) => {
      // Build #voicefix: every new utterance must hard-stop any prior audio
      // before starting its own. Otherwise, when consecutive utterances land
      // on different engines (tryTTS on the warmed Audio element vs tryWebSpeech
      // on SpeechSynthesis), the engine-specific cleanup in the second one
      // misses the first one's voice — and the kid hears two voices saying
      // different things at the same time. stopAudio() is engine-agnostic
      // and idempotent — safe to call here on every speak().
      stopAudio();

      setExpression(utterance.expression);
      showBubble(utterance.text);
      state.refs.root.dataset.speaking = 'true';
      emit('started-speaking', utterance);

      // Visual aid: if the utterance carries an `image` query, fetch async
      // and slip the image into the bubble when it lands — without delaying
      // the text or audio. If she stops speaking before it returns, drop it.
      let visualToken = utterance;
      if (utterance.image) {
        fetchVisualAid(utterance.image).then((hit) => {
          if (!hit) return;
          // Only attach if she's still speaking this same utterance.
          if (state.currentUtterance !== visualToken) return;
          if (state.refs.bubble.dataset.visible !== 'true') return;
          showBubble(utterance.text, hit.url, hit.caption);
          // Once an image has landed on the bubble, the bubble becomes
          // "sticky" — finish() won't auto-hide it. It stays up until
          //   (a) the next utterance calls showBubble() (which clears it), or
          //   (b) the user taps the bubble to dismiss it, or
          //   (c) Humphrey.clearVisualAid() is called programmatically.
          // Note: showBubble() above already cleared the flag (since it's
          // called fresh), so we set it true AFTER showBubble.
          state.stickyBubbleActive = true;
        });
      }

      const finish = () => {
        // If a visual aid landed on this bubble, leave it visible so the kid
        // can still see the picture while reading the question on the page.
        // We still mark speaking as done and drop her expression to idle.
        if (state.stickyBubbleActive) {
          state.refs.root.dataset.speaking = 'false';
          setExpression('idle');
          resolve();
          return;
        }
        hideBubble();
        state.refs.root.dataset.speaking = 'false';
        setExpression('idle');
        resolve();
      };

      const displayTimer = setTimeout(finish, utterance.duration);

      panelLog('speak gate: audioEnabled=' + state.cfg.audioEnabled +
               ' muted=' + isMuted() + ' unlocked=' + state.audioUnlocked);
      // Muted / disabled = no audio attempt at all (correct silent path).
      if (!state.cfg.audioEnabled || isMuted()) {
        panelLog('SKIP audio (disabled or muted)');
        return;
      }

      // v144: ALWAYS attempt playback, even when state.audioUnlocked is false.
      // Installed PWAs on Android Chrome get autoplay grace via the Media
      // Engagement Index — the previous v143 gate refused to even try, so
      // on Letter Lab entry the kid saw a bubble with no audio. We trust
      // playAudio to handle its own rejection: if play() actually fails
      // (true cold browser w/ no MEI), we stash this utterance and replay
      // it on the next user gesture via drainPendingUnlock(). The bubble
      // stays visible during this attempt — same UX as today; the only
      // difference is that successful PWA playback now happens immediately.
      playAudio(utterance).then((played) => {
        if (played) return;
        panelLog('audio chain returned false');
        // Defer for retry only if we never unlocked. If audio was unlocked
        // but TTS still failed (network, etc), don't loop — let the bubble
        // fade and move on.
        if (!state.audioUnlocked && !state.pendingUnlockUtterance) {
          panelLog('audio failed pre-unlock → stashing for next gesture');
          state.pendingUnlockUtterance = utterance;
        }
      }).catch((err) => { panelLog('playAudio threw: ' + (err && err.message)); });
    });
  }

  function showBubble(text, imageUrl, imageCaption) {
    // A new showBubble call always supersedes any prior sticky aid. The next
    // utterance owns the bubble until IT finishes.
    state.stickyBubbleActive = false;
    state.refs.bubbleText.textContent = text;
    // Make the bubble visible BEFORE setting img.src. If the parent figure is
    // display:none when src is assigned, browsers skip the network fetch
    // entirely and the image never renders even after the parent becomes
    // visible. Set visible first, then assign src.
    state.refs.bubble.dataset.visible = 'true';
    if (state.refs.bubbleFigure && state.refs.bubbleImg) {
      if (imageUrl) {
        if (state.refs.bubbleCaption) {
          state.refs.bubbleCaption.textContent = imageCaption || '';
          state.refs.bubbleCaption.hidden = !imageCaption;
        }
        state.refs.bubbleFigure.hidden = false;
        // Assign src last, after parent is display:flex.
        state.refs.bubbleImg.alt = imageCaption || '';
        state.refs.bubbleImg.src = imageUrl;
      } else {
        state.refs.bubbleFigure.hidden = true;
        state.refs.bubbleImg.removeAttribute('src');
      }
    }
  }
  function hideBubble() {
    state.stickyBubbleActive = false;
    state.refs.bubble.dataset.visible = 'false';
    if (state.refs.bubbleFigure) state.refs.bubbleFigure.hidden = true;
    if (state.refs.bubbleImg) state.refs.bubbleImg.removeAttribute('src');
  }

  /**
   * Public API: dismiss a sticky visual aid programmatically.
   * Called e.g. from a zone JS when the kid moves on to the next card.
   */
  function clearVisualAid() {
    if (state.stickyBubbleActive) hideBubble();
  }

  // -------------------------------------------------------------------------
  // Image search — async fetch with a small client-side cache.
  // Called when an utterance was raised with `image: 'some query'`.
  // -------------------------------------------------------------------------
  const imageCache = new Map(); // q -> { url, caption } | null

  function fetchVisualAid(query) {
    if (!query || typeof query !== 'string') return Promise.resolve(null);
    const key = query.trim().toLowerCase();
    if (!key) return Promise.resolve(null);
    if (imageCache.has(key)) return Promise.resolve(imageCache.get(key));
    return fetch('/api/humphrey/image-search?q=' + encodeURIComponent(query), {
      headers: { Accept: 'application/json' },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const hit = (j && j.url) ? { url: j.url, caption: j.caption || '' } : null;
        imageCache.set(key, hit);
        return hit;
      })
      .catch(() => { imageCache.set(key, null); return null; });
  }

  /** Audio chain: pre-rendered MP3 → ElevenLabs TTS → Web Speech API → silent */
  function playAudio(utterance) {
    const prerendered = state.cfg.skipPrerendered
      ? Promise.resolve(false)
      : tryPrerendered(utterance.audioUrl, utterance);
    return prerendered.then((played) => {
      if (played) return true;
      // Stale-arrival guard: if a newer utterance has taken over before the
      // prerendered probe finished, don't kick off TTS at all.
      if (state.currentUtterance && state.currentUtterance !== utterance) {
        panelLog('playAudio: skipping TTS — utterance no longer current');
        return false;
      }
      return tryTTS(utterance.text, utterance);
    }).then((played) => {
      if (played) return true;
      if (state.currentUtterance && state.currentUtterance !== utterance) {
        panelLog('playAudio: skipping WebSpeech — utterance no longer current');
        return false;
      }
      if (state.cfg.fallbackToWebSpeech) return tryWebSpeech(utterance.text, utterance);
      return false;
    });
  }

  function tryPrerendered(url, utteranceRef) {
    return new Promise((resolve) => {
      if (!url) return resolve(false);
      const audio = new Audio();
      let settled = false;
      const succeed = () => { if (!settled) { settled = true; resolve(true); } };
      const fail = () => { if (!settled) { settled = true; resolve(false); } };
      audio.addEventListener('canplaythrough', () => {
        // Build #voicefix: stale-arrival guard — if a newer utterance has
        // displaced this one while we were probing, don't barge in.
        if (utteranceRef && state.currentUtterance && state.currentUtterance !== utteranceRef) {
          panelLog('prerendered stale on canplaythrough — dropping');
          fail();
          return;
        }
        succeed();
        stopAudio();
        state.currentAudio = audio;
        audio.play().catch(fail);
      }, { once: true });
      audio.addEventListener('error', fail, { once: true });
      // 1.5s timeout — if file not cached / 404, fall back fast
      setTimeout(fail, 1500);
      audio.src = url;
      audio.load();
    });
  }

  /** Hit the Vercel TTS proxy (POST text → ElevenLabs → audio/mpeg).
   *  Accepts the utterance ref so we can detect stale arrivals — if a new
   *  utterance has displaced this one by the time the network blob lands,
   *  we silently drop instead of speaking over the new one. */
  function tryTTS(text, utteranceRef) {
    const endpoint = state.cfg.ttsEndpoint;
    if (!endpoint || !text) { panelLog('TTS skip: no endpoint or text'); return Promise.resolve(false); }
    panelLog('TTS fetch "' + text.slice(0, 30) + '"');
    return fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
      .then((resp) => {
        panelLog('TTS resp ' + resp.status + ' ct=' + resp.headers.get('content-type'));
        if (!resp.ok) throw new Error('TTS ' + resp.status);
        return resp.blob();
      })
      .then((blob) => {
        panelLog('TTS blob ' + blob.size + 'B');
        // Build #voicefix: stale-arrival guard. If a new utterance has taken
        // over (state.currentUtterance moved on, or this utterance was
        // explicitly cleared), drop this audio rather than barge in.
        if (utteranceRef && state.currentUtterance && state.currentUtterance !== utteranceRef) {
          panelLog('TTS stale on arrival — dropping (newer utterance is active)');
          return false;
        }
        return new Promise((resolve) => {
          const blobUrl = URL.createObjectURL(blob);
          // CRITICAL: reuse the single audio element that was warmed during the
          // user gesture in setupAudioUnlock. Android Chrome's autoplay policy
          // tracks media-engagement per element; a brand-new <audio> created
          // here (off the gesture stack) gets silently rejected. The warmed
          // element carries its engagement forward across src changes.
          let audio = state.audioEl;
          if (!audio) {
            // Unlock never ran (programmatic say before any gesture). Best
            // effort: still try, but log loudly so we know this is happening.
            console.warn('[Humphrey] tryTTS: no warmed audioEl — first play may fail on mobile');
            panelLog('NO WARMED ELEM (gesture never fired before say) — making cold one');
            audio = new Audio();
            audio.preload = 'auto';
            state.audioEl = audio;
          }
          // Cancel any current playback on this element before swapping source
          try { audio.pause(); audio.currentTime = 0; } catch(e) {}
          // Reset listeners (avoid accumulation across reuse)
          audio.onended = () => { panelLog('TTS ended naturally'); try { URL.revokeObjectURL(blobUrl); } catch(e){} };
          audio.onerror = () => {
            const e = audio.error;
            console.error('[Humphrey] TTS audio element error:',
              e ? { code: e.code, message: e.message } : '(no detail)');
            panelLog('ELEM ERR ' + (e ? ('code=' + e.code + ' ' + e.message) : '(no detail)'));
            done(false);
          };
          state.currentAudio = audio;
          audio.volume = 1;
          audio.src = blobUrl;
          audio.load();  // commit src on Android Chrome before play()
          panelLog('audio.load called, calling play() — rs=' + audio.readyState);
          let settled = false;
          const done = (ok) => { if (settled) return; settled = true; resolve(ok); };
          const p = audio.play();
          if (p && typeof p.then === 'function') {
            p.then(() => {
              debug('TTS play started ok');
              panelLog('PLAY ✓ playing');
              done(true);
            }).catch((err) => {
              // LOUD: this is the failure mode that's been silent all along.
              console.error('[Humphrey] TTS play rejected:',
                err && err.name, err && err.message,
                '— audioUnlocked=', state.audioUnlocked,
                'audioElPrimed=', !!state.audioEl);
              panelLog('PLAY ✗ ' + (err && err.name) + ': ' + (err && err.message) +
                       ' unlocked=' + state.audioUnlocked + ' primed=' + !!state.audioEl);
              done(false);
            });
          } else {
            panelLog('play() returned no promise');
            done(true);
          }
          setTimeout(() => { if (!settled) panelLog('TTS timeout 8s'); done(false); }, 8000);
        });
      })
      .catch((err) => {
        console.error('[Humphrey] tryTTS failed:', err && err.message ? err.message : err);
        panelLog('TTS FETCH FAIL ' + (err && err.message ? err.message : err));
        return false;
      });
  }

  function tryWebSpeech(text, _utteranceRef) {
    return new Promise((resolve) => {
      if (typeof window.speechSynthesis === 'undefined') return resolve(false);
      try {
        const u = new SpeechSynthesisUtterance(text);
        u.rate = 0.95;
        u.pitch = 1.05;
        // Prefer a female voice if available
        const voices = window.speechSynthesis.getVoices();
        const preferred = voices.find(v => /female|samantha|karen|tessa|moira|priya|veena|raveena/i.test(v.name))
                       || voices.find(v => /en-/.test(v.lang) && /female/i.test(v.name))
                       || voices.find(v => /en-/.test(v.lang));
        if (preferred) u.voice = preferred;
        u.onend = () => resolve(true);
        u.onerror = () => resolve(false);
        state.currentAudio = { stop: () => window.speechSynthesis.cancel() };
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
      } catch {
        resolve(false);
      }
    });
  }

  function stopAudio() {
    // Build #voicefix v2: minimal, surgical kill switch.
    // The bug we're fixing: when consecutive utterances land on DIFFERENT
    // audio engines (warmed Audio element vs window.speechSynthesis),
    // each engine's local cleanup misses the other one, so two voices end
    // up speaking different things at the same time.
    //
    // The naive fix — pause state.audioEl unconditionally — overshoots:
    // it interrupts the gesture-warming primer's still-pending play()
    // promise, and the next utterance's play() also aborts. So we only
    // touch what's actually playing.
    if (state.currentAudio) {
      try {
        if (typeof state.currentAudio.pause === 'function') state.currentAudio.pause();
        if (typeof state.currentAudio.stop === 'function') state.currentAudio.stop();
      } catch { /* noop */ }
      state.currentAudio = null;
    }
    // ALWAYS cancel speechSynthesis even if state.currentAudio wasn't
    // pointing at the wrapper (defensive — the wrapper may have been
    // overwritten by a subsequent tryTTS call setting state.currentAudio
    // = state.audioEl while speechSynthesis was still mid-utterance).
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try { window.speechSynthesis.cancel(); } catch { /* noop */ }
    }
    // NOTE: we deliberately do NOT pause state.audioEl directly. The case
    // where state.audioEl was the engine is already covered above via
    // state.currentAudio === state.audioEl. Pausing it unconditionally
    // would also abort the gesture-warming primer's pending play(), which
    // breaks audio start on cold pages.
  }

  // --- UI handlers ---------------------------------------------------------

  function onPortraitClick() {
    // Tapping her replays the last line or fires a friendly default
    const last = state.lastSpoken;
    if (last && !state.speaking) {
      say(last.event, { ...last.context, text: last.text });
    } else if (!state.speaking) {
      say('idle-too-long');
    }
  }

  function reflectMuteState() {
    if (!state.refs.root) return;
    state.refs.root.dataset.muted = String(!!state.persisted.muted);
    state.refs.muteBtn.setAttribute(
      'aria-label',
      state.persisted.muted ? "Unmute Ms. Humphrey's voice" : "Mute Ms. Humphrey's voice"
    );
  }

  // Track last spoken so the tap-to-replay works
  on('started-speaking', (u) => { state.lastSpoken = u; });

  // --- Bootstrap -----------------------------------------------------------

  function init(opts = {}) {
    configure(opts);
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => { mount(); ensureDebugPanel(); panelLog('init: mounted'); }, { once: true });
    } else {
      mount();
      ensureDebugPanel();
      panelLog('init: mounted (immediate)');
    }
    setupAudioUnlock();
    panelLog('init: setupAudioUnlock done; waiting for gesture');
  }

  /**
   * Chrome/Safari autoplay policy requires audio.play() to be initiated
   * by a user gesture. Async chains (click → fetch TTS → play blob) break
   * the gesture link. Fix: on first user gesture, play a silent audio
   * synchronously to "unlock" the document. After that, async play() works.
   */
  /**
   * 1.3 — Auto-welcome on first gesture, gated by a daily flag.
   * Returns silently if no welcomeEvent is configured, if already welcomed
   * today, or if localStorage is unavailable. Slight setTimeout so the
   * welcome plays cleanly after the audio primer has resolved.
   */
  function maybeAutoWelcome() {
    var ev = state.cfg.welcomeEvent;
    if (!ev) return;
    var today;
    try { today = new Date().toISOString().slice(0, 10); }
    catch (_) { today = ''; }
    var flagKey = 'ha_welcomed_' + ev + '_' + today;
    var already = false;
    try { already = localStorage.getItem(flagKey) === '1'; } catch (_) {}
    if (already) { debug('autoWelcome skipped (already today):', ev); return; }
    try { localStorage.setItem(flagKey, '1'); } catch (_) {}
    debug('autoWelcome firing:', ev);
    // 250ms gives the audio primer a beat to resolve so the welcome plays
    // through the warmed audio element instead of fighting the gesture frame.
    setTimeout(function () {
      try { say(ev, { kidName: state.cfg.kidName || 'friend' }); }
      catch (e) { debug('autoWelcome say err', e); }
    }, 250);
  }

  /**
   * v143 — Replays the most recent utterance that was deferred because
   * audio wasn't unlocked yet. Called from the unlock callback right after
   * maybeAutoWelcome(). We replay only the LAST deferred utterance (not
   * a queue) because anything older is stale by the time the user finally
   * tapped — if Letter Lab fired three say()s before unlock, the user only
   * needs to hear the current one. 250ms gives the audio primer a beat
   * to warm the element before re-speak().
   */
  function drainPendingUnlock() {
    if (!state.pendingUnlockUtterance) return;
    const utterance = state.pendingUnlockUtterance;
    state.pendingUnlockUtterance = null;
    panelLog('drainPendingUnlock firing: ' + utterance.event);
    debug('drainPendingUnlock replaying:', utterance.event);
    setTimeout(function () {
      // Push directly onto the queue head and pump — we already built the
      // utterance via resolveUtterance() in the first say() call, so we
      // skip rebuild and let speak() handle it cleanly now that the gate
      // will pass.
      state.queue.unshift(utterance);
      pump();
    }, 250);
  }

  function setupAudioUnlock() {
    const unlock = (ev) => {
      panelLog('gesture ' + (ev && ev.type) + ' (unlocked=' + state.audioUnlocked + ')');
      if (state.audioUnlocked) return;
      // SYNCHRONOUS gate: flip the flag immediately inside the gesture stack
      // so any speak() in the same click handler passes the check at line ~512.
      state.audioUnlocked = true;
      debug('audio unlocked (synchronous flag set in user gesture)');
      // 1.3 — Auto-welcome on first gesture, once per day per page.
      try { maybeAutoWelcome(); } catch (e) { debug('autoWelcome err', e); }
      // v143 — Drain any speak() that fired before this gesture (Letter Lab
      // and any other zone that calls Humphrey.say() on initial render).
      try { drainPendingUnlock(); } catch (e) { debug('drainPendingUnlock err', e); }
      try {
        // Create ONE reusable <audio> element and warm it synchronously inside
        // this gesture. Android Chrome's autoplay policy is tracked per
        // HTMLMediaElement: once an element has been play()'d in-gesture, it
        // can be re-played later with a different src. We keep this element
        // and reuse it for every utterance in tryTTS. This is the fix for
        // "no sound on the tablet" — see HANDOFF.md Issue #1.
        if (!state.audioEl) {
          state.audioEl = new Audio();
          state.audioEl.preload = 'auto';
        }
        const a = state.audioEl;
        const TINY_SILENCE = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
        a.volume = 0;
        a.src = TINY_SILENCE;
        a.load();
        const p = a.play();
        if (p && p.then) {
          p.then(() => {
            debug('audio unlock primer played ok — element warmed');
            panelLog('PRIMER ✓ element warmed');
            try { a.pause(); a.currentTime = 0; a.volume = 1; } catch (e) {}
          }).catch((err) => {
            console.warn('[Humphrey] audio unlock primer play rejected:',
              err && err.name, err && err.message,
              '— real TTS plays may still work; flag stays set');
            panelLog('PRIMER ✗ ' + (err && err.name) + ' ' + (err && err.message));
            try { a.volume = 1; } catch (e) {}
          });
        } else {
          panelLog('PRIMER: no promise (sync)');
          try { a.volume = 1; } catch (e) {}
        }
      } catch (e) {
        console.error('[Humphrey] audio unlock threw:', e);
        panelLog('UNLOCK THREW ' + (e && e.message));
      }
    };
    ['click', 'touchstart', 'touchend', 'keydown', 'pointerdown'].forEach((ev) => {
      document.addEventListener(ev, unlock, { once: false, capture: true, passive: true });
    });
  }

  // On-screen debug panel. Enabled when localStorage.ha_humphrey_debug === '1'.
  // Lets us diagnose audio failures on devices where we can't open devtools
  // (Android tablets without USB cable, locked-down kiosks, etc).
  function isDebugOn() {
    if (state.cfg.debug) return true;
    try { return localStorage.getItem('ha_humphrey_debug') === '1'; }
    catch (e) { return false; }
  }
  function ensureDebugPanel() {
    if (!isDebugOn()) return null;
    if (state.refs.debugPanel) return state.refs.debugPanel;
    const p = document.createElement('div');
    p.id = 'ha-humphrey-debug';
    p.style.cssText = [
      'position:fixed','top:0','left:0','right:0','z-index:2147483647',
      'background:rgba(0,0,0,0.92)','color:#0f0','font:11px/1.35 ui-monospace,Menlo,Consolas,monospace',
      'padding:6px 8px','max-height:50vh','overflow-y:auto','white-space:pre-wrap',
      'border-bottom:2px solid #0f0','pointer-events:auto'
    ].join(';');
    const hdr = document.createElement('div');
    hdr.style.cssText = 'display:flex;justify-content:space-between;align-items:center;color:#fff;font-weight:bold;border-bottom:1px solid #0f0;padding-bottom:4px;margin-bottom:4px';
    hdr.innerHTML = '<span>Humphrey debug · tap to copy · long-press to clear</span><span id="ha-humphrey-debug-state" style="color:#0f0;font-weight:normal">…</span>';
    const log = document.createElement('div');
    log.id = 'ha-humphrey-debug-log';
    p.appendChild(hdr);
    p.appendChild(log);
    // Tap to copy entire log to clipboard
    let pressTimer = null;
    p.addEventListener('touchstart', () => {
      pressTimer = setTimeout(() => { log.innerHTML = ''; pressTimer = null; }, 800);
    }, { passive: true });
    p.addEventListener('touchend', () => {
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = null;
        const txt = log.innerText;
        try { navigator.clipboard?.writeText(txt); } catch(e){}
        hdr.querySelector('#ha-humphrey-debug-state').textContent = 'COPIED ' + txt.length + 'B';
        setTimeout(() => refreshDebugState(), 1500);
      }
    });
    document.body.appendChild(p);
    state.refs.debugPanel = p;
    state.refs.debugLog = log;
    state.refs.debugState = hdr.querySelector('#ha-humphrey-debug-state');
    refreshDebugState();
    return p;
  }
  function refreshDebugState() {
    if (!state.refs.debugState) return;
    const a = state.audioEl;
    const parts = [
      'unlocked=' + state.audioUnlocked,
      'el=' + (a ? 'Y' : 'N'),
      a ? ('rs=' + a.readyState + ' p=' + a.paused) : '',
      'spk=' + state.speaking,
      'q=' + state.queue.length
    ].filter(Boolean);
    state.refs.debugState.textContent = parts.join(' ');
  }
  function panelLog(line) {
    if (!isDebugOn()) return;
    try {
      ensureDebugPanel();
      const log = state.refs.debugLog;
      if (!log) return;
      const t = new Date().toLocaleTimeString('en-US', { hour12: false }) + '.' +
                String(Date.now() % 1000).padStart(3, '0');
      const div = document.createElement('div');
      div.textContent = t + ' ' + line;
      log.appendChild(div);
      // Cap to last 60 lines
      while (log.childNodes.length > 60) log.removeChild(log.firstChild);
      log.scrollTop = log.scrollHeight;
      refreshDebugState();
    } catch (e) { /* don't let debug code break the page */ }
  }

  function debug(...args) {
    if (state.cfg.debug) { console.log('[Humphrey]', ...args); panelLog(args.map(String).join(' ')); return; }
    try {
      if (localStorage.getItem('ha_humphrey_debug') === '1') {
        console.log('[Humphrey]', ...args);
        panelLog(args.map(String).join(' '));
      }
    } catch (e) { /* private mode etc. */ }
  }

  // Public surface
  NS.Humphrey = {
    VERSION,
    init,
    say,
    show,
    hide,
    toggleMute,
    isMuted,
    setExpression,
    configure,
    startIdleWatcher,
    stopIdleWatcher,
    clearVisualAid,
    on,
    off,
    emit,        // 1.5 — exposed so Listener can signal the listening state
    unmount,
    // Inspection helpers (handy in devtools)
    _state: state,
    _catalog: CATALOG,
  };

  // Auto-init if data-attribute opts in. Otherwise the host page calls init().
  if (document.currentScript?.dataset.autoInit === 'true') {
    init();
  }
})();
