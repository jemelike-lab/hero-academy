// Story Lab logic, ported from public/js/story-lab.js (v149) and the Today's
// Adventure script in public/story-lab.html. Pure functions so it runs under tsx.
//
// Deliberate changes from legacy:
// - "Read to me" stays disabled until her voice actually finishes, not for a
//   guessed 70 ms per character;
// - a story that will not fit in storage is saved without its drawing instead
//   of not being saved at all;
// - the story pool is topped up once per visit (legacy asked twice when low).
import { KIND_LABELS, LOCAL_TEMPLATES, VOCAB, type Kind, type Slot, type Template } from './data';

export type { Slot, Template };
export const MAX_SAVED = 30;
export const STORIES_KEY = 'ha_stories';
export const COUNT_KEY = 'ha_story_session_count';
export const STATE_KEY = 'hero_academy_state_v1';
export const PICK_MS = 500;           // legacy pause on the picked word before the next blank
export const POOL_BLOCK = 5;          // legacy warmupPool: wait for new stories below this many unseen
export const POOL_ASYNC = 30;         // …and ask for more in the background below this many

export const LINES = {
  welcome: 'Welcome to Story Lab, Nigel! Pick a story you like, and I will help you fill in the missing words. Ready? Tap one.',
  listen: (text: string) => `Listen to your story, Nigel. ${text}`,
  hereIs: (text: string) => `Here is your story, Nigel. ${text}`,
  adventureIntro: 'I wrote a story just for you today, Nigel. Listen along.',
  greatListening: 'Great listening, Nigel. Now look at the questions below — tap the right answer for each.',
  thinkAboutIt: "Now let's think about it.",
  right: (choice: string) => `Yes — ${choice}. That's right.`,
  wrong: (choice: string) => `Not quite. The answer is ${choice}.`,
  rightFeedback: "Yes — that's right!",
  wrongFeedback: (choice: string) => `Not quite — the right answer is: ${choice}`,
  done: (got: number, total: number) => `You answered ${got} of ${total} correctly.`,
};

// ---------- words ----------
export function wordsFor(kind: string): string[] { return (VOCAB[kind as Kind] || []).slice(); }
export function kindLabel(kind: string): string { return KIND_LABELS[kind as Kind] || kind; }

// ---------- templates ----------
interface ServerRow { id?: unknown; title?: unknown; emoji?: unknown; slots_json?: unknown; text_template?: unknown }
export function mapServerTemplate(row: ServerRow): Template | null {
  const slots = (Array.isArray(row.slots_json) ? row.slots_json : []).filter((s): s is Slot => !!s && typeof s.key === 'string' && typeof s.kind === 'string')
    .map((s) => ({ key: s.key, kind: s.kind, prompt: String(s.prompt || '') }));
  const text = String(row.text_template || '');
  // A blank whose kind has no word list could never be filled: leave that template out.
  if (!slots.length || !text || slots.some((s) => wordsFor(s.kind).length === 0)) return null;
  return { id: row.id ? String(row.id) : undefined, title: String(row.title || ''), emoji: String(row.emoji || '✨'), slots, text, server: true };
}
export function templatesFrom(rows: unknown): Template[] {
  const list = Array.isArray(rows) ? (rows.map((r) => mapServerTemplate(r as ServerRow)).filter(Boolean) as Template[]) : [];
  return list.length ? list : LOCAL_TEMPLATES.slice();
}
export { LOCAL_TEMPLATES };

// ---------- the finished story ----------
export type Part = { text: string } | { word: string; key: string };
export function storyParts(tpl: Template, values: Record<string, string>): Part[] {
  const out: Part[] = []; const re = /\{(\w+)\}/g; let last = 0; let m: RegExpExecArray | null;
  while ((m = re.exec(tpl.text))) {
    if (m.index > last) out.push({ text: tpl.text.slice(last, m.index) });
    out.push({ word: values[m[1]] || '???', key: m[1] });
    last = m.index + m[0].length;
  }
  if (last < tpl.text.length) out.push({ text: tpl.text.slice(last) });
  return out;
}
export function storyText(parts: Part[]): string { return parts.map((p) => ('word' in p ? p.word : p.text)).join(''); }

// ---------- saved stories ----------
export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void }
export interface SavedStory { id: string; templateId?: string; title: string; emoji: string; slots: Record<string, string>; text: string; drawing: string | null; createdAt: string }
function readJSON<T>(store: KV, key: string, fallback: T): T { try { const raw = store.getItem(key); return raw ? (JSON.parse(raw) as T) : fallback; } catch { return fallback; } }
export function readSaved(store: KV): SavedStory[] { const v = readJSON<unknown>(store, STORIES_KEY, []); return Array.isArray(v) ? (v as SavedStory[]) : []; }

