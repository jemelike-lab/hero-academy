/**
 * Hero Academy — /api/class-time/questions
 *
 * v172. Generates 8 multiple-choice questions + paired remediation scripts
 * for ONE course (subject + topics) of Nigel's day. Caches per (child, date,
 * course_order) so questions stay stable within a day but rotate every day.
 *
 * Schema returned per question:
 *   {
 *     topic: string,           // e.g. "Addition within 20"
 *     question: string,        // the question text Humphrey will read
 *     options: string[],       // 3 or 4 answer strings, each ≤ 30 chars
 *     correct_index: number,   // 0-based index into options
 *     explanation: string,     // ≤ 200 chars, said on correct OR after demo
 *     hint: string,            // ≤ 150 chars, said after first wrong attempt
 *     remediation: {           // played when wrong twice
 *       intro: string,         // ≤ 200 chars
 *       steps: [{              // 2-5 steps
 *         say: string,         // ≤ 200 chars
 *         board: null | { tool: 'writeWord'|'writeLetter'|'drawEquation'|'showVisual'|'clearBoard', args: object }
 *       }],
 *       outro: string          // ≤ 200 chars
 *     }
 *   }
 *
 * Request:
 *   GET /api/class-time/questions?date=YYYY-MM-DD&child_id=UUID&course_order=1[&force=1]
 *
 * Response (200):
 *   { ok: true, source: 'cache' | 'haiku' | 'fallback', subject, count, questions }
 *
 * Errors:
 *   400 { error, detail }
 *   500 { error: 'no_supabase' | 'no_api_key' }
 *   502 { error: 'haiku_failed' | 'too_few_valid_questions', detail }
 */

const HAIKU_MODEL = 'claude-haiku-4-5';
const ANTHROPIC_VERSION = '2023-06-01';
const QUESTIONS_PER_COURSE = 8;

const ALLOWED_BOARD_TOOLS = new Set(['writeWord', 'writeLetter', 'drawEquation', 'showVisual', 'clearBoard']);
const ALLOWED_SUBJECTS = new Set([
  'math', 'reading', 'spelling', 'writing', 'grammar', 'vocabulary', 'science', 'social'
]);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const date = String(req.query.date || '').trim();
  const childId = String(req.query.child_id || '').trim();
  const courseOrder = parseInt(String(req.query.course_order || ''), 10);
  const force = String(req.query.force || '').trim() === '1';

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'bad_request', detail: 'date must be YYYY-MM-DD' });
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(childId)) {
    return res.status(400).json({ error: 'bad_request', detail: 'child_id must be a UUID' });
  }
  if (!Number.isInteger(courseOrder) || courseOrder < 1 || courseOrder > 4) {
    return res.status(400).json({ error: 'bad_request', detail: 'course_order must be 1..4' });
  }

  const SUPA_URL = process.env.SUPABASE_URL;
  const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

  if (!SUPA_URL || !SUPA_KEY) return res.status(500).json({ error: 'no_supabase' });

  // ---- 1. Try cache ----
  if (!force) {
    try {
      const cached = await supabaseRpc(SUPA_URL, SUPA_KEY, 'ha_get_class_time_questions', {
        p_child_id: childId, p_plan_date: date, p_course_order: courseOrder,
      });
      if (cached && Array.isArray(cached.questions) && cached.questions.length >= 3) {
        return res.status(200).json({
          ok: true, source: 'cache',
          subject: cached.subject,
          count: cached.questions.length,
          questions: cached.questions,
          generated_at: cached.generated_at,
        });
      }
    } catch (e) {
      console.log('[ct-questions] cache lookup failed (continuing):', String(e).slice(0, 200));
    }
  }

  // ---- 2. Look up the course for this slot from the day plan ----
  let coursePlan;
  try {
    const dayPlan = await supabaseRpc(SUPA_URL, SUPA_KEY, 'ha_get_day_lesson_plan', {
      p_child_id: childId, p_date: date,
    });
    if (dayPlan && Array.isArray(dayPlan.courses)) {
      coursePlan = dayPlan.courses.find((c) => c.order === courseOrder);
    }
  } catch (e) {
    console.log('[ct-questions] day plan lookup failed:', String(e).slice(0, 200));
  }

  if (!coursePlan) {
    // No day plan yet — caller should fetch /lesson-plan-day first. We still
    // honor with a generic math course so Class Time never hard-fails.
    coursePlan = {
      order: courseOrder,
      subject: ['math', 'reading', 'spelling', 'science'][courseOrder - 1] || 'math',
      subject_label: '',
      topics: [],
    };
  }

  const subject = String(coursePlan.subject || 'math');

  // ---- 3. Generate via Haiku ----
  if (!ANTHROPIC_KEY) {
    return res.status(500).json({ error: 'no_api_key' });
  }

  let questions;
  let source = 'haiku';
  try {
    questions = await generateWithHaiku(ANTHROPIC_KEY, subject, coursePlan, date);
  } catch (e) {
    console.log('[ct-questions] Haiku failed, returning fallback:', String(e).slice(0, 300));
    questions = fallbackBank(subject);
    source = 'fallback';
  }

  if (!Array.isArray(questions) || questions.length < 3) {
    // Last-ditch fallback
    questions = fallbackBank(subject);
    source = 'fallback';
  }

  // ---- 4. Save to cache (best-effort) ----
  try {
    await supabaseRpc(SUPA_URL, SUPA_KEY, 'ha_save_class_time_questions', {
      p_child_id: childId,
      p_plan_date: date,
      p_course_order: courseOrder,
      p_subject: subject,
      p_questions: questions,
      p_source: source,
    });
  } catch (e) {
    console.log('[ct-questions] save failed (continuing):', String(e).slice(0, 200));
  }

  return res.status(200).json({
    ok: true, source, subject, count: questions.length, questions,
  });
}

