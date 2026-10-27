// @ts-nocheck
// Ported verbatim from js/digit-tower.js v210 (question generators + hint ladders + work boards).
import { WORLDS, type Kind } from './config';
export interface Q { kind: Kind; topic: string; prompt: string; say: string; answer: number; hints: [string, string, string]; start: string; work: any }
const rnd = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
function pickWeighted(weights: Record<string, number>) { let r = Math.random(), keys = Object.keys(weights), tot = keys.reduce((s, k) => s + weights[k], 0); r *= tot; for (const k of keys) { r -= weights[k]; if (r <= 0) return k; } return keys[0]; }
  // Each returns { kind, topic, prompt, say, answer, hints:[3], start, work:{...} }
function genAdd2(reg) {
    let a, b; for (let i = 0; i < 100; i++) { a = rnd(12, 78); b = rnd(11, 78); if (a + b > 99) continue; if (((a % 10 + b % 10) >= 10) === reg) break; }
    const s = a + b, ao = a % 10, bo = b % 10, at = Math.floor(a / 10), bt = Math.floor(b / 10), c = (ao + bo) >= 10 ? 1 : 0;
    return { kind: reg ? 'add2r' : 'add2', topic: reg ? 'two-digit-add-regroup' : 'two-digit-add-no-regroup', prompt: `${a} + ${b} = ?`, say: `What is ${a} plus ${b}?`, answer: s,
      work: { type: 'cols', a, b, ao, bo, at, bt, c, s },
      hints: [`Add the ones first: ${ao} plus ${bo}. What do you get?`,
        c ? `${ao} plus ${bo} is ${ao + bo}. Write ${(ao + bo) % 10} in the ones and carry one to the tens. Now add ${at} plus ${bt} plus one.` : `${ao} plus ${bo} is ${ao + bo}. Now add the tens: ${at} plus ${bt}.`,
        c ? `Ones: ${ao} plus ${bo} is ${ao + bo}, write ${(ao + bo) % 10}, carry one. Tens: ${at} plus ${bt} plus one is ${at + bt + 1}. So ${a} plus ${b} is ${s}. Type ${s} to open it.` : `Ones: ${ao} plus ${bo} is ${ao + bo}. Tens: ${at} plus ${bt} is ${at + bt}. So ${a} plus ${b} is ${s}. Type ${s} to open it.`],
      start: 'Add the ones first, then the tens.' };
  }
function genFact() {
    let a, b; do { a = rnd(3, 12); b = rnd(3, 12); } while (a + b > 20 || a + b < 11);
    const s = a + b, big = Math.max(a, b), sm = Math.min(a, b), need = 10 - big;
    return { kind: 'fact', topic: 'addition-within-20', prompt: `${a} + ${b} = ?`, say: `What is ${a} plus ${b}?`, answer: s, work: { type: 'tenframe', a, b, big, sm, need, s },
      hints: [`Make a ten. ${big} needs ${need} more to reach ten. Take ${need} from the ${sm}.`, `${big} plus ${need} is ten, and ${sm} minus ${need} is ${sm - need}. So it is ten plus ${sm - need}.`, `Ten plus ${sm - need} is ${s}. So ${a} plus ${b} is ${s}. Type ${s}.`],
      start: 'Make a ten first, then count what is left.' };
  }
function genSkip() {
    const step = Math.random() < 0.7 ? 10 : 5; const start = step === 10 ? rnd(1, 60) : rnd(0, 12) * 5; const seq = [start, start + step, start + 2 * step], s = start + 3 * step;
    return { kind: 'skip', topic: step === 10 ? 'skip-count-10' : 'skip-count-5', prompt: `${seq.join(', ')}, ?`, say: `What comes next? ${seq.join(', ')}…`, answer: s, work: { type: 'seq', seq, step, s },
      hints: [`Each number jumps by ${step}. What is ${seq[2]} plus ${step}?`, `${seq[0]}, ${seq[1]}, ${seq[2]}. Every jump is plus ${step}. ${step === 10 ? 'The ones digit never changes.' : 'The ones digit flips between zero and five.'} One more jump from ${seq[2]}.`, `${seq[2]} plus ${step} is ${s}. Type ${s}.`],
      start: 'Look at how much the numbers grow each time.' };
  }
