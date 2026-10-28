import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';
import Manipulative from './manipulatives/Manipulative';
import { parseEquation } from './manipulatives/parseEquation';
import { COURSES_PER_DAY, SUBJECT_EMOJI, SUBJECT_LABEL, courseForIdx, useClassTime } from './useClassTime';
import type { BoardState, TileState } from './useClassTime';
import type { Probe } from './probes';
import { ClassTimeVisuals } from './visuals';
import { onSpeaking } from '@/lib/tts';
import HumphreyPortrait from '@/components/HumphreyPortrait';
import RalphiePortrait from '@/components/RalphiePortrait';
import type { HumphreyState } from '@/components/HumphreyPortrait';
import { KID_NAME } from '@/lib/child';
import type { DayPlan } from '@/lib/api';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

export default function ClassTimePage() {
  const { state: s, answer, answerProbe, useHint, readAgain, gotIt, resumeFromBreak, toggleMute, exit } = useClassTime();
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => onSpeaking(setSpeaking), []);

  const q = s.questions[s.qIdx];
  const humphreyState: HumphreyState =
    s.phase === 'done' ? 'goodbye'
    : s.phase === 'remediation' ? 'board'
    : s.tiles.includes('correct') ? 'delighted'
    : s.probe ? 'encouraging'
    : s.phase === 'course-intro' && s.courseIdx > 0 ? 'cheering'
    : s.phase === 'question' && s.board ? 'thinking'
    : speaking ? 'speaking' : 'idle';
  const subjectLabel = SUBJECT_LABEL[s.subject] || s.subject;
  const doneSet = new Set(s.progress.filter((p) => p.completed_at).map((p) => p.course_order));

  if (s.phase === 'boot' || s.phase === 'error') {
    return (
      <Boot label={s.phase === 'error' ? 'Could not load class.' : s.bootLabel}
        sub={s.phase === 'error' ? s.error || 'Please refresh and try again.' : 'Ms. Humphrey is getting ready'}
        doneSet={doneSet} plan={s.dayPlan} />
    );
  }
  if (s.phase === 'done') return <Completion doneSet={doneSet} plan={s.dayPlan} />;

  return (
    <div className="h-full flex flex-col px-4 py-3 lg:px-7 lg:py-4 max-w-[1320px] mx-auto w-full">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <div className="leading-tight">
            <div className="font-display font-semibold text-[17px]">Class Time</div>
            <div className="text-[12px] font-bold text-muted">Course {s.courseIdx + 1} of {COURSES_PER_DAY} · {subjectLabel}</div>
          </div>
          <Trail plan={s.dayPlan} currentIdx={s.courseIdx} doneSet={doneSet} />
        </div>
        <div className="flex items-center gap-2">
          <IconButton label={s.muted ? 'Unmute' : 'Mute'} onClick={toggleMute}>{s.muted ? '🔇' : '🔊'}</IconButton>
          <IconButton label="Leave class" onClick={exit} danger>✕</IconButton>
        </div>
      </header>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4 mt-3 min-h-0">
        <section className="bg-card rounded-xl3 shadow-card p-5 lg:p-7 flex flex-col min-h-0 overflow-y-auto">
          <div className="flex items-center justify-between mb-3">
            <span className="inline-flex items-center gap-2 bg-teal/10 text-teal text-[12px] font-extrabold px-3 py-1.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-teal" /> {q?.topic}
            </span>
            <span className="text-[12px] font-bold text-muted">{SUBJECT_EMOJI[s.subject] || '📚'} {subjectLabel}</span>
          </div>

          <div className={clsx('grid gap-5 flex-1 min-h-0', s.imageUrl ? 'grid-cols-1 md:grid-cols-[220px_1fr]' : 'grid-cols-1')}>
            {s.imageUrl && (
              <figure className="rounded-xl2 overflow-hidden bg-paper border border-line h-44 md:h-auto min-h-[180px] relative">
                <img src={s.imageUrl} alt={s.imageCaption} className="w-full h-full object-cover" />
                {s.imageCaption && <figcaption className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-ink/60 to-transparent px-3 py-2 text-white text-[12px] font-bold">{s.imageCaption}</figcaption>}
              </figure>
            )}
            <div className="flex flex-col min-h-0">
              {q?.description && <p className="text-[17px] text-muted leading-snug mb-2">{q.description}</p>}
              <AnimatePresence mode="wait" initial={false}>
                <motion.h2 key={s.qIdx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}
                  className="font-display font-medium text-[26px] md:text-[30px] leading-[1.15] break-words">{q?.question}</motion.h2>
              </AnimatePresence>
              <div className="mt-3 text-[13px] font-bold text-muted flex items-center gap-2 min-h-[20px]">
                {s.locked ? <><span className={clsx('w-2 h-2 rounded-full', speaking ? 'bg-tutor animate-pulse' : 'bg-line')} /> Ms. Humphrey is reading…</> : 'Pick the answer you think is right.'}
              </div>
              <div className={clsx('grid gap-3 mt-3', (q?.options.length || 0) > 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1')}>
                {q?.options.map((opt, i) => (
                  <Tile key={`${s.qIdx}-${i}`} letter={LETTERS[i]} text={opt} state={s.tiles[i] || 'idle'} disabled={s.locked} onClick={() => answer(i)} />
                ))}
              </div>
            </div>
          </div>

          {s.phase === 'remediation' && s.board && (
            <Board board={s.board} interactive={false} />
          )}
          {s.phase === 'remediation' && s.remediationDone && (
            <button onClick={gotIt} className="tap mt-4 w-full rounded-xl2 bg-sun text-ink font-display font-semibold text-[20px] shadow-tile active:translate-y-[2px] active:shadow-none">I get it! Next question</button>
          )}
        </section>

        <TutorPanel bubble={s.bubble} speaking={speaking} portrait={humphreyState} hintRung={s.hintRung} board={s.phase === 'question' ? s.board : null}
          canInteract={s.phase === 'question' && !s.probe} probe={s.probe} probeAnswered={s.probeAnswered} onProbe={answerProbe} onReadAgain={readAgain} onHint={useHint} />
      </main>

      <footer className="mt-3 flex items-center gap-4">
        <span className="text-[12px] font-extrabold text-muted whitespace-nowrap">Question {Math.min(s.qIdx + 1, s.questions.length)} of {s.questions.length}</span>
        <div className="flex-1 h-2 bg-line/60 rounded-full overflow-hidden">
          <div className="h-full bg-teal rounded-full transition-[width] duration-500" style={{ width: `${(s.qIdx / Math.max(1, s.questions.length)) * 100}%` }} />
        </div>
      </footer>

      {s.phase === 'break' && <BreakScreen nextLabel={SUBJECT_LABEL[courseForIdx(s.dayPlan, s.nextCourseIdx)?.subject || ''] || 'next class'} onResume={resumeFromBreak} />}
    </div>
  );
}

/* ---------------- pieces ---------------- */

function IconButton({ children, label, onClick, danger }: { children: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} aria-label={label} title={label}
      className={clsx('w-16 h-16 rounded-2xl border-2 text-[24px] flex items-center justify-center bg-card', danger ? 'border-amber/40 text-amber' : 'border-line')}>{children}</button>
  );
}

function Trail({ plan, currentIdx, doneSet }: { plan: DayPlan | null; currentIdx: number; doneSet: Set<number> }) {
  return (
    <ol className="flex items-center gap-1 pl-4 border-l border-line" aria-label="Today’s classes">
      {Array.from({ length: COURSES_PER_DAY }).map((_, i) => {
        const c = courseForIdx(plan, i);
        const subj = (c?.subject || ['math', 'reading', 'spelling', 'science'][i]).toLowerCase();
        const done = doneSet.has(i + 1);
        const current = i === currentIdx;
        return (
          <li key={i} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <motion.div animate={current && !done ? { y: [0, -4, 0] } : { y: 0 }} transition={current && !done ? { repeat: Infinity, duration: 2.2, ease: 'easeInOut' } : undefined}
                className={clsx('w-11 h-11 rounded-full flex items-center justify-center text-[19px] relative',
                done && 'bg-grass text-white', current && !done && 'bg-teal text-white ring-[6px] ring-teal/15', !done && !current && 'bg-line/50 text-muted')}
                aria-current={current ? 'step' : undefined}>
                {SUBJECT_EMOJI[subj] || '📚'}
                {done && <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-grass text-white text-[11px] font-extrabold flex items-center justify-center border-2 border-paper -rotate-12">✓</span>}
              </motion.div>
              <span className={clsx('text-[10px] font-bold', current ? 'text-teal' : 'text-muted')}>{SUBJECT_LABEL[subj] || subj}</span>
            </div>
            {i < COURSES_PER_DAY - 1 && <div className={clsx('w-6 h-[3px] -mt-4 mx-0.5 rounded', doneSet.has(i + 1) ? 'bg-grass' : 'bg-line')} />}
          </li>
        );
      })}
    </ol>
  );
}

function Tile({ letter, text, state, disabled, onClick }: { letter: string; text: string; state: TileState; disabled: boolean; onClick: () => void }) {
  const locked = disabled || state === 'dim' || state === 'correct';
  const anim = state === 'wrong' ? { x: [0, -6, 6, -4, 4, 0] } : state === 'correct' ? { scale: [1, 1.06, 1] } : { x: 0, scale: 1 };
  return (
    <motion.button onClick={onClick} disabled={locked} data-state={state === 'idle' ? undefined : state}
      animate={anim} transition={{ duration: 0.4 }} whileTap={locked ? undefined : { scale: 0.97 }}
      className={clsx('tile tap rounded-xl2 px-4 py-3 flex items-center gap-3 text-left border-[3px] border-line bg-card',
        disabled && state === 'idle' && 'opacity-60')}>
      <span className={clsx('w-10 h-10 shrink-0 rounded-xl flex items-center justify-center font-display font-semibold text-[20px]',
        state === 'correct' ? 'bg-white/25 text-white' : state === 'wrong' ? 'bg-amber text-white' : 'bg-paper text-muted')}>{state === 'correct' ? '✓' : letter}</span>
      <span className="font-display font-medium text-[22px] leading-tight break-words">{text}</span>
    </motion.button>
  );
}

function TutorPanel({ bubble, speaking, portrait, hintRung, board, canInteract, probe, probeAnswered, onProbe, onReadAgain, onHint }: {
  bubble: string; speaking: boolean; portrait: HumphreyState; probe: Probe | null; probeAnswered: 0 | 1 | null; onProbe: (c: 0 | 1) => void; hintRung: number; board: BoardState | null; canInteract: boolean;
  onReadAgain: () => void; onHint: (r: 1 | 2 | 3) => void;
}) {
  const rungs: Array<{ n: 1 | 2 | 3; label: string }> = [
    { n: 1, label: 'Give me a hint' }, { n: 2, label: 'Show me a step' }, { n: 3, label: 'Show me the whole thing' },
  ];
  return (
    <aside className="bg-card rounded-xl3 shadow-card p-5 flex flex-col min-h-0 overflow-y-auto">
      <div className="flex items-center gap-3">
        <HumphreyPortrait state={portrait} className={clsx('w-24 h-24 rounded-2xl ring-2 ring-tutor/20 shrink-0', speaking && 'speaking')} />
        <div className="leading-tight">
          <div className="font-display font-semibold text-[17px]">Ms. Humphrey</div>
          <div className="text-[11px] font-bold text-muted">{speaking ? 'speaking' : 'listening'}</div>
        </div>
      </div>
      <div className="relative mt-4 bg-tutor/10 rounded-2xl px-4 py-3 text-[15px] font-semibold leading-snug min-h-[64px]" aria-live="polite">
        {bubble || `Hi ${KID_NAME}!`}
        <span className="absolute left-6 -bottom-2 w-4 h-4 bg-tutor/10 rotate-45 rounded-[3px]" />
      </div>
      <AnimatePresence>
        {probe && (
          <motion.div key="probe" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4">
            <div className="text-[12px] font-extrabold text-tutor mb-2">Quick check</div>
            <div className="grid grid-cols-1 gap-2">
              {probe.options.map((opt, i) => {
                const picked = probeAnswered === i;
                const settled = probeAnswered !== null;
                const isRight = i === probe.correct_index;
                return (
                  <motion.button key={i} onClick={() => onProbe(i as 0 | 1)} disabled={settled} whileTap={settled ? undefined : { scale: 0.97 }}
                    className={clsx('tap rounded-2xl border-[3px] px-4 text-left font-display font-medium text-[19px] leading-tight',
                      !settled && 'border-tutor/40 bg-tutor/5',
                      settled && picked && isRight && 'border-grass bg-grass text-white',
                      settled && picked && !isRight && 'border-amber bg-amber/15',
                      settled && !picked && 'border-line opacity-50')}>
                    {opt}
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <button onClick={onReadAgain} disabled={!canInteract} className="mt-4 min-h-[64px] w-full rounded-xl border-2 border-line bg-card font-bold text-[14px] text-muted disabled:opacity-50 flex items-center justify-center gap-2">🔊 Read again</button>

      <div className="mt-4">
        <div className="text-[12px] font-extrabold text-muted mb-2">Need a hand?</div>
        <div className="space-y-2">
          {rungs.map((r) => (
            <button key={r.n} onClick={() => onHint(r.n)} disabled={!canInteract}
              className={clsx('w-full min-h-[64px] flex items-center gap-3 rounded-2xl border-2 px-3 text-left text-[14px] font-bold disabled:opacity-50',
                hintRung >= r.n ? 'border-teal bg-teal/10' : 'border-line bg-card')}>
              <span className={clsx('w-7 h-7 rounded-full flex items-center justify-center text-[13px] font-extrabold shrink-0', hintRung >= r.n ? 'bg-teal text-white' : 'bg-paper text-muted')}>{r.n}</span>
              {r.label}
            </button>
          ))}
        </div>
      </div>
      {board && <Board board={board} compact interactive />}
    </aside>
  );
}

function Board({ board, compact, interactive }: { board: BoardState; compact?: boolean; interactive: boolean }) {
  const lastEq = [...board.actions].reverse().find((a) => a.tool === 'drawEquation');
  const parsed = parseEquation(lastEq?.args.equation);
  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className={clsx('rounded-xl2 border border-line bg-paper', compact ? 'mt-4 p-3' : 'mt-5 p-5')} aria-label={board.label}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[12px] font-extrabold text-teal">{board.label}</span>
        <span className="text-[12px] font-bold text-muted">Step {board.stepIdx + 1} of {board.stepsTotal}</span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <AnimatePresence initial={false}>
          {board.actions.map((a, i) => (
            <motion.div key={`${i}-${a.tool}`} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
              <BoardItem tool={a.tool} args={a.args} compact={compact} />
            </motion.div>
          ))}
        </AnimatePresence>
        {board.actions.length === 0 && <span className="text-muted text-[13px] font-semibold">Listen…</span>}
      </div>
      {parsed && (
        <div className="mt-3 pt-3 border-t border-line/70">
          <Manipulative key={`${parsed.raw}-${board.stepIdx}`} eq={parsed} show={!interactive} compact={compact} />
        </div>
      )}
    </motion.div>
  );
}

function BoardItem({ tool, args, compact }: { tool: string; args: Record<string, string>; compact?: boolean }) {
  const big = compact ? 'text-[28px]' : 'text-[44px]';
  if (tool === 'writeWord') return <span className={clsx('font-display font-semibold text-ink', big)}>{args.word}</span>;
  if (tool === 'writeLetter') return <span className={clsx('font-display font-semibold text-tutor', big)}>{args.letter}</span>;
  if (tool === 'drawEquation') return <span className={clsx('font-display font-semibold text-teal tabular-nums', big)}>{args.equation}</span>;
  if (tool === 'showVisual') {
    const svg = ClassTimeVisuals.get(args.topic);
    if (!svg) return <span className="font-display text-[18px] text-muted">{args.topic}</span>;
    return <span className={clsx('inline-block', compact ? 'w-28 h-28' : 'w-44 h-44')} dangerouslySetInnerHTML={{ __html: svg }} />;
  }
  return null;
}

function Boot({ label, sub, doneSet, plan }: { label: string; sub: string; doneSet: Set<number>; plan: DayPlan | null }) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-4 p-6 text-center">
      <img src="/assets/ralphie/ralphie_waving.webp" alt="Ralphie" className="w-28 h-28 object-contain" />
      <h1 className="font-display font-semibold text-[26px]">{label}</h1>
      <p className="text-muted font-semibold">{sub}</p>
      {doneSet.size > 0 && <ProgressCard doneSet={doneSet} plan={plan} />}
    </div>
  );
}

function ProgressCard({ doneSet, plan }: { doneSet: Set<number>; plan: DayPlan | null }) {
  return (
    <div className="bg-card rounded-xl2 shadow-card p-4 mt-2 w-full max-w-md">
      <div className="font-bold text-[13px] text-muted mb-2">Today’s classes</div>
      <div className="grid grid-cols-4 gap-2">
        {Array.from({ length: COURSES_PER_DAY }).map((_, i) => {
          const subj = (courseForIdx(plan, i)?.subject || '').toLowerCase();
          const done = doneSet.has(i + 1);
          return (
            <div key={i} className={clsx('rounded-xl p-2 text-center border-2', done ? 'border-grass bg-grass/10' : 'border-line')}>
              <div className="text-[20px]">{SUBJECT_EMOJI[subj] || '📚'}</div>
              <div className="text-[11px] font-bold">{SUBJECT_LABEL[subj] || `Course ${i + 1}`}</div>
              <div className={clsx('text-[11px] font-extrabold', done ? 'text-grass' : 'text-muted')}>{done ? 'Done' : 'Soon'}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Completion({ doneSet, plan }: { doneSet: Set<number>; plan: DayPlan | null }) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="flex items-end gap-4">
        <HumphreyPortrait state="goodbye" className="w-40 h-40 rounded-3xl ring-4 ring-tutor/20" />
        <RalphiePortrait state="trophy" className="w-28 h-28 rounded-3xl ring-4 ring-sun/30" />
      </div>
      <h1 className="font-display font-semibold text-[32px]">🎉 Great class, {KID_NAME}!</h1>
      <p className="text-muted font-semibold text-[18px]">Ms. Humphrey will see you tomorrow.</p>
      <ProgressCard doneSet={new Set([1, 2, 3, 4, ...doneSet])} plan={plan} />
      <a href="/" className="tap mt-2 inline-flex items-center justify-center rounded-xl2 bg-sun px-8 font-display font-semibold text-[20px] shadow-tile">Back to Hero Hall</a>
    </div>
  );
}

function BreakScreen({ nextLabel, onResume }: { nextLabel: string; onResume: () => void }) {
  const [minutes, setMinutes] = useState<number | null>(null);
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (minutes == null) return;
    // Count against the clock, not ticks: the iPad pauses timers while it
    // sleeps, and a break taken with the screen off should still end on time.
    const endAt = Date.now() + minutes * 60_000;
    const tick = () => setLeft(Math.max(0, Math.ceil((endAt - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, [minutes]);
  const finished = minutes != null && left === 0;
  const mm = String(Math.floor(left / 60)).padStart(2, '0'), ss = String(left % 60).padStart(2, '0');
  return (
    <div className="fixed inset-0 z-50 bg-ink/45 backdrop-blur-sm flex items-center justify-center p-6" role="dialog" aria-modal="true" aria-labelledby="break-title">
      <div className="bg-card rounded-[32px] shadow-2xl max-w-md w-full p-8 text-center">
        <RalphiePortrait state="sleepy" className="w-32 h-32 mx-auto rounded-3xl ring-4 ring-teal/10" />
        <h2 id="break-title" className="font-display font-semibold text-[26px] mt-4">Break time</h2>
        <p className="text-muted font-semibold mt-1">Stretch, grab a snack, go outside. Next up: {nextLabel}.</p>
        {minutes == null ? (
          <div className="grid grid-cols-3 gap-3 mt-6">
            {[5, 10, 15].map((m) => (
              <button key={m} onClick={() => setMinutes(m)} className={clsx('tap rounded-2xl py-4 flex flex-col items-center gap-1 border-2 border-transparent', m === 10 ? 'bg-amber/15 text-amber' : 'bg-teal/10 text-teal')}>
                <span className="font-display font-semibold text-[28px]">{m}</span><span className="text-[11px] font-extrabold">min</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-5 bg-paper rounded-2xl py-4">
            <div className="font-display font-semibold text-[44px] tabular-nums">{finished ? 'Welcome back!' : `${mm}:${ss}`}</div>
            <div className="text-[13px] font-bold text-muted">Rest your eyes. Wiggle. Get some water.</div>
          </div>
        )}
        <div className="flex items-center gap-3 mt-6">
          <button onClick={onResume} disabled={minutes != null && !finished} className="tap flex-1 rounded-xl2 bg-teal text-white font-extrabold text-[15px] disabled:opacity-40">{minutes == null ? 'Skip break' : 'Back to class'}</button>
        </div>
      </div>
    </div>
  );
}
