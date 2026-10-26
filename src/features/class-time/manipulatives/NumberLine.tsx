// A number line with a frog. Drag the frog or tap a number; "show" mode hops
// it from a by b, one hop per beat, forward for + and back for −.
import { motion, useAnimationControls } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';

export default function NumberLine({ a, b, op, show, compact }: { a: number; b: number; op: '+' | '-'; show: boolean; compact?: boolean }) {
  const target = op === '+' ? a + b : a - b;
  const max = Math.max(10, Math.ceil(Math.max(a, target) / 5) * 5 + (op === '+' ? 0 : 0));
  const [pos, setPos] = useState(a);
  const controls = useAnimationControls();
  const hops = useRef(0);

  useEffect(() => {
    setPos(a); hops.current = 0;
    if (!show) return;
    let cancelled = false;
    (async () => {
      for (let i = 1; i <= b; i++) {
        if (cancelled) return;
        const next = op === '+' ? a + i : a - i;
        await controls.start({ y: [0, -(compact ? 18 : 28), 0], transition: { duration: 0.38 } });
        setPos(next); hops.current = i;
      }
    })();
    return () => { cancelled = true; };
  }, [a, b, op, show, controls, compact]);

  const ticks = Array.from({ length: max + 1 });
  const pct = (n: number) => `${(n / max) * 100}%`;
  return (
    <div className="select-none">
      <div className={clsx('relative mx-3', compact ? 'h-20' : 'h-24')}>
        <div className="absolute left-0 right-0 top-12 h-[3px] bg-line rounded-full" />
        {ticks.map((_, n) => (
          <button key={n} onClick={() => !show && setPos(n)} aria-label={`${n}`}
            className="absolute top-10 -translate-x-1/2 flex flex-col items-center" style={{ left: pct(n) }}>
            <span className={clsx('w-[2px] bg-muted/60', n % 5 === 0 ? 'h-4' : 'h-2')} />
            {(n % 5 === 0 || n === a || n === target || max <= 20) && (
              <span className={clsx('text-[11px] font-bold mt-1', n === target ? 'text-grass' : n === a ? 'text-amber' : 'text-muted')}>{n}</span>
            )}
          </button>
        ))}
        {/* hop arcs already taken */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none" viewBox="0 0 100 100">
          {Array.from({ length: Math.abs(pos - a) }).map((_, i) => {
            const from = op === '+' ? a + i : a - i; const to = op === '+' ? from + 1 : from - 1;
            const x1 = (from / max) * 100, x2 = (to / max) * 100;
            return <path key={i} d={`M ${x1} 50 Q ${(x1 + x2) / 2} 22 ${x2} 50`} stroke="rgb(var(--c-teal))" strokeWidth="1.2" fill="none" vectorEffect="non-scaling-stroke" />;
          })}
        </svg>
        <motion.div animate={controls} className="absolute top-3 -translate-x-1/2 text-[26px] leading-none" style={{ left: pct(pos) }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          layout>
          🐸
        </motion.div>
      </div>
      <div className="text-[13px] font-bold text-muted px-3">
        Start at <span className="text-amber">{a}</span>, {op === '+' ? 'hop forward' : 'hop back'} <span className="text-teal">{Math.abs(pos - a)}</span>
        {Math.abs(pos - a) === b && <span className="text-grass"> · landed on {pos}</span>}
        {!show && <span className="ml-2">Tap a number to move the frog.</span>}
      </div>
    </div>
  );
}
