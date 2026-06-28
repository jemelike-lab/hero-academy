/**
 * Hero Academy — /api/class-time/lesson-plan-day
 *
 * v161 (Class Time v2.1). Returns the FULL 4-course school day with EXACTLY
 * 4 topics per course. Each course is 7-10 min on one subject; 4 topics
 * gives Ms. Humphrey ~90-150s per topic. 15-min breaks happen between
 * courses (handled client-side).
 *
 * Cache strategy: first call of the day for a child triggers Haiku
 * generation, then the plan is persisted in `ha_day_lesson_plans` and
 * served from cache for the rest of the day.
 *
 * Subjects pool (2nd-grade MD core, no music/art/PE):
 *   Math, Reading, Spelling, Writing, Grammar/Phonics, Vocabulary,
 *   Science, Social Studies
 *
 * Order convention (fixed): Math first (fresh brain), then 2 literacy
 * courses (Reading / Spelling / Writing / Grammar / Vocabulary), then
 * 1 visual-heavy course last (Science or Social Studies).
 *
 * Anti-repetition: Haiku gets the last 7 days of completed subjects so
 * it can rotate fairly.
 *
 * Request:
 *   GET /api/class-time/lesson-plan-day?date=2026-06-09&child_id=UUID[&force=1]
 *
 * Response (200):
 *   {
 *     plan: {
 *       date: "2026-06-09",
 *       theme: "Counting and curiosity",
 *       courses: [
 *         {
 *           order: 1,
 *           subject: "math",
 *           subject_label: "Math",
 *           board_mode: "drawing",          // drawing | image | mixed
 *           why_chosen: "Anchor the day with addition practice.",
 *           target_minutes: 8,
 *           topics: [
 *             {
 *               id: "addition-10",
 *               title: "Addition within 10",
 *               focus: "7+3, 6+4, 8+2",
 *               tools: ["drawDots","drawTenFrame","drawEquation"]
 *             }, ...
 *           ],
 *           image_keywords: []              // empty for drawing mode
 *         }, ...
 *       ],
 *       source: "haiku" | "cache" | "fallback"
 *     }
 *   }
 *
 * Errors:
 *   400 { error: "bad_request", detail: "..." }
 *   500 { error: "no_api_key" } / "no_supabase"
 *   502 { error: "haiku_failed" | "supabase_failed", detail: "..." }
 */

const HAIKU_MODEL = 'claude-haiku-4-5';

// Pool — order in array is preferred presentation order, not generation order.
// Each entry has metadata that constrains the lesson Haiku writes.
const SUBJECT_POOL = [
  { key: 'math',     label: 'Math',           group: 'math',     board_mode: 'drawing' },
  { key: 'reading',  label: 'Reading',        group: 'literacy', board_mode: 'mixed'   },
  { key: 'spelling', label: 'Spelling',       group: 'literacy', board_mode: 'drawing' },
  { key: 'writing',  label: 'Writing',        group: 'literacy', board_mode: 'drawing' },
  { key: 'grammar',  label: 'Grammar',        group: 'literacy', board_mode: 'mixed'   },
  { key: 'vocabulary', label: 'Vocabulary',   group: 'literacy', board_mode: 'mixed'   },
  { key: 'science',  label: 'Science',        group: 'visual',   board_mode: 'image'   },
  { key: 'social',   label: 'Social Studies', group: 'visual',   board_mode: 'image'   },
];

