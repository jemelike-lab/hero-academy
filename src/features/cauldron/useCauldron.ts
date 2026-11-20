// Cauldron Café hook: runs the step list from engine.ts, as the legacy state
// machine in public/cauldron-cafe.html did, without the 15 s gap after each
// recipe intro (legacy waited on an audio element it no longer owned).
import { useCallback, useEffect, useReducer, useRef } from 'react';
import { say, stop } from '@/lib/tts';
import { rpc, startZoneSession } from '@/lib/telemetry';
import { CHILD_ID } from '@/lib/child';
import {
  LINES, SERVE_TRIES_BEFORE_MOVE_ON, fallbackRecipes, hydrateRecipe, makeOptions, markComplete, planRecipe,
  readSeen, specialsFrom, writeSeen, type Recipe, type Special, type Step, type Veggie,
} from './engine';

export type Phase = 'boot' | 'playing' | 'complete';
export type TileState = 'idle' | 'correct' | 'wrong' | 'hint' | 'off';
export type Mood = 'delighted' | 'encouraging' | 'cheering' | null;
export interface CCState {
  phase: Phase;
  recipes: Recipe[];
  ri: number;
  steps: Step[];
  si: number;
  filled: number[];                  // cells filled per ingredient of the current recipe
  basket: { veg: Veggie | null; size: number; label: string; flying: boolean; counting: boolean };
  question: string;                  // what Ms. Humphrey asked (Repeat replays the last line said)
  options: number[];
  tiles: Record<number, TileState>;
  feedback: { kind: 'none' | 'correct' | 'wrong' | 'hint'; text: string };
  serving: boolean;                  // keypad + Serve it up! showing
  entry: string;
  wrongServes: number;
  served: boolean;                   // celebration between recipes
  mood: Mood;
  specials: Special[];
  special: { open: boolean; idx: number; entry: string; result: 'none' | 'right' | 'wrong' };
}

const store = typeof window !== 'undefined' ? window.localStorage : { getItem: () => null, setItem: () => {} };
const NO_FEEDBACK = { kind: 'none' as const, text: '' };
const initial: CCState = {
  phase: 'boot', recipes: [], ri: 0, steps: [], si: 0, filled: [], basket: { veg: null, size: 0, label: 'Basket', flying: false, counting: false },
  question: LINES.boot, options: [], tiles: {}, feedback: NO_FEEDBACK, serving: false, entry: '', wrongServes: 0, served: false, mood: null,
  specials: [], special: { open: false, idx: 0, entry: '', result: 'none' },
};
type Action = { type: 'patch'; patch: Partial<CCState> };
const reducer = (s: CCState, a: Action): CCState => ({ ...s, ...a.patch });

function logEvent(type: string, payload: Record<string, unknown>) {
  rpc('ha_record_event', { p_child_id: CHILD_ID, p_event_type: type, p_payload: payload }).catch(() => { /* best-effort */ });
}

