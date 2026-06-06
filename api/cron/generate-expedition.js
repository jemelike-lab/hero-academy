// /api/cron/generate-expedition
//
// Runs nightly at 08:30 UTC (≈ 3:30–4:30am ET) via Vercel cron.
// Generates the expedition for "today" in America/New_York and upserts
// it into ha_expeditions. By the time Nigel opens Explorer's Hall in
// the morning, the row is waiting.
//
// Auth: accepts Vercel's `x-vercel-cron: 1` header OR
//       Authorization: Bearer ${CRON_SECRET}  (for manual seeds & retries)
//
// Query params (optional):
//   ?date=YYYY-MM-DD   Override target date (defaults to today in NY)
//   ?force_theme=name  Skip rotation, use a specific theme
//   ?dry=1             Generate and validate but DON'T write to DB

import { generateExpedition, THEMES } from '../_lib/expedition-generator.js';

function nyDateISO() {
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

function isAuthorized(req) {
  if (req.headers['x-vercel-cron'] === '1') return true;
  const auth = req.headers['authorization'] || req.headers['Authorization'];
  if (auth && process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) return true;
  return false;
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  const t0 = Date.now();
  const targetDate = (req.query && req.query.date) || nyDateISO();
  const forceTheme = (req.query && req.query.force_theme) || null;
  const dryRun = req.query && req.query.dry === '1';

  if (forceTheme && !THEMES[forceTheme]) {
    return res.status(400).json({ ok: false, error: `unknown theme: ${forceTheme}`, known: Object.keys(THEMES) });
  }

  try {
    // Gather no-repeat context.
    let recentThemes = [];
    let recentTopics = [];
    try { recentThemes = await callRpc('ha_get_recent_expedition_themes', { p_days: 14 }); } catch (e) { /* tolerated */ }
    try { recentTopics = await callRpc('ha_get_recent_expedition_topics', { p_days: 60 }); } catch (e) { /* tolerated */ }

    const generated = await generateExpedition({
      recentThemes: Array.isArray(recentThemes) ? recentThemes : [],
      recentTopics: Array.isArray(recentTopics) ? recentTopics : [],
      forceTheme,
    });

    if (dryRun) {
      return res.status(200).json({
        ok: true,
        dry_run: true,
        elapsed_ms: Date.now() - t0,
        target_date: targetDate,
        theme: generated.theme,
        topic: generated.topic,
        payload: generated.payload,
      });
    }

    const persisted = await callRpc('ha_record_expedition', {
      p_expedition_date: targetDate,
      p_theme: generated.theme,
      p_topic: generated.topic,
      p_payload: generated.payload,
      p_generated_by: 'haiku-4.5 (cron)',
    });

    return res.status(200).json({
      ok: true,
      elapsed_ms: Date.now() - t0,
      target_date: targetDate,
      theme: generated.theme,
      topic: generated.topic,
      stored_id: persisted?.expedition?.id || null,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      elapsed_ms: Date.now() - t0,
      error: String(err).slice(0, 400),
    });
  }
}
