// Cauldron Café game logic, ported from public/cauldron-cafe.html (v125–v170).
// Pure functions so it runs under tsx. A recipe is turned into a fixed list of
// steps up front (count a bunch → "how many more" bridge → … → next ingredient
// → serve), exactly as the legacy state machine walked them.
//
// Deliberate changes from legacy, each fixing a bug:
// - the header equation is built from the ingredients (the generator sometimes
//   wrote "14 - 6 = ?" for a recipe the café plays as 14 + 6);
// - the next-ingredient question counts the whole pot (legacy used only the
//   last ingredient, so 3-ingredient recipes asked a wrong total);
// - Today's Special reads payload.items with string answers (legacy read
//   math_problems and compared a number to a string, so nothing matched).

export type VeggieId = 'carrot' | 'tomato' | 'potato';
export interface Veggie { id: VeggieId; label: string; singular: string }
export const VEGGIES: Record<VeggieId, Veggie> = {
  carrot: { id: 'carrot', label: 'Carrots', singular: 'carrot' },
  tomato: { id: 'tomato', label: 'Tomatoes', singular: 'tomato' },
  potato: { id: 'potato', label: 'Potatoes', singular: 'potato' },
};
export interface Ingredient { veggie: Veggie; count: number }
export interface Recipe { name: string; ingredients: Ingredient[]; prompt: string; equation: string; answer: number; skill?: string }
type Rng = () => number;

// ---- bunches (legacy deriveBunches): small groups biased toward 5 for make-ten thinking
export function deriveBunches(total: number): number[] {
  if (total <= 5) return [total];
  const fixed: Record<number, number[]> = { 6: [3, 3], 7: [4, 3], 8: [4, 4], 9: [5, 4], 10: [5, 5] };
  if (fixed[total]) return fixed[total];
  if (total >= 11 && total <= 15) return [5, 5, total - 10];
  if (total >= 16 && total <= 20) return [5, 5, 5, total - 15];
  const out: number[] = []; let rest = total;
  while (rest > 5) { out.push(5); rest -= 5; }
  out.push(rest);
  return out;
}

export function shuffle<T>(a: T[], rng: Rng = Math.random): T[] {
  const o = a.slice();
  for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; }
  return o;
}
// Legacy makeOptions: ±1 up to 10, ±2 above; small numbers stay positive.
export function makeOptions(correct: number, rng: Rng = Math.random): number[] {
  let o: number[];
  if (correct <= 3) o = correct >= 2 ? [correct, correct - 1, correct + 1] : [correct, correct + 1, correct + 2];
  else if (correct <= 10) o = [correct, correct - 1, correct + 1];
  else o = [correct, correct - 2, correct + 2];
  return shuffle(o, rng);
}

// ---- steps ----
export type Step =
  | { kind: 'count'; ing: number; size: number; haveBefore: number; text: string; answer: number }
  | { kind: 'bridge'; ing: number; have: number; need: number; text: string; answer: number }
  | { kind: 'cross'; ing: number; pot: number; nextNeed: number; text: string; answer: number }
  | { kind: 'serve'; text: string; answer: number };

const lc = (v: Veggie) => v.label.toLowerCase();

export function planRecipe(r: Recipe): Step[] {
  const steps: Step[] = []; let pot = 0;
  r.ingredients.forEach((ing, i) => {
    const bunches = deriveBunches(ing.count); let have = 0;
    bunches.forEach((size, b) => {
      steps.push({
        kind: 'count', ing: i, size, haveBefore: have, answer: size,
        text: have === 0 ? `Here come the first ${lc(ing.veggie)}! How many in this bunch?` : `Here's another bunch. How many ${lc(ing.veggie)} are in it?`,
      });
      have += size;
      if (have < ing.count) {
        const next = bunches[b + 1]; const need = ing.count; const rem = need - have;
        let text: string, answer: number;
        if (have === 5 && next === 5 && need >= 10) { text = `We have ${have} ${lc(ing.veggie)} so far. Let's add 5 more — how many will that make?`; answer = 10; }
        else if (have === 10 && rem <= 5) { text = `We have 10 ${lc(ing.veggie)} in the pot. The recipe needs ${need}. How many more do we need?`; answer = rem; }
        else if (have < 10 && rem <= 5) { text = `We have ${have} ${lc(ing.veggie)}. The recipe needs ${need}. How many more?`; answer = rem; }
        else { text = `We have ${have} ${lc(ing.veggie)}. The recipe needs ${need}. How many more do we need to get to ${have + next}?`; answer = next; }
        steps.push({ kind: 'bridge', ing: i, have, need, text, answer });
      }
    });
    pot += ing.count;
    const nxt = r.ingredients[i + 1];
    if (nxt) {
      const intro = i === 0 ? `Great — ${ing.count} ${lc(ing.veggie)} are in the pot.` : `Great — that's ${pot} veggies in the pot.`;
      steps.push({ kind: 'cross', ing: i, pot, nextNeed: nxt.count, answer: pot + nxt.count, text: `${intro} Now we need ${nxt.count} ${lc(nxt.veggie)}. After we add them, how many veggies total?` });
    }
  });
  const parts = r.ingredients.map((i) => i.count);
  steps.push({ kind: 'serve', answer: r.answer, text: `All the ingredients are in! Let's count it all up: ${parts.join(' plus ')}. What's your answer?` });
  return steps;
}

