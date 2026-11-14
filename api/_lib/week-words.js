// v315 Writing Time helpers: what Nigel saw this week, and the words and
// sentences Ms. Humphrey will use for dictation and the Friday spelling test.
//
// "Learned this week" = the words in this week's Class Time lesson plans
// (ha_day_lesson_plans, Monday through the given day). Spelling courses count
// most, then sight-word lists in Reading, then simple words in Writing and
// Grammar examples. Vocabulary words (habitat, ecosystem…) are for meaning,
// not spelling, so they are left out.

export function weekStartOf(dateISO) {
  const d = new Date(dateISO + 'T12:00:00Z');
  const dow = d.getUTCDay() || 7; // Sun = 7
  d.setUTCDate(d.getUTCDate() - (dow - 1));
  return d.toISOString().slice(0, 10);
}

export function addDays(dateISO, n) {
  const d = new Date(dateISO + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function fridayOf(dateISO) { return addDays(weekStartOf(dateISO), 4); }

const TOO_COMMON = new Set(['a', 'i', 'an', 'is', 'it', 'to', 'of', 'in', 'on', 'at', 'be', 'or']);
const NOT_WORDS = new Set(['cvc', 'vs', 'eg', 'etc', 'ing', 'ed', 'es', 'ch', 'sh', 'th', 'wh', 'bl', 'st', 'gr']);

function wordsIn(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z'\s,]/g, ' ')
    .split(/[\s,]+/)
    .map((w) => w.replace(/^'+|'+$/g, ''))
    .filter((w) => /^[a-z]{2,9}$/.test(w) && !TOO_COMMON.has(w) && !NOT_WORDS.has(w));
}

// A topic's focus is either a word list ("cat, dog, run") or prose
// ("understanding main idea"). Only word lists are worth spelling.
function looksLikeWordList(focus) {
  const parts = String(focus || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return false;
  const single = parts.filter((p) => /^[A-Za-z]{2,9}$/.test(p)).length;
  return single / parts.length >= 0.6;
}

function spellingGroup(title) {
  const t = String(title || '').toLowerCase();
  if (/sight|high.frequency/.test(t)) return 'sight';
  if (/blend/.test(t)) return 'blend';
  if (/digraph|ch, sh|sh, th/.test(t)) return 'digraph';
  if (/family|famil/.test(t)) return 'family';
  return 'phonetic';
}

function sentencesIn(text) {
  return (String(text || '').match(/[A-Z][A-Za-z' ]{4,60}[.?!]/g) || [])
    .map((s) => s.trim())
    .filter((s) => { const n = s.split(/\s+/).length; return n >= 3 && n <= 8; });
}

/**
 * plans: [{ plan_date, plan }] for the week. Returns
 * { words: [{ word, weight, days }], sentences: [string] } ranked best first.
 */
export function collectWeekWords(plans) {
  const tally = new Map(); // word -> { weight, days:Set, order }
  const sentences = [];
  let order = 0;
  const add = (w, weight, day, group = 'other') => {
    const t = tally.get(w) || { weight: 0, days: new Set(), order: order++, group };
    if (weight > t.weight) { t.weight = weight; t.group = group; }
    t.days.add(day);
    tally.set(w, t);
  };
  for (const row of plans || []) {
    const day = String(row.plan_date);
    for (const c of row.plan?.courses || []) {
      const subj = String(c.subject || '').toLowerCase();
      for (const t of c.topics || []) {
        const focus = String(t.focus || '');
        const title = String(t.title || '');
        if (subj === 'writing' || subj === 'grammar') sentences.push(...sentencesIn(focus));
        if (subj === 'spelling' && looksLikeWordList(focus)) wordsIn(focus).forEach((w) => add(w, 3, day, spellingGroup(title)));
        else if (subj === 'reading' && /sight|high.frequency/i.test(title) && looksLikeWordList(focus)) wordsIn(focus).forEach((w) => add(w, 2, day));
        else if ((subj === 'grammar' || subj === 'writing') && looksLikeWordList(focus)) wordsIn(focus).forEach((w) => add(w, 1, day));
      }
    }
  }
  const words = [...tally.entries()]
    .map(([word, t]) => ({ word, weight: t.weight, days: t.days.size, order: t.order, group: t.group }))
    .sort((a, b) => b.weight - a.weight || b.days - a.days || a.order - b.order)
    .map(({ word, weight, days, group }) => ({ word, weight, days, group }));
  return { words, sentences: [...new Set(sentences)] };
}

// Dolch 2nd-grade list, used only to fill a short week.
export const SECOND_GRADE_SIGHT = ['always', 'around', 'because', 'been', 'before', 'best', 'both', 'call', 'cold', 'does', 'fast', 'first', 'found', 'gave', 'goes', 'green', 'made', 'many', 'pull', 'read', 'right', 'sleep', 'tell', 'their', 'these', 'those', 'upon', 'very', 'wash', 'which', 'wish', 'work', 'would', 'write', 'your'];

function seededPick(list, n, seedText) {
  let h = 0; for (const ch of seedText) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { h = (h * 1103515245 + 12345) >>> 0; const j = h % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
}

/** Ten words: mostly spelling-course words, a few sight words, topped up if the week was thin. */
export function pickSpellingWords(ranked, weekStart, n = 10) {
  const out = [];
  // Spelling-course words first, taking turns across the kinds he practised
  // (short-vowel, blends, sight words…) so the test isn't ten CVC words.
  const groups = new Map();
  for (const w of ranked.filter((x) => x.weight === 3)) { if (!groups.has(w.group)) groups.set(w.group, []); groups.get(w.group).push(w.word); }
  const queues = [...groups.values()];
  while (out.length < n && queues.some((q) => q.length)) for (const q of queues) { if (out.length < n && q.length) out.push(q.shift()); }
  // A thin week: Reading sight words (longest first; 'the' is too easy), then Writing/Grammar words.
  const sight = ranked.filter((w) => w.weight === 2).map((w) => w.word).sort((a, b) => b.length - a.length);
  const other = ranked.filter((w) => w.weight === 1).map((w) => w.word);
  for (const w of [...sight, ...other]) { if (out.length >= n) break; if (!out.includes(w)) out.push(w); }
  const fromLessons = out.length;
  for (const w of seededPick(SECOND_GRADE_SIGHT, SECOND_GRADE_SIGHT.length, weekStart)) { if (out.length >= n) break; if (!out.includes(w)) out.push(w); }
  return { words: out.slice(0, n), fromLessons };
}

export const FALLBACK_SENTENCES = [
  'I can run fast.', 'The cat sat on the mat.', 'We can see the sun.', 'Is the dog big?', 'She has a red hat.',
  'My mom said yes.', 'The fish can swim.', 'Can you come and play?', 'He went to the park.', 'I have a big bed.',
  'The bird is in the tree.', 'Look at the frog jump!', 'We like to read books.', 'Dad and I made a cake.', 'The bus is not here.',
  'Where is my cup?', 'The pig is in the mud.', 'I want to go out.', 'They play with the ball.', 'It is cold today.',
];

const SENTENCE_RE = /^[A-Z][A-Za-z' ]*[A-Za-z][.?!]$/;
export function validSentence(s) {
  if (typeof s !== 'string') return false;
  const t = s.trim();
  if (!SENTENCE_RE.test(t) || /\s{2,}/.test(t)) return false;
  const n = t.split(/\s+/).length;
  return n >= 3 && n <= 8;
}

export function fallbackDictation(dateISO, lessonSentences, n = 5) {
  const ours = (lessonSentences || []).filter(validSentence);
  const pool = [...new Set([...ours, ...seededPick(FALLBACK_SENTENCES, FALLBACK_SENTENCES.length, dateISO)])];
  // Short ones first: two short, then longer.
  const short = pool.filter((s) => s.split(/\s+/).length <= 4);
  const long = pool.filter((s) => s.split(/\s+/).length > 4);
  return [...short.slice(0, 2), ...long].concat(short.slice(2)).slice(0, n);
}

export function fallbackSpellingSentence(word) {
  return `Can you spell the word ${word}?`;
}

const HAIKU_MODEL = 'claude-haiku-4-5';

async function haikuJSON(apiKey, system, user, maxTokens = 900) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: HAIKU_MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
  });
  if (!r.ok) throw new Error('anthropic ' + r.status);
  const j = await r.json();
  const text = (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  return JSON.parse(text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim());
}

/** Five dictation sentences built from the week's words. Returns null on any failure. */
export async function haikuDictation(apiKey, words, lessonSentences, n = 5) {
  const system = [
    'You are Ms. Humphrey, a warm 2nd-grade teacher. You are writing a short dictation for Nigel, who is 7 and finds writing hard.',
    `Write EXACTLY ${n} sentences that you will say aloud and he will write by hand.`,
    'Rules:',
    '- Sentences 1 and 2: 3 to 4 words. Sentences 3 to 5: 5 to 7 words.',
    "- Use this week's words wherever they fit, and otherwise only short words a struggling 2nd grader can sound out (CVC words, blends, common sight words).",
    '- Start with a capital letter. End with a period, a question mark, or an exclamation mark. At least one question.',
    '- No commas, quotation marks, numbers, hyphens, or names (Mom and Dad are fine).',
    '- Each sentence makes sense on its own and is something a child would say.',
    'Return JSON only: {"sentences":["...","..."]}',
  ].join('\n');
  const user = `This week's words: ${words.slice(0, 30).join(', ') || '(none)'}\nExample sentences from this week's lessons: ${lessonSentences.slice(0, 6).join(' ') || '(none)'}`;
  const out = await haikuJSON(apiKey, system, user);
  const s = (out?.sentences || []).map((x) => String(x).trim()).filter(validSentence);
  return s.length >= n ? s.slice(0, n) : null;
}

/** One short sentence per spelling word, each using the word as written. */
export async function haikuSpellingSentences(apiKey, words) {
  const system = [
    'You are Ms. Humphrey, a warm 2nd-grade teacher giving Nigel (age 7) his Friday spelling test.',
    'For each word, write one short sentence (4 to 8 words) that uses the word exactly as given, so he hears it in context.',
    'Simple words only. No names except Mom and Dad. No commas or quotation marks.',
    'Return JSON only: {"items":[{"word":"...","sentence":"..."}]} in the same order as given.',
  ].join('\n');
  const out = await haikuJSON(apiKey, system, `Words: ${words.join(', ')}`);
  const map = new Map();
  for (const it of out?.items || []) {
    const w = String(it?.word || '').toLowerCase().trim();
    const s = String(it?.sentence || '').trim();
    const n = s.split(/\s+/).length;
    if (w && n >= 3 && n <= 10 && new RegExp(`\\b${w}\\b`, 'i').test(s) && /^[A-Z][A-Za-z' ]*[.?!]$/.test(s)) map.set(w, s);
  }
  return map;
}
