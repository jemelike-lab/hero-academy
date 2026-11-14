// Word Tower (reading: consonant digraphs). Layout from 21st take 1
// (project 87d613c4…, take 1), rebuilt with the app's tokens. Logic in useWordTower.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';
import { useWordTower, type CardState, type WTState } from './useWordTower';
import { firstTryCount, type Result } from './engine';
import { onSpeaking } from '@/lib/tts';
import HumphreyPortrait, { useHumphrey } from '@/components/HumphreyPortrait';
import RalphiePortrait, { type RalphieState } from '@/components/RalphiePortrait';
import { KID_NAME } from '@/lib/child';

export default function WordTowerPage() {
  const { state: s, tap, hearAgain, endEarly, restart } = useWordTower();
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => onSpeaking(setSpeaking), []);
  const w = s.queue[s.index];

  const humphrey = useHumphrey(s.phase === 'done' ? 'cheering' : s.mood === 'delighted' ? 'delighted' : s.mood === 'encouraging' ? 'encouraging' : null);
  const ralphie: RalphieState = s.phase === 'done' ? 'trophy'
    : s.status.kind === 'pass' ? 'cheer' : s.status.kind === 'hint' ? 'thinking' : 'reading';

  return (
    <div className="h-full flex flex-col gap-4 px-6 py-5 max-w-[1320px] mx-auto w-full select-none">
      <Header s={s} />

      <main className="flex-1 min-h-0 grid grid-cols-12 gap-5">
        {/* Left: Ms. Humphrey, the tower, Hear it again */}
        <section className="col-span-4 min-h-0 flex flex-col gap-4 bg-card/70 rounded-xl3 border-2 border-line/70 p-5 shadow-card">
          <div className="flex items-start gap-3">
            <div className="relative shrink-0">
              <HumphreyPortrait state={humphrey} className="w-[120px] h-[120px] rounded-xl2 ring-4 ring-tutor/20" />
              <span className={clsx('absolute -bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border-2 border-white px-3 py-0.5 text-[11px] font-extrabold text-white shadow-tile',
                speaking ? 'bg-tutor' : 'bg-teal')}>{speaking ? 'Speaking…' : 'Listening'}</span>
            </div>
            <div className="relative flex-1 mt-1 min-h-[104px] rounded-xl2 border-2 border-tutor/25 bg-tutor/5 px-4 py-3" aria-live="polite">
              <span className="absolute -left-[9px] top-7 h-4 w-4 rotate-45 border-b-2 border-l-2 border-tutor/25 bg-[rgb(253,243,246)]" />
              <span className="block text-[11px] font-extrabold uppercase tracking-wider text-tutor">Ms. Humphrey</span>
              <AnimatePresence mode="wait">
                <motion.p key={s.bubble} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="mt-0.5 text-[16px] font-bold leading-snug">{s.phase === 'done' ? `Beautiful reading, ${KID_NAME}!` : s.bubble}</motion.p>
              </AnimatePresence>
            </div>
          </div>

          <Tower results={s.results} index={s.index} total={s.queue.length} playing={s.phase === 'play'} ralphie={ralphie} />

          <button onClick={hearAgain} disabled={s.phase !== 'play'}
            className="tap h-[68px] w-full shrink-0 rounded-xl3 bg-sun font-display text-[22px] font-semibold text-ink shadow-tile flex items-center justify-center gap-3 active:translate-y-[2px] active:shadow-none disabled:opacity-50">
            <motion.span animate={speaking ? { scale: [1, 1.15, 1] } : { scale: 1 }} transition={{ repeat: speaking ? Infinity : 0, duration: 1.4 }}
              className="grid h-10 w-10 place-items-center rounded-full bg-white/50 text-[22px]">🔊</motion.span>
            Hear it again
          </button>
        </section>

        {/* Right: prompt, the four words, feedback */}
        <section className="col-span-8 min-h-0 flex flex-col gap-4">
          <div className="flex items-center gap-4 rounded-xl3 border-2 border-line bg-card p-5 shadow-card">
            <button onClick={hearAgain} aria-label="Hear the word again" disabled={s.phase !== 'play'}
              className="grid h-16 w-16 shrink-0 place-items-center rounded-xl2 border-2 border-teal/30 bg-teal/10 text-[28px] active:scale-95 disabled:opacity-50">🔊</button>
            <div>
              <span className="block text-[12px] font-extrabold uppercase tracking-wider text-muted">Tap the matching card</span>
              <h2 className="font-display text-[32px] font-semibold leading-tight">Which word is this?</h2>
            </div>
          </div>

          <div className="flex-1 min-h-0 grid grid-cols-2 grid-rows-2 gap-5">
            {s.options.map((opt, i) => (
              <WordCard key={`${s.index}-${opt}`} i={i} word={opt} state={s.cards[opt] || 'idle'}
                dim={s.locked && !s.cards[opt]} disabled={s.locked || s.cards[opt] === 'wrong'} onTap={() => tap(opt)} />
            ))}
          </div>

          <div className="flex items-center gap-4">
            <Feedback kind={s.status.kind} text={s.status.text} />
            <button onClick={endEarly} disabled={s.phase !== 'play'}
              className="tap h-16 shrink-0 rounded-xl2 border-2 border-line bg-paper px-6 font-display text-[17px] font-medium text-muted flex items-center gap-2 active:translate-y-[1px]">
              🚪 End session
            </button>
          </div>
        </section>
      </main>

      <AnimatePresence>{s.phase === 'done' && <EndCard results={s.results} onAgain={restart} />}</AnimatePresence>
      {w && <span className="sr-only">Word {s.index + 1}</span>}
    </div>
  );
}

