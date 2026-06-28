/**
 * Hero Academy — Monday "Week Ahead" curriculum email cron.
 *
 * Schedule (vercel.json):  0 11 * * 1   (Monday 11:00 UTC = 6am EST / 7am EDT)
 *
 * Purpose (inverse of saturday-email):
 *   The Saturday email looks BACKWARD at what Nigel did. This one looks
 *   FORWARD: it pre-generates and LOCKS the entire upcoming school week's
 *   Class Time content, then emails the parents a reviewable plan so they're
 *   never blindsided by the subjects/questions that show up during Class Time.
 *
 * Pipeline:
 *   1. Verify Bearer ${CRON_SECRET}  (Vercel cron also sends x-vercel-cron: 1)
 *   2. Compute Mon..Fri (ET) of the upcoming week.
 *   3. Phase 1 — sequentially generate + cache each day's 4-course plan via
 *      /api/class-time/lesson-plan-day?force=1, feeding YESTERDAY's literacy/
 *      visual subjects forward as `extra_recent` so subjects rotate across
 *      the week.
 *   4. Phase 2 — generate + cache the real 8 questions for all 20 courses via
 *      /api/class-time/questions?force=1 (bounded concurrency).
 *   5. Draft a short Ms. Humphrey week intro via Haiku (failsafe → fallback).
 *   6. POST { to, subject, html, text } to ZAPIER_WEBHOOK_URL — Josh's Zap
 *      catches that hook and sends from his Gmail (same path as Saturday).
 *
 * Because lesson-plan-day and questions only regenerate on force=1 or a cache
 * miss, and nothing else force-regenerates future dates, the content emailed
 * Monday is EXACTLY what Nigel sees when he opens Class Time each day.
 *
 * Manual testing (does NOT send; returns rendered HTML in the JSON):
 *   curl 'https://.../api/cron/weekly-curriculum?dry_run=1' \
 *        -H 'Authorization: Bearer YOUR_CRON_SECRET'
 *   Add &cached=1 to skip regeneration and render from whatever is cached.
 *   Add &week_start=YYYY-MM-DD to override the Monday it plans for.
 *
 * Env vars (all already used by saturday-email except none new):
 *   CRON_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (only via sub-calls),
 *   ANTHROPIC_API_KEY, ZAPIER_WEBHOOK_URL, PARENT_EMAILS
 */

export const config = { maxDuration: 300 };

const NIGEL_ID = '2e0e51c5-f120-4152-8aa1-041eeecc8165';
const DEFAULT_RECIPIENTS = 'bianca.parker92@gmail.com,jemelike@gmail.com';
const HAIKU_MODEL = 'claude-haiku-4-5';
const SCHOOL_DAYS = 5; // Mon..Fri
const QUESTIONS_TARGET = 8; // full set per course (matches QUESTIONS_PER_COURSE in questions.js)

const LITERACY_VISUAL = new Set([
  'reading', 'spelling', 'writing', 'grammar', 'vocabulary', 'science', 'social',
]);

// Deterministic weekly coverage. Course order is fixed (1=math, 2&3=literacy,
// 4=visual). We assign the lineup ourselves instead of letting Haiku pick,
// because left to itself Haiku over-selects writing/science and skips reading
// and spelling entirely. This guarantees a reading-heavy, balanced 2nd-grade
// week the parents can rely on. Weekly tallies: reading x4, spelling x2,
// writing x2, grammar x1, vocabulary x1; science x3, social x2 (math daily).
const WEEK_TEMPLATE = [
  ['math', 'reading', 'spelling', 'science'],    // Mon
  ['math', 'reading', 'writing', 'social'],      // Tue
  ['math', 'reading', 'grammar', 'science'],     // Wed
  ['math', 'reading', 'vocabulary', 'social'],   // Thu
  ['math', 'spelling', 'writing', 'science'],    // Fri
];

const SUBJECT_EMOJI = {
  math: '\u{1F522}',        // 🔢
  reading: '\u{1F4D6}',     // 📖
  spelling: '\u{1F524}',    // 🔤
  writing: '\u270F\uFE0F',  // ✏️
  grammar: '\u{1F9E9}',     // 🧩
  vocabulary: '\u{1F5E3}\uFE0F', // 🗣
  science: '\u{1F52C}',     // 🔬
  social: '\u{1F5FA}\uFE0F', // 🗺
};