const SUBJECT_BY_KEY = Object.fromEntries(SUBJECT_POOL.map(s => [s.key, s]));

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'GET only' });
  }

  const date = String(req.query.date || '').trim();
  const childId = String(req.query.child_id || '').trim();
  const force = String(req.query.force || '').trim() === '1';
  // v162: optional explicit subject lineup (one per course, in order). When
  // present, it overrides Haiku's own subject selection so a caller (the
  // weekly-curriculum cron) can guarantee balanced coverage across the week.
  const forcedSubjects = String(req.query.subjects || '')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
    .filter((s) => SUBJECT_BY_KEY[s]);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'bad_request', detail: 'date must be YYYY-MM-DD' });
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(childId)) {
    return res.status(400).json({ error: 'bad_request', detail: 'child_id must be a UUID' });
  }

  const SUPA_URL = process.env.SUPABASE_URL;
  const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPA_URL || !SUPA_KEY) {
    return res.status(500).json({ error: 'no_supabase' });
  }

  // ---- 1. Try cache ----
  if (!force) {
    try {
      const cached = await supabaseRpc(SUPA_URL, SUPA_KEY, 'ha_get_day_lesson_plan', {
        p_child_id: childId, p_date: date,
      });
      if (cached && typeof cached === 'object' && Array.isArray(cached.courses)) {
        return res.status(200).json({ plan: { ...cached, source: 'cache' } });
      }
    } catch (e) {
      console.log('[lesson-plan-day] cache lookup failed (continuing):', String(e).slice(0, 200));
    }
  }

  // ---- 2. Pull recent subjects for anti-repetition ----
  let recentSubjects = [];
  try {
    const r = await supabaseRpc(SUPA_URL, SUPA_KEY, 'ha_get_recent_subjects', {
      p_child_id: childId, p_days: 7,
    });
    if (Array.isArray(r)) recentSubjects = r;
  } catch (e) {
    console.log('[lesson-plan-day] recent subjects lookup failed (continuing):', String(e).slice(0, 200));
  }

  // Cross-day rotation hint (v162). The weekly-curriculum cron passes the
  // literacy/visual subjects it assigned to YESTERDAY's pre-generated day so
  // Haiku rotates fairly across a whole pre-planned week, not just against
  // last week's completed history. Backward-compatible: absent → no-op.
  const extraRecent = String(req.query.extra_recent || '')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (extraRecent.length) {
    recentSubjects = recentSubjects.concat(extraRecent);
  }

  // ---- 3. Generate via Haiku ----
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) {
    return res.status(500).json({ error: 'no_api_key' });
  }

  let plan;
  try {
    plan = await generatePlanWithHaiku(ANTHROPIC_KEY, date, recentSubjects, forcedSubjects);
  } catch (e) {
    console.log('[lesson-plan-day] Haiku failed, returning deterministic fallback:', String(e).slice(0, 200));
    plan = fallbackPlan(date, recentSubjects, forcedSubjects);
    plan.source = 'fallback';
  }

  // ---- 4. Save to cache ----
  try {
    await supabaseRpc(SUPA_URL, SUPA_KEY, 'ha_save_day_lesson_plan', {
      p_child_id: childId,
      p_date: date,
      p_plan: plan,
      p_generated_by: plan.source || 'haiku',
    });
  } catch (e) {
    console.log('[lesson-plan-day] save failed (continuing, plan still returned):', String(e).slice(0, 200));
  }

  return res.status(200).json({ plan });
}

