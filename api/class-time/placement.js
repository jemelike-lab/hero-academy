/**
 * Hero Academy — placement check ("find my level"), v306.
 * GET /api/class-time/placement?subject=math&child_id=...
 *
 * Picks four topics spread across the subject's sequence (easy → hard),
 * skipping ones already mastered, and asks Haiku for 8 questions (two per
 * topic) with the normal Class Time generator. Nothing is cached: a level
 * check is a one-off. The client records each answer with
 * ha_record_topic_attempt, which is what tomorrow's plan reads.
 */
import { generateWithHaiku, supabaseRpc } from './questions.js';

export default async function handler(req, res) {
  const SUPA_URL = process.env.SUPABASE_URL;
  const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  const subject = String(req.query?.subject || 'math').toLowerCase().slice(0, 40);
  const childId = String(req.query?.child_id || process.env.PRIMARY_CHILD_ID || '2e0e51c5-f120-4152-8aa1-041eeecc8165');
  if (!SUPA_URL || !SUPA_KEY || !ANTHROPIC_KEY) return res.status(500).json({ error: 'not_configured' });

  let topics = [];
  try {
    topics = await supabaseRpc(SUPA_URL, SUPA_KEY, 'ha_get_subject_path', { p_child_id: childId, p_subject: subject });
  } catch (e) {
    return res.status(500).json({ error: 'path_failed', detail: String(e.message || e).slice(0, 200) });
  }
  const ladder = (Array.isArray(topics) ? topics : [])
    .filter((t) => t.sequence_order != null && !t.mastered);
  const pool = ladder.length >= 4 ? ladder : (Array.isArray(topics) ? topics : []).filter((t) => !t.mastered);
  if (pool.length < 2) return res.status(200).json({ ok: true, subject, topics: [], questions: [], note: 'nothing_to_place' });

  // Four stops spread evenly across the ladder
  const picks = [];
  const n = Math.min(4, pool.length);
  for (let i = 0; i < n; i++) {
    const idx = Math.round((i / Math.max(1, n - 1)) * (pool.length - 1));
    const t = pool[idx];
    if (!picks.find((p) => p.id === t.topic_id)) picks.push({ id: t.topic_id, title: t.title, focus: t.description || '' });
  }

  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const coursePlan = { order: 0, subject, subject_label: subject, topics: picks, difficulty: 'standard', review_topics: [] };
  let questions = [];
  for (let attempt = 1; attempt <= 2 && questions.length < 4; attempt++) {
    try { questions = (await generateWithHaiku(ANTHROPIC_KEY, subject, coursePlan, date)) || []; } catch (e) { questions = []; }
  }
  // Keep order easy → hard by topic pick order, max two per topic
  const byTopic = new Map(picks.map((p) => [p.id, []]));
  for (const q of questions) { if (byTopic.has(q.topic) && byTopic.get(q.topic).length < 2) byTopic.get(q.topic).push(q); }
  let ordered = picks.flatMap((p) => byTopic.get(p.id));
  if (ordered.length < 4) ordered = questions.slice(0, 8);

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ ok: true, subject, topics: picks, questions: ordered.slice(0, 8) });
}