// ---- lines (verbatim from legacy) ----
export const LINES = {
  boot: "Welcome back to the kitchen, Nigel. Let me get tonight's recipes from Chef Ralphie…",
  intro: (r: Recipe) => `Tonight's recipe: ${r.name}. ${r.prompt}`,
  right: (n: number) => `Yes! That's ${n}.`,
  rightFeedback: (n: number) => `Yes — ${n}!`,
  wrongFeedback: "Let's check that again.",
  tryHighlighted: 'Try the highlighted one.',
  served: (r: Recipe) => `Yes — ${r.ingredients.map((i) => i.count).join(' plus ')} is ${r.answer}. The ${r.name} is ready to serve!`,
  servedFeedback: (r: Recipe) => `Yes — ${r.ingredients.map((i) => i.count).join(' + ')} = ${r.answer}!`,
  serveWrong: (r: Recipe) => `Let's count together. ${r.ingredients.map((i) => i.count).join(' plus ')}.`,
  serveWrongFeedback: (r: Recipe, g: number) => `Hmm — that's ${g}, not quite right. Let's count together: ${r.ingredients.map((i) => i.count).join(' + ')}. Try again.`,
  moveOn: (r: Recipe) => `No worries, Nigel. The answer is ${r.answer}. ${r.ingredients.map((i) => i.count).join(' plus ')} is ${r.answer}. Let's try the next one.`,
  moveOnFeedback: (r: Recipe) => `${r.ingredients.map((i) => i.count).join(' + ')} = ${r.answer}`,
  complete: (n: number) => `Beautiful work, Nigel. You served ${n} dishes today.`,
};
export const SERVE_TRIES_BEFORE_MOVE_ON = 2;

// ---- recipes ----
interface RawRecipe { name?: unknown; ingredients?: { veggie?: unknown; count?: unknown }[]; prompt?: unknown; equation?: unknown; answer?: unknown; skill?: unknown }
export function hydrateRecipe(r: RawRecipe): { recipe: Recipe | null; llmMismatch: { llm: unknown; computed: number } | null } {
  const ingredients = (r.ingredients || []).map((i) => {
    const v = VEGGIES[i.veggie as VeggieId]; const c = Number(i.count);
    return v && Number.isInteger(c) && c >= 1 && c <= 30 ? { veggie: v, count: c } : null;
  }).filter(Boolean) as Ingredient[];
  if (!ingredients.length) return { recipe: null, llmMismatch: null };
  const answer = ingredients.reduce((s, i) => s + i.count, 0);
  const llmMismatch = typeof r.answer === 'number' && r.answer !== answer ? { llm: r.answer, computed: answer } : null;
  return {
    llmMismatch,
    recipe: { name: String(r.name || 'Mystery Stew'), ingredients, prompt: String(r.prompt || ''), equation: ingredients.map((i) => i.count).join(' + ') + ' = ?', answer, skill: r.skill ? String(r.skill) : undefined },
  };
}
export function fallbackRecipes(): Recipe[] {
  const mk = (name: string, ing: [VeggieId, number][], prompt: string): Recipe => {
    const ingredients = ing.map(([v, c]) => ({ veggie: VEGGIES[v], count: c }));
    return { name, ingredients, prompt, equation: ingredients.map((i) => i.count).join(' + ') + ' = ?', answer: ingredients.reduce((s, i) => s + i.count, 0) };
  };
  return [mk('Sunset Stew', [['carrot', 5], ['tomato', 4]], 'A bright stew for tonight.'), mk('Country Hash', [['potato', 7], ['carrot', 5]], "Chef's classic country hash.")];
}

export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void }
export const SEEN_KEY = 'cauldron_seen_titles';
export function readSeen(store: KV): string[] { try { const r = store.getItem(SEEN_KEY); return r ? JSON.parse(r) : []; } catch { return []; } }
export function writeSeen(store: KV, titles: string[]) { try { store.setItem(SEEN_KEY, JSON.stringify(titles.slice(0, 12))); } catch { /* noop */ } }

// Today's Special: payload.items[] with string answers; keep whole-number answers only.
export interface Special { prompt: string; answer: number }
export function specialsFrom(payload: unknown): Special[] {
  const items = (payload && typeof payload === 'object' && Array.isArray((payload as { items?: unknown[] }).items)) ? (payload as { items: unknown[] }).items
    : Array.isArray(payload) ? payload : [];
  return items.map((it) => {
    const o = it as { prompt?: unknown; text?: unknown; answer?: unknown };
    const a = String(o?.answer ?? '').trim();
    return /^\d{1,4}$/.test(a) && (o?.prompt || o?.text) ? { prompt: String(o.prompt || o.text), answer: Number(a) } : null;
  }).filter(Boolean) as Special[];
}

// Zone completion, as legacy startComplete(): +15 Number Lab progress and the cap-proof flag.
export function markComplete(store: KV, now = new Date()) {
  try {
    const raw = store.getItem('hero_academy_state_v1'); const app = raw ? JSON.parse(raw) : {};
    app.zoneProgress = app.zoneProgress || {}; app.zoneProgress['number-lab'] = Math.min(100, (app.zoneProgress['number-lab'] || 0) + 15);
    store.setItem('hero_academy_state_v1', JSON.stringify(app));
  } catch { /* noop */ }
  try {
    const k = 'ha_zone_done_' + now.toISOString().slice(0, 10); const d = JSON.parse(store.getItem(k) || '{}');
    d['number-lab'] = true; store.setItem(k, JSON.stringify(d));
  } catch { /* noop */ }
}
