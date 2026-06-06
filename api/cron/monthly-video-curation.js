/**
 * Hero Academy — Monthly Music Video Theater auto-curation cron.
 *
 * Schedule (vercel.json):  0 13 1 * *   (1st of each month, 13:00 UTC = 8am EST / 9am EDT)
 *
 * Pipeline:
 *   1. Verify Bearer ${CRON_SECRET} (Vercel cron auto-attaches when scheduled).
 *   2. Fetch the current data/sound-stage.js from main so Haiku knows what's
 *      already in the library (no duplicate suggestions).
 *   3. Call Claude Haiku with the existing catalog + approved channels and ask
 *      for 6-8 new song-as-life-skills suggestions for Nigel (age 7).
 *      Haiku is told to NOT include YouTube IDs (it hallucinates them) — it
 *      supplies title + channel + skill taught + a search query Josh will use
 *      to verify the actual video.
 *   4. Render an HTML email with each suggestion as a card containing:
 *        • title + channel + skill + why it matters
 *        • a YouTube search URL (Josh clicks → finds the video → copies the ID)
 *        • a paste-ready JSON code block with youtubeId: 'PASTE_ID_HERE'
 *      Josh reviews, swaps PASTE_ID_HERE for the real ID, pastes into
 *      data/sound-stage.js, and ships v__.
 *   5. POST { to, subject, html, text } to ZAPIER_WEBHOOK_URL (existing Zap).
 *
 * Manual testing (without sending):
 *   curl 'https://hero-academy-jemelike-6356s-projects.vercel.app/api/cron/monthly-video-curation?dry_run=1' \
 *        -H 'Authorization: Bearer YOUR_CRON_SECRET'
 *
 * Env vars (all already exist for saturday-email):
 *   CRON_SECRET                  — bearer token Vercel attaches
 *   ANTHROPIC_API_KEY            — same key the Humphrey endpoints use
 *   ZAPIER_WEBHOOK_URL           — Catch Hook URL from the email Zap
 *   PARENT_EMAILS  (optional)    — comma-separated; defaults to the two below
 *
 * Phase 2 (next session): replace email-paste with a parent-dashboard page
 *   that shows pending suggestions as tappable cards, writes approvals to
 *   a Supabase ha_video_library table, and has the frontend read from there.
 */

const DEFAULT_RECIPIENTS = 'bianca.parker92@gmail.com,jemelike@gmail.com';
const HAIKU_MODEL = 'claude-haiku-4-5';
const HUMPHREY_PORTRAIT_URL = 'https://hero-academy-jemelike-6356s-projects.vercel.app/assets/humphrey/humphrey_base_512.png';
const REPO_DATA_URL = 'https://raw.githubusercontent.com/jemelike-lab/hero-academy/main/data/sound-stage.js';