const HUMPHREY_PORTRAIT_URL =
  'https://hero-academy-jemelike-6356s-projects.vercel.app/assets/humphrey/humphrey_base_512.png';

// ---------------------------------------------------------------------------

export default async function handler(req, res) {
  // ---------- 1. Auth ----------
  const auth = req.headers.authorization || '';
  const isVercelCron =
    req.headers['x-vercel-cron'] === '1' ||
    (req.headers['user-agent'] || '').includes('vercel-cron');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return res.status(500).json({ error: 'CRON_SECRET not configured' });
  if (!isVercelCron && auth !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const dryRun = String(req.query.dry_run || '') === '1';
  const skipSend = dryRun || String(req.query.skip_send || '') === '1';
  const useCache = String(req.query.cached || '') === '1'; // skip force-regen

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  const ZAP_URL = process.env.ZAPIER_WEBHOOK_URL;
  if (!skipSend && !ZAP_URL) {
    return res.status(500).json({ error: 'ZAPIER_WEBHOOK_URL missing (or pass ?dry_run=1)' });
  }

  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['host'];
  const base = `${proto}://${host}`;

  // ---------- 2. Week dates (Mon..Fri, ET) ----------
  const dates = upcomingSchoolWeek(req.query.week_start);

  // ---------- 3. Phase 1: day plans (sequential, with rotation feed-forward) ----------
  const week = [];
  const errors = [];
  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    const subjects = WEEK_TEMPLATE[i] || WEEK_TEMPLATE[WEEK_TEMPLATE.length - 1];
    try {
      const plan = await callDayPlan(base, date, NIGEL_ID, subjects, useCache);
      week.push({
        date,
        dow: dowLong(date),
        theme: plan.theme || '',
        source: plan.source || 'unknown',
        courses: (plan.courses || []).map((c) => ({
          order: c.order,
          subject: c.subject,
          subject_label: c.subject_label || c.subject,
          why_chosen: c.why_chosen || '',
          target_minutes: c.target_minutes || null,
          topics: Array.isArray(c.topics) ? c.topics : [],
          questions: [], // filled in phase 2
        })),
      });
    } catch (e) {
      errors.push(`plan ${date}: ${String(e && e.message || e).slice(0, 160)}`);
      week.push({ date, dow: dowLong(date), theme: '', source: 'error', courses: [] });
    }
  }

  // ---------- 4. Phase 2: questions (bounded concurrency, gentler burst) ----------
  const tasks = [];
  week.forEach((day, di) => {
    day.courses.forEach((c) => tasks.push({ di, date: day.date, course_order: c.order }));
  });
  const applyQuestions = (t, q) => {
    const course = week[t.di].courses.find((c) => c.order === t.course_order);
    if (course) {
      course.questions = Array.isArray(q.questions) ? q.questions : [];
      course.q_source = q.source || 'unknown';
    }
    return course;
  };
  // Concurrency 3 (was 5) so the Monday burst is gentler on the API and less
  // likely to provoke rate-limit fallbacks in the first place.
  await mapLimit(tasks, 3, async (t) => {
    try {
      const q = await callQuestions(base, t.date, NIGEL_ID, t.course_order, useCache);
      applyQuestions(t, q);
    } catch (e) {
      errors.push(`q ${t.date} c${t.course_order}: ${String(e && e.message || e).slice(0, 120)}`);
    }
  });

  // No-fallback guard: the locked weekly email should be 100% freshly generated.
  // Any course that still came back as a stub fallback gets re-generated (force),
  // up to 2 more attempts. The questions endpoint itself now over-generates and
  // retries internally, so a single re-call almost always lands real content.
  if (!useCache) {
    for (let pass = 0; pass < 2; pass++) {
      const stragglers = tasks.filter((t) => {
        const c = week[t.di].courses.find((c) => c.order === t.course_order);
        return c && c.q_source === 'fallback';
      });
      if (!stragglers.length) break;
      await mapLimit(stragglers, 2, async (t) => {
        try {
          const q = await callQuestions(base, t.date, NIGEL_ID, t.course_order, false);
          applyQuestions(t, q);
        } catch (e) {
          errors.push(`q-retry ${t.date} c${t.course_order}: ${String(e && e.message || e).slice(0, 120)}`);
        }
      });
    }
  }

  // ---------- 5. Ms. Humphrey week intro (failsafe) ----------
  let intro;
  try {
    intro = ANTHROPIC_KEY ? await draftWeekIntro(ANTHROPIC_KEY, week) : fallbackIntro(week);
  } catch (e) {
    intro = fallbackIntro(week);
  }

  // ---------- 6. Render ----------
  const meta = {
    start: dates[0],
    end: dates[dates.length - 1],
    range: dateRange(dates[0], dates[dates.length - 1]),
  };
  const html = renderWeekHtml({ week, intro, meta });
  const text = renderWeekText({ week, intro, meta });
  const subject = `Hero Academy \u2014 Nigel\u2019s week ahead (${meta.range})`;
  const to = (process.env.PARENT_EMAILS || DEFAULT_RECIPIENTS).trim();

  // ---------- 7. Send via Zapier (unless dry run) ----------
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
          week_start: meta.start,
          week_end: meta.end,
          kind: 'week_ahead',
        }),
      });
      if (!r.ok) {
        const body = await r.text().catch(() => '');
        return res.status(502).json({ error: 'zapier webhook rejected', status: r.status, body: body.slice(0, 500) });
      }
      zapierStatus = `ok (${r.status})`;
    } catch (e) {
      return res.status(502).json({ error: 'zapier webhook fetch failed', detail: String(e && e.message || e) });
    }
  }

  const totalQuestions = week.reduce(
    (n, d) => n + d.courses.reduce((m, c) => m + (c.questions ? c.questions.length : 0), 0), 0);
  const fallbackCourses = week.reduce(
    (n, d) => n + d.courses.filter((c) => c.q_source === 'fallback').length, 0);
  const shortCourses = week.reduce(
    (n, d) => n + d.courses.filter((c) => (c.questions ? c.questions.length : 0) < QUESTIONS_TARGET).length, 0);

  return res.status(200).json({
    ok: true,
    dry_run: dryRun,
    zapier: zapierStatus,
    to,
    subject,
    week: meta.range,
    counts: {
      days: week.length,
      courses: week.reduce((n, d) => n + d.courses.length, 0),
      questions: totalQuestions,
      fallback_courses: fallbackCourses,
      short_courses: shortCourses,
    },
    errors: errors.length ? errors : undefined,
    html_preview: dryRun ? html : undefined,
  });
}

