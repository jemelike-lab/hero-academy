// Letter Lab engine hook. Flow ported 1:1 from public/js/letter-lab.js (v174):
// Ms. Humphrey says the target (never shown) → Nigel writes → "Show me yours" →
// his drawing is set aside, she draws hers stroke by stroke → compare side by
// side → he decides: "Looks great" (next) or "Try one more time" (once, then
// the retry goes away). 3 targets, then the finish card.
//
// Changes from legacy, all deliberate:
// - an empty board gets the "you haven't drawn anything yet" nudge (legacy's
//   blank check never fired, its canvas always returned an image);
// - the finish card stays up with a Back home button (legacy jumped home after 3.5 s).
import { useCallback, useEffect, useReducer, useRef, type RefObject } from 'react';
import { say, stop } from '@/lib/tts';
import { rpc } from '@/lib/telemetry';
import { CHILD_ID } from '@/lib/child';
import type { LetterBoardHandle } from './LetterBoard';
import { LINES, MAX_ATTEMPTS, canAnimate, logRevealShown, markDone, pickTargets, promptFor, todayKey, type Target } from './engine';

export type Phase = 'writing' | 'demo' | 'compare' | 'done';
export type Mood = 'speaking' | 'encouraging' | 'delighted' | null;
export interface LLState {
  targets: Target[];
  index: number;
  attempts: number;
  phase: Phase;
  bubble: string;
  nudge: boolean;          // empty-board nudge is showing
  mine: string | null;     // PNG of his drawing, for compare
  hers: string | null;     // PNG of her drawing, for compare
  kept: string[];          // his last drawing for each finished target (finish card)
  mood: Mood;
  hasInk: boolean;
}

const store = typeof window !== 'undefined' ? window.localStorage : { getItem: () => null, setItem: () => {} };

function fresh(): LLState {
  return { targets: pickTargets(), index: 0, attempts: 0, phase: 'writing', bubble: LINES.listen, nudge: false, mine: null, hers: null, kept: [], mood: null, hasInk: false };
}
type Action = { type: 'patch'; patch: Partial<LLState> } | { type: 'reset' };
function reducer(s: LLState, a: Action): LLState { return a.type === 'reset' ? fresh() : { ...s, ...a.patch }; }

// Legacy logSelfAssess, same arguments. The RPC was missing until v316
// (supabase/migrations/v316-letter-practice.sql); rows land in ha_letter_practice.
function logSelfAssess(t: Target, attempt: number, satisfied: boolean) {
  rpc('ha_record_letter_practice', {
    p_child_id: CHILD_ID, p_practice_date: todayKey(), p_letter: t.char, p_kind: t.kind,
    p_attempt: attempt, p_score: null, p_correct: satisfied,
  }, { keepalive: true }).catch(() => { /* best-effort */ });
}

export function useLetterLab(board: RefObject<LetterBoardHandle>) {
  const [state, dispatch] = useReducer(reducer, undefined, fresh);
  const ref = useRef(state); ref.current = state;
  const patch = useCallback((p: Partial<LLState>) => { ref.current = { ...ref.current, ...p }; dispatch({ type: 'patch', patch: p }); }, []);
  const spoken = useRef('');
  const alive = useRef(true);

  const speak = useCallback((text: string, mood: Mood = 'speaking') => { patch({ mood }); return say(text); }, [patch]);

  const showTarget = useCallback((i: number) => {
    const t = ref.current.targets[i]; if (!t) return;
    board.current?.clear(); board.current?.clearDemo();
    spoken.current = promptFor(t);
    patch({ index: i, attempts: 0, phase: 'writing', bubble: LINES.listen, nudge: false, mine: null, hers: null, hasInk: false });
    void speak(spoken.current);
  }, [board, patch, speak]);

  const sayAgain = useCallback(() => { if (spoken.current && ref.current.phase === 'writing') void speak(spoken.current); }, [speak]);
  const undo = useCallback(() => board.current?.undo(), [board]);
  const clear = useCallback(() => board.current?.clear(), [board]);
  const onInk = useCallback((has: boolean) => { patch(has ? { hasInk: true, nudge: false, bubble: LINES.listen } : { hasInk: false }); }, [patch]);

  const showMeYours = useCallback(async () => {
    const s = ref.current; const t = s.targets[s.index]; const b = board.current;
    if (!t || !b || s.phase !== 'writing') return;
    if (!b.hasInk()) { patch({ nudge: true, bubble: LINES.empty }); void speak(LINES.empty, 'encouraging'); return; }
    const attempts = s.attempts + 1;
    const mine = b.toPNG('nigel');
    b.clear();
    const intro = LINES.revealIntro(t);
    patch({ attempts, mine, phase: 'demo', bubble: intro, nudge: false, hasInk: false });
    void speak(intro);
    if (canAnimate(t)) await b.playDemo(t.char.split(''), t.kind);
    if (!alive.current || ref.current.phase !== 'demo') return;
    const hers = b.toPNG('humphrey');
    patch({ hers, phase: 'compare', mood: 'delighted' });
    logRevealShown(store, t, attempts);
  }, [board, patch, speak]);

  const finish = useCallback(() => {
    const s = ref.current;
    markDone(store, s.targets);
    patch({ phase: 'done', mood: 'delighted', bubble: LINES.finish(s.targets.length) });
    void speak(LINES.finish(s.targets.length), 'delighted');
  }, [patch, speak]);

  const looksGreat = useCallback(() => {
    const s = ref.current; const t = s.targets[s.index];
    if (!t || s.phase !== 'compare') return;
    logSelfAssess(t, s.attempts, true);
    patch({ kept: [...s.kept, s.mine || ''] });
    if (s.index + 1 >= s.targets.length) finish(); else showTarget(s.index + 1);
  }, [patch, finish, showTarget]);

  const tryAgain = useCallback(() => {
    const s = ref.current; const t = s.targets[s.index];
    if (!t || s.phase !== 'compare' || s.attempts >= MAX_ATTEMPTS) return;
    logSelfAssess(t, s.attempts, false);
    board.current?.clear(); board.current?.clearDemo();
    patch({ phase: 'writing', bubble: LINES.tryAgain, mine: null, hers: null, hasInk: false });
    void speak(LINES.tryAgain, 'encouraging');
  }, [board, patch, speak]);

  const restart = useCallback(() => { stop(); spoken.current = ''; dispatch({ type: 'reset' }); }, []);

  // First target of every session (mount and restart): spoken is empty until a prompt has been said.
  useEffect(() => { if (state.phase === 'writing' && state.index === 0 && state.attempts === 0 && !spoken.current) showTarget(0); }, [state.phase, state.index, state.attempts, state.targets, showTarget]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; stop(); }; }, []);

  const s = state; const t = s.targets[s.index];
  return {
    state, target: t,
    isLast: s.index >= s.targets.length - 1,
    canRetry: s.attempts < MAX_ATTEMPTS,
    compareTitle: LINES.compareTitle(s.attempts),
    goodLabel: LINES.goodButton(s.index >= s.targets.length - 1),
    sayAgain, undo, clear, onInk, showMeYours, looksGreat, tryAgain, restart,
  };
}
