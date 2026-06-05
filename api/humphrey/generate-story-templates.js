/**
 * Hero Academy — Story Lab adaptive template generator.
 *
 *   POST /api/humphrey/generate-story-templates
 *   Body: { child_id, target_count?, force? }
 *
 * Mirrors the other generators:
 *   1. Pool-check short-circuit — return {status:'sufficient'} if unseen ≥ MIN.
 *   2. Build avoid-titles list from existing templates so Haiku doesn't repeat.
 *   3. Call Claude Haiku 4.5 with a deeply personalized system prompt — Story
 *      Lab is the richest personalization surface in the app, since templates
 *      can literally feature Nigel and the people / things in his life.
 *   4. Validate structurally: slot.kind must be one of the 9 grade-2-vocab
 *      categories so the existing word-picker keeps working unchanged; every
 *      {slotKey} placeholder in the text must map to a defined slot; 3-5
 *      slots per template; text 3-5 sentences.
 *   5. Bulk insert via service-role REST.
 *
 * Env: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

import { readFileSync } from 'fs';
import path from 'path';

const HAIKU_MODEL    = 'claude-haiku-4-5';
const MIN_UNSEEN     = 15;
const DEFAULT_TARGET = 12;

// Difficulty band descriptors (1-4) — used to nudge Haiku.
const DIFFICULTY_BANDS = [
  '__placeholder_0__',
  'easy: 3 slots, 3 short sentences, simple vocabulary',
  'medium: 4 slots, 4 sentences, standard vocabulary — current default',
  'hard: 5 slots, 5 sentences with richer vocabulary',
  'expert: 5 slots, 5 sentences with stretch vocabulary and clause structure',
];


// The grade-2-vocab categories — slot.kind MUST be one of these or the
// existing static word-picker can't find a vocab list to show.
const ALLOWED_KINDS = ['place','animal','food','object','person','action','feeling','size','look'];

let PROFILE = {};
try {
  PROFILE = JSON.parse(readFileSync(
    path.join(process.cwd(), 'data', 'nigel-profile.json'), 'utf-8'
  ));
} catch (e) { /* leave empty */ }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const SB_URL = process.env.SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!SB_URL || !SB_KEY) return res.status(500).json({ error: 'supabase env missing' });
  if (!ANTHROPIC_KEY)     return res.status(500).json({ error: 'anthropic env missing' });

  const body = (req.body && typeof req.body === 'object') ? req.body : safeJson(req.body);
  const child_id     = String(body.child_id || '').trim();
  const target_count = clampInt(body.target_count, 3, 12, DEFAULT_TARGET);
  const force        = body.force === true;
  if (!child_id) return res.status(400).json({ error: 'child_id required' });

  // ---- (1) Pool check ---------------------------------------------------
  let pool;
  try {
    pool = await sbRpc({ SB_URL, SB_KEY, fn: 'ha_story_pool_status',
                         body: { p_child_id: child_id } });
  } catch (e) {
    return res.status(500).json({ error: 'pool_status failed', detail: errStr(e) });
  }
  const status = Array.isArray(pool) ? pool[0] : pool;
  const unseen = (status && status.unseen) || 0;
  if (!force && unseen >= MIN_UNSEEN) {
    return res.status(200).json({ status: 'sufficient', inserted: 0, unseen, threshold: MIN_UNSEEN });
  }

  // ---- Read current difficulty level (1-4, default 2) -----------------
  let difficulty = 2;
  try {
    const lvl = await sbRpc({ SB_URL, SB_KEY, fn: 'ha_get_difficulty',
                              body: { p_child_id: child_id, p_zone: 'storylab' } });
    difficulty = (typeof lvl === 'number') ? lvl : (Array.isArray(lvl) && lvl[0]) || 2;
  } catch (_) {}
  if (Number.isInteger(body.target_difficulty)) difficulty = body.target_difficulty;

  // ---- (2) Build avoid-titles list --------------------------------------
  let avoidTitles = [], avoidThemes = [];
  try {
    const rows = await sbGet({ SB_URL, SB_KEY,
      path: `ha_story_templates?child_id=eq.${child_id}&select=title,theme&limit=80`
    });
    avoidTitles = (rows || []).map(r => String(r.title || '').trim()).filter(Boolean);
    avoidThemes = Array.from(new Set((rows || []).map(r => String(r.theme || '').trim()).filter(Boolean)));
  } catch (_) {}

  // ---- (2b) Cross-zone struggle thread (Build #2) ----------------------
  // Pull recent wrong answers from any zone so Haiku can weave one of
  // them into ~1-2 of the generated templates. The link is persisted so
  // Ms. Humphrey can name the connection when the template is picked.
  let recentStruggles = [];
  try {
    const rs = await sbRpc({ SB_URL, SB_KEY, fn: 'ha_get_recent_struggles',
                             body: { p_child_id: child_id, p_days: 7 } });
    if (Array.isArray(rs)) recentStruggles = rs.slice(0, 6);
  } catch (_) { /* non-fatal; just skip threading */ }

  // ---- (3) Call Haiku ---------------------------------------------------
  let items;
  try {
    items = await draftBatch({ ANTHROPIC_KEY, target_count, avoidTitles, avoidThemes, difficulty, recentStruggles });
  } catch (e) {
    return res.status(502).json({ error: 'haiku draft failed', detail: errStr(e) });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(502).json({ error: 'haiku returned no items' });
  }

  // ---- (4) Validation filter --------------------------------------------
  const titleSet = new Set(avoidTitles.map(t => t.toLowerCase()));
  const seenTitles = new Set();
  const clean = [];
  for (const it of items) {
    if (!it || typeof it !== 'object') continue;
    const title    = trim(it.title, 80);
    const emoji    = trim(it.emoji, 8);
    const theme    = trim(it.theme, 40);
    const text     = trim(it.text_template || it.text, 1200);
    const slots    = Array.isArray(it.slots) ? it.slots : [];
    if (!title || !text || slots.length < 3 || slots.length > 6) continue;

    // Validate every slot has key + kind (allowed) + prompt
    const slotKeys = new Set();
    const cleanSlots = [];
    let slotOk = true;
    for (const s of slots) {
      if (!s || typeof s !== 'object') { slotOk = false; break; }
      const key    = trim(s.key, 30);
      const kind   = trim(s.kind, 20);
      const prompt = trim(s.prompt, 200);
      if (!key || !kind || !prompt) { slotOk = false; break; }
      if (ALLOWED_KINDS.indexOf(kind) < 0) { slotOk = false; break; }
      if (slotKeys.has(key)) { slotOk = false; break; }  // dupe slot keys
      slotKeys.add(key);
      cleanSlots.push({ key, kind, prompt });
    }
    if (!slotOk) continue;

    // Every {slotKey} placeholder in text must resolve; every slot must be used.
    const placeholders = (text.match(/\{(\w+)\}/g) || []).map(p => p.slice(1, -1));
    if (placeholders.length === 0) continue;
    const phSet = new Set(placeholders);
    let allPlaceholdersResolved = true;
    for (const ph of phSet) {
      if (!slotKeys.has(ph)) { allPlaceholdersResolved = false; break; }
    }
    if (!allPlaceholdersResolved) continue;
    let allSlotsUsed = true;
    for (const k of slotKeys) {
      if (!phSet.has(k)) { allSlotsUsed = false; break; }
    }
    if (!allSlotsUsed) continue;

    // Sentence count guard (rough — split on .!?)
    const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0);
    if (sentences.length < 3 || sentences.length > 7) continue;

    const titleKey = title.toLowerCase();
    if (titleSet.has(titleKey) || seenTitles.has(titleKey)) continue;
    seenTitles.add(titleKey);

    clean.push({
      child_id,
      title,
      emoji: emoji || '✨',
      theme: theme || 'general',
      slots_json: cleanSlots,
      text_template: text,
      difficulty: difficulty,
      source: 'haiku-' + new Date().toISOString().slice(0, 10),
      linked_struggle_zone:    trim(it.linked_struggle_zone, 40)    || null,
      linked_struggle_concept: trim(it.linked_struggle_concept, 200) || null,
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
      path: 'ha_story_templates',
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
  });
}

