// Two ten-frames. Tap to add or take away counters; "show" mode fills them
// for the kid, a counters in teal then b in gold.
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import clsx from 'clsx';

export default function TenFrame({ a, b, show, compact }: { a: number; b: number; show: boolean; compact?: boolean }) {
  const [filled, setFilled] = useState<number>(show ? a + b : 0);
  useEffect(() => { setFilled(show ? a + b : 0); }, [a, b, show]);
  const cells = Array.from({ length: 20 });
  const size = compact ? 'w-7 h-7' : 'w-10 h-10';
  return (
    <div className="flex flex-col gap-2 select-none">
      <div className="flex flex-wrap gap-3">
        {[0, 1].map((frame) => (
          <div key={frame} className="grid grid-cols-5 gap-1 p-1.5 rounded-xl border-2 border-line bg-card">
            {cells.slice(frame * 10, frame * 10 + 10).map((_, i) => {
              const idx = frame * 10 + i;
              const on = idx < filled;
              const fromA = idx < a;
              return (
                <button key={idx} aria-label={on ? 'counter' : 'empty cell'} onClick={() => setFilled(on ? idx : idx + 1)}
                  className={clsx(size, 'rounded-md border border-line/70 bg-paper flex items-center justify-center')}>
                  {on && (
                    <motion.span layout initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 24, delay: show ? idx * 0.06 : 0 }}
                      className={clsx('block rounded-full', compact ? 'w-5 h-5' : 'w-7 h-7', fromA ? 'bg-teal' : 'bg-sun')} />
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div className="text-[13px] font-bold text-muted">
        <span className="text-teal">{Math.min(filled, a)}</span> + <span className="text-amber">{Math.max(0, filled - a)}</span> = <span className="text-ink font-display text-[16px]">{filled}</span>
        {!show && <span className="ml-2">Tap the boxes.</span>}
      </div>
    </div>
  );
}