// ---------------------------------------------------------------------------
// Sub-call helpers (internal fetch to our own public GET endpoints)
// ---------------------------------------------------------------------------

async function callDayPlan(base, date, childId, subjects, useCache) {
  const u = new URL(`${base}/api/class-time/lesson-plan-day`);
  u.searchParams.set('date', date);
  u.searchParams.set('child_id', childId);
  if (!useCache) u.searchParams.set('force', '1');
  if (subjects && subjects.length) u.searchParams.set('subjects', subjects.join(','));
  const r = await fetch(u.toString());
  if (!r.ok) throw new Error(`lesson-plan-day ${r.status}`);
  const j = await r.json();
  if (!j || !j.plan) throw new Error('no plan in response');
  return j.plan;
}

async function callQuestions(base, date, childId, courseOrder, useCache) {
  const u = new URL(`${base}/api/class-time/questions`);
  u.searchParams.set('date', date);
  u.searchParams.set('child_id', childId);
  u.searchParams.set('course_order', String(courseOrder));
  if (!useCache) u.searchParams.set('force', '1');
  const r = await fetch(u.toString());
  if (!r.ok) return { questions: [] };
  return r.json();
}

// Run `fn` over `items` with at most `limit` in flight at once.
async function mapLimit(items, limit, fn) {
  const queue = items.slice();
  const workers = [];
  for (let i = 0; i < Math.min(limit, queue.length); i++) {
    workers.push((async () => {
      while (queue.length) {
        const item = queue.shift();
        await fn(item);
      }
    })());
  }
  await Promise.all(workers);
}

// ---------------------------------------------------------------------------
// Date helpers (America/New_York)
// ---------------------------------------------------------------------------

function etParts(d = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  });
  const map = {};
  fmt.formatToParts(d).forEach((p) => { map[p.type] = p.value; });
  return map; // { year, month, day, weekday: 'Mon' }
}

