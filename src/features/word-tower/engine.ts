// Word Tower session logic, ported 1:1 from public/js/word-tower-reading.js (v174c/v175).
// Pure functions: storage and randomness are injected so this runs under tsx.
import type { Level, WordItem } from './words';

export const WORDS_PER_SESSION = 8;
export const POST_SPEECH_PAUSE_MS = 2000;     // after "Yes! ship." before the next word
export const REVEAL_EXTRA_MS = 1000;           // extra pause after a reveal
export const TTS_SAFETY_MS = 20000;            // advance anyway if speech never resolves
export const FIRST_WORD_DELAY_MS = 300;        // let the cards settle before Humphrey speaks
export const STORAGE_KEY = 'ha_word_tower_words';

export interface SessionWord extends WordItem { distractors: string[] }
export interface WordStat { attempts: number; correct: number; lastSeen: string | null }
export type WordStats = Record<string, WordStat>;
export interface Result { word: string; passed: boolean; attempts: number; revealed: boolean }

export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void }
type Rng = () => number;

export function shuffle<T>(a: T[], rng: Rng = Math.random): T[] {
  const out = a.slice();
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

// ---- per-word stats (same localStorage key and shape as legacy) ----
export function loadWordStats(store: KV): WordStats {
  try { const raw = store.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}
export function recordWordResult(store: KV, word: string, passed: boolean, now = new Date()) {
  const stats = loadWordStats(store);
  const e = stats[word] || { attempts: 0, correct: 0, lastSeen: null };
  e.attempts += 1; if (passed) e.correct += 1; e.lastSeen = now.toISOString();
  stats[word] = e;
  try { store.setItem(STORAGE_KEY, JSON.stringify(stats)); } catch { /* storage full or blocked */ }
}

// 3 distractors from the same level, same pattern first, then any other pattern.
export function pickDistractors(target: WordItem, pool: WordItem[], rng: Rng = Math.random): string[] {
  const same = pool.filter((w) => w.word !== target.word && w.pattern === target.pattern);
  const diff = pool.filter((w) => w.word !== target.word && w.pattern !== target.pattern);
  let picks = shuffle(same, rng).slice(0, 3);
  if (picks.length < 3) picks = picks.concat(shuffle(diff, rng).slice(0, 3 - picks.length));
  return picks.map((w) => w.word);
}

// 8 words: struggled ones first (any miss on record), then fresh, each bucket shuffled.
export function pickWordsForSession(level: Level, stats: WordStats, rng: Rng = Math.random): SessionWord[] {
  const struggled: WordItem[] = [], fresh: WordItem[] = [];
  for (const w of level.words) {
    const s = stats[w.word];
    if (s && s.attempts > 0 && s.correct < s.attempts) struggled.push(w); else fresh.push(w);
  }
  return shuffle(struggled, rng).concat(shuffle(fresh, rng)).slice(0, WORDS_PER_SESSION)
    .map((w) => ({ ...w, distractors: pickDistractors(w, level.words, rng) }));
}

export function optionsFor(w: SessionWord, rng: Rng = Math.random) { return shuffle([w.word, ...w.distractors], rng); }

// Completion flag for the legacy Today's Mission checkmark (UTC date, as legacy v199 wrote it).
export function markZoneDone(store: KV, now = new Date()) {
  try {
    const k = 'ha_zone_done_' + now.toISOString().slice(0, 10);
    const done = JSON.parse(store.getItem(k) || '{}');
    done['word-tower'] = true;
    store.setItem(k, JSON.stringify(done));
  } catch { /* storage unavailable */ }
}

export const firstTryCount = (results: Result[]) => results.filter((r) => r.passed).length;
