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
    '- Each option string ≤ 30 characters (kid-readable buttons).',
    '- correct_index is the 0-based index of the right answer.',
    '- Distractors must be plausible — no obvious silly wrong answers like "potato".',
    '- explanation ≤ 200 chars, hint ≤ 150 chars — both kid-friendly, no jargon.',
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
    '- Difficulty: 2nd-grade stretch — not too easy, not frustrating. For math, sums 10-30, subtraction within 20.',
    '- Variety across the 8 questions — no two should look the same.',
    '',
    '== OUTPUT — ONE JSON OBJECT, NO MARKDOWN, NO PREAMBLE ==',
    '{',
    '  "questions": [',
    '    {',
    '      "topic": "string (matches one of the course topics)",',
    '      "question": "string",',
    '      "options": ["string", "string", "string", "string"],',
    '      "correct_index": 0,',
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
function normalizeQuestion(q) {
  if (!q || typeof q !== 'object') return null;
  const topic = clipStr(q.topic, 80);
  const question = clipStr(q.question, 280);
  if (!question) return null;
  if (!Array.isArray(q.options)) return null;
  const options = q.options.map((o) => clipStr(o, 30)).filter((s) => s && s.length > 0);
  if (options.length < 3 || options.length > 4) return null;
  const correct_index = parseInt(q.correct_index, 10);
  if (!Number.isInteger(correct_index) || correct_index < 0 || correct_index >= options.length) return null;
  const explanation = clipStr(q.explanation, 200) || '';
  const hint = clipStr(q.hint, 150) || 'Try again — you can do this.';
  const remediation = normalizeRemediation(q.remediation);
  if (!remediation) return null;
  return {
    topic: topic || 'practice',
    question,
    options,
    correct_index,
    explanation,
    hint,
    remediation,
  };
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
