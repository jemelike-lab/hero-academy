// Word Tower engine hook. Flow ported 1:1 from public/js/word-tower-reading.js:
// Humphrey says the word → 4 cards (target + 3 distractors) → tap.
// Right: "Yes! <word>." then next. First wrong: hint, try again. Second wrong:
// reveal + "The word is <word>. <hint>" then next. 8 words, then the end card.
import { useCallback, useEffect, useReducer, useRef } from 'react';
import { say, stop } from '@/lib/tts';
import { startZoneSession } from '@/lib/telemetry';
import { getDefaultLevelId, getLevel, type Level } from './words';
import {
  FIRST_WORD_DELAY_MS, POST_SPEECH_PAUSE_MS, REVEAL_EXTRA_MS, TTS_SAFETY_MS,
  loadWordStats, markZoneDone, optionsFor, pickWordsForSession, recordWordResult,
  type Result, type SessionWord,
} from './engine';

export type CardState = 'idle' | 'wrong' | 'correct' | 'reveal';
export type StatusKind = 'idle' | 'hint' | 'pass' | 'reveal';
export type Mood = 'idle' | 'speaking' | 'delighted' | 'encouraging';

export interface WTState {
  phase: 'play' | 'done';
  level: Level;
  queue: SessionWord[];
  index: number;
  wrongAttempts: number;
  options: string[];
  cards: Record<string, CardState>;
  locked: boolean;           // all cards disabled (answered or revealed)
  status: { kind: StatusKind; text: string };
  bubble: string;
  mood: Mood;
  results: Result[];
}

const level = getLevel(getDefaultLevelId())!;
const store = typeof window !== 'undefined' ? window.localStorage : { getItem: () => null, setItem: () => {} };
const IDLE_STATUS = { kind: 'idle' as const, text: 'Tap the word you hear Ms. Humphrey say.' };

function fresh(): WTState {
  return { phase: 'play', level, queue: pickWordsForSession(level, loadWordStats(store)), index: 0, wrongAttempts: 0, options: [], cards: {}, locked: true, status: IDLE_STATUS, bubble: '', mood: 'idle', results: [] };
}
type Action = { type: 'patch'; patch: Partial<WTState> } | { type: 'reset' };
function reducer(s: WTState, a: Action): WTState { return a.type === 'reset' ? fresh() : { ...s, ...a.patch }; }

export function useWordTower() {
  const [state, dispatch] = useReducer(reducer, undefined, fresh);
  const ref = useRef(state); ref.current = state;
  const patch = useCallback((p: Partial<WTState>) => { ref.current = { ...ref.current, ...p }; dispatch({ type: 'patch', patch: p }); }, []);
  const epoch = useRef(0); // bumps on every word change / unmount; stale timers check it
  const timers = useRef<number[]>([]);
  const later = (ms: number, fn: () => void) => { const e = epoch.current; timers.current.push(window.setTimeout(() => { if (e === epoch.current) fn(); }, ms)); };

  // Speak, and run `then` once speech ends plus `pause` (legacy waitForSpeechThenDo, with its 20 s safety).
  const speakThen = useCallback((text: string, pause: number, then?: () => void) => {
    const e = epoch.current; let done = false;
    const finish = () => { if (done || e !== epoch.current) return; done = true; then?.(); };
    if (then) later(TTS_SAFETY_MS, finish);
    void say(text).then(() => { if (then) later(pause, finish); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showWord = useCallback((i: number) => {
    epoch.current++;
    const w = ref.current.queue[i];
    if (!w) return;
    patch({ index: i, wrongAttempts: 0, options: optionsFor(w), cards: {}, locked: false, status: IDLE_STATUS, bubble: 'Which word is this? Listen carefully.', mood: 'speaking' });
    later(FIRST_WORD_DELAY_MS, () => { speakThen(w.word, 0); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patch, speakThen]);

  const finish = useCallback(() => {
    epoch.current++; stop();
    markZoneDone(store);
    patch({ phase: 'done', locked: true, mood: 'delighted' });
  }, [patch]);

  const advance = useCallback(() => {
    const next = ref.current.index + 1;
    if (next >= ref.current.queue.length) finish(); else showWord(next);
  }, [finish, showWord]);

  const tap = useCallback((picked: string) => {
    const s = ref.current; const w = s.queue[s.index];
    if (!w || s.locked || s.phase !== 'play' || s.cards[picked] === 'wrong') return;
    if (picked === w.word) {
      const passed = s.wrongAttempts === 0;
      recordWordResult(store, w.word, passed);
      patch({
        cards: { ...s.cards, [picked]: 'correct' }, locked: true, mood: 'delighted',
        status: { kind: 'pass', text: `✓ Yes — ${w.word}!` }, bubble: `Yes! ${w.word}.`,
        results: [...s.results, { word: w.word, passed, attempts: s.wrongAttempts + 1, revealed: false }],
      });
      speakThen(`Yes! ${w.word}.`, POST_SPEECH_PAUSE_MS, advance);
      return;
    }
    const wrong = s.wrongAttempts + 1;
    if (wrong >= 2) {
      const line = `The word is ${w.word}. ${w.hint || ''}`.trim();
      recordWordResult(store, w.word, false);
      patch({
        wrongAttempts: wrong, cards: { ...s.cards, [picked]: 'wrong', [w.word]: 'reveal' }, locked: true, mood: 'encouraging',
        status: { kind: 'reveal', text: line }, bubble: line,
        results: [...s.results, { word: w.word, passed: false, attempts: wrong, revealed: true }],
      });
      speakThen(line, POST_SPEECH_PAUSE_MS + REVEAL_EXTRA_MS, advance);
      return;
    }
    const hint = w.hint || 'Try again — tap the word you heard.';
    patch({ wrongAttempts: wrong, cards: { ...s.cards, [picked]: 'wrong' }, mood: 'encouraging', status: { kind: 'hint', text: `💡 ${hint}` }, bubble: hint });
    speakThen(w.hint || 'Try again.', 0);
  }, [patch, speakThen, advance]);

  const hearAgain = useCallback(() => {
    const s = ref.current; const w = s.queue[s.index];
    if (w && s.phase === 'play') { patch({ mood: 'speaking' }); void say(w.word); }
  }, [patch]);

  const restart = useCallback(() => { epoch.current++; stop(); dispatch({ type: 'reset' }); }, []);

  // first word of every set (mount and "Another set")
  useEffect(() => { if (state.phase === 'play' && state.options.length === 0) showWord(0); }, [state.phase, state.options.length, showWord]);

  useEffect(() => {
    const endSession = startZoneSession('word-tower', 'word-tower');
    return () => { epoch.current++; timers.current.forEach(clearTimeout); stop(); endSession(); };
  }, []);

  return { state, tap, hearAgain, endEarly: finish, restart };
}
