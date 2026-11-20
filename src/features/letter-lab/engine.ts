// Letter Lab session logic, ported 1:1 from public/js/letter-lab.js (v174)
// and the animator timing in public/js/letter-strokes.js (v107).
// Pure functions: storage, clock and randomness are injected so this runs under tsx.
import { STROKES, hasStrokes } from './strokes';

export type Kind = 'upper' | 'lower' | 'digit' | 'multi-digit';
export interface Target { char: string; kind: Kind; label: string }
export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void }
type Rng = () => number;

// Ambiguous shapes (O/Q, I/l, i/j/o/q/v) are left out, as in legacy.
const UPPER = 'ABCDEFGHKLMNPRSTUWXYZ'.split('');
const LOWER = 'abcdefghkmnprstuwxyz'.split('');
const DIGITS = '0123456789'.split('');
const MULTI_DIGIT = ['10', '12', '13', '15', '17', '20', '21', '25', '30', '37', '42', '50', '67', '75', '84', '91', '100'];

export const TARGETS: Target[] = [
  ...UPPER.map((c) => ({ char: c, kind: 'upper' as const, label: 'capital ' + c })),
  ...LOWER.map((c) => ({ char: c, kind: 'lower' as const, label: 'lowercase ' + c })),
  ...DIGITS.map((c) => ({ char: c, kind: 'digit' as const, label: 'the number ' + c })),
  ...MULTI_DIGIT.map((n) => ({ char: n, kind: 'multi-digit' as const, label: 'the number ' + n })),
];

export const SESSION_SIZE = 3;
export const MAX_ATTEMPTS = 2; // after the second try the retry button goes away
export const PROMPT_PHRASES = ['Write {label} for me.', 'Show me your best {label}.', "Let's practice writing {label}.", 'Can you draw {label}?'];

// Copy, verbatim from legacy.
export const LINES = {
  listen: '👂 Listen to Ms. Humphrey, then draw what she says.',
  empty: "Looks like you haven't drawn anything yet, Nigel. Tap and drag to write.",
  revealIntro: (t: Target) => `Nice work, Nigel. Here's how I write ${t.label}:`,
  tryAgain: 'Give it another try, Nigel. You saw my version — now show me yours.',
  finish: (n: number) => `You practiced ${n} things with me today, Nigel. Beautiful work!`,
  compareTitle: (attempts: number) => (attempts === 1 ? 'Nice work! How does yours look?' : 'Great practice! Ready to move on?'),
  goodButton: (isLast: boolean) => (isLast ? '✓ Looks great! All done 🎉' : '✓ Looks great! Next →'),
};

export function promptFor(t: Target, rng: Rng = Math.random) {
  const phrase = PROMPT_PHRASES[Math.floor(rng() * PROMPT_PHRASES.length)];
  // Legacy said "Show me your best the number 91." Drop the article after "your best".
  const label = phrase.includes('your best') ? t.label.replace(/^the /, '') : t.label;
  return phrase.replace('{label}', label);
}

// Stratified pick (legacy v102): slot 1 a number (60% two-digit), slot 2 a
// letter (50/50 upper/lower), slot 3 weighted (40% two-digit, 25% digit,
// 17.5% upper, 17.5% lower), then shuffled. No repeats within a session.
export function pickTargets(rng: Rng = Math.random): Target[] {
  const used = new Set<string>();
  const take = (ok: (t: Target) => boolean) => {
    const pool = TARGETS.filter((t) => ok(t) && !used.has(t.char + ':' + t.kind));
    if (!pool.length) return null;
    const p = pool[Math.floor(rng() * pool.length)]; used.add(p.char + ':' + p.kind); return p;
  };
  const is = (k: Kind) => (t: Target) => t.kind === k;
  const picks: Target[] = [];
  const s1 = rng() < 0.6 ? take(is('multi-digit')) || take(is('digit')) : take(is('digit')) || take(is('multi-digit'));
  if (s1) picks.push(s1);
  const s2 = rng() < 0.5 ? take(is('upper')) || take(is('lower')) : take(is('lower')) || take(is('upper'));
  if (s2) picks.push(s2);
  const r = rng();
  const k3: Kind = r < 0.4 ? 'multi-digit' : r < 0.65 ? 'digit' : r < 0.825 ? 'upper' : 'lower';
  const s3 = take(is(k3)) || take(() => true);
  if (s3) picks.push(s3);
  for (let i = picks.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [picks[i], picks[j]] = [picks[j], picks[i]]; }
  return picks;
}

