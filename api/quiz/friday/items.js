/**
 * Hero Academy — Friday weekly quiz items endpoint (v82).
 *
 * POST /api/quiz/friday/items
 * Body: { child_id }
 *
 * Returns: array of rows shaped like ha_get_friday_quiz_items used to return,
 * so js/srs.js can drop this in without other client changes:
 *   [
 *     { srs_id, source_table, source_item_id, due_at, interval_days,
 *       ease_factor, repetitions, payload: { subject, question, choices, answer, help_text, theme } },
 *     ...
 *   ]
 *
 * Behavior:
 *   1. Check ha_weekly_quiz_items for (child_id, current ISO week). If 10 exist
 *      already, return the cached set (so reload mid-quiz resumes the same 10).
 *   2. Otherwise: read ha_get_weekly_activity_summary + ha_get_quiz_seen_hashes,
 *      call Haiku to generate 10 themed questions (2 per subject), persist via
 *      ha_insert_weekly_quiz_item (which also records the SHA256 hash in
 *      ha_quiz_seen for lifetime no-repeat).
 *   3. If Haiku fails or returns < 10, top up from ha_quiz_bank as a fallback,
 *      still respecting the seen-hashes list. If the bank runs dry too, return
 *      what we have (better than nothing).
 *
 * Token cost: ~1.5k input + 1.5k output per generation. Cached for the week,
 * so one Haiku call per child per week.
 */

import crypto from 'node:crypto';

const HAIKU_MODEL = 'claude-haiku-4-5';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

const SUBJECTS = ['reading', 'math', 'writing', 'science', 'social'];
const TARGET_PER_SUBJECT = 2;
const TARGET_TOTAL = SUBJECTS.length * TARGET_PER_SUBJECT;  // 10

// --- Hash helper -----------------------------------------------------------

function normalizeQuestion(q) {
  return String(q || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 ?+=\-]/g, '')   // strip punctuation; keep math symbols
    .trim();
}
function hashQuestion(q) {
  return crypto.createHash('sha256').update(normalizeQuestion(q)).digest('hex');
}

// --- Supabase RPC client (service role) ------------------------------------

async function rpc(fn, body) {
  const r = await fetch(SUPABASE_URL + '/rest/v1/rpc/' + fn, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error('RPC ' + fn + ' ' + r.status + ' ' + t.slice(0, 200));
  }
  return r.json();
}

// Direct REST select for ha_quiz_bank fallback.
async function fallbackQuizBank(subject, excludeHashes, n) {
  const url = SUPABASE_URL + '/rest/v1/ha_quiz_bank' +
    '?subject=eq.' + encodeURIComponent(subject) +
    '&active=eq.true&select=id,question,choices,answer,help_text';
  const r = await fetch(url, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY,
      Accept: 'application/json',
    },
  });
  if (!r.ok) return [];
  const all = await r.json();
  // Filter by hash, then random-shuffle to top up
  const filtered = all.filter((row) => !excludeHashes.has(hashQuestion(row.question)));
  for (let i = filtered.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [filtered[i], filtered[j]] = [filtered[j], filtered[i]];
  }
  return filtered.slice(0, n);
}

// --- Haiku generation ------------------------------------------------------

