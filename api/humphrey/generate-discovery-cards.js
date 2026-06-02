/**
 * Hero Academy — Discovery Dome adaptive science-card generator.
 *
 *   POST /api/humphrey/generate-discovery-cards
 *   Body: { child_id, topic?, target_count?, force? }
 *
 * Behavior mirrors the other two batch generators:
 *   1. Pool-check short-circuit — return {status:'sufficient'} if unseen ≥ MIN.
 *      If `topic` is provided, the pool check is scoped to that topic;
 *      otherwise it's across all topics for the child.
 *   2. Build avoid-titles list from existing cards so Haiku doesn't repeat.
 *   3. Call Claude Haiku 4.5 with a personalized system prompt — Nigel's
 *      interests are used as HOOKS into science topics (Spider-Man → real
 *      spiders, Mario → ecosystems, soccer → motion/friction, etc.),
 *      not as the subject of the card itself. The card teaches the
 *      science; the personalization is the "in" to make it sticky.
 *   4. Validate each card: 4 choices, answer_index 0-3, fact 15-45 words,
 *      title <= 40 chars, single-emoji, NGSS standard tag.
 *   5. Bulk insert via service-role REST.
 *
 * Env: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 * Auth: none (pool-check is the spam guard).
 */

import { readFileSync } from 'fs';
import path from 'path';

const HAIKU_MODEL    = 'claude-haiku-4-5';
const MIN_UNSEEN     = 12;
const DEFAULT_TARGET = 10;

let PROFILE = {};
try {
  PROFILE = JSON.parse(readFileSync(
    path.join(process.cwd(), 'data', 'nigel-profile.json'), 'utf-8'
  ));
} catch (e) { /* leave empty */ }

const TOPICS = ['animals', 'weather', 'space', 'plants', 'physics'];