// =====================================================================
// Haiku call
// =====================================================================
async function generatePlanWithHaiku(apiKey, date, recentSubjects, forcedSubjects) {
  const recentJson = JSON.stringify(recentSubjects);
  const dow = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' });

  // v162: when the caller supplies an explicit 4-subject lineup, instruct
  // Haiku to use exactly those (normalizePlan also pins them). Otherwise fall
  // back to the original "pick 4 + avoid yesterday" guidance.
  const forced = Array.isArray(forcedSubjects) && forcedSubjects.length === 4 ? forcedSubjects : null;
  const subjectGuidance = forced
    ? [
        '== ASSIGNED SUBJECTS (MANDATORY) ==',
        'Use EXACTLY these 4 subjects, one per course, in this order. Do NOT substitute, drop, or reorder them:',
        forced.map((s, i) => `  Course ${i + 1} = "${s}"`).join('\n'),
        'Write 4 topics for each assigned subject following the per-course content rules below.',
      ].join('\n')
    : [
        '== STRUCTURE RULES ==',
        'Pick exactly 4 subjects. Course order is FIXED by groups:',
        '  Course 1 = always "math"',
        '  Courses 2 and 3 = two DIFFERENT subjects from the literacy group (reading, spelling, writing, grammar, vocabulary)',
        '  Course 4 = either "science" or "social" (visual group)',
        '',
        '== ANTI-REPETITION ==',
        'Below is the child\'s recent subject history (last 7 days). Avoid repeating a literacy or visual subject he had yesterday. Math is always slot 1 regardless.',
        'Recent: ' + recentJson,
      ].join('\n');

  // Haiku weights recency — put the strict schema example LAST.
  const systemPrompt = [
    'You are a curriculum planner for Nigel, a 7-year-old 2nd grader homeschooled in Maryland.',
    'You design ONE school day at a time: exactly 4 courses, each 7-10 minutes of one-on-one tutoring with Ms. Humphrey.',
    '',
    `Today is ${dow}, ${date}.`,
    '',
    '== SUBJECT POOL (use ONLY these 8 subjects, by their `key`) ==',
    '  math       (board_mode: drawing) — number sense, addition/subtraction within 20, skip-counting, place value, measurement, time, money',
    '  reading    (board_mode: mixed)   — comprehension of a short passage, sight words, fluency',
    '  spelling   (board_mode: drawing) — phonetic + sight-word spelling, ~5-8 words per course',
    '  writing    (board_mode: drawing) — sentence-level writing, punctuation, capitalization',
    '  grammar    (board_mode: mixed)   — parts of speech, nouns/verbs/adjectives, plurals, simple sentence structure',
    '  vocabulary (board_mode: mixed)   — new word + meaning + image + example sentence',
    '  science    (board_mode: image)   — life/earth/physical science, weather, animals, plants, simple machines',
    '  social     (board_mode: image)   — Maryland geography & history, US symbols, communities, maps, holidays',
    '',
    subjectGuidance,
    '',
    '== PER-COURSE CONTENT ==',
    'Each course has EXACTLY 4 topics. Each topic is something Ms. Humphrey can teach in roughly 90-150 seconds on a digital board, so four topics fill a 7-10 minute course. No fewer than 4. No more than 4.',
    '- For drawing-mode courses (math/spelling/writing), include the relevant `tools` from: drawNumber, drawDots, drawTenFrame, writeWord, writeLetter, drawEquation, clearBoard.',
    '- For mixed-mode courses (reading/grammar/vocabulary), tools may include writeWord plus an image keyword.',
    '- For image-mode courses (science/social), tools = ["showVisual"] and you MUST provide 2-4 image_keywords (single-noun search terms suitable for Wikipedia image lookup, e.g. "volcano", "blue crab", "Maryland flag", "honeybee"). Do NOT use proper nouns of living people.',
    '',
    'Keep `focus` short — a comma-separated list of the actual problems / words / facts (e.g. "7+3, 6+4, 8+2" or "the, and, was" or "monarch butterfly life cycle").',
    'Keep `why_chosen` to one short sentence Ms. Humphrey could tell Nigel.',
    'Theme: one warm 3-6 word phrase tying the day together.',
    '',
    '== OUTPUT — RETURN ONLY THIS JSON, NO MARKDOWN, NO PREAMBLE ==',
    '{',
    `  "date": "${date}",`,
    '  "theme": "Counting and curiosity",',
    '  "courses": [',
    '    {',
    '      "order": 1,',
    '      "subject": "math",',
    '      "subject_label": "Math",',
    '      "board_mode": "drawing",',
    '      "why_chosen": "Warm up with addition while your brain is fresh.",',
    '      "target_minutes": 8,',
    '      "topics": [',
    '        {"id":"addition-10","title":"Addition within 10","focus":"7+3, 6+4, 8+2","tools":["drawDots","drawTenFrame","drawEquation"]},',
    '        {"id":"count-by-2","title":"Counting by 2s","focus":"2, 4, 6, 8, 10","tools":["drawNumber","drawDots"]},',
    '        {"id":"ten-frame-read","title":"Reading ten-frames","focus":"show 6, 8, 10 on the frame","tools":["drawTenFrame","drawDots"]},',
    '        {"id":"doubles-facts","title":"Doubles facts","focus":"4+4, 5+5, 6+6","tools":["drawEquation","drawDots"]}',
    '      ],',
    '      "image_keywords": []',
    '    },',
    '    { "order": 2, "subject": "reading", "subject_label": "Reading", "board_mode": "mixed", "why_chosen": "...", "target_minutes": 9, "topics": [...], "image_keywords": ["honeybee"] },',
    '    { "order": 3, "subject": "spelling", "subject_label": "Spelling", "board_mode": "drawing", "why_chosen": "...", "target_minutes": 8, "topics": [...], "image_keywords": [] },',
    '    { "order": 4, "subject": "science", "subject_label": "Science", "board_mode": "image", "why_chosen": "...", "target_minutes": 10, "topics": [...], "image_keywords": ["volcano","lava","mountain"] }',
    '  ]',
    '}',
    '',
    '== CRITICAL — READ THIS LAST ==',
    'EVERY course MUST contain EXACTLY 4 topics. Not 2, not 3, not 5. Four. Four. Four. Four. If you give a course fewer than 4 topics, the lesson breaks. All 4 courses × 4 topics = 16 total topic objects in your response.',
  ].join('\n');

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: HAIKU_MODEL,
      max_tokens: 3000,
      system: systemPrompt,
      messages: [{ role: 'user', content: 'Write today\'s 4-course plan as JSON. No preamble.' }],
    }),
  });
  if (!r.ok) {
    const detail = await r.text();
    throw new Error('haiku_status_' + r.status + ': ' + detail.slice(0, 200));
  }
  const j = await r.json();
  let text = '';
  for (const block of (j.content || [])) {
    if (block.type === 'text' && typeof block.text === 'string') text += block.text;
  }
  text = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  let parsed;
  try { parsed = JSON.parse(text); }
  catch (_) {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) parsed = JSON.parse(m[0]); else throw new Error('unparseable_haiku_json');
  }
  return normalizePlan(parsed, date, forced);
}

