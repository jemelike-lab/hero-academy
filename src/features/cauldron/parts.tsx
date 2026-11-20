// Shared Cauldron Café pieces: vegetable icons (from the legacy <symbol>s),
// ten-frames that fill cell by cell, and the on-screen number pad.
import { motion } from 'framer-motion';
import clsx from 'clsx';
import type { VeggieId } from './engine';

export function Veg({ id, size = 36 }: { id: VeggieId; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 60 60" aria-hidden>
      {id === 'carrot' && (<>
        <path d="M30 54 L18 20 Q30 12 42 20 Z" fill="#f08a2a" />
        <path d="M24 26 L36 26 M22 34 L33 34 M26 42 L32 42" stroke="#c96a14" strokeWidth="2" strokeLinecap="round" />
        <path d="M30 18 L24 4 M30 18 L30 2 M30 18 L36 4" stroke="#3d8a3d" strokeWidth="4" strokeLinecap="round" />
      </>)}
      {id === 'tomato' && (<>
        <circle cx="30" cy="34" r="20" fill="#d83030" />
        <circle cx="24" cy="28" r="6" fill="#ff5555" opacity="0.55" />
        <path d="M22 14 L30 8 L38 14 L35 18 L30 14 L25 18 Z" fill="#3d8a3d" />
      </>)}
      {id === 'potato' && (<>
        <ellipse cx="30" cy="32" rx="22" ry="18" fill="#c89968" />
        <ellipse cx="24" cy="26" rx="6" ry="4" fill="#e0b78c" opacity="0.6" />
        <circle cx="36" cy="34" r="1.5" fill="#6b4423" /><circle cx="28" cy="38" r="1.5" fill="#6b4423" /><circle cx="22" cy="32" r="1" fill="#6b4423" />
      </>)}
    </svg>
  );
}

// One row per ingredient: label "Carrots 5 / 9", then as many ten-frames as the count needs.
export function TenFrames({ id, label, need, filled, active, cell = 26 }: { id: VeggieId; label: string; need: number; filled: number; active?: boolean; cell?: number }) {
  const frames = Math.ceil(need / 10);
  return (
    <div className={clsx('rounded-2xl px-2.5 py-2 transition-colors', active ? 'bg-sun/20 ring-2 ring-sun/60' : 'bg-white/60')}>
      <div className="mb-1 flex items-center justify-between gap-2 font-display text-[14px] font-semibold text-ink">
        <span className="flex items-center gap-1"><Veg id={id} size={18} />{label}</span>
        <span className={clsx('tabular-nums', filled >= need ? 'text-grass' : 'text-muted')}>{filled} / {need}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: frames }).map((_, f) => (
          <div key={f} className="grid grid-cols-5 gap-[3px] rounded-lg border-2 border-[rgb(200,115,58)]/50 bg-white p-[3px]">
            {Array.from({ length: 10 }).map((_, c) => {
              const i = f * 10 + c; const live = i < need; const on = i < filled;
              return (
                <div key={c} className={clsx('grid place-items-center rounded-[5px] border', live ? 'border-line bg-paper' : 'invisible border-transparent')} style={{ width: cell, height: cell }}>
                  {on && (
                    <motion.span initial={{ scale: 0, y: -18, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} transition={{ delay: Math.max(0, (i - (filled - 5))) * 0.1, type: 'spring', stiffness: 500, damping: 22 }}>
                      <Veg id={id} size={cell - 6} />
                    </motion.span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export function NumberPad({ onKey, disabled, className }: { onKey: (k: string) => void; disabled?: boolean; className?: string }) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0'];
  return (
    <div className={clsx('grid grid-cols-3 gap-2', className)}>
      {keys.map((k) => (
        <motion.button key={k} type="button" onClick={() => onKey(k)} disabled={disabled} whileTap={{ scale: 0.94 }} aria-label={k === 'del' ? 'Delete' : k}
          className={clsx('h-16 min-w-16 rounded-2xl border-2 border-line bg-card font-display text-[26px] font-semibold shadow-tile active:translate-y-[2px] active:shadow-none disabled:opacity-40', k === 'del' && 'text-amber', k === '0' && 'col-span-2')}>
          {k === 'del' ? '⌫' : k}
        </motion.button>
      ))}
    </div>
  );
}
