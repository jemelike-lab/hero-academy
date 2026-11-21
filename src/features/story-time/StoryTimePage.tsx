// Story Time. Layout from 21st take "Wide page" (project 44f679ba…, take 1,
// option B): the story across the top with Ms. Humphrey beside it, and the
// question with three big answer tiles underneath. Fits 1194×834 (iPad) and
// 1280×712 (Galaxy Tab in Chrome) with no scrolling; the story text shrinks
// a step at a time only if a long passage would not fit.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';
import { useStoryTime, type Pick } from './useStoryTime';
import { LINES, type Word } from './engine';
import { onSpeaking } from '@/lib/tts';
import HumphreyPortrait, { useHumphrey } from '@/components/HumphreyPortrait';
import RalphiePortrait from '@/components/RalphiePortrait';
import { KID_NAME } from '@/lib/child';

const press = 'active:translate-y-[2px] active:shadow-none';
const FONT_STEPS = [46, 42, 38, 34, 30, 27];

export default function StoryTimePage() {
  const S = useStoryTime();
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => onSpeaking(setSpeaking), []);
  const humphrey = useHumphrey(S.mood);
  const q = S.passage?.questions[S.qIdx];
  const counter = S.phase === 'loading' ? 'Loading…' : S.phase === 'question' ? `Question ${S.qIdx + 1} of ${S.passage!.questions.length}` : S.phase === 'end' ? 'Complete' : 'Passage';

  return (
    <div className="h-full flex flex-col gap-3 px-5 pt-3 pb-4 max-w-[1280px] mx-auto w-full select-none">
      <header className="shrink-0 flex items-center gap-4">
        <Link to="/" className={clsx('tap h-16 min-w-[132px] rounded-2xl border-2 border-line bg-card px-5 shadow-tile flex items-center justify-center gap-2 font-display text-[18px] font-semibold', press)}>
          <span className="text-[22px] leading-none text-teal">←</span> Home
        </Link>
        <div className="leading-tight">
          <h1 className="font-display text-[28px] font-semibold">Story Time</h1>
          <p className="text-[13px] font-bold text-muted">Read aloud with Ms. Humphrey</p>
        </div>
        <span className="ml-auto h-11 rounded-2xl border-2 border-line bg-card px-4 shadow-tile flex items-center gap-2 font-display text-[16px] font-semibold text-teal">
          <span className="h-2.5 w-2.5 rounded-full bg-teal" />{counter}
        </span>
      </header>

      <main className="flex-1 min-h-0 flex flex-col gap-3">
        {/* Top: the story page + Ms. Humphrey */}
        <div className="flex-1 min-h-0 flex gap-3">
          <section className="flex-1 min-w-0 rounded-[24px] border-2 border-line px-7 py-5 shadow-card overflow-hidden"
            style={{ background: 'radial-gradient(circle at 18% 22%, rgba(230,220,203,.30), transparent 45%), radial-gradient(circle at 82% 78%, rgba(230,220,203,.22), transparent 45%), #FFFCF3' }}>
            {S.phase === 'loading' ? <Loading />
              : S.phase === 'end' ? <EndTop score={S.firstTry} of={S.passage?.questions.length ?? 0} />
              : <Story title={S.passage!.title} words={S.words} readIdx={S.readIdx} reading={S.phase === 'reading'} />}
          </section>
          <aside className="w-[236px] shrink-0 rounded-[24px] border-2 border-line bg-card p-4 shadow-card flex flex-col items-center justify-center gap-3">
            <HumphreyPortrait state={humphrey} className="w-[104px] h-[104px] rounded-2xl ring-4 ring-tutor/20" />
            <div className="text-center leading-tight">
              <div className="font-display text-[17px] font-semibold">Ms. Humphrey</div>
              <span className={clsx('mt-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-white',
                S.phase === 'loading' ? 'bg-tutor' : speaking ? 'bg-tutor' : S.phase === 'end' ? 'bg-grass' : 'bg-teal')}>
                <span className={clsx('h-1.5 w-1.5 rounded-full bg-white/90', (speaking || S.phase === 'loading') && 'animate-pulse')} />
                {S.phase === 'loading' ? 'writing' : speaking ? 'speaking' : S.phase === 'end' ? 'proud' : 'listening'}
              </span>
            </div>
            {S.phase === 'ready' && <Tip icon="🔊">{LINES.hint}</Tip>}
            {S.phase === 'reading' && <Tip icon="🌟" glow>Follow the glowing word.</Tip>}
            {S.phase === 'question' && (
              <button onClick={S.hearAgain} className={clsx('tap h-16 w-full rounded-2xl border-2 border-teal/30 bg-teal/10 font-display text-[16px] font-semibold text-teal shadow-tile flex items-center justify-center gap-2', press)}>
                <span className="text-[18px]">🔊</span> Hear it again
              </button>
            )}
          </aside>
        </div>

        {/* Bottom: Listen along, the question tiles, or the end buttons */}
        <section className="shrink-0 basis-[42%] min-h-[264px] max-h-[330px] rounded-[24px] border-2 border-line bg-card px-5 py-4 shadow-card flex flex-col">
          <AnimatePresence mode="wait">
            {(S.phase === 'loading') && (
              <motion.p key="wait" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="m-auto font-display text-[17px] font-medium text-muted">Your story will appear here soon…</motion.p>
            )}
            {(S.phase === 'ready' || S.phase === 'reading') && (
              <motion.div key="listen" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="m-auto flex items-center gap-6">
                <RalphiePortrait state="reading" className="w-[132px] h-[132px] rounded-[22px] ring-4 ring-paper shadow-tile" />
                <motion.button onClick={S.listen} disabled={S.phase === 'reading'} whileTap={{ scale: 0.97 }}
                  animate={S.phase === 'ready' ? { scale: [1, 1.03, 1] } : { scale: 1 }} transition={S.phase === 'ready' ? { repeat: Infinity, duration: 2.2 } : undefined}
                  className={clsx('tap h-[76px] rounded-[22px] bg-sun px-10 font-display text-[26px] font-semibold text-ink shadow-[0_4px_0_0_rgb(220,160,30)] flex items-center gap-3 disabled:opacity-60', press)}>
                  <span className="text-[28px]">{S.phase === 'reading' ? '🌟' : '🔊'}</span>{S.phase === 'reading' ? 'Reading…' : 'Listen along'}
                </motion.button>
              </motion.div>
            )}
            {S.phase === 'question' && q && (
              <motion.div key={`q${S.qIdx}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex-1 min-h-0 flex flex-col gap-3">
                <div className="leading-snug">
                  <span className="mr-3 font-display text-[19px] font-semibold text-teal">Let’s check what you remember!</span>
                  <span className="font-display text-[22px] font-semibold">{q.q}</span>
                </div>
                <div className={clsx('flex-1 min-h-[96px] grid gap-3', q.options.length === 4 ? 'grid-cols-4' : q.options.length === 2 ? 'grid-cols-2' : 'grid-cols-3')}>
                  {q.options.map((o, i) => (
                    <Tile key={i} letter={String.fromCharCode(65 + i)} text={o} pick={S.picks[i]} locked={S.feedback.kind === 'correct' || S.feedback.kind === 'reveal'} onPick={() => S.answer(i)} />
                  ))}
                </div>
                <FeedbackLine kind={S.feedback.kind} text={S.feedback.text} />
              </motion.div>
            )}
            {S.phase === 'end' && (
              <motion.div key="end" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="m-auto flex items-center gap-4">
                <button onClick={S.readAnother} className={clsx('tap h-[72px] rounded-[22px] bg-sun px-9 font-display text-[22px] font-semibold text-ink shadow-[0_4px_0_0_rgb(220,160,30)]', press)}>📖 Read another</button>
                <Link to="/" className={clsx('tap h-[72px] rounded-[22px] border-2 border-line bg-card px-8 font-display text-[20px] font-semibold text-teal shadow-tile flex items-center gap-2', press)}>← Back to Hero Academy</Link>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </main>
    </div>
  );
}

function Loading() {
  return (
    <div className="h-full flex items-center justify-center gap-5 text-center">
      <motion.span className="text-[52px]" animate={{ rotate: [-4, 4, -4] }} transition={{ repeat: Infinity, duration: 2.4 }}>✏️</motion.span>
      <div>
        <div className="font-display text-[26px] font-semibold">{LINES.loading}</div>
        <div className="mt-3 flex justify-center gap-2">
          {[0, 1, 2].map((i) => (
            <motion.span key={i} className="h-3 w-3 rounded-full bg-tutor" animate={{ scale: [0.55, 1, 0.55], opacity: [0.35, 1, 0.35] }} transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.15 }} />
          ))}
        </div>
      </div>
    </div>
  );
}

// The passage: every word its own span so the one being said can light up.
// The font steps down only when a long passage would overflow the page.
function Story({ title, words, readIdx, reading }: { title: string; words: Word[]; readIdx: number; reading: boolean }) {
  const box = useRef<HTMLDivElement>(null); const txt = useRef<HTMLParagraphElement>(null);
  const [step, setStep] = useState(0);
  useLayoutEffect(() => { setStep(0); }, [words]);
  useLayoutEffect(() => {
    const b = box.current, t = txt.current; if (!b || !t) return;
    if (t.offsetTop + t.scrollHeight > b.clientHeight + 1 && step < FONT_STEPS.length - 1) setStep(step + 1);
  });
  useEffect(() => {
    const b = box.current; if (!b) return;
    const ro = new ResizeObserver(() => setStep(0)); ro.observe(b); return () => ro.disconnect();
  }, []);
  return (
    <div ref={box} className="relative h-full flex flex-col">
      <h2 className="flex items-center gap-2.5 font-display text-[28px] font-semibold leading-none">
        <span className="h-8 w-2 rounded-full bg-sun" />{title}
      </h2>
      <p ref={txt} className="mt-4 font-display font-medium" style={{ fontSize: FONT_STEPS[step], lineHeight: 1.38 }} aria-live="off">
        {words.map((w, i) => {
          const now = reading && i === readIdx; const before = reading && i < readIdx;
          return (
            <span key={i}>
              <span className={clsx('rounded-[10px] transition-colors duration-150', now ? 'bg-sun px-2 -mx-1 shadow-[0_0_0_4px_rgba(255,197,61,.25)]' : before ? 'text-muted/60' : '')}>{w.text}</span>{' '}
            </span>
          );
        })}
      </p>
    </div>
  );
}

function EndTop({ score, of }: { score: number; of: number }) {
  const confetti = useRef(Array.from({ length: 22 }, (_, i) => ({ left: Math.random() * 100, delay: Math.random(), dur: 1.8 + Math.random() * 1.2, color: ['#FFC53D', '#D6336C', '#2EB872', '#0E8C8C'][i % 4], rot: Math.random() * 360 }))).current;
  return (
    <div className="relative h-full flex items-center justify-center gap-6">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        {confetti.map((c, i) => (
          <motion.span key={i} className="absolute -top-3 h-3 w-2 rounded-sm" style={{ left: `${c.left}%`, background: c.color }}
            initial={{ y: 0, rotate: c.rot, opacity: 1 }} animate={{ y: 360, rotate: c.rot + 480, opacity: 0 }} transition={{ delay: c.delay, duration: c.dur, ease: 'easeIn' }} />
        ))}
      </div>
      <RalphiePortrait state="cheer" className="w-[148px] h-[148px] rounded-[24px] ring-4 ring-white shadow-card" />
      <div className="leading-tight">
        <div className="font-display text-[40px] font-semibold">Great reading!</div>
        <div className="mt-2 font-display text-[22px] font-semibold text-[rgb(25,130,75)]">{LINES.endScore(score, of)}</div>
        <div className="mt-1 text-[17px] font-bold text-muted">Beautiful work, {KID_NAME}.</div>
      </div>
    </div>
  );
}

function Tip({ icon, glow, children }: { icon: string; glow?: boolean; children: ReactNode }) {
  return (
    <div className={clsx('w-full rounded-2xl border-2 bg-paper px-3 py-2.5 flex items-center gap-2 text-[14px] font-bold leading-snug', glow ? 'border-sun' : 'border-line')}>
      <span className="text-[18px]">{icon}</span><span>{children}</span>
    </div>
  );
}

function Tile({ letter, text, pick, locked, onPick }: { letter: string; text: string; pick?: Pick; locked: boolean; onPick: () => void }) {
  const off = locked || !!pick;
  return (
    <motion.button onClick={onPick} disabled={off} whileTap={off ? undefined : { scale: 0.97 }}
      animate={pick === 'wrong' ? { x: [0, -8, 8, -5, 0] } : pick === 'correct' ? { scale: [1, 1.05, 1] } : {}}
      className={clsx('tap h-full min-h-[96px] rounded-[24px] border-2 px-3 font-display flex flex-col items-center justify-center gap-1.5 text-center shadow-tile', press,
        pick === 'correct' ? 'border-grass bg-grass text-white'
        : pick === 'wrong' ? 'border-amber bg-amber/10'
        : pick === 'reveal' ? 'border-grass border-[3px] bg-card'
        : locked ? 'border-line bg-card opacity-60' : 'border-line bg-card')}>
      <span className={clsx('h-10 w-10 rounded-2xl grid place-items-center text-[17px] font-semibold',
        pick === 'correct' ? 'bg-white text-grass' : pick === 'wrong' ? 'bg-amber text-white' : pick === 'reveal' ? 'bg-grass text-white' : 'bg-paper text-teal')}>
        {pick === 'correct' || pick === 'reveal' ? '✓' : pick === 'wrong' ? '✕' : letter}
      </span>
      <span className="text-[24px] font-semibold leading-tight">{text}</span>
    </motion.button>
  );
}

function FeedbackLine({ kind, text }: { kind: string; text: string }) {
  return (
    <div className="min-h-[26px]">
      <AnimatePresence mode="wait">
        {kind !== 'none' && (
          <motion.p key={text} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className={clsx('text-[16px] font-extrabold leading-snug', kind === 'hint' ? 'text-[rgb(180,105,5)]' : 'text-[rgb(25,130,75)]')}>
            {text}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