// Legacy saveStory(): keep the last 30, bump the story count, +10 writing
// progress and +2 coins, and count the zone once toward today's three.
export function saveStory(store: KV, story: SavedStory): { saved: SavedStory[]; withDrawing: boolean } {
  let list = readSaved(store); list.push(story);
  if (list.length > MAX_SAVED) list = list.slice(-MAX_SAVED);
  let withDrawing = !!story.drawing;
  try { store.setItem(STORIES_KEY, JSON.stringify(list)); } catch {
    // Storage full: keep the words, drop this drawing.
    list[list.length - 1] = { ...story, drawing: null }; withDrawing = false;
    try { store.setItem(STORIES_KEY, JSON.stringify(list)); } catch { /* storage unavailable */ }
  }
  const n = readJSON<number>(store, COUNT_KEY, 0) + 1;
  try { store.setItem(COUNT_KEY, JSON.stringify(n)); } catch { /* ignore */ }
  const st = readJSON<Record<string, unknown>>(store, STATE_KEY, {});
  const zp = (st.zoneProgress as Record<string, number>) || {};
  zp.writing = Math.min(100, (zp.writing || 0) + 10);
  st.zoneProgress = zp;
  st.coins = (Number(st.coins) || 0) + 2;
  st.zonesCompletedToday = Math.min(3, (Number(st.zonesCompletedToday) || 0) + (n === 1 ? 1 : 0));
  try { store.setItem(STATE_KEY, JSON.stringify(st)); } catch { /* ignore */ }
  return { saved: list, withDrawing };
}

// Legacy v199 cap-proof Today's Mission flag (UTC date), set when a story is finished.
export function markDone(store: KV, now = new Date()) {
  try {
    const k = 'ha_zone_done_' + now.toISOString().slice(0, 10);
    const d = JSON.parse(store.getItem(k) || '{}'); d.writing = true; store.setItem(k, JSON.stringify(d));
  } catch { /* ignore */ }
}
// Welcome once a day (legacy ha_welcomed_storylab_<UTC date>).
export function firstVisitToday(store: KV, now = new Date()): boolean {
  const k = 'ha_welcomed_storylab_' + now.toISOString().slice(0, 10);
  try { if (store.getItem(k) === '1') return false; store.setItem(k, '1'); } catch { /* ignore */ }
  return true;
}

// ---------- Today's Adventure ----------
export interface MCQ { q: string; choices: string[]; answer: number }
export interface Adventure { title: string; paragraphs: string[]; questions: MCQ[]; otherQuestions: string[]; contentDate: string | null }

// ha_get_todays_content returns { payload, content_date, is_today }.
export function adventureFrom(result: unknown): Adventure | null {
  const r = (result && typeof result === 'object' ? result : {}) as { payload?: unknown; content_date?: unknown };
  const p = (r.payload && typeof r.payload === 'object' ? r.payload : null) as { title?: unknown; body?: unknown; comprehension_questions?: unknown } | null;
  if (!p || typeof p.body !== 'string' || !p.body.trim()) return null;
  const paragraphs = p.body.split('\n\n').map((s) => s.trim()).filter(Boolean);
  const all = Array.isArray(p.comprehension_questions) ? p.comprehension_questions : [];
  const questions: MCQ[] = []; const otherQuestions: string[] = [];
  all.forEach((raw) => {
    const q = raw as { q?: unknown; choices?: unknown; answer_index?: unknown };
    if (q && typeof q.q === 'string' && Array.isArray(q.choices) && q.choices.length >= 2 && typeof q.answer_index === 'number' && q.answer_index >= 0 && q.answer_index < q.choices.length) {
      questions.push({ q: q.q, choices: q.choices.map(String), answer: q.answer_index });
    } else if (q && typeof q.q === 'string') otherQuestions.push(q.q);
  });
  return { title: String(p.title || "Today's Adventure"), paragraphs, questions, otherQuestions, contentDate: typeof r.content_date === 'string' ? r.content_date : null };
}

// Legacy splitForTts: chunks of at most 450 characters, split on sentences, then words.
export function splitForTts(text: string, MAX = 450): string[] {
  const t = String(text || '').trim(); if (!t) return [];
  if (t.length <= MAX) return [t];
  const out: string[] = []; let buf = '';
  for (const s of t.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [t]) {
    const sentence = s.trim(); if (!sentence) continue;
    if ((buf + ' ' + sentence).trim().length > MAX) {
      if (buf) out.push(buf.trim());
      if (sentence.length > MAX) {
        let line = '';
        for (const w of sentence.split(/\s+/)) {
          if ((line + ' ' + w).trim().length > MAX) { if (line) out.push(line.trim()); line = w; } else line = (line + ' ' + w).trim();
        }
        buf = line;
      } else buf = sentence;
    } else buf = (buf + ' ' + sentence).trim();
  }
  if (buf) out.push(buf.trim());
  return out;
}
// What she says while reading, each piece tagged with the page (paragraph) it belongs to; -1 is the intro.
export function readingChunks(a: Adventure): { page: number; text: string }[] {
  const out = [{ page: -1, text: LINES.adventureIntro }];
  a.paragraphs.forEach((para, i) => splitForTts(para).forEach((text) => out.push({ page: i, text })));
  return out;
}
