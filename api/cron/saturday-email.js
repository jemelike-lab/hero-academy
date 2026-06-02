/**
 * Hero Academy — Saturday morning parent email cron.
 *
 * Schedule (vercel.json):  0 12 * * 6   (Saturday 12:00 UTC = 7am EST / 8am EDT)
 *
 * Pipeline:
 *   1. Verify Bearer ${CRON_SECRET} (Vercel cron auto-attaches when scheduled)
 *   2. Pull the last 7 days of data from Supabase:
 *        - ha_sessions  (zones visited, time spent, pass rate)
 *        - ha_attempts  (problems attempted, struggles vs wins)
 *        - ha_topic_mastery / ha_topics  (what was mastered)
 *        - ha_character_unlocks
 *   3. Call Claude Haiku to draft a parent-voice briefing (Ms. Humphrey
 *      narrating Nigel's week to Bianca + Josh).
 *   4. POST { to, subject, html, text } to ZAPIER_WEBHOOK_URL — Josh's Zap
 *      catches that hook and sends from his Gmail.
 *
 * Manual testing:
 *   curl -X GET 'https://.../api/cron/saturday-email?dry_run=1' \
 *        -H 'Authorization: Bearer YOUR_CRON_SECRET'
 *   (dry_run skips the Zapier POST; the rendered HTML is in the JSON response)
 *
 * Env vars required:
 *   CRON_SECRET                  — bearer token Vercel attaches; also gates manual triggers
 *   SUPABASE_URL                 — https://yofqeuguxgujgqnaejmw.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY    — service_role JWT (server-only; do NOT expose)
 *   ANTHROPIC_API_KEY            — same key the Humphrey endpoints use
 *   ZAPIER_WEBHOOK_URL           — Catch Hook URL from the Saturday-Email Zap
 *   PARENT_EMAILS                — comma-separated, e.g. "bianca.parker92@gmail.com,jemelike@gmail.com"
 *                                  Defaults to those two if unset.
 */

const NIGEL_ID = '2e0e51c5-f120-4152-8aa1-041eeecc8165';
const DEFAULT_RECIPIENTS = 'bianca.parker92@gmail.com,jemelike@gmail.com';
const HAIKU_MODEL = 'claude-haiku-4-5';
const ZONE_LABELS = {
  'number-lab': 'Number Lab (Math)',
  'word-tower': 'Word Tower (Reading)',
  'story-time': 'Story Time (Read-Aloud)',
  'discovery': 'Discovery Dome (Science)',
  'explorer': 'Explorer\u2019s Hall (Social Studies)',
  'writing': 'Story Lab (Writing)',
  'hero-hall': 'Hero Hall',
};

