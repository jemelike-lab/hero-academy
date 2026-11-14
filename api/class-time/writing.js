/**
 * Hero Academy — /api/class-time/writing (v315 Writing Time)
 *
 * Dictation at the end of Class Time and the Friday spelling test. Ms.
 * Humphrey says a sentence (or a word), Nigel writes it by hand, and the
 * exact text she said is stored beside his handwriting for the parents.
 * Nothing here grades dictation. Parents mark spelling words themselves.
 *
 *   GET  ?action=set&kind=dictation|spelling&date=YYYY-MM-DD[&child_id]
 *        → { set: { id, kind, set_date, week_start, items, source }, done: [item_index…] }
 *          Generated once and cached (dictation per day, spelling per week,
 *          keyed to that week's Friday) so a reload hears the same thing.
 *   POST ?action=attempt  { set_id, item_index, drawing_png, spoken_text, replays, started_at }
 *        → { ok, id }   A redo adds a row; nothing is overwritten.
 *   GET  ?action=days[&limit=30]
 *        → { days: [{ set_date, kinds: { dictation: {items, written}, spelling: {…, right, wrong} } }] }
 *   GET  ?action=day&date=YYYY-MM-DD
 *        → { date, sets: [{ …set, attempts: [{ id, item_index, prompt_text, spoken_text, drawing_png, replays, submitted_at, parent_mark, parent_note, marked_by }] }] }
 *   POST ?action=mark { attempt_id, mark: 'right'|'wrong'|null, note?, by? }
 *        → { ok }   mark only on spelling attempts; a note on either.
 */
import {
  addDays, collectWeekWords, fallbackDictation, fallbackSpellingSentence, fridayOf,
  haikuDictation, haikuSpellingSentences, pickSpellingWords, weekStartOf,
} from '../_lib/week-words.js';

const DEFAULT_CHILD = '2e0e51c5-f120-4152-8aa1-041eeecc8165';
const DICTATION_COUNT = 5;
const SPELLING_COUNT = 10;
const MAX_PNG = 1_500_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f-]{36}$/i;

function env() {
  return { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY, ai: process.env.ANTHROPIC_API_KEY };
}

