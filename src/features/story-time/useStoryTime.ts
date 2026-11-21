// Story Time state machine (legacy story-time.js flow): loading → ready →
// reading (word highlight) → one question at a time → end card.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { pause, say, speechClock, stop } from '@/lib/tts';
import { startZoneSession } from '@/lib/telemetry';
import {
  AFTER_REVEAL_MS, AFTER_RIGHT_MS, LINES, QUESTION_DELAY_MS, SETTLE_MS, WORD_MS,
  fallbackPassage, markDone, toPassage, wordAt, wordsOf, type Passage,
} from './engine';

export type Phase = 'loading' | 'ready' | 'reading' | 'question' | 'end';
export type Pick = 'wrong' | 'correct' | 'reveal';
export type Mood = 'cheering' | 'encouraging' | null;
export interface Feedback { kind: 'none' | 'hint' | 'correct' | 'reveal'; text: string }

async function fetchPassage(): Promise<Passage> {
  try {
    const r = await fetch('/api/humphrey/generate-passage', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kidName: 'Nigel', pattern: 'digraphs' }),
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return toPassage(await r.json());
  } catch {
    return fallbackPassage();
  }
}

export function useStoryTime() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [passage, setPassage] = useState<Passage | null>(null);
  const [readIdx, setReadIdx] = useState(-1);     // word being said; -1 none
  const [qIdx, setQIdx] = useState(0);
  const [picks, setPicks] = useState<Record<number, Pick>>({});
  const [feedback, setFeedback] = useState<Feedback>({ kind: 'none', text: '' });
  const [mood, setMood] = useState<Mood>(null);
  const [firstTry, setFirstTry] = useState(0);
  const words = useMemo(() => (passage ? wordsOf(passage) : []), [passage]);
  const gen = useRef(0);          // bumps on every restart/unmount so stale timers stop
  const wrongs = useRef(0);
  const resolved = useRef(false);

  const boot = useCallback(async () => {
    const my = ++gen.current; stop();
    setPhase('loading'); setPassage(null); setReadIdx(-1); setQIdx(0); setPicks({}); setFirstTry(0);
    setFeedback({ kind: 'none', text: '' }); setMood(null);
    const p = await fetchPassage();
    if (gen.current !== my) return;
    setPassage(p); setPhase('ready');
  }, []);

  useEffect(() => {
    const endSession = startZoneSession('story-time', 'story-time');
    void boot();
    return () => { gen.current++; stop(); endSession(); };
  }, [boot]);

  const askQuestion = useCallback(async (p: Passage, i: number, my: number) => {
    wrongs.current = 0; resolved.current = false;
    setQIdx(i); setPicks({}); setFeedback({ kind: 'none', text: '' }); setMood(null); setPhase('question');
    await pause(QUESTION_DELAY_MS);
    if (gen.current === my) void say(p.questions[i].q);
  }, []);

  const finish = useCallback(() => {
    markDone(localStorage);
    setMood('cheering'); setPhase('end');
  }, []);

  const next = useCallback((p: Passage, i: number, my: number) => {
    if (gen.current !== my) return;
    if (i + 1 < p.questions.length) void askQuestion(p, i + 1, my); else finish();
  }, [askQuestion, finish]);

  const listen = useCallback(async () => {
    if (phase !== 'ready' || !passage) return;
    const my = gen.current; const p = passage; const ws = wordsOf(p);
    setPhase('reading'); setReadIdx(0); setMood(null);
    const t0 = Date.now(); let clocked = false; let raf = 0;
    const tick = () => {
      if (gen.current !== my) return;
      const c = speechClock();
      if (c) { clocked = true; setReadIdx(wordAt(ws, c.t / c.d)); }
      else if (!clocked) setReadIdx(Math.min(ws.length - 1, Math.floor((Date.now() - t0) / WORD_MS)));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    await say(p.sentences.join(' '));
    // Without an audio clock (browser voice, or no audio at all) keep legacy's beat to the last word.
    if (!clocked) { const left = ws.length * WORD_MS - (Date.now() - t0); if (left > 0) await pause(left); }
    cancelAnimationFrame(raf);
    if (gen.current !== my) return;
    setReadIdx(ws.length);
    await pause(SETTLE_MS);
    if (gen.current !== my) return;
    if (p.questions.length) void askQuestion(p, 0, my); else finish();
  }, [phase, passage, askQuestion, finish]);

  const answer = useCallback(async (i: number) => {
    if (phase !== 'question' || !passage || resolved.current || picks[i]) return;
    const my = gen.current; const q = passage.questions[qIdx];
    if (i === q.correct) {
      resolved.current = true;
      setPicks((p) => ({ ...p, [i]: 'correct' }));
      setFeedback({ kind: 'correct', text: LINES.rightFeedback(q) }); setMood('cheering');
      if (wrongs.current === 0) setFirstTry((n) => n + 1);
      await say(LINES.right(q)); await pause(AFTER_RIGHT_MS);
      next(passage, qIdx, my);
      return;
    }
    wrongs.current += 1;
    if (wrongs.current >= 2) {
      resolved.current = true;
      setPicks((p) => ({ ...p, [i]: 'wrong', [q.correct]: 'reveal' }));
      setFeedback({ kind: 'reveal', text: LINES.reveal(q) }); setMood('encouraging');
      await say(LINES.reveal(q)); await pause(AFTER_REVEAL_MS);
      next(passage, qIdx, my);
      return;
    }
    setPicks((p) => ({ ...p, [i]: 'wrong' }));
    setFeedback({ kind: 'hint', text: LINES.wrongFeedback }); setMood('encouraging');
    void say(LINES.wrong);
  }, [phase, passage, qIdx, picks, next]);

  const hearAgain = useCallback(() => {
    if (phase === 'question' && passage) void say(passage.questions[qIdx].q);
  }, [phase, passage, qIdx]);

  return { phase, passage, words, readIdx, qIdx, picks, feedback, mood, firstTry, listen, answer, hearAgain, readAnother: boot };
}