async function fetchRecipes(): Promise<Recipe[]> {
  const seen = readSeen(store);
  try {
    const r = await fetch('/api/cauldron-recipes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ avoidTitles: seen }) });
    if (!r.ok) throw new Error('recipes ' + r.status);
    const j = await r.json();
    const out: Recipe[] = [];
    for (const raw of j?.recipes || []) {
      const { recipe, llmMismatch } = hydrateRecipe(raw);
      if (llmMismatch && recipe) logEvent('cauldron_llm_answer_mismatch', { recipe: recipe.name, llm: llmMismatch.llm, computed: llmMismatch.computed, ingredients: recipe.ingredients.map((i) => ({ v: i.veggie.id, c: i.count })) });
      if (recipe) out.push(recipe);
    }
    if (!out.length) throw new Error('no valid recipes');
    writeSeen(store, [...out.map((r) => r.name), ...seen]);
    return out;
  } catch {
    return fallbackRecipes();
  }
}

export function useCauldron() {
  const [state, dispatch] = useReducer(reducer, initial);
  const ref = useRef(state); ref.current = state;
  const patch = useCallback((p: Partial<CCState>) => { ref.current = { ...ref.current, ...p }; dispatch({ type: 'patch', patch: p }); }, []);
  const epoch = useRef(0);
  const lastLine = useRef(LINES.boot);
  const later = (ms: number, fn: () => void) => { const e = epoch.current; window.setTimeout(() => { if (e === epoch.current) fn(); }, ms); };
  const speak = useCallback((text: string, mood: Mood = null) => { lastLine.current = text; if (mood !== undefined) patch({ mood }); return say(text); }, [patch]);

  const recipe = () => ref.current.recipes[ref.current.ri];

  // ---------- steps ----------
  const runStep = useCallback((k: number) => {
    const s = ref.current; const st = s.steps[k]; const r = recipe(); if (!st || !r) return;
    const base = { si: k, tiles: {}, feedback: NO_FEEDBACK, mood: null as Mood };
    if (st.kind === 'serve') {
      patch({ ...base, question: st.text, options: [], serving: true, entry: '', basket: { veg: null, size: 0, label: 'Recipe ready!', flying: false, counting: false } });
      void speak(st.text);
      return;
    }
    const basket = st.kind === 'count'
      ? { veg: r.ingredients[st.ing].veggie, size: st.size, label: 'New bunch!', flying: false, counting: false }
      : { veg: null, size: 0, label: st.kind === 'bridge' ? 'Empty (answer first)' : 'Pot wants more! ✨', flying: false, counting: false };
    patch({ ...base, question: st.text, options: makeOptions(st.answer), serving: false, basket });
    void speak(st.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patch, speak]);

  const nextRecipe = useCallback(() => {
    epoch.current++;
    const s = ref.current; const ri = s.ri + 1;
    if (ri >= s.recipes.length) {
      markComplete(store);
      patch({ phase: 'complete', serving: false, served: false, options: [], tiles: {}, feedback: NO_FEEDBACK, question: LINES.complete(s.recipes.length), basket: { veg: null, size: 0, label: 'Service complete', flying: false, counting: false } });
      void speak(LINES.complete(s.recipes.length), 'cheering');
      return;
    }
    startRecipe(ri);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patch, speak]);

  const startRecipe = useCallback((ri: number) => {
    epoch.current++;
    const r = ref.current.recipes[ri]; if (!r) return;
    const steps = planRecipe(r);
    patch({ phase: 'playing', ri, steps, si: 0, filled: r.ingredients.map(() => 0), wrongServes: 0, served: false, serving: false, options: [], tiles: {}, feedback: NO_FEEDBACK, question: LINES.intro(r), basket: { veg: null, size: 0, label: 'Basket', flying: false, counting: false } });
    const e = epoch.current;
    // Wait for the intro to finish (say() resolves on end, stop, or its own safety timeout).
    void speak(LINES.intro(r)).then(() => { if (e === epoch.current) runStep(0); });
  }, [patch, speak, runStep]);

  const advance = useCallback(() => runStep(ref.current.si + 1), [runStep]);

  const answer = useCallback((picked: number) => {
    const s = ref.current; const st = s.steps[s.si];
    if (!st || st.kind === 'serve' || s.tiles[picked] === 'correct') return;
    const settled = Object.values(s.tiles).some((t) => t === 'correct' || t === 'wrong');
    if (settled && s.tiles[picked] !== 'hint') return;
    if (picked === st.answer) {
      patch({ tiles: { ...Object.fromEntries(s.options.map((o) => [o, 'off'])), [picked]: 'correct' }, feedback: { kind: 'correct', text: LINES.rightFeedback(st.answer) }, mood: 'delighted' });
      void speak(LINES.right(st.answer), 'delighted');
      later(900, () => {
        if (st.kind !== 'count') { later(400, advance); return; }
        // Bunch flies into the pot; the ten-frame fills cell by cell.
        const r = recipe()!; const filled = ref.current.filled.slice(); filled[st.ing] = st.haveBefore + st.size;
        patch({ basket: { ...ref.current.basket, flying: true }, filled });
        later(st.size * 100 + 700, () => { patch({ basket: { veg: null, size: 0, label: '', flying: false, counting: false } }); advance(); });
        void r;
      });
      return;
    }
    patch({ tiles: { ...Object.fromEntries(s.options.map((o) => [o, 'off'])), [picked]: 'wrong' }, feedback: { kind: 'wrong', text: LINES.wrongFeedback }, mood: 'encouraging', basket: st.kind === 'count' ? { ...s.basket, counting: true } : s.basket });
    later(1800, () => {
      patch({ tiles: { ...ref.current.tiles, [picked]: 'off', [st.answer]: 'hint' }, feedback: { kind: 'hint', text: LINES.tryHighlighted }, basket: { ...ref.current.basket, counting: false } });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patch, speak, advance]);

  // ---------- serve ----------
  const key = useCallback((k: string) => {
    const s = ref.current; if (!s.serving) return;
    const entry = k === 'del' ? s.entry.slice(0, -1) : (s.entry + k).replace(/^0+(?=\d)/, '').slice(0, 3);
    patch({ entry });
  }, [patch]);
  const serve = useCallback(() => {
    const s = ref.current; const r = recipe(); if (!s.serving || !r || !s.entry) return;
    const guess = Number(s.entry);
    if (guess === r.answer) {
      epoch.current++;
      patch({ serving: false, served: true, feedback: { kind: 'correct', text: LINES.servedFeedback(r) }, wrongServes: 0, question: LINES.served(r) });
      void speak(LINES.served(r), 'cheering');
      later(2800, nextRecipe);
    } else {
      const wrongServes = s.wrongServes + 1;
      patch({ wrongServes, entry: '', feedback: { kind: 'wrong', text: LINES.serveWrongFeedback(r, guess) } });
      void speak(LINES.serveWrong(r), 'encouraging');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patch, speak, nextRecipe]);
  const moveOn = useCallback(() => {
    const s = ref.current; const r = recipe(); if (!r || s.wrongServes < SERVE_TRIES_BEFORE_MOVE_ON) return;
    epoch.current++;
    patch({ serving: false, wrongServes: 0, feedback: { kind: 'hint', text: LINES.moveOnFeedback(r) }, question: LINES.moveOn(r) });
    void speak(LINES.moveOn(r), 'encouraging');
    logEvent('cauldron_serve_skipped', { recipe: r.name, answer: r.answer });
    later(3200, nextRecipe);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patch, speak, nextRecipe]);

  const skip = useCallback(() => { if (ref.current.phase !== 'playing') return; stop(); nextRecipe(); }, [nextRecipe]);
  const repeat = useCallback(() => { void say(lastLine.current); }, []);

  // ---------- Today's Special ----------
  const openSpecial = useCallback(() => {
    const s = ref.current; if (!s.specials.length) return;
    patch({ special: { open: true, idx: 0, entry: '', result: 'none' } });
    void speak(s.specials[0].prompt);
  }, [patch, speak]);
  const closeSpecial = useCallback(() => { patch({ special: { ...ref.current.special, open: false } }); }, [patch]);
  const specialKey = useCallback((k: string) => {
    const sp = ref.current.special; if (sp.result === 'right') return;
    const entry = k === 'del' ? sp.entry.slice(0, -1) : (sp.entry + k).replace(/^0+(?=\d)/, '').slice(0, 4);
    patch({ special: { ...sp, entry, result: 'none' } });
  }, [patch]);
  const checkSpecial = useCallback(() => {
    const s = ref.current; const p = s.specials[s.special.idx]; if (!p || !s.special.entry) return;
    const right = Number(s.special.entry) === p.answer;
    patch({ special: { ...s.special, result: right ? 'right' : 'wrong' } });
    void speak(right ? `Yes — ${p.answer} is right.` : "Not quite. Let's try again.", right ? 'delighted' : 'encouraging');
  }, [patch, speak]);
  const nextSpecial = useCallback(() => {
    const s = ref.current; const idx = s.special.idx + 1;
    if (idx >= s.specials.length) { patch({ special: { ...s.special, open: false } }); return; }
    patch({ special: { open: true, idx, entry: '', result: 'none' } });
    void speak(s.specials[idx].prompt);
  }, [patch, speak]);

  // ---------- boot ----------
  const boot = useCallback(async () => {
    epoch.current++;
    patch({ ...initial, specials: ref.current.specials });
    const [recipes] = await Promise.all([fetchRecipes(), speak(LINES.boot)]);
    patch({ recipes });
    startRecipe(0);
  }, [patch, speak, startRecipe]);

  useEffect(() => {
    void boot();
    // Today's Special: the legacy call left out the content type and always got a 404.
    rpc('ha_get_todays_content', { p_child_id: CHILD_ID, p_content_type: 'math_problems' })
      .then((r) => (r.ok ? r.json() : null)).then((payload) => { const specials = specialsFrom(payload); if (specials.length) patch({ specials }); })
      .catch(() => { /* button stays hidden */ });
    const end = startZoneSession('number-lab', 'cauldron-cafe');
    return () => { epoch.current++; stop(); end(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { state, recipe: state.recipes[state.ri], step: state.steps[state.si], answer, key, serve, moveOn, skip, repeat, cookAgain: boot, openSpecial, closeSpecial, specialKey, checkSpecial, nextSpecial };
}