// Channels Haiku is allowed to suggest videos from. Adding to this list is a
// deliberate parental decision — never expand it from inside the model.
const APPROVED_CHANNELS = [
  'PBS Kids',
  'Sesame Street',
  'Sesame Workshop',
  "Daniel Tiger's Neighborhood (PBS / Fred Rogers Productions)",
  'Super Simple Songs (when partnered with Sesame Workshop)',
];

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
  const debugReturn = String(req.query.debug || '') === '1';

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  const ZAP_URL = process.env.ZAPIER_WEBHOOK_URL;
  if (!ANTHROPIC_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY missing' });
  }
  if (!skipSend && !ZAP_URL) {
    return res.status(500).json({ error: 'ZAPIER_WEBHOOK_URL missing (or pass ?dry_run=1)' });
  }

  // ---------- 2. Pull current library so Haiku doesn't duplicate ----------
  let currentLibrarySummary;
  try {
    currentLibrarySummary = await fetchCurrentLibrary();
  } catch (e) {
    return res.status(500).json({ error: 'library fetch failed', detail: String(e && e.message || e) });
  }

  // ---------- 3. Call Haiku for suggestions ----------
  let suggestions;
  try {
    suggestions = await haikuSuggest({ ANTHROPIC_KEY, currentLibrarySummary });
  } catch (e) {
    return res.status(500).json({ error: 'haiku call failed', detail: String(e && e.message || e) });
  }

  if (!Array.isArray(suggestions) || suggestions.length === 0) {
    return res.status(500).json({ error: 'haiku returned no suggestions', currentLibrarySummary });
  }

  // ---------- 4. Render email ----------
  const monthName = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const subject = `🎵 ${monthName} — ${suggestions.length} new video picks for the Sound Stage`;
  const html = renderHtml({ monthName, suggestions, currentLibrarySummary });
  const text = renderText({ monthName, suggestions });

  // ---------- 5. Send via Zapier ----------
  const to = process.env.PARENT_EMAILS || DEFAULT_RECIPIENTS;
  let zapierStatus = 'skipped';
  if (!skipSend) {
    try {
      const r = await fetch(ZAP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to,
          subject,
          html,
          text,
          reply_to: 'jemelike@gmail.com',
          kid_name: 'Nigel',
          // Distinct from saturday-email's week_ending; useful in Zapier routing
          // if Josh wants different filters per cron.
          digest_type: 'monthly-video-curation',
          month_key: new Date().toISOString().slice(0, 7),  // 2026-06
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
      return res.status(502).json({ error: 'zapier post threw', detail: String(e && e.message || e) });
    }
  }

  // ---------- 6. Respond ----------
  const out = {
    ok: true,
    skipped_send: skipSend,
    zapier: zapierStatus,
    recipients: to,
    subject,
    suggestion_count: suggestions.length,
    suggestions: suggestions.map(s => ({ title: s.title, channel: s.channel, skill: s.skill })),
  };
  if (debugReturn) {
    out.html = html;
    out.text = text;
    out.currentLibrarySummary = currentLibrarySummary;
  }
  return res.status(200).json(out);
}

// ============================================================================
// Library fetch — read main's sound-stage.js, extract titles per category.
// ============================================================================
async function fetchCurrentLibrary() {
  const r = await fetch(REPO_DATA_URL, { cache: 'no-store' });
  if (!r.ok) throw new Error(`github raw ${r.status}`);
  const src = await r.text();

  // Cheap parse — pull every `title: 'X'` and `composer: 'Y'` inside videos.
  // We don't need a full AST; we just want to give Haiku a list of "we
  // already have these" so it doesn't duplicate.
  const titles = [];
  const titleRe = /title:\s*['"`]([^'"`]+)['"`]/g;
  const composerRe = /composer:\s*['"`]([^'"`]+)['"`]/g;
  let m;
  while ((m = titleRe.exec(src)) !== null) titles.push(m[1]);
  const composers = new Set();
  while ((m = composerRe.exec(src)) !== null) composers.add(m[1]);

  // Filter out the piano-song titles (they're not videos — they're songs in
  // the songs[] block). Heuristic: piano songs typically have emojis next to
  // them in their own block; we'll filter by removing any title that exactly
  // matches one of the well-known piano song names.
  const pianoSongTitles = new Set([
    'Twinkle Twinkle Little Star', 'Mary Had a Little Lamb', 'Hot Cross Buns',
    'Ode to Joy (Beethoven)', 'Happy Birthday to You',
  ]);
  const videoTitles = titles.filter(t => !pianoSongTitles.has(t));

  return {
    video_titles: videoTitles,
    composers: Array.from(composers),
    total_videos: videoTitles.length,
    fetched_at: new Date().toISOString(),
  };
}

// ============================================================================
// Haiku call — returns an array of {title, channel, skill, why, searchQuery,
// suggestedCategory, suggestedDescription, suggestedPostQuestion}.
// ============================================================================
async function haikuSuggest({ ANTHROPIC_KEY, currentLibrarySummary }) {
  const systemPrompt = [
    "You are a music-curation assistant for a 7-year-old's homeschool app called Hero Academy.",
    "Your job: suggest 6 to 8 NEW kid-safe music videos that teach LIFE SKILLS through song.",
    "Strict rules:",
    "1. ONLY suggest videos from these approved channels:",
    APPROVED_CHANNELS.map(c => `   • ${c}`).join('\n'),
    "2. DO NOT include YouTube IDs in your output. Trying to remember IDs leads to wrong videos. Give a search query the parent will use to find the real video.",
    "3. Do NOT duplicate anything already in the library (titles listed below).",
    "4. Vary the life skill across suggestions — don't suggest 5 hygiene songs. Mix feelings, friendship, kindness, hygiene, manners, problem-solving, perseverance, family, body safety, etc.",
    "5. Match the warm, gentle tone of Fred Rogers / Daniel Tiger / Sesame Street. NO scary, dark, or commercial content.",
    "6. Respond with VALID JSON only. No prose, no markdown fences, just the JSON array.",
    "",
    "JSON schema — each item:",
    "{",
    '  "title": string (the song title as the channel uses it),',
    '  "channel": string (one of the approved channels exactly as listed),',
    '  "skill": string (the life skill in 2-4 words, e.g. "naming feelings", "asking for help", "sharing"),',
    '  "why": string (1 sentence on why this matters for a 7-year-old),',
    '  "searchQuery": string (what to paste into YouTube search to find this video — include channel name),',
    '  "suggestedDescription": string (one short sentence for the in-app description),',
    '  "suggestedPostQuestionText": string (a single question Ms. Humphrey asks the child after watching),',
    '  "suggestedPostChoices": [string, string, string] (3 short, age-appropriate answer choices)',
    "}",
  ].join('\n');

  const userPrompt = [
    `Library currently has ${currentLibrarySummary.total_videos} videos:`,
    currentLibrarySummary.video_titles.map(t => `  • ${t}`).join('\n'),
    '',
    'Suggest 6-8 NEW videos for the Life Skills category. Return ONLY a JSON array.',
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
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`anthropic ${r.status}: ${body.slice(0, 300)}`);
  }
  const json = await r.json();
  const blocks = Array.isArray(json.content) ? json.content : [];
  const text = blocks.filter(b => b && b.type === 'text').map(b => b.text).join('\n').trim();

  // Strip any accidental code fences
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    throw new Error(`haiku returned non-JSON: ${cleaned.slice(0, 200)}`);
  }
  if (!Array.isArray(parsed)) throw new Error('haiku returned non-array JSON');

  // Defensive validation — drop any item missing required fields, clamp to 10
  const valid = parsed.filter(s =>
    s && typeof s === 'object'
    && typeof s.title === 'string' && s.title.length > 0
    && typeof s.channel === 'string'
    && typeof s.skill === 'string'
  ).slice(0, 10);

  return valid;
}

