// Letter Lab (writing letters and numbers). Layout from 21st take
// (project 40d3d911…, take 1): Ms. Humphrey in a strip across the top, the
// board as large as possible with a tall action column, and the compare step
// sliding up over the board. Logic in useLetterLab.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';
import LetterBoard, { type LetterBoardHandle } from './LetterBoard';
import { useLetterLab } from './useLetterLab';
import { onSpeaking } from '@/lib/tts';
import HumphreyPortrait, { useHumphrey } from '@/components/HumphreyPortrait';
import { KID_NAME } from '@/lib/child';

export default function LetterLabPage() {
  const board = useRef<LetterBoardHandle>(null);
  const L = useLetterLab(board);
  const s = L.state;
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => onSpeaking(setSpeaking), []);

  const humphrey = useHumphrey(
    s.phase === 'done' ? 'cheering'
    : s.phase === 'demo' ? 'board'
    : s.phase === 'compare' ? 'delighted'
    : s.mood === 'encouraging' ? 'encouraging'
    : null,
  );
  const writing = s.phase === 'writing';

  return (
    <div className="h-full flex flex-col gap-3 px-6 pt-4 pb-5 max-w-[1240px] mx-auto w-full select-none">
      <Header index={s.index} total={s.targets.length} done={s.phase === 'done'} />

      {/* Ms. Humphrey strip: same place in every state */}
      <section className="shrink-0 h-[104px] flex items-center gap-4">
        <div className="shrink-0 flex flex-col items-center">
          <HumphreyPortrait state={humphrey} className="w-[84px] h-[84px] rounded-2xl ring-4 ring-tutor/20 shadow-card" />
          <span className={clsx('relative z-10 -mt-2.5 rounded-full border-2 border-white px-2.5 py-0.5 text-[11px] font-extrabold text-white shadow-tile', speaking ? 'bg-tutor' : 'bg-teal')}>
            {speaking ? 'speaking' : 'listening'}
          </span>
        </div>
        <div className="relative flex-1 h-[80px] rounded-[22px] border-2 border-tutor/20 bg-card shadow-card flex items-center px-7" aria-live="polite">
          <span className="absolute -left-[9px] top-1/2 -translate-y-1/2 h-4 w-4 rotate-45 border-b-2 border-l-2 border-tutor/20 bg-card" />
          <AnimatePresence mode="wait">
            <motion.p key={s.bubble} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className={clsx('font-display text-[20px] font-medium leading-snug', s.nudge && 'text-[rgb(170,95,5)]')}>
              {s.bubble}
            </motion.p>
          </AnimatePresence>
        </div>
        <button onClick={L.sayAgain} disabled={!writing}
          className="tap shrink-0 h-16 rounded-[22px] border-2 border-tutor/30 bg-tutor/10 px-5 font-display text-[17px] font-semibold text-tutor shadow-tile flex items-center gap-2 active:translate-y-[2px] active:shadow-none disabled:opacity-40">
          <span className="text-[24px] leading-none">🔊</span> Say it again
        </button>
      </section>

      <AnimatePresence mode="wait">
        {s.phase !== 'done' ? (
          <motion.main key="practice" exit={{ opacity: 0 }} className="flex-1 min-h-0 flex gap-5">
            {/* Board, with the compare sheet sliding over it */}
            <div className="relative flex-1 min-h-0">
              <LetterBoard ref={board} disabled={!writing} onInk={L.onInk} label="Your drawing board">
                {writing && s.nudge && !s.hasInk && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pointer-events-none absolute inset-0 grid place-items-center">
                    <div className="text-center">
                      <motion.div animate={{ x: [0, 18, 0] }} transition={{ repeat: Infinity, duration: 1.6 }} className="text-[64px] opacity-40">✋</motion.div>
                      <p className="font-display text-[20px] font-medium text-muted">Tap and drag to write</p>
                    </div>
                  </motion.div>
                )}
                {s.phase === 'demo' && (
                  <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-tutor/10 px-4 py-1.5 font-display text-[14px] font-semibold text-tutor flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-tutor animate-pulse" /> Ms. Humphrey is writing…
                  </div>
                )}
                <AnimatePresence>
                  {s.phase === 'compare' && (
                    <motion.section key={`compare-${s.index}-${s.attempts}`} initial={{ y: '100%' }} animate={{ y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } }} exit={{ y: '100%', transition: { duration: 0.22, ease: 'easeIn' } }}
                      className="absolute inset-0 bg-paper/95 backdrop-blur-sm flex flex-col" role="dialog" aria-labelledby="ll-compare-title">
                      <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-line" />
                      <h2 id="ll-compare-title" className="mt-2 text-center font-display text-[26px] font-semibold">{L.compareTitle}</h2>
                      <div className="flex-1 min-h-0 flex items-center justify-center gap-5 px-6 py-3">
                        <Card label="Yours ✏️" img={s.mine} tone="ink" />
                        <Card label="Ms. Humphrey’s 🌸" img={s.hers} tone="tutor" />
                      </div>
                      <div className="flex items-center justify-center gap-4 pb-5">
                        {L.canRetry && (
                          <button onClick={L.tryAgain} className="tap h-16 rounded-[22px] border-[3px] border-amber bg-card px-6 font-display text-[19px] font-semibold text-[rgb(190,110,5)] shadow-tile flex items-center gap-2 active:translate-y-[2px] active:shadow-none">
                            <span className="text-[22px]">🔁</span> Try one more time
                          </button>
                        )}
                        <motion.button onClick={L.looksGreat} whileTap={{ scale: 0.97 }}
                          className="tap h-16 rounded-[22px] bg-grass px-7 font-display text-[19px] font-semibold text-white shadow-[0_4px_0_0_rgb(30,130,76)] active:translate-y-[2px] active:shadow-none">
                          {L.goodLabel}
                        </motion.button>
                      </div>
                    </motion.section>
                  )}
                </AnimatePresence>
              </LetterBoard>
            </div>

            {/* Tall action column */}
            <div className="w-[132px] shrink-0 flex flex-col gap-4">
              <ColButton onClick={L.undo} disabled={!writing || !s.hasInk} icon="↶" label="Undo" />
              <ColButton onClick={L.clear} disabled={!writing || !s.hasInk} icon="🗑️" label="Clear" />
              <motion.button onClick={L.showMeYours} disabled={!writing} whileTap={writing ? { scale: 0.97 } : undefined}
                className="flex-1 min-h-[128px] rounded-[22px] border-2 border-[rgb(232,172,31)] bg-sun font-display text-[18px] font-semibold text-ink shadow-tile flex flex-col items-center justify-center gap-1 active:translate-y-[2px] active:shadow-none disabled:opacity-45">
                <motion.span animate={writing && s.hasInk ? { rotate: [0, 12, -8, 0], scale: [1, 1.15, 1] } : {}} transition={{ repeat: writing && s.hasInk ? Infinity : 0, repeatDelay: 1.6, duration: 0.6 }} className="text-[34px] leading-none">✨</motion.span>
                <span className="leading-tight text-center">Show me<br />yours</span>
              </motion.button>
            </div>
          </motion.main>
        ) : (
          <Finish key="finish" kept={s.kept} labels={s.targets.map((t) => t.label)} onAgain={L.restart} />
        )}
      </AnimatePresence>
    </div>
  );
}