function isoFromYMD(y, m, day) {
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Monday of the upcoming school week, ET. If today IS Monday, plan THIS week
// (today through Friday). Override with ?week_start=YYYY-MM-DD.
function upcomingSchoolWeek(override) {
  let mondayISO;
  if (override && /^\d{4}-\d{2}-\d{2}$/.test(String(override))) {
    mondayISO = String(override);
  } else {
    const p = etParts();
    const wk = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[p.weekday];
    // Days to add to reach the upcoming Monday (today if Monday).
    const add = wk === 1 ? 0 : (8 - wk) % 7;
    const noonUTC = new Date(`${p.year}-${p.month}-${p.day}T12:00:00Z`);
    noonUTC.setUTCDate(noonUTC.getUTCDate() + add);
    mondayISO = noonUTC.toISOString().slice(0, 10);
  }
  const out = [];
  const start = new Date(`${mondayISO}T12:00:00Z`);
  for (let i = 0; i < SCHOOL_DAYS; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function dowLong(iso) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
}

function prettyDate(iso) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function dateRange(a, b) {
  return `${prettyDate(a)}\u2013${prettyDate(b)}`;
}

// ---------------------------------------------------------------------------
// Ms. Humphrey week intro
// ---------------------------------------------------------------------------

async function draftWeekIntro(ANTHROPIC_KEY, week) {
  const planDigest = week.map((d) => ({
    day: d.dow,
    theme: d.theme,
    subjects: d.courses.map((c) => c.subject_label),
    focus: d.courses.map((c) => ({
      subject: c.subject_label,
      topics: c.topics.map((t) => t.title),
    })),
  }));

  const system = [
    'You are Ms. Humphrey, Nigel\u2019s warm homeschool tutor (Indian, late 40s, navy cardigan).',
    'You are writing a SHORT Monday-morning note to Nigel\u2019s parents, Bianca and Josh, introducing the week\u2019s plan they\u2019re about to review below.',
    'Nigel is 7, 2nd grade, in Maryland.',
    '',
    'Write 2 short paragraphs, plain English to the PARENTS (not to Nigel):',
    '  1. One warm sentence framing the week + name the 1\u20132 biggest focus areas across the week (cite real subjects/topics from the data).',
    '  2. One sentence inviting them to reply if they want anything added, swapped, or dialed back before Monday\u2019s session.',
    'Do NOT list every day \u2014 the table below does that. No greeting line, no subject line, no sign-off other than \u201C\u2014 Ms. Humphrey\u201D on its own final line.',
    'Never invent topics not present in the data.',
  ].join('\n');

  const user = [
    'Here is the locked plan for the upcoming week. Write the intro note now.',
    '```json',
    JSON.stringify(planDigest, null, 2),
    '```',
  ].join('\n');

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: HAIKU_MODEL, max_tokens: 400, system, messages: [{ role: 'user', content: user }] }),
  });
  if (!r.ok) throw new Error(`anthropic ${r.status}`);
  const j = await r.json();
  const text = (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  if (!text) throw new Error('empty intro');
  return text;
}