// ---------------------------------------------------------------------------
// Haiku prompt — Story Lab is the richest personalization surface in the app
// ---------------------------------------------------------------------------

function buildStruggleBlock(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return '  (no recent struggles — skip the cross-zone thread for this batch)';
  }
  // Keep it tight so the system prompt stays small. Each struggle one line.
  const lines = rows.slice(0, 6).map((r, i) => {
    const zone     = trim(String(r.zone_id || ''), 30);
    const prompt   = trim(String(r.prompt   || ''), 200);
    const expected = trim(String(r.expected || ''), 120);
    const given    = trim(String(r.given    || ''), 120);
    return `  [${i + 1}] zone="${zone}" — prompt="${prompt}" — correct_answer="${expected}" — nigel_said="${given}"`;
  });
  return lines.join('\n');
}

function buildPersonalizationBlock(profile) {
  if (!profile || Object.keys(profile).length === 0) {
    return '(No profile available — write neutral, age-appropriate templates.)';
  }
  const fam = profile.family || {};
  const lines = [];
  lines.push(`Kid: ${profile.name || 'Nigel'} (age ${profile.age || 7}, ${profile.grade || '2nd grade'}). Birthday ${profile.birthday || ''}.`);
  if (profile.home && profile.home.city) lines.push(`Home: ${profile.home.city}.`);
  if (fam.mother || fam.father) lines.push(`Parents: ${[fam.mother, fam.father].filter(Boolean).join(' and ')}.`);
  if (Array.isArray(fam.cousins) && fam.cousins.length) lines.push(`Cousins: ${fam.cousins.join(', ')}.`);
  if (fam.best_friend) lines.push(`Best friend: ${fam.best_friend}.`);
  if (Array.isArray(fam.other_friends) && fam.other_friends.length) lines.push(`Other friends: ${fam.other_friends.join(', ')}.`);
  if (profile.home && profile.home.neighbor) lines.push(`Neighbor: ${profile.home.neighbor}.`);
  if (Array.isArray(profile.heritage_food) && profile.heritage_food.length) lines.push(`Family foods: ${profile.heritage_food.join(', ')}.`);
  if (Array.isArray(profile.loves) && profile.loves.length) lines.push(`Loves: ${profile.loves.join(', ')}.`);
  if (Array.isArray(profile.hobbies) && profile.hobbies.length) lines.push(`Hobbies: ${profile.hobbies.join(', ')}.`);
  if (Array.isArray(profile.recent_milestones) && profile.recent_milestones.length) {
    lines.push(`Recent: ${profile.recent_milestones[0]}`);
  }
  return lines.join('\n');
}