// ============================================================================
// HTML email rendering
// ============================================================================
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

function renderJsonBlock(s) {
  // The block Josh will paste into data/sound-stage.js's life-skills.videos[].
  // youtubeId is left as PASTE_ID_HERE so Josh fills it in after verifying.
  const id = slugify(s.title) || 'new-video-' + Date.now();
  const choices = Array.isArray(s.suggestedPostChoices) && s.suggestedPostChoices.length
    ? s.suggestedPostChoices.slice(0, 3)
    : ['Yes', 'Not sure', 'Tell me more'];
  const obj = [
    '        {',
    `          id: ${JSON.stringify(id)},`,
    `          title: ${JSON.stringify(s.title)},`,
    `          composer: ${JSON.stringify(s.channel)},`,
    `          duration: 'TBD',`,
    `          description: ${JSON.stringify(s.suggestedDescription || s.why || '')},`,
    `          youtubeId: 'PASTE_ID_HERE',`,
    '          post: {',
    `            text: ${JSON.stringify(s.suggestedPostQuestionText || `What did you think, Nigel?`)},`,
    `            choices: [${choices.map(c => JSON.stringify(c)).join(', ')}],`,
    '          },',
    '        },',
  ].join('\n');
  return obj;
}

function renderHtml({ monthName, suggestions, currentLibrarySummary }) {
  const cards = suggestions.map((s, i) => {
    const searchUrl = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(s.searchQuery || (s.channel + ' ' + s.title));
    const jsonBlock = renderJsonBlock(s);
    return `
<div style="border:1px solid #e5e7eb; border-radius:14px; padding:16px 18px; margin:14px 0; background:#ffffff;">
  <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
    <span style="background:#fef3c7; color:#92400e; font-size:11px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; padding:3px 8px; border-radius:999px;">${esc(s.skill || 'life skill')}</span>
    <span style="color:#6b7280; font-size:12px;">${esc(s.channel || '')}</span>
  </div>
  <div style="font-size:18px; font-weight:700; color:#111827; margin:0 0 6px;">${i + 1}. ${esc(s.title)}</div>
  <div style="color:#4b5563; font-size:14px; line-height:1.45; margin:0 0 14px;">${esc(s.why || s.suggestedDescription || '')}</div>
  <div style="margin:0 0 12px;">
    <a href="${esc(searchUrl)}" style="display:inline-block; background:#ec4899; color:#ffffff; text-decoration:none; padding:9px 16px; border-radius:8px; font-weight:600; font-size:14px;">▶ Verify on YouTube</a>
  </div>
  <details style="margin-top:8px;">
    <summary style="cursor:pointer; color:#6b7280; font-size:13px; font-weight:600;">📋 Paste-ready block for data/sound-stage.js</summary>
    <pre style="background:#0a0b2e; color:#ffd147; padding:14px; border-radius:10px; overflow-x:auto; font-size:12px; line-height:1.4; margin-top:10px; font-family:'SF Mono',Menlo,Consolas,monospace;">${esc(jsonBlock)}</pre>
    <div style="color:#6b7280; font-size:12px; margin-top:6px;">Click <strong>Verify</strong> → confirm content is what we want → copy the 11-char YouTube ID → replace <code>PASTE_ID_HERE</code> → paste this whole block into the <code>life-skills</code> category's <code>videos</code> array.</div>
  </details>
</div>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>${esc(monthName)} video picks</title></head>
<body style="margin:0; padding:0; background:#f9fafb; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; color:#111827;">
<div style="max-width:640px; margin:0 auto; padding:24px 18px;">

  <div style="text-align:center; margin-bottom:20px;">
    <img src="${HUMPHREY_PORTRAIT_URL}" width="72" height="72" alt="Ms. Humphrey" style="border-radius:50%; border:3px solid #ffd147;">
    <div style="font-size:11px; letter-spacing:0.18em; text-transform:uppercase; color:#92400e; font-weight:700; margin-top:8px;">Hero Academy · Sound Stage</div>
    <h1 style="margin:6px 0 4px; font-size:26px; color:#0a0b2e;">${esc(monthName)} video picks</h1>
    <p style="margin:0; color:#6b7280; font-size:14px;">${suggestions.length} new life-skills songs for Nigel — pick the ones you like.</p>
  </div>

  <div style="background:#fffbeb; border:1px solid #fde68a; border-radius:12px; padding:14px 16px; margin-bottom:18px; font-size:14px; color:#78350f;">
    <strong>How this works:</strong> Ms. Humphrey scanned the library (${currentLibrarySummary.total_videos} videos) and asked Haiku for fresh life-skills suggestions. Click <em>Verify</em> on the ones you like, grab the YouTube ID, and paste the code block into <code>data/sound-stage.js</code> → <code>life-skills</code>. Skip anything that doesn't fit. (Phase 2 will be one-tap approval from the parent dashboard.)
  </div>

  ${cards}

  <div style="margin-top:28px; padding-top:18px; border-top:1px solid #e5e7eb; color:#9ca3af; font-size:12px; text-align:center;">
    Auto-curation cron · ${new Date().toISOString().slice(0,10)}<br>
    Approved channels: ${APPROVED_CHANNELS.map(c => esc(c)).join(' · ')}
  </div>

</div>
</body></html>`;
}

function renderText({ monthName, suggestions }) {
  const lines = [
    `Hero Academy — ${monthName} video picks`,
    `${suggestions.length} new life-skills songs for Nigel.`,
    '',
  ];
  suggestions.forEach((s, i) => {
    const searchUrl = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(s.searchQuery || (s.channel + ' ' + s.title));
    lines.push(`${i + 1}. ${s.title}`);
    lines.push(`   Channel: ${s.channel}`);
    lines.push(`   Skill: ${s.skill}`);
    if (s.why) lines.push(`   Why: ${s.why}`);
    lines.push(`   Verify: ${searchUrl}`);
    lines.push('');
  });
  lines.push('Open the HTML version of this email for paste-ready code blocks.');
  return lines.join('\n');
}