async function generateWithHaiku({ activity, seenList }) {
  // The seen list can grow long — only send the most recent question TEXT
  // (not hashes — Haiku can't read hashes). Cap at 40 for prompt sanity.
  const seenTexts = (seenList || []).slice(0, 40).map((s) => s.question).filter(Boolean);

  const systemPrompt = [
    "You are Ms. Humphrey, writing this week's Friday quiz for Nigel — 7 years old, 2nd grade, homeschooled in Upper Marlboro, Maryland.",
    "",
    "Your job: write EXACTLY 10 brand-new multiple-choice questions, 2 per subject, themed to what Nigel actually worked on this week. Each question must be appropriate for a 2nd-grader, grounded in CCSS / MD MCCRS standards, and SHORT (one sentence, max 100 chars).",
    "",
    "★★★ NEVER REPEAT ★★★ — A list of questions Nigel has seen before is provided below. Do NOT generate any question that even closely paraphrases items on that list. Each Friday should feel fresh.",
    "",
    "Subject coverage (exactly 2 each, in this order in the output):",
    "  1-2. reading  — phonics/vocabulary/comprehension. Use the digraphs, sight words, or stories he worked on this week as theming.",
    "  3-4. math     — themed to the math skills he worked on this week (e.g. add_within_10 → 4+5 type). Bias toward skills he STRUGGLED with.",
    "  5-6. writing  — grammar, punctuation, capitalization, parts of speech. Theme to any story prompts he saw this week if applicable.",
    "  7-8. science  — themed to the actual discovery cards he saw this week (use the topic + fact + question text below as inspiration, but write a fresh angle).",
    "  9-10. social  — Maryland / US / map / community / civics for 2nd grade. Theme to any real-world quests he did this week when relevant.",
    "",
    "Question style rules:",
    "  - Each item: question (text), 4 choices (one correct, three plausible-but-wrong), the correct answer, and a 1-sentence help_text that explains WHY.",
    "  - The correct answer string must be EXACTLY one of the 4 choices (case-sensitive match).",
    "  - Avoid trick questions, double negatives, or culturally narrow references.",
    "  - Speak as if you're testing a kid you teach every day — warm but rigorous.",
    "",
    "Output: strictly valid JSON, nothing else. No markdown, no code fences, no commentary.",
    "",
    "JSON shape:",
    "{",
    '  "items": [',
    '    { "subject":"reading", "question":"...", "choices":["A","B","C","D"], "answer":"...", "help_text":"...", "theme":"..." },',
    '    ... (10 total)',
    '  ]',
    "}",
  ].join('\n');

  const userPrompt = [
    "This week's activity for Nigel:",
    JSON.stringify(activity, null, 2),
    "",
    "Questions Nigel has seen on past Friday quizzes (NEVER repeat these or close variants):",
    seenTexts.length === 0 ? "  (none yet — this is his first Friday quiz)" : seenTexts.map((t) => '  - ' + t).join('\n'),
    "",
    "Write the 10-question quiz now. Return JSON only.",
  ].join('\n');

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: HAIKU_MODEL,
      max_tokens: 2200,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error('anthropic ' + r.status + ' ' + t.slice(0, 200));
  }
  const json = await r.json();
  const text = (json.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const parsed = JSON.parse(cleaned);
  if (!parsed || !Array.isArray(parsed.items)) {
    throw new Error('haiku returned no items array');
  }
  return parsed.items;
}

// --- Validation -----------------------------------------------------------

function validItem(it) {
  if (!it || typeof it !== 'object') return false;
  if (!SUBJECTS.includes(it.subject)) return false;
  if (typeof it.question !== 'string' || it.question.length < 5) return false;
  if (!Array.isArray(it.choices) || it.choices.length !== 4) return false;
  if (typeof it.answer !== 'string') return false;
  if (!it.choices.map(String).includes(String(it.answer))) return false;
  return true;
}

// Group items by subject and trim to TARGET_PER_SUBJECT each.
function balanceBySubject(items) {
  const bucket = {};
  SUBJECTS.forEach((s) => { bucket[s] = []; });
  for (const it of items) {
    if (!validItem(it)) continue;
    if (bucket[it.subject].length < TARGET_PER_SUBJECT) bucket[it.subject].push(it);
  }
  return bucket;
}

// --- Persistence ----------------------------------------------------------

async function fetchCachedWeek(childId, weekStart) {
  // Use the read RPC so we get the same row shape srs.js expects.
  const rows = await rpc('ha_get_weekly_quiz', { p_child_id: childId, p_week_start: weekStart });
  return Array.isArray(rows) ? rows : [];
}