// =====================================================================
// Haiku call
// =====================================================================
async function generateWithHaiku(apiKey, subject, coursePlan, date) {
  const topicLines = (coursePlan.topics || []).slice(0, 4).map((t, i) => {
    const id = t.id || `topic-${i + 1}`;
    const title = t.title || '';
    const focus = t.focus || '';
    return `  ${i + 1}. ${id} — ${title}${focus ? ` (focus: ${focus})` : ''}`;
  }).join('\n') || '  (no topics in plan — use 4 subject-appropriate sub-topics)';

  const dow = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' });

  const systemPrompt = [
    'You generate multiple-choice quiz questions for Nigel, a 7-year-old 2nd grader homeschooled in Maryland.',
    'Each question appears in Class Time as a card with 3-4 tappable answer buttons. Ms. Humphrey reads the',
    'question and every option aloud BEFORE Nigel can tap, then he picks. If he gets it wrong twice, a',
    'whiteboard appears and she walks him through solving it step-by-step using your "remediation" script.',
    '',
    `Today is ${dow}, ${date}.`,
    '',
    `SUBJECT: ${subject}`,
    `COURSE TOPICS (use all 4, ~2 questions per topic):`,
    topicLines,
    '',
    '== ABSOLUTE RULES ==',
    `- Generate EXACTLY ${QUESTIONS_PER_COURSE} questions.`,
    '- Each question has 3 OR 4 options (prefer 4 for math/spelling, 3 is fine for reading/science).',
    '- Each option string ≤ 56 characters. MUST be a complete sentence with closing punctuation. NEVER truncate mid-word.',
    '- correct_index is the 0-based index of the right answer.',
    '- Distractors must be plausible — no obvious silly wrong answers like "potato".',
    '- explanation ≤ 200 chars, hint ≤ 150 chars — both kid-friendly, no jargon.',
    '- Each question MUST include a "description" (1-2 short sentences that TEACH the answer) and a',
    '  "visual" (a real-world noun phrase for a photo, e.g. "Chesapeake Bay"; use "" for pure math).',
    '',
    '== TEACH-THEN-ASK — DESCRIPTION + SUPPORTING PHOTO (REQUIRED) ==',
    'Nigel is 7. He CANNOT answer from outside knowledge he was never taught. So EVERY question',
    'must TEACH the fact first, then check it. Two extra fields make this work:',
    '  • "description": 1-2 SHORT sentences (2nd-grade words) that TEACH the exact fact needed to',
    '    answer. Nigel must be able to answer using ONLY this description. It is shown on the card AND',
    '    Ms. Humphrey reads it aloud before the question. e.g. "The Chesapeake Bay is a huge body of',
    '    water in Maryland. It is full of fish and crabs."',
    '  • "visual": a short real-world noun phrase used to fetch a REAL photo for the dashboard, e.g.',
    '    "Chesapeake Bay", "blue crab", "Maryland state flag", "monarch butterfly", "George Washington".',
    '    Pick a concrete, depictable thing tied to the question. For pure arithmetic/math where a photo',
    '    does not help, set "visual" to "" (empty string).',
    'The QUESTION then checks understanding of the description. The answer is ALWAYS findable in the',
    'description — never a fact Nigel must already know.',
    'GOOD (social): description "The Chesapeake Bay is a huge body of water in Maryland, full of fish',
    'and crabs." / visual "Chesapeake Bay" / question "What is the Chesapeake Bay?" / correct answer',
    '"A large body of water with fish and crabs."',
    'BAD (cold recall — FORBIDDEN): question "What is the Chesapeake Bay known for?" with NO description',
    'teaching it first. If a 7-year-old could not answer from the description alone, it is too hard.',
    '',
    'The QUESTION TEXT itself stays SELF-CONTAINED — do NOT write "look at the picture / count the dots',
    '/ see the chart below". The photo is gentle SUPPORT, not something to count. Put the teaching in',
    '"description", never in a "look at the image" instruction.',
    'remediation.steps CAN still use board tools (writeWord, drawEquation, showVisual) AFTER two misses.',
    '',
    '- remediation.steps has 2-5 steps. Each step has BOTH "say" (kid-friendly TTS narration, ≤ 200 chars)',
    '  AND "board" which is either null OR { tool, args }.',
    '- ALLOWED board tools: writeWord, writeLetter, drawEquation, showVisual, clearBoard',
    '  · writeWord({ word: string ≤ 24 chars })',
    '  · writeLetter({ letter: single char A-Z })',
    '  · drawEquation({ equation: string ≤ 32 chars, e.g. "7 + 5 = 12" })',
    '  · showVisual({ topic: short noun ≤ 24 chars, e.g. "butterfly" })',
    '  · clearBoard({}) — no args',
    '- IMPORTANT: do NOT put the full question text into board args. board args are for the SOLUTION',
    '  demonstration only (writing numbers/words she\'s teaching). Question text stays on the question card.',
    '- "intro" introduces the demo (≤ 200 chars). "outro" wraps it up (≤ 200 chars).',
    '- Subject-specific board tool guidance:',
    '  · math → drawEquation for equations, writeWord for short numbers like "10" or "2 + 3"',
    '  · spelling → writeWord for each spelled word, writeLetter for highlighting individual letters',
    '  · reading → writeWord for the word being analyzed, showVisual sparingly for vocabulary',
    '  · science → showVisual for the concept (butterfly, water cycle, mammal), writeWord for key terms',
    '  · social → showVisual (Maryland flag, map landmarks), writeWord for short names',
    '',
    '== STYLE ==',
    '- Warm tutor voice. Use Nigel\'s name occasionally (not every question).',
    '- Difficulty: GENTLE 2nd-grade level. Short, simple words. The correct answer MUST be findable in',
    '  the "description" you wrote — NEVER require facts Nigel was not just taught on screen. When in doubt, EASIER.',
    '- v180 MATH DIFFICULTY: When subject is "math", ALL 8 questions MUST use TWO-DIGIT ADDITION. Operands 10-79, sums to 99. NO single-digit problems. NO subtraction. NO place-value. NO comparing. ONLY addition. Mix regrouping (27+15, 38+26) with non-regrouping (23+14, 45+32). At least FOUR of eight MUST require regrouping. Word problems use two-digit numbers ("Nigel had 24 stickers and got 17 more"). This is non-negotiable.',
    '- Variety across the 8 questions — no two should look the same.',
    '',
    '== CRITICAL — CORRECT ANSWER POSITION ==',
    'correct_index MUST be distributed across positions 0, 1, 2, 3. Use each position at least once.',
    'NEVER put all correct answers at position 0. NEVER put more than 3 at the same position.',
    'Example distribution: Q1→2, Q2→0, Q3→3, Q4→1, Q5→2, Q6→0, Q7→3, Q8→1.',
    'This is MANDATORY. Uniform position = rejected.',
    '',
    '== CRITICAL — CORRECT ANSWER STRING (SOURCE OF TRUTH) ==',
    'In ADDITION to correct_index, every question MUST include "correct_answer": the',
    'exact text of the right option, copied character-for-character from the options array.',
    'The server trusts correct_answer over correct_index. If they disagree, correct_answer wins.',
    'So: solve the problem, decide the answer, then COPY that option string into correct_answer.',
    'Copy it. Copy it. Copy it. Verbatim — same characters, same spacing, same punctuation.',
    '',
    '== OUTPUT — ONE JSON OBJECT, NO MARKDOWN, NO PREAMBLE ==',
    '{',
    '  "questions": [',
    '    {',
    '      "topic": "string (matches one of the course topics)",',
    '      "question": "string",',
    '      "description": "string — 1-2 short sentences that TEACH the fact; the answer MUST be findable here",',
    '      "visual": "string — a real-world noun for a photo, e.g. \\"Chesapeake Bay\\"; use \\"\\" for pure math",',
    '      "options": ["string", "string", "string", "string"],',
    '      "correct_index": 2,',
    '      "correct_answer": "string — the VERBATIM text of the correct option, copied EXACTLY from the options array above",',
    '      "explanation": "string ≤ 200 chars",',
    '      "hint": "string ≤ 150 chars",',
    '      "remediation": {',
    '        "intro": "string ≤ 200 chars",',
    '        "steps": [',
    '          { "say": "string", "board": { "tool": "drawEquation", "args": { "equation": "7 + 5 = ?" } } },',
    '          { "say": "string", "board": null },',
    '          { "say": "string", "board": { "tool": "drawEquation", "args": { "equation": "7 + 5 = 12" } } }',
    '        ],',
    '        "outro": "string ≤ 200 chars"',
    '      }',
    '    }',
    `    // exactly ${QUESTIONS_PER_COURSE} of these`,
    '  ]',
    '}',
  ].join('\n');

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: HAIKU_MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        { role: 'user', content: `Generate ${QUESTIONS_PER_COURSE} fresh ${subject} questions for today's course. Return only the JSON object.` },
      ],
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Anthropic ${r.status}: ${t.slice(0, 300)}`);
  }
  const data = await r.json();
  const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const parsed = JSON.parse(cleaned);

  if (!parsed || !Array.isArray(parsed.questions)) {
    throw new Error('model_no_questions');
  }
  const valid = parsed.questions.map(normalizeQuestion).filter(Boolean);
  if (valid.length < 3) {
    throw new Error(`too_few_valid_questions: got ${valid.length}`);
  }
  return valid.slice(0, QUESTIONS_PER_COURSE);
}

// =====================================================================
// Strict per-question validation + sanitization. Anything that doesn't
// conform gets dropped — better to return fewer good questions than to
// ship a broken one.
// =====================================================================
// v175: question text MUST be self-contained — the question card has only
// text + answer buttons. Any reference to a visual aid (ten frame, picture,
// number line, etc.) leaves Nigel staring at a blank space wondering what
// to count. Reject these in case Haiku ignores the prompt rule.
const VISUAL_REFERENCE_PATTERNS = [
  /\bten[- ]?frame\b/i,
  /\bnumber\s*line\b/i,
  /\b(the|this|that|these|those|each)\s+(picture|image|diagram|chart|graph|drawing|photo|figure|illustration|shape\s+below|shapes\s+below|shape\s+above|shapes\s+above)\b/i,
  /\b(in|on|from|using)\s+the\s+(picture|image|diagram|chart|graph|drawing|photo|figure|illustration)\b/i,
  /\blook\s+at\s+(the|this|these)\b/i,
  /\bsee\s+the\b/i,
  /\bshown\s+(above|below|here)\b/i,
  /\b(above|below)\s*[?:.]/i,
  /\bwhich\s+picture\b/i,
  /\bcount\s+the\s+(dots|apples|stars|shapes|circles|squares|triangles)\s+(in|on|above|below)\b/i,
];
function referencesNonExistentVisual(text) {
  if (!text) return false;
  return VISUAL_REFERENCE_PATTERNS.some((pat) => pat.test(text));
}


// v181: Shuffle options to prevent Haiku's correct_index=0 bias.
// Fisher-Yates on options array, then update correct_index to match.
function shuffleQuestionOptions(q) {
  if (!q || !Array.isArray(q.options) || typeof q.correct_index !== 'number') return q;
  const opts = [...q.options];
  const correctText = opts[q.correct_index];
  // Fisher-Yates
  for (let i = opts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [opts[i], opts[j]] = [opts[j], opts[i]];
  }
  const newIdx = opts.indexOf(correctText);
  const finalIdx = newIdx >= 0 ? newIdx : 0;
  return { ...q, options: opts, correct_index: finalIdx, correct_answer: opts[finalIdx] };
}

function normalizeQuestion(q) {
  if (!q || typeof q !== 'object') return null;
  const topic = clipStr(q.topic, 80);
  const question = clipStr(q.question, 280);
  if (!question) return null;
  // v175 board/question sync: drop questions that reference visuals not on screen.
  if (referencesNonExistentVisual(question)) return null;
  if (!Array.isArray(q.options)) return null;
  // v179: REJECT (don't truncate) options > 56 chars + dedup check
  const optionsRaw = q.options.map((o) => String(o == null ? '' : o).trim());
  if (optionsRaw.some((s) => !s || s.length > 56)) return null;
  const lower = optionsRaw.map((s) => s.toLowerCase().replace(/\s+/g, ' ').trim());
  if (new Set(lower).size !== lower.length) return null;
  const options = optionsRaw;
  if (options.length < 3 || options.length > 4) return null;
  // v194: trust the model's ANSWER STRING over its INDEX. Models reliably copy
  // the correct answer text but frequently miscount array positions — a wrong
  // correct_index passes the old range-only check and silently marks correct
  // answers wrong. Derive the index from correct_answer when it matches an
  // option; fall back to the (range-checked) model index otherwise.
  let correct_index = parseInt(q.correct_index, 10);
  const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim();
  const answerStr = norm(q.correct_answer);
  if (answerStr) {
    const matchIdx = options.findIndex((o) => norm(o) === answerStr);
    if (matchIdx >= 0) correct_index = matchIdx;
  }
  if (!Number.isInteger(correct_index) || correct_index < 0 || correct_index >= options.length) return null;
  const explanation = clipStr(q.explanation, 200) || '';
  const hint = clipStr(q.hint, 150) || 'Try again — you can do this.';
  // v195: teach-then-ask fields. description is shown + read before the question;
  // visual is a clean noun used to fetch a real photo for the dashboard.
  const description = clipStr(q.description, 240) || '';
  const visual = String(q.visual == null ? '' : q.visual)
    .replace(/[^\w\s'.&-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 64);
  const remediation = normalizeRemediation(q.remediation);
  if (!remediation) return null;
  return shuffleQuestionOptions({
    topic: topic || 'practice',
    question,
    description,
    visual,
    options,
    correct_index,
    correct_answer: options[correct_index],
    explanation,
    hint,
    remediation,
  });
}

function normalizeRemediation(r) {
  if (!r || typeof r !== 'object') return null;
  const intro = clipStr(r.intro, 200) || 'Let me show you how.';
  const outro = clipStr(r.outro, 200) || 'Now you have it!';
  if (!Array.isArray(r.steps)) return null;
  const steps = r.steps.map(normalizeStep).filter(Boolean);
  if (steps.length < 1 || steps.length > 6) return null;
  return { intro, steps, outro };
}

function normalizeStep(s) {
  if (!s || typeof s !== 'object') return null;
  const say = clipStr(s.say, 200);
  if (!say) return null;
  if (s.board == null) return { say, board: null };
  if (typeof s.board !== 'object') return { say, board: null };
  const tool = String(s.board.tool || '').trim();
  if (!ALLOWED_BOARD_TOOLS.has(tool)) return { say, board: null };
  const args = sanitizeBoardArgs(tool, s.board.args || {});
  if (!args) return { say, board: null };
  return { say, board: { tool, args } };
}

function sanitizeBoardArgs(tool, args) {
  if (tool === 'clearBoard') return {};
  if (tool === 'writeWord') {
    const word = clipStr(args.word, 24);
    if (!word) return null;
    return { word };
  }
  if (tool === 'writeLetter') {
    const letter = clipStr(args.letter, 1);
    if (!letter || !/^[A-Za-z]$/.test(letter)) return null;
    return { letter: letter.toUpperCase() };
  }
  if (tool === 'drawEquation') {
    const equation = clipStr(args.equation, 32);
    if (!equation) return null;
    // Block obvious "question text on board" payloads
    if (/[?]/.test(equation) && !/=\s*\?\s*$/.test(equation)) return null;
    if (/what is|how many|how much/i.test(equation)) return null;
    return { equation };
  }
  if (tool === 'showVisual') {
    const topic = clipStr(args.topic, 24);
    if (!topic) return null;
    return { topic };
  }
  return null;
}

function clipStr(v, max) {
  if (v == null) return '';
  const s = String(v).trim();
  if (!s) return '';
  return s.length > max ? s.slice(0, max) : s;
}

// =====================================================================
// Fallback bank — server-side mirror of V171_BANK so the endpoint can
// always return SOMETHING usable. Mirrors the 8 hardcoded math questions
// from class-time-mc.js. Other subjects fall back to math too — better
// than nothing — and the client-side V171_BANK takes over for the
// subject-specific case.
// =====================================================================
function fallbackBank(subject) {
  const math = [
    { topic: 'Addition within 20', question: 'What is 7 + 5?', options: ['10','11','12','13'], correct_index: 2,
      explanation: 'Seven plus five equals twelve.', hint: 'Try counting up from 7.',
      remediation: { intro: 'Let me show you seven plus five.', steps: [
        { say: "First, write the problem.", board: { tool: 'drawEquation', args: { equation: '7 + 5 = ?' } } },
        { say: "Start at 7, count up 5: 8, 9, 10, 11, 12.", board: null },
        { say: "Seven plus five is twelve.", board: { tool: 'drawEquation', args: { equation: '7 + 5 = 12' } } },
      ], outro: "Now you've got it!" } },
    { topic: 'Subtraction within 20', question: 'What is 14 minus 6?', options: ['6','7','8','9'], correct_index: 2,
      explanation: 'Fourteen minus six equals eight.', hint: 'Count back from 14.',
      remediation: { intro: 'Let me show you 14 minus 6.', steps: [
        { say: "Here's the problem.", board: { tool: 'drawEquation', args: { equation: '14 - 6 = ?' } } },
        { say: "Count back: 13, 12, 11, 10, 9, 8.", board: null },
        { say: "Fourteen minus six is eight.", board: { tool: 'drawEquation', args: { equation: '14 - 6 = 8' } } },
      ], outro: 'Counting back works for subtraction.' } },
    { topic: 'Doubles', question: 'What is 8 + 8?', options: ['14','15','16','17'], correct_index: 2,
      explanation: 'Double eight is sixteen.', hint: 'Doubles means adding a number to itself.',
      remediation: { intro: 'Eight plus eight is a doubles fact.', steps: [
        { say: "Eight plus eight.", board: { tool: 'drawEquation', args: { equation: '8 + 8 = ?' } } },
        { say: "Think of two hands with 8 fingers each: 16 fingers total.", board: null },
        { say: "Eight plus eight is sixteen.", board: { tool: 'drawEquation', args: { equation: '8 + 8 = 16' } } },
      ], outro: 'Doubles are worth memorizing.' } },
  ];
  // For non-math subjects we still return math fallback — the client-side
  // V171_BANK has subject-specific fallbacks too, so a "fallback" source
  // signal tells the client to use its own bank for this subject.
  return math;
}

// =====================================================================
// Supabase RPC helper
// =====================================================================
async function supabaseRpc(url, key, fn, params) {
  const r = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'apikey': key,
      'authorization': `Bearer ${key}`,
    },
    body: JSON.stringify(params || {}),
  });
  if (!r.ok) {
    const detail = await r.text();
    throw new Error(`supabase ${fn} ${r.status}: ${detail.slice(0, 200)}`);
  }
  const txt = await r.text();
  if (!txt) return null;
  try { return JSON.parse(txt); } catch (_) { return txt; }
}
