import { memo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import { COLS, RANKS, ROWS } from './config';
import { key, tileAt, type Room, type Tile } from './room';
import type { Burst, Float } from './useDigitTower';

export function HeroSVG({ rank, className }: { rank: number; className?: string }) {
  const k = RANKS[rank] || RANKS[0];
  return (
    <svg viewBox="0 0 64 80" className={className} style={{ overflow: 'visible' }} aria-hidden>
      <path className="dt-cape" d="M14 30 Q6 50 10 74 L20 70 Q18 50 22 34 Z" fill={k.cape} opacity=".9" style={{ filter: `drop-shadow(0 0 6px ${k.cape})` }} />
      <path className="dt-cape" d="M50 30 Q58 50 54 74 L44 70 Q46 50 42 34 Z" fill={k.cape} opacity=".8" />
      <rect x="22" y="30" width="20" height="26" rx="6" fill={k.suit} />
      <path d="M32 34 L40 44 L36 44 L36 56 L28 56 L28 44 L24 44 Z" fill="#ffc72c" />
      <rect x="14" y="32" width="8" height="18" rx="4" fill={k.suit} />
      <rect x="42" y="32" width="8" height="18" rx="4" fill={k.suit} />
      <circle cx="32" cy="22" r="11" fill="#8d5a3b" />
      <path d="M21 20 Q22 10 32 10 Q42 10 43 20 Q43 16 38 14 Q32 12 26 16 Q22 18 21 20Z" fill="#1a0f0a" />
      <path d="M22 19 Q32 16 42 19 L42 24 Q32 26 22 24 Z" fill={k.cape} opacity=".9" />
      <circle cx="27" cy="22" r="1.6" fill="#fff" /><circle cx="37" cy="22" r="1.6" fill="#fff" />
      <rect x="24" y="56" width="7" height="16" rx="3" fill="#13205a" /><rect x="33" y="56" width="7" height="16" rx="3" fill="#13205a" />
    </svg>
  );
}

function Lock({ kind }: { kind: string }) {
  if (kind === 'crate') return <div className="dt-crate rounded-md relative" style={{ width: '62%', height: '55%' }}><div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[3px] w-[30%] rounded" style={{ background: 'var(--dt-acc)', boxShadow: '0 0 6px var(--dt-acc)' }} /></div>;
  if (kind === 'cage') return <svg width="56%" height="56%" viewBox="0 0 24 24" className="dt-glow" fill="none" stroke="#7bd389" strokeWidth="2" strokeLinecap="round"><rect x="4" y="6" width="16" height="14" rx="2" /><path d="M8 6v14M12 6v14M16 6v14" /><circle cx="12" cy="13" r="2" fill="#7bd389" /></svg>;
  const vault = kind === 'vault';
  return (
    <svg width="46%" height="46%" viewBox="0 0 24 24" className="dt-glow" fill="none" stroke={vault ? '#ff4f8b' : 'var(--dt-acc)'} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="10" rx="2.5" fill="rgba(0,0,0,.55)" /><path d="M8 11V7a4 4 0 018 0v4" /><circle cx="12" cy="15.5" r="1.4" fill={vault ? '#ff4f8b' : 'var(--dt-acc)'} />
    </svg>
  );
}

function Gem() {
  return (
    <div className="dt-bob absolute" style={{ filter: 'drop-shadow(0 0 10px var(--dt-acc2))' }}>
      <svg width="34" height="34" viewBox="0 0 24 24"><path d="M12 2l4 6-4 14-4-14z" fill="var(--dt-acc2)" stroke="#fff" strokeWidth="1" opacity=".95" /><path d="M12 2L8 8h8z" fill="#fff" opacity=".6" /></svg>
    </div>
  );
}

function Stairs() {
  return <svg width="42%" height="42%" viewBox="0 0 24 24" fill="none" stroke="var(--dt-acc2)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 0 8px var(--dt-acc2))' }}><path d="M3 21h18M5 21V9l5-5 5 5v12M9 21V13h6v8" /></svg>;
}

export const RoomGrid = memo(function RoomGrid({ room, twist, rank, sel, floats, bursts, onTap }: {
  room: Room; twist: string; rank: number; sel: string | null; floats: Float[]; bursts: Burst[]; onTap: (c: number, r: number) => void;
}) {
  const pathSet = new Set(room.path.map((p) => key(p.c, p.r)));
  const pct = (n: number, total: number) => `${((n + 0.5) / total) * 100}%`;
  return (
    <div className="relative w-full h-full">
      <div className="grid gap-2 w-full h-full" style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)`, gridTemplateRows: `repeat(${ROWS}, 1fr)` }}>
        {Array.from({ length: ROWS }).flatMap((_, r) => Array.from({ length: COLS }).map((_, c) => {
          const ch: Tile = tileAt(room, c, r); const k = key(c, r);
          const opened = room.opened.has(k); const seen = room.seen.has(k);
          const fog = twist === 'fog' && !seen && ch !== '#';
          const wall = ch === '#';
          return (
            <button key={k} onClick={() => onTap(c, r)} disabled={wall} aria-label={wall ? 'wall' : ch === 'E' ? 'stairs' : ch === 'G' && !opened ? 'gem' : ch === 'D' && !opened ? 'locked door' : ch === 'C' && !opened ? 'treasure crate' : ch === 'V' && !opened ? 'vault lock' : ch === 'R' && !opened ? "Ralphie's cage" : 'floor'}
              className={clsx('dt-tile flex items-center justify-center', wall && 'wall', fog && 'fog', ch === 'E' && 'stair', !opened && (ch === 'D' || ch === 'V' || ch === 'C' || ch === 'R') && 'lock', sel === k && 'sel')}>
              {!fog && !opened && ch === 'D' && <Lock kind="door" />}
              {!fog && !opened && ch === 'V' && <Lock kind="vault" />}
              {!fog && !opened && ch === 'C' && <Lock kind="crate" />}
              {!fog && !opened && ch === 'R' && <Lock kind="cage" />}
              {!fog && !opened && ch === 'G' && <Gem />}
              {ch === 'E' && <Stairs />}
              {pathSet.has(k) && <span className="dt-pathdot absolute" />}
            </button>
          );
        }))}
      </div>

      {/* hero + spotlight, positioned in grid space */}
      <div className="absolute pointer-events-none" style={{ left: pct(room.hero.x, COLS), top: pct(room.hero.y, ROWS), transform: 'translate(-50%, -62%)', width: `${100 / COLS}%`, aspectRatio: '1 / 1.3' }}>
        <div className="dt-spot absolute left-1/2 top-[70%] w-[90%] h-[40%] -translate-x-1/2 rounded-full" />
        <HeroSVG rank={rank} className="w-full h-full relative" />
      </div>
      {room.ralphie && (
        <div className="absolute pointer-events-none w-9 h-9 transition-all duration-300" style={{ left: pct(room.hero.x - 0.55, COLS), top: pct(room.hero.y + 0.25, ROWS), transform: 'translate(-50%,-50%)' }}>
          <img src="/assets/clips/ralphie_poster.jpg" alt="" className="w-full h-full rounded-full object-cover ring-2 ring-[#7bd389]" />
        </div>
      )}

      {twist === 'night' && <div className="dt-night absolute inset-0 pointer-events-none rounded-2xl" style={{ ['--hx' as string]: pct(room.hero.x, COLS), ['--hy' as string]: pct(room.hero.y, ROWS) }} />}

      {/* bursts */}
      <AnimatePresence>
        {bursts.map((b) => (
          <div key={b.id} className="absolute pointer-events-none" style={{ left: pct(b.c, COLS), top: pct(b.r, ROWS) }}>
            {Array.from({ length: Math.min(b.n, 18) }).map((_, i) => {
              const a = (i / Math.min(b.n, 18)) * Math.PI * 2; const d = 40 + (i % 4) * 18;
              return <motion.span key={i} initial={{ x: 0, y: 0, opacity: 1, scale: 1 }} animate={{ x: Math.cos(a) * d, y: Math.sin(a) * d + 30, opacity: 0, scale: 0.4 }} transition={{ duration: 0.8, ease: 'easeOut' }} className="absolute w-2.5 h-2.5 rounded-full" style={{ background: b.col, boxShadow: `0 0 8px ${b.col}` }} />;
            })}
          </div>
        ))}
      </AnimatePresence>
      <AnimatePresence>
        {floats.map((f) => (
          <motion.div key={f.id} initial={{ opacity: 0, y: 0 }} animate={{ opacity: 1, y: -40 }} exit={{ opacity: 0 }} transition={{ duration: 1.1 }}
            className="absolute pointer-events-none font-display font-bold text-[20px]" style={{ left: pct(f.c, COLS), top: pct(f.r, ROWS), transform: 'translateX(-50%)', color: f.col, textShadow: `0 0 10px ${f.col}` }}>{f.txt}</motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
});
