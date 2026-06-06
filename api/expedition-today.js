// /api/expedition-today
//
// Returns today's Explorer's Hall expedition + whether the requesting
// child has already stamped it.
//
// Path: GET /api/expedition-today?child_id=<uuid>
//   -> { ok, expedition_date, expedition, stamped, stamped_at, source }
//
// "source" is one of:
//   - "db"        : found a pre-generated row (cron-produced or seeded)
//   - "fallback"  : no row existed; generated one synchronously
//   - "fallback_failed": synthesis failed, returns canned safe default
//
// The fallback exists so a missed cron never leaves Nigel with a blank
// Explorer's Hall. It runs Haiku 4.5 inline (~6s, ~$0.005) and writes
// the result back to ha_expeditions before returning, so subsequent
// requests in the same day hit the DB path.

import { generateExpedition } from './_lib/expedition-generator.js';

const NIGEL_CHILD_ID = '2e0e51c5-f120-4152-8aa1-041eeecc8165';

async function callRpc(name, body) {
  const url = `${process.env.SUPABASE_URL}/rest/v1/rpc/${name}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body || {}),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`rpc ${name} ${r.status}: ${t.slice(0, 200)}`);
  }
  return r.json();
}

function nyDateISO() {
  // America/New_York date. Matches the SQL function's logic.
  const d = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d);
  const y = parts.find(p => p.type === 'year').value;
  const m = parts.find(p => p.type === 'month').value;
  const day = parts.find(p => p.type === 'day').value;
  return `${y}-${m}-${day}`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const childId = (req.query && req.query.child_id) || NIGEL_CHILD_ID;

  try {
    // 1. Fast path: read from DB.
    const today = await callRpc('ha_get_today_expedition', { p_child_id: childId });
    if (today && today.expedition) {
      return res.status(200).json({
        ok: true,
        source: 'db',
        expedition_date: today.expedition_date,
        expedition: today.expedition,
        stamped: !!today.stamped,
        stamped_at: today.stamped_at || null,
      });
    }

    // 2. Fallback: cron missed today. Generate inline.
    let recentThemes = [];
    let recentTopics = [];
    try {
      recentThemes = await callRpc('ha_get_recent_expedition_themes', { p_days: 14 });
    } catch (_) {}
    try {
      recentTopics = await callRpc('ha_get_recent_expedition_topics', { p_days: 60 });
    } catch (_) {}

    let generated;
    try {
      generated = await generateExpedition({
        recentThemes: Array.isArray(recentThemes) ? recentThemes : [],
        recentTopics: Array.isArray(recentTopics) ? recentTopics : [],
      });
    } catch (genErr) {
      // 3. Final fallback: canned safe default so the UI never breaks.
      return res.status(200).json({
        ok: true,
        source: 'fallback_failed',
        expedition_date: nyDateISO(),
        expedition: {
          expedition_date: nyDateISO(),
          theme: 'maryland_history',
          topic: 'Explorer\'s Hall',
          payload: cannedSafeExpedition(),
        },
        stamped: false,
        error: String(genErr).slice(0, 200),
      });
    }

    // Persist the generated expedition so the rest of the day hits the DB path.
    const persisted = await callRpc('ha_record_expedition', {
      p_expedition_date: nyDateISO(),
      p_theme: generated.theme,
      p_topic: generated.topic,
      p_payload: generated.payload,
      p_generated_by: 'haiku-4.5 (fallback)',
    });

    return res.status(200).json({
      ok: true,
      source: 'fallback',
      expedition_date: nyDateISO(),
      expedition: persisted.expedition,
      stamped: false,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: String(err).slice(0, 300),
    });
  }
}

function cannedSafeExpedition() {
  return {
    schema_version: 1,
    theme: 'maryland_history',
    topic: 'Explorer\'s Hall',
    hook: {
      text: 'Today the museum is taking a quiet day. Want to look back at one of your favorite stamps in your passport?',
      humphrey_event: 'expedition_hook',
    },
    discovery: {
      title: 'A Quiet Day at the Hall',
      subtitle: 'Take a moment to explore',
      illustration_kind: 'portrait_silhouette',
      intro: 'The museum is between exhibits today. While you wait, you can revisit the stamps you\'ve collected in your Explorer\'s Passport.',
      humphrey_event: 'expedition_discovery',
    },
    wonders: [],
    connection: {
      text: 'Even great explorers take rest days, Nigel. Your passport is full of places you\'ve already been.',
      humphrey_event: 'expedition_connection',
    },
    reflection: {
      prompt: '',
      fallback_question: null,
      humphrey_event: 'expedition_reflection',
    },
    completion: {
      stamp_label: '',
      stamp_subtitle: '',
      celebration_line: '',
    },
    location: null,
  };
}