export default async function handler(req, res) {
  // ---------- 1. Auth ----------
  const auth = req.headers.authorization || '';
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return res.status(500).json({ error: 'CRON_SECRET not configured' });
  }
  if (auth !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const dryRun = String(req.query.dry_run || '') === '1';
  const skipSend = dryRun || String(req.query.skip_send || '') === '1';

  // ---------- 2. Required server env ----------
  const SB_URL = process.env.SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  const ZAP_URL = process.env.ZAPIER_WEBHOOK_URL;
  if (!SB_URL || !SB_KEY) {
    return res.status(500).json({ error: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing' });
  }
  if (!ANTHROPIC_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY missing' });
  }
  if (!skipSend && !ZAP_URL) {
    return res.status(500).json({ error: 'ZAPIER_WEBHOOK_URL missing (or pass ?dry_run=1)' });
  }

  // ---------- 3. Pull week's data ----------
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  let data;
  try {
    data = await pullWeek({ SB_URL, SB_KEY, since });
  } catch (e) {
    return res.status(500).json({ error: 'supabase fetch failed', detail: String(e && e.message || e) });
  }

  // ---------- 4. Generate briefing via Claude Haiku ----------
  // If Nigel didn't open the app this week, skip Haiku entirely and use the
  // deterministic copy. Haiku tends to invent "we missed our session" /
  // "let's reconnect next week" tutor-appointment language for empty weeks;
  // the fallback frames it correctly ("didn't log in; app is ready when he is").
  let briefing;
  if (data.summary.sessions_total === 0) {
    briefing = renderFallbackBriefing(data);
  } else {
    try {
      briefing = await draftBriefing({ ANTHROPIC_KEY, data });
    } catch (e) {
      // Fall back to a deterministic plain-English summary if Haiku errors.
      briefing = renderFallbackBriefing(data);
    }
  }

  const html = renderHtmlEmail({ briefing, data });
  const text = renderTextEmail({ briefing, data });
  const subject = subjectLine({ data });
  const to = (process.env.PARENT_EMAILS || DEFAULT_RECIPIENTS).trim();

  // ---------- 5. Send via Zapier webhook (unless dry run) ----------
  let zapierStatus = 'skipped';
  if (!skipSend) {
    try {
      const r = await fetch(ZAP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: to,
          subject: subject,
          html: html,
          text: text,
          reply_to: 'jemelike@gmail.com',
          kid_name: 'Nigel',
          week_ending: new Date().toISOString().slice(0, 10),
        }),
      });
      zapierStatus = r.ok ? `ok (${r.status})` : `failed (${r.status})`;
      if (!r.ok) {
        const errBody = await r.text().catch(() => '');
        return res.status(502).json({
          error: 'zapier webhook rejected',
          status: r.status,
          body: errBody.slice(0, 500),
        });
      }
    } catch (e) {
      return res.status(502).json({ error: 'zapier webhook fetch failed', detail: String(e && e.message || e) });
    }
  }

  return res.status(200).json({
    ok: true,
    dry_run: dryRun,
    zapier: zapierStatus,
    to: to,
    subject: subject,
    counts: {
      sessions: data.sessions.length,
      attempts: data.attempts.length,
      topics_mastered_this_week: data.masteredThisWeek.length,
      characters_unlocked_this_week: data.newCharacters.length,
    },
    html_preview: dryRun ? html : undefined,
  });
}

// ---------------------------------------------------------------------------
// Supabase data fetch
// ---------------------------------------------------------------------------

async function sb({ SB_URL, SB_KEY, path, headers }) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      Accept: 'application/json',
      ...(headers || {}),
    },
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`supabase ${path} -> ${r.status} ${body.slice(0, 200)}`);
  }
  return r.json();
}