// Local date key, as legacy todayKey() (not UTC).
export function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function pushLog(store: KV, entry: Record<string, unknown>, now: Date) {
  const key = 'ha_letter_lab_attempts_' + todayKey(now);
  let list: unknown[] = [];
  try { const raw = store.getItem(key); if (raw) list = JSON.parse(raw) || []; } catch { list = []; }
  list.push(entry);
  try { store.setItem(key, JSON.stringify(list)); } catch { /* storage full or blocked */ }
}
// Logged when the compare panel appears (legacy recordSelfAssessmentOpportunity).
export function logRevealShown(store: KV, t: Target, attempt: number, now = new Date()) {
  pushLog(store, { target: t.char, kind: t.kind, attempt, ts: now.getTime(), phase: 'reveal_shown' }, now);
}
// Today's Mission checkmark (legacy ha_letter_lab_<yyyy-mm-dd>).
export function markDone(store: KV, targets: Target[], now = new Date()) {
  try {
    store.setItem('ha_letter_lab_' + todayKey(now), JSON.stringify({ completed_at: now.getTime(), targets: targets.map((t) => t.char), kinds: targets.map((t) => t.kind) }));
  } catch { /* storage unavailable */ }
}

// ---------- Ms. Humphrey's pen (legacy animator timing) ----------
export const VIRTUAL_W = 1000;
export const PEN_SPEED = 0.42;          // letter-box units per ms
export const MIN_SEG_MS = 80;
export const INTER_STROKE_MS = 320;
export const INTER_CHAR_MS = 400;
export const INK_WIDTH = 10;            // virtual units

export interface Seg { x1: number; y1: number; x2: number; y2: number; start: number; dur: number }

// Writing guides, in virtual units, for a board virtualH tall. The letter box
// is centred at full size, so capitals and digits (y -230..230) stand on the
// baseline and the dashed line marks the lowercase x-height (y ≈ -20).
export function guides(virtualH: number) {
  const s = Math.max(0.3, Math.min(1, (virtualH - 120) / 500)); const cy = virtualH / 2;
  return { top: cy - 250 * s, mid: cy - 20 * s, base: cy + 230 * s };
}

// Plan every segment of a target as absolute times, in canvas virtual units
// (VIRTUAL_W wide, virtualH tall). Single chars at full size; numbers lay
// digits side by side at the legacy scales. Each glyph is dropped so its own
// baseline lands on the board's baseline (lowercase letters stand on y=180 in
// the stroke data, capitals and digits on 230); the stroke points are unchanged.
export function planStrokes(chars: string[], virtualH: number, kind?: Kind): { segs: Seg[]; total: number } {
  const maxScale = Math.max(0.3, Math.min(1, (virtualH - 120) / 500));
  const n = chars.length;
  let scale = maxScale, spacing = 0;
  if (n === 2) { scale = 0.65; spacing = 300; } else if (n === 3) { scale = 0.45; spacing = 220; } else if (n > 3) { scale = 0.35; spacing = 170; }
  if (scale > maxScale) scale = maxScale;
  const cy = guides(virtualH).base - (kind === 'lower' ? 180 : 230) * scale;
  const firstCx = 500 - (spacing * (n - 1)) / 2;
  const segs: Seg[] = []; let t = 0;
  chars.forEach((c, ci) => {
    const strokes = STROKES[c] || [];
    const cx = firstCx + ci * spacing;
    strokes.forEach((s, si) => {
      for (let i = 0; i < s.length - 1; i++) {
        const x1 = cx + s[i][0] * scale, y1 = cy + s[i][1] * scale, x2 = cx + s[i + 1][0] * scale, y2 = cy + s[i + 1][1] * scale;
        // Legacy computes duration from the projected segment length.
        const dur = Math.max(MIN_SEG_MS, Math.hypot(x2 - x1, y2 - y1) / PEN_SPEED);
        segs.push({ x1, y1, x2, y2, start: t, dur }); t += dur;
      }
      if (si < strokes.length - 1) t += INTER_STROKE_MS;
    });
    if (ci < n - 1) t += INTER_CHAR_MS;
  });
  return { segs, total: t };
}

export const canAnimate = (t: Target) => t.char.split('').every(hasStrokes);