function Header({ index, total, done }: { index: number; total: number; done: boolean }) {
  const n = total || 3; const current = done ? n : Math.min(index + 1, n);
  return (
    <header className="shrink-0 flex items-center justify-between">
      <Link to="/" className="tap h-16 min-w-[132px] rounded-2xl border-2 border-line bg-card px-5 shadow-tile flex items-center justify-center gap-2 font-display text-[18px] font-semibold active:translate-y-[2px] active:shadow-none">
        <span className="text-[22px] leading-none">←</span> Home
      </Link>
      <h1 className="font-display text-[28px] font-semibold flex items-center gap-2"><span>✍️</span> Letter Lab</h1>
      <div className="h-16 rounded-2xl border-2 border-line bg-card px-5 flex items-center gap-4" aria-label={`Letter ${current} of ${n}`}>
        <span className="font-display text-[22px] font-semibold"><span className="text-teal">{current}</span> <span className="text-muted">/ {n}</span></span>
        <span className="flex items-center gap-2 border-l-2 border-line pl-3">
          {Array.from({ length: n }).map((_, i) => (
            <motion.span key={i} animate={{ scale: i === index && !done ? [1, 1.25, 1] : 1 }} transition={{ repeat: i === index && !done ? Infinity : 0, duration: 1.6 }}
              className={clsx('h-3 w-3 rounded-full', done || i < index ? 'bg-grass' : i === index ? 'bg-teal' : 'bg-line')} />
          ))}
        </span>
      </div>
    </header>
  );
}

