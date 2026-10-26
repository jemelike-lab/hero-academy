// Turns a board equation string ("14 + 6 = ?", "23 - 8 = 15") into a
// structured problem the manipulatives can draw. Returns null for anything
// that isn't a plain a ± b.
export interface ParsedEquation {
  a: number; b: number; op: '+' | '-'; result: number | null; raw: string;
}

export function parseEquation(raw: string | undefined): ParsedEquation | null {
  if (!raw) return null;
  const m = /^\s*(\d{1,3})\s*([+\-−–])\s*(\d{1,3})\s*(?:=\s*(\?|\d{1,3}))?\s*$/.exec(raw.replace(/\s+/g, ' '));
  if (!m) return null;
  const a = parseInt(m[1], 10), b = parseInt(m[3], 10);
  const op = m[2] === '+' ? '+' : '-';
  const result = m[4] && m[4] !== '?' ? parseInt(m[4], 10) : null;
  if (op === '-' && b > a) return null;
  return { a, b, op, result, raw };
}

export type ManipulativeKind = 'ten-frame' | 'base-ten' | 'number-line';

export function pickManipulative(p: ParsedEquation): ManipulativeKind {
  if (p.op === '-') return 'number-line';
  if (p.a <= 10 && p.b <= 10 && p.a + p.b <= 20) return 'ten-frame';
  if (p.a + p.b <= 30) return 'number-line';
  return 'base-ten';
}
