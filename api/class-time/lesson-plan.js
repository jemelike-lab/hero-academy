// api/class-time/lesson-plan.js
// GET /api/class-time/lesson-plan?date=YYYY-MM-DD&child_id=...
// Returns today's curated lesson plan. Reads from Supabase cache; generates via Haiku if missing.
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

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

function getClients(){
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return { supabase, anthropic };
}

async function getRecentTopicHistory(supabase, childId){
  // Last 14 days of class_time_complete events to track topic variety
  try {
    const { data } = await supabase
      .from('ha_events')
      .select('payload, created_at')
      .eq('child_id', childId)
      .eq('event_type', 'class_time_complete')
      .gte('created_at', new Date(Date.now() - 14*86400000).toISOString())
      .order('created_at', { ascending: false })
      .limit(30);
    return data || [];
  } catch (e){ return []; }
}

async function getRecentLessons(supabase){
  try {
    const { data } = await supabase
      .from('ha_class_time_lessons')
      .select('date, lesson')
      .order('date', { ascending: false })
      .limit(7);
    return data || [];
  } catch(e){ return []; }
}

async function getRecentZonePerf(supabase, childId){
  // Snapshot of strugglers/strong areas — last 7 days
  try {
    const { data } = await supabase
      .from('ha_difficulty_state')
      .select('skill_id, current_level, recent_accuracy, updated_at')
      .eq('child_id', childId);
    return data || [];
  } catch(e){ return []; }
}

function fallbackPlan(date){
  // Same fallback shape as client-side, but server-side for cron use
  const doy = (() => {
    const d = new Date(date + 'T12:00:00Z');
    const start = new Date(d.getFullYear(), 0, 0);
    return Math.floor((d - start) / 86400000);
  })();
  const pool = [
    { id:'addition-10', skill:'math', title:'Addition within 10', focus:'7+3, 6+4, 8+2', tools:['drawDots','drawTenFrame','drawEquation'] },
    { id:'count-by-2', skill:'math', title:'Counting by 2s', focus:'2,4,6,8,10', tools:['drawNumber','drawDots'] },
    { id:'sight-words', skill:'reading', title:'Sight words', focus:'the, and, was, said', tools:['writeWord'] },
    { id:'letter-sounds', skill:'reading', title:'Letter sounds', focus:'b, d, p, q', tools:['writeLetter'] },
    { id:'living-things', skill:'science', title:'Living things', focus:'plants, animals', tools:['showVisual'] },
    { id:'subtract-5', skill:'math', title:'Subtraction within 5', focus:'5-2, 4-1, 3-3', tools:['drawTenFrame','drawEquation'] },
    { id:'rhyming', skill:'reading', title:'Rhyming words', focus:'cat/hat, dog/log', tools:['writeWord'] },
    { id:'maryland', skill:'social', title:'Maryland symbols', focus:'flag, oriole, blue crab', tools:['showVisual'] }
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
- showVisual(topic) — picture, ONE of: ${VALID_VISUALS.join(', ')}
- clearBoard() — wipe

Design 4 topics that fit a 7-minute class (about 90 seconds each). Each topic must:
- Be a SINGLE focused skill, not a survey
- Be appropriate for a 7yo 2nd grader, depth over breadth
- Include 'focus' — a few concrete examples she'll use
- Include 'tools' — which board tools she'll actually use (subset of: drawNumber, drawDots, drawTenFrame, writeWord, writeLetter, drawEquation, showVisual)

Mix subjects. Don't do 4 math topics. Aim for 2 math + 1 reading + 1 science/social.

Today is ${ctx.dayOfWeek}, ${ctx.date}.

Recent topics (avoid repeating these exact titles): ${recentTitlesUnique.length ? recentTitlesUnique.join('; ') : 'none'}

Skills Nigel has been struggling with (consider reinforcing one): ${strugglers.length ? strugglers.join(', ') : 'none flagged'}

Maryland homeschool standards apply (CCSS + MD MCCRS 2nd grade) — math operations within 100, place value, telling time, reading comprehension, phonics, life science, MD geography/civics.

Respond ONLY with valid JSON, no preamble, no markdown:
{
  "theme": "short phrase like 'Number sense + sight words' or 'Maryland day'",
  "topics": [
    { "id": "kebab-case-id", "skill": "math|reading|science|social", "title": "Short title", "focus": "Concrete examples", "tools": ["toolName1","toolName2"] }
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
    topics.push({ id: `extra-${topics.length}`, skill:'reading', title:'Quick review', focus:'short recap', tools:['writeWord'] });
  }
  topics = topics.map((t, i) => ({
    id: String(t.id || `topic-${i}`).slice(0, 40),
    skill: ['math','reading','science','social'].includes(t.skill) ? t.skill : 'reading',
    title: String(t.title || 'Topic').slice(0, 60),
    focus: String(t.focus || '').slice(0, 200),
    tools: Array.isArray(t.tools) ? t.tools.filter(x => VALID_TOOLS.includes(x)).slice(0, 4) : []
  }));
  return {
    date,
    theme: String(raw.theme || 'Daily review').slice(0, 80),
    topics,
    source: 'haiku-4.5',
    generated_at: new Date().toISOString()
  };
}

async function generateWithHaiku(anthropic, ctx){
  const prompt = buildPrompt(ctx);
  const r = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1200,
    messages: [{ role: 'user', content: prompt }]
  });
  const txt = (r.content[0] && r.content[0].text) ? r.content[0].text : '';
  // Strip code fences if present
  const clean = txt.replace(/```json|```/g, '').trim();
  try {
    const parsed = JSON.parse(clean);
    return sanitizeLesson(parsed, ctx.date);
  } catch (e){
    console.warn('[lesson-plan] Haiku JSON parse failed:', e.message, txt.slice(0, 200));
    return null;
  }
}

async function getOrGenerateLesson(supabase, anthropic, { date, childId, force }){
  if (!force){
    const { data: cached } = await supabase
      .from('ha_class_time_lessons')
      .select('lesson')
      .eq('date', date)
      .maybeSingle();
    if (cached && cached.lesson) return cached.lesson;
  }

  // Build context
  const [recentTopicHistory, recentLessons, zonePerf] = await Promise.all([
    getRecentTopicHistory(supabase, childId),
    getRecentLessons(supabase),
    getRecentZonePerf(supabase, childId)
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
    lesson = await generateWithHaiku(anthropic, ctx);
  } catch(e){
    console.error('[lesson-plan] Haiku generation failed', e);
  }

  if (!lesson) lesson = fallbackPlan(date);

  // Cache
  try {
    await supabase
      .from('ha_class_time_lessons')
      .upsert({ date, lesson, generated_at: new Date().toISOString() }, { onConflict: 'date' });
  } catch(e){
    console.warn('[lesson-plan] cache write failed', e);
  }

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
    const { supabase, anthropic } = getClients();
    const lesson = await getOrGenerateLesson(supabase, anthropic, { date, childId, force });
    return res.status(200).json({ ok: true, lesson });
  } catch (e){
    console.error('[lesson-plan] handler error', e);
    return res.status(200).json({ ok: true, lesson: fallbackPlan(date), error: String(e.message || e) });
  }
}