// =====================================================================
// Normalize: clamp values, enforce subject pool + order rules,
// fill missing board_mode / image_keywords from canonical pool.
// =====================================================================
function normalizePlan(raw, date, forcedSubjects) {
  const out = {
    date,
    theme: String(raw.theme || 'Daily lessons').slice(0, 60),
    courses: [],
    source: 'haiku',
  };
  const list = Array.isArray(raw.courses) ? raw.courses.slice(0, 4) : [];
  for (let i = 0; i < list.length; i++) {
    const c = list[i] || {};
    // v162: if the caller forced a subject for this slot, pin it regardless of
    // what Haiku returned, so the lineup is guaranteed.
    const forcedKey = Array.isArray(forcedSubjects) && forcedSubjects[i] ? forcedSubjects[i] : null;
    const subjectKey = forcedKey || String(c.subject || '').toLowerCase().trim();
    const meta = SUBJECT_BY_KEY[subjectKey] || SUBJECT_BY_KEY.math;
    const topicsRaw = Array.isArray(c.topics) ? c.topics.slice(0, 4) : [];
    const topics = topicsRaw.map((t, j) => ({
      id:    String(t.id    || (meta.key + '-t' + (j+1))).slice(0, 60),
      title: String(t.title || '').slice(0, 80),
      focus: String(t.focus || '').slice(0, 200),
      tools: Array.isArray(t.tools) ? t.tools.slice(0, 5).map(s => String(s).slice(0, 30)) : [],
    })).filter(t => t.title);
    // Enforce exactly 4 topics per course (pad with subject-appropriate filler).
    while (topics.length < 4) {
      const j = topics.length;
      const filler = topicFiller(meta.key, j);
      topics.push(filler);
    }
    out.courses.push({
      order: i + 1,
      subject: meta.key,
      subject_label: meta.label,
      board_mode: ['drawing', 'image', 'mixed'].includes(c.board_mode) ? c.board_mode : meta.board_mode,
      why_chosen: String(c.why_chosen || '').slice(0, 200),
      target_minutes: clamp(parseInt(c.target_minutes, 10) || 8, 7, 10),
      topics,
      image_keywords: Array.isArray(c.image_keywords)
        ? c.image_keywords.slice(0, 6).map(s => String(s).slice(0, 40))
        : [],
    });
  }
  while (out.courses.length < 4) {
    // Pad with deterministic fallback so client always has 4 courses
    const fallback = fallbackPlan(date, [], forcedSubjects);
    out.courses.push(fallback.courses[out.courses.length]);
  }
  return out;
}

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

