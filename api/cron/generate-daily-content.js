// /api/cron/generate-daily-content
//
// Hero Academy — Content-of-One engine (Swing 3 Deploy 1)
// Runs nightly at 09:00 UTC (≈ 4–5am ET) via Vercel cron.
//
// Generates one story, five math word problems, one science wonder, and one
// word list for Nigel, all featuring his family, friends, interests, and
// recent mistakes. Writes to ha_daily_content via ha_record_daily_content RPC.
//
// Auth: accepts Vercel's `x-vercel-cron: 1` header OR Bearer ${CRON_SECRET}
// (the latter lets us hit it manually from the deploy script to seed today).

import fs from 'node:fs';
import path from 'node:path';

const NIGEL_CHILD_ID = '2e0e51c5-f120-4152-8aa1-041eeecc8165';
const MODEL = 'claude-haiku-4-5-20251001';
const ANTHROPIC_VERSION = '2023-06-01';

// ---------- helpers ----------
function isoDate(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function loadProfile() {
  try {
    const p = path.join(process.cwd(), 'data', 'nigel-profile.json');
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_) {
    return null;
  }
}

async function fetchRecentStruggles() {
  const url = `${process.env.SUPABASE_URL}/rest/v1/rpc/ha_get_recent_struggles`;
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ p_child_id: NIGEL_CHILD_ID, p_days: 7 }),
  });
  if (!r.ok) return [];
  const rows = await r.json();
  return Array.isArray(rows) ? rows.slice(0, 6) : [];
}

async function recordContent(contentDate, type, payload) {
  const url = `${process.env.SUPABASE_URL}/rest/v1/rpc/ha_record_daily_content`;
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      p_child_id: NIGEL_CHILD_ID,
      p_content_date: contentDate,
      p_content_type: type,
      p_payload: payload,
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`record ${type} failed: ${r.status} ${t}`);
  }
  return r.json();
}

// ---------- prompt ----------
function buildSystemPrompt(profile, struggles) {
  const struggleLines = struggles.length
    ? struggles
        .map(
          (s) =>
            `  · in ${s.zone_id}: prompt "${s.prompt}" — expected "${s.expected}", he wrote "${s.given}"`
        )
        .join('\n')
    : '  · (no recorded struggles this week — pick anything age-appropriate)';

  return `You are the daily content generator for Hero Academy, a homeschool app used by a 7-year-old named Nigel. Your output today becomes tomorrow's lessons — stories he reads, math problems he solves, wonders he explores, and words he learns.

CRITICAL RULE: every single piece of content must feel personal to Nigel. Use his name, his family, his friends, his interests, his world. Generic content fails. The whole point of this engine is that Khan Academy can never know Nigel — but we do.

NIGEL'S PROFILE
${JSON.stringify(profile, null, 2)}

RECENT STRUGGLES (last 7 days — bias toward reinforcing these)
${struggleLines}

GUARDRAILS
- Grade level: 2nd grade. Reading level: ~Lexile 450-650. Math: CCSS 2.OA, 2.NBT, 2.MD (addition/subtraction within 100, place value, simple measurement, time).
- Faith: Christian household. Light, natural mentions are welcome (he prays before meals) but never preachy. Don't proselytize.
- Heritage: Nigerian-American. Cassava leaf, jollof rice, rice and beans are loved foods. Weave heritage in naturally, not as a lesson.
- The "six seven" inside joke: don't use it. (It's reserved for Humphrey's live speech, not generated content.)
- Never mention his struggles by name — translate them into practice opportunities, don't shame.
- Use his friends (Gabriel, Lexi, Zylo) and cousin (Skylar) as supporting characters. Bianca = mom. Josh = dad.
- Avoid scary themes, violence, romantic content, anything bedtime-disturbing.

OUTPUT FORMAT
Return ONE valid JSON object, no markdown fences, no preamble. Exact schema:

{
  "story": {
    "title": "string, 2-6 words",
    "body": "string, 200-300 words, broken into 4-6 paragraphs separated by \\n\\n, featuring Nigel as protagonist",
    "comprehension_questions": [
      { "q": "string — clear question grounded in the story", "choices": ["short string","short string","short string","short string"], "answer_index": 0 },
      { "q": "string", "choices": ["string","string","string","string"], "answer_index": 1 },
      { "q": "string", "choices": ["string","string","string","string"], "answer_index": 2 }
    ],
    "theme_word": "string — one word that anchors the story (e.g. 'persistence', 'friendship', 'curiosity')"
  },
  "math_problems": [
    { "prompt": "word problem string, 1-2 sentences", "answer": "string — the numeric answer", "skill": "addition|subtraction|place_value|measurement|time" }
    // exactly 5 of these, varied skills, all featuring Nigel's world
  ],
  "science_wonder": {
    "question": "a wonder-starting question, e.g. 'Why does Nigel's guitar sound different from Lexi's piano?'",
    "explanation": "120-180 words, 2nd-grade vocab, builds curiosity not closure",
    "try_this": "string — a safe at-home thing he can try with a parent",
    "follow_up_question": "string — a question to ask Bianca or Josh"
  },
  "word_list": {
    "theme": "string — what these words have in common",
    "words": [
      { "word": "string", "sentence": "an example sentence featuring Nigel or his world", "syllables": number }
      // exactly 10 words at 2nd-grade reading level
    ]
  }
}

COMPREHENSION QUESTIONS — important details:
- Generate exactly 3 questions. Each is multiple choice with 4 short choices (1-4 words each).
- One choice is the correct answer, taken directly from the story.
- The other three are plausible distractors — related to the story's people/places/objects/actions but factually wrong about THIS question.
- Distractors must not be obviously silly (no jokes, no totally unrelated nouns) — they should feel like reasonable guesses a 2nd-grader might make if they weren't paying attention.
- The answer_index field is the 0-based index of the correct choice in the choices array.
- Vary which index is correct across the three questions (don't always put it first).

Generate today's content. Make it specific, warm, and recognizably about Nigel's actual life.`;
}

