// Story Time logic, ported from public/js/story-time.js (v174b/v175):
// one Haiku passage (3 short sentences) + up to 4 multiple-choice questions.
// Pure functions so it runs under tsx.
//
// One deliberate change from legacy: the word highlight follows the real
// playback position of Ms. Humphrey's audio (weighted by word length, with a
// pause after each sentence) instead of a fixed 380 ms per word that drifted
// away from her voice. The fixed beat is still the fallback.

export interface MCQuestion { q: string; options: string[]; correct: number; explanation: string }
export interface Passage { title: string; sentences: string[]; questions: MCQuestion[] }
export interface Word { text: string; sentence: number; weight: number }

export const WORD_MS = 380;            // legacy WORD_HIGHLIGHT_MS_PER_WORD, the fallback beat
export const SETTLE_MS = 700;          // legacy pause after the last word before the questions
export const QUESTION_DELAY_MS = 300;  // legacy pause before a question is said
export const AFTER_RIGHT_MS = 2000;    // legacy POST_SPEECH_PAUSE_MS
export const AFTER_REVEAL_MS = 3000;   // legacy POST_SPEECH_PAUSE_MS + 1000

export const LINES = {
  loading: 'Ms. Humphrey is writing you a story…',
  hint: 'Tap “Listen along” — follow the words.',
  wrong: 'Not quite. Try again.',
  wrongFeedback: 'Not quite — try again. Tap the answer you think is right.',
  right: (q: MCQuestion) => `Yes! ${q.explanation}`,
  rightFeedback: (q: MCQuestion) => `✓ ${q.explanation}`,
  reveal: (q: MCQuestion) => `The answer is ${q.options[q.correct]}. ${q.explanation}`,
  endScore: (n: number, of: number) => `You answered ${n} of ${of} on the first try!`,
};

export function fallbackPassage(): Passage {
  return {
    title: 'A Sunny Day',
    sentences: ['Nigel went outside to play.', 'The sun was bright and warm.', 'He smiled and ran fast.'],
    questions: [{ q: 'Where did Nigel go?', options: ['outside', 'to school', 'home'], correct: 0, explanation: 'Nigel went outside to play.' }],
  };
}

// /api/humphrey/generate-passage → Passage. Questions with a bad index are dropped;
// a passage with no usable sentences falls back like legacy's catch().
export function toPassage(data: unknown): Passage {
  const d = (data && typeof data === 'object' ? data : {}) as { title?: unknown; sentences?: unknown; mcQuestions?: unknown };
  const sentences = Array.isArray(d.sentences) ? d.sentences.map((s) => String(s ?? '').trim()).filter(Boolean) : [];
  if (!sentences.length) return fallbackPassage();
  const questions = (Array.isArray(d.mcQuestions) ? d.mcQuestions : []).map((raw) => {
    const q = raw as { q?: unknown; options?: unknown; correct_index?: unknown; explanation?: unknown };
    const options = Array.isArray(q.options) ? q.options.map((o) => String(o ?? '').trim()).filter(Boolean) : [];
    const correct = Number(q.correct_index);
    return q.q && options.length >= 2 && Number.isInteger(correct) && correct >= 0 && correct < options.length
      ? { q: String(q.q), options, correct, explanation: String(q.explanation ?? '') } : null;
  }).filter(Boolean) as MCQuestion[];
  return { title: String(d.title || 'Story Time'), sentences, questions };
}

export function wordsOf(p: Passage): Word[] {
  const out: Word[] = [];
  p.sentences.forEach((s, si) => {
    const ws = s.split(/\s+/).filter(Boolean);
    ws.forEach((w, wi) => out.push({ text: w, sentence: si, weight: w.replace(/[^\p{L}\p{N}]/gu, '').length + 2 + (wi === ws.length - 1 ? 4 : /[,;:]$/.test(w) ? 2 : 0) }));
  });
  return out;
}

// Which word is being said at fraction f (0–1) of the audio. The first and last
// 4 % are lead-in and tail silence in the TTS clips.
export function wordAt(words: Word[], f: number): number {
  if (!words.length) return -1;
  const x = Math.min(1, Math.max(0, (f - 0.04) / 0.92));
  const total = words.reduce((a, w) => a + w.weight, 0);
  let acc = 0;
  for (let i = 0; i < words.length; i++) { acc += words[i].weight; if (x * total < acc) return i; }
  return words.length - 1;
}

export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void }
// Legacy v199 cap-proof completion flag for Today's Mission (UTC date).
export function markDone(store: KV, now = new Date()) {
  try {
    const k = 'ha_zone_done_' + now.toISOString().slice(0, 10);
    const d = JSON.parse(store.getItem(k) || '{}'); d['story-time'] = true; store.setItem(k, JSON.stringify(d));
  } catch { /* storage unavailable */ }
}
