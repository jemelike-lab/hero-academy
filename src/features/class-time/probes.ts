// Tutor probes (v303). One pick-one check-in after the first wrong answer.
// Arithmetic questions get a deterministic probe so this works offline and on
// the hosted preview; everything else asks /api/class-time/probe (Haiku).
import type { Question } from '@/lib/api';
import { parseEquation } from './manipulatives/parseEquation';

export interface Probe {
  ask: string;
  options: [string, string];
  correct_index: 0 | 1;
  right_say: string;
  wrong_say: string;
}

function equationFor(q: Question) {
  const fromQ = parseEquation((q.question.match(/\d{1,3}\s*[+\-−–]\s*\d{1,3}/) || [])[0]);
  if (fromQ) return fromQ;
  const step = q.remediation?.steps?.find((s) => s.board?.tool === 'drawEquation');
  return parseEquation(step?.board?.args.equation);
}

export function mathProbe(q: Question, wrongIdx: number): Probe | null {
  const eq = equationFor(q);
  if (!eq) return null;
  const picked = Number(q.options[wrongIdx]);
  const a = eq.a, b = eq.b;
  // Probe 1: did he pick the wrong direction (bigger vs smaller)?
  if (eq.op === '+' && Number.isFinite(picked) && picked < a) {
    return {
      ask: `When we add ${b} more, does the number get bigger or smaller?`,
      options: ['Bigger', 'Smaller'], correct_index: 0,
      right_say: `Right, bigger. So start at ${a} and count up ${b}.`,
      wrong_say: `Adding means putting more in, so it gets bigger. Start at ${a} and count up ${b}.`,
    };
  }
  if (eq.op === '-' && Number.isFinite(picked) && picked > a) {
    return {
      ask: `When we take ${b} away, does the number get bigger or smaller?`,
      options: ['Bigger', 'Smaller'], correct_index: 1,
      right_say: `Right, smaller. Start at ${a} and hop back ${b}.`,
      wrong_say: `Taking away makes it smaller. Start at ${a} and hop back ${b}.`,
    };
  }
  // Probe 2: regrouping check for two-digit addition
  if (eq.op === '+' && a >= 10 && b >= 10) {
    const ones = (a % 10) + (b % 10);
    const regroup = ones >= 10;
    return {
      ask: `Add the ones first: ${a % 10} plus ${b % 10}. Is that ten or more?`,
      options: ['Yes, ten or more', 'No, less than ten'], correct_index: regroup ? 0 : 1,
      right_say: regroup ? `Yes! So we carry a one to the tens. Now add the tens and put it together.` : `Right, no carry needed. Now add the tens and put it together.`,
      wrong_say: regroup ? `${a % 10} plus ${b % 10} is ${ones}, that is ten or more, so we carry one to the tens.` : `${a % 10} plus ${b % 10} is ${ones}, less than ten, so no carry. Now add the tens.`,
    };
  }
  // Probe 3: operation check
  return {
    ask: eq.op === '+' ? 'Are we putting groups together, or taking some away?' : 'Are we taking some away, or putting groups together?',
    options: ['Putting together', 'Taking away'], correct_index: eq.op === '+' ? 0 : 1,
    right_say: eq.op === '+' ? `Yes, putting together. Start at ${a} and count up ${b}. The answer is more than ${Math.max(a, b)}.` : `Yes, taking away. Start at ${a} and hop back ${b}. The answer is less than ${a}.`,
    wrong_say: eq.op === '+' ? `This one puts groups together, so we add. Start at ${a} and count up ${b}.` : `This one takes some away, so we subtract. Start at ${a} and hop back ${b}.`,
  };
}

export async function fetchProbe(q: Question, wrongIdx: number, subject: string): Promise<Probe | null> {
  const local = mathProbe(q, wrongIdx);
  if (local) return local;
  try {
    const r = await fetch('/api/class-time/probe', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: q.question, options: q.options, correct_index: q.correct_index, wrong_index: wrongIdx, subject, topic: q.topic, hint: q.hint }),
    });
    if (!r.ok) return null;
    const data = await r.json();
    const p = data.probe;
    if (!p || !Array.isArray(p.options) || p.options.length !== 2) return null;
    return { ask: p.ask, options: [p.options[0], p.options[1]], correct_index: p.correct_index === 1 ? 1 : 0, right_say: p.right_say, wrong_say: p.wrong_say };
  } catch { return null; }
}