async function callHaiku(systemPrompt) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        { role: 'user', content: 'Generate today\'s content for Nigel. Return only the JSON object.' },
      ],
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Anthropic ${r.status}: ${t}`);
  }
  const data = await r.json();
  const text = (data.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
  // Strip code fences if Haiku adds them despite instructions
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    throw new Error(`JSON parse failed. Got: ${cleaned.slice(0, 500)}`);
  }
}

// ---------- handler ----------
export default async function handler(req, res) {
  // Auth: Vercel cron sets x-vercel-cron, OR allow Bearer for manual seeding
  const isVercelCron = req.headers['x-vercel-cron'] === '1';
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const hasSecret = process.env.CRON_SECRET && bearer === process.env.CRON_SECRET;
  if (!isVercelCron && !hasSecret) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  // Date this content is FOR. Cron runs ~4am ET — content is for "today" in
  // Maryland local time. Computing in UTC and adding the offset is fine
  // because we're well past midnight ET when this runs.
  const targetDate = req.query?.date || isoDate(new Date());

  try {
    const profile = loadProfile();
    if (!profile) {
      return res.status(500).json({ error: 'profile_missing' });
    }
    const struggles = await fetchRecentStruggles();
    const systemPrompt = buildSystemPrompt(profile, struggles);

    const t0 = Date.now();
    const content = await callHaiku(systemPrompt);
    const elapsed = Date.now() - t0;

    // Validate the four required keys are present before writing anything
    const need = ['story', 'math_problems', 'science_wonder', 'word_list'];
    for (const k of need) {
      if (!content[k]) {
        return res.status(500).json({ error: `model_missing_${k}`, raw: content });
      }
    }
    if (!Array.isArray(content.math_problems) || content.math_problems.length < 3) {
      return res.status(500).json({ error: 'math_problems_too_few' });
    }
    // v149: validate comprehension question shape so story-lab's MCQ UI gets
    // well-formed data. We accept >=2 choices and answer_index in range.
    const cqs = (content.story && content.story.comprehension_questions) || [];
    for (let i = 0; i < cqs.length; i++) {
      const q = cqs[i];
      if (!q || typeof q.q !== 'string') {
        return res.status(500).json({ error: `comprehension_question_${i}_missing_q` });
      }
      if (!Array.isArray(q.choices) || q.choices.length < 2) {
        return res.status(500).json({ error: `comprehension_question_${i}_choices_invalid` });
      }
      if (typeof q.answer_index !== 'number' ||
          q.answer_index < 0 || q.answer_index >= q.choices.length) {
        return res.status(500).json({ error: `comprehension_question_${i}_answer_index_invalid` });
      }
    }

    // Write all four payloads
    await recordContent(targetDate, 'story', content.story);
    await recordContent(targetDate, 'math_problems', { items: content.math_problems });
    await recordContent(targetDate, 'science_wonder', content.science_wonder);
    await recordContent(targetDate, 'word_list', content.word_list);

    return res.status(200).json({
      ok: true,
      date: targetDate,
      elapsed_ms: elapsed,
      story_title: content.story.title,
      math_count: content.math_problems.length,
      wonder_q: content.science_wonder.question,
      word_count: content.word_list.words?.length ?? 0,
      struggles_used: struggles.length,
    });
  } catch (err) {
    return res.status(500).json({ error: 'generation_failed', detail: String(err.message || err) });
  }
}