async function pullWeek({ SB_URL, SB_KEY, since }) {
  const childFilter = `child_id=eq.${NIGEL_ID}`;

  const [sessions, attempts, topicMastery, charUnlocks, topics, fridayQuiz] = await Promise.all([
    sb({ SB_URL, SB_KEY, path: `ha_sessions?${childFilter}&started_at=gte.${since}&order=started_at.asc&limit=500` }),
    sb({ SB_URL, SB_KEY, path: `ha_attempts?${childFilter}&attempted_at=gte.${since}&order=attempted_at.asc&limit=2000` }),
    sb({ SB_URL, SB_KEY, path: `ha_topic_mastery?${childFilter}&limit=200` }),
    sb({ SB_URL, SB_KEY, path: `ha_character_unlocks?${childFilter}&first_unlocked_at=gte.${since}&order=first_unlocked_at.asc&limit=50` }),
    sb({ SB_URL, SB_KEY, path: `ha_topics?select=id,title,subject,zone_id&limit=200` }),
    // Most recent Friday cumulative-quiz result within the past 7 days, if any.
    sb({ SB_URL, SB_KEY, path: `ha_friday_quiz_results?${childFilter}&taken_at=gte.${since}&order=taken_at.desc&limit=1` }).catch(() => []),
  ]);

  const topicMap = {};
  topics.forEach((t) => { topicMap[t.id] = t; });

  // Per-zone roll-up
  const byZone = {};
  for (const s of sessions) {
    const z = s.zone_id || 'unknown';
    if (!byZone[z]) byZone[z] = { sessions: 0, completed: 0, passed: 0, total_q: 0, correct_q: 0, seconds: 0 };
    byZone[z].sessions += 1;
    if (s.completed) byZone[z].completed += 1;
    if (s.passed) byZone[z].passed += 1;
    byZone[z].total_q += s.questions_total || 0;
    byZone[z].correct_q += s.questions_correct || 0;
    byZone[z].seconds += s.duration_seconds || 0;
  }

  // Topics mastered THIS WEEK (mastered_at within window)
  const masteredThisWeek = topicMastery
    .filter((m) => m.mastered_at && m.mastered_at >= since)
    .map((m) => ({
      topic_id: m.topic_id,
      title: (topicMap[m.topic_id] && topicMap[m.topic_id].title) || m.topic_id,
      subject: (topicMap[m.topic_id] && topicMap[m.topic_id].subject) || null,
      best_percent: m.best_percent,
      mastered_at: m.mastered_at,
    }));

  // Struggle list: topics with sessions but <50% best_percent OR
  // topic-level attempt accuracy below 60% with at least 4 attempts.
  const attemptsByTopic = {};
  for (const a of attempts) {
    const t = a.topic_id || 'untopiced';
    if (!attemptsByTopic[t]) attemptsByTopic[t] = { n: 0, correct: 0 };
    attemptsByTopic[t].n += 1;
    if (a.correct) attemptsByTopic[t].correct += 1;
  }
  const struggles = Object.entries(attemptsByTopic)
    .filter(([t, v]) => v.n >= 4 && v.correct / v.n < 0.6 && t !== 'untopiced')
    .map(([t, v]) => ({
      topic_id: t,
      title: (topicMap[t] && topicMap[t].title) || t,
      subject: (topicMap[t] && topicMap[t].subject) || null,
      attempts: v.n,
      accuracy: Math.round((100 * v.correct) / v.n),
    }))
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 5);

  const totalSeconds = Object.values(byZone).reduce((sum, z) => sum + z.seconds, 0);
  const totalAttempts = attempts.length;
  const totalCorrect = attempts.filter((a) => a.correct).length;
  const accuracyPct = totalAttempts > 0 ? Math.round((100 * totalCorrect) / totalAttempts) : 0;

  return {
    since,
    sessions,
    attempts,
    byZone,
    masteredThisWeek,
    struggles,
    newCharacters: charUnlocks.map((c) => c.character_id),
    fridayQuiz: Array.isArray(fridayQuiz) && fridayQuiz.length > 0 ? fridayQuiz[0] : null,
    summary: {
      sessions_total: sessions.length,
      total_minutes: Math.round(totalSeconds / 60),
      total_attempts: totalAttempts,
      accuracy_pct: accuracyPct,
      zones_visited: Object.keys(byZone),
      days_active: new Set(sessions.map((s) => (s.started_at || '').slice(0, 10))).size,
    },
  };
}

// ---------------------------------------------------------------------------
// Claude Haiku — parent briefing
// ---------------------------------------------------------------------------