// =====================================================================
// Deterministic fallback if Haiku is unavailable
// =====================================================================
function fallbackPlan(date, recent, forcedSubjects) {
  const doy = (() => {
    const d = new Date(date + 'T12:00:00');
    const start = new Date(d.getFullYear(), 0, 0);
    return Math.floor((d - start) / 86400000);
  })();
  // Literacy & visual rotations
  const literacy = ['reading', 'spelling', 'writing', 'grammar', 'vocabulary'];
  const visual = ['science', 'social'];
  const lit1 = literacy[doy % literacy.length];
  const lit2 = literacy[(doy + 2) % literacy.length] === lit1
    ? literacy[(doy + 3) % literacy.length]
    : literacy[(doy + 2) % literacy.length];
  const vis = visual[doy % visual.length];
  const subjects = (Array.isArray(forcedSubjects) && forcedSubjects.length === 4)
    ? forcedSubjects
    : ['math', lit1, lit2, vis];

  const seedTopics = {
    math: [
      { id:'add-10',  title:'Addition within 10', focus:'7+3, 6+4, 8+2', tools:['drawDots','drawTenFrame','drawEquation'] },
      { id:'count-2', title:'Counting by 2s',     focus:'2,4,6,8,10',     tools:['drawNumber','drawDots'] },
    ],
    reading: [
      { id:'sight-1', title:'Sight words',  focus:'the, and, was, said', tools:['writeWord'] },
      { id:'short-passage', title:'Short passage', focus:'Read 2 sentences together', tools:['writeWord'] },
    ],
    spelling: [
      { id:'cvc',     title:'CVC words',    focus:'cat, dog, sun, pig', tools:['writeWord'] },
    ],
    writing: [
      { id:'sent-1',  title:'Sentence basics', focus:'capital + period', tools:['writeWord'] },
    ],
    grammar: [
      { id:'nouns',   title:'Nouns vs verbs', focus:'name a thing vs an action', tools:['writeWord'] },
    ],
    vocabulary: [
      { id:'word-1',  title:'New word',     focus:'gigantic = really big', tools:['writeWord'] },
    ],
    science: [
      { id:'life-cycle', title:'Butterfly life cycle', focus:'egg → caterpillar → cocoon → butterfly', tools:['showVisual'] },
    ],
    social: [
      { id:'md-flag', title:'Maryland symbols', focus:'flag, oriole, blue crab', tools:['showVisual'] },
    ],
  };
  const seedImageKeywords = {
    science: ['butterfly','caterpillar','cocoon'],
    social:  ['Maryland flag','Baltimore oriole','blue crab'],
  };

  const courses = subjects.map((subj, i) => {
    const meta = SUBJECT_BY_KEY[subj];
    const seed = seedTopics[subj] || [];
    const topics = seed.slice(0, 4);
    while (topics.length < 4) topics.push(topicFiller(meta.key, topics.length));
    return {
      order: i + 1,
      subject: meta.key,
      subject_label: meta.label,
      board_mode: meta.board_mode,
      why_chosen: 'Daily rotation pick.',
      target_minutes: i === 0 ? 8 : (i === 3 ? 10 : 9),
      topics,
      image_keywords: seedImageKeywords[subj] || [],
    };
  });

  return {
    date,
    theme: 'Daily rotation',
    courses,
    source: 'fallback',
  };
}

