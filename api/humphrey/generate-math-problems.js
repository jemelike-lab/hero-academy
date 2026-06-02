/**
 * Hero Academy — Number Lab adaptive word-problem generator.
 *
 *   POST /api/humphrey/generate-math-problems
 *   Body: { child_id, skill_id, target_count?, force? }
 *
 * Behavior mirrors generate-word-tower-batch.js:
 *   1. Pool-check short-circuit — return {status:'sufficient'} if unseen ≥ MIN.
 *   2. Build avoid list (existing prompts) + recent struggles for retrieval.
 *   3. Call Claude Haiku 4.5 with a personalized system prompt that pulls
 *      Nigel's profile (cousins, foods, loves, hobbies, milestones) so the
 *      problems sound like they were written FOR him, not at him.
 *   4. Validate: answer is integer in skill's range; exactly 3 unique
 *      distractors that are integers, all different from the answer;
 *      prompt is 5-30 words.
 *   5. Bulk insert via service-role REST.
 *
 * Env: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 * Auth: none (pool-check is the spam guard).
 */

import { readFileSync } from 'fs';
import path from 'path';

const HAIKU_MODEL    = 'claude-haiku-4-5';
const MIN_UNSEEN     = 15;
const DEFAULT_TARGET = 15;

// Cold-start: load Nigel's profile from the repo. Vercel functions get the
// repo bundle, so data/nigel-profile.json is available at runtime.
// Fallback to an empty object if it's missing — Haiku still works, just
// without personalization.
let PROFILE = {};
try {
  PROFILE = JSON.parse(readFileSync(
    path.join(process.cwd(), 'data', 'nigel-profile.json'), 'utf-8'
  ));
} catch (e) { /* leave empty */ }