function fallbackIntro(week) {
  const subjects = new Set();
  week.forEach((d) => d.courses.forEach((c) => subjects.add(c.subject_label)));
  const list = Array.from(subjects).join(', ');
  return [
    `Here\u2019s the full plan for Nigel\u2019s week ahead. Each day runs four short courses with Ms. Humphrey, covering ${list || 'the core 2nd-grade subjects'}.`,
    'Review the subjects, topics, and questions below \u2014 reply to this email if you\u2019d like anything added, swapped, or eased back before Monday\u2019s session.',
    '',
    '\u2014 Ms. Humphrey',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function introToHtml(text) {
  const TEXT = '#0a0b2e';
  return escapeHtml(text)
    .split(/\n{2,}/)
    .map((p) => p.replace(/\n/g, '<br>'))
    .map((p) => `<p style="margin:0 0 12px 0;line-height:1.7;color:${TEXT};font-family:Georgia,'Iowan Old Style',serif;font-size:15px;"><font color="${TEXT}">${p}</font></p>`)
    .join('\n');
}

function answerOf(q) {
  if (!q || !Array.isArray(q.options)) return '';
  const i = Number(q.correct_index);
  if (Number.isInteger(i) && q.options[i] != null) return String(q.options[i]);
  return '';
}

function renderCourse(c) {
  const emoji = SUBJECT_EMOJI[c.subject] || '\u2728';
  const mins = c.target_minutes ? ` \u00b7 ${c.target_minutes} min` : '';
  // Topic chips
  const chips = (c.topics || []).map((t) => {
    const focus = t.focus ? ` <span style="color:#6b7280;"><font color="#6b7280">\u2014 ${escapeHtml(t.focus)}</font></span>` : '';
    return `<div style="font-size:13px;color:#0a0b2e;margin:3px 0;line-height:1.5;"><font color="#0a0b2e"><strong>${escapeHtml(t.title)}</strong>${focus}</font></div>`;
  }).join('');
  // Questions (compact, answer-keyed)
  let qBlock;
  if (c.questions && c.questions.length) {
    const items = c.questions.map((q) => {
      const ans = answerOf(q);
      const ansHtml = ans
        ? `<div style="font-size:12px;color:#15803d;margin:1px 0 0 14px;"><font color="#15803d">\u2192 ${escapeHtml(ans)}</font></div>`
        : '';
      return `<div style="margin:6px 0;"><div style="font-size:13px;color:#1f2937;line-height:1.45;"><font color="#1f2937">\u2022 ${escapeHtml(q.question || '')}</font></div>${ansHtml}</div>`;
    }).join('');
    qBlock = `<div style="margin-top:10px;padding-top:10px;border-top:1px dashed #e5e7eb;">
      <div style="font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#9333ea;font-weight:700;margin-bottom:4px;"><font color="#9333ea">Questions (\u2192 = answer key)</font></div>
      ${items}</div>`;
  } else {
    qBlock = `<div style="margin-top:8px;font-size:12px;color:#9ca3af;"><font color="#9ca3af">Questions will generate before class.</font></div>`;
  }
  const why = c.why_chosen
    ? `<div style="font-size:12px;color:#7c3aed;margin:2px 0 8px 0;font-style:italic;"><font color="#7c3aed">${escapeHtml(c.why_chosen)}</font></div>`
    : '';
  return `<div style="background:#ffffff;border:1px solid #ede9fe;border-radius:12px;padding:14px 16px;margin:10px 0;">
    <div style="font-size:15px;font-weight:800;color:#0a0b2e;"><font color="#0a0b2e">${emoji}\u00a0 Course ${c.order}: ${escapeHtml(c.subject_label)}<span style="font-weight:500;color:#9ca3af;font-size:12px;"><font color="#9ca3af">${mins}</font></span></font></div>
    ${why}
    ${chips}
    ${qBlock}
  </div>`;
}

function renderDay(day) {
  if (!day.courses.length) {
    return `<tr><td style="padding:8px 24px;"><div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:14px;color:#9a3412;"><font color="#9a3412">${escapeHtml(day.dow)} \u2014 plan unavailable; it will generate when Nigel opens Class Time.</font></div></td></tr>`;
  }
  const courses = day.courses.map(renderCourse).join('');
  const theme = day.theme ? `<div style="font-size:13px;color:#ec4899;font-weight:600;margin-top:2px;"><font color="#ec4899">${escapeHtml(day.theme)}</font></div>` : '';
  return `<tr><td style="padding:8px 24px;">
    <div style="margin:14px 0 6px 0;padding:12px 16px;background:linear-gradient(135deg,#1e1b4b,#7c3aed);border-radius:12px;">
      <div style="font-size:18px;font-weight:800;color:#ffffff;"><font color="#ffffff">${escapeHtml(day.dow)} \u00b7 ${escapeHtml(prettyDate(day.date))}</font></div>
      ${theme}
    </div>
    ${courses}
  </td></tr>`;
}

function renderWeekHtml({ week, intro, meta }) {
  const days = week.map(renderDay).join('\n');
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<title>Hero Academy \u2014 Week Ahead</title>
</head>
<body style="margin:0;padding:0;background:#0a0b2e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0a0b2e;">
  <div style="display:none;max-height:0;overflow:hidden;color:transparent;">Nigel\u2019s full Class Time plan for ${escapeHtml(meta.range)} \u2014 review the subjects and questions.</div>
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#0a0b2e;"><tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:660px;background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 24px 60px rgba(10,11,46,0.45);">

      <!-- BANNER -->
      <tr><td style="background:#1e1b4b;background-image:linear-gradient(135deg,#1e1b4b 0%,#7c3aed 35%,#ec4899 70%,#ff8b3d 100%);padding:34px 28px 70px 28px;text-align:center;color:#ffffff;">
        <div style="font-size:11px;letter-spacing:2.5px;text-transform:uppercase;opacity:0.9;font-weight:700;"><font color="#ffffff">\u{1F9B8}\u200D\u2640\uFE0F Hero Academy</font></div>
        <div style="font-size:23px;font-weight:800;margin-top:6px;"><font color="#ffffff">The Week Ahead</font></div>
        <div style="font-size:14px;opacity:0.9;margin-top:4px;"><font color="#ffffff">${escapeHtml(meta.range)} \u00b7 Nigel\u2019s Class Time plan</font></div>
      </td></tr>

      <!-- PORTRAIT -->
      <tr><td style="text-align:center;padding:0 28px;background:#ffffff;">
        <img src="${HUMPHREY_PORTRAIT_URL}" width="110" height="110" alt="Ms. Humphrey" style="border-radius:50%;border:4px solid #ffffff;box-shadow:0 8px 24px rgba(124,58,237,0.35);margin-top:-55px;background:#ffffff;display:inline-block;">
        <div style="margin-top:12px;font-size:19px;font-weight:800;color:#0a0b2e;"><font color="#0a0b2e">From Ms. Humphrey</font></div>
        <div style="font-size:13px;color:#7c3aed;font-weight:600;"><font color="#7c3aed">Planning the week with you</font></div>
      </td></tr>

      <!-- INTRO -->
      <tr><td style="padding:22px 28px 4px 28px;background:#ffffff;">
        <div style="border-left:4px solid #ec4899;padding:14px 18px;background:#fdf2f8;border-radius:0 12px 12px 0;">
          ${introToHtml(intro)}
        </div>
      </td></tr>

      <!-- HOW TO READ -->
      <tr><td style="padding:10px 28px 0 28px;background:#ffffff;">
        <div style="font-size:12px;color:#6b7280;text-align:center;"><font color="#6b7280">Each day = 4 short courses. Below each subject you\u2019ll see its topics and the exact questions, with the answer key (\u2192).</font></div>
      </td></tr>

      ${days}

      <!-- FOOTER -->
      <tr><td style="padding:24px 28px 34px 28px;background:#faf8ff;border-top:1px solid #ede9fe;">
        <p style="margin:0 0 12px 0;font-size:14px;color:#4c1d95;line-height:1.6;text-align:center;font-weight:500;"><font color="#4c1d95">
          Want something changed before the week starts?<br>Just reply \u2014 tell me what to add, swap, or ease back, and I\u2019ll adjust Nigel\u2019s plan.
        </font></p>
        <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;letter-spacing:0.5px;"><font color="#9ca3af">Hero Academy \u00b7 Week of ${escapeHtml(meta.range)}</font></p>
      </td></tr>

    </table>
  </td></tr></table>
</body></html>`;
}

function renderWeekText({ week, intro, meta }) {
  const lines = [
    `HERO ACADEMY \u2014 Nigel\u2019s Week Ahead (${meta.range})`,
    '',
    intro,
    '',
    '====================================',
    '',
  ];
  for (const day of week) {
    lines.push(`${day.dow.toUpperCase()} \u00b7 ${prettyDate(day.date)}${day.theme ? ' \u2014 ' + day.theme : ''}`);
    if (!day.courses.length) {
      lines.push('  (plan unavailable; generates when Nigel opens Class Time)', '');
      continue;
    }
    for (const c of day.courses) {
      lines.push(`  Course ${c.order}: ${c.subject_label}${c.target_minutes ? ' (' + c.target_minutes + ' min)' : ''}`);
      if (c.why_chosen) lines.push(`    why: ${c.why_chosen}`);
      for (const t of (c.topics || [])) {
        lines.push(`    \u2022 ${t.title}${t.focus ? ' \u2014 ' + t.focus : ''}`);
      }
      if (c.questions && c.questions.length) {
        lines.push('    Questions (-> = answer):');
        for (const q of c.questions) {
          const ans = answerOf(q);
          lines.push(`      - ${q.question || ''}`);
          if (ans) lines.push(`        -> ${ans}`);
        }
      }
      lines.push('');
    }
    lines.push('');
  }
  lines.push('\u2014', 'Reply to this email to add, swap, or ease back anything before the week starts.');
  return lines.join('\n');
}