// =====================================================================
// Subject-aware topic filler — used by normalizePlan when Haiku returns
// fewer than 4 topics for a course. Each course MUST end up with 4.
// =====================================================================
function topicFiller(subjectKey, idx) {
  const pool = {
    math: [
      { id:'math-pad-add',   title:'Quick addition warm-up',  focus:'3+2, 4+3, 5+4',         tools:['drawDots','drawEquation'] },
      { id:'math-pad-sub',   title:'Quick subtraction',       focus:'5-2, 7-3, 9-4',         tools:['drawDots','drawEquation'] },
      { id:'math-pad-count', title:'Count out loud',          focus:'count 1 to 20 together', tools:['drawNumber','drawDots'] },
      { id:'math-pad-ten',   title:'Ten-frame practice',      focus:'show 5, 7, 10',         tools:['drawTenFrame','drawDots'] },
    ],
    reading: [
      { id:'read-pad-sight', title:'Sight word review',       focus:'the, and, was, said',   tools:['writeWord'] },
      { id:'read-pad-blend', title:'Blend & read',            focus:'sound out 3 simple words', tools:['writeWord','writeLetter'] },
      { id:'read-pad-q',     title:'Comprehension check',     focus:'one who/what/why question', tools:['writeWord'] },
      { id:'read-pad-flu',   title:'Read with feeling',       focus:'one sentence, smooth voice', tools:['writeWord'] },
    ],
    spelling: [
      { id:'spell-pad-cvc',  title:'CVC words',               focus:'cat, dog, sun, pig',     tools:['writeWord'] },
      { id:'spell-pad-sw',   title:'Sight-word spelling',     focus:'the, and, said',         tools:['writeWord','writeLetter'] },
      { id:'spell-pad-fam',  title:'Word family',             focus:'-at: bat, cat, hat',     tools:['writeWord'] },
      { id:'spell-pad-clap', title:'Clap the sounds',         focus:'clap each sound in 3 words', tools:['writeWord'] },
    ],
    writing: [
      { id:'write-pad-cap',  title:'Capital at the start',    focus:'rewrite one sentence',   tools:['writeLetter','writeWord'] },
      { id:'write-pad-end',  title:'Periods & question marks',focus:'add the right ending',   tools:['writeWord'] },
      { id:'write-pad-name', title:'Name & label',            focus:'write one object name',  tools:['writeWord'] },
      { id:'write-pad-sent', title:'One full sentence',       focus:'capital + words + period', tools:['writeWord'] },
    ],
    grammar: [
      { id:'gram-pad-noun',  title:'Spot the noun',           focus:'which word is the thing?', tools:['writeWord'] },
      { id:'gram-pad-verb',  title:'Spot the verb',           focus:'which word is the action?', tools:['writeWord'] },
      { id:'gram-pad-adj',   title:'Describing words',        focus:'big, red, soft',         tools:['writeWord'] },
      { id:'gram-pad-plur',  title:'One vs many',             focus:'cat / cats, dog / dogs', tools:['writeWord'] },
    ],
    vocabulary: [
      { id:'vocab-pad-word', title:'New word + meaning',      focus:'gigantic = really big',  tools:['writeWord'] },
      { id:'vocab-pad-use',  title:'Use it in a sentence',    focus:'say a sentence with the word', tools:['writeWord'] },
      { id:'vocab-pad-syn',  title:'Synonym hunt',            focus:'big → huge, large',      tools:['writeWord'] },
      { id:'vocab-pad-img',  title:'Picture the word',        focus:'draw or describe it',    tools:['writeWord'] },
    ],
    science: [
      { id:'sci-pad-look',   title:'Look closely',            focus:'name what you see',      tools:['showVisual'] },
      { id:'sci-pad-parts',  title:'Name the parts',          focus:'point to 3 parts',       tools:['showVisual','writeWord'] },
      { id:'sci-pad-why',    title:'Why does it happen?',     focus:'one cause-and-effect',   tools:['showVisual'] },
      { id:'sci-pad-life',   title:'Where it lives',          focus:'habitat or home',        tools:['showVisual'] },
    ],
    social: [
      { id:'soc-pad-where',  title:'Find it on the map',      focus:'point and name',         tools:['showVisual'] },
      { id:'soc-pad-job',    title:'Who does this job?',      focus:'community helper',       tools:['showVisual','writeWord'] },
      { id:'soc-pad-symbol', title:'Maryland symbols',        focus:'flag, oriole, blue crab', tools:['showVisual'] },
      { id:'soc-pad-then',   title:'Long ago vs now',         focus:'compare one thing',      tools:['showVisual'] },
    ],
  };
  const list = pool[subjectKey] || pool.math;
  return list[idx % list.length];
}


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