// Per-skill config. The CLIENT's MATH_SKILLS source-of-truth is in
// js/math-skills.js; this is a server-side mirror with the bits Haiku needs:
// answer range, situation guidance. Adding a new skill = add it both places.
const SKILL_CONFIG = {
  add_within_10: {
    name: 'Addition within 10',
    standard: '2.OA.B.2',
    answer_min: 2,  answer_max: 10,
    example: '3 + 4 = 7',
    guidance: 'Two addends 1-9, sum 2-10. Counting situations: collecting, gathering, joining.'
  },
  subtract_within_10: {
    name: 'Subtraction within 10',
    standard: '2.OA.B.2',
    answer_min: 0,  answer_max: 9,
    example: '8 - 3 = 5',
    guidance: 'Minuend 2-10, subtrahend 1-9, result never negative. Take-away or "how many left" situations.'
  },
  make_10: {
    name: 'Make-10 strategy',
    standard: '2.OA.B.2',
    answer_min: 11, answer_max: 18,
    example: '8 + 5 = 13',
    guidance: 'Addends cross the 10 boundary (e.g., 8+5, 7+6, 9+4). Sum 11-18. Pose as counting situations.'
  },
  add_within_20: {
    name: 'Addition within 20',
    standard: '2.OA.B.2',
    answer_min: 10, answer_max: 20,
    example: '9 + 7 = 16',
    guidance: 'Two addends, sum 10-20. Counting / combining situations.'
  },
  subtract_within_20: {
    name: 'Subtraction within 20',
    standard: '2.OA.B.2',
    answer_min: 0,  answer_max: 14,
    example: '15 - 8 = 7',
    guidance: 'Minuend 10-20, subtrahend 1-15. Take-away or comparison ("how many more").'
  },
  doubles: {
    name: 'Doubles facts',
    standard: '2.OA.B.2',
    answer_min: 0,  answer_max: 20,
    example: '6 + 6 = 12',
    guidance: 'a + a where 0 ≤ a ≤ 10. Two equal groups / matching pairs situations.'
  },
  doubles_plus_one: {
    name: 'Doubles plus one',
    standard: '2.OA.B.2',
    answer_min: 1,  answer_max: 21,
    example: '6 + 7 = 13',
    guidance: 'a + (a+1) where 0 ≤ a ≤ 10. "Almost the same number, but one more."'
  },
  fact_families: {
    name: 'Fact families',
    standard: '2.OA.B.2',
    answer_min: 0,  answer_max: 18,
    example: 'If 3+4=7, what is 7-3?',
    guidance: 'Given one known fact, ask a related fact in the same family. Be explicit in the prompt about the known fact.'
  },
  count_to_100: {
    name: 'Count to 100',
    standard: '2.NBT.A.2',
    answer_min: 1,  answer_max: 100,
    example: 'What comes after 47?',
    guidance: 'Next/previous number, skip counting by 5s or 10s.'
  }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const SB_URL = process.env.SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!SB_URL || !SB_KEY) return res.status(500).json({ error: 'supabase env missing' });
  if (!ANTHROPIC_KEY)     return res.status(500).json({ error: 'anthropic env missing' });

  const body = (req.body && typeof req.body === 'object') ? req.body : safeJson(req.body);
  const child_id     = String(body.child_id || '').trim();
  const skill_id     = String(body.skill_id || '').trim();
  const target_count = clampInt(body.target_count, 5, 30, DEFAULT_TARGET);
  const force        = body.force === true;
  if (!child_id || !skill_id) return res.status(400).json({ error: 'child_id and skill_id required' });

  const cfg = SKILL_CONFIG[skill_id];
  if (!cfg) return res.status(400).json({ error: `unknown skill_id: ${skill_id}` });

  // ---- (1) Pool check ----------------------------------------------------
  let pool;
  try {
    pool = await sbRpc({ SB_URL, SB_KEY, fn: 'ha_math_pool_status',
                         body: { p_child_id: child_id, p_skill_id: skill_id } });
  } catch (e) {
    return res.status(500).json({ error: 'pool_status failed', detail: errStr(e) });
  }
  const status = Array.isArray(pool) ? pool[0] : pool;
  const unseen = (status && status.unseen) || 0;
  if (!force && unseen >= MIN_UNSEEN) {
    return res.status(200).json({ status: 'sufficient', inserted: 0, unseen, threshold: MIN_UNSEEN });
  }

  // ---- (2) Build avoid + struggle lists ----------------------------------
  let avoidPrompts = [], struggles = [];
  try {
    // Pull the first ~80 chars of each existing prompt for the avoid context.
    // We don't dedupe on exact prompt text — Haiku is freeform — but this
    // signals "these themes are already in the library, vary it up."
    const rows = await sbGet({ SB_URL, SB_KEY,
      path: `ha_math_problems?child_id=eq.${child_id}&skill_id=eq.${skill_id}&select=prompt&limit=80`
    });
    avoidPrompts = (rows || []).map(r => String(r.prompt || '').slice(0, 80));
  } catch (_) {}
  try {
    const strugRows = await sbRpc({ SB_URL, SB_KEY, fn: 'ha_recent_math_struggles',
                                     body: { p_child_id: child_id, p_skill_id: skill_id, p_days: 14 }});
    struggles = (strugRows || []).map(r => ({ prompt: r.prompt, answer: r.answer }));
  } catch (_) {}

  // ---- (3) Call Haiku ----------------------------------------------------
  let items;
  try {
    items = await draftBatch({ ANTHROPIC_KEY, cfg, skill_id, target_count, avoidPrompts, struggles });
  } catch (e) {
    return res.status(502).json({ error: 'haiku draft failed', detail: errStr(e) });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(502).json({ error: 'haiku returned no items' });
  }

  // ---- (4) Validation filter --------------------------------------------
  const seenPrompts = new Set();
  const clean = [];
  for (const it of items) {
    if (!it || typeof it !== 'object') continue;
    const prompt = String(it.prompt || '').trim();
    const answer = Number.isInteger(it.answer) ? it.answer : parseInt(it.answer, 10);
    const distractors = Array.isArray(it.distractors)
      ? it.distractors.map(x => Number.isInteger(x) ? x : parseInt(x, 10)).filter(Number.isFinite)
      : [];
    if (!prompt) continue;
    if (prompt.length < 10 || prompt.length > 240) continue;          // 5-30 words ≈ 30-200 chars; allow some slack
    if (wordCount(prompt) < 5 || wordCount(prompt) > 35) continue;
    if (!Number.isFinite(answer)) continue;
    if (answer < cfg.answer_min || answer > cfg.answer_max) continue;  // out of skill range
    if (distractors.length !== 3) continue;
    const distSet = new Set(distractors);
    if (distSet.size !== 3) continue;                                  // dupes within distractors
    if (distSet.has(answer)) continue;                                 // distractor equals answer
    if (distractors.some(d => d < 0 || d > 99)) continue;              // wildly out of range
    const promptKey = prompt.toLowerCase().slice(0, 60);
    if (seenPrompts.has(promptKey)) continue;
    seenPrompts.add(promptKey);
    clean.push({
      child_id,
      skill_id,
      standard:   cfg.standard,
      prompt,
      answer,
      distractors,
      theme:      trim(it.theme, 40),
      difficulty: 1,
      source:     'haiku-' + new Date().toISOString().slice(0, 10),
    });
  }
  if (clean.length === 0) {
    return res.status(502).json({ error: 'haiku items all filtered', raw_count: items.length });
  }

  // ---- (5) Bulk insert --------------------------------------------------
  let inserted = 0;
  try {
    const ins = await sbPost({
      SB_URL, SB_KEY,
      path: 'ha_math_problems',
      headers: { Prefer: 'return=representation' },
      body: clean,
    });
    inserted = Array.isArray(ins) ? ins.length : clean.length;
  } catch (e) {
    return res.status(500).json({ error: 'insert failed', detail: errStr(e), cleaned: clean.length });
  }

  return res.status(200).json({
    status: 'generated',
    inserted,
    requested: target_count,
    cleaned: clean.length,
    raw: items.length,
    pool_unseen_before: unseen,
    struggles_fed: struggles.length,
  });
}