function genMissing() {
    const c = rnd(30, 90), a = rnd(11, c - 6), s = c - a, toTen = (10 - a % 10) % 10, mid = a + toTen;
    return { kind: 'missing', topic: 'missing-addend', prompt: `${a} + ? = ${c}`, say: `${a} plus what makes ${c}?`, answer: s, work: { type: 'countup', a, c, toTen, mid, s },
      hints: [`Count up from ${a}. First, how many to reach the next ten, ${toTen ? mid : a + 10}?`, toTen ? `${a} plus ${toTen} is ${mid}. Now jump from ${mid} to ${c}: that is ${c - mid} more. Add your jumps: ${toTen} plus ${c - mid}.` : `${a} is already on a ten. Jump from ${a} to ${c}: that is ${c - a}.`, `The jumps add up to ${s}. So ${a} plus ${s} is ${c}. Type ${s}.`],
      start: 'Count up from the first number until you reach the total.' };
  }
function genMoney() {
    const d = rnd(1, 5), n = rnd(0, 3), p = rnd(0, 4); const s = d * 10 + n * 5 + p;
    const parts = [`${d} dime${d > 1 ? 's' : ''}`]; if (n) parts.push(`${n} nickel${n > 1 ? 's' : ''}`); if (p) parts.push(`${p} penn${p > 1 ? 'ies' : 'y'}`);
    const txt = parts.join(', ');
    return { kind: 'money', topic: 'money-count-cents', prompt: `${txt}.\nHow many cents?`, say: `Pirate Penny left ${txt}. How many cents is that?`, answer: s,
      work: { type: 'steps', steps: [`Dimes: ${d} × 10 = ${d * 10}¢`, n ? `Nickels: ${n} × 5 = ${n * 5}¢` : null, p ? `Pennies: ${p}¢` : null, `Total: ${s}¢`].filter(Boolean) },
      hints: [`Count the dimes first, by tens: ${d} dimes is ${d * 10} cents.`, `Now add the nickels by fives${n ? `: ${n * 5} more makes ${d * 10 + n * 5}` : ': there are none'}. Then add the pennies.`, `${d * 10}${n ? ` plus ${n * 5}` : ''}${p ? ` plus ${p}` : ''} is ${s} cents. Type ${s}.`],
      start: 'Dimes are ten, nickels are five, pennies are one.' };
  }
function genTime() {
    const h = rnd(1, 10), add = rnd(1, 4), s = h + add;
    return { kind: 'time', topic: 'time-hours-later', prompt: `The clock says ${h} o'clock.\nWhat hour is it ${add} hour${add > 1 ? 's' : ''} later?`, say: `The clock says ${h} o'clock. What hour will it be ${add} hour${add > 1 ? 's' : ''} later?`, answer: s,
      work: { type: 'steps', steps: [`Start at ${h} o'clock`, `Count ${add} hour${add > 1 ? 's' : ''} forward: ${Array.from({ length: add }, (_, i) => h + i + 1).join(', ')}`, `It will be ${s} o'clock`] },
      hints: [`Start at ${h} and count forward ${add}.`, `${h}, then ${h + 1}${add > 1 ? `, then ${h + 2}` : ''}… keep going ${add} times.`, `${h} plus ${add} is ${s}. It will be ${s} o'clock. Type ${s}.`], start: 'Count the hours forward on the clock.' };
  }
function genLength() {
    const a = rnd(11, 45), b = rnd(8, 40), s = a + b;
    return { kind: 'length', topic: 'length-add-cm', prompt: `One plank is ${a} cm.\nAnother is ${b} cm.\nHow long together?`, say: `One plank is ${a} centimeters. Another is ${b} centimeters. How long are they together?`, answer: s,
      work: { type: 'cols', a, b, ao: a % 10, bo: b % 10, at: Math.floor(a / 10), bt: Math.floor(b / 10), c: (a % 10 + b % 10) >= 10 ? 1 : 0, s },
      hints: [`Together means add. Add the ones first: ${a % 10} plus ${b % 10}.`, `Now the tens: ${Math.floor(a / 10)} plus ${Math.floor(b / 10)}${(a % 10 + b % 10) >= 10 ? ' plus the carry' : ''}.`, `${a} plus ${b} is ${s} centimeters. Type ${s}.`], start: 'Together means add. Line up the tens and ones.' };
  }
function genArrays() {
    const r = rnd(2, 5), c = rnd(2, 5), s = r * c;
    return { kind: 'arrays', topic: 'arrays-repeated-addition', prompt: `${r} rows of ${c} bulbs.\nHow many bulbs?`, say: `${r} rows, with ${c} bulbs in each row. How many bulbs in all?`, answer: s, work: { type: 'array', r, c, s },
      hints: [`Add ${c} for every row: ${Array(r).fill(c).join(' + ')}.`, `Count by ${c}s, ${r} times: ${Array.from({ length: r }, (_, i) => c * (i + 1)).join(', ')}.`, `${r} rows of ${c} is ${s}. Type ${s}.`], start: 'Add one row at a time.' };
  }