function ColButton({ onClick, disabled, icon, label }: { onClick: () => void; disabled: boolean; icon: string; label: string }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="h-24 rounded-[22px] border-2 border-line bg-card font-display text-[16px] font-semibold shadow-tile flex flex-col items-center justify-center gap-1 active:translate-y-[2px] active:shadow-none disabled:opacity-40">
      <span className="text-[30px] leading-none">{icon}</span>{label}
    </button>
  );
}

function Card({ label, img, tone }: { label: string; img: string | null; tone: 'ink' | 'tutor' }) {
  return (
    <motion.figure initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: tone === 'tutor' ? 0.12 : 0 }}
      className={clsx('h-full max-h-[320px] aspect-[4/3.5] rounded-[24px] border-2 bg-card shadow-card flex flex-col items-center px-3 pb-3', tone === 'tutor' ? 'border-tutor/30' : 'border-line')}>
      <figcaption className={clsx('mt-3 font-display text-[18px] font-semibold', tone === 'tutor' && 'text-tutor')}>{label}</figcaption>
      <div className="mt-2 flex-1 min-h-0 w-full grid place-items-center">
        {img ? <img src={img} alt={label} className="max-h-full max-w-full rounded-xl border border-line" /> : <span className="text-muted">…</span>}
      </div>
    </motion.figure>
  );
}

function Finish({ kept, labels, onAgain }: { kept: string[]; labels: string[]; onAgain: () => void }) {
  const confetti = useRef(Array.from({ length: 26 }, (_, i) => ({ left: Math.random() * 100, delay: Math.random() * 1.2, dur: 1.8 + Math.random() * 1.4, color: ['#FFC53D', '#D6336C', '#2EB872', '#0E8C8C', '#F59E0B'][i % 5], rot: Math.random() * 360 }))).current;
  return (
    <motion.main initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="relative flex-1 min-h-0 grid place-items-center overflow-hidden">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        {confetti.map((c, i) => (
          <motion.span key={i} className="absolute top-0 h-3.5 w-2.5 rounded-sm" style={{ left: `${c.left}%`, background: c.color }}
            initial={{ y: -20, rotate: c.rot, opacity: 1 }} animate={{ y: 520, rotate: c.rot + 540, opacity: 0 }} transition={{ delay: c.delay, duration: c.dur, ease: 'easeIn' }} />
        ))}
      </div>
      <div className="w-full max-w-[980px] rounded-[28px] border-2 border-line bg-card px-10 py-7 shadow-card flex flex-col items-center">
        <h2 className="font-display text-[36px] font-semibold">🎉 Beautiful work, {KID_NAME}!</h2>
        <p className="mt-1 max-w-[560px] text-center font-display text-[18px] font-medium text-muted">You practiced {labels.length} things with me today, {KID_NAME}. Beautiful work!</p>
        <div className="mt-6 flex items-center justify-center gap-6">
          {kept.map((src, i) => (
            <motion.figure key={i} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.2 + i * 0.12, type: 'spring', stiffness: 300, damping: 20 }}
              className="h-[200px] w-[220px] rounded-[22px] border-2 border-line bg-paper flex flex-col items-center p-2">
              <figcaption className="mt-1 font-display text-[14px] font-semibold text-muted capitalize">{labels[i]?.replace(/^the /, '')}</figcaption>
              <img src={src} alt={`Your ${labels[i]}`} className="mt-1 flex-1 min-h-0 object-contain rounded-lg" />
            </motion.figure>
          ))}
        </div>
        <div className="mt-7 flex gap-4">
          <button onClick={onAgain} className="tap h-16 rounded-[22px] border-2 border-line bg-card px-7 font-display text-[19px] font-medium shadow-tile active:translate-y-[2px] active:shadow-none">Practice more</button>
          <Link to="/" className="tap h-16 rounded-[22px] bg-teal px-8 font-display text-[19px] font-semibold text-white shadow-tile flex items-center gap-2 active:translate-y-[2px] active:shadow-none"><span className="text-[22px]">🏠</span> Back home</Link>
        </div>
      </div>
    </motion.main>
  );
}
