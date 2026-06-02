/**
 * Hero Academy — Word Tower adaptive batch generator.
 *
 *   POST /api/humphrey/generate-word-tower-batch
 *   Body: { child_id, level_id, target_count?, force? }
 *
 * Behavior:
 *   1. Read pool status for (child, level). If unseen >= MIN_UNSEEN and
 *      force !== true, return {status:'sufficient', inserted:0}.
 *      This prevents anonymous spam from burning Haiku tokens.
 *   2. Pull recent seen + recent struggles via service-role REST so we can
 *      build "avoid" and "retrieval-practice" lists for the prompt.
 *   3. Call Claude Haiku 4.5 with a strict-JSON system prompt and structured
 *      output instructions. Validate response shape.
 *   4. Filter out any words already present for this child+level (race-safe).
 *   5. Bulk insert into ha_word_tower_items via service-role REST.
 *   6. Return {status:'generated', inserted:N, requested:M}.
 *
 * Env required:
 *   ANTHROPIC_API_KEY
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Auth: none required (pool-check throttling is the spam guard). If pool is
 * already healthy, the endpoint short-circuits with a no-op, so a spammer
 * gets cheap 200 responses, not Haiku calls.
 */

import { readFileSync } from 'fs';
import path from 'path';

const HAIKU_MODEL    = 'claude-haiku-4-5';
const MIN_UNSEEN     = 30;   // below this, top up — aggressive to keep "never twice" true
const DEFAULT_TARGET = 25;   // batch size when topping up

// Profile load at cold-start (used to flavor hints + example sentences with
// Nigel's family / friends / interests where natural).
let PROFILE = {};
try {
  PROFILE = JSON.parse(readFileSync(
    path.join(process.cwd(), 'data', 'nigel-profile.json'), 'utf-8'
  ));
} catch (e) { /* leave empty */ }

// Difficulty band descriptors for Word Tower (1-4)
const DIFFICULTY_BANDS = [
  '__placeholder_0__',
  'easy: stick to the simplest, most concrete words in the level',
  'medium: typical words at the level — current default',
  'hard: less-common words at the level, longer vocab, trickier hints',
  'expert: stretch vocabulary, words that span two patterns or syllables',
];