async function draftBatch({ ANTHROPIC_KEY, target_count, avoidTitles, avoidThemes, difficulty, recentStruggles }) {
  const personalization = buildPersonalizationBlock(PROFILE);
  const struggleBlock   = buildStruggleBlock(recentStruggles);

  const system = [
    'You are a 2nd-grade narrative writing specialist designing MadLib-style story templates for a homeschooled 7-year-old named Nigel.',
    '',
    'WHAT A TEMPLATE IS:',
    'A short narrative skeleton (3-5 sentences) with 3-5 blank slots that Nigel will fill in by tapping word-bank buttons. The substituted story should be fun, decodable, and feel personal to him.',
    '',
    'EVERY TEMPLATE MUST INCLUDE:',
    '  - title: short and evocative, 2-6 words (e.g. "Skylar Saves the Day", "The Lost Tooth Mystery")',
    '  - emoji: ONE single emoji that visually represents the story',
    '  - theme: short kebab-case tag (e.g. "skylar-adventure", "lost-tooth", "soccer-game")',
    '  - slots: array of 3-5 slot objects, each:',
    '      { key: short snake_case identifier, kind: ONE OF the 9 allowed categories, prompt: kid-friendly question }',
    '  - text_template: a 3-5 sentence narrative with {slotKey} placeholders that EXACTLY match the slot keys. The kid will tap a word from the slot\u2019s vocab category to fill each blank.',
    '',
    'ALLOWED slot.kind VALUES (do not invent new ones — these are hardcoded vocab categories):',
    '  place    — locations like "the playground", "Brooklyn"',
    '  animal   — "turtle", "dragon", "hummingbird"',
    '  food     — "jollof rice", "pizza", "mango"',
    '  object   — "backpack", "telescope", "Lego brick"',
    '  person   — "my cousin", "a wizard", "a chef"',
    '  action   — "run", "build a fort", "wiggle"',
    '  feeling  — "happy", "brave", "curious"',
    '  size     — "giant", "tiny", "fluffy", "sticky"',
    '  look     — "purple", "glowing", "polka-dotted"',
    '',
    'PERSONALIZATION (this zone IS the personalization — feature Nigel and the people / things in his life directly):',
    personalization,
    '',
    'STORY THEME IDEAS (pick fresh ones — vary across the batch):',
    '  - cousin Skylar visits and they go on an adventure',
    '  - Nigel\u2019s lost tooth turned into a wild night',
    '  - the big soccer game where something funny happened',
    '  - learning a guitar song that turned magical',
    '  - Mom and Dad cooking jollof rice / cassava leaf and a surprise guest arrives',
    '  - Spider-Man swings into Upper Marlboro',
    '  - Mario shows up at school',
    '  - a Transformer in the neighborhood',
    '  - friend Gabriel or friend Lexi or friend Zylo plays a key role',
    '  - neighbor Larry tells a wild story',
    '  - Nigel\u2019s birthday (April 24) in some unexpected setting',
    '  - learning piano with an enchanted piano',
    '  - going to a candy shop / library / treehouse with someone he knows',
    'You can also invent fresh themes — variety matters more than sticking to this list.',
    '',
    'RULES:',
    '  - Every {slotKey} in text_template MUST match a slot.key exactly.',
    '  - Every slot.key MUST appear at least once in text_template (no orphan slots).',
    '  - No more than ONE slot of the same kind per template (e.g. don\u2019t have two "food" slots).',
    '  - Final story sentences should be decodable for a 2nd-grader — short, concrete, fun.',
    '  - No scary content, no death, no disturbing themes. Keep it warm and silly.',
    '  - Light faith reference is fine (praying before a meal). Never make faith the focus.',
    '  - Substituting random words from each kind should still produce a coherent, silly story.',
    '',
    `DIFFICULTY: ${DIFFICULTY_BANDS[Math.max(1, Math.min(4, difficulty || 2))]}. Calibrate accordingly.`,
    '',
    '★★★ CROSS-ZONE THREAD — READ THIS CAREFULLY ★★★',
    'Below is a list of RECENT STRUGGLES — questions Nigel got wrong in OTHER zones (Discovery Dome science cards, Number Lab math problems, etc.). If this list is non-empty, you MUST do the following:',
    '  • Choose ONE struggle from the list.',
    '  • Write ONE of the templates in this batch around the underlying concept of that struggle. The concept appears as part of the story world (the protagonist sees / does / experiences it) — NOT as a question Nigel has to answer.',
    '  • On that ONE template object, include two REQUIRED fields:',
    '       "linked_struggle_zone": <the exact zone_id string from the struggle, e.g. "discovery">',
    '       "linked_struggle_concept": <a 3-7 word phrase describing the concept, e.g. "spiders feel vibrations on their web">',
    '  • The OTHER templates in this batch must NOT include these fields (leave them off entirely).',
    '  • Optionally do this for a SECOND template if you can pick a different struggle. Hard cap: 2 of N templates threaded.',
    '',
    'WORKED EXAMPLE:',
    '  Struggle: zone="discovery" prompt="How does a spider know when something lands on its web?" correct_answer="It feels vibrations with tiny hairs on its legs"',
    '  Good threaded template:',
    '    title: "Skylar Meets the Web Watcher"',
    '    text: "Skylar tiptoed past the {place}. A tiny {animal} sat on its sticky web. When a {object} bumped the silk, the spider felt the buzz with its tiny leg hairs and zoomed over. Skylar whispered, \\"You are a tiny detective!\\""',
    '    linked_struggle_zone: "discovery"',
    '    linked_struggle_concept: "spiders feel vibrations on their web"',
    '  Note: the spider concept is BUILT INTO the story — Nigel re-encounters the right idea naturally while filling in the MadLib. There is no question; the reinforcement is in the narration.',
    '',
    'RECENT STRUGGLES LIST:',
    struggleBlock,
    '',
    'If the RECENT STRUGGLES LIST is empty (the line says "no recent struggles"), DO NOT include linked_struggle_zone or linked_struggle_concept on any template.',
    '',
    'OUTPUT FORMAT — strict JSON only, no markdown fences, no preamble:',
    '{ "items": [',
    '  { "title": "...", "emoji": "...", "theme": "...",',
    '    "slots": [ {"key":"...","kind":"...","prompt":"..."}, ... ],',
    '    "text_template": "...{slotKey}...",',
    '    "linked_struggle_zone": "...optional...",',
    '    "linked_struggle_concept": "...optional 3-7 words..." }',
    '] }',
  ].join('\n');

  const user = [
    `Generate exactly ${target_count} new story templates for Nigel.`,
    '',
    'AVOID these existing template titles (vary the theme / narrative arc):',
    avoidTitles.length ? JSON.stringify(avoidTitles) : '(empty)',
    '',
    'Existing themes already in the library (try to spread into new themes):',
    avoidThemes.length ? JSON.stringify(avoidThemes) : '(empty)',
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
      max_tokens: 3500,
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
// Supabase REST helpers (identical to the other generators)
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
function safeJson(s) { try { return JSON.parse(s); } catch (_) { return {}; } }
function errStr(e) { return (e && e.message) || String(e); }