function genShapes() {
    const shapes = [['triangle', 3], ['square', 4], ['pentagon', 5], ['hexagon', 6]]; const [nm, sides] = shapes[rnd(0, 3)]; const k = rnd(2, 3), s = sides * k;
    return { kind: 'shapes', topic: 'shapes-sides-count', prompt: `${k} ${nm}s.\nHow many sides in all?`, say: `Polygon Pete has ${k} ${nm}s. How many sides in all?`, answer: s, work: { type: 'steps', steps: [`A ${nm} has ${sides} sides`, `${k} ${nm}s: ${Array(k).fill(sides).join(' + ')}`, `= ${s} sides`] },
      hints: [`A ${nm} has ${sides} sides. Add ${sides} for each shape.`, `${Array(k).fill(sides).join(' plus ')}.`, `That is ${s} sides. Type ${s}.`], start: 'Count the sides of one shape first.' };
  }
function genGraph() {
    const red = rnd(8, 20), blue = rnd(3, red - 2), s = red - blue;
    return { kind: 'graph', topic: 'graph-compare-more', prompt: `Gem chart:\nRed ${red} · Blue ${blue}\nHow many more red than blue?`, say: `The gem chart shows ${red} red and ${blue} blue. How many more red than blue?`, answer: s, work: { type: 'countup', a: blue, c: red, toTen: (10 - blue % 10) % 10, mid: blue + (10 - blue % 10) % 10, s },
      hints: [`How many more means count up from ${blue} to ${red}.`, `Start at ${blue}, count up until you reach ${red}. Keep track of the jumps.`, `${blue} plus ${s} is ${red}. So ${s} more red. Type ${s}.`], start: 'Count up from the smaller bar to the taller bar.' };
  }
function genThree() {
    const h = rnd(1, 8), t = rnd(0, 9), o = rnd(0, 9); const s = h * 100 + t * 10 + o;
    return { kind: 'three', topic: 'three-digit-expanded', prompt: `${h * 100} + ${t * 10} + ${o} = ?`, say: `What is ${h * 100} plus ${t * 10} plus ${o}?`, answer: s, work: { type: 'steps', steps: [`${h} hundreds = ${h * 100}`, `${t} tens = ${t * 10}`, `${o} ones = ${o}`, `Together: ${s}`] },
      hints: [`Hundreds, tens, ones. ${h * 100} is ${h} hundreds.`, `${t * 10} is ${t} tens, and ${o} is ${o} ones. Put them in their places.`, `${h} hundreds, ${t} tens, ${o} ones is ${s}. Type ${s}.`], start: 'Each number goes in its own place: hundreds, tens, ones.' };
  }
export const GEN: Record<Kind, () => Q> = { add2: () => genAdd2(false), add2r: () => genAdd2(true), fact: genFact, skip: genSkip, missing: genMissing, money: genMoney, time: genTime, length: genLength, arrays: genArrays, shapes: genShapes, graph: genGraph, three: genThree };
export function weakKindFromTopic(id: string): Kind | null { id = String(id || '').toLowerCase(); if (/no-regroup|no_regroup/.test(id)) return 'add2'; if (/regroup|double-digit|two-digit|word-problem/.test(id)) return 'add2r'; if (/within-20|within-15|teens|make-ten/.test(id)) return 'fact'; if (/skip|count-by/.test(id)) return 'skip'; if (/missing|subtract/.test(id)) return 'missing'; return null; }
export function makeQuestion(mode: string, worldIdx: number, weakKinds: Kind[]): Q {
    // mode: 'world' | 'weak' | 'review' | 'fact' | kind name
    const w = WORLDS[worldIdx];
    let kind: string;
    if (GEN[mode]) kind = mode;
    else if (mode === 'weak') { const ks: Kind[] = weakKinds.length ? weakKinds : ['add2r']; kind = ks[rnd(0, ks.length - 1)]; }
    else if (mode === 'review') kind = ['add2', 'fact', 'skip'][rnd(0, 2)];
    else { const r = Math.random(); kind = r < 0.6 ? pickWeighted(w.kinds) : r < 0.85 ? (weakKinds[rnd(0, Math.max(0, weakKinds.length - 1))] || 'add2r') : ['add2', 'fact', 'skip'][rnd(0, 2)]; }
    return GEN[kind as Kind]();
  }