async function draftBriefing({ ANTHROPIC_KEY, data }) {
  // Build a compact, factual summary for Haiku.  Haiku is the writer; the
  // structured numbers come from us.
  const fq = data.fridayQuiz;
  const fridayQuizFact = fq ? {
    taken_at: fq.taken_at,
    items_total: fq.items_total,
    items_correct: fq.items_correct,
    retention_pct: fq.items_total > 0
      ? Math.round((100 * fq.items_correct) / fq.items_total) : null,
    per_zone_breakdown: fq.per_zone_breakdown || null,
    weak_areas: fq.weak_areas || null,
  } : null;

  const factSheet = JSON.stringify({
    week_ending: new Date().toISOString().slice(0, 10),
    summary: data.summary,
    by_zone: Object.entries(data.byZone).map(([zone_id, v]) => ({
      zone: ZONE_LABELS[zone_id] || zone_id,
      sessions: v.sessions,
      minutes: Math.round(v.seconds / 60),
      accuracy_pct: v.total_q > 0 ? Math.round((100 * v.correct_q) / v.total_q) : null,
      sessions_passed: v.passed,
    })),
    mastered_this_week: data.masteredThisWeek.map((m) => ({ title: m.title, subject: m.subject })),
    struggles: data.struggles.map((s) => ({ title: s.title, accuracy: s.accuracy })),
    new_characters_unlocked: data.newCharacters,
    friday_quiz: fridayQuizFact,
  }, null, 2);

  const systemPrompt = [
    'You are Ms. Humphrey, Nigel\u2019s warm, observant homeschool tutor (Indian, late 40s, navy cardigan, patient teacher).',
    'You are writing a short Saturday-morning email to Nigel\u2019s parents, Bianca and Josh.',
    'Nigel is 7, in 2nd grade, in Maryland. Faith is a quiet part of family life \u2014 mention it only if it surfaces naturally.',
    '',
    'IMPORTANT \u2014 your scope of awareness:',
    '  - You are the in-app tutor. You only interact with Nigel when he opens Hero Academy.',
    '  - You do NOT schedule sessions with him. There are no appointments to miss.',
    '  - A low-engagement week means he opened the app less, not that he skipped meetings.',
    '  - Never use language like "we didn\u2019t meet", "missed our session", "reconnect", or "reschedule". Frame any quiet stretch as a gentle nudge to open the app again.',
    '',
    'About retention data:',
    '  - If `friday_quiz` is present in the data, it is the AUTHORITATIVE retention number for the week.',
    '  - Phrase the result naturally, e.g. "Nigel retained 8 of 10 things from this week" or "his Friday brain-check landed at 80%".',
    '  - If `friday_quiz.weak_areas` is non-empty, name them in the struggles section.',
    '  - If `friday_quiz` is null, just don\u2019t mention retention \u2014 don\u2019t make up a number.',
    '',
    'Voice and structure:',
    '  - Warm but specific. Lead with one real win from the week.',
    '  - 4 short sections, in this order:',
    '      1. \"What went well this week\"  (2\u20133 sentences \u2014 cite a real number; if friday_quiz exists, the retention pct is a great number to lead with)',
    '      2. \"Where he struggled\"        (1\u20132 sentences \u2014 specific topic, not vague)',
    '      3. \"Suggested 5-minute weekend boost\"  (one concrete activity Bianca/Josh can do)',
    '      4. \"Looking ahead\"             (one sentence about next week\u2019s focus)',
    '  - Write in plain English to parents \u2014 NOT to Nigel.',
    '  - Refer to Nigel by name. Sign off as \"\u2014 Ms. Humphrey\".',
    '  - Output ONLY the email body. No subject line, no greeting boilerplate, no preamble.',
    '  - If a section has no data (e.g. zero struggles found), say so honestly in one short line rather than inventing.',
  ].join('\n');

  const userPrompt = [
    'Here is Nigel\u2019s data for the past 7 days. Numbers are exact \u2014 do not invent any.',
    '',
    '```json',
    factSheet,
    '```',
    '',
    'Write the email body now.',
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
      max_tokens: 800,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`anthropic ${r.status}: ${body.slice(0, 200)}`);
  }
  const json = await r.json();
  const text = (json.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
  if (!text) throw new Error('empty briefing from haiku');
  return text;
}

function renderFallbackBriefing(data) {
  // Deterministic backup if Claude is down. Plain prose, no bullets.
  const s = data.summary;
  if (s.sessions_total === 0) {
    return [
      'Quiet week at Hero Academy \u2014 Nigel didn\u2019t log a learning session over the past 7 days.',
      'No worries; the app is ready when he is. A 10-minute Word Tower or Number Lab session on Saturday or Sunday would get him back in the rhythm.',
      '',
      '\u2014 Ms. Humphrey',
    ].join('\n');
  }
  const parts = [];
  parts.push(`Nigel showed up to Hero Academy ${s.days_active} day${s.days_active === 1 ? '' : 's'} this week, putting in about ${s.total_minutes} minutes across ${s.sessions_total} session${s.sessions_total === 1 ? '' : 's'}, with overall accuracy at ${s.accuracy_pct}%.`);
  if (data.masteredThisWeek.length > 0) {
    parts.push(`Big news: he mastered ${data.masteredThisWeek.map((m) => `\u201c${m.title}\u201d`).join(', ')} this week.`);
  }
  if (data.struggles.length > 0) {
    parts.push(`He worked hard on ${data.struggles[0].title} but landed at ${data.struggles[0].accuracy}% \u2014 a great target for a short weekend review.`);
  }
  if (data.newCharacters.length > 0) {
    parts.push(`He also unlocked: ${data.newCharacters.join(', ')}.`);
  }
  parts.push('\n\u2014 Ms. Humphrey');
  return parts.join('\n\n');
}

// ---------------------------------------------------------------------------
// Email rendering
// ---------------------------------------------------------------------------

