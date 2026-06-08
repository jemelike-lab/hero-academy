// api/class-time/lesson-plan.js — v141
// GET /api/class-time/lesson-plan?date=YYYY-MM-DD&child_id=...
// Returns today's curated lesson plan. Reads from Supabase cache; generates via Haiku if missing.
// Native fetch to Supabase REST + Anthropic. No npm package deps.

const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const ANTHROPIC_VERSION = '2023-06-01';

const VALID_VISUALS = ['plant','sun','water','soil','butterfly','frog','bee','planet','moon','star','volcano','mountain','river','ocean','fire','ice','magnet','heart','lung','brain','dog','cat','fish','bird','dinosaur','knight','castle','map','flag','clock','calendar'];

const VALID_TOOLS = ['drawNumber','drawDots','drawTenFrame','writeWord','writeLetter','drawEquation','showVisual','clearBoard'];

function todayET(){
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone:'America/New_York', year:'numeric', month:'2-digit', day:'2-digit' });
  return fmt.format(new Date()); // YYYY-MM-DD
}

function dayOfWeekET(){
  const s = new Intl.DateTimeFormat('en-US', { timeZone:'America/New_York', weekday:'long' }).format(new Date());
  return s.toLowerCase();
}

// ---------- Supabase REST helpers (no SDK) ----------

