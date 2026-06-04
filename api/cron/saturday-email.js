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

// Emoji rendered in the premium "By zone" cards. Keep playful but not loud.
const ZONE_EMOJI = {
  'number-lab': '\u{1F522}',     // 🔢
  'word-tower': '\u{1F3DB}\uFE0F', // 🏛 (towering reading)
  'story-time': '\u{1F4D6}',     // 📖
  'discovery': '\u{1F52C}',      // 🔬
  'explorer': '\u{1F5FA}\uFE0F', // 🗺
  'writing': '\u270F\uFE0F',     // ✏️
  'hero-hall': '\u{1F3C6}',      // 🏆
};

// ElevenLabs voice + model for Ms. Humphrey's audio briefing.
const HUMPHREY_VOICE_ID = 'aNGh7D6DrhhIlad2U6Fg';   // Emory
const HUMPHREY_TTS_MODEL = 'eleven_flash_v2_5';

// Hero portrait used in the email header. Hot-linked from production —
// Gmail proxies images so the link survives forever even if we redeploy.
const HUMPHREY_PORTRAIT_URL = 'https://hero-academy-jemelike-6356s-projects.vercel.app/assets/humphrey/humphrey_base_512.png';

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

  // ---------- 4b. Generate audio briefing in Ms. Humphrey's voice ----------
  // ElevenLabs TTS → upload to Supabase Storage → embed link in email.
  // Wrapped in try/catch so audio failure (rate limit, transient outage,
  // storage upload error) never blocks the email from going out — the
  // parents still get the briefing, just without the audio player.
  let audio_url = null;
  let audio_status = 'skipped';
  const ELEVENLABS_KEY = process.env.ELEVENLABS_API_KEY;
  if (ELEVENLABS_KEY) {
    try {
      const weekTag = new Date().toISOString().slice(0, 10);
      const audioBytes = await synthesizeBriefingAudio({
        ELEVENLABS_KEY,
        text: briefingToSpeech(briefing),
      });
      audio_url = await uploadAudioToStorage({
        SB_URL,
        SB_KEY,
        weekTag,
        audioBytes,
      });
      audio_status = `ok (${audioBytes.byteLength} bytes)`;
    } catch (e) {
      audio_status = `failed: ${String(e && e.message || e).slice(0, 200)}`;
      // Do not return — proceed with email-without-audio.
    }
  } else {
    audio_status = 'no_elevenlabs_key';
  }

  const html = renderHtmlEmail({ briefing, data, audio_url });
  const text = renderTextEmail({ briefing, data, audio_url });
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
          // audio_url is null when generation/upload failed. Zapier-side
          // logic should treat null as "no attachment" and proceed.
          audio_url: audio_url,
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
    audio: audio_status,
    audio_url: audio_url,
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

  const [sessions, attempts, topicMastery, charUnlocks, topics, fridayQuiz, activeDirectives, recentDirectives] = await Promise.all([
    sb({ SB_URL, SB_KEY, path: `ha_sessions?${childFilter}&started_at=gte.${since}&order=started_at.asc&limit=500` }),
    sb({ SB_URL, SB_KEY, path: `ha_attempts?${childFilter}&attempted_at=gte.${since}&order=attempted_at.asc&limit=2000` }),
    sb({ SB_URL, SB_KEY, path: `ha_topic_mastery?${childFilter}&limit=200` }),
    sb({ SB_URL, SB_KEY, path: `ha_character_unlocks?${childFilter}&first_unlocked_at=gte.${since}&order=first_unlocked_at.asc&limit=50` }),
    sb({ SB_URL, SB_KEY, path: `ha_topics?select=id,title,subject,zone_id&limit=200` }),
    // Most recent Friday cumulative-quiz result within the past 7 days, if any.
    sb({ SB_URL, SB_KEY, path: `ha_friday_quiz_results?${childFilter}&taken_at=gte.${since}&order=taken_at.desc&limit=1` }).catch(() => []),
    // Build #5 v2: parent directives currently steering the experience.
    sb({ SB_URL, SB_KEY, path: `ha_parent_directives?${childFilter}&active=eq.true&order=created_at.desc&limit=20` }).catch(() => []),
    // Build #5 v2: every directive (active OR deactivated) created in the window — narrative context for Haiku.
    sb({ SB_URL, SB_KEY, path: `ha_parent_directives?${childFilter}&created_at=gte.${since}&order=created_at.desc&limit=30` }).catch(() => []),
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
    // Build #5 v2 — parent directives
    activeDirectives: Array.isArray(activeDirectives) ? activeDirectives : [],
    recentDirectives: Array.isArray(recentDirectives) ? recentDirectives : [],
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
    // Build #5 v2 — what Bianca/Josh asked you to do this week, via the parent co-pilot.
    parent_directives_this_week: (data.recentDirectives || []).map((d) => ({
      type: d.directive_type,
      payload: d.payload,
      by: d.created_by,
      created_at: d.created_at,
      still_active: d.active === true,
    })),
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
    'About parent directives (`parent_directives_this_week`):',
    '  - These are notes Bianca or Josh sent through the Parent Co-pilot. If any are present, acknowledge them in the "Looking ahead" section in one warm sentence (e.g. "I have Bianca\u2019s note about subtraction \u2014 I\u2019ll keep it on my radar Monday.").',
    '  - Do NOT mention parent directives in any other section.',
    '  - Do NOT quote `note_for_humphrey` text verbatim \u2014 paraphrase the intent.',
    '  - If `parent_directives_this_week` is empty, skip this entirely.',
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
  // Convert Haiku's markdown-ish output to safe simple HTML for the letter
  // body. Uses a warm serif (Georgia → fallback) to feel like a personal
  // letter. Wraps every paragraph in <font color="..."> AND repeats the
  // color in the inline style — Gmail's dark mode inverts CSS colors but
  // respects HTML4 <font> attributes, so this combination keeps the text
  // visible in both light and dark mode without forcing the whole email
  // into one scheme.
  const TEXT_COLOR = '#0a0b2e';   // very dark to maximize contrast
  const ACCENT = '#7c3aed';
  const para = escapeHtml(text)
    .split(/\n{2,}/)
    .map((p) => p.replace(/\n/g, '<br>').replace(/\*\*(.+?)\*\*/g, `<strong style="color:${ACCENT};font-weight:700;"><font color="${ACCENT}">$1</font></strong>`))
    .map((p) => `<p style="margin:0 0 14px 0;line-height:1.7;color:${TEXT_COLOR};font-family:Georgia,'Iowan Old Style','Charter',serif;font-size:16px;mso-line-height-rule:exactly;"><font color="${TEXT_COLOR}" face="Georgia, serif">${p}</font></p>`)
    .join('\n');
  return para;
}

function briefingToSpeech(text) {
  // Strip markdown markers and the sign-off so the TTS doesn't pronounce
  // "asterisk asterisk" or "em dash Ms. Humphrey". Light cleanup only.
  return String(text || '')
    .replace(/\*\*/g, '')
    .replace(/^\s*[-\u2014]\s*Ms\.?\s*Humphrey\s*$/im, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function renderHtmlEmail({ briefing, data, audio_url }) {
  const s = data.summary;
  const weekDate = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  // Stat-grid cells (4 colored cards). Inline-styled <td>s for max email
  // client compatibility — Outlook does not honor flexbox/grid. <font>
  // wrappers are HTML4 but Gmail respects them in dark mode (whereas it
  // can override CSS `color` properties), so we use both belt and suspenders.
  const statCard = (label, value, tint) => `
    <td bgcolor="${tint.bg2}" style="padding:6px;width:25%;text-align:center;">
      <div style="background:${tint.bg2};background-image:linear-gradient(135deg,${tint.bg1},${tint.bg2});border-radius:14px;padding:18px 6px;border:1px solid ${tint.border};">
        <div style="font-size:30px;font-weight:800;color:${tint.fg};line-height:1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;"><font color="${tint.fg}">${value}</font></div>
        <div style="font-size:11px;color:${tint.label};text-transform:uppercase;letter-spacing:1px;margin-top:6px;font-weight:700;"><font color="${tint.label}">${label}</font></div>
      </div>
    </td>`;
  const tints = {
    amber:  { bg1:'#fffbeb', bg2:'#fef3c7', border:'#fde68a', fg:'#b45309', label:'#78350f' },
    pink:   { bg1:'#fdf2f8', bg2:'#fce7f3', border:'#fbcfe8', fg:'#be185d', label:'#831843' },
    cyan:   { bg1:'#ecfeff', bg2:'#cffafe', border:'#a5f3fc', fg:'#0e7490', label:'#155e75' },
    green:  { bg1:'#f0fdf4', bg2:'#dcfce7', border:'#bbf7d0', fg:'#15803d', label:'#14532d' },
  };

  // Per-zone cards, sorted by time spent. Use a small emoji + label + 1-line
  // summary so the breakdown feels editorial, not spreadsheet-y.
  const zoneCards = Object.entries(data.byZone)
    .sort((a, b) => b[1].seconds - a[1].seconds)
    .map(([zoneId, v]) => {
      const acc = v.total_q > 0 ? Math.round((100 * v.correct_q) / v.total_q) + '% accuracy' : 'no graded items';
      const minutes = Math.round(v.seconds / 60);
      const emoji = ZONE_EMOJI[zoneId] || '\u2728';
      const label = escapeHtml(ZONE_LABELS[zoneId] || zoneId);
      const sub = `${v.sessions} session${v.sessions === 1 ? '' : 's'} \u00b7 ${minutes} min \u00b7 ${acc}`;
      return `
      <tr>
        <td style="padding:6px 0;">
          <table role="presentation" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="width:100%;background:#ffffff;border-radius:12px;border:1px solid #e9d5ff;border-collapse:separate;">
            <tr>
              <td style="padding:14px 16px;width:48px;font-size:26px;vertical-align:middle;">${emoji}</td>
              <td style="padding:14px 16px 14px 0;vertical-align:middle;">
                <div class="ha-text-dark" style="font-size:15px;font-weight:700;color:#0a0b2e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;"><font color="#0a0b2e">${label}</font></div>
                <div style="font-size:12px;color:#6b7280;margin-top:3px;"><font color="#6b7280">${sub}</font></div>
              </td>
            </tr>
          </table>
        </td>
      </tr>`;
    })
    .join('\n');

  // Audio player block — only rendered when ElevenLabs + Supabase upload
  // succeeded earlier. Falls back to nothing on failure (the briefing text
  // itself is the message; audio is the premium).
  const audioBlock = audio_url ? `
    <div style="margin:20px 0 0 0;padding:20px;background:linear-gradient(135deg,#1e1b4b 0%,#7c3aed 100%);border-radius:16px;text-align:center;">
      <div style="font-size:11px;color:#fbbf24;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:8px;font-weight:700;">\u{1F3A7} Listen to this week's briefing</div>
      <a href="${escapeHtml(audio_url)}" style="display:inline-block;background:#fff;color:#7c3aed;padding:14px 28px;border-radius:999px;font-weight:700;font-size:15px;text-decoration:none;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,0.2);">\u25B6\u00A0\u00A0Play Ms. Humphrey's voice note</a>
      <div style="font-size:12px;color:#c4b5fd;margin-top:10px;">Tap to listen in your browser.</div>
    </div>` : '';

  // Build #5 v2 — "From Bianca & Josh" section, rendered only when there's
  // at least one active directive. Mirrors directive type-to-label logic in
  // js/parent.js so the wording matches what parents see in the dashboard.
  const SKILL_LABELS_HTML = {
    'add_within_10':      'addition within 10',
    'add_within_20':      'addition within 20',
    'subtract_within_10': 'subtraction within 10',
    'subtract_within_20': 'subtraction within 20',
    'make_10':            'the make-a-10 strategy',
    'place_value':        'place value',
    'reading_fluency':    'reading fluency',
    'sight_words':        'sight words',
    'writing_sentences':  'writing sentences',
  };
  const QUEST_CAT_LABELS_HTML = {
    'counting':     'counting things',
    'color':        'spotting colors',
    'letter':       'finding letters',
    'observation':  'looking around',
    'show_and_tell':'show-and-tell with a photo',
  };
  function directiveLabel(d) {
    const p = d.payload || {};
    switch (d.directive_type) {
      case 'focus_skill':
        return 'Focus more on <strong>' + escapeHtml(SKILL_LABELS_HTML[p.skill] || p.skill || 'a skill') + '</strong>';
      case 'skip_zone_today':
        return 'Skip <strong>' + escapeHtml(ZONE_LABELS[p.zone] || p.zone || 'a zone') + '</strong> today';
      case 'request_quest_category':
        return 'Suggest a real-world quest about <strong>' + escapeHtml(QUEST_CAT_LABELS_HTML[p.category] || p.category || 'something specific') + '</strong>';
      case 'note_for_humphrey':
        return p.text ? '\u201C' + escapeHtml(String(p.text).slice(0, 240)) + '\u201D' : 'A note for Ms. Humphrey';
      default:
        return escapeHtml(d.directive_type);
    }
  }
  const directiveItems = (data.activeDirectives || [])
    .slice(0, 6)
    .map((d) => {
      const by = escapeHtml((d.created_by || 'parent').replace(/^./, (c) => c.toUpperCase()));
      return `
      <tr>
        <td style="padding:6px 0;">
          <table role="presentation" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="width:100%;background:#ffffff;border-radius:12px;border:1px solid #fbcfe8;border-collapse:separate;">
            <tr>
              <td style="padding:14px 16px;vertical-align:top;">
                <div style="font-size:11px;color:#be185d;text-transform:uppercase;letter-spacing:1.2px;margin-bottom:4px;font-weight:700;"><font color="#be185d">From ${by}</font></div>
                <div class="ha-text-dark" style="font-size:14px;color:#0a0b2e;line-height:1.5;"><font color="#0a0b2e">${directiveLabel(d)}</font></div>
              </td>
            </tr>
          </table>
        </td>
      </tr>`;
    })
    .join('\n');
  const directiveBlock = directiveItems ? `
        <!-- FROM BIANCA & JOSH (Build #5 v2) -->
        <tr><td bgcolor="#ffffff" style="padding:8px 24px 8px 24px;background:#ffffff;">
          <div class="ha-text-dark" style="margin:8px 4px 4px 4px;font-size:11px;color:#be185d;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;"><font color="#be185d">Notes from home this week</font></div>
          <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:separate;border-spacing:0;">
            ${directiveItems}
          </table>
        </td></tr>` : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>Hero Academy \u2014 Saturday Briefing</title>
<style>
  :root { color-scheme: light only; supported-color-schemes: light only; }
  /* Gmail dark-mode override: when Gmail wraps the email in [data-ogsc],
     it's running its color inversion. We re-pin our text colors so the
     letter stays readable on both themes. */
  u + .body [data-ogsc] .ha-text-dark { color: #0a0b2e !important; }
  [data-ogsc] .ha-text-dark { color: #0a0b2e !important; }
  [data-ogsc] .ha-letter-card { background-color: #fdf2f8 !important; }
</style>
</head>
<body class="body" style="margin:0;padding:0;background:#0a0b2e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0a0b2e;-webkit-text-size-adjust:100%;color-scheme:light only;supported-color-schemes:light only;">
  <div style="display:none;max-height:0;overflow:hidden;color:transparent;">Nigel\u2019s week in review from Ms. Humphrey \u2014 ${escapeHtml(weekDate)}.</div>
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#0a0b2e;">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 24px 60px rgba(10,11,46,0.45);">

        <!-- HERO BANNER -->
        <tr><td style="background:#1e1b4b;background-image:linear-gradient(135deg,#1e1b4b 0%,#7c3aed 35%,#ec4899 70%,#ff8b3d 100%);padding:36px 28px 80px 28px;text-align:center;color:#ffffff;">
          <div style="font-size:11px;letter-spacing:2.5px;text-transform:uppercase;opacity:0.85;margin-bottom:8px;font-weight:700;color:#ffffff;"><font color="#ffffff">\u{1F9B8}\u200D\u2640\uFE0F Hero Academy</font></div>
          <div style="font-size:22px;font-weight:700;letter-spacing:0.2px;color:#ffffff;"><font color="#ffffff">Saturday Briefing</font></div>
          <div style="font-size:14px;opacity:0.85;margin-top:4px;color:#ffffff;"><font color="#ffffff">${escapeHtml(weekDate)}</font></div>
        </td></tr>

        <!-- HUMPHREY PORTRAIT (overlaps banner) -->
        <tr><td bgcolor="#ffffff" style="text-align:center;padding:0 28px;background:#ffffff;">
          <img src="${HUMPHREY_PORTRAIT_URL}" width="120" height="120" alt="Ms. Humphrey" style="border-radius:50%;border:4px solid #ffffff;box-shadow:0 8px 24px rgba(124,58,237,0.35);margin-top:-60px;background:#ffffff;display:inline-block;">
          <div class="ha-text-dark" style="margin-top:14px;font-size:20px;font-weight:700;color:#0a0b2e;"><font color="#0a0b2e">From Ms. Humphrey</font></div>
          <div style="margin-top:2px;font-size:13px;color:#7c3aed;font-weight:600;"><font color="#7c3aed">Nigel\u2019s tutor</font></div>
        </td></tr>

        <!-- STATS GRID -->
        <tr><td bgcolor="#ffffff" style="padding:24px 16px 8px 16px;background:#ffffff;">
          <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:separate;">
            <tr>
              ${statCard('Minutes', s.total_minutes, tints.amber)}
              ${statCard('Sessions', s.sessions_total, tints.pink)}
              ${statCard('Accuracy', s.accuracy_pct + '%', tints.cyan)}
              ${statCard('Active days', s.days_active, tints.green)}
            </tr>
          </table>
        </td></tr>

        <!-- AUDIO PLAYER (if available) -->
        ${audio_url ? `<tr><td bgcolor="#ffffff" style="padding:0 28px;background:#ffffff;">${audioBlock}</td></tr>` : ''}

        <!-- LETTER -->
        <tr><td bgcolor="#ffffff" style="padding:28px 28px 8px 28px;background:#ffffff;">
          <div class="ha-letter-card" style="border-left:4px solid #ec4899;padding:18px 22px;background:#fdf2f8;border-radius:0 12px 12px 0;">
            ${briefingToHtml(briefing)}
          </div>
        </td></tr>

        ${directiveBlock}

        ${zoneCards ? `
        <!-- BY ZONE -->
        <tr><td bgcolor="#ffffff" style="padding:8px 24px 8px 24px;background:#ffffff;">
          <div class="ha-text-dark" style="margin:8px 4px 4px 4px;font-size:11px;color:#7c3aed;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;"><font color="#7c3aed">By zone this week</font></div>
          <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:separate;border-spacing:0;">
            ${zoneCards}
          </table>
        </td></tr>` : ''}

        <!-- FOOTER -->
        <tr><td bgcolor="#faf8ff" style="padding:28px 28px 36px 28px;background:#faf8ff;border-top:1px solid #ede9fe;">
          <p class="ha-text-dark" style="margin:0 0 14px 0;font-size:14px;color:#4c1d95;line-height:1.6;text-align:center;font-weight:500;"><font color="#4c1d95">
            Reply with anything you\u2019d like me to focus on next week.<br>
            I\u2019ll keep an eye on Nigel and let you know how it goes.
          </font></p>
          <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;letter-spacing:0.5px;"><font color="#9ca3af">
            Hero Academy \u00B7 Week ending ${escapeHtml(weekDate)}
          </font></p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function renderTextEmail({ briefing, data, audio_url }) {
  const s = data.summary;
  const lines = [
    'HERO ACADEMY \u2014 Saturday Briefing for Nigel',
    `Week ending ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`,
    '',
    `Sessions: ${s.sessions_total}   Minutes: ${s.total_minutes}   Accuracy: ${s.accuracy_pct}%   Active days: ${s.days_active}`,
    '',
  ];
  if (audio_url) {
    lines.push('Listen to this week\u2019s voice note:', audio_url, '');
  }
  lines.push(briefing, '');

  // Build #5 v2 — parent directives currently active.
  const directives = data.activeDirectives || [];
  if (directives.length > 0) {
    lines.push('NOTES FROM HOME THIS WEEK');
    directives.slice(0, 6).forEach((d) => {
      const p = d.payload || {};
      const by = (d.created_by || 'parent').replace(/^./, (c) => c.toUpperCase());
      let txt = '';
      switch (d.directive_type) {
        case 'focus_skill':
          txt = 'Focus more on ' + (p.skill || 'a skill').replace(/_/g, ' ') + '.'; break;
        case 'skip_zone_today':
          txt = 'Skip ' + (p.zone || 'a zone') + ' today.'; break;
        case 'request_quest_category':
          txt = 'Suggest a quest about ' + (p.category || 'something specific') + '.'; break;
        case 'note_for_humphrey':
          txt = p.text ? '\u201C' + String(p.text).slice(0, 200) + '\u201D' : 'Note for Ms. Humphrey'; break;
        default: txt = d.directive_type;
      }
      lines.push('  - From ' + by + ': ' + txt);
    });
    lines.push('');
  }

  lines.push('\u2014', 'Reply to this email to send Ms. Humphrey notes about Nigel\u2019s focus areas.');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// ElevenLabs TTS + Supabase Storage upload (Ms. Humphrey audio briefing)
// ---------------------------------------------------------------------------

async function synthesizeBriefingAudio({ ELEVENLABS_KEY, text }) {
  // POST to ElevenLabs and get an MP3 ArrayBuffer back. We use the flash
  // model for fast generation and lower cost — a ~1000-char briefing
  // generates in ~3-5s and costs about $0.05/1k chars.
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${HUMPHREY_VOICE_ID}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': ELEVENLABS_KEY,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text: text,
      model_id: HUMPHREY_TTS_MODEL,
      voice_settings: {
        stability: 0.55,
        similarity_boost: 0.75,
        style: 0.20,        // a touch of warmth, not robotic
        use_speaker_boost: true,
      },
    }),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`elevenlabs ${r.status}: ${body.slice(0, 200)}`);
  }
  const buf = await r.arrayBuffer();
  if (!buf || buf.byteLength < 1000) {
    throw new Error(`elevenlabs returned suspiciously small audio (${buf ? buf.byteLength : 0} bytes)`);
  }
  return buf;
}

async function uploadAudioToStorage({ SB_URL, SB_KEY, weekTag, audioBytes }) {
  // Upload to the `humphrey-audio` bucket (must exist + be public). The
  // service-role key bypasses RLS so this works without a write policy.
  // File path uses the week-ending date so each Saturday gets its own file
  // and we can re-run safely (upsert=true).
  const path = `briefing-${weekTag}.mp3`;
  const url = `${SB_URL}/storage/v1/object/humphrey-audio/${path}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'audio/mpeg',
      'x-upsert': 'true',         // overwrite if file already exists
      'Cache-Control': 'public, max-age=2592000', // 30 days
    },
    body: audioBytes,
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`supabase storage ${r.status}: ${body.slice(0, 200)}`);
  }
  // Public URL format for Supabase Storage. The bucket must be marked
  // `public=true` (handled by migration ha_humphrey_audio_bucket).
  return `${SB_URL}/storage/v1/object/public/humphrey-audio/${path}`;
}