function subjectLine({ data }) {
  const d = new Date();
  const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const s = data.summary;
  if (s.sessions_total === 0) return `Hero Academy \u2014 Quiet week for Nigel (${dateStr})`;
  return `Hero Academy \u2014 Nigel\u2019s week: ${s.total_minutes} min, ${s.accuracy_pct}% accuracy (${dateStr})`;
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function briefingToHtml(text) {
  // Convert Haiku\u2019s markdown-ish output to safe simple HTML.
  // Supports: ** ** bold, line breaks, paragraphs.
  const para = escapeHtml(text)
    .split(/\n{2,}/)
    .map((p) => p.replace(/\n/g, '<br>').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>'))
    .map((p) => `<p style="margin:0 0 16px 0;line-height:1.6;color:#1f2937;">${p}</p>`)
    .join('\n');
  return para;
}

function renderHtmlEmail({ briefing, data }) {
  const s = data.summary;
  const zoneRows = Object.entries(data.byZone)
    .sort((a, b) => b[1].seconds - a[1].seconds)
    .map(([zoneId, v]) => {
      const acc = v.total_q > 0 ? Math.round((100 * v.correct_q) / v.total_q) + '%' : '\u2014';
      return `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;">${escapeHtml(ZONE_LABELS[zoneId] || zoneId)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;">${v.sessions}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;">${Math.round(v.seconds / 60)} min</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;">${acc}</td>
      </tr>`;
    })
    .join('\n');

  return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Hero Academy \u2014 Saturday Briefing</title></head>
<body style="margin:0;padding:0;background:#fafaf7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1f2937;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">
    <div style="background:linear-gradient(135deg,#ffd147 0%,#ff8b3d 100%);padding:24px;border-radius:16px 16px 0 0;text-align:center;">
      <h1 style="margin:0;font-size:24px;color:#0f172a;">\ud83e\uddb8\u200d\u2640\ufe0f Hero Academy</h1>
      <p style="margin:8px 0 0 0;color:#0f172a;font-size:14px;font-weight:600;">Saturday Briefing \u2014 Nigel</p>
    </div>
    <div style="background:#ffffff;padding:24px;border-radius:0 0 16px 16px;border:1px solid #e2e8f0;border-top:none;">
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px;">
        <span style="background:#f1f5f9;padding:6px 12px;border-radius:999px;font-size:13px;color:#475569;"><strong>${s.sessions_total}</strong> sessions</span>
        <span style="background:#f1f5f9;padding:6px 12px;border-radius:999px;font-size:13px;color:#475569;"><strong>${s.total_minutes}</strong> minutes</span>
        <span style="background:#f1f5f9;padding:6px 12px;border-radius:999px;font-size:13px;color:#475569;"><strong>${s.accuracy_pct}%</strong> accuracy</span>
        <span style="background:#f1f5f9;padding:6px 12px;border-radius:999px;font-size:13px;color:#475569;"><strong>${s.days_active}</strong> active days</span>
      </div>
      ${briefingToHtml(briefing)}
      ${zoneRows ? `
      <h3 style="margin:24px 0 8px 0;font-size:15px;color:#475569;text-transform:uppercase;letter-spacing:0.5px;">By zone</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead>
          <tr style="text-align:left;color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">
            <th style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">Zone</th>
            <th style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;">Sessions</th>
            <th style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;">Time</th>
            <th style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;">Accuracy</th>
          </tr>
        </thead>
        <tbody>${zoneRows}</tbody>
      </table>` : ''}
      <p style="margin:24px 0 0 0;font-size:12px;color:#94a3b8;text-align:center;">
        Generated for ${escapeHtml(new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }))}.<br>
        Reply to this email to send Ms. Humphrey notes about Nigel\u2019s focus areas.
      </p>
    </div>
  </div>
</body>
</html>`;
}

function renderTextEmail({ briefing, data }) {
  const s = data.summary;
  const lines = [
    'HERO ACADEMY \u2014 Saturday Briefing for Nigel',
    `Week ending ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`,
    '',
    `Sessions: ${s.sessions_total}   Minutes: ${s.total_minutes}   Accuracy: ${s.accuracy_pct}%   Active days: ${s.days_active}`,
    '',
    briefing,
    '',
    '\u2014',
    'Reply to this email to send Ms. Humphrey notes about Nigel\u2019s focus areas.',
  ];
  return lines.join('\n');
}
