// Room generation + BFS, ported from js/digit-tower.js v210 (pure, no DOM).
import { COLS, ROWS } from './config';

export function hash32(str: string) { let h = 2166136261 >>> 0; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
export function mulberry(a: number) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export type Tile = '#' | '.' | 'S' | 'E' | 'D' | 'V' | 'C' | 'G' | 'R';
export interface Cell { c: number; r: number }
export interface RoomStats { locks: number; first: number; assisted: number; board: number; ms: number; t0: number; topics: Record<string, { n: number; first: number }> }
export interface Room {
  grid: Tile[][];
  hero: { c: number; r: number; x: number; y: number };
  path: Cell[]; walkT: number;
  opened: Set<string>; seen: Set<string>;
  ralphie: boolean; hintTokens: number; bonus: boolean;
  pending: (Cell & { ch: Tile }) | null;
  stats: RoomStats;
}

export const key = (c: number, r: number) => `${c},${r}`;
export const isLockCh = (ch: Tile) => ch === 'D' || ch === 'V' || ch === 'C' || ch === 'R';

function shuffle<T>(arr: T[], rng: () => number) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }

export function makeRoom(seed: number, opts: { bonus?: boolean; lieutenant?: boolean; twist: string }): Room {
  const R = mulberry(seed);
  const rndS = (a: number, b: number) => a + Math.floor(R() * (b - a + 1));
  let grid: Tile[][] = [];
  for (let attempt = 0; attempt < 80; attempt++) {
    grid = [];
    for (let r = 0; r < ROWS; r++) { grid.push([]); for (let c = 0; c < COLS; c++) { const edge = r === 0 || c === 0 || r === ROWS - 1 || c === COLS - 1; grid[r].push(edge ? '#' : (R() < 0.2 ? '#' : '.')); } }
    grid[1][1] = 'S'; grid[ROWS - 2][COLS - 2] = 'E';
    if (opts.lieutenant) { grid[ROWS - 2][COLS - 3] = 'V'; grid[ROWS - 3][COLS - 2] = 'V'; grid[ROWS - 3][COLS - 3] = 'V'; }
    const open: Cell[] = []; for (let r = 1; r < ROWS - 1; r++) for (let c = 1; c < COLS - 1; c++) if (grid[r][c] === '.') open.push({ c, r });
    shuffle(open, R);
    const nL = opts.bonus ? 2 : rndS(4, 6), nC = (opts.bonus ? 4 : rndS(1, 2)) + (opts.twist === 'gems' ? 2 : 0), nG = rndS(2, 3);
    let i = 0; for (let k = 0; k < nL && i < open.length; k++, i++) grid[open[i].r][open[i].c] = 'D';
    for (let k = 0; k < nC && i < open.length; k++, i++) grid[open[i].r][open[i].c] = 'C';
    for (let k = 0; k < nG && i < open.length; k++, i++) grid[open[i].r][open[i].c] = 'G';
    if (opts.twist === 'ralphie' && i < open.length) { grid[open[i].r][open[i].c] = 'R'; i++; }
    const seen = new Set(['1,1']); const q: Cell[] = [{ c: 1, r: 1 }];
    while (q.length) { const n = q.shift()!; for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const c = n.c + dc, r = n.r + dr; if (grid[r][c] === '#' || seen.has(key(c, r))) continue; seen.add(key(c, r)); q.push({ c, r }); } }
    let ok = true; for (let r = 1; r < ROWS - 1; r++) for (let c = 1; c < COLS - 1; c++) if (grid[r][c] !== '#' && !seen.has(key(c, r))) ok = false;
    if (ok) break;
  }
  if (opts.twist === 'mirror') grid = grid.map((row) => row.slice().reverse());
  let hero = { c: 1, r: 1 }; for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (grid[r][c] === 'S') hero = { c, r };
  return { grid, hero: { c: hero.c, r: hero.r, x: hero.c, y: hero.r }, path: [], walkT: 0, opened: new Set(), seen: new Set([key(hero.c, hero.r)]), ralphie: false, hintTokens: 0, bonus: !!opts.bonus, pending: null, stats: { locks: 0, first: 0, assisted: 0, board: 0, ms: 0, t0: Date.now(), topics: {} } };
}

export function tileAt(room: Room | null, c: number, r: number): Tile { return (room && room.grid[r] && room.grid[r][c]) || '#'; }
export function passable(room: Room, c: number, r: number) { const ch = tileAt(room, c, r); if (ch === '#') return false; if (isLockCh(ch) && !room.opened.has(key(c, r))) return false; return true; }
export function bfs(room: Room, from: Cell, goalFn: (n: Cell) => boolean): Cell[] | null {
  const prev = new Map<string, string | null>([[key(from.c, from.r), null]]); const q: Cell[] = [from];
  while (q.length) {
    const n = q.shift()!;
    if (goalFn(n)) { const p: Cell[] = []; let k: string | null | undefined = key(n.c, n.r); while (k) { const [c, r] = k.split(',').map(Number); p.unshift({ c, r }); k = prev.get(k); } return p; }
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const c = n.c + dc, r = n.r + dr, k = key(c, r); if (prev.has(k) || !passable(room, c, r)) continue; prev.set(k, key(n.c, n.r)); q.push({ c, r }); }
  }
  return null;
}
export function allVaultsOpen(room: Room) { for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (tileAt(room, c, r) === 'V' && !room.opened.has(key(c, r))) return false; return true; }