// ---------------------------------------------------------------------------
// Haiku prompt — heavily personalized
// ---------------------------------------------------------------------------

function buildPersonalizationBlock(profile) {
  if (!profile || Object.keys(profile).length === 0) {
    return '(No profile available — write neutral, age-appropriate problems.)';
  }
  const fam = profile.family || {};
  const lines = [];
  lines.push(`Name: ${profile.name || 'Nigel'} (age ${profile.age || 7}, ${profile.grade || '2nd grade'}).`);
  if (profile.home && profile.home.city) lines.push(`Lives in ${profile.home.city}.`);
  if (fam.mother || fam.father) lines.push(`Parents: ${[fam.mother, fam.father].filter(Boolean).join(' and ')}.`);
  if (Array.isArray(fam.cousins) && fam.cousins.length) lines.push(`Cousins: ${fam.cousins.join(', ')}.`);
  if (fam.best_friend) lines.push(`Best friend: ${fam.best_friend}.`);
  if (Array.isArray(fam.other_friends) && fam.other_friends.length) lines.push(`Other friends: ${fam.other_friends.join(', ')}.`);
  if (profile.home && profile.home.neighbor) lines.push(`Neighbor: ${profile.home.neighbor}.`);
  if (Array.isArray(profile.heritage_food) && profile.heritage_food.length) lines.push(`Favorite foods: ${profile.heritage_food.join(', ')}.`);
  if (Array.isArray(profile.loves) && profile.loves.length) lines.push(`Loves: ${profile.loves.join(', ')}.`);
  if (Array.isArray(profile.hobbies) && profile.hobbies.length) lines.push(`Hobbies: ${profile.hobbies.join(', ')}.`);
  if (Array.isArray(profile.recent_milestones) && profile.recent_milestones.length) {
    lines.push(`Recent: ${profile.recent_milestones[0]}`);
  }
  if (profile.faith && profile.faith.religion) {
    lines.push(`Faith: ${profile.faith.religion}${profile.faith.notes ? ' — ' + profile.faith.notes : ''}.`);
  }
  return lines.join('\n');
}