function Header({ s }: { s: WTState }) {
  const w = s.queue[s.index];
  const n = s.queue.length || 8;
  const current = Math.min(s.index + 1, n);
  return (
    <header className="flex items-center justify-between gap-4 shrink-0">
      <Link to="/" className="tap h-16 min-w-[132px] rounded-xl2 border-2 border-line bg-card px-4 shadow-tile flex items-center gap-3 active:translate-y-[2px] active:shadow-none">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-paper text-[20px] font-extrabold">←</span>
        <span className="font-display text-[18px] font-semibold">Home</span>
      </Link>

      <div className="h-16 rounded-xl2 border-2 border-line/80 bg-card/80 px-6 flex items-center gap-4 shadow-tile">
        <div className="leading-tight">
          <h1 className="font-display text-[24px] font-semibold">Word Tower</h1>
          <span className="text-[12px] font-bold text-muted">{s.level.name}</span>
        </div>
        <span className="h-8 w-[2px] bg-line/70" />
        <div className="flex items-center gap-2 rounded-xl border border-line bg-paper px-3 py-1.5">
          <span className="text-[12px] font-bold text-muted">Target:</span>
          <AnimatePresence mode="wait">
            <motion.span key={w?.pattern} initial={{ y: -8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 8, opacity: 0 }}
              className="font-display text-[20px] font-semibold tracking-wide text-teal">{w?.pattern || '—'}</motion.span>
          </AnimatePresence>
        </div>
      </div>

      <div className="h-16 rounded-xl2 border-2 border-line bg-card px-5 flex items-center gap-4 shadow-tile">
        <div className="text-right leading-tight">
          <span className="block text-[11px] font-extrabold uppercase tracking-wider text-muted">Progress</span>
          <span className="font-display text-[18px] font-semibold">Word <span className="text-teal">{current}</span> of {n}</span>
        </div>
        <div className="flex h-9 items-end gap-1 rounded-xl border border-line bg-paper p-1.5" aria-hidden>
          {Array.from({ length: n }).map((_, i) => {
            const r = s.results[i];
            return <motion.span key={i} layout className={clsx('w-3 rounded-sm',
              r ? (r.revealed ? 'bg-amber h-full' : r.passed ? 'bg-grass h-full' : 'bg-teal h-full')
                : i === s.index && s.phase === 'play' ? 'bg-sun h-full animate-pulse' : 'bg-line/60 h-1/2')} />;
          })}
        </div>
      </div>
    </header>
  );
}

