// Tens rods and ones cubes for two-digit addition. In "show" mode the ones
// pile up and, when they reach ten, bundle into a new rod (the regroup).
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import clsx from 'clsx';

function Rod({ color, compact }: { color: string; compact?: boolean }) {
  return <div className={clsx('rounded-sm', color, compact ? 'w-3 h-16' : 'w-4 h-24')} style={{ backgroundImage: 'repeating-linear-gradient(to bottom, transparent 0 9%, rgba(255,255,255,.55) 9% 10%)' }} />;
}

export default function BaseTenBlocks({ a, b, show, compact }: { a: number; b: number; show: boolean; compact?: boolean }) {
  const [stage, setStage] = useState<0 | 1 | 2 | 3>(show ? 0 : 0);
  useEffect(() => {
    setStage(0);
    if (!show) return;
    const t1 = setTimeout(() => setStage(1), 500);
    const t2 = setTimeout(() => setStage(2), 1600);
    const t3 = setTimeout(() => setStage(3), 2800);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [a, b, show]);

  const tensA = Math.floor(a / 10), onesA = a % 10, tensB = Math.floor(b / 10), onesB = b % 10;
  const onesSum = onesA + onesB; const carry = onesSum >= 10 ? 1 : 0;
  const bundled = stage >= 3 && carry === 1;
  const onesShown = stage >= 2 ? (bundled ? onesSum - 10 : onesSum) : onesA;
  const tensShown = (stage >= 2 ? tensA + tensB : tensA) + (bundled ? 1 : 0);
  const cube = compact ? 'w-3 h-3' : 'w-4 h-4';

  return (
    <div className="select-none">
      <div className="flex items-end gap-6 min-h-[110px]">
        <div className="flex items-end gap-1">
          <AnimatePresence>
            {Array.from({ length: tensShown }).map((_, i) => (
              <motion.div key={`t${i}`} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 22 }}>
                <Rod color={i < tensA ? 'bg-teal' : bundled && i === tensShown - 1 ? 'bg-grass' : 'bg-sun'} compact={compact} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        <div className={clsx('grid gap-1', compact ? 'grid-cols-5' : 'grid-cols-5')}>
          <AnimatePresence>
            {Array.from({ length: onesShown }).map((_, i) => (
              <motion.div key={`o${i}`} layout initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 24, delay: show && stage === 2 && i >= onesA ? (i - onesA) * 0.08 : 0 }}
                className={clsx(cube, 'rounded-sm', i < onesA ? 'bg-teal' : 'bg-sun')} />
            ))}
          </AnimatePresence>
        </div>
      </div>
      <div className="text-[13px] font-bold text-muted mt-2">
        <span className="text-teal">{tensShown} tens</span> and <span className="text-amber">{onesShown} ones</span>
        {stage >= 2 && <span> = <span className="text-ink font-display text-[16px]">{tensShown * 10 + onesShown}</span></span>}
        {bundled && <span className="text-grass"> · ten ones became one rod</span>}
      </div>
    </div>
  );
}