async function insertItem(childId, weekStart, idx, item) {
  await rpc('ha_insert_weekly_quiz_item', {
    p_child_id:      childId,
    p_week_start:    weekStart,
    p_item_index:    idx,
    p_subject:       item.subject,
    p_question:      item.question,
    p_question_hash: hashQuestion(item.question),
    p_choices:       item.choices,
    p_answer:        item.answer,
    p_help_text:     item.help_text || null,
    p_theme:         item.theme || null,
    p_generated_by:  item._generated_by || 'haiku',
  });
}

// --- Handler --------------------------------------------------------------

function isoWeekStart(d) {
  const day = d.getUTCDay() || 7;            // Sun=7
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - (day - 1)));
  return monday.toISOString().slice(0, 10);  // YYYY-MM-DD
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'server-misconfig: supabase env missing' });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = {}; } }
  if (!body || typeof body !== 'object') body = {};
  const childId = body.child_id;
  if (!childId || typeof childId !== 'string') {
    return res.status(400).json({ error: 'missing child_id' });
  }

  const weekStart = isoWeekStart(new Date());

  // 1. Cache hit?
  try {
    const cached = await fetchCachedWeek(childId, weekStart);
    if (cached.length >= TARGET_TOTAL) {
      return res.status(200).json({ source: 'cache', week_start: weekStart, items: cached });
    }
  } catch (e) {
    // If the read RPC is unhappy we'll just regenerate; not fatal.
  }

  // 2. Generate fresh.
  let activity = {};
  try {
    activity = await rpc('ha_get_weekly_activity_summary', { p_child_id: childId });
  } catch (e) { activity = {}; }

  let seenList = [];
  try {
    seenList = await rpc('ha_get_quiz_seen_hashes', { p_child_id: childId, p_limit: 200 });
  } catch (e) { seenList = []; }
  const seenHashes = new Set((seenList || []).map((s) => s.question_hash).filter(Boolean));

  let haikuItems = [];
  if (ANTHROPIC_KEY) {
    try {
      const raw = await generateWithHaiku({ activity, seenList });
      // Drop any Haiku items whose hash collides with seen (defense in depth).
      haikuItems = raw.filter((it) => validItem(it) && !seenHashes.has(hashQuestion(it.question)));
    } catch (e) {
      haikuItems = [];
    }
  }
  const balanced = balanceBySubject(haikuItems);

  // 3. Fallback fill from ha_quiz_bank for any subject that's short.
  for (const sub of SUBJECTS) {
    const have = balanced[sub].length;
    const need = TARGET_PER_SUBJECT - have;
    if (need <= 0) continue;
    try {
      const bankRows = await fallbackQuizBank(sub, seenHashes, need);
      for (const row of bankRows) {
        balanced[sub].push({
          subject:   sub,
          question:  row.question,
          choices:   row.choices,
          answer:    row.answer,
          help_text: row.help_text || null,
          theme:     'quiz-bank-fallback',
          _generated_by: 'bank',
        });
        // Mark hash so subsequent subjects don't pull the same one.
        seenHashes.add(hashQuestion(row.question));
      }
    } catch (e) {
      // ignore — we'll return fewer items
    }
  }

  // 4. Persist + count.
  let idx = 0;
  const ordered = [];
  for (const sub of SUBJECTS) {
    for (const it of balanced[sub]) {
      try {
        await insertItem(childId, weekStart, idx, it);
        ordered.push({ idx, item: it });
        idx++;
      } catch (e) {
        // hash collision in DB? unique constraint? skip and continue
      }
    }
  }

  // 5. Re-read the canonical row shape via the read RPC so the response is
  //    byte-identical with cache hits.
  try {
    const final = await fetchCachedWeek(childId, weekStart);
    if (final.length > 0) {
      return res.status(200).json({
        source:     'fresh',
        week_start: weekStart,
        items:      final,
        meta: {
          haiku_count:    haikuItems.length,
          target_total:   TARGET_TOTAL,
          delivered:      final.length,
        },
      });
    }
  } catch (e) {}

  return res.status(500).json({ error: 'failed to generate or persist quiz items' });
}