function Tower({ results, index, total, playing, ralphie }: { results: Result[]; index: number; total: number; playing: boolean; ralphie: RalphieState }) {
  // Newest floor on top; the panel fits all 8 floors of a set.
  const shown = results.map((r, k) => ({ r, n: k + 1 }));
  return (
    <div className="flex-1 min-h-0 flex flex-col rounded-xl3 border-2 border-line/80 bg-paper p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <span className="block text-[12px] font-extrabold uppercase tracking-wider text-muted">🏰 {KID_NAME}’s tower</span>
          <span className="mt-1 inline-block rounded-md bg-teal/10 px-2 py-0.5 font-display text-[13px] font-semibold text-teal">Floor {Math.min(results.length + (playing ? 1 : 0), total)} / {total}</span>
        </div>
        <RalphiePortrait state={ralphie} className="h-[76px] w-[76px] rounded-2xl ring-2 ring-teal/15" />
      </div>
      <div className="mt-3 flex-1 min-h-0 flex flex-col-reverse justify-start gap-1.5 overflow-hidden font-display">
        <AnimatePresence initial={false}>
          {shown.map(({ r, n }) => (
            <motion.div key={r.word + n} layout initial={{ y: -24, opacity: 0, scale: 0.9 }} animate={{ y: 0, opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 420, damping: 22 }}
              className={clsx('h-10 shrink-0 rounded-xl border-2 px-3 flex items-center justify-between text-[16px] font-semibold',
                r.revealed ? 'border-amber/50 bg-amber/15 text-[rgb(180,105,6)]' : r.passed ? 'border-grass/40 bg-grass/15 text-[rgb(30,140,80)]' : 'border-teal/30 bg-teal/10 text-teal')}>
              <span><span className="mr-2 opacity-70">{n}.</span>{r.word}</span>
              <span className="text-[13px]">{r.revealed ? '⭐' : '✓'}</span>
            </motion.div>
          ))}
          {playing && index < total && (
            <motion.div key={`building-${index}`} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="h-11 shrink-0 rounded-xl border-2 border-[rgb(229,175,47)] bg-sun px-3 flex items-center justify-between text-[16px] font-semibold shadow-tile">
              <span><span className="mr-2 opacity-70">{results.length + 1}.</span>building…</span>
              <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 3, ease: 'linear' }}>⭐</motion.span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function WordCard({ i, word, state, dim, disabled, onTap }: { i: number; word: string; state: CardState; dim: boolean; disabled: boolean; onTap: () => void }) {
  return (
    <motion.button type="button" onClick={onTap} disabled={disabled} data-state={state}
      initial={{ opacity: 0, y: 14, scale: 0.97 }}
      animate={state === 'wrong' ? { opacity: 1, y: 0, scale: 1, x: [0, -10, 10, -6, 6, 0] } : state === 'correct' ? { opacity: 1, y: 0, scale: [1, 1.06, 1] } : { opacity: dim ? 0.45 : 1, y: 0, scale: 1 }}
      transition={{ delay: state === 'idle' ? i * 0.06 : 0, duration: state === 'wrong' ? 0.4 : 0.3 }}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      className={clsx('relative min-h-[120px] rounded-[28px] border-4 px-4 flex items-center justify-center font-display text-[52px] font-semibold tracking-wide transition-colors',
        state === 'idle' && 'border-line bg-card text-ink shadow-[0_6px_0_0_rgb(var(--c-line))]',
        state === 'wrong' && 'border-amber bg-amber/10 text-[rgb(180,105,6)]/70 line-through',
        state === 'correct' && 'border-[rgb(37,153,94)] bg-grass text-white shadow-[0_6px_0_0_rgb(30,130,76)]',
        state === 'reveal' && 'border-amber bg-amber/20 text-ink shadow-[0_0_24px_rgba(245,158,11,0.5)]')}>
      {word}
      {state === 'correct' && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute right-4 top-3 grid h-9 w-9 place-items-center rounded-full bg-white text-[20px] font-black text-grass shadow-tile">✓</motion.span>}
      {state === 'wrong' && <span className="absolute right-3 top-3 rounded-full border border-amber/40 bg-amber/20 px-2.5 py-1 font-body text-[12px] font-bold no-underline text-[rgb(180,105,6)]">Not quite</span>}
      {state === 'reveal' && <motion.span className="absolute inset-0 rounded-[24px] ring-4 ring-amber/40" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.4 }} />}
    </motion.button>
  );
}

function Feedback({ kind, text }: { kind: WTState['status']['kind']; text: string }) {
  const tone = kind === 'pass' ? 'border-grass/40 bg-grass/15' : kind === 'hint' ? 'border-amber/40 bg-amber/10' : kind === 'reveal' ? 'border-amber bg-amber/10' : 'border-line bg-card';
  const icon = kind === 'pass' ? '🎉' : kind === 'reveal' ? '⭐' : '💡';
  return (
    <div className={clsx('flex-1 min-h-16 rounded-xl2 border-2 px-5 flex items-center gap-3 transition-colors', tone)} aria-live="polite">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line bg-paper text-[20px]">{icon}</span>
      <AnimatePresence mode="wait">
        <motion.p key={text} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
          className={clsx('text-[16px] font-bold leading-snug', kind === 'pass' ? 'font-display text-[20px] text-[rgb(30,130,76)]' : kind === 'idle' ? 'text-muted' : 'text-[rgb(150,88,5)]')}>
          {kind === 'hint' ? text.replace(/^💡\s*/, '') : text}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}

function EndCard({ results, onAgain }: { results: Result[]; onAgain: () => void }) {
  const first = firstTryCount(results);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 grid place-items-center bg-ink/35 p-8 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="wt-end-title">
      <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 22 }}
        className="w-full max-w-[620px] rounded-[32px] border-4 border-white bg-paper p-8 text-center shadow-2xl flex flex-col items-center gap-5">
        <RalphiePortrait state="trophy" className="h-28 w-28 rounded-3xl ring-4 ring-sun/40" />
        <div>
          <h2 id="wt-end-title" className="font-display text-[38px] font-semibold">🎉 Beautiful reading!</h2>
          <p className="mt-1 text-[18px] font-bold">You got <span className="font-display text-[24px] text-teal">{first} of {results.length}</span> on the first try.</p>
        </div>
        <div className="w-full rounded-xl3 border-2 border-line bg-card p-4 flex items-center justify-around">
          <div className="flex flex-col items-center"><span className="text-[12px] font-extrabold uppercase tracking-wider text-muted">First try</span><span className="font-display text-[30px] font-semibold text-teal">{first} of {results.length}</span></div>
          <span className="h-10 w-[2px] bg-line" />
          <div className="flex flex-col items-center"><span className="text-[12px] font-extrabold uppercase tracking-wider text-muted">Tower built</span><span className="font-display text-[30px] font-semibold text-tutor">{results.length} {results.length === 1 ? 'floor' : 'floors'}</span></div>
        </div>
        <p className="text-[15px] font-semibold text-muted">Want to try another set?</p>
        <div className="flex w-full gap-4">
          <button onClick={onAgain} className="tap h-[68px] flex-1 rounded-xl3 bg-sun font-display text-[22px] font-semibold shadow-tile active:translate-y-[2px] active:shadow-none">Another set →</button>
          <Link to="/" className="tap h-[68px] flex-1 rounded-xl3 border-2 border-line bg-card font-display text-[22px] font-medium shadow-tile grid place-items-center">Back home</Link>
        </div>
      </motion.div>
    </motion.div>
  );
}