async function draftBatch({ ANTHROPIC_KEY, cfg, skill_id, target_count, avoidPrompts, struggles }) {
  const personalization = buildPersonalizationBlock(PROFILE);

  const system = [
    'You are a 2nd-grade math curriculum specialist writing word problems for a homeschooled 7-year-old named Nigel.',
    '',
    'EVERY problem you produce must:',
    '  - Use plain, decodable, 2nd-grade English. Simple sentences. 5-30 words total.',
    '  - Have a single clear integer answer that falls within the skill\u2019s answer range.',
    '  - Match the math operation exactly (do not slip in a different operation).',
    '  - Sound personal and concrete — use Nigel\u2019s name, family, friends, foods, loves, or hobbies naturally. Not every problem must mention him by name, but personal context should be common across the batch.',
    '  - Be emotionally safe: no death, no scary scenes, no money debt, no themes that could distress a child.',
    '  - Avoid heavy religious references; light references to praying before a meal are fine in moderation. Never make faith the central content.',
    '',
    'PERSONALIZATION CONTEXT — use these freely and rotate themes across the batch (no theme should appear more than 3 times in 15 items):',
    personalization,
    '',
    'DISTRACTOR RULES:',
    '  - Provide exactly 3 distractors.',
    '  - Distractors must be integers different from the answer and from each other.',
    '  - Use plausible wrong answers a 2nd-grader might pick: off-by-one, off-by-two, wrong operation (e.g., subtracted instead of added), or transposed digits.',
    '  - Keep all distractors within a believable range (0-99).',
    '',
    'If "recent struggle problems" are given, model up to 2 of your new problems on the SAME operation pattern (different numbers and theme) so Nigel gets retrieval practice.',
    '',
    'OUTPUT FORMAT — strict JSON only, no markdown fences, no preamble, no commentary:',
    '{ "items": [ { "prompt": "...", "answer": N, "distractors": [N,N,N], "theme": "short-tag" } ] }',
  ].join('\n');

  const user = [
    `Generate exactly ${target_count} new word problems.`,
    '',
    `Skill: ${skill_id} (${cfg.name})`,
    `CCSS standard: ${cfg.standard}`,
    `Answer range: ${cfg.answer_min} to ${cfg.answer_max} (inclusive). Problems with answers outside this range will be rejected.`,
    `Guidance: ${cfg.guidance}`,
    `Pure-math reference: ${cfg.example}`,
    '',
    'AVOID these themes/openings already in the library (vary it up — different opener, different theme, different names):',
    avoidPrompts.length ? JSON.stringify(avoidPrompts) : '(empty — first batch)',
    '',
    'Recent struggle problems (write 1-2 retrieval-practice problems with the same operation pattern):',
    struggles.length ? JSON.stringify(struggles) : '(none yet)',
    '',
    'Return JSON only. No prose, no markdown fences.',
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
      max_tokens: 2500,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`anthropic ${r.status}: ${body.slice(0, 300)}`);
  }
  const json = await r.json();
  const text = (json.content || [])
    .filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
  const fenced = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();

  let parsed;
  try { parsed = JSON.parse(fenced); }
  catch (e) { throw new Error('haiku output not JSON: ' + fenced.slice(0, 300)); }
  if (!parsed || !Array.isArray(parsed.items)) {
    throw new Error('haiku output missing items[]: ' + JSON.stringify(parsed).slice(0, 300));
  }
  return parsed.items;
}

// ---------------------------------------------------------------------------
// Supabase REST helpers
// ---------------------------------------------------------------------------

async function sbRpc({ SB_URL, SB_KEY, fn, body }) {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json', Accept: 'application/json',
    },
    body: JSON.stringify(body || {}),
  });
  if (!r.ok) throw new Error(`rpc ${fn} ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
}
async function sbGet({ SB_URL, SB_KEY, path }) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, Accept: 'application/json' },
  });
  if (!r.ok) throw new Error(`get ${path} ${r.status}`);
  return r.json();
}
async function sbPost({ SB_URL, SB_KEY, path, body, headers }) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method: 'POST',
    headers: {
      apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json', Accept: 'application/json',
      ...(headers || {}),
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`post ${path} ${r.status} ${(await r.text()).slice(0, 200)}`);
  const t = await r.text();
  if (!t) return [];
  try { return JSON.parse(t); } catch (_) { return []; }
}

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------

function clampInt(v, lo, hi, dflt) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
}
function trim(v, n) {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length > n ? s.slice(0, n) : s;
}
function wordCount(s) { return String(s).trim().split(/\s+/).filter(Boolean).length; }
function safeJson(s) { try { return JSON.parse(s); } catch (_) { return {}; } }
function errStr(e) { return (e && e.message) || String(e); }