async function rest(e, path, { method = 'GET', body, prefer } = {}) {
  const r = await fetch(`${e.url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: e.key, authorization: `Bearer ${e.key}`, 'content-type': 'application/json', accept: 'application/json',
      ...(prefer ? { prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`supabase ${method} ${path.split('?')[0]} ${r.status}: ${txt.slice(0, 200)}`);
  return txt ? JSON.parse(txt) : null;
}

function readBody(req) {
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  return b && typeof b === 'object' ? b : {};
}

function todayET() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

async function weekPlans(e, childId, weekStart, upTo) {
  const q = `ha_day_lesson_plans?child_id=eq.${childId}&plan_date=gte.${weekStart}&plan_date=lte.${upTo}&select=plan_date,plan&order=plan_date.asc`;
  return (await rest(e, q)) || [];
}

async function buildSet(e, childId, kind, setDate) {
  const weekStart = weekStartOf(setDate);
  const plans = await weekPlans(e, childId, weekStart, kind === 'spelling' ? addDays(weekStart, 4) : setDate);
  const { words, sentences } = collectWeekWords(plans);
  const wordList = words.map((w) => w.word);

  if (kind === 'dictation') {
    let list = null; let source = 'haiku';
    if (e.ai) { try { list = await haikuDictation(e.ai, wordList, sentences, DICTATION_COUNT); } catch { list = null; } }
    if (!list) { list = fallbackDictation(setDate, sentences, DICTATION_COUNT); source = 'fallback'; }
    return { weekStart, weekWords: wordList, source, items: list.map((text, index) => ({ index, text })) };
  }

  const { words: picked, fromLessons } = pickSpellingWords(words, weekStart, SPELLING_COUNT);
  let sentencesByWord = new Map(); let source = fromLessons >= SPELLING_COUNT ? 'lessons' : `lessons+sight(${SPELLING_COUNT - fromLessons})`;
  if (e.ai) { try { sentencesByWord = await haikuSpellingSentences(e.ai, picked); } catch { sentencesByWord = new Map(); } }
  if (sentencesByWord.size < picked.length) source += '+template';
  return {
    weekStart, weekWords: wordList, source,
    items: picked.map((word, index) => ({ index, word, sentence: sentencesByWord.get(word) || fallbackSpellingSentence(word), from_lessons: index < fromLessons })),
  };
}

async function getOrCreateSet(e, childId, kind, date) {
  const setDate = kind === 'spelling' ? fridayOf(date) : date;
  const sel = 'id,kind,set_date,week_start,items,source,week_words';
  const found = await rest(e, `ha_writing_sets?child_id=eq.${childId}&kind=eq.${kind}&set_date=eq.${setDate}&select=${sel}`);
  if (found?.length) return found[0];
  const built = await buildSet(e, childId, kind, setDate);
  const row = { child_id: childId, kind, set_date: setDate, week_start: built.weekStart, items: built.items, week_words: built.weekWords, source: built.source };
  // ignore-duplicates: if two tabs race, the first one wins and both read it back.
  await rest(e, 'ha_writing_sets?on_conflict=child_id,set_date,kind', { method: 'POST', body: row, prefer: 'resolution=ignore-duplicates,return=minimal' });
  const again = await rest(e, `ha_writing_sets?child_id=eq.${childId}&kind=eq.${kind}&set_date=eq.${setDate}&select=${sel}`);
  return again[0];
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const e = env();
  if (!e.url || !e.key) return res.status(500).json({ error: 'not_configured' });
  const action = String(req.query?.action || '');
  const childId = UUID_RE.test(String(req.query?.child_id || '')) ? String(req.query.child_id) : (process.env.PRIMARY_CHILD_ID || DEFAULT_CHILD);

  try {
    if (action === 'set' && req.method === 'GET') {
      const kind = String(req.query?.kind || '');
      if (kind !== 'dictation' && kind !== 'spelling') return res.status(400).json({ error: 'bad_kind' });
      const date = DATE_RE.test(String(req.query?.date || '')) ? String(req.query.date) : todayET();
      const set = await getOrCreateSet(e, childId, kind, date);
      // For dictation only today's writing counts; a spelling test is done once per week.
      const done = await rest(e, `ha_writing_attempts?set_id=eq.${set.id}&select=item_index`);
      return res.status(200).json({ set: { id: set.id, kind: set.kind, set_date: set.set_date, week_start: set.week_start, items: set.items, source: set.source }, done: [...new Set((done || []).map((d) => d.item_index))].sort((a, b) => a - b) });
    }

    if (action === 'attempt' && req.method === 'POST') {
      const b = readBody(req);
      const setId = String(b.set_id || '');
      const idx = Number(b.item_index);
      const png = String(b.drawing_png || '');
      if (!UUID_RE.test(setId) || !Number.isInteger(idx) || idx < 0) return res.status(400).json({ error: 'bad_request' });
      if (!png.startsWith('data:image/png;base64,') || png.length > MAX_PNG) return res.status(400).json({ error: 'bad_drawing' });
      const sets = await rest(e, `ha_writing_sets?id=eq.${setId}&select=id,child_id,kind,set_date,items`);
      const set = sets?.[0];
      const item = set?.items?.find((it) => it.index === idx);
      if (!set || !item) return res.status(404).json({ error: 'no_such_item' });
      // The prompt comes from the stored set, never from the browser.
      const prompt = set.kind === 'dictation' ? item.text : item.word;
      const row = {
        child_id: set.child_id, set_id: set.id, kind: set.kind, set_date: set.set_date, item_index: idx,
        prompt_text: prompt, spoken_text: String(b.spoken_text || prompt).slice(0, 1000), drawing_png: png,
        replays: Math.max(0, Math.min(99, Number(b.replays) || 0)),
        started_at: typeof b.started_at === 'string' && !Number.isNaN(Date.parse(b.started_at)) ? b.started_at : null,
      };
      const out = await rest(e, 'ha_writing_attempts?select=id', { method: 'POST', body: row, prefer: 'return=representation' });
      return res.status(200).json({ ok: true, id: out?.[0]?.id });
    }

    if (action === 'days' && req.method === 'GET') {
      const limit = Math.max(1, Math.min(120, Number(req.query?.limit) || 30));
      const sets = await rest(e, `ha_writing_sets?child_id=eq.${childId}&select=id,kind,set_date,items&order=set_date.desc&limit=${limit * 2}`);
      const ids = (sets || []).map((s) => s.id);
      const atts = ids.length ? await rest(e, `ha_writing_attempts?set_id=in.(${ids.join(',')})&select=set_id,item_index,parent_mark,submitted_at&order=submitted_at.asc`) : [];
      const byDate = new Map();
      for (const s of sets || []) {
        const mine = (atts || []).filter((a) => a.set_id === s.id);
        if (!mine.length) continue;
        const latest = new Map(); for (const a of mine) latest.set(a.item_index, a);
        const d = byDate.get(s.set_date) || { set_date: s.set_date, kinds: {} };
        d.kinds[s.kind] = {
          items: (s.items || []).length,
          written: latest.size,
          right: [...latest.values()].filter((a) => a.parent_mark === 'right').length,
          wrong: [...latest.values()].filter((a) => a.parent_mark === 'wrong').length,
          last_at: mine[mine.length - 1].submitted_at,
        };
        byDate.set(s.set_date, d);
      }
      return res.status(200).json({ days: [...byDate.values()].sort((a, b) => (a.set_date < b.set_date ? 1 : -1)).slice(0, limit) });
    }

    if (action === 'day' && req.method === 'GET') {
      const date = String(req.query?.date || '');
      if (!DATE_RE.test(date)) return res.status(400).json({ error: 'bad_date' });
      const sets = await rest(e, `ha_writing_sets?child_id=eq.${childId}&set_date=eq.${date}&select=id,kind,set_date,week_start,items,source,week_words`);
      const out = [];
      for (const s of sets || []) {
        const atts = await rest(e, `ha_writing_attempts?set_id=eq.${s.id}&select=id,item_index,prompt_text,spoken_text,drawing_png,replays,started_at,submitted_at,parent_mark,parent_note,marked_by,marked_at&order=item_index.asc,submitted_at.asc`);
        out.push({ ...s, attempts: atts || [] });
      }
      out.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'dictation' ? -1 : 1));
      return res.status(200).json({ date, sets: out });
    }

    if (action === 'mark' && req.method === 'POST') {
      const b = readBody(req);
      const id = String(b.attempt_id || '');
      if (!UUID_RE.test(id)) return res.status(400).json({ error: 'bad_request' });
      const rows = await rest(e, `ha_writing_attempts?id=eq.${id}&select=id,kind`);
      if (!rows?.length) return res.status(404).json({ error: 'not_found' });
      const patch = { marked_by: String(b.by || '').slice(0, 20) || null, marked_at: new Date().toISOString() };
      if ('mark' in b) {
        if (rows[0].kind !== 'spelling') return res.status(400).json({ error: 'dictation_is_not_graded' });
        if (b.mark !== null && b.mark !== 'right' && b.mark !== 'wrong') return res.status(400).json({ error: 'bad_mark' });
        patch.parent_mark = b.mark;
      }
      if ('note' in b) patch.parent_note = b.note == null ? null : String(b.note).slice(0, 500);
      await rest(e, `ha_writing_attempts?id=eq.${id}`, { method: 'PATCH', body: patch, prefer: 'return=minimal' });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'bad_action' });
  } catch (err) {
    return res.status(502).json({ error: 'writing_failed', detail: String(err?.message || err).slice(0, 200) });
  }
}