function sbHeaders(){
  const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return {
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

async function sbSelect(table, query){
  // query is a query-string fragment (without leading ?), e.g. "select=lesson&date=eq.2026-06-07"
  const SB_URL = process.env.SUPABASE_URL;
  const r = await fetch(`${SB_URL}/rest/v1/${table}?${query}`, {
    method: 'GET', headers: sbHeaders()
  });
  if (!r.ok){
    const body = await r.text().catch(() => '');
    throw new Error(`supabase select ${table} -> ${r.status} ${body.slice(0, 200)}`);
  }
  return r.json();
}

async function sbUpsert(table, row, onConflict){
  const SB_URL = process.env.SUPABASE_URL;
  const url = `${SB_URL}/rest/v1/${table}${onConflict ? `?on_conflict=${onConflict}` : ''}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      ...sbHeaders(),
      Prefer: 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify(row)
  });
  if (!r.ok){
    const body = await r.text().catch(() => '');
    throw new Error(`supabase upsert ${table} -> ${r.status} ${body.slice(0, 200)}`);
  }
  return true;
}

async function getRecentTopicHistory(childId){
  try {
    const since = new Date(Date.now() - 14*86400000).toISOString();
    const q = `select=payload,created_at&child_id=eq.${childId}&event_type=eq.class_time_complete&created_at=gte.${encodeURIComponent(since)}&order=created_at.desc&limit=30`;
    return await sbSelect('ha_events', q);
  } catch(e){ return []; }
}

// v142: returns true if today's lesson has already been completed at least once.
// Used to force a fresh "second period" lesson when Nigel returns to Class Time
// later the same day.
async function isLessonCompletedToday(childId, dateET){
  try {
    // ET day boundary expressed in UTC (rough: take date+00:00 ET → +04 UTC at EST or +05 EDT;
    // simpler: just check the last ~26h window to cover the ET day reliably)
    const since = new Date(Date.now() - 26 * 3600 * 1000).toISOString();
    const q = `select=created_at,payload&child_id=eq.${childId}&event_type=eq.class_time_complete&created_at=gte.${encodeURIComponent(since)}&limit=5`;
    const rows = await sbSelect('ha_events', q);
    if (!rows || rows.length === 0) return false;
    // Filter to events whose payload.lesson_date matches today (ET) to be precise
    const matchingToday = rows.filter(r => r.payload && r.payload.lesson_date === dateET);
    return matchingToday.length > 0;
  } catch(_){ return false; }
}

async function getRecentLessons(){
  try {
    return await sbSelect('ha_class_time_lessons', 'select=date,lesson&order=date.desc&limit=7');
  } catch(e){ return []; }
}

async function getRecentZonePerf(childId){
  try {
    return await sbSelect('ha_difficulty_state', `select=skill_id,current_level,recent_accuracy,updated_at&child_id=eq.${childId}`);
  } catch(e){ return []; }
}

async function getCachedLesson(date){
  try {
    const rows = await sbSelect('ha_class_time_lessons', `select=lesson&date=eq.${date}&limit=1`);
    return rows[0]?.lesson || null;
  } catch(e){ return null; }
}

async function cacheLesson(date, lesson){
  try {
    await sbUpsert('ha_class_time_lessons', { date, lesson, generated_at: new Date().toISOString() }, 'date');
  } catch(e){
    console.warn('[lesson-plan] cache write failed', e.message || e);
  }
}

// ---------- Lesson generation ----------

function fallbackPlan(date){
  // Same fallback shape as client-side, but server-side for cron use
  const doy = (() => {
    const d = new Date(date + 'T12:00:00Z');
    const start = new Date(d.getFullYear(), 0, 0);
    return Math.floor((d - start) / 86400000);
  })();
  const pool = [
    { id:'addition-10', skill:'math', title:'Addition within 10', focus:'7+3, 6+4, 8+2', tools:['drawDots','drawTenFrame','drawEquation'], why_chosen:"warm-up math you've done before" },
    { id:'count-by-2', skill:'math', title:'Counting by 2s', focus:'2,4,6,8,10', tools:['drawNumber','drawDots'], why_chosen:'skip counting builds multiplication intuition' },
    { id:'sight-words', skill:'reading', title:'Sight words', focus:'the, and, was, said', tools:['writeWord'], why_chosen:'reading fluency starts with sight words' },
    { id:'letter-sounds', skill:'reading', title:'Letter sounds', focus:'b, d, p, q', tools:['writeLetter'], why_chosen:'tricky letters that look similar' },
    { id:'living-things', skill:'science', title:'Living things', focus:'plants, animals', tools:['showVisual'], why_chosen:'2nd grade life science staple' },
    { id:'subtract-5', skill:'math', title:'Subtraction within 5', focus:'5-2, 4-1, 3-3', tools:['drawTenFrame','drawEquation'], why_chosen:'easier subtraction to build confidence' },
    { id:'rhyming', skill:'reading', title:'Rhyming words', focus:'cat/hat, dog/log', tools:['writeWord'], why_chosen:'phonemic awareness practice' },
    { id:'maryland', skill:'social', title:'Maryland symbols', focus:'flag, oriole, blue crab', tools:['showVisual'], why_chosen:'connecting to your home state' }
  ];
  const startIdx = doy % pool.length;
  const topics = [];
  for (let i = 0; i < 4; i++) topics.push(pool[(startIdx + i) % pool.length]);
  return { date, topics, theme: 'Daily review', source: 'fallback', generated_at: new Date().toISOString() };
}

function buildPrompt(ctx){
  const recentTitles = ctx.recentLessons.flatMap(l => (l.lesson?.topics || []).map(t => t.title));
  const recentTitlesUnique = [...new Set(recentTitles)].slice(0, 12);
  const strugglers = ctx.zonePerf
    .filter(z => (z.recent_accuracy ?? 1) < 0.6 || (z.current_level ?? 1) <= 1)
    .map(z => z.skill_id)
    .slice(0, 4);

  return `You are designing a 7-minute live class for Nigel, a 7-year-old 2nd grader homeschooled in Maryland.

His teacher Ms. Humphrey will run the class. She uses a digital board where she can:
- drawNumber(n) — big number
- drawDots(count) — counting dots up to ~15
- drawTenFrame(filled) — ten-frame with N filled (0-10)
- writeWord(word) / writeLetter(letter) — handwriting
- drawEquation(text) — math equation like "7 + 3 = ?"
- showVisual(subject) — pops up a LIVE photo from Wikipedia for ANY educational subject (people, places, animals, plants, machines, historical events). Examples: "Maryland State House", "Benjamin Banneker", "bald eagle", "photosynthesis", "blue crab"
- clearBoard() — wipe

Design 4 topics that fit a 7-minute class (about 90 seconds each). Each topic must:
- Be a SINGLE focused skill, not a survey
- Be appropriate for a 7yo 2nd grader, depth over breadth
- Include 'focus' — a few concrete examples she'll use
- Include 'tools' — which board tools she'll actually use (subset of: drawNumber, drawDots, drawTenFrame, writeWord, writeLetter, drawEquation, showVisual)
- Include 'why_chosen' — ONE warm sentence (max 20 words) explaining WHY this topic is right for Nigel TODAY, in Ms. Humphrey's voice. Reference his progress, recent work, or a skill stretch. Examples: "You nailed addition within 10 yesterday — let's stretch into making tens." / "We haven't touched rhyming this week and it's how strong readers grow."

Mix subjects. Don't do 4 math topics. Aim for 2 math + 1 reading + 1 science/social.

When a topic is science, history, social studies, or geography, prefer 'showVisual' in its tools so Nigel can see a live photo (e.g. "Annapolis State House", "George Washington", "monarch butterfly"). Don't pick generic 'flag' — pick the specific subject the topic teaches.

Today is ${ctx.dayOfWeek}, ${ctx.date}.

Recent topics (avoid repeating these exact titles): ${recentTitlesUnique.length ? recentTitlesUnique.join('; ') : 'none'}

Skills Nigel has been struggling with (consider reinforcing one): ${strugglers.length ? strugglers.join(', ') : 'none flagged'}

Maryland homeschool standards apply (CCSS + MD MCCRS 2nd grade) — math operations within 100, place value, telling time, reading comprehension, phonics, life science, MD geography/civics.

Respond ONLY with valid JSON, no preamble, no markdown:
{
  "theme": "short phrase like 'Number sense + sight words' or 'Maryland day'",
  "topics": [
    { "id": "kebab-case-id", "skill": "math|reading|science|social", "title": "Short title", "focus": "Concrete examples", "tools": ["toolName1","toolName2"], "why_chosen": "Warm one-sentence reason in Ms. Humphrey's voice" }
  ]
}

Exactly 4 topics. No more, no fewer.`;
}

function sanitizeLesson(raw, date){
  if (!raw || typeof raw !== 'object') return null;
  let topics = raw.topics;
  if (!Array.isArray(topics) || topics.length === 0) return null;
  // Force exactly 4
  topics = topics.slice(0, 4);
  while (topics.length < 4){
    topics.push({ id: `extra-${topics.length}`, skill:'reading', title:'Quick review', focus:'short recap', tools:['writeWord'], why_chosen:'a quick warm-up to keep momentum' });
  }
  topics = topics.map((t, i) => ({
    id: String(t.id || `topic-${i}`).slice(0, 40),
    skill: ['math','reading','science','social'].includes(t.skill) ? t.skill : 'reading',
    title: String(t.title || 'Topic').slice(0, 60),
    focus: String(t.focus || '').slice(0, 200),
    tools: Array.isArray(t.tools) ? t.tools.filter(x => VALID_TOOLS.includes(x)).slice(0, 4) : [],
    why_chosen: String(t.why_chosen || '').slice(0, 220)
  }));
  return {
    date,
    theme: String(raw.theme || 'Daily review').slice(0, 80),
    topics,
    source: 'haiku-4.5',
    generated_at: new Date().toISOString()
  };
}

async function callHaiku(prompt){
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: HAIKU_MODEL,
      max_tokens: 1200,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  if (!r.ok){
    const body = await r.text().catch(() => '');
    throw new Error(`anthropic ${r.status}: ${body.slice(0, 200)}`);
  }
  const j = await r.json();
  return (j.content || [])
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('')
    .trim();
}

async function generateWithHaiku(ctx){
  const prompt = buildPrompt(ctx);
  const txt = await callHaiku(prompt);
  // Strip code fences if present
  const clean = txt.replace(/```json|```/g, '').trim();
  try {
    const parsed = JSON.parse(clean);
    return sanitizeLesson(parsed, ctx.date);
  } catch(e){
    console.warn('[lesson-plan] Haiku JSON parse failed:', e.message, txt.slice(0, 200));
    return null;
  }
}

async function getOrGenerateLesson({ date, childId, force }){
  // v142: if the cached lesson for today has already been completed, force a
  // fresh "second period" lesson. This is the "newly curated each visit"
  // behavior — but only kicks in after Nigel finishes the morning lesson.
  let effectiveForce = force;
  if (!effectiveForce){
    const alreadyDone = await isLessonCompletedToday(childId, date);
    if (alreadyDone){
      console.log('[lesson-plan] today already completed → forcing fresh lesson');
      effectiveForce = true;
    }
  }

  if (!effectiveForce){
    const cached = await getCachedLesson(date);
    if (cached) return cached;
  }

  // Build context
  const [recentTopicHistory, recentLessons, zonePerf] = await Promise.all([
    getRecentTopicHistory(childId),
    getRecentLessons(),
    getRecentZonePerf(childId)
  ]);

  const ctx = {
    date,
    dayOfWeek: dayOfWeekET(),
    recentTopicHistory,
    recentLessons,
    zonePerf
  };

  let lesson = null;
  try {
    lesson = await generateWithHaiku(ctx);
  } catch(e){
    console.error('[lesson-plan] Haiku generation failed', e.message || e);
  }

  if (!lesson) lesson = fallbackPlan(date);

  // Cache (best-effort). Overwrites prior cache when regenerated.
  await cacheLesson(date, lesson);

  return lesson;
}

export default async function handler(req, res){
  // CORS / GET only
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS'){ res.status(204).end(); return; }

  // Allow GET (client) and POST (cron with force)
  const isCron = req.method === 'POST' && (req.headers['x-cron-secret'] === process.env.CRON_SECRET);
  if (req.method !== 'GET' && !isCron){
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const date = String((req.query?.date) || (req.body?.date) || todayET()).slice(0, 10);
  const childId = String((req.query?.child_id) || (req.body?.child_id) || '2e0e51c5-f120-4152-8aa1-041eeecc8165');
  const force = isCron || (req.query?.force === '1');

  try {
    const lesson = await getOrGenerateLesson({ date, childId, force });
    return res.status(200).json({ ok: true, lesson });
  } catch (e){
    console.error('[lesson-plan] handler error', e);
    return res.status(200).json({ ok: true, lesson: fallbackPlan(date), error: String(e.message || e) });
  }
}