// Per-level config. Adding a new level = new entry here + (optional) a seed
// migration. The client only needs to send level_id.
const LEVEL_CONFIG = {
  digraphs: {
    name: 'Consonant Digraphs',
    mccrs: '2.RF.3.b',
    ccss: 'CCSS.ELA-LITERACY.RF.2.3.B',
    patterns: ['sh-', '-sh', 'ch-', '-ch', 'th-', '-th', 'wh-'],
    pattern_note:
      'Each pattern means: "sh-" sh at the START of the word; "-sh" sh at the ' +
      'END of the word. ch-/-ch, th-/-th likewise. wh- only appears at start. ' +
      'Stay strictly within these patterns; do not introduce ph-, kn-, or ' +
      'other digraphs for this level.'
  }
  // future: cvce (silent-e), vowel-teams, r-controlled, etc.
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
  const level_id     = String(body.level_id || '').trim();
  const target_count = clampInt(body.target_count, 5, 30, DEFAULT_TARGET);
  const force        = body.force === true;
  if (!child_id || !level_id) return res.status(400).json({ error: 'child_id and level_id required' });

  const cfg = LEVEL_CONFIG[level_id];
  if (!cfg) return res.status(400).json({ error: `unknown level_id: ${level_id}` });

  // ---- (1) Pool check ----------------------------------------------------
  let pool;
  try {
    pool = await sbRpc({ SB_URL, SB_KEY, fn: 'ha_word_tower_pool_status',
                         body: { p_child_id: child_id, p_level_id: level_id } });
  } catch (e) {
    return res.status(500).json({ error: 'pool_status failed', detail: errStr(e) });
  }
  const status = Array.isArray(pool) ? pool[0] : pool;
  const unseen = (status && status.unseen) || 0;

  if (!force && unseen >= MIN_UNSEEN) {
    return res.status(200).json({
      status: 'sufficient', inserted: 0, unseen, threshold: MIN_UNSEEN
    });
  }

  // ---- Read current difficulty level (1-4, default 2) -----------------
  let difficulty = 2;
  try {
    const lvl = await sbRpc({ SB_URL, SB_KEY, fn: 'ha_get_difficulty',
                              body: { p_child_id: child_id, p_zone: 'wordtower' } });
    difficulty = (typeof lvl === 'number') ? lvl : (Array.isArray(lvl) && lvl[0]) || 2;
  } catch (_) {}
  // Body override for testing
  if (Number.isInteger(body.target_difficulty)) difficulty = body.target_difficulty;

  // ---- (2) Build avoid + struggle lists ----------------------------------
  let avoid = [], struggles = [];
  try {
    const avoidRows = await sbGet({
      SB_URL, SB_KEY,
      path: `ha_word_tower_items?child_id=eq.${child_id}&level_id=eq.${level_id}&select=word`
    });
    avoid = avoidRows.map(r => r.word);
  } catch (_) { /* non-fatal */ }
  try {
    const strugRows = await sbRpc({ SB_URL, SB_KEY, fn: 'ha_recent_word_struggles',
                                     body: { p_child_id: child_id, p_level_id: level_id, p_days: 14 }});
    struggles = (strugRows || []).map(r => r.word);
  } catch (_) { /* non-fatal */ }

  // ---- (3) Call Haiku ----------------------------------------------------
  let items;
  try {
    items = await draftBatch({ ANTHROPIC_KEY, cfg, level_id, target_count, avoid, struggles, difficulty });
  } catch (e) {
    return res.status(502).json({ error: 'haiku draft failed', detail: errStr(e) });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(502).json({ error: 'haiku returned no items' });
  }

  // ---- (4) Local sanity filter + dedupe ---------------------------------
  const avoidLower = new Set(avoid.map(w => String(w).toLowerCase()));
  const seenInBatch = new Set();
  const allowedPatterns = new Set(cfg.patterns);
  const clean = [];
  for (const it of items) {
    const w = String(it && it.word || '').trim().toLowerCase();
    const p = String(it && it.pattern || '').trim();
    if (!w || !p) continue;
    if (!/^[a-z]{2,9}$/.test(w)) continue;       // 2-9 lowercase letters
    if (avoidLower.has(w)) continue;             // already in library
    if (seenInBatch.has(w)) continue;            // duplicated within batch
    if (!allowedPatterns.has(p)) continue;       // pattern not in this level
    seenInBatch.add(w);
    clean.push({
      child_id,
      level_id,
      word: w,
      pattern: p,
      hint: trim(it.hint, 200),
      image_emoji: trim(it.image_emoji, 12),
      sentence: trim(it.sentence, 200),
      difficulty: difficulty,
      source: 'haiku-' + new Date().toISOString().slice(0, 10),
    });
  }
  if (clean.length === 0) {
    return res.status(502).json({ error: 'haiku items all filtered', raw_count: items.length });
  }

  // ---- (5) Bulk insert via service role ---------------------------------
  let inserted = 0;
  try {
    const ins = await sbPost({
      SB_URL, SB_KEY,
      path: 'ha_word_tower_items?on_conflict=child_id,level_id,word',
      // Prefer=resolution=ignore-duplicates avoids 409s on race
      headers: { Prefer: 'return=representation,resolution=ignore-duplicates' },
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
// Haiku prompt
// ---------------------------------------------------------------------------

// Build a personalization block — used to nudge Haiku to put Nigel's family,
// friends, and interests into example sentences naturally (not every sentence).
function buildPersonalizationBlock(profile) {
  if (!profile || Object.keys(profile).length === 0) return '(no profile)';
  const fam = profile.family || {};
  const bits = [];
  bits.push(`Kid: ${profile.name || 'Nigel'} (age ${profile.age || 7}).`);
  if (Array.isArray(fam.cousins) && fam.cousins.length) bits.push(`Cousins: ${fam.cousins.join(', ')}.`);
  if (fam.best_friend) bits.push(`Best friend: ${fam.best_friend}.`);
  if (Array.isArray(fam.other_friends) && fam.other_friends.length) bits.push(`Friends: ${fam.other_friends.join(', ')}.`);
  if (Array.isArray(profile.loves) && profile.loves.length) bits.push(`Loves: ${profile.loves.join(', ')}.`);
  if (Array.isArray(profile.hobbies) && profile.hobbies.length) bits.push(`Hobbies: ${profile.hobbies.join(', ')}.`);
  if (Array.isArray(profile.heritage_food) && profile.heritage_food.length) bits.push(`Family foods: ${profile.heritage_food.join(', ')}.`);
  return bits.join(' ');
}

async function draftBatch({ ANTHROPIC_KEY, cfg, level_id, target_count, avoid, struggles, difficulty }) {
  const personalization = buildPersonalizationBlock(PROFILE);
  const system = [
    'You are a 2nd-grade reading curriculum specialist. Your job is to generate a small batch of decodable phonics words for Nigel, age 7, in 2nd grade in Maryland.',
    '',
    'EVERY word you produce must be:',
    '  - Fully decodable by a 2nd grader who has been taught the target phonics pattern.',
    '  - One or two syllables only. No abbreviations, no proper nouns, no contractions.',
    '  - Common in 2nd-grade vocabulary (Tier 1 / early Tier 2).',
    '  - Concrete enough to pair with a single recognizable emoji.',
    '  - Distinct from every word in the avoid list (case-insensitive).',
    '',
    'For EACH word, also produce:',
    '  - pattern: exactly one of the allowed patterns for this level.',
    '  - hint: a warm, tutor-voiced reading hint focused on the phonics pattern. 8 to 15 words. Start with "Listen for…", "Notice the…", or similar.',
    '  - image_emoji: ONE common emoji character that clearly depicts the word. No text, no multiple emojis.',
    '  - sentence: a 4-7 word, fully decodable, age-appropriate example sentence that uses the word.',
    '',
    'If retrieval-practice words are given, include up to 2 words that share a phonics feature with one of those struggle words.',
    '',
    'Distribute items roughly evenly across the requested patterns.',
    '',
    'PERSONALIZATION (apply to hints and example sentences — NOT to the words themselves):',
    'Where it fits naturally, fold in details from Nigel\'s real life so reading feels personal. Examples:',
    '  - For words like "shoot", "climb", "jump": reference Spider-Man, Mario, or soccer',
    '  - For "share", "play", "laugh": use "with Skylar", "with Gabriel", or "with Lexi"',
    '  - For food words: jollof rice, mango, cassava leaf are great anchors',
    'No more than ~30% of items should use a personal reference — the rest should be neutral / general. Never let personalization stretch the word into a non-decodable example.',
    '',
    'Nigel\'s profile:',
    personalization,
    '',
    `DIFFICULTY: ${DIFFICULTY_BANDS[Math.max(1, Math.min(4, difficulty || 2))]}. Match the word complexity to this band.`,
    '',
    'OUTPUT FORMAT — strict JSON only, no markdown fences, no preamble, no commentary:',
    '{ "items": [ { "word": "...", "pattern": "...", "hint": "...", "image_emoji": "...", "sentence": "..." } ] }',
  ].join('\n');

  const user = [
    `Generate exactly ${target_count} new decodable words for Nigel.`,
    '',
    `Level: ${level_id} (${cfg.name})`,
    `MCCRS standard: ${cfg.mccrs}`,
    `Allowed patterns (use only these, exactly as written): ${JSON.stringify(cfg.patterns)}`,
    `Pattern note: ${cfg.pattern_note}`,
    '',
    `Avoid words (already in Nigel's library — case-insensitive): ${JSON.stringify(avoid)}`,
    `Retrieval-practice opportunities (recent struggles): ${JSON.stringify(struggles)}`,
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
      max_tokens: 1500,
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
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n')
    .trim();

  // Strip any accidental fences just in case.
  const fenced = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();

  let parsed;
  try { parsed = JSON.parse(fenced); }
  catch (e) { throw new Error('haiku output not JSON: ' + fenced.slice(0, 200)); }

  if (!parsed || !Array.isArray(parsed.items)) {
    throw new Error('haiku output missing items[]: ' + JSON.stringify(parsed).slice(0, 200));
  }
  return parsed.items;
}

// ---------------------------------------------------------------------------
// Supabase REST helpers (service role)
// ---------------------------------------------------------------------------

async function sbRpc({ SB_URL, SB_KEY, fn, body }) {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
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
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(headers || {}),
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`post ${path} ${r.status} ${(await r.text()).slice(0, 200)}`);
  // representation may return [] on resolution=ignore-duplicates with all dupes
  const t = await r.text();
  if (!t) return [];
  try { return JSON.parse(t); } catch (_) { return []; }
}

// ---------------------------------------------------------------------------
// Tiny utils
// ---------------------------------------------------------------------------

function clampInt(v, lo, hi, dflt) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(hi, Math.max(lo, n));
}
function trim(v, n) {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length > n ? s.slice(0, n) : s;
}
function safeJson(s) {
  try { return JSON.parse(s); } catch (_) { return {}; }
}
function errStr(e) { return (e && e.message) || String(e); }