const TOPIC_GUIDANCE = {
  animals: 'Real biology — body parts, behaviors, adaptations, life cycles. K-5 NGSS standards: 2-LS4-1, 3-LS1-1, 4-LS1-1, K-LS1-1, 1-LS3-1.',
  weather: 'Atmosphere, water cycle, seasons, storms. NGSS: 2-ESS2-3, 3-ESS2-1, K-ESS2-1, 5-ESS2-1.',
  space:   'Sun, moon, planets, stars, gravity, day/night. NGSS: 1-ESS1-1, 5-ESS1-1, 5-ESS1-2, 5-PS2-1.',
  plants:  'Growth, photosynthesis, parts, pollination, ecosystems. NGSS: 2-LS2-1, 2-LS2-2, 4-LS1-1, 5-LS1-1.',
  physics: 'Forces, motion, sound, light, magnets, simple machines. NGSS: K-PS2-1, 1-PS4-1, 3-PS2-1, 3-PS2-3, 4-PS3-2.',
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
  const topicRaw     = body.topic ? String(body.topic).trim() : null;
  const topic        = topicRaw && TOPICS.indexOf(topicRaw) >= 0 ? topicRaw : null;
  const target_count = clampInt(body.target_count, 4, 20, DEFAULT_TARGET);
  const force        = body.force === true;
  if (!child_id) return res.status(400).json({ error: 'child_id required' });

  // ---- (1) Pool check ----------------------------------------------------
  let pool;
  try {
    pool = await sbRpc({ SB_URL, SB_KEY, fn: 'ha_discovery_pool_status',
                         body: { p_child_id: child_id, p_topic: topic } });
  } catch (e) {
    return res.status(500).json({ error: 'pool_status failed', detail: errStr(e) });
  }
  const status = Array.isArray(pool) ? pool[0] : pool;
  const unseen = (status && status.unseen) || 0;
  if (!force && unseen >= MIN_UNSEEN) {
    return res.status(200).json({ status: 'sufficient', inserted: 0, unseen, threshold: MIN_UNSEEN });
  }

  // ---- (2) Build avoid-titles list --------------------------------------
  let avoidTitles = [];
  try {
    const qTopic = topic ? `&topic=eq.${topic}` : '';
    const rows = await sbGet({ SB_URL, SB_KEY,
      path: `ha_discovery_cards?child_id=eq.${child_id}${qTopic}&select=title&limit=120`
    });
    avoidTitles = (rows || []).map(r => String(r.title || '').trim()).filter(Boolean);
  } catch (_) {}

  // ---- (3) Call Haiku ---------------------------------------------------
  let items;
  try {
    items = await draftBatch({ ANTHROPIC_KEY, topic, target_count, avoidTitles });
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
    const t = trim(it.topic, 20);
    if (!t || TOPICS.indexOf(t) < 0) continue;
    const title    = trim(it.title, 60);
    const fact     = trim(it.fact, 400);
    const question = trim(it.question, 200);
    const emoji    = trim(it.emoji, 8);
    const choices  = Array.isArray(it.choices) ? it.choices.map(c => trim(c, 100)).filter(Boolean) : [];
    const ai       = Number.isInteger(it.answer_index) ? it.answer_index : parseInt(it.answer_index, 10);
    const standard = trim(it.standard, 40);
    if (!title || !fact || !question) continue;
    if (wordCount(fact) < 12 || wordCount(fact) > 55) continue;
    if (choices.length !== 4) continue;
    if (new Set(choices.map(c => c.toLowerCase())).size !== 4) continue;
    if (!Number.isFinite(ai) || ai < 0 || ai > 3) continue;
    const key = title.toLowerCase();
    if (titleSet.has(key) || seenTitles.has(key)) continue;
    seenTitles.add(key);
    clean.push({
      child_id,
      topic: t,
      emoji,
      title,
      fact,
      question,
      choices,
      answer_index: ai,
      standard,
      difficulty: 1,
      source: 'haiku-' + new Date().toISOString().slice(0, 10),
    });
  }
  if (clean.length === 0) {
    return res.status(502).json({ error: 'haiku items all filtered', raw_count: items.length });
  }

  // ---- (5) Bulk insert ---------------------------------------------------
  let inserted = 0;
  try {
    const ins = await sbPost({
      SB_URL, SB_KEY,
      path: 'ha_discovery_cards',
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
    topic,
  });
}

// ---------------------------------------------------------------------------
// Haiku prompt
// ---------------------------------------------------------------------------

function buildInterestsHook(profile) {
  if (!profile || Object.keys(profile).length === 0) return '';
  const loves = Array.isArray(profile.loves) ? profile.loves.join(', ') : '';
  const hobbies = Array.isArray(profile.hobbies) ? profile.hobbies.join(', ') : '';
  const heritage = Array.isArray(profile.heritage_food) ? profile.heritage_food.join(', ') : '';
  const bits = [];
  if (loves) bits.push(`Loves: ${loves}.`);
  if (hobbies) bits.push(`Hobbies: ${hobbies}.`);
  if (heritage) bits.push(`Family food: ${heritage}.`);
  return bits.join(' ');
}

async function draftBatch({ ANTHROPIC_KEY, topic, target_count, avoidTitles }) {
  const interests = buildInterestsHook(PROFILE);

  const topicLine = topic
    ? `Generate cards ONLY in the topic "${topic}". Guidance: ${TOPIC_GUIDANCE[topic]}`
    : `Distribute cards across the 5 topics (animals, weather, space, plants, physics). ` +
      `Aim for roughly even coverage across the batch. Topic guidance:\n` +
      Object.entries(TOPIC_GUIDANCE).map(([k,v]) => `  - ${k}: ${v}`).join('\n');

  const system = [
    'You are a K-5 science curriculum specialist writing fact-cards for a homeschooled 7-year-old named Nigel.',
    '',
    'EACH CARD must be:',
    '  - A real, age-appropriate science fact aligned to an NGSS standard (K-5 range, biased toward 2nd grade).',
    '  - Factually accurate. No misinformation, no anthropomorphism beyond gentle phrasing.',
    '  - Concrete and observable — the kind of thing a 7-year-old can picture or have seen.',
    '  - Distinct from every existing card title (case-insensitive). Vary the angle and content.',
    '',
    'CARD STRUCTURE (every card needs all of these):',
    '  - topic: one of animals | weather | space | plants | physics',
    '  - emoji: ONE recognizable emoji that visually represents the card',
    '  - title: short and punchy, 2-5 words (e.g. "Octopus Arms", "Why Stars Twinkle")',
    '  - fact: 1-2 sentences, 15-45 words total, kid-friendly. This is what Ms. Humphrey reads aloud.',
    '  - question: ONE clear comprehension question based on the fact',
    '  - choices: array of EXACTLY 4 plausible answer choices. ONE clearly correct. Three plausible-but-wrong (no obvious throwaways like "magic" — make the kid actually think).',
    '  - answer_index: integer 0-3 — which index in choices is correct',
    '  - standard: NGSS code like "2-LS4-1" or "K-PS2-1"',
    '',
    'PERSONALIZATION HOOKS (optional, do not force):',
    'Use Nigel\u2019s interests as natural starting points for a card — NOT as the subject of the card. Examples:',
    '  - Loves Spider-Man → a card about real spiders, spider silk, or web-building',
    '  - Loves Mario → a card about real mushrooms, turtles, or pipes/tunnels in nature',
    '  - Loves Transformers → a card about robots, machines, or animals that change form (butterflies, frogs)',
    '  - Plays soccer → a card about friction, gravity, motion, or how the body moves',
    '  - Plays guitar/piano → a card about how sound works, vibrations, or how ears hear',
    '  - Heritage food (cassava, jollof, rice and beans) → a card about how plants grow into food',
    'No more than 3 cards in the batch should use a personalization hook. The rest should be straightforward NGSS-aligned content.',
    '',
    'Nigel\u2019s interest profile:',
    interests || '(unknown — write neutral cards)',
    '',
    'OUTPUT FORMAT — strict JSON only, no markdown fences, no preamble:',
    '{ "items": [ { "topic": "...", "emoji": "...", "title": "...", "fact": "...", "question": "...", "choices": ["...","...","...","..."], "answer_index": N, "standard": "..." } ] }',
  ].join('\n');

  const user = [
    `Generate exactly ${target_count} new science fact-cards for Nigel.`,
    '',
    topicLine,
    '',
    'AVOID these existing card titles (vary the topic angle):',
    avoidTitles.length ? JSON.stringify(avoidTitles) : '(empty — first batch)',
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
      max_tokens: 3000,
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
